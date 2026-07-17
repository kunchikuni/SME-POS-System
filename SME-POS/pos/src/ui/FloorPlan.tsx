import { useMemo } from 'react';
import type { Table } from '../types/contract';
import { SyncBadge } from './Shared';

/**
 * Restaurant entry screen: the floor plan. Tapping a table starts an order for
 * it. Tables come from the same sync store as the catalog (server-authoritative,
 * managed in the dashboard), so this works offline once bootstrapped.
 */
export function FloorPlan({
  tenantName,
  branchName,
  cashierName,
  tables,
  onSelect,
  onEndShift,
}: {
  tenantName: string;
  branchName: string;
  cashierName: string;
  tables: Table[];
  onSelect: (table: Table) => void;
  onEndShift: () => void;
}) {
  const sections = useMemo(() => {
    const groups = new Map<string, Table[]>();
    for (const t of tables.filter((t) => t.is_active)) {
      const key = t.section ?? 'Floor';
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
    }
    return [...groups.entries()];
  }, [tables]);

  return (
    <div className="min-h-dvh bg-slate-50 p-4">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{tenantName}</h1>
          <p className="text-sm text-slate-500">
            {branchName} · {cashierName}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <SyncBadge />
          <button
            onClick={onEndShift}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200"
          >
            End shift
          </button>
        </div>
      </header>

      {sections.length === 0 ? (
        <p className="mt-16 text-center text-slate-400">
          No tables yet. Add them in the dashboard, then this floor plan fills in.
        </p>
      ) : (
        <div className="space-y-6">
          {sections.map(([section, sectionTables]) => (
            <div key={section}>
              <h2 className="mb-2 text-sm font-medium text-slate-500">{section}</h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                {sectionTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t)}
                    className="flex aspect-square flex-col items-center justify-center rounded-xl bg-white shadow-sm transition hover:ring-2 hover:ring-blue-200"
                  >
                    <span className="text-lg font-semibold text-slate-900">{t.name}</span>
                    {t.seats > 0 && <span className="mt-1 text-xs text-slate-400">{t.seats} seats</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
