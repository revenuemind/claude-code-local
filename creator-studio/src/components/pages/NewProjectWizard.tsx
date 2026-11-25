'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Aspect, Platform, TemplateDefinition } from '@/lib/templates/types';
import type { BrandKit } from '@/lib/brand/types';
import type { ProductionMode } from '@/lib/planning/types';
import { PROJECT_TYPES } from '@/lib/projects/types';
import { STYLES } from '@/lib/templates/styles';
import { draftPlan, buildComposition } from '@/lib/templates/engine';
import { CONTENT_LANGUAGE_NAMES } from '@/lib/i18n/config';
import { useI18n } from '../I18nProvider';
import { Field, PageHeader, cx, useAction, Spinner } from '../ui';
import { Player, usePlayback, TransportBar } from '../Player';
import { localized } from '../templates/TemplateLibrary';
import { apiFetch } from '@/lib/client/api';
import { useEngines, usableProviders } from '@/lib/client/useEngines';
import { sampleFor } from '@/lib/templates/samples';

const PLATFORMS: Platform[] = ['youtube', 'shorts', 'tiktok', 'instagram', 'facebook'];
const PLATFORM_LABEL: Record<Platform, string> = { youtube: 'YouTube', shorts: 'Shorts', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' };

function typeFor(t: TemplateDefinition): (typeof PROJECT_TYPES)[number] {
  if (t.category === 'longform') return t.id.includes('documentary') ? 'documentary' : 'youtube-long';
  if (t.category === 'marketing') return t.id.includes('product') || t.id.includes('sale') ? 'product-ad' : 'promo';
  if (t.category === 'faceless') return 'faceless';
  if (t.category === 'influencer') return 'influencer';
  return 'short';
}

export function NewProjectWizard({ templates, brands, initialTemplateId }: { templates: TemplateDefinition[]; brands: Array<{ id: string; kit: BrandKit; languages: string[] }>; initialTemplateId: string | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { busy, run } = useAction();
  const [step, setStep] = useState(initialTemplateId ? 1 : 0);
  const [tpl, setTpl] = useState<TemplateDefinition | null>(templates.find((x) => x.id === initialTemplateId) ?? null);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof PROJECT_TYPES)[number]>(tpl ? typeFor(tpl) : 'short');
  const [description, setDescription] = useState('');
  const [references, setReferences] = useState('');
  const [urls, setUrls] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(tpl?.platforms.slice(0, 2) ?? []);
  const [language, setLanguage] = useState<string>(['he', 'ru', 'ar', 'am'].includes(locale) ? locale : 'en');
  const [aspect, setAspect] = useState<Aspect>(tpl?.defaultAspect ?? '9:16');
  const [duration, setDuration] = useState(tpl?.duration.default ?? 30);
  const [style, setStyle] = useState<string>('');
  const [audience, setAudience] = useState('');
  const [objective, setObjective] = useState('');
  const [brandId, setBrandId] = useState('');
  const [mode, setMode] = useState<ProductionMode>(tpl?.recommendedMode ?? 'code');
  const [voiceover, setVoiceover] = useState(tpl ? tpl.requirements.voiceover === 'required' || tpl.requirements.voiceover === 'recommended' : false);
  const [captions, setCaptions] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const engines = useEngines();
  // AI or Hybrid only make sense when an image or video engine with a key is connected.
  const hasAiMedia = engines.data ? ['image', 'video'].some((c) => usableProviders(engines.data, c).some((p) => p.status !== 'builtin')) : null;
  const modeFor = (x: TemplateDefinition): ProductionMode => {
    if (hasAiMedia === false && x.modes.includes('code')) return 'code';
    return x.modes.includes(x.recommendedMode) ? x.recommendedMode : x.modes[0];
  };
  const [modeTouched, setModeTouched] = useState(false);
  useEffect(() => { if (tpl && !modeTouched && hasAiMedia !== null) setMode(modeFor(tpl)); }, [hasAiMedia, tpl]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (x: TemplateDefinition) => {
    setTpl(x); setAspect(x.defaultAspect); setDuration(x.duration.default); setMode(modeFor(x)); setModeTouched(false);
    setVoiceover(x.requirements.voiceover === 'required' || x.requirements.voiceover === 'recommended'); setType(typeFor(x)); setPlatforms(x.platforms.slice(0, 2)); setInputs({});
    setStep(1);
  };
  const fillExample = () => {
    if (!tpl) return;
    setInputs(Object.fromEntries(Object.entries(sampleFor(tpl, language).sample).map(([k, v]) => [k, Array.isArray(v) ? v.join('\n') : String(v)])));
    if (!name) setName(localized(tpl.name, locale));
  };
  const toInputs = () => Object.fromEntries(tpl!.fields.map((f) => [f.key, f.type === 'list' ? (inputs[f.key] ?? '').split('\n').map((s) => s.trim()).filter(Boolean) : (inputs[f.key] ?? '')]));
  const brand = brands.find((b) => b.id === brandId)?.kit ?? null;

  const preview = useMemo(() => {
    if (!tpl || step < 2) return null;
    try {
      const filled = Object.values(inputs).some((v) => v.trim()) ? toInputs() : sampleFor(tpl, language).sample;
      const plan = draftPlan(tpl, filled, { language, durationSec: duration, mode, voiceover: false, captions: false });
      return buildComposition(plan, tpl, { aspect, brand, styleId: style || null });
    } catch { return null; }
  }, [tpl, step, inputs, language, duration, mode, aspect, brand, style]); // eslint-disable-line react-hooks/exhaustive-deps
  const pb = usePlayback(preview, { loop: true });
  const previewKey = preview ? `${preview.width}x${preview.height}:${preview.durationMs}` : '';
  useEffect(() => { if (preview) pb.play(); }, [previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = tpl ? tpl.fields.filter((f) => f.required && !(inputs[f.key] ?? '').trim()) : [];
  const create = () => run('create', async () => {
    const r = await apiFetch<{ project: { id: string } }>('/api/projects', {
      body: {
        name: name || localized(tpl!.name, locale), type, description: description || undefined, templateId: tpl!.id, brandId: brandId || null, productionMode: mode, inputs: toInputs(),
        settings: { language, aspect, durationSec: duration, style: style || null, audience: audience || undefined, objective: objective || undefined, platforms, referenceNotes: references || undefined, sourceUrls: urls.split('\n').map((s) => s.trim()).filter(Boolean), voiceover, captions: voiceover ? captions : false },
      },
    });
    router.push(`/projects/${r.project.id}?stage=plan`);
  });

  const steps = [t('wizard.template'), t('wizard.step1'), t('wizard.step2'), t('wizard.step3')];

  return (
    <div>
      <PageHeader title={t('wizard.title')} subtitle={tpl ? `${t('wizard.template')}: ${localized(tpl.name, locale)}` : undefined} />
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s}><button disabled={i > 0 && !tpl} onClick={() => setStep(i)} className={cx('badge !px-3 !py-1 text-xs', i === step ? 'badge-accent' : '')}>{i + 1}. {s}</button></li>
        ))}
      </ol>

      {step === 0 && (
        <div>
          <input className="field mb-4 max-w-md" placeholder={t('templates.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.filter((x) => !q || `${x.name.en} ${localized(x.name, locale)} ${x.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())).map((x) => (
              <button key={x.id} onClick={() => choose(x)} className="card card-hover p-4 text-start" data-testid={`choose-${x.id}`}>
                <div className="text-xs text-accent-2">{t(`templates.categories.${x.category}`)}</div>
                <div className="font-display font-semibold">{localized(x.name, locale)}</div>
                <div className="mt-1 line-clamp-2 text-xs text-mute">{localized(x.description, locale)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && tpl && (
        <div className="card max-w-3xl space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('wizard.projectName')}><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={localized(tpl.name, locale)} data-testid="project-name" /></Field>
            <Field label={t('wizard.projectType')}>
              <select className="field" value={type} onChange={(e) => setType(e.target.value as typeof type)}>{PROJECT_TYPES.map((p) => <option key={p} value={p}>{t(`projects.types.${p}`)}</option>)}</select>
            </Field>
          </div>
          <Field label={t('wizard.description')}><textarea className="field h-20" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label={t('wizard.references')}><textarea className="field h-24" value={references} onChange={(e) => setReferences(e.target.value)} /></Field>
          <Field label={t('wizard.sourceUrls')}><textarea className="field h-16" dir="ltr" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://" /></Field>
          <div>
            <span className="label">{t('wizard.platforms')}</span>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button key={p} type="button" onClick={() => setPlatforms(platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p])} className={cx('btn btn-sm', platforms.includes(p) ? 'btn-primary' : 'btn-ghost')}>{PLATFORM_LABEL[p]}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setStep(0)}>{t('wizard.changeTemplate')}</button><button className="btn btn-primary" onClick={() => setStep(2)}>{t('common.next')}</button></div>
        </div>
      )}

      {step >= 2 && tpl && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="card space-y-5 p-6">
            {step === 2 && (<>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('wizard.contentLanguage')} hint={t('wizard.contentLanguageHint')}>
                  <select className="field" value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="content-language">
                    {Object.entries(CONTENT_LANGUAGE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label={t('wizard.aspect')}>
                  <div className="flex flex-wrap gap-2">{tpl.aspects.map((a) => <button key={a} type="button" onClick={() => setAspect(a)} className={cx('btn btn-sm', a === aspect ? 'btn-primary' : 'btn-ghost')}>{a}</button>)}</div>
                </Field>
                <Field label={`${t('wizard.duration')}: ${duration}s`}>
                  <input type="range" min={tpl.duration.min} max={tpl.duration.max} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
                </Field>
                <Field label={t('wizard.style')}>
                  <select className="field" value={style} onChange={(e) => setStyle(e.target.value)}>
                    <option value="">{t('wizard.styleDefault')} ({STYLES[tpl.style]?.name})</option>
                    {Object.values(STYLES).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label={t('wizard.audience')}><input className="field" value={audience} onChange={(e) => setAudience(e.target.value)} /></Field>
                <Field label={t('wizard.objective')}><input className="field" value={objective} onChange={(e) => setObjective(e.target.value)} /></Field>
                <Field label={t('wizard.brand')}>
                  <select className="field" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                    <option value="">{t('wizard.noBrand')}</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.kit.name}</option>)}
                  </select>
                </Field>
              </div>
              <div>
                <span className="label">{t('wizard.mode')}</span>
                <div className="grid gap-3 md:grid-cols-3">
                  {(['code', 'ai', 'hybrid'] as ProductionMode[]).map((m) => (
                    <button key={m} type="button" disabled={!tpl.modes.includes(m)} onClick={() => { setMode(m); setModeTouched(true); }} className={cx('card p-4 text-start transition', m === mode ? 'border-accent ring-2 ring-accent/30' : 'hover:border-line-2', !tpl.modes.includes(m) && 'opacity-40')}>
                      <div className="font-display font-semibold">{t(`wizard.modes.${m}`)} {m === tpl.recommendedMode && <span className="badge badge-accent ms-1">{t('templates.recommended')}</span>}</div>
                      <div className="mt-1 text-xs text-mute">{t(`wizard.modeHelp.${m}`)}</div>
                    </button>
                  ))}
                </div>
                {hasAiMedia === false && mode === 'code' && <p className="mt-2 text-xs text-mute" data-testid="no-ai-engines">{t('wizard.noAiEngines')}</p>}
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={voiceover} onChange={(e) => setVoiceover(e.target.checked)} /> {t('wizard.voiceover')}</label>
                <label className={cx('flex items-center gap-2 text-sm', !voiceover && 'opacity-50')}><input type="checkbox" disabled={!voiceover} checked={voiceover && captions} onChange={(e) => setCaptions(e.target.checked)} /> {t('wizard.captions')}</label>
              </div>
              <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setStep(1)}>{t('common.back')}</button><button className="btn btn-primary" onClick={() => setStep(3)}>{t('common.next')}</button></div>
            </>)}
            {step === 3 && (<>
              <div className="flex items-center justify-between">
                <p className="text-sm text-mute">{t('templates.fields')}</p>
                <button className="btn btn-ghost btn-sm" onClick={fillExample} data-testid="fill-example">✦ {t('wizard.example')}</button>
              </div>
              {!sampleFor(tpl, language).localized && <p className="text-xs text-warn" data-testid="example-english-only">{t('wizard.exampleEnglishOnly', { lang: CONTENT_LANGUAGE_NAMES[language as keyof typeof CONTENT_LANGUAGE_NAMES] ?? language })}</p>}
              {tpl.fields.map((f) => (
                <Field key={f.key} label={<>{localized(f.label, locale)} {f.required && <span className="text-bad">*</span>}</>}>
                  {f.type === 'list' || f.type === 'textarea'
                    ? <textarea className="field h-28" value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} placeholder={f.placeholder} />
                    : <input className="field" value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} placeholder={f.placeholder} />}
                </Field>
              ))}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {missing.length > 0 && <span className="text-xs text-warn">{missing.map((f) => localized(f.label, locale)).join(', ')} — {t('common.required')}</span>}
                <button className="btn btn-ghost" onClick={() => setStep(2)}>{t('common.back')}</button>
                <button className="btn btn-primary" disabled={!!busy || missing.length > 0} onClick={create} data-testid="create-project">{busy && <Spinner />}{t('wizard.createAndPlan')}</button>
              </div>
            </>)}
          </div>
          <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
            <div className="checker flex h-[560px] items-center justify-center rounded-2xl p-3">
              {preview && <Player comp={preview} time={pb.time} playing={pb.playing} maxHeight="100%" />}
            </div>
            {preview && <TransportBar pb={pb} duration={preview.durationMs} />}
          </aside>
        </div>
      )}
    </div>
  );
}
