#!/usr/bin/env node
// Downloads the curated, SIL-OFL-licensed font set used by both the browser
// preview and the server renderer. Fonts are committed to assets/fonts so builds
// are reproducible offline; run this script only to refresh or extend the set.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/fonts');
// family -> weights. Script coverage noted for maintainers.
export const FONT_SET = {
  'Inter': [400, 700, 800],            // Latin, Cyrillic
  'Montserrat': [500, 800],            // Latin, Cyrillic
  'Bebas Neue': [400],                 // Latin display
  'Playfair Display': [600, 800],      // Latin, Cyrillic serif
  'Oswald': [500, 700],                // Latin, Cyrillic condensed
  'Rubik': [400, 700, 900],            // Latin, Hebrew, Cyrillic
  'Heebo': [400, 800],                 // Hebrew, Latin
  'Cairo': [400, 800],                 // Arabic, Latin
  'Noto Sans Ethiopic': [400, 700],    // Amharic (Ge'ez)
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  for (const [family, weights] of Object.entries(FONT_SET)) {
    const q = `${family.replace(/ /g, '+')}:wght@${weights.join(';')}`;
    // A non-browser UA makes the CSS API return plain TTF URLs.
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${q}`, { headers: { 'User-Agent': 'Wget/1.21' } })).text();
    const blocks = css.split('@font-face').slice(1);
    for (const block of blocks) {
      const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1]);
      const url = /url\(([^)]+\.ttf)\)/.exec(block)?.[1];
      if (!url || !weight) continue;
      const file = `${family.replace(/ /g, '')}-${weight}.ttf`;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      fs.writeFileSync(path.join(OUT, file), buf);
      manifest.push({ family, weight, file });
      console.log('saved', file, buf.length);
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
