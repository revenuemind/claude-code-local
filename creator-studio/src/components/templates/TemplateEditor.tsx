'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Aspect, LayoutId, SceneBlueprint, TemplateDefinition, TemplateField } from '@/lib/templates/types';
import type { ProductionMode } from '@/lib/planning/types';
import { STYLES } from '@/lib/templates/styles';
import { LAYOUT_IDS } from '@/lib/templates/layouts';
import { draftPlan, buildComposition } from '@/lib/templates/engine';
import { apiFetch } from '@/lib/client/api';
import { useI18n } from '../I18nProvider';
import { Field, PageHeader, Spinner, Tabs, cx, useAction } from '../ui';
import { Player, usePlayback, TransportBar } from '../Player';

export const BLANK_TEMPLATE: TemplateDefinition = {
  id: 'my-template', version: 1, category: 'social',
  name: { en: 'My template' }, description: { en: 'Describe what this template is for.' }, tags: ['custom'],
  platforms: ['shorts', 'tiktok', 'instagram'], defaultAspect: '9:16', aspects: ['9:16', '1:1', '16:9'],
  duration: { min: 10, max: 60, default: 20 }, modes: ['code', 'ai', 'hybrid'], recommendedMode: 'code',
  requirements: { voiceover: 'optional' }, style: 'neon-pop',
  fields: [
    { key: 'headline', type: 'text', label: { en: 'Headline' }, required: true },
    { key: 'items', type: 'list', label: { en: 'Points (one per line)' }, required: true, maxItems: 5 },
    { key: 'cta', type: 'text', label: { en: 'Call to action' } },
  ],
  scenes: [
    { role: 'hook', layout: 'statement', weight: 1.2, headline: '{{headline}}' },
    { role: 'point', layout: 'list-item', weight: 1, repeat: { field: 'items', min: 1, max: 5 }, label: '{{n}}', headline: '{{item.title}}', body: '{{item.body}}' },
    { role: 'cta', layout: 'cta', weight: 0.9, headline: '{{cta|t:follow}}', label: '{{t:follow}}' },
  ],
  music: { mood: 'uplifting', bpm: 115 }, captions: { enabled: true },
  sample: { headline: 'Your *headline* here', items: ['First point — detail', 'Second point — detail', 'Third point — detail'], cta: 'Follow for more' },
};

const ASPECTS: Aspect[] = ['9:16', '16:9', '1:1', '4:5'];
const MODES: ProductionMode[] = ['code', 'ai', 'hybrid'];

export function TemplateEditor({ initial, templateId }: { initial: TemplateDefinition; templateId: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const { busy, run } = useAction();
  const [def, setDef] = useState<TemplateDefinition>(() => { const { custom: _c, ...rest } = initial; return rest as TemplateDefinition; });
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [sampleText, setSampleText] = useState(JSON.stringify(initial.sample, null, 2));
  const [aspect, setAspect] = useState<Aspect>(initial.defaultAspect);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (mode === 'json') setJson(JSON.stringify(def, null, 2)); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => {
    try {
      const plan = draftPlan(def, def.sample, { language: 'en', mode: 'code', voiceover: false, captions: false });
      return { comp: buildComposition(plan, def, { aspect: def.aspects.includes(aspect) ? aspect : def.defaultAspect }), err: null };
    } catch (e) { return { comp: null, err: (e as Error).message }; }
  }, [def, aspect]);
  const pb = usePlayback(preview.comp, { loop: true });
  useEffect(() => { if (preview.comp) pb.play(); }, [preview.comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (p: Partial<TemplateDefinition>) => setDef({ ...def, ...p });
  const updScene = (i: number, p: Partial<SceneBlueprint>) => upd({ scenes: def.scenes.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const moveScene = (i: number, d: -1 | 1) => { const s = [...def.scenes]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; upd({ scenes: s }); };
  const updField = (i: number, p: Partial<TemplateField>) => upd({ fields: def.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const listFields = def.fields.filter((f) => f.type === 'list').map((f) => f.key);

  const applyJson = () => { try { setDef(JSON.parse(json)); setJsonError(null); } catch (e) { setJsonError((e as Error).message); } };
  const save = (status: 'draft' | 'published') => run(status, async () => {
    setError(null);
    let d = def;
    if (mode === 'json') { try { d = JSON.parse(json); } catch (e) { setError((e as Error).message); return; } }
    try {
      if (templateId) await apiFetch(`/api/templates/${templateId}`, { method: 'PATCH', body: { definition: d, status } });
      else { const r = await apiFetch<{ template: TemplateDefinition }>('/api/templates', { body: { definition: d, status } }); router.replace(`/templates/${r.template.id}/edit`); }
    } catch (e) { setError((e as Error).message); throw e; }
  }, t('common.saved'));

  return (
    <div>
      <PageHeader title={templateId ? t('templates.editTemplate') : t('templates.newTemplate')} subtitle={def.name.en}
        actions={<>
          <Tabs value={mode} onChange={setMode} items={[{ value: 'form', label: t('templateEditor.formMode') }, { value: 'json', label: t('templateEditor.jsonMode') }]} />
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => save('draft')}>{busy === 'draft' && <Spinner />}{t('templateEditor.saveDraft')}</button>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => save('published')} data-testid="template-publish">{busy === 'published' && <Spinner />}{t('templateEditor.publish')}</button>
        </>} />
      {error && <div className="card mb-4 border-bad/40 p-3 text-sm text-bad" dir="ltr">{t('templateEditor.validationFailed')}: {error}</div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          {mode === 'json' ? (
            <div className="card space-y-2 p-4">
              <textarea className="field h-[70vh] font-mono text-xs" dir="ltr" value={json} onChange={(e) => setJson(e.target.value)} onBlur={applyJson} spellCheck={false} />
              {jsonError && <p className="text-xs text-bad">{jsonError}</p>}
            </div>
          ) : (<>
            <section className="card space-y-4 p-5">
              <h2 className="font-display font-semibold">{t('templateEditor.basics')}</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="ID"><input className="field font-mono" dir="ltr" value={def.id} onChange={(e) => upd({ id: e.target.value })} /></Field>
                <Field label={`${t('common.name')} (EN)`}><input className="field" value={def.name.en} onChange={(e) => upd({ name: { ...def.name, en: e.target.value } })} /></Field>
                <Field label={t('templates.categories.all')}><select className="field" value={def.category} onChange={(e) => upd({ category: e.target.value as TemplateDefinition['category'] })}>{(['social', 'marketing', 'longform', 'faceless', 'influencer'] as const).map((c) => <option key={c} value={c}>{t(`templates.categories.${c}`)}</option>)}</select></Field>
                {(['he', 'ru', 'ar', 'am'] as const).map((l) => <Field key={l} label={`${t('common.name')} (${l.toUpperCase()})`}><input className="field" dir="auto" value={def.name[l] ?? ''} onChange={(e) => upd({ name: { ...def.name, [l]: e.target.value || undefined } })} /></Field>)}
              </div>
              <Field label={`${t('common.description')} (EN)`}><textarea className="field h-16" value={def.description.en} onChange={(e) => upd({ description: { ...def.description, en: e.target.value } })} /></Field>
              <div className="grid gap-3 md:grid-cols-4">
                <Field label={t('templateEditor.style')}><select className="field" value={def.style} onChange={(e) => upd({ style: e.target.value })}>{Object.values(STYLES).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                <Field label="min s"><input type="number" className="field" value={def.duration.min} onChange={(e) => upd({ duration: { ...def.duration, min: Number(e.target.value) } })} /></Field>
                <Field label="default s"><input type="number" className="field" value={def.duration.default} onChange={(e) => upd({ duration: { ...def.duration, default: Number(e.target.value) } })} /></Field>
                <Field label="max s"><input type="number" className="field" value={def.duration.max} onChange={(e) => upd({ duration: { ...def.duration, max: Number(e.target.value) } })} /></Field>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex flex-wrap items-center gap-3"><span className="label !mb-0">{t('templates.aspects')}</span>{ASPECTS.map((a) => <label key={a} className="flex items-center gap-1"><input type="checkbox" checked={def.aspects.includes(a)} onChange={(e) => { const aspects = e.target.checked ? [...def.aspects, a] : def.aspects.filter((x) => x !== a); upd({ aspects, defaultAspect: aspects.includes(def.defaultAspect) ? def.defaultAspect : aspects[0] }); }} />{a}</label>)}</div>
                <div className="flex flex-wrap items-center gap-3"><span className="label !mb-0">{t('templates.modes')}</span>{MODES.map((m) => <label key={m} className="flex items-center gap-1"><input type="checkbox" checked={def.modes.includes(m)} onChange={(e) => { const modes = e.target.checked ? [...def.modes, m] : def.modes.filter((x) => x !== m); upd({ modes, recommendedMode: modes.includes(def.recommendedMode) ? def.recommendedMode : modes[0] }); }} />{t(`wizard.modes.${m}`)}</label>)}</div>
                <label className="flex items-center gap-2">{t('templates.voiceover')}<select className="field !w-auto !py-1" value={def.requirements.voiceover} onChange={(e) => upd({ requirements: { ...def.requirements, voiceover: e.target.value as 'none' } })}>{(['none', 'optional', 'recommended', 'required'] as const).map((v) => <option key={v} value={v}>{t(`templates.req.${v}`)}</option>)}</select></label>
                <label className="flex items-center gap-2">♪<select className="field !w-auto !py-1" value={def.music.mood} onChange={(e) => upd({ music: { ...def.music, mood: e.target.value as TemplateDefinition['music']['mood'] } })}>{['uplifting', 'calm', 'dramatic', 'energetic', 'luxury', 'dark', 'playful', 'inspiring', 'corporate', 'cinematic'].map((m) => <option key={m}>{m}</option>)}</select></label>
              </div>
            </section>

            <section className="card space-y-3 p-5">
              <div className="flex items-center justify-between"><h2 className="font-display font-semibold">{t('templateEditor.inputs')}</h2>
                <button className="btn btn-soft btn-sm" onClick={() => upd({ fields: [...def.fields, { key: `field${def.fields.length + 1}`, type: 'text', label: { en: 'New field' } }] })}>＋ {t('templateEditor.addField')}</button></div>
              {def.fields.map((f, i) => (
                <div key={i} className="grid items-end gap-2 md:grid-cols-[1fr_1fr_2fr_auto_auto]">
                  <Field label={t('templateEditor.fieldKey')}><input className="field font-mono !py-1.5" dir="ltr" value={f.key} onChange={(e) => updField(i, { key: e.target.value })} /></Field>
                  <Field label={t('templateEditor.fieldType')}><select className="field !py-1.5" value={f.type} onChange={(e) => updField(i, { type: e.target.value as TemplateField['type'] })}>{['text', 'textarea', 'list', 'number', 'url'].map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label={t('templateEditor.fieldLabel')}><input className="field !py-1.5" value={f.label.en} onChange={(e) => updField(i, { label: { ...f.label, en: e.target.value } })} /></Field>
                  <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" checked={!!f.required} onChange={(e) => updField(i, { required: e.target.checked })} />{t('common.required')}</label>
                  <button className="btn btn-ghost btn-sm mb-1" onClick={() => upd({ fields: def.fields.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
            </section>

            <section className="card space-y-3 p-5">
              <div className="flex items-center justify-between"><h2 className="font-display font-semibold">{t('templateEditor.structure')}</h2>
                <button className="btn btn-soft btn-sm" onClick={() => upd({ scenes: [...def.scenes, { role: 'scene', layout: 'title', weight: 1, headline: '' }] })} data-testid="add-scene">＋ {t('templateEditor.addScene')}</button></div>
              <p className="text-xs text-mute">{t('templateEditor.placeholdersHelp')}</p>
              {def.scenes.map((s, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-panel-3 font-mono text-xs">{i + 1}</span>
                    <Field label={t('templateEditor.layout')}><select className="field !py-1.5" value={s.layout} onChange={(e) => updScene(i, { layout: e.target.value as LayoutId })}>{LAYOUT_IDS.map((l) => <option key={l} value={l}>{t(`layouts.${l}`)}</option>)}</select></Field>
                    <Field label="Role"><input className="field !w-28 !py-1.5" value={s.role} onChange={(e) => updScene(i, { role: e.target.value })} /></Field>
                    <Field label={t('templateEditor.weight')}><input type="number" step={0.1} className="field !w-20 !py-1.5" value={s.weight} onChange={(e) => updScene(i, { weight: Number(e.target.value) })} /></Field>
                    <Field label={t('templateEditor.repeatFor')}><select className="field !py-1.5" value={s.repeat?.field ?? ''} onChange={(e) => updScene(i, { repeat: e.target.value ? { field: e.target.value, min: 1, max: 10 } : undefined })}><option value="">—</option>{listFields.map((k) => <option key={k}>{k}</option>)}</select></Field>
                    <Field label={t('templateEditor.media')}><select className="field !py-1.5" value={s.media ?? 'none'} onChange={(e) => updScene(i, { media: e.target.value as SceneBlueprint['media'] })}>{['none', 'image', 'video', 'avatar'].map((m) => <option key={m}>{m}</option>)}</select></Field>
                    <div className="ms-auto flex gap-1">
                      <button className="btn btn-ghost btn-sm" onClick={() => moveScene(i, -1)} title={t('templateEditor.moveUp')}>↑</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => moveScene(i, 1)} title={t('templateEditor.moveDown')}>↓</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => upd({ scenes: def.scenes.filter((_, j) => j !== i) })} title={t('templateEditor.remove')}>✕</button>
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(['headline', 'body', 'kicker', 'label', 'narration', 'visualPrompt'] as const).map((k) => (
                      <Field key={k} label={t(`templateEditor.${k}`)}><input className={cx('field !py-1.5 font-mono text-xs')} dir="ltr" value={s[k] ?? ''} onChange={(e) => updScene(i, { [k]: e.target.value || undefined })} /></Field>
                    ))}
                  </div>
                  <Field label="extra (JSON: statValue, statSuffix, leftTitle, rightTitle, bullets, author…)"><input className="field !py-1.5 font-mono text-xs" dir="ltr" defaultValue={s.extra ? JSON.stringify(s.extra) : ''} onBlur={(e) => { try { updScene(i, { extra: e.target.value ? JSON.parse(e.target.value) : undefined }); } catch { /* ignore invalid */ } }} /></Field>
                </div>
              ))}
            </section>

            <section className="card space-y-2 p-5">
              <h2 className="font-display font-semibold">{t('templateEditor.sample')}</h2>
              <textarea className="field h-40 font-mono text-xs" dir="ltr" value={sampleText} onChange={(e) => { setSampleText(e.target.value); try { upd({ sample: JSON.parse(e.target.value) }); } catch { /* wait for valid JSON */ } }} />
            </section>
          </>)}
        </div>
        <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <div className="flex gap-1.5">{def.aspects.map((a) => <button key={a} className={cx('btn btn-sm', a === aspect ? 'btn-primary' : 'btn-ghost')} onClick={() => setAspect(a)}>{a}</button>)}</div>
          <div className="checker flex h-[560px] items-center justify-center rounded-2xl p-3">
            {preview.comp ? <Player comp={preview.comp} time={pb.time} playing={pb.playing} maxHeight="100%" /> : <p className="p-4 text-xs text-bad" dir="ltr">{preview.err}</p>}
          </div>
          {preview.comp && <TransportBar pb={pb} duration={preview.comp.durationMs} />}
        </aside>
      </div>
    </div>
  );
}
