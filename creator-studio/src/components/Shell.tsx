'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from './I18nProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { cx } from './ui';
import { apiFetch } from '@/lib/client/api';

export interface ShellActor { name: string; email: string; orgName: string; orgId: string; role: string; isPlatformAdmin: boolean }

const NAV: Array<{ href: string; key: string; icon: string; admin?: boolean }> = [
  { href: '/dashboard', key: 'nav.dashboard', icon: '◧' },
  { href: '/projects', key: 'nav.projects', icon: '▤' },
  { href: '/templates', key: 'nav.templates', icon: '❖' },
  { href: '/brands', key: 'nav.brands', icon: '◈' },
  { href: '/assets', key: 'nav.assets', icon: '▦' },
  { href: '/engines', key: 'nav.engines', icon: '⚙' },
  { href: '/publishing', key: 'nav.publishing', icon: '➤' },
  { href: '/usage', key: 'nav.usage', icon: '◔' },
  { href: '/team', key: 'nav.team', icon: '☷' },
  { href: '/admin', key: 'nav.admin', icon: '⛨', admin: true },
  { href: '/settings', key: 'nav.settings', icon: '⚑' },
];

export function Shell({ actor, children }: { actor: ShellActor; children: ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { apiFetch<{ orgs: Array<{ id: string; name: string }> }>('/api/auth/me').then((r) => setOrgs(r.orgs)).catch(() => {}); }, []);

  const signOut = async () => { await apiFetch('/api/auth/logout', { body: {} }).catch(() => {}); window.location.href = '/login'; };
  const switchOrg = async (orgId: string) => { await apiFetch('/api/auth/switch-org', { body: { orgId } }); window.location.href = '/dashboard'; };

  const nav = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      <Link href="/dashboard" className="mb-4 flex items-center gap-2.5 px-2 pt-1">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-cyan font-display text-base font-black text-accent-ink">◆</span>
        <span className="font-display text-[15px] font-bold leading-tight">{t('app.name')}</span>
      </Link>
      <Link href="/projects/new" className="btn btn-primary mb-3">＋ {t('nav.newProject')}</Link>
      {NAV.filter((n) => !n.admin || actor.isPlatformAdmin).map((n) => {
        const active = path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
            className={cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors', active ? 'bg-panel-3 text-ink' : 'text-ink-2 hover:bg-panel-2 hover:text-ink')}>
            <span className={cx('w-4 text-center', active && 'text-accent-2')} aria-hidden>{n.icon}</span>{t(n.key)}
          </Link>
        );
      })}
      <div className="mt-auto space-y-3 border-t border-line pt-3">
        {orgs.length > 1 ? (
          <select className="field text-xs" value={actor.orgId} onChange={(e) => switchOrg(e.target.value)} aria-label={t('nav.workspace')}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : <div className="truncate px-1 text-xs text-mute">{actor.orgName}</div>}
        <LanguageSwitcher />
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{actor.name}</div>
            <div className="truncate text-xs text-mute">{t(`team.roles.${actor.role}`)}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>{t('auth.signOut')}</button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-e border-line bg-panel/80 backdrop-blur lg:block">{nav}</aside>
      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cx('fixed inset-y-0 start-0 z-50 w-72 border-e border-line bg-panel transition-transform lg:hidden', open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full')}>{nav}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur lg:hidden">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
          <span className="font-display font-bold">{t('app.name')}</span>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
