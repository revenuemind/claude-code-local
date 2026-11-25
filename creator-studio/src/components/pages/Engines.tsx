'use client';
import { useState } from 'react';
import type { EnginePreferences } from '@/lib/providers/types';
import type { ClientProvider } from '@/lib/client/types';
import { apiFetch } from '@/lib/client/api';
import { useEngines } from '@/lib/client/useEngines';
import { useI18n } from '../I18nProvider';
import { Field, Modal, PageHeader, Spinner, StatusBadge, cx, useAction } from '../ui';

const TASKS: Array<{ key: keyof EnginePreferences; cap: string }> = [
  { key: 'planner', cap: 'llm' }, { key: 'image', cap: 'image' }, { key: 'video', cap: 'video' }, { key: 'tts', cap: 'tts' }, { key: 'music', cap: 'music' },
];

export function Engines({ canManage }: { canManage: boolean }) {
  const { t, usd } = useI18n();
  const { data, refresh } = useEngines();
  const { busy, run } = useAction();
  const [connect, setConnect] = useState<ClientProvider | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [prefs, setPrefs] = useState<EnginePreferences | null>(null);
  if (!data) return <Spinner />;
  const p = prefs ?? data.preferences;

  const saveKey = () => run('key', async () => {
    await apiFetch('/api/engines/credentials', { body: { providerId: connect!.id, label: 'default', secrets, config } });
    setConnect(null); setSecrets({}); setConfig({}); refresh();
  }, t('common.saved'));
  const removeKey = (id: string) => run('rm', async () => { if (!confirm(t('common.areYouSure'))) return; await apiFetch(`/api/engines/credentials/${id}`, { method: 'DELETE' }); refresh(); });
  const savePrefs = () => run('prefs', async () => { await apiFetch('/api/engines/preferences', { method: 'PUT', body: p }); setPrefs(null); refresh(); }, t('common.saved'));
  const setTask = (key: keyof EnginePreferences, providerId: string, modelId?: string) => {
    const prov = data.providers.find((x) => x.id === providerId);
    const cap = TASKS.find((x) => x.key === key)!.cap;
    const m = modelId ?? (providerId === 'offline' ? 'template-planner' : prov?.models.find((x) => x.capability === cap && x.default)?.id ?? prov?.models.find((x) => x.capability === cap)?.id ?? '');
    setPrefs({ ...p, [key]: { ...(p[key] as object), providerId, modelId: m } });
  };

  return (
    <div className="space-y-8">
      <PageHeader title={t('engines.title')} subtitle={t('engines.subtitle')} />
      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold">{t('engines.tasks')}</h2>
          <button className="btn btn-primary btn-sm" disabled={!canManage || !prefs || !!busy} onClick={savePrefs}>{busy === 'prefs' && <Spinner />}{t('common.save')}</button></div>
        <div className="grid gap-3 lg:grid-cols-5">
          {TASKS.map(({ key, cap }) => {
            const sel = p[key] as { providerId: string; modelId: string; voiceId?: string } | undefined;
            const options = data.providers.filter((x) => x.capabilities.includes(cap) && (x.status === 'builtin' || x.status === 'implemented'));
            const prov = data.providers.find((x) => x.id === sel?.providerId);
            const models = prov?.models.filter((m) => m.capability === cap) ?? [];
            const connected = !prov || prov.status === 'builtin' || data.credentials.some((c) => c.providerId === prov.id) || (p.allowPlatformCredentials && prov.platformKeyAvailable);
            return (
              <div key={key} className="rounded-xl border border-line p-3">
                <div className="mb-2 text-sm font-semibold">{t(`engines.task.${key}`)}</div>
                <select className="field mb-2 !py-1.5 text-xs" value={sel?.providerId ?? ''} disabled={!canManage} onChange={(e) => setTask(key, e.target.value)}>
                  {key === 'planner' && <option value="offline">{t('plan.offlinePlanner')}</option>}
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {sel?.providerId !== 'offline' && (
                  <>
                    <input list={`models-${key}`} className="field mb-2 !py-1.5 text-xs" dir="ltr" value={sel?.modelId ?? ''} disabled={!canManage} onChange={(e) => setTask(key, sel!.providerId, e.target.value)} aria-label={t('engines.customModel')} />
                    <datalist id={`models-${key}`}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
                  </>
                )}
                {key === 'tts' && <input className="field mb-2 !py-1.5 text-xs" dir="ltr" placeholder={t('generate.voiceId')} value={sel?.voiceId ?? ''} disabled={!canManage} onChange={(e) => setPrefs({ ...p, tts: { ...(p.tts ?? { providerId: '', modelId: '' }), voiceId: e.target.value } })} />}
                {!connected && <div className="text-[11px] text-warn">{t('common.notConnected')}</div>}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" disabled={!canManage} checked={!!p.allowPlatformCredentials} onChange={(e) => setPrefs({ ...p, allowPlatformCredentials: e.target.checked })} />{t('engines.platformCredentials')}</label>
          <label className="flex items-center gap-2">{t('engines.quality')}
            <select className="field !w-auto !py-1" disabled={!canManage} value={p.quality ?? 'standard'} onChange={(e) => setPrefs({ ...p, quality: e.target.value as EnginePreferences['quality'] })}>
              {(['draft', 'standard', 'high'] as const).map((q) => <option key={q} value={q}>{t(`engines.qualities.${q}`)}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-display text-lg font-semibold">{t('engines.providers')}</h2>
        <p className="mb-4 text-xs text-mute">{t('engines.statusHelp')}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.providers.map((prov) => {
            const creds = data.credentials.filter((c) => c.providerId === prov.id);
            return (
              <div key={prov.id} className={cx('card flex flex-col gap-3 p-5', (prov.status === 'discontinued' || prov.status === 'unavailable') && 'opacity-60')} data-testid={`provider-${prov.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-display font-semibold">{prov.name}</div><div className="text-xs text-mute">{prov.capabilities.join(' · ')}</div></div>
                  <StatusBadge status={prov.status} label={t(`engines.status.${prov.status}`)} />
                </div>
                <p className="text-xs text-ink-2">{prov.statusNote}</p>
                {prov.models.length > 0 && (
                  <table className="w-full text-xs">
                    <tbody>{prov.models.map((m) => (
                      <tr key={m.id} className="border-t border-line/60"><td className="py-1 pe-2 font-medium">{m.name}</td><td className="py-1 text-mute">{m.capability}</td>
                        <td className="py-1 text-end font-mono">{m.cost ? `${usd(m.cost.usd)}/${m.cost.unit}` : '—'}</td></tr>
                    ))}</tbody>
                  </table>
                )}
                {prov.commercialUse && <p className="text-[11px] text-mute"><span className="font-semibold">{t('engines.commercial')}:</span> {prov.commercialUse}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {creds.map((c) => <span key={c.id} className="badge badge-ok">🔑 {c.keyHint}<button className="ms-1 text-bad" onClick={() => removeKey(c.id)} disabled={!canManage} aria-label={t('common.delete')}>✕</button></span>)}
                  {prov.status === 'implemented' && prov.credentialFields.length > 0 && <button className="btn btn-soft btn-sm" disabled={!canManage} onClick={() => { setConnect(prov); setSecrets({}); }}>{t('engines.connectKey')}</button>}
                  {prov.platformKeyAvailable && <span className="badge">platform key</span>}
                  {prov.docsUrl && <a className="ms-auto text-xs text-accent-2 hover:underline" href={prov.docsUrl} target="_blank" rel="noreferrer">{t('engines.docs')} ↗</a>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Modal open={!!connect} onClose={() => setConnect(null)} title={`${t('engines.connectKey')} — ${connect?.name ?? ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setConnect(null)}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={!Object.values(secrets).some(Boolean) || !!busy} onClick={saveKey}>{t('common.save')}</button></>}>
        {connect && (
          <div className="space-y-3">
            {connect.credentialFields.map((f) => (
              <Field key={f.key} label={<>{f.label} {f.optional && <span className="text-mute">({t('common.optional')})</span>}</>}>
                <input className="field font-mono" dir="ltr" type={f.secret ? 'password' : 'text'} autoComplete="off" value={secrets[f.key] ?? ''} onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })} />
              </Field>
            ))}
            {(connect.id === 'kling' || connect.id === 'seedance') && (
              <Field label="Base URL" hint={connect.id === 'kling' ? 'https://api.klingai.com (region-specific hosts supported)' : 'https://ark.ap-southeast.bytepluses.com/api/v3'}>
                <input className="field font-mono" dir="ltr" value={config.baseUrl ?? ''} onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} />
              </Field>
            )}
            <p className="text-xs text-mute">{t('engines.subtitle')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
