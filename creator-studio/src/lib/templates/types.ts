import type { BackgroundStyle, CaptionPreset, EnterExitType, MusicMood, TransitionType } from '../composition/types';
import type { ProductionMode } from '../planning/types';

export type UiLocale = 'en' | 'he' | 'ru' | 'ar' | 'am';
export type LocalizedText = { en: string } & Partial<Record<Exclude<UiLocale, 'en'>, string>>;

export type TemplateCategory = 'social' | 'marketing' | 'longform' | 'faceless' | 'influencer';
export type Platform = 'youtube' | 'shorts' | 'tiktok' | 'instagram' | 'facebook';
export type Aspect = '9:16' | '16:9' | '1:1' | '4:5';

export type LayoutId =
  | 'title' | 'statement' | 'list-item' | 'number-stat' | 'split-compare' | 'media-full' | 'media-card'
  | 'quote' | 'lower-third' | 'product-hero' | 'cta' | 'chapter' | 'talking-head' | 'checklist'
  | 'timeline-step' | 'news' | 'testimonial' | 'price-offer';

export interface TemplateField {
  key: string;
  type: 'text' | 'textarea' | 'list' | 'number' | 'url';
  label: LocalizedText;
  required?: boolean;
  placeholder?: string;
  maxItems?: number;
}

export interface SceneBlueprint {
  role: string;
  layout: LayoutId;
  /** Relative share of the total duration. */
  weight: number;
  /** One scene per item of a list field. */
  repeat?: { field: string; min: number; max: number };
  headline?: string;
  body?: string;
  kicker?: string;
  label?: string;
  narration?: string;
  media?: 'none' | 'image' | 'video' | 'avatar';
  visualPrompt?: string;
  transition?: TransitionType;
  /** Layout-specific content keys (e.g. left/right for split-compare). */
  extra?: Record<string, string>;
  /** With `repeat`: scenes emitted after this one for every item (interleaved groups). */
  then?: SceneBlueprint[];
}

export interface StylePreset {
  id: string;
  name: string;
  palette: { bg: string; surface: string; primary: string; accent: string; text: string; muted: string };
  background: Omit<BackgroundStyle, 'colors'> & { colors?: string[] };
  headingFont: string;
  headingWeight: number;
  bodyFont: string;
  bodyWeight: number;
  uppercaseHeadings?: boolean;
  textEnter: EnterExitType;
  transition: TransitionType;
  transitionMs: number;
  captionPreset: CaptionPreset;
  textShadow?: boolean;
  mediaOverlay?: number; // darken media for legibility
  radius?: number;
}

export interface TemplateDefinition {
  id: string;
  version: number;
  category: TemplateCategory;
  name: LocalizedText;
  description: LocalizedText;
  tags: string[];
  platforms: Platform[];
  defaultAspect: Aspect;
  aspects: Aspect[];
  duration: { min: number; max: number; default: number };
  modes: ProductionMode[];
  recommendedMode: ProductionMode;
  requirements: {
    voiceover: 'none' | 'optional' | 'recommended' | 'required';
    aiImages?: 'optional' | 'recommended' | 'required';
    aiVideo?: 'optional' | 'recommended' | 'required';
    avatar?: 'optional' | 'required';
    userMedia?: 'optional' | 'recommended';
  };
  style: string;
  styleOverrides?: Partial<StylePreset>;
  fields: TemplateField[];
  scenes: SceneBlueprint[];
  music: { mood: MusicMood; bpm: number };
  captions: { enabled: boolean; preset?: CaptionPreset };
  sample: Record<string, unknown>;
  /** Set for user/org templates stored in the database. */
  custom?: { orgId: string | null; baseTemplateId?: string; status: string; visibility: string };
}
