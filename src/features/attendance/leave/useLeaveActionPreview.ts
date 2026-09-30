/**
 * useLeaveActionPreview — the stage components' shared preview fetch
 * (Story 17-7, spec D1/D6). The split is time-sensitive (the Start-time
 * cutoff, midnight), so the fetch runs on EVERY stage entry — the stage
 * mounts fresh per entry and this hook fetches on mount — and Retry
 * refetches the same way. Failures classify through the shared vocabulary
 * (`classifyLeavePreviewFailure`): the action-named offline line, else the
 * server message verbatim, else the transport line.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceLeaveService } from '../../../services';
import type { ApiError } from '../../../services/api/apiError';
import type { LeaveActionPreview } from '../../../services/resources/attendanceLeave';
import { classifyLeavePreviewFailure, type LeaveWriteAction } from './ownerLeaveModel';

export type LeavePreviewState =
  | { kind: 'loading' }
  | { kind: 'loaded'; preview: LeaveActionPreview }
  | { kind: 'error'; message: string };

export function useLeaveActionPreview(action: LeaveWriteAction, requestId: string) {
  const [state, setState] = useState<LeavePreviewState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setState({ kind: 'loading' });
    const fetchPreview =
      action === 'revoke'
        ? attendanceLeaveService.previewRevoke
        : attendanceLeaveService.previewCancel;
    fetchPreview(requestId)
      .then(preview => {
        if (!mounted.current) return;
        setState({ kind: 'loaded', preview });
      })
      .catch((err: ApiError) => {
        if (!mounted.current) return;
        setState({
          kind: 'error',
          message: classifyLeavePreviewFailure(err, action).message,
        });
      });
    // Re-runs per attempt (the Retry) — every entry is a fresh mount, so
    // the preview is never cached from a previous open (spec D1).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, requestId, attempt]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);

  return { state, retry };
}
