import { useSyncStatus } from './useSyncStatus';

/** Live connectivity + outbox indicator, shown in the till header. */
export function SyncBadge() {
  const status = useSyncStatus();
  if (!status) return null;

  const dot = status.online ? 'bg-green-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span>{status.online ? 'Online' : 'Offline'}</span>
      {status.syncing && <span className="text-slate-400">· syncing</span>}
      {status.pending > 0 && (
        <span className="text-amber-600">· {status.pending} unsynced</span>
      )}
    </div>
  );
}

export function Splash({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
