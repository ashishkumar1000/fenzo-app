/**
 * Tracks whether the user has finished onboarding, so the tour only shows on
 * first launch. Backed by MMKV — the read is synchronous, so there is no
 * loading state and no first-frame flash.
 */
import { useCallback, useState } from 'react';
import { storage } from '../../services/storage';

const KEY = 'fenzit.onboardingComplete';

export type OnboardingStatus = 'pending' | 'done';

export function useOnboarding() {
  const [status, setStatus] = useState<OnboardingStatus>(() =>
    storage.getBoolean(KEY) ? 'done' : 'pending',
  );

  const complete = useCallback(() => {
    storage.set(KEY, true);
    setStatus('done');
  }, []);

  return { status, complete };
}
