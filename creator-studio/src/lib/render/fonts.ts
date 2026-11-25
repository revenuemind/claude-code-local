/**
 * Font registry. The same OFL fonts (assets/fonts) are loaded by the browser
 * (@font-face, served from /fonts) and registered with Skia on the server, so
 * previews and exports use identical typefaces. Every stack ends with script
 * fallbacks so Hebrew, Arabic, Cyrillic and Ethiopic always render.
 */
export interface FontInfo {
  family: string;
  weights: number[];
  scripts: Array<'latin' | 'cyrillic' | 'hebrew' | 'arabic' | 'ethiopic'>;
  style: 'sans' | 'serif' | 'display' | 'condensed';
  files: Record<number, string>;
}

const f = (family: string, weights: number[], scripts: FontInfo['scripts'], style: FontInfo['style']): FontInfo => ({
  family, weights, scripts, style,
  files: Object.fromEntries(weights.map((w) => [w, `${family.replace(/ /g, '')}-${w}.ttf`])),
});

export const FONTS: FontInfo[] = [
  f('Inter', [400, 700, 800], ['latin', 'cyrillic'], 'sans'),
  f('Montserrat', [500, 800], ['latin', 'cyrillic'], 'sans'),
  f('Bebas Neue', [400], ['latin'], 'display'),
  f('Playfair Display', [600, 800], ['latin', 'cyrillic'], 'serif'),
  f('Oswald', [500, 700], ['latin', 'cyrillic'], 'condensed'),
  f('Rubik', [400, 700, 900], ['latin', 'hebrew', 'cyrillic'], 'sans'),
  f('Heebo', [400, 800], ['hebrew', 'latin'], 'sans'),
  f('Cairo', [400, 800], ['arabic', 'latin'], 'sans'),
  f('Noto Sans Ethiopic', [400, 700], ['ethiopic'], 'sans'),
];

export const FONT_FAMILIES = FONTS.map((x) => x.family);

const SCRIPT_FALLBACKS = ['Rubik', 'Heebo', 'Cairo', 'Noto Sans Ethiopic'];

export function fontStack(family: string): string {
  const fams = [family, ...SCRIPT_FALLBACKS.filter((x) => x !== family)];
  return `${fams.map((x) => `"${x}"`).join(', ')}, sans-serif`;
}

export function cssFont(weight: number, sizePx: number, family: string): string {
  return `${weight} ${Math.max(1, Math.round(sizePx * 100) / 100)}px ${fontStack(family)}`;
}

/** Best heading/body font for a content language (used when brand fonts don't cover the script). */
export function fontForLanguage(lang: string, kind: 'heading' | 'body'): string | null {
  switch (lang) {
    case 'he': return kind === 'heading' ? 'Rubik' : 'Heebo';
    case 'ar': return 'Cairo';
    case 'am': return 'Noto Sans Ethiopic';
    default: return null;
  }
}

export function fontCovers(family: string, lang: string): boolean {
  const info = FONTS.find((x) => x.family === family);
  if (!info) return false;
  const script = lang === 'he' ? 'hebrew' : lang === 'ar' ? 'arabic' : lang === 'am' ? 'ethiopic' : lang === 'ru' ? 'cyrillic' : 'latin';
  return info.scripts.includes(script);
}
