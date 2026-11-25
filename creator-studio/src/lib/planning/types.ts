import type { MusicMood, TransitionType, CaptionPreset } from '../composition/types';

export type ProductionMode = 'code' | 'ai' | 'hybrid';
/** How a scene's visual media is produced. */
export type SceneMediaMode = 'code' | 'ai-image' | 'ai-video' | 'upload' | 'avatar';

export interface PlanScene {
  id: string;
  role: string;
  layout: string;
  durationSec: number;
  headline: string;
  body?: string;
  kicker?: string;
  label?: string;
  stat?: { value: number; prefix?: string; suffix?: string; decimals?: number };
  bullets?: string[];
  left?: { title: string; body?: string };
  right?: { title: string; body?: string };
  author?: string;
  narration: string;
  shotDescription: string;
  visualPrompt: string;
  /** What kind of media this scene wants (from the template). */
  mediaKind: 'none' | 'image' | 'video' | 'avatar';
  /** How the user chose to produce it (per-scene override of project mode). */
  mediaMode: SceneMediaMode;
  media?: { assetId: string; kind: 'image' | 'video' } | null;
  transition?: TransitionType;
}

export interface ProductionPlan {
  version: 1;
  concept: string;
  hook: string;
  title: string;
  language: string;
  targetDurationSec: number;
  scenes: PlanScene[];
  visualDirection: string;
  music: { mood: MusicMood; bpm: number; direction: string; assetId?: string | null };
  voice: { enabled: boolean; style: string; voiceId?: string | null; providerId?: string | null };
  subtitles: { enabled: boolean; preset: CaptionPreset };
  /** Decisions the planner made, explained to the user (overridable). */
  rationale: string[];
  requirements: PlanRequirements;
  generatedBy: string; // 'offline-template-planner' | provider id
  createdAt: string;
  /** Generated voiceover per scene (exact duration + word timings for captions). */
  voiceAssets?: Record<string, { assetId: string; durationMs: number; words?: Array<{ text: string; start: number; end: number }> }>;
}

export interface PlanRequirements {
  aiImages: number;
  aiVideoClips: number;
  aiVideoSeconds: number;
  voiceoverChars: number;
  musicSeconds: number;
  userMediaSlots: number;
  missingAssets: string[];
}
