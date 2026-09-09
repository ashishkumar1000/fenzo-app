/**
 * OwnerRealtimeBridge — the mount point for Story 3.3's Realtime wiring.
 *
 * Why a bridge exists: App.tsx's role gate is a conditional render chain,
 * not an early return, so hooks cannot be called at `App()` top level
 * without technicians opening a socket. This component renders in the
 * OWNER branch only and internally:
 *   1. re-checks the session role (defense in depth — even if mounted
 *      elsewhere by accident, any non-owner session — technician,
 *      bootstrap-null, or a future role — runs zero Realtime code: no
 *      listener, no subscription, no token exchange; the allowlist
 *      direction means only an explicit owner session enables the hook),
 *   2. runs `useOwnerNotifications` (AppState-gated socket + force-refetch),
 *   3. renders `StatusBanner` when a banner is live, null otherwise.
 */
import { useAuth } from '../auth/useAuth';
import { useOwnerNotifications } from './useOwnerNotifications';
import { StatusBanner } from '../../components/StatusBanner';

export function OwnerRealtimeBridge() {
  const { session } = useAuth();
  // Allowlist, not denylist: bootstrap (session null) and any future role
  // suspend the hook by default — only an explicit owner session enables it.
  const isOwner = session?.role === 'owner';

  const { banner } = useOwnerNotifications({ enabled: isOwner });

  if (!isOwner || !banner) return null;

  return <StatusBanner banner={banner} />;
}
