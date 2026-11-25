/**
 * Renders sample stills and an MP4 for templates, without the web app or DB.
 *   npx tsx scripts/render-sample.ts [templateId] [aspect] [lang] [outDir] [--video]
 */
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES, getBuiltinTemplate } from '../src/lib/templates/library';
import { draftPlan, buildComposition } from '../src/lib/templates/engine';
import { renderStill, exportVideo, toSrt } from '../src/lib/render/node';
import type { Aspect } from '../src/lib/templates/types';

async function main() {
  const [id = 'viral-hook', aspect = '9:16', lang = 'en', outDir = 'storage/samples'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const video = process.argv.includes('--video');
  fs.mkdirSync(outDir, { recursive: true });
  const ids = id === 'all' ? TEMPLATES.map((t) => t.id) : id.split(',');
  for (const tid of ids) {
    const t = getBuiltinTemplate(tid);
    if (!t) throw new Error(`unknown template ${tid}`);
    const plan = draftPlan(t, t.sample, { language: lang, mode: 'code', voiceover: false });
    const comp = buildComposition(plan, t, { aspect: aspect as Aspect });
    const scale = aspect === '16:9' ? 0.4 : 0.35;
    const W = Math.round(comp.width * scale / 2) * 2; const H = Math.round(comp.height * scale / 2) * 2;
    // One still per scene, mid-scene.
    let cursor = 0;
    for (const [i, s] of plan.scenes.entries()) {
      const bg = comp.tracks[0].clips[i];
      const t0 = bg ? bg.start + bg.duration * 0.6 : cursor;
      cursor += s.durationSec * 1000;
      const png = await renderStill(comp, t0, { width: W, height: H });
      fs.writeFileSync(path.join(outDir, `${tid}_${aspect.replace(':', 'x')}_${lang}_s${i + 1}.png`), png);
      if (id === 'all' && i >= 1) break;
    }
    if (video) {
      const out = path.join(outDir, `${tid}_${aspect.replace(':', 'x')}_${lang}.mp4`);
      const t1 = Date.now();
      const r = await exportVideo(comp, { outPath: out, resolve: () => null, width: W, height: H });
      fs.writeFileSync(out.replace('.mp4', '.srt'), toSrt(comp));
      console.log(`${tid}: ${r.frames} frames, ${(r.durationMs / 1000).toFixed(1)}s in ${((Date.now() - t1) / 1000).toFixed(1)}s -> ${out}`);
    } else console.log(`${tid}: ${plan.scenes.length} scenes, ${(comp.durationMs / 1000).toFixed(1)}s`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
