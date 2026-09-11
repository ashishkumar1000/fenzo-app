/**
 * Render tests for the Customer-signature card gate (Story 3.5 Task 5 /
 * AC 6): the card exists only on non-terminal jobs that have a step with
 * requiresSignature=true — and a captured signature offers the Re-capture
 * affordance when the screen wires it.
 *
 * Story 5.2: signature gate is template-driven (checks workflowTemplate.steps
 * for requiresSignature, not a job-level flag).
 *
 * The upload hook is mocked (PhotoSection's own tests cover its states);
 * everything else renders through the real components so the gate and the
 * stepper's row count are pinned against the real derivations.
 */
jest.mock('../useAttachmentUpload', () => ({
  useAttachmentUpload: jest.fn(),
  confirmOnly: jest.fn(),
}));

import ReactTestRenderer, { act, create } from 'react-test-renderer';
import { Linking } from 'react-native';
import { TechJobDetailContent } from './TechJobDetailContent';
import type { JobDetail, WorkflowTemplateStep } from '../../../services';

const useHook = require('../useAttachmentUpload').useAttachmentUpload as jest.Mock;

const baseTemplate = {
  version: 1,
  steps: [
    { key: 'on_my_way', label: 'On my way', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
    { key: 'arrived', label: 'Arrived', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
    { key: 'in_progress', label: 'Start work', requiresPhoto: false, requiresSignature: false, setsStatus: 'in_progress', advancesOn: null } as WorkflowTemplateStep,
    { key: 'photos_uploaded', label: 'Upload photos', requiresPhoto: true, requiresSignature: false, setsStatus: null, advancesOn: 'photo_confirm' } as WorkflowTemplateStep,
    { key: 'signature_captured', label: 'Capture signature', requiresPhoto: false, requiresSignature: true, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
    { key: 'completed', label: 'Mark complete', requiresPhoto: false, requiresSignature: false, setsStatus: 'completed', advancesOn: null } as WorkflowTemplateStep,
  ],
};

const noSigTemplate = {
  version: 1,
  steps: [
    { key: 'on_my_way', label: 'On my way', requiresPhoto: false, requiresSignature: false, setsStatus: null, advancesOn: null } as WorkflowTemplateStep,
    { key: 'in_progress', label: 'Start work', requiresPhoto: false, requiresSignature: false, setsStatus: 'in_progress', advancesOn: null } as WorkflowTemplateStep,
    { key: 'completed', label: 'Mark complete', requiresPhoto: false, requiresSignature: false, setsStatus: 'completed', advancesOn: null } as WorkflowTemplateStep,
  ],
};

function detail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'job-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    technicianId: 'tech-1',
    serviceLocation: '12 MG Road, Bengaluru',
    serviceType: 'ac_service',
    skill: { id: 'skill-1', name: 'AC Service' },
    workflowTemplate: baseTemplate,
    currentStepIndex: 2,
    scheduledStart: '2026-09-04T10:00:00.000Z',
    scheduledEnd: null,
    status: 'in_progress',
    currentStep: 'in_progress',
    priority: 'normal',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-01T06:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-09-01T06:00:00.000Z',
    technician: { id: 'tech-1', name: 'Suresh', countryCode: '+91', phoneNumber: '9876543210', skills: [] },
    customer: { id: 'customer-1', name: 'Anita', countryCode: '+91', phoneNumber: '9123456780', address: null, city: null, latitude: null, longitude: null },
    activityLog: [],
    attachments: [],
    ...overrides,
  };
}

function render(props: Parameters<typeof TechJobDetailContent>[0]) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<TechJobDetailContent {...props} />);
  });
  return renderer.root;
}

/** Text nodes matching a caption, found by exact children (RN jest quirk:
 *  duplicates per fiber — callers assert on count ranges, not equality). */
function textCount(root: ReactTestRenderer.ReactTestInstance, label: string): number {
  return root.findAllByProps({ children: label }).length;
}

type RenderArgs = {
  detail: JobDetail;
  onAdvance?: () => void;
  onRecaptureSignature?: () => void;
};

function renderContent(args: RenderArgs) {
  return render({
    detail: args.detail,
    onAdvance: args.onAdvance,
    pendingStep: null,
    onPhotosConfirmed: undefined,
    onRecaptureSignature: args.onRecaptureSignature,
  } as Parameters<typeof TechJobDetailContent>[0]);
}

describe('TechJobDetailContent — signature card gate', () => {
  beforeEach(() => {
    useHook.mockReturnValue({
      entries: [],
      limitReached: false,
      start: jest.fn(),
      retry: jest.fn(),
    });
  });

  it('template with signature step, no attachment → dashed placeholder', () => {
    const root = renderContent({ detail: detail({ workflowTemplate: baseTemplate }) });
    expect(textCount(root, 'Customer signature')).toBeGreaterThan(0);
    expect(textCount(root, 'Captured at the signature step.')).toBeGreaterThan(0);
  });

  it('template with signature step, signature captured → Re-capture affordance when wired', () => {
    const onRecapture = jest.fn();
    const root = renderContent({
      detail: detail({
        workflowTemplate: baseTemplate,
        attachments: [{ id: 'att-1', type: 'signature', url: 'https://r2/read', createdAt: '2026-09-05T01:00:00.000Z' }],
      }),
      onRecaptureSignature: onRecapture,
    });
    // Button exposes no accessibilityRole — find its label Text and climb to
    // the enclosing Pressable that owns the onPress.
    let node: ReactTestRenderer.ReactTestInstance | null =
      root.findAllByProps({ children: 'Re-capture' })[0] ?? null;
    let pressable: ReactTestRenderer.ReactTestInstance | null = null;
    while (node && !pressable) {
      if (typeof node.props.onPress === 'function') pressable = node;
      node = node.parent;
    }
    expect(pressable).toBeDefined();
    act(() => {
      pressable!.props.onPress();
    });
    expect(onRecapture).toHaveBeenCalledTimes(1);
  });

  it('two signatures → the newest one (last in the oldest-first list) is shown', () => {
    const root = renderContent({
      detail: detail({
        workflowTemplate: baseTemplate,
        attachments: [
          { id: 'att-old', type: 'signature', url: 'https://r2/old', createdAt: '2026-09-04T01:00:00.000Z' },
          { id: 'att-new', type: 'signature', url: 'https://r2/new', createdAt: '2026-09-05T01:00:00.000Z' },
        ],
      }),
    });
    // findAllByProps doesn't match object props here — assert on the Image
    // nodes' source URIs with a predicate instead.
    const withUri = (uri: string) =>
      root.findAll(n => n.props?.source?.uri === uri).length;
    expect(withUri('https://r2/new')).toBeGreaterThan(0);
    expect(withUri('https://r2/old')).toBe(0);
  });

  it('template without signature step → no card at all', () => {
    const root = renderContent({ detail: detail({ workflowTemplate: noSigTemplate }) });
    expect(textCount(root, 'Customer signature')).toBe(0);
  });

  it('no-signature template → stepper shows only 3 rows (matched to template)', () => {
    const root = renderContent({ detail: detail({ workflowTemplate: noSigTemplate, currentStepIndex: 1 }) });
    // currentStepIndex: 1 over 3 steps = "2 of 3"
    expect(textCount(root, '2 of 3')).toBeGreaterThan(0);
    expect(textCount(root, '2 of 6')).toBe(0);
  });

  it('terminal job with signature step → no card (AC 6)', () => {
    const root = renderContent({
      detail: detail({
        workflowTemplate: baseTemplate,
        status: 'completed',
        currentStepIndex: 5,
        currentStep: 'completed',
        attachments: [{ id: 'att-1', type: 'signature', url: 'https://r2/read', createdAt: '2026-09-05T01:00:00.000Z' }],
      }),
    });
    expect(textCount(root, 'Customer signature')).toBe(0);
  });
});

describe('TechJobDetailContent — maps row deep link', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    useHook.mockReturnValue({
      entries: [],
      limitReached: false,
      start: jest.fn(),
      retry: jest.fn(),
    });
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(() => {
    openURL.mockRestore();
  });

  function mapsRow(root: ReactTestRenderer.ReactTestInstance): ReactTestRenderer.ReactTestInstance {
    return root.findByProps({ accessibilityLabel: 'Open in maps' });
  }

  const withAddress = (customer: Partial<JobDetail['customer']> = {}) =>
    detail({ customer: { ...detail().customer, address: '12 MG Road', city: 'Bengaluru', ...customer } });

  it('customer with coordinates → the press opens the coordinate deep link', () => {
    const root = renderContent({
      detail: withAddress({ latitude: 12.9716, longitude: 77.5946 }),
    });
    act(() => {
      void mapsRow(root).props.onPress();
    });
    // The jest preset's platform is iOS; the Android form is pinned in
    // linking.test.ts.
    expect(openURL).toHaveBeenCalledWith('maps://?q=12.9716,77.5946');
  });

  it('customer without coordinates → the press opens the exact text query', () => {
    const root = renderContent({ detail: withAddress({ latitude: null, longitude: null }) });
    act(() => {
      void mapsRow(root).props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith('maps:0,0?q=12%20MG%20Road%2C%20Bengaluru');
  });

  it('half-present coordinates → the text query fallback, never a fabricated link', () => {
    const root = renderContent({ detail: withAddress({ latitude: 12.9716, longitude: null }) });
    act(() => {
      void mapsRow(root).props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith('maps:0,0?q=12%20MG%20Road%2C%20Bengaluru');
  });

  it('the row renders identically in both modes — no precision badge anywhere', () => {
    for (const coords of [
      { latitude: 12.9716, longitude: 77.5946 },
      { latitude: null, longitude: null },
    ]) {
      const root = renderContent({ detail: withAddress(coords) });
      expect(mapsRow(root)).toBeDefined();
      expect(textCount(root, 'Precise')).toBe(0);
      expect(textCount(root, 'Approximate')).toBe(0);
    }
  });
});
