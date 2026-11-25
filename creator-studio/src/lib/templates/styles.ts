/** Visual style presets shared by templates. Brands override palette & fonts. */
import type { StylePreset } from './types';

const s = (p: StylePreset) => p;

export const STYLES: Record<string, StylePreset> = {
  'neon-pop': s({
    id: 'neon-pop', name: 'Neon Pop',
    palette: { bg: '#0a0814', surface: '#1a1230', primary: '#a855f7', accent: '#facc15', text: '#ffffff', muted: '#c4b5fd' },
    background: { kind: 'aurora', vignette: 0.45, grain: 0.3, speed: 1.2 },
    headingFont: 'Montserrat', headingWeight: 800, bodyFont: 'Inter', bodyWeight: 700, uppercaseHeadings: true,
    textEnter: 'words', transition: 'zoom-in', transitionMs: 380, captionPreset: 'bold-pop', textShadow: true, mediaOverlay: 0.35, radius: 28,
  }),
  'bold-yellow': s({
    id: 'bold-yellow', name: 'Bold Countdown',
    palette: { bg: '#111111', surface: '#1f1f1f', primary: '#facc15', accent: '#ef4444', text: '#ffffff', muted: '#d4d4d4' },
    background: { kind: 'stripes', angle: -28, speed: 0.8, vignette: 0.5 },
    headingFont: 'Bebas Neue', headingWeight: 400, bodyFont: 'Inter', bodyWeight: 700, uppercaseHeadings: true,
    textEnter: 'pop', transition: 'slide-left', transitionMs: 320, captionPreset: 'boxed', textShadow: true, mediaOverlay: 0.4, radius: 18,
  }),
  'documentary': s({
    id: 'documentary', name: 'Documentary',
    palette: { bg: '#0c0b09', surface: '#1c1a16', primary: '#e8d5a8', accent: '#c2410c', text: '#f5f0e6', muted: '#bfb6a3' },
    background: { kind: 'spotlight', vignette: 0.7, grain: 0.6, speed: 0.4 },
    headingFont: 'Playfair Display', headingWeight: 800, bodyFont: 'Inter', bodyWeight: 400,
    textEnter: 'fade', transition: 'crossfade', transitionMs: 900, captionPreset: 'minimal', textShadow: true, mediaOverlay: 0.45, radius: 0,
  }),
  'luxury': s({
    id: 'luxury', name: 'Luxury Gold',
    palette: { bg: '#050505', surface: '#141210', primary: '#d4af37', accent: '#f5e6b3', text: '#fbf8ef', muted: '#a8a29e' },
    background: { kind: 'bokeh', vignette: 0.6, grain: 0.25, speed: 0.35 },
    headingFont: 'Playfair Display', headingWeight: 600, bodyFont: 'Montserrat', bodyWeight: 500, uppercaseHeadings: false,
    textEnter: 'blur', transition: 'fade-black', transitionMs: 900, captionPreset: 'minimal', textShadow: false, mediaOverlay: 0.3, radius: 4,
  }),
  'tech': s({
    id: 'tech', name: 'Tech Grid',
    palette: { bg: '#030712', surface: '#0f172a', primary: '#22d3ee', accent: '#a3e635', text: '#f8fafc', muted: '#94a3b8' },
    background: { kind: 'grid', speed: 1, vignette: 0.5 },
    headingFont: 'Inter', headingWeight: 800, bodyFont: 'Inter', bodyWeight: 400,
    textEnter: 'rise-words', transition: 'wipe-left', transitionMs: 420, captionPreset: 'karaoke', textShadow: true, mediaOverlay: 0.35, radius: 20,
  }),
  'corporate': s({
    id: 'corporate', name: 'Corporate Clean',
    palette: { bg: '#0b1b3a', surface: '#13285a', primary: '#3b82f6', accent: '#38bdf8', text: '#ffffff', muted: '#bfdbfe' },
    background: { kind: 'linear', angle: 140, speed: 0.6 },
    headingFont: 'Montserrat', headingWeight: 800, bodyFont: 'Inter', bodyWeight: 400,
    textEnter: 'slide-up', transition: 'crossfade', transitionMs: 500, captionPreset: 'minimal', mediaOverlay: 0.3, radius: 24,
  }),
  'warm-story': s({
    id: 'warm-story', name: 'Warm Story',
    palette: { bg: '#1c0f08', surface: '#2d1a10', primary: '#fb923c', accent: '#fde68a', text: '#fff7ed', muted: '#fed7aa' },
    background: { kind: 'radial', vignette: 0.6, grain: 0.4, speed: 0.5 },
    headingFont: 'Playfair Display', headingWeight: 800, bodyFont: 'Inter', bodyWeight: 400,
    textEnter: 'typewriter', transition: 'crossfade', transitionMs: 700, captionPreset: 'karaoke', textShadow: true, mediaOverlay: 0.4, radius: 12,
  }),
  'playful': s({
    id: 'playful', name: 'Playful Pastel',
    palette: { bg: '#2b1055', surface: '#3d1a78', primary: '#f472b6', accent: '#5eead4', text: '#ffffff', muted: '#e9d5ff' },
    background: { kind: 'dots', speed: 1 },
    headingFont: 'Rubik', headingWeight: 900, bodyFont: 'Rubik', bodyWeight: 700,
    textEnter: 'pop', transition: 'circle', transitionMs: 450, captionPreset: 'bold-pop', textShadow: true, mediaOverlay: 0.25, radius: 36,
  }),
  'news': s({
    id: 'news', name: 'Newsroom',
    palette: { bg: '#0a0a0a', surface: '#171717', primary: '#dc2626', accent: '#fafafa', text: '#ffffff', muted: '#a3a3a3' },
    background: { kind: 'linear', angle: 180, speed: 0.4, vignette: 0.35 },
    headingFont: 'Oswald', headingWeight: 700, bodyFont: 'Inter', bodyWeight: 400, uppercaseHeadings: true,
    textEnter: 'wipe', transition: 'wipe-right', transitionMs: 350, captionPreset: 'boxed', textShadow: false, mediaOverlay: 0.35, radius: 6,
  }),
  'finance': s({
    id: 'finance', name: 'Finance',
    palette: { bg: '#04140e', surface: '#0b2a1d', primary: '#22c55e', accent: '#eab308', text: '#f0fdf4', muted: '#86efac' },
    background: { kind: 'waves', speed: 0.7, vignette: 0.4 },
    headingFont: 'Inter', headingWeight: 800, bodyFont: 'Inter', bodyWeight: 400,
    textEnter: 'slide-up', transition: 'slide-up', transitionMs: 450, captionPreset: 'karaoke', textShadow: true, mediaOverlay: 0.35, radius: 20,
  }),
  'motivation': s({
    id: 'motivation', name: 'Motivation',
    palette: { bg: '#050505', surface: '#18181b', primary: '#f97316', accent: '#fde047', text: '#ffffff', muted: '#d4d4d8' },
    background: { kind: 'rays', speed: 0.5, vignette: 0.75, grain: 0.35 },
    headingFont: 'Oswald', headingWeight: 700, bodyFont: 'Inter', bodyWeight: 700, uppercaseHeadings: true,
    textEnter: 'rise-words', transition: 'fade-black', transitionMs: 600, captionPreset: 'bold-pop', textShadow: true, mediaOverlay: 0.5, radius: 0,
  }),
  'travel': s({
    id: 'travel', name: 'Golden Hour',
    palette: { bg: '#1e1b4b', surface: '#312e81', primary: '#fb7185', accent: '#fbbf24', text: '#ffffff', muted: '#fde68a' },
    background: { kind: 'mesh', speed: 0.5, grain: 0.2 },
    headingFont: 'Playfair Display', headingWeight: 800, bodyFont: 'Montserrat', bodyWeight: 500,
    textEnter: 'slide-up', transition: 'crossfade', transitionMs: 800, captionPreset: 'minimal', textShadow: true, mediaOverlay: 0.3, radius: 16,
  }),
  'editorial': s({
    id: 'editorial', name: 'Editorial Mono',
    palette: { bg: '#0d0d0d', surface: '#1a1a1a', primary: '#ffffff', accent: '#e11d48', text: '#ffffff', muted: '#a1a1aa' },
    background: { kind: 'spotlight', speed: 0.3, vignette: 0.5, grain: 0.5 },
    headingFont: 'Bebas Neue', headingWeight: 400, bodyFont: 'Montserrat', bodyWeight: 500, uppercaseHeadings: true,
    textEnter: 'wipe', transition: 'flash', transitionMs: 300, captionPreset: 'minimal', mediaOverlay: 0.2, radius: 0,
  }),
  'creator': s({
    id: 'creator', name: 'Creator Vlog',
    palette: { bg: '#0f0a1e', surface: '#1e1538', primary: '#38bdf8', accent: '#f472b6', text: '#ffffff', muted: '#cbd5e1' },
    background: { kind: 'particles', speed: 0.8, vignette: 0.4 },
    headingFont: 'Rubik', headingWeight: 900, bodyFont: 'Inter', bodyWeight: 700,
    textEnter: 'pop', transition: 'zoom-in', transitionMs: 350, captionPreset: 'bold-pop', textShadow: true, mediaOverlay: 0.15, radius: 28,
  }),
};

export function getStyle(id: string): StylePreset {
  return STYLES[id] ?? STYLES['neon-pop'];
}
