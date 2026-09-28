/**
 * Hook tests for `useSetupWizard` (Story 15-8): the mount-time
 * start-or-resume contract, the advance latch and its retry/restart/exit
 * branches, the marker-untouched Back, and the completion paths. The
 * service is mocked at the `services` barrel — same convention as
 * `useOffices.test.tsx`.
 */
jest.mock('../../../services', () => ({
  attendanceSetupService: {
    getSetup: jest.fn(),
    startSetup: jest.fn(),
    saveSetupStep: jest.fn(),
    completeSetup: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { attendanceSetupService } from '../../../services';
import type { SetupState } from '../../../services';
import { useSetupWizard } from './useSetupWizard';

const getSetup = attendanceSetupService.getSetup as jest.Mock;
const startSetup = attendanceSetupService.startSetup as jest.Mock;
const saveSetupStep = attendanceSetupService.saveSetupStep as jest.Mock;
const completeSetup = attendanceSetupService.completeSetup as jest.Mock;

function setupState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    started: true,
    currentStep: 'offices',
    setupCompletedAt: null,
    enabled: false,
    ...overrides,
  };
}

const notStarted = {
  status: 404,
  code: 'ATTENDANCE_SETUP_NOT_STARTED',
  message: 'setup not started',
  details: null,
};
const alreadyCompleted = {
  status: 409,
  code: 'ATTENDANCE_SETUP_ALREADY_COMPLETED',
  message: 'setup already completed',
  details: null,
};

let probe: ReturnType<typeof useSetupWizard>;
let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

function Probe({ options }: { options?: Parameters<typeof useSetupWizard>[0] }) {
  probe = useSetupWizard(options ?? {});
  return null;
}

function renderHook(options?: Parameters<typeof useSetupWizard>[0]) {
  act(() => {
    renderer = create(<Probe options={options} />);
  });
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/** Renders and settles the mount-time bootstrap against a `started` tenant. */
async function renderResumed(
  step: SetupState['currentStep'] = 'offices',
  options?: Parameters<typeof useSetupWizard>[0],
) {
  getSetup.mockResolvedValue(setupState({ currentStep: step }));
  renderHook(options);
  await act(async () => {
    await flush();
  });
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — an unconsumed mockResolvedValueOnce
  // would leak into the next test's bootstrap.
  jest.resetAllMocks();
  renderer = null;
});

describe('bootstrap — start or resume', () => {
  it('a never-started tenant POSTs the start and lands on Offices', async () => {
    getSetup.mockResolvedValue(
      setupState({ started: false, currentStep: null }),
    );
    startSetup.mockResolvedValue(
      setupState({ started: true, currentStep: null }),
    );

    renderHook();
    await act(async () => {
      await flush();
    });

    expect(getSetup).toHaveBeenCalledTimes(1);
    expect(startSetup).toHaveBeenCalledTimes(1);
    expect(probe.currentStep).toBe('offices');
    expect(probe.isLoading).toBe(false);
    expect(probe.bootstrapError).toBeNull();
    expect(probe.exitReason).toBeNull();
  });

  it('a started tenant with a null marker resumes at Offices WITHOUT a start POST', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: null }));

    renderHook();
    await act(async () => {
      await flush();
    });

    expect(startSetup).not.toHaveBeenCalled();
    expect(probe.currentStep).toBe('offices');
  });

  it('a started tenant resumes AT THE MARKER (no re-entry of earlier steps)', async () => {
    getSetup.mockResolvedValue(setupState({ currentStep: 'weekly_off' }));

    renderHook();
    await act(async () => {
      await flush();
    });

    expect(startSetup).not.toHaveBeenCalled();
    expect(probe.currentStep).toBe('weekly_off');
  });

  it('a GARBAGE marker from the wire falls back to Offices (never enters the machine)', async () => {
    // Unreachable via the shipped DB CHECK, but the consume seam must not
    // trust the wire: an unknown value would be stepIndex −1 ("Step 0 of 5").
    getSetup.mockResolvedValue(
      setupState({ currentStep: 'garbage' as unknown as SetupState['currentStep'] }),
    );

    renderHook();
    await act(async () => {
      await flush();
    });

    expect(probe.currentStep).toBe('offices');
    expect(probe.bootstrapError).toBeNull();
    // No marker PATCH may ever carry the garbage value.
    expect(saveSetupStep).not.toHaveBeenCalled();
  });

  it('a COMPLETED setup never renders: exit signal, no start POST', async () => {
    getSetup.mockResolvedValue(
      setupState({ setupCompletedAt: '2026-09-28T10:00:00Z', enabled: true }),
    );

    renderHook();
    await act(async () => {
      await flush();
    });

    expect(startSetup).not.toHaveBeenCalled();
    expect(probe.currentStep).toBeNull();
    expect(probe.exitReason).toBe('completed-elsewhere');
  });

  it('a rejected bootstrap (403 technician) surfaces bootstrapError for the retry banner', async () => {
    getSetup.mockRejectedValue({ status: 403, code: 'FORBIDDEN' });

    renderHook();
    await act(async () => {
      await flush();
    });

    expect(probe.bootstrapError?.status).toBe(403);
    expect(probe.currentStep).toBeNull();
    expect(probe.isLoading).toBe(false);
  });

  it('retryBootstrap re-runs the bootstrap and recovers', async () => {
    getSetup.mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' });
    getSetup.mockResolvedValueOnce(setupState({ currentStep: 'holidays' }));

    renderHook();
    await act(async () => {
      await flush();
    });
    expect(probe.bootstrapError).not.toBeNull();

    await act(async () => {
      probe.retryBootstrap();
      await flush();
    });

    expect(getSetup).toHaveBeenCalledTimes(2);
    expect(probe.bootstrapError).toBeNull();
    expect(probe.currentStep).toBe('holidays');
  });
});

describe('advance — the step marker', () => {
  it('PATCHes the NEXT step and moves there on success', async () => {
    saveSetupStep.mockResolvedValue(setupState({ currentStep: 'timings' }));
    await renderResumed('offices');

    await act(async () => {
      await probe.advance();
    });

    expect(saveSetupStep).toHaveBeenCalledTimes(1);
    expect(saveSetupStep).toHaveBeenCalledWith('timings');
    expect(probe.currentStep).toBe('timings');
    expect(probe.advanceError).toBeNull();
  });

  it('latches: two rapid calls PATCH exactly once (no double-advance)', async () => {
    let release!: (v: SetupState) => void;
    saveSetupStep.mockImplementation(
      () => new Promise<SetupState>((resolve) => (release = resolve)),
    );
    await renderResumed('offices');

    await act(async () => {
      const first = probe.advance();
      const second = probe.advance(); // the race window
      release(setupState({ currentStep: 'timings' }));
      await Promise.all([first, second]);
    });

    expect(saveSetupStep).toHaveBeenCalledTimes(1);
    expect(probe.currentStep).toBe('timings');
  });

  it('a failed PATCH sets the retry banner, does NOT advance, keeps the step', async () => {
    saveSetupStep.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    await renderResumed('offices');

    await act(async () => {
      await probe.advance();
    });

    expect(probe.advanceError?.status).toBe(0);
    expect(probe.currentStep).toBe('offices');
    expect(probe.isAdvancing).toBe(false);
  });

  it('404 NOT_STARTED restarts via POST start and holds the banner for a Retry re-PATCH', async () => {
    saveSetupStep.mockRejectedValueOnce(notStarted);
    startSetup.mockResolvedValue(setupState({ currentStep: 'offices' }));
    await renderResumed('offices');

    await act(async () => {
      await probe.advance();
    });

    // The restart happened, the wizard did NOT advance, the banner is up.
    expect(startSetup).toHaveBeenCalledTimes(1);
    expect(probe.advanceError?.code).toBe('ATTENDANCE_SETUP_NOT_STARTED');
    expect(probe.currentStep).toBe('offices');

    // Retry semantics: the next advance re-PATCHes the SAME marker.
    saveSetupStep.mockResolvedValueOnce(setupState({ currentStep: 'timings' }));
    await act(async () => {
      await probe.advance();
    });
    expect(saveSetupStep).toHaveBeenCalledTimes(2);
    expect(saveSetupStep).toHaveBeenLastCalledWith('timings');
    expect(probe.currentStep).toBe('timings');
    expect(probe.advanceError).toBeNull();
  });

  it('a 404 whose restart fails with 409 exits (other device finished)', async () => {
    saveSetupStep.mockRejectedValueOnce(notStarted);
    startSetup.mockRejectedValueOnce(alreadyCompleted);
    await renderResumed('offices');

    await act(async () => {
      await probe.advance();
    });

    expect(probe.exitReason).toBe('completed-elsewhere');
    expect(probe.currentStep).toBe('offices');
  });

  it('a 409 mid-wizard (other device finished) exits without advancing', async () => {
    saveSetupStep.mockRejectedValue(alreadyCompleted);
    await renderResumed('timings');

    await act(async () => {
      await probe.advance();
    });

    expect(probe.exitReason).toBe('completed-elsewhere');
    expect(probe.currentStep).toBe('timings');
  });

  it('does nothing on the final step (Employees has no Continue)', async () => {
    await renderResumed('employees');

    await act(async () => {
      await probe.advance();
    });

    expect(saveSetupStep).not.toHaveBeenCalled();
    expect(probe.currentStep).toBe('employees');
  });
});

describe('back — in-session backward walk', () => {
  it('steps backward WITHOUT any PATCH (the marker never moves backward)', async () => {
    await renderResumed('weekly_off');

    act(() => {
      probe.back();
    });

    expect(probe.currentStep).toBe('timings');
    expect(saveSetupStep).not.toHaveBeenCalled();
  });

  it('Back on Offices stays on Offices (nothing before the first step)', async () => {
    await renderResumed('offices');

    act(() => {
      probe.back();
    });

    expect(probe.currentStep).toBe('offices');
  });
});

describe('complete — Enable attendance', () => {
  it('success sets the completed exit (the screen replaces to AttendanceHome)', async () => {
    completeSetup.mockResolvedValue(
      setupState({ setupCompletedAt: '2026-09-28T10:00:00Z', enabled: true }),
    );
    await renderResumed('employees');

    await act(async () => {
      await probe.complete();
    });

    expect(completeSetup).toHaveBeenCalledTimes(1);
    expect(probe.exitReason).toBe('completed');
    expect(probe.completionError).toBeNull();
  });

  it('a 409 (other device finished) exits as completed-elsewhere', async () => {
    completeSetup.mockRejectedValue(alreadyCompleted);
    await renderResumed('employees');

    await act(async () => {
      await probe.complete();
    });

    expect(probe.exitReason).toBe('completed-elsewhere');
    expect(probe.completionError).toBeNull();
  });

  it('a 422 INCOMPLETE sets completionError and fires the gate-data refetch exactly once', async () => {
    const onSetupIncomplete = jest.fn();
    completeSetup.mockRejectedValue({
      status: 422,
      code: 'ATTENDANCE_SETUP_INCOMPLETE',
      message: 'gates unmet',
      details: null,
    });
    await renderResumed('employees', { onSetupIncomplete });

    await act(async () => {
      await probe.complete();
    });

    expect(probe.completionError?.code).toBe('ATTENDANCE_SETUP_INCOMPLETE');
    expect(probe.exitReason).toBeNull();
    expect(onSetupIncomplete).toHaveBeenCalledTimes(1);
  });

  it('any other completion failure surfaces the banner WITHOUT the refetch', async () => {
    const onSetupIncomplete = jest.fn();
    completeSetup.mockRejectedValue({ status: 500, code: 'SERVER_ERROR' });
    await renderResumed('employees', { onSetupIncomplete });

    await act(async () => {
      await probe.complete();
    });

    expect(probe.completionError?.status).toBe(500);
    expect(onSetupIncomplete).not.toHaveBeenCalled();
    expect(probe.exitReason).toBeNull();
  });
});
