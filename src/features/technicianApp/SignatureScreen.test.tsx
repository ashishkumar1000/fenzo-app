/**
 * SignatureScreen tests (Story 3.5 Task 6/9): the pad's Save orchestration —
 * Save disabled until a stroke, export→upload→advance→pop, the failure
 * branches (upload failure keeps the drawing and shows the error line; a 422
 * on the advance reconciles silently and still pops; a hard advance failure
 * after a successful upload retries ONLY the advance — confirmedThisSession).
 *
 * The pad library and navigation are mocked; the advance's 422 semantics run
 * through the real `workflowCurrentStep` helper.
 */
jest.mock('react-native-signature-canvas', () => {
  const React = require('react');
  return {
    __esModule: true,
    // Fake pad: exposes its props (onBegin/onOK/onClear/onEmpty) and
    // imperative ref methods; readSignature replays the canned export
    // through onOK. clear routes to onClear — the real library never fires
    // onEmpty on clear (verified against the installed 5.1.1 source).
    default: React.forwardRef((props: any, ref: any) => {
      mockPadProps = props;
      React.useImperativeHandle(ref, () => ({
        readSignature: () => props.onOK('data:image/png;base64,AAAA'),
        clearSignature: () => props.onClear?.(),
      }));
      return null;
    }),
  };
});
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => {
    // Ensure stepKey actually exists in steps array to validate template consistency
    const steps = [
      { key: 'step1', label: 'Step 1', requiresPhoto: false, requiresSignature: false, advancesOn: null },
      { key: 'signature_captured', label: 'Signature', requiresPhoto: false, requiresSignature: true, advancesOn: null },
      { key: 'completed', label: 'Completed', requiresPhoto: false, requiresSignature: false, advancesOn: null },
    ];
    const stepKey = 'signature_captured';
    // Validate: stepKey must exist in steps array
    if (!steps.some(s => s.key === stepKey)) throw new Error(`Mock error: stepKey '${stepKey}' not found in steps array`);
    return {
      params: {
        jobId: mockRouteJobId,
        stepKey,
        steps,
      },
    };
  },
}));
jest.mock('./useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({ uploadOne: mockUploadOne }),
}));
jest.mock('../../services', () => ({
  jobService: { advanceWorkflow: jest.fn() },
}));
jest.mock('../../utils/idempotency', () => ({
  generateIdempotencyKey: jest.fn(),
}));

import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { jobService } from '../../services';
import { generateIdempotencyKey } from '../../utils/idempotency';
import SignatureScreen from './SignatureScreen';

const advanceMock = jobService.advanceWorkflow as jest.Mock;
const keyMock = generateIdempotencyKey as jest.Mock;
const mockUploadOne = jest.fn();

// Hoisted-mock seams (assigned by the factories above).
let mockPadProps: any = null;
const mockNav = { goBack: jest.fn() };
let mockRouteJobId = 'job-1';

beforeEach(() => {
  jest.resetAllMocks();
  mockRouteJobId = 'job-1';
  keyMock.mockReturnValue('key-1');
});

function renderScreen() {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<SignatureScreen />);
  });
  return renderer.root;
}

/** The Pressable owning the Save button (Button sets disabled on Pressable). */
function savePressable(root: ReactTestInstance) {
  let node: ReactTestInstance | null =
    root.findAllByProps({ children: 'Save signature' })[0] ?? null;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error('Save button not found');
  return node;
}

describe('SignatureScreen', () => {
  it('Save is disabled until the pad reports a stroke', () => {
    const root = renderScreen();
    expect(savePressable(root).props.disabled).toBe(true);
    act(() => {
      mockPadProps.onBegin();
    });
    expect(savePressable(root).props.disabled).toBe(false);
  });

  it('Save exports, uploads as a signature, advances, and pops back', async () => {
    mockUploadOne.mockResolvedValue({ id: 'att-1' });
    advanceMock.mockResolvedValue({ currentStep: 'completed' });
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(mockUploadOne).toHaveBeenCalledWith({
      fileUri: 'data:image/png;base64,AAAA',
      filename: 'signature-job-1.png',
      mimeType: 'image/png',
    });
    expect(advanceMock).toHaveBeenCalledWith('job-1', 'signature_captured', 'key-1');
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
  });

  it('a network-class failure keeps the pad open with the offline copy, never advances', async () => {
    mockUploadOne.mockRejectedValue({ status: 0, code: 'NETWORK', message: 'offline' });
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(
      root.findAllByProps({ children: 'Signature upload needs internet.' }).length,
    ).toBeGreaterThan(0);
    // The raw transport message must NOT surface for a network failure.
    expect(root.findAllByProps({ children: 'offline' }).length).toBe(0);
    expect(advanceMock).not.toHaveBeenCalled();
    expect(mockNav.goBack).not.toHaveBeenCalled();
  });

  it('a server failure keeps the pad open and shows the raw message, never advances', async () => {
    mockUploadOne.mockRejectedValue({ status: 500, message: 'presign exploded' });
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(
      root.findAllByProps({ children: 'presign exploded' }).length,
    ).toBeGreaterThan(0);
    expect(advanceMock).not.toHaveBeenCalled();
    expect(mockNav.goBack).not.toHaveBeenCalled();
  });

  it('a 422 on the advance (already recorded) reconciles silently and still pops', async () => {
    mockUploadOne.mockResolvedValue({ id: 'att-1' });
    advanceMock.mockRejectedValue({
      status: 422,
      code: 'INVALID_WORKFLOW_STEP',
      message: 'step already recorded',
      details: { currentStep: 'completed' },
    });
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
  });

  it('a 422 whose server currentStep is BEFORE signature_captured is a real rejection, not success', async () => {
    mockUploadOne.mockResolvedValue({ id: 'att-1' });
    advanceMock.mockRejectedValue({
      status: 422,
      code: 'INVALID_WORKFLOW_STEP',
      message: 'photos first',
      details: { currentStep: 'in_progress' },
    });
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(
      root.findAllByProps({ children: 'photos first' }).length,
    ).toBeGreaterThan(0);
    expect(mockNav.goBack).not.toHaveBeenCalled();
  });

  it('a hard advance failure after upload shows the error and a retry advances ONLY (no re-upload)', async () => {
    mockUploadOne.mockResolvedValue({ id: 'att-1' });
    advanceMock.mockRejectedValueOnce({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'no connection',
    });
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(mockNav.goBack).not.toHaveBeenCalled();
    // A network-class failure surfaces the offline copy, not the raw
    // transport message — even when the upload had already confirmed.
    expect(
      root.findAllByProps({ children: 'Signature upload needs internet.' })
        .length,
    ).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: 'no connection' }).length).toBe(0);

    // Retry: the upload is already confirmed — only the advance re-runs.
    advanceMock.mockResolvedValueOnce({ currentStep: 'completed' });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(mockUploadOne).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledTimes(2);
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
  });

  it('Clear resets the stroke state so Save disables again', () => {
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    expect(savePressable(root).props.disabled).toBe(false);
    const clearText = root.findAllByProps({ children: 'Clear' })[0];
    let node: ReactTestInstance | null = clearText ?? null;
    while (node && typeof node.props.onPress !== 'function') node = node.parent;
    act(() => {
      node!.props.onPress();
    });
    expect(savePressable(root).props.disabled).toBe(true);
  });

  it('Clear after a latched upload re-arms the upload — redraw + Save re-uploads', async () => {
    // Save 1: upload confirms, the advance fails hard (network).
    mockUploadOne.mockResolvedValueOnce({ id: 'att-1' });
    advanceMock.mockRejectedValueOnce({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'no connection',
    });
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(mockUploadOne).toHaveBeenCalledTimes(1);

    // The customer redraws: Clear (which resets the latch) + a fresh stroke.
    const clearText = root.findAllByProps({ children: 'Clear' })[0];
    let node: ReactTestInstance | null = clearText ?? null;
    while (node && typeof node.props.onPress !== 'function') node = node.parent;
    act(() => {
      node!.props.onPress();
    });
    act(() => {
      mockPadProps.onBegin();
    });

    // Save 2: the NEW drawing must be uploaded, not skipped by the latch.
    mockUploadOne.mockResolvedValueOnce({ id: 'att-2' });
    advanceMock.mockResolvedValueOnce({ currentStep: 'completed' });
    await act(async () => {
      savePressable(root).props.onPress();
    });
    expect(mockUploadOne).toHaveBeenCalledTimes(2);
    expect(advanceMock).toHaveBeenCalledTimes(2);
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
  });

  it('a broken pad disables Save', () => {
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    expect(savePressable(root).props.disabled).toBe(false);
    act(() => {
      mockPadProps.onError();
    });
    expect(savePressable(root).props.disabled).toBe(true);
    expect(
      root.findAllByProps({
        children: 'Signature pad failed to load — go back and try again.',
      }).length,
    ).toBeGreaterThan(0);
  });

  it('a second Save inside the busy window is ignored (no forked upload)', async () => {
    let releaseUpload!: (value: unknown) => void;
    mockUploadOne.mockReturnValue(
      new Promise(resolve => {
        releaseUpload = resolve;
      }),
    );
    const root = renderScreen();
    act(() => {
      mockPadProps.onBegin();
    });
    // Two onOK callbacks before the first finishes — the busyRef guard must
    // drop the second (Button's loading state can't render this fast).
    await act(async () => {
      void mockPadProps.onOK('data:image/png;base64,AAAA');
      void mockPadProps.onOK('data:image/png;base64,AAAA');
    });
    await act(async () => {
      releaseUpload({ id: 'att-1' });
    });
    expect(mockUploadOne).toHaveBeenCalledTimes(1);
  });

  it('leaving mid-save does not pop the screen underneath', async () => {
    let releaseUpload!: (value: unknown) => void;
    mockUploadOne.mockReturnValue(
      new Promise(resolve => {
        releaseUpload = resolve;
      }),
    );
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<SignatureScreen />);
    });
    act(() => {
      mockPadProps.onBegin();
    });
    await act(async () => {
      void mockPadProps.onOK('data:image/png;base64,AAAA');
    });
    // The user hits back while the upload is in flight; the save chain must
    // not pop the route underneath after it finishes.
    act(() => {
      renderer.unmount();
    });
    await act(async () => {
      releaseUpload({ id: 'att-1' });
    });
    expect(mockNav.goBack).not.toHaveBeenCalled();
  });
});
