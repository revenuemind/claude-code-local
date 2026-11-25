import type { Aspect } from '../templates/types';

export interface ExportPreset {
  id: string;
  name: string;
  platform: 'youtube' | 'shorts' | 'tiktok' | 'instagram' | 'facebook' | 'generic';
  aspect: Aspect;
  width: number;
  height: number;
  fps: number;
  maxDurationSec?: number;
  note?: string;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'youtube-1080p', name: 'YouTube 1080p', platform: 'youtube', aspect: '16:9', width: 1920, height: 1080, fps: 30 },
  { id: 'youtube-4k', name: 'YouTube 4K', platform: 'youtube', aspect: '16:9', width: 3840, height: 2160, fps: 30, note: 'Slow to render; requires a plan allowing 2160p.' },
  { id: 'shorts', name: 'YouTube Shorts', platform: 'shorts', aspect: '9:16', width: 1080, height: 1920, fps: 30, maxDurationSec: 180 },
  { id: 'tiktok', name: 'TikTok', platform: 'tiktok', aspect: '9:16', width: 1080, height: 1920, fps: 30, maxDurationSec: 600 },
  { id: 'reels', name: 'Instagram Reels', platform: 'instagram', aspect: '9:16', width: 1080, height: 1920, fps: 30, maxDurationSec: 180 },
  { id: 'instagram-feed', name: 'Instagram Feed 4:5', platform: 'instagram', aspect: '4:5', width: 1080, height: 1350, fps: 30 },
  { id: 'facebook-feed', name: 'Facebook Feed 1:1', platform: 'facebook', aspect: '1:1', width: 1080, height: 1080, fps: 30 },
  { id: 'facebook-reels', name: 'Facebook Reels', platform: 'facebook', aspect: '9:16', width: 1080, height: 1920, fps: 30, maxDurationSec: 90 },
  { id: 'square-1080', name: 'Square 1:1', platform: 'generic', aspect: '1:1', width: 1080, height: 1080, fps: 30 },
  { id: 'preview-720', name: 'Quick preview (720p)', platform: 'generic', aspect: '9:16', width: 720, height: 1280, fps: 30, note: 'Aspect follows the project.' },
];

export function getPreset(id: string): ExportPreset | undefined {
  return EXPORT_PRESETS.find((p) => p.id === id);
}

/** Custom export dimensions → nearest supported aspect for re-layout. */
export function nearestAspect(width: number, height: number): Aspect {
  const r = width / height;
  const opts: Array<[Aspect, number]> = [['9:16', 9 / 16], ['4:5', 4 / 5], ['1:1', 1], ['16:9', 16 / 9]];
  return opts.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}
