'use client';
/** Small, accessible UI kit built on the design tokens in globals.css. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export function cx(...c: Array<string | false | null | undefined>) { return c.filter(Boolean).join(' '); }

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="loading" className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}

export function Field({ label, hint, children, error }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-bad">{error}</span>}
    </label>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-panel-3 text-xl text-accent-2">✦</div>
      <p className="font-display text-base font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-mute">{children}</div>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className={cx('card flex max-h-[92vh] w-full flex-col overflow-hidden outline-none', wide ? 'max-w-5xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="scroll-thin overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div role="tablist" className="scroll-thin flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} className="tab shrink-0" onClick={() => onChange(it.value)}>{it.label}</button>
      ))}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-3" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-accent to-cyan transition-all" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

// ───────────────────────── Toasts ─────────────────────────
type Toast = { id: number; kind: 'ok' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto card px-4 py-3 text-sm shadow-2xl', t.kind === 'error' && 'border-bad/40 text-bad', t.kind === 'ok' && 'border-ok/40')}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Run an async action with busy state + error toast. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, okText?: string): Promise<T | undefined> => {
    setBusy(key);
    try { const r = await fn(); if (okText) toast('ok', okText); return r; }
    catch (e) { toast('error', (e as Error).message); return undefined; }
    finally { setBusy(null); }
  }, [toast]);
  return { busy, run };
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const kind = ['succeeded', 'ready', 'published', 'connected', 'implemented', 'builtin'].includes(status) ? 'badge-ok'
    : ['failed', 'canceled', 'discontinued', 'unavailable'].includes(status) ? 'badge-bad'
    : ['running', 'rendering', 'generating', 'publishing', 'processing'].includes(status) ? 'badge-accent'
    : ['queued', 'scheduled', 'manual', 'planning'].includes(status) ? 'badge-warn' : '';
  return <span className={cx('badge', kind)}>{label}</span>;
}
