'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { useI18n } from '../I18nProvider';
import { Field, Modal, PageHeader, Spinner, StatusBadge, useAction, useToast } from '../ui';
import { PublicationList } from '../project/PublishStage';

type P = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'blotato';
interface Account { id: string; platform: P; displayName: string; status: string; externalId: string | null; createdAt: string }
const PLATFORMS: P[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'blotato'];
const TOKEN_FIELDS: Record<P, string[]> = { youtube: ['accessToken', 'refreshToken'], tiktok: ['accessToken', 'refreshToken'], instagram: ['accessToken'], facebook: ['accessToken'], blotato: ['apiKey', 'targetPlatform'] };

export function Publishing({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const sp = useSearchParams();
  const { busy, run } = useAction();
  const [data, setData] = useState<{ accounts: Account[]; oauth: Record<string, boolean>; publicUrlConfigured: boolean } | null>(null);
  const [pubs, setPubs] = useState<Parameters<typeof PublicationList>[0]['items']>([]);
  const [manual, setManual] = useState<P | null>(null);
  const [form, setForm] = useState<{ displayName: string; externalId: string; tokens: Record<string, string> }>({ displayName: '', externalId: '', tokens: {} });
  const load = async () => {
    const [a, p] = await Promise.all([apiFetch<typeof data>('/api/publishing/accounts'), apiFetch<{ publications: typeof pubs }>('/api/publishing/publications')]);
    setData(a); setPubs(p.publications);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (sp.get('oauth_error')) toast('error', sp.get('oauth_error')!);
    if (sp.get('connected')) toast('ok', `${t('common.connected')}: ${sp.get('connected')}`);
  }, [sp, toast, t]);

  const addManual = () => run('add', async () => {
    await apiFetch('/api/publishing/accounts', { body: { platform: manual, displayName: form.displayName, externalId: form.externalId || null, tokens: form.tokens } });
    setManual(null); setForm({ displayName: '', externalId: '', tokens: {} }); await load();
  }, t('common.saved'));
  const disconnect = (id: string) => run('rm', async () => { if (!confirm(t('common.areYouSure'))) return; await apiFetch(`/api/publishing/accounts/${id}`, { method: 'DELETE' }); await load(); });

  if (!data) return <Spinner />;
  return (
    <div className="space-y-8">
      <PageHeader title={t('publish.title')} />
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">{t('publish.accounts')}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {PLATFORMS.map((pl) => {
            const accs = data.accounts.filter((a) => a.platform === pl);
            return (
              <div key={pl} className="card flex flex-col gap-3 p-4">
                <div className="font-display font-semibold capitalize">{pl}</div>
                <p className="text-xs text-mute">{t(`publish.platformNotes.${pl}`)}</p>
                {accs.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg bg-panel-2 px-2 py-1.5 text-xs">
                    <StatusBadge status="connected" label="✓" /><span className="min-w-0 flex-1 truncate">{a.displayName}</span>
                    <button className="text-bad" onClick={() => disconnect(a.id)} disabled={!canManage} aria-label={t('publish.disconnect')}>✕</button>
                  </div>
                ))}
                <div className="mt-auto flex flex-col gap-2">
                  {pl !== 'blotato' && (data.oauth[pl]
                    ? <a className={`btn btn-soft btn-sm ${canManage ? '' : 'pointer-events-none opacity-50'}`} href={`/api/publishing/oauth/${pl}/start`}>{t('publish.connectOAuth', { platform: pl })}</a>
                    : <span className="text-[11px] text-warn">{t('publish.oauthMissing')}</span>)}
                  <button className="btn btn-ghost btn-sm" disabled={!canManage} onClick={() => { setManual(pl); setForm({ displayName: '', externalId: '', tokens: {} }); }}>{t('publish.connectManual')}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="card">
        <h2 className="border-b border-line px-5 py-3 font-display text-lg font-semibold">{t('publish.queue')}</h2>
        <PublicationList items={pubs} onChanged={load} />
      </section>
      <Modal open={!!manual} onClose={() => setManual(null)} title={`${t('publish.connectManual')} — ${manual ?? ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setManual(null)}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={!form.displayName || !!busy} onClick={addManual}>{t('common.save')}</button></>}>
        {manual && (
          <div className="space-y-3">
            <Field label={t('common.name')}><input className="field" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
            <Field label={manual === 'instagram' ? 'Instagram business account ID' : manual === 'facebook' ? 'Page ID' : manual === 'blotato' ? 'Blotato account ID' : 'External ID'}><input className="field font-mono" dir="ltr" value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} /></Field>
            {TOKEN_FIELDS[manual].map((k) => (
              <Field key={k} label={k}><input className="field font-mono" dir="ltr" type={k.toLowerCase().includes('token') || k === 'apiKey' ? 'password' : 'text'} value={form.tokens[k] ?? ''} onChange={(e) => setForm({ ...form, tokens: { ...form.tokens, [k]: e.target.value } })} /></Field>
            ))}
            {manual === 'blotato' && !data.publicUrlConfigured && <p className="text-xs text-warn">APP_PUBLIC_URL is not set — Blotato cannot fetch videos from this server.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
