import { useEffect, useState } from 'react';
import { syncManager, type SyncStatus } from '../sync/syncManager';

/** Subscribe a component to live sync status (online/offline, pending count). */
export function useSyncStatus(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => syncManager.subscribe(setStatus), []);
  return status;
}
