import { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { Check, X, AlertCircle, Info } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, dismissToast } = useApp();

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    toasts.forEach((t) => {
      timers.push(setTimeout(() => dismissToast(t.id), 3000));
    });
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.type === 'success' ? Check : t.type === 'error' ? AlertCircle : Info;
        const color =
          t.type === 'success'
            ? 'text-green-400 border-green-800/50 bg-green-950/80'
            : t.type === 'error'
            ? 'text-red-400 border-red-800/50 bg-red-950/80'
            : 'text-accent-400 border-accent-800/50 bg-accent-950/80';
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium backdrop-blur-md shadow-2xl shadow-black/50 animate-slide-up ${color}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-zinc-100">{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="ml-2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
