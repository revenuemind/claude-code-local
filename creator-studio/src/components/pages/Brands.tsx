'use client';
import { useEffect, useMemo, useState } from 'react';
import type { BrandColors, BrandFonts } from '@/lib/brand/types';
import { FONT_FAMILIES } from '@/lib/render/fonts';
import { getBuiltinTemplate } from '@/lib/templates/library';
import { draftPlan, buildComposition } from '@/lib/templates/engine';
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/config';
import { apiFetch, assetUrl } from '@/lib/client/api';
import { useI18n } from '../I18nProvider';
import { Empty, Field, Modal, PageHeader, Spinner, useAction } from '../ui';
import { Player, usePlayback } from '../Player';

interface Brand {
  id: string; name: string; logoAssetId: string | null; colors: BrandColors; fonts: BrandFonts; voice: string | null; preferredLanguages: string[];
  socialAccounts: Record<string, string>; guidelines: string | null; referenceAssetIds: string[];
}
const EMPTY: Omit<Brand, 'id'> = {
  name: '', logoAssetId: null, colors: { primary: '#8b6cff', secondary: '#38d6f5', accent: '#facc15', background: '#0b0b12', text: '#ffffff' },
  fonts: { heading: 'Montserrat', body: 'Inter' }, voice: '', preferredLanguages: ['en'], socialAccounts: {}, guidelines: '', referenceAssetIds: [],
};

function BrandPreview({ b }: { b: Omit<Brand, 'id'> }) {
  const comp = useMemo(() => {
    const t = getBuiltinTemplate('product-benefits')!;
    const plan = draftPlan(t, { product: b.name || 'Brand', benefit: 'Your message here', items: ['Consistent colors', 'Your typography', 'Your logo'] }, { language: 'en', mode: 'code', voiceover: false });
    return buildComposition(plan, t, { aspect: '1:1', brand: { name: b.name, colors: b.colors, fonts: b.fonts, logoAssetId: b.logoAssetId } });
  }, [b.name, b.colors, b.fonts, b.logoAssetId]);
  const pb = usePlayback(comp, { loop: true });
  useEffect(() => { pb.play(); }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="checker aspect-square rounded-2xl p-2"><Player comp={comp} time={pb.time} playing={pb.playing} /></div>;
}

export function Brands() {
  const { t } = useI18n();
  const { busy, run } = useAction();
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [edit, setEdit] = useState<(Omit<Brand, 'id'> & { id?: string }) | null>(null);
  const load = async () => setBrands((await apiFetch<{ brands: Brand[] }>('/api/brands')).brands);
  useEffect(() => { void load(); }, []);

  const save = () => run('save', async () => {
    const { id, ...body } = edit!;
    const payload = { ...body, voice: body.voice || null, guidelines: body.guidelines || null };
    if (id) await apiFetch(`/api/brands/${id}`, { method: 'PATCH', body: payload });
    else await apiFetch('/api/brands', { body: payload });
    setEdit(null); await load();
  }, t('common.saved'));
  const remove = (id: string) => run('del', async () => { if (!confirm(t('common.areYouSure'))) return; await apiFetch(`/api/brands/${id}`, { method: 'DELETE' }); await load(); });
  const uploadLogo = (f: File) => run('logo', async () => {
    const fd = new FormData(); fd.append('file', f);
    const r = await apiFetch<{ asset: { id: string } }>('/api/assets', { form: fd });
    setEdit((e) => (e ? { ...e, logoAssetId: r.asset.id } : e));
  });

  return (
    <div>
      <PageHeader title={t('brands.title')} actions={<button className="btn btn-primary" onClick={() => setEdit({ ...EMPTY })} data-testid="new-brand">＋ {t('brands.new')}</button>} />
      {!brands ? <Spinner /> : brands.length === 0 ? <Empty title={t('brands.none')} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((b) => (
            <div key={b.id} className="card space-y-3 p-5">
              <div className="flex items-center gap-3">
                {b.logoAssetId ? <img src={assetUrl(b.logoAssetId)} alt="" className="h-10 w-10 rounded-lg bg-panel-3 object-contain" /> : <div className="grid h-10 w-10 place-items-center rounded-lg font-display font-black" style={{ background: b.colors.primary, color: b.colors.background }}>{b.name[0]}</div>}
                <div className="min-w-0 flex-1"><div className="truncate font-display font-semibold">{b.name}</div><div className="text-xs text-mute">{b.fonts.heading} / {b.fonts.body}</div></div>
              </div>
              <div className="flex gap-1.5">{Object.values(b.colors).map((c, i) => <span key={i} className="h-6 flex-1 rounded-md border border-line" style={{ background: c }} />)}</div>
              <div className="flex gap-2"><button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...b })}>{t('common.edit')}</button><button className="btn btn-danger btn-sm" onClick={() => remove(b.id)}>{t('common.delete')}</button></div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('common.edit') : t('brands.new')} wide
        footer={<><button className="btn btn-ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={!edit?.name || !!busy} onClick={save} data-testid="save-brand">{t('common.save')}</button></>}>
        {edit && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <Field label={t('common.name')}><input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="brand-name" /></Field>
              <div>
                <span className="label">{t('brands.colors')}</span>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.keys(edit.colors) as Array<keyof BrandColors>).map((k) => (
                    <label key={k} className="text-center text-[11px] text-mute">
                      <input type="color" className="mb-1 h-10 w-full rounded-lg bg-transparent" value={edit.colors[k]} onChange={(e) => setEdit({ ...edit, colors: { ...edit.colors, [k]: e.target.value } })} />
                      {t(`brands.colorNames.${k}`)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('brands.headingFont')}><select className="field" value={edit.fonts.heading} onChange={(e) => setEdit({ ...edit, fonts: { ...edit.fonts, heading: e.target.value } })}>{FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}</select></Field>
                <Field label={t('brands.bodyFont')}><select className="field" value={edit.fonts.body} onChange={(e) => setEdit({ ...edit, fonts: { ...edit.fonts, body: e.target.value } })}>{FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}</select></Field>
              </div>
              <Field label={t('brands.logo')}>
                <div className="flex items-center gap-3">
                  {edit.logoAssetId && <img src={assetUrl(edit.logoAssetId)} alt="" className="h-12 w-12 rounded-lg bg-panel-3 object-contain" />}
                  <label className="btn btn-ghost btn-sm">{busy === 'logo' ? <Spinner /> : '⇪'} {t('common.upload')}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} /></label>
                  {edit.logoAssetId && <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...edit, logoAssetId: null })}>{t('common.delete')}</button>}
                </div>
              </Field>
              <Field label={t('brands.voice')}><textarea className="field h-20" value={edit.voice ?? ''} onChange={(e) => setEdit({ ...edit, voice: e.target.value })} placeholder="Confident, warm, no jargon…" /></Field>
              <div>
                <span className="label">{t('brands.languages')}</span>
                <div className="flex flex-wrap gap-2">{LOCALES.map((l) => (
                  <label key={l} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={edit.preferredLanguages.includes(l)} onChange={(e) => setEdit({ ...edit, preferredLanguages: e.target.checked ? [...edit.preferredLanguages, l] : edit.preferredLanguages.filter((x) => x !== l) })} />{LOCALE_NAMES[l]}</label>
                ))}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {['instagram', 'tiktok', 'youtube', 'facebook', 'website'].map((k) => (
                  <Field key={k} label={k}><input className="field" dir="ltr" value={edit.socialAccounts[k] ?? ''} onChange={(e) => setEdit({ ...edit, socialAccounts: { ...edit.socialAccounts, [k]: e.target.value } })} /></Field>
                ))}
              </div>
              <Field label={t('brands.guidelines')}><textarea className="field h-24" value={edit.guidelines ?? ''} onChange={(e) => setEdit({ ...edit, guidelines: e.target.value })} /></Field>
            </div>
            <div className="space-y-2"><span className="label">{t('common.preview')}</span><BrandPreview b={edit} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
