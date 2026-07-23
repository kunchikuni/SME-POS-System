import { useEffect, useState } from 'react';
import { api } from '../sync/apiClient';

/**
 * Tasks button with live notification badge count for open tasks.
 * Polls /pos/tasks every 10 seconds so newly added tasks automatically show a
 * notification badge count in the cashier header.
 */
export function TasksButton({
  onClick,
  refreshKey = 0,
}: {
  onClick: () => void;
  refreshKey?: number;
}) {
  const [count, setCount] = useState<number>(0);

  async function checkCount() {
    try {
      const res = await api.tasks();
      setCount(res.tasks.length);
    } catch {
      // Offline or error — keep existing count
    }
  }

  useEffect(() => {
    void checkCount();
    const timer = setInterval(() => {
      void checkCount();
    }, 10000);
    return () => clearInterval(timer);
  }, [refreshKey]);

  return (
    <button
      onClick={onClick}
      className="relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-slate-200 transition-colors"
      title={count > 0 ? `${count} open task${count === 1 ? '' : 's'}` : 'Tasks'}
    >
      <span>Tasks</span>
      {count > 0 && (
        <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(124,58,237,0.6)] ring-1 ring-white/20 anim-pop-in">
          {count}
        </span>
      )}
    </button>
  );
}
