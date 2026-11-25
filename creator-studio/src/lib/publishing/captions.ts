/** Platform-aware caption, title and hashtag generation (offline; an LLM can refine via the planner engine). */
import type { ProductionPlan } from '../planning/types';

export type PublishPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'blotato' | 'manual';

export const PLATFORM_LIMITS: Record<PublishPlatform, { title: number; caption: number; hashtags: number }> = {
  youtube: { title: 100, caption: 5000, hashtags: 15 },
  tiktok: { title: 0, caption: 2200, hashtags: 8 },
  instagram: { title: 0, caption: 2200, hashtags: 30 },
  facebook: { title: 255, caption: 5000, hashtags: 5 },
  blotato: { title: 0, caption: 2200, hashtags: 10 },
  manual: { title: 200, caption: 5000, hashtags: 20 },
};

const STOP = new Set(('the a an and or of to in on for with your you is are this that it how what why when from at by be as not no do does did our we my me i ' +
  'של את על עם זה זו הוא היא אני אתם לא כן מה איך למה ' + 'и в на с что это как не по к из за для о от ' + 'في من على إلى عن هذا هذه ما كيف لماذا مع أن لا').split(/\s+/));

export function extractHashtags(texts: string[], baseTags: string[], max: number): string[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const raw of t.replace(/\*/g, '').split(/[\s,.!?;:()"“”«»—–\-/]+/)) {
      const w = raw.trim().toLocaleLowerCase();
      if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const words = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const tags = [...baseTags.map((t) => t.replace(/\s+/g, '')), ...words].map((t) => t.replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean);
  return [...new Set(tags)].slice(0, max).map((t) => `#${t}`);
}

export function generateCaption(plan: ProductionPlan, platform: PublishPlatform, opts: { templateTags?: string[]; handle?: string | null; cta?: string } = {}) {
  const lim = PLATFORM_LIMITS[platform];
  const texts = [plan.title, plan.hook, ...plan.scenes.map((s) => s.headline)];
  const hashtags = extractHashtags(texts, opts.templateTags ?? [], lim.hashtags);
  const clean = (s: string) => s.replace(/\*/g, '').trim();
  const beats = plan.scenes.filter((s) => s.role !== 'cta' && s.role !== 'hook').slice(0, platform === 'youtube' ? 12 : 3).map((s) => clean(s.headline)).filter(Boolean);
  const cta = clean(opts.cta ?? plan.scenes.find((s) => s.role === 'cta')?.headline ?? '');
  let caption: string;
  if (platform === 'youtube') {
    const chapters = chaptersFromPlan(plan);
    caption = [clean(plan.hook), '', ...beats.map((b) => `• ${b}`), '', chapters.length > 2 ? chapters.join('\n') : '', cta, opts.handle ?? '', '', hashtags.slice(0, 3).join(' ')]
      .filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').trim();
  } else {
    caption = [clean(plan.hook), beats.length ? beats.map((b) => `✔ ${b}`).join('\n') : '', cta, '', hashtags.join(' ')].filter(Boolean).join('\n\n');
  }
  const title = lim.title ? clean(plan.title || plan.hook).slice(0, lim.title) : '';
  return { title, caption: caption.slice(0, lim.caption), hashtags };
}

/** YouTube chapter markers (first must be 0:00, each ≥ 10s). */
export function chaptersFromPlan(plan: ProductionPlan): string[] {
  const out: string[] = [];
  let t = 0; let last = -Infinity;
  for (const s of plan.scenes) {
    if ((s.role === 'chapter' || s.role === 'title' || s.role === 'hook' || s.role === 'section' || s.role === 'act') && t - last >= 10) {
      const m = Math.floor(t / 60); const sec = Math.floor(t % 60);
      out.push(`${m}:${String(sec).padStart(2, '0')} ${s.headline.replace(/\*/g, '')}`);
      last = t;
    }
    t += s.durationSec;
  }
  return out.length && out[0].startsWith('0:00') ? out : [];
}
