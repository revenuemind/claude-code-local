'use client';
/** Usage & plan, Team and Settings pages. */
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config';
import { useI18n } from '../I18nProvider';
import { Field, PageHeader, Progress, Spinner, useAction } from '../ui';

interface Usage { plan: { name: string; limits: Record<string, number | boolean> }; usage: Record<string, { quantity: number; costUsd: number }>; renderMinutes: number; aiCostUsd: number; projects: number }

export function UsagePage() {
  const { t, num, usd } = useI18n();
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => { apiFetch<Usage>('/api/usage').then(setU).catch(() => {}); }, []);
  if (!u) return <Spinner />;
  const lim = u.plan.limits;
  const rows: Array<[string, number, number, (n: number) => string]> = [
    [t('usage.renderMinutes'), u.renderMinutes, Number(lim.renderMinutesPerMonth), (n) => num(n, { maximumFractionDigits: 1 })],
    [t('usage.aiSpend'), u.aiCostUsd, Number(lim.aiCreditsUsdPerMonth), usd],
    [t('usage.projects'), u.projects, Number(lim.projects), (n) => num(n)],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={t('usage.title')} subtitle={`${t('usage.plan')}: ${u.plan.name}`} />
      <div className="grid gap-4 md:grid-cols-3">
        {rows.map(([label, used, limit, f]) => (
          <div key={label} className="card space-y-3 p-5">
            <div className="text-sm text-mute">{label} · {t('usage.period')}</div>
            <div className="font-display text-2xl font-bold">{f(used)} <span className="text-base text-mute">/ {limit < 0 ? t('usage.unlimited') : f(limit)}</span></div>
            {limit > 0 && <Progress value={used / limit} />}
          </div>
        ))}
      </div>
      <div className="card p-5">
        <table className="w-full text-sm">
          <tbody>{Object.entries(u.usage).map(([k, v]) => <tr key={k} className="border-b border-line/60"><td className="py-2 font-mono text-xs">{k}</td><td className="py-2 text-end">{num(v.quantity, { maximumFractionDigits: 1 })}</td><td className="py-2 text-end text-mute">{v.costUsd ? usd(v.costUsd) : '—'}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-mute">{t('usage.billingNote')}</p>
    </div>
  );
}

interface Member { userId: string; name: string; email: string; role: string }
export function TeamPage({ canManage, me }: { canManage: boolean; me: string }) {
  const { t } = useI18n();
  const { busy, run } = useAction();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const load = async () => setMembers((await apiFetch<{ members: Member[] }>('/api/team')).members);
  useEffect(() => { void load(); }, []);
  const add = () => run('add', async () => { await apiFetch('/api/team', { body: { email, role } }); setEmail(''); await load(); }, t('common.saved'));
  const setR = (userId: string, r: string) => run('role', async () => { await apiFetch(`/api/team/${userId}`, { method: 'PATCH', body: { role: r } }); await load(); });
  const remove = (userId: string) => run('rm', async () => { if (!confirm(t('common.areYouSure'))) return; await apiFetch(`/api/team/${userId}`, { method: 'DELETE' }); await load(); });
  return (
    <div className="space-y-6">
      <PageHeader title={t('team.title')} />
      {canManage && (
        <div className="card flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-60 flex-1"><Field label={t('auth.email')} hint={t('team.addHint')}><input className="field" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
          <Field label={t('team.role')}><select className="field" value={role} onChange={(e) => setRole(e.target.value)}>{['admin', 'editor', 'viewer', 'owner'].map((r) => <option key={r} value={r}>{t(`team.roles.${r}`)}</option>)}</select></Field>
          <button className="btn btn-primary" disabled={!email || !!busy} onClick={add}>{t('team.addMember')}</button>
        </div>
      )}
      {!members ? <Spinner /> : (
        <div className="card divide-y divide-line">
          {members.map((m) => (
            <div key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1"><div className="font-semibold">{m.name}</div><div className="text-xs text-mute" dir="ltr">{m.email}</div></div>
              <select className="field !w-auto !py-1" value={m.role} disabled={!canManage} onChange={(e) => setR(m.userId, e.target.value)}>{['owner', 'admin', 'editor', 'viewer'].map((r) => <option key={r} value={r}>{t(`team.roles.${r}`)}</option>)}</select>
              {canManage && m.userId !== me && <button className="btn btn-danger btn-sm" onClick={() => remove(m.userId)}>{t('team.remove')}</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsPage({ name }: { name: string }) {
  const { t, locale } = useI18n();
  const { busy, run } = useAction();
  const [n, setN] = useState(name);
  const [l, setL] = useState<Locale>(locale);
  const save = () => run('save', async () => {
    await apiFetch('/api/auth/me', { method: 'PATCH', body: { name: n, uiLocale: l } });
    await apiFetch('/api/locale', { body: { locale: l } });
    window.location.reload();
  });
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title={t('settings.title')} />
      <div className="card space-y-4 p-6">
        <h2 className="font-display font-semibold">{t('settings.profile')}</h2>
        <Field label={t('auth.fullName')}><input className="field" value={n} onChange={(e) => setN(e.target.value)} /></Field>
        <Field label={t('settings.interfaceLanguage')} hint={t('settings.interfaceLanguageHint')}>
          <select className="field" value={l} onChange={(e) => setL(e.target.value as Locale)}>{LOCALES.map((x) => <option key={x} value={x}>{LOCALE_NAMES[x]}</option>)}</select>
        </Field>
        <button className="btn btn-primary" disabled={!!busy} onClick={save}>{t('common.save')}</button>
      </div>
    </div>
  );
}
