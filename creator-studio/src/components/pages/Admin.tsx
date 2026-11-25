'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { useI18n } from '../I18nProvider';
import { PageHeader, Spinner, StatusBadge, Tabs, useAction } from '../ui';

type Tab = 'overview' | 'users' | 'orgs' | 'jobs' | 'plans' | 'audit' | 'health';

export function Admin() {
  const { t, date } = useI18n();
  const { run } = useAction();
  const [tab, setTab] = useState<Tab>('overview');
  const [loaded, setLoaded] = useState<{ tab: Tab; value: unknown } | null>(null);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; limits: Record<string, unknown>; features: string[]; sortOrder: number; active: boolean }>>([]);
  const [planJson, setPlanJson] = useState<Record<string, string>>({});
  const load = async (tb: Tab = tab) => {
    setLoaded(null);
    const url = { overview: '/api/admin/overview', users: '/api/admin/users', orgs: '/api/admin/orgs', jobs: '/api/admin/jobs', plans: '/api/admin/plans', audit: '/api/admin/audit', health: '/api/admin/health' }[tb];
    const r = await apiFetch<Record<string, unknown>>(url);
    if (tb === 'plans' || tb === 'orgs') { const p = await apiFetch<{ plans: typeof plans }>('/api/admin/plans'); setPlans(p.plans); setPlanJson(Object.fromEntries(p.plans.map((x) => [x.id, JSON.stringify(x.limits, null, 2)]))); }
    setLoaded({ tab: tb, value: r });
  };
  useEffect(() => { void load(tab); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only render data fetched for the current tab (avoids rendering a stale payload with the wrong view).
  const d = loaded && loaded.tab === tab ? (loaded.value as Record<string, unknown>) : null;
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.title')} />
      <Tabs value={tab} onChange={setTab} items={(['overview', 'users', 'orgs', 'jobs', 'plans', 'audit', 'health'] as Tab[]).map((x) => ({ value: x, label: t(`admin.${x}`) }))} />
      {!d ? <Spinner /> : (
        <div className="card overflow-x-auto p-5 text-sm">
          {tab === 'overview' && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {(['users', 'orgs', 'projects', 'renders'] as const).map((k) => <div key={k}><div className="text-xs text-mute">{k}</div><div className="font-display text-2xl font-bold">{String(d[k])}</div></div>)}
              <div><div className="text-xs text-mute">jobs</div><div className="font-mono text-xs">{JSON.stringify(d.jobs)}</div></div>
            </div>
          )}
          {tab === 'users' && (
            <table className="w-full"><tbody>{(d.users as Array<{ id: string; email: string; name: string; isPlatformAdmin: boolean; disabled: boolean; createdAt: string }>).map((u) => (
              <tr key={u.id} className="border-b border-line/60">
                <td className="py-2">{u.name}<div className="text-xs text-mute" dir="ltr">{u.email}</div></td>
                <td>{u.isPlatformAdmin && <StatusBadge status="running" label="admin" />} {u.disabled && <StatusBadge status="failed" label="disabled" />}</td>
                <td className="text-xs text-mute">{date(u.createdAt)}</td>
                <td className="space-x-1 text-end">
                  <button className="btn btn-ghost btn-sm" onClick={() => run('u', async () => { await apiFetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { disabled: !u.disabled } }); await load(); })}>{u.disabled ? t('admin.enable') : t('admin.disable')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => run('a', async () => { await apiFetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { isPlatformAdmin: !u.isPlatformAdmin } }); await load(); })}>{u.isPlatformAdmin ? t('admin.revokeAdmin') : t('admin.makeAdmin')}</button>
                </td>
              </tr>
            ))}</tbody></table>
          )}
          {tab === 'orgs' && (
            <table className="w-full"><tbody>{(d.orgs as Array<{ id: string; name: string; planId: string | null; members: number; projects: number; createdAt: string }>).map((o) => (
              <tr key={o.id} className="border-b border-line/60">
                <td className="py-2 font-semibold">{o.name}</td><td className="text-xs text-mute">{o.members} 👤 · {o.projects} ▤</td>
                <td><select className="field !w-auto !py-1" value={o.planId ?? 'free'} onChange={(e) => run('p', async () => { await apiFetch(`/api/admin/orgs/${o.id}`, { method: 'PATCH', body: { planId: e.target.value } }); await load(); })}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                <td className="text-xs text-mute">{date(o.createdAt)}</td>
              </tr>
            ))}</tbody></table>
          )}
          {tab === 'jobs' && (
            <table className="w-full"><tbody>{(d.jobs as Array<{ id: string; type: string; status: string; error: string | null; orgId: string; createdAt: string; attempts: number }>).map((j) => (
              <tr key={j.id} className="border-b border-line/60"><td className="py-2">{j.type}</td><td><StatusBadge status={j.status} label={j.status} /></td><td className="max-w-md truncate text-xs text-bad" dir="ltr">{j.error}</td><td className="text-xs text-mute">{j.attempts} · {date(j.createdAt)}</td></tr>
            ))}</tbody></table>
          )}
          {tab === 'plans' && (
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((p) => (
                <div key={p.id} className="space-y-2">
                  <div className="font-display font-semibold">{p.name} <span className="font-mono text-xs text-mute">{p.id}</span></div>
                  <textarea className="field h-64 font-mono text-xs" dir="ltr" value={planJson[p.id] ?? ''} onChange={(e) => setPlanJson({ ...planJson, [p.id]: e.target.value })} aria-label={t('admin.planLimits')} />
                  <button className="btn btn-primary btn-sm" onClick={() => run('save', async () => { await apiFetch('/api/admin/plans', { method: 'PUT', body: { ...p, limits: JSON.parse(planJson[p.id]) } }); await load(); }, t('common.saved'))}>{t('common.save')}</button>
                </div>
              ))}
            </div>
          )}
          {tab === 'audit' && (
            <table className="w-full"><tbody>{(d.entries as Array<{ id: string; action: string; targetType: string | null; targetId: string | null; createdAt: string; ip: string | null; meta: unknown }>).map((a) => (
              <tr key={a.id} className="border-b border-line/60"><td className="py-1.5 font-mono text-xs">{a.action}</td><td className="text-xs text-mute">{a.targetType}:{a.targetId?.slice(0, 8)}</td><td className="max-w-xs truncate font-mono text-[11px] text-mute">{JSON.stringify(a.meta)}</td><td className="text-xs text-mute">{date(a.createdAt)}</td></tr>
            ))}</tbody></table>
          )}
          {tab === 'health' && (
            <div className="grid gap-3 md:grid-cols-3">
              {Object.entries(d.checks as Record<string, { ok: boolean; detail?: string }>).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between"><span className="font-semibold">{k}</span><StatusBadge status={v.ok ? 'succeeded' : 'failed'} label={v.ok ? 'OK' : 'FAIL'} /></div>{v.detail && <div className="mt-1 text-xs text-mute">{v.detail}</div>}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
