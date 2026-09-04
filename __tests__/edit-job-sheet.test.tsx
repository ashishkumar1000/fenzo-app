/**
 * EditJobSheet — component tests for the save flows the model tests can't
 * cover: Save disabled until something changes, the diff actually sent to
 * `jobService.update`, and the 409 / 404 error branches (close-then-refetch
 * and roster refresh) driven through a mocked service.
 *
 * Model-level rules (patch diff, schedule-window pre-check, error
 * classification) are covered in `src/features/jobDetail/editJobModel.test.ts`.
 */
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { EditJobSheet } from '../src/features/jobDetail/components/EditJobSheet';
import { EDIT_STARTED_MESSAGE, TECHNICIAN_GONE_MESSAGE } from '../src/features/jobDetail/editJobModel';
import { jobService } from '../src/services';
import { loadMyProfile } from '../src/features/profile';
import type { ApiError, ApiJob, JobDetail, ProfileTechnician } from '../src/services';

// The sheet reaches the API only through `jobService.update` and refreshes
// the roster through `loadMyProfile` — mock both at the module boundary.
jest.mock('../src/services', () => ({ jobService: { update: jest.fn() } }));
jest.mock('../src/features/profile', () => ({ loadMyProfile: jest.fn() }));

// NOTE: RN's jest preset stubs `Modal` (toJSON renders nothing), but the
// children still exist in the instance tree, so tree-walking helpers below
// work without any Modal workaround.

const updateMock = jobService.update as jest.Mock;

const BASE_JOB: JobDetail = {
  id: 'job-1',
  jobNumber: 'JB-2026-0042',
  tenantId: 'tenant-1',
  customerId: 'customer-1',
  technicianId: 'tech-1',
  serviceLocation: '12 MG Road, Bengaluru',
  serviceType: 'ac_service',
  scheduledStart: '2026-09-04T10:00:00.000Z',
  scheduledEnd: '2026-09-04T12:00:00.000Z',
  status: 'scheduled',
  currentStep: null,
  priority: 'normal',
  requireCompletionPhoto: false,
  description: 'AC not cooling',
  notesForTechnician: 'Gate code 1234',
  createdAt: '2026-09-01T06:00:00.000Z',
  updatedAt: '2026-09-01T06:00:00.000Z',
  technician: {
    id: 'tech-1',
    name: 'Suresh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    skills: ['ac_technician'],
  },
  customer: {
    id: 'customer-1',
    name: 'Anita Rao',
    countryCode: '+91',
    phoneNumber: '9123456780',
    address: null,
    city: null,
  },
  activityLog: [],
  attachments: [],
};

const UPDATED_JOB: JobDetail = { ...BASE_JOB, priority: 'urgent', updatedAt: '2026-09-04T08:00:00.000Z' };

const ROSTER: ProfileTechnician[] = [
  {
    id: 'tech-1',
    name: 'Suresh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    status: 'active',
    skills: ['ac_technician'],
    skillIds: ['skill-1'],
    createdAt: '2026-08-01T06:00:00.000Z',
  },
  {
    id: 'tech-2',
    name: 'Anil Verma',
    countryCode: '+91',
    phoneNumber: '9800000000',
    status: 'active',
    skills: ['fridge_repair'],
    skillIds: ['skill-2'],
    createdAt: '2026-08-02T06:00:00.000Z',
  },
];

function apiError(overrides: Partial<ApiError>): ApiError {
  return { status: 0, code: 'REQUEST_ERROR', message: 'boom', ...overrides };
}

/** All rendered text, concatenated — for asserting messages and chrome. */
function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  // Walk raw string children only — RN wraps text in nested Text hosts, so
  // don't gate on the node's type.
  const walk = (node: ReactTestInstance) => {
    for (const child of node.children) {
      if (typeof child === 'string') parts.push(child);
      else walk(child);
    }
  };
  walk(renderer.root);
  return parts.join(' ');
}

/**
 * The Pressable that wraps the given label text (pill, technician row or the
 * save Button's Pressable), so `onPress` can be fired directly.
 */
function pressableFor(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  // The innermost Text host directly holds the string — walk up from there
  // (component-level Texts wrap their string in a nested instance). The tree
  // instances' `type` doesn't strictly equal the imported Pressable under the
  // RN jest preset, so match the component's display name instead.
  const textNode = renderer.root.find(
    node => node.children.some(c => typeof c === 'string' && c === label),
  );
  let node: ReactTestInstance | null = textNode;
  while (node && !isPressable(node)) node = node.parent;
  if (!node) throw new Error(`No Pressable wrapping "${label}"`);
  return node;
}

function isPressable(node: ReactTestInstance): boolean {
  if (typeof node.type === 'string') return false;
  const component = node.type as { displayName?: string; name?: string };
  return component.displayName === 'Pressable' || component.name === 'Pressable';
}

interface MountProps {
  onClose?: () => void;
  onSaved?: (job: ApiJob) => void;
}

function mountSheet({ onClose = jest.fn(), onSaved = jest.fn() }: MountProps = {}) {
  let renderer!: ReactTestRenderer;
  // The open-sheet effect re-seeds the form on mount — that commit needs act.
  act(() => {
    renderer = create(
      <EditJobSheet
        visible
        job={BASE_JOB}
        technicians={ROSTER}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
  });
  return { renderer, onClose, onSaved };
}

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('EditJobSheet', () => {
  it('renders the prefilled form and keeps Save disabled until something changes', () => {
    const { renderer } = mountSheet();

    const text = allText(renderer);
    expect(text).toContain('Edit job');
    expect(text).toContain('Only scheduled jobs can be edited.');
    expect(text).toContain('Description');
    expect(text).toContain('Notes for technician');
    // Text inputs hold their content in `value`, not as Text children.
    const inputs = renderer.root.findAll(
      node => typeof node.type !== 'string' && node.type === TextInput,
    );
    expect(inputs.map(node => node.props.value)).toContain('Gate code 1234');
    expect(inputs.map(node => node.props.value)).toContain('AC not cooling');
    expect(text).toContain('Normal');
    expect(text).toContain('Urgent');
    // Both roster technicians are listed (rows variant).
    expect(text).toContain('Suresh Kumar');
    expect(text).toContain('Anil Verma');
    // The can't-clear hint is always visible above Save.
    expect(text).toContain('keep their saved value');

    expect(pressableFor(renderer, 'Save changes').props.disabled).toBe(true);
  });

  it('hides invited technicians from the roster (they cannot take work yet)', () => {
    const invitedTech: ProfileTechnician = {
      id: 'tech-3',
      name: 'Priya Nair',
      countryCode: '+91',
      phoneNumber: '9811111111',
      status: 'invited',
      skills: [],
      skillIds: [],
      createdAt: '2026-08-03T06:00:00.000Z',
    };
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <EditJobSheet
          visible
          job={BASE_JOB}
          technicians={[...ROSTER, invitedTech]}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );
    });

    const text = allText(renderer);
    expect(text).toContain('Suresh Kumar');
    expect(text).toContain('Anil Verma');
    expect(text).not.toContain('Priya Nair');
  });

  it('sends only the changed field and reports the saved job on success', async () => {
    updateMock.mockResolvedValueOnce(UPDATED_JOB);
    const { renderer, onClose, onSaved } = mountSheet();

    // Flip priority to urgent — the only change in this flow.
    await act_(renderer, () => pressableFor(renderer, 'Urgent').props.onPress());
    expect(pressableFor(renderer, 'Save changes').props.disabled).toBe(false);

    await act_(renderer, () => pressableFor(renderer, 'Save changes').props.onPress());

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith('job-1', { priority: 'urgent' });
    expect(onSaved).toHaveBeenCalledWith(UPDATED_JOB);
    // Success closes the sheet immediately (no delay timer).
    expect(onClose).toHaveBeenCalled();
  });

  it('on a 409 shows the started-job message, closes the sheet after a delay and lets the parent refetch', async () => {
    jest.useFakeTimers();
    updateMock.mockRejectedValueOnce(apiError({ status: 409, code: 'JOB_NOT_MODIFIABLE' }));
    const { renderer, onClose } = mountSheet();

    await act_(renderer, () => pressableFor(renderer, 'Urgent').props.onPress());
    await act_(renderer, () => pressableFor(renderer, 'Save changes').props.onPress());

    expect(allText(renderer)).toContain(EDIT_STARTED_MESSAGE);
    // The sheet stays up briefly so the message can be read — no immediate close.
    expect(onClose).not.toHaveBeenCalled();

    await act_(renderer, () => jest.advanceTimersByTime(1500));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('during the 409 countdown blocks Save and fires the close exactly once', async () => {
    jest.useFakeTimers();
    updateMock.mockRejectedValue(apiError({ status: 409, code: 'JOB_NOT_MODIFIABLE' }));
    const { renderer, onClose } = mountSheet();

    await act_(renderer, () => pressableFor(renderer, 'Urgent').props.onPress());
    await act_(renderer, () => pressableFor(renderer, 'Save changes').props.onPress());
    // Save is inert for the whole countdown, not re-enabled mid-message.
    expect(pressableFor(renderer, 'Save changes').props.disabled).toBe(true);

    // A second press during the countdown must not fire another request.
    await act_(renderer, () => pressableFor(renderer, 'Save changes').props.onPress());
    expect(updateMock).toHaveBeenCalledTimes(1);

    await act_(renderer, () => jest.advanceTimersByTime(1500));
    // …and the timer must never queue two closes.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps in-progress edits when a refetched job object lands mid-open', async () => {
    updateMock.mockResolvedValueOnce(UPDATED_JOB);
    const { renderer, onClose, onSaved } = mountSheet();

    await act_(renderer, () => pressableFor(renderer, 'Urgent').props.onPress());
    expect(pressableFor(renderer, 'Save changes').props.disabled).toBe(false);

    // A background refetch replaced the `job` prop (new object identity, same
    // content) while the sheet is open — the form must NOT re-seed and wipe
    // the pending priority change.
    await act_(renderer, () => {
      renderer.update(
        <EditJobSheet
          visible
          job={{ ...BASE_JOB, updatedAt: '2026-09-04T09:00:00.000Z' }}
          technicians={ROSTER}
          onClose={onClose}
          onSaved={onSaved}
        />,
      );
    });
    expect(pressableFor(renderer, 'Save changes').props.disabled).toBe(false);

    await act_(renderer, () => pressableFor(renderer, 'Save changes').props.onPress());
    expect(updateMock).toHaveBeenCalledWith('job-1', { priority: 'urgent' });
  });

  it('on a 404 after a reassign blames the technician and refreshes the roster without closing', async () => {
    updateMock.mockRejectedValueOnce(apiError({ status: 404, code: 'NOT_FOUND', message: 'Technician not found' }));
    const { renderer, onClose, onSaved } = mountSheet();

    // Reassign to the second roster technician.
    await act_(renderer, () => pressableFor(renderer, 'Anil Verma').props.onPress());
    await act_(renderer, () => pressableFor(renderer, 'Save changes').props.onPress());

    expect(updateMock).toHaveBeenCalledWith('job-1', { technicianId: 'tech-2' });
    expect(allText(renderer)).toContain(TECHNICIAN_GONE_MESSAGE);
    expect(loadMyProfile).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders a 422 server message as-is and keeps the sheet open', async () => {
    updateMock.mockRejectedValueOnce(
      apiError({
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'Cancellation cannot be combined with field edits',
      }),
    );
    const { renderer, onClose } = mountSheet();

    await act_(renderer, () => pressableFor(renderer, 'Urgent').props.onPress());
    await act_(renderer, () => pressableFor(renderer, 'Save changes').props.onPress());

    expect(allText(renderer)).toContain('Cancellation cannot be combined with field edits');
    expect(onClose).not.toHaveBeenCalled();
  });
});

/** `act` wrapper — awaiting inside act flushes the press handler's microtasks. */
async function act_(renderer: ReactTestRenderer, trigger: () => void): Promise<void> {
  await act(async () => {
    trigger();
    await Promise.resolve();
  });
}
