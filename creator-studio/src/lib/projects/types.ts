import type { Aspect, Platform } from '../templates/types';

export interface ProjectSettings {
  /** Language of the generated video (independent from the UI language). */
  language: string;
  aspect: Aspect;
  durationSec: number;
  style?: string | null;
  audience?: string;
  objective?: string;
  platforms: Platform[];
  referenceNotes?: string;
  sourceUrls?: string[];
  fps?: number;
  captions?: boolean;
  voiceover?: boolean;
}

export const PROJECT_TYPES = [
  'short', 'reel', 'tiktok', 'youtube-long', 'documentary', 'promo', 'product-ad', 'educational',
  'storytelling', 'faceless', 'influencer', 'brand', 'series',
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = ['draft', 'planning', 'generating', 'editing', 'rendering', 'ready', 'published'] as const;
