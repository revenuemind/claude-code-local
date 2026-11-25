import { describe, expect, it } from 'vitest';
import { TEMPLATES, TEMPLATE_CATEGORIES } from '../src/lib/templates/library';
import { templateSchema } from '../src/lib/templates/schema';
import { draftPlan, buildComposition, interpolate, normalizeItems, estimateWordTimings, resolveStyle } from '../src/lib/templates/engine';
import { compositionSchema } from '../src/lib/composition/schema';
import { planSchema } from '../src/lib/planning/schema';
import { renderStill } from '../src/lib/render/node';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Aspect } from '../src/lib/templates/types';

describe('template library', () => {
  it('has 50 unique templates, 10 per category', () => {
    expect(TEMPLATES.length).toBe(50);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(50);
    for (const c of TEMPLATE_CATEGORIES) expect(TEMPLATES.filter((t) => t.category === c).length, c).toBe(10);
  });

  it('every template validates against the template schema', () => {
    for (const t of TEMPLATES) {
      const r = templateSchema.safeParse(t);
      expect(r.success, `${t.id}: ${r.success ? '' : JSON.stringify(r.error.issues.slice(0, 2))}`).toBe(true);
    }
  });

  it('every template builds a valid plan and composition for every supported aspect and mode', () => {
    for (const t of TEMPLATES) {
      for (const mode of t.modes) {
        const plan = draftPlan(t, t.sample, { language: 'en', mode, voiceover: true });
        expect(planSchema.safeParse(plan).success, `${t.id} plan`).toBe(true);
        expect(plan.scenes.length, t.id).toBeGreaterThan(0);
        expect(plan.targetDurationSec).toBeLessThanOrEqual(t.duration.max + 0.5);
        for (const a of t.aspects) {
          const comp = buildComposition(plan, t, { aspect: a as Aspect });
          const r = compositionSchema.safeParse(comp);
          expect(r.success, `${t.id} ${mode} ${a}: ${r.success ? '' : JSON.stringify(r.error.issues.slice(0, 2))}`).toBe(true);
          expect(comp.durationMs).toBeGreaterThan(1000);
        }
      }
    }
  });

  it('builds RTL compositions with language-appropriate fonts', () => {
    const t = TEMPLATES.find((x) => x.id === 'myth-vs-reality')!;
    const plan = draftPlan(t, { topic: 'מיתוסים', items: ['א — ב'] }, { language: 'he', mode: 'code' });
    const comp = buildComposition(plan, t, { aspect: '9:16' });
    expect(comp.meta?.direction).toBe('rtl');
    const style = resolveStyle(t, null, 'he');
    expect(['Rubik', 'Heebo']).toContain(style.headingFont);
    expect(resolveStyle(t, null, 'am').headingFont).toBe('Noto Sans Ethiopic');
    expect(resolveStyle(t, null, 'ar').bodyFont).toBe('Cairo');
    expect(plan.scenes[0].body).toContain('מיתוס'); // localized phrase, not English
  });

  it('interpolation, list parsing and word timing', () => {
    expect(interpolate('{{t:follow}} {{name|t:host}}', {}, 'ru')).toBe('Подписывайтесь Ведущий');
    expect(interpolate('{{item.title}} #{{n}}', { item: { title: 'A' }, n: 2 }, 'en')).toBe('A #2');
    expect(normalizeItems('Title — body\nOther: more\nPlain')).toEqual([{ title: 'Title', body: 'body' }, { title: 'Other', body: 'more' }, { title: 'Plain' }]);
    const w = estimateWordTimings('one two three.', 3000, 100);
    expect(w).toHaveLength(3);
    expect(w[0].start).toBe(100);
    expect(w[2].end).toBeCloseTo(3100, -1);
  });

  it('applies brand colors and logo', () => {
    const t = TEMPLATES[0];
    const plan = draftPlan(t, t.sample, { language: 'en', mode: 'code' });
    const comp = buildComposition(plan, t, { aspect: '9:16', brand: { name: 'X', colors: { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff', background: '#101010', text: '#fafafa' }, fonts: { heading: 'Oswald', body: 'Inter' }, logoAssetId: 'logo1' } });
    expect(comp.background).toBe('#101010');
    expect(comp.tracks.find((x) => x.role === 'brand')!.clips[0]).toMatchObject({ type: 'image', media: { assetId: 'logo1' } });
  });

  it('renders a non-blank frame for every template', async () => {
    for (const t of TEMPLATES) {
      const plan = draftPlan(t, t.sample, { language: 'en', mode: 'code', voiceover: false });
      const comp = buildComposition(plan, t, { aspect: t.defaultAspect });
      const bg = comp.tracks[0].clips[0];
      const png = await renderStill(comp, bg.start + bg.duration * 0.7, { width: 108, height: Math.round(108 * comp.height / comp.width) });
      const img = await loadImage(png);
      const c = createCanvas(img.width, img.height); const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let bright = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 600) bright++;
      expect(bright, `${t.id} has visible text`).toBeGreaterThan(5);
    }
  });
});
