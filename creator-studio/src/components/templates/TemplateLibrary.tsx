'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Aspect, TemplateDefinition, TemplateCategory, LocalizedText } from '@/lib/templates/types';
import { templatePreview, posterTime } from '@/lib/templates/preview';
import { Player, usePlayback, TransportBar } from '../Player';
import { useI18n } from '../I18nProvider';
import { Empty, Modal, PageHeader, Tabs, cx, useAction, Field } from '../ui';
import { apiFetch } from '@/lib/client/api';

const CATS: Array<'all' | TemplateCategory> = ['all', 'social', 'marketing', 'longform', 'faceless', 'influencer'];

export function localized(l: LocalizedText, locale: string): string {
  return (l as Record<string, string | undefined>)[locale] || l.en;
}

const TemplateCard = memo(function TemplateCard({ t, onOpen }: { t: TemplateDefinition; onOpen: () => void }) {
  const { locale, t: tr } = useI18n();
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const comp = useMemo(() => (visible ? templatePreview(t, '9:16' as Aspect) : null), [visible, t]);
  const pb = usePlayback(comp, { loop: true, initialTime: comp ? posterTime(comp) : 0 });
  useEffect(() => { if (comp && !hover) pb.setTime(posterTime(comp)); }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (hover) pb.play(); else pb.pause(); }, [hover]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button ref={ref} onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      className="card card-hover group flex flex-col overflow-hidden text-start" data-testid={`template-card-${t.id}`}>
      <div className="checker relative aspect-[9/16] w-full overflow-hidden">
        {comp ? <Player comp={comp} time={pb.time} playing={pb.playing} rounded={false} /> : null}
        <div className="absolute start-2 top-2 flex gap-1">
          {t.custom && <span className="badge badge-accent">{t.custom.status === 'draft' ? tr('templates.draft') : tr('templates.custom')}</span>}
        </div>
        <div className="absolute bottom-2 end-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">{t.duration.default}s</div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="font-display text-sm font-semibold leading-tight">{localized(t.name, locale)}</div>
        <div className="line-clamp-2 text-xs text-mute">{localized(t.description, locale)}</div>
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {t.aspects.slice(0, 3).map((a) => <span key={a} className="badge">{a}</span>)}
          <span className="badge">{tr(`wizard.modes.${t.recommendedMode}`)}</span>
        </div>
      </div>
    </button>
  );
});

export function TemplateDetail({ t, onClose, onChanged }: { t: TemplateDefinition; onClose: () => void; onChanged: () => void }) {
  const { locale, t: tr } = useI18n();
  const router = useRouter();
  const { busy, run } = useAction();
  const [aspect, setAspect] = useState<Aspect>(t.defaultAspect);
  const comp = useMemo(() => templatePreview(t, aspect), [t, aspect]);
  const pb = usePlayback(comp, { loop: true, audio: true });
  useEffect(() => { pb.setTime(0); pb.play(); }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const duplicate = () => run('dup', async () => {
    const r = await apiFetch<{ template: TemplateDefinition }>(`/api/templates/${t.id}/duplicate`, { body: {} });
    router.push(`/templates/${r.template.id}/edit`);
  });
  const remove = () => run('del', async () => { if (!confirm(tr('common.areYouSure'))) return; await apiFetch(`/api/templates/${t.id}`, { method: 'DELETE' }); onChanged(); onClose(); });
  const req = t.requirements;
  const reqRows: Array<[string, string | undefined]> = [
    [tr('templates.voiceover'), req.voiceover], [tr('templates.aiImages'), req.aiImages], [tr('templates.aiVideo'), req.aiVideo], [tr('templates.avatar'), req.avatar], [tr('templates.userMedia'), req.userMedia],
  ];

  return (
    <Modal open onClose={onClose} wide title={localized(t.name, locale)}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-3">
          <div className="checker flex h-[min(62vh,640px)] items-center justify-center rounded-2xl p-3">
            <Player comp={comp} time={pb.time} playing={pb.playing} maxHeight="100%" />
          </div>
          <TransportBar pb={pb} duration={comp.durationMs} />
          <div className="flex flex-wrap gap-1.5">
            {t.aspects.map((a) => <button key={a} className={cx('btn btn-sm', a === aspect ? 'btn-primary' : 'btn-ghost')} onClick={() => setAspect(a)}>{a}</button>)}
          </div>
        </div>
        <div className="space-y-5 text-sm">
          <p className="text-ink-2">{localized(t.description, locale)}</p>
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary" href={`/projects/new?template=${encodeURIComponent(t.id)}`}>{tr('templates.useTemplate')}</Link>
            <button className="btn btn-ghost" onClick={duplicate} disabled={!!busy}>{tr('common.duplicate')}</button>
            {t.custom && <Link className="btn btn-ghost" href={`/templates/${t.id}/edit`}>{tr('common.edit')}</Link>}
            <a className="btn btn-ghost" href={`/api/templates/${t.id}/export`}>{tr('templates.exportJson')}</a>
            {t.custom && <button className="btn btn-danger" onClick={remove} disabled={!!busy}>{tr('common.delete')}</button>}
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <div className="card p-3"><dt className="text-xs text-mute">{tr('templates.duration')}</dt><dd className="font-semibold">{t.duration.min}–{t.duration.max}s</dd></div>
            <div className="card p-3"><dt className="text-xs text-mute">{tr('templates.modes')}</dt><dd className="font-semibold">{t.modes.map((m) => tr(`wizard.modes.${m}`)).join(' · ')}</dd></div>
          </dl>
          <div>
            <h3 className="label">{tr('templates.requirements')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {reqRows.filter(([, v]) => v && v !== 'none').map(([k, v]) => <span key={k} className={cx('badge', v === 'required' ? 'badge-warn' : v === 'recommended' ? 'badge-accent' : '')}>{k}: {tr(`templates.req.${v}`)}</span>)}
            </div>
          </div>
          <div>
            <h3 className="label">{tr('templates.fields')}</h3>
            <div className="flex flex-wrap gap-1.5">{t.fields.map((f) => <span key={f.key} className="badge">{localized(f.label, locale)}{f.required ? ' *' : ''}</span>)}</div>
          </div>
          <div>
            <h3 className="label">{tr('templates.scenes')}</h3>
            <ol className="space-y-1.5">
              {t.scenes.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-panel-3 font-mono text-[10px]">{i + 1}</span>
                  <span className="font-semibold">{tr(`layouts.${s.layout}`)}</span>
                  <span className="text-mute">· {s.role}{s.repeat ? ` ×${s.repeat.min}–${s.repeat.max}` : ''}{s.media && s.media !== 'none' ? ` · ${s.media}` : ''}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-mute">{tr('templates.marketplaceSoon')}</p>
        </div>
      </div>
    </Modal>
  );
}

export function TemplateLibrary({ initial }: { initial: TemplateDefinition[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [templates, setTemplates] = useState(initial);
  const [cat, setCat] = useState<'all' | TemplateCategory>('all');
  const [q, setQ] = useState('');
  const [aspect, setAspect] = useState<string>('');
  const [open, setOpen] = useState<TemplateDefinition | null>(null);
  const [importing, setImporting] = useState(false);
  const [json, setJson] = useState('');
  const { busy, run } = useAction();

  const reload = async () => setTemplates((await apiFetch<{ templates: TemplateDefinition[] }>('/api/templates')).templates);
  const filtered = templates.filter((x) =>
    (cat === 'all' || x.category === cat) && (!aspect || x.aspects.includes(aspect as Aspect)) &&
    (!q || `${localized(x.name, locale)} ${x.name.en} ${x.tags.join(' ')} ${localized(x.description, locale)}`.toLowerCase().includes(q.toLowerCase())));

  const doImport = () => run('import', async () => {
    const r = await apiFetch<{ template: TemplateDefinition }>('/api/templates/import', { body: { json } });
    setImporting(false); setJson(''); await reload();
    router.push(`/templates/${r.template.id}/edit`);
  });

  return (
    <div>
      <PageHeader title={t('templates.title')} subtitle={t('templates.subtitle', { count: templates.length })}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setImporting(true)}>{t('templates.importJson')}</button>
          <Link className="btn btn-primary" href="/templates/new">＋ {t('templates.newTemplate')}</Link>
        </>} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={cat} onChange={setCat} items={CATS.map((c) => ({ value: c, label: t(`templates.categories.${c}`) }))} />
        <div className="flex flex-1 gap-2">
          <input className="field" placeholder={t('templates.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
          <select className="field !w-36" value={aspect} onChange={(e) => setAspect(e.target.value)} aria-label={t('templates.aspects')}>
            <option value="">{t('templates.aspects')}</option>
            {['9:16', '16:9', '1:1', '4:5'].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      {filtered.length === 0 ? <Empty title={t('common.empty')} /> : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filtered.map((x) => <TemplateCard key={x.id} t={x} onOpen={() => setOpen(x)} />)}
        </div>
      )}
      {open && <TemplateDetail t={open} onClose={() => setOpen(null)} onChanged={reload} />}
      <Modal open={importing} onClose={() => setImporting(false)} title={t('templates.importJson')}
        footer={<><button className="btn btn-ghost" onClick={() => setImporting(false)}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={!json || !!busy} onClick={doImport}>{t('common.import')}</button></>}>
        <Field label="JSON">
          <input type="file" accept="application/json" className="mb-2 text-xs" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setJson(await f.text()); }} />
          <textarea className="field h-64 font-mono text-xs" dir="ltr" value={json} onChange={(e) => setJson(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
