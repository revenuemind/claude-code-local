/**
 * Composition: the single, serializable description of a video timeline.
 *
 * - Templates generate compositions, the editor mutates them, and the same
 *   renderer draws them in the browser (preview) and on the server (export).
 * - Geometry is normalized (0..1 of canvas width/height) so a composition can
 *   be adapted to other aspect ratios. Font sizes are "px at a 1080px short
 *   side" and scale with the output resolution.
 * - Times are integer milliseconds.
 */

export type Easing =
  | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'backOut' | 'elasticOut' | 'expoOut';

export type EnterExitType =
  | 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right'
  | 'pop' | 'zoom-in' | 'zoom-out' | 'wipe' | 'blur' | 'typewriter' | 'words' | 'rise-words';

export interface Animation {
  type: EnterExitType;
  durationMs: number;
  easing?: Easing;
  delayMs?: number;
}

export type TransitionType =
  | 'cut' | 'crossfade' | 'fade-black' | 'fade-white' | 'wipe-left' | 'wipe-right' | 'wipe-up'
  | 'slide-left' | 'slide-right' | 'slide-up' | 'zoom-in' | 'circle' | 'flash';

export interface Transition {
  type: TransitionType;
  durationMs: number;
}

/** Normalized rectangle (0..1). */
export interface Box { x: number; y: number; w: number; h: number }

export interface Transform {
  /** Offset in normalized units. */
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number; // degrees
}

export interface Keyframe { at: number; scale: number; x: number; y: number } // at: 0..1 of clip

export type BackgroundKind =
  | 'solid' | 'linear' | 'radial' | 'aurora' | 'particles' | 'grid' | 'waves' | 'bokeh'
  | 'stripes' | 'spotlight' | 'mesh' | 'rays' | 'dots';

export interface BackgroundStyle {
  kind: BackgroundKind;
  colors: string[];
  angle?: number;
  speed?: number;
  seed?: number;
  intensity?: number;
  vignette?: number; // 0..1
  grain?: number;    // 0..1
}

export interface TextStyle {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;            // px at 1080 short side
  color: string;
  highlightColor?: string;     // used for *emphasis* segments
  lineHeight?: number;         // multiplier
  letterSpacing?: number;      // px at 1080
  align?: 'start' | 'center' | 'end';
  valign?: 'top' | 'middle' | 'bottom';
  uppercase?: boolean;
  stroke?: { color: string; width: number };
  shadow?: { color: string; blur: number; x?: number; y?: number };
  background?: { color: string; padding: number; radius: number; mode?: 'box' | 'line' };
  maxLines?: number;
  autoFit?: boolean;           // shrink to fit box
}

export type CaptionPreset = 'bold-pop' | 'karaoke' | 'minimal' | 'boxed' | 'neon';

export interface CaptionWord { text: string; start: number; end: number } // ms relative to clip start

interface BaseClip {
  id: string;
  start: number;
  duration: number;
  name?: string;
  sceneId?: string;
  opacity?: number;
  transform?: Transform;
  enter?: Animation;
  exit?: Animation;
  /** Transition from the previous clip on the same track. */
  transition?: Transition;
  locked?: boolean;
}

export interface BackgroundClip extends BaseClip { type: 'background'; style: BackgroundStyle }

export interface MediaRef {
  assetId?: string;
  /** Resolved URL (browser) or file path (server). Populated at render time. */
  src?: string;
}

export interface MediaPlaceholder {
  label: string;
  prompt?: string;
  /** Rendered in exports when no media is attached (procedural fallback). */
  fallback?: BackgroundStyle;
}

export interface ImageClip extends BaseClip {
  type: 'image';
  media: MediaRef;
  box: Box;
  fit: 'cover' | 'contain';
  radius?: number;
  kenBurns?: { from: Keyframe; to: Keyframe };
  placeholder?: MediaPlaceholder;
  overlay?: { color: string; opacity: number };
}

export interface VideoClip extends BaseClip {
  type: 'video';
  media: MediaRef;
  box: Box;
  fit: 'cover' | 'contain';
  trimIn: number;  // ms into the source
  speed: number;   // playback rate
  volume: number;  // 0..2
  muted?: boolean;
  radius?: number;
  sourceDurationMs?: number;
  placeholder?: MediaPlaceholder;
  overlay?: { color: string; opacity: number };
}

export interface TextClip extends BaseClip {
  type: 'text';
  text: string;
  box: Box;
  style: TextStyle;
  /** Optional numeric counter animation: text template contains {n}. */
  counter?: { from: number; to: number; decimals?: number };
  direction?: 'auto' | 'ltr' | 'rtl';
}

export type ShapeKind = 'rect' | 'circle' | 'line' | 'progress' | 'pill' | 'ring' | 'arrow' | 'check' | 'cross';

export interface ShapeClip extends BaseClip {
  type: 'shape';
  shape: ShapeKind;
  box: Box;
  fill?: string;
  stroke?: { color: string; width: number };
  radius?: number;
  /** For progress: animate fill from 0 to 1 over the clip. */
  animateProgress?: boolean;
}

export interface CaptionClip extends BaseClip {
  type: 'caption';
  words: CaptionWord[];
  box: Box;
  preset: CaptionPreset;
  style: TextStyle;
  wordsPerLine?: number;
  direction?: 'auto' | 'ltr' | 'rtl';
}

export interface AudioClip extends BaseClip {
  type: 'audio';
  role: 'voiceover' | 'music' | 'sfx';
  media: MediaRef;
  trimIn: number;
  volume: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  /** Procedurally synthesized audio (code-only mode). */
  procedural?: { kind: 'music-bed'; mood: MusicMood; bpm: number; seed?: number };
  /** Lower music volume while voiceover plays. */
  duckUnderVoice?: boolean;
  text?: string; // voiceover script for reference
}

export type MusicMood = 'uplifting' | 'calm' | 'dramatic' | 'energetic' | 'luxury' | 'dark' | 'playful' | 'inspiring' | 'corporate' | 'cinematic';

export type VisualClip = BackgroundClip | ImageClip | VideoClip | TextClip | ShapeClip | CaptionClip;
export type Clip = VisualClip | AudioClip;
export type ClipType = Clip['type'];

export type TrackKind = 'visual' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  role?: 'background' | 'media' | 'overlay' | 'text' | 'captions' | 'brand' | 'voiceover' | 'music' | 'sfx';
  hidden?: boolean;
  muted?: boolean;
  locked?: boolean;
  volume?: number;
  clips: Clip[];
}

export interface Composition {
  version: 1;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  background: string;
  tracks: Track[]; // index 0 is drawn first (bottom)
  meta?: {
    title?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    templateId?: string;
    aspect?: string;
  };
}
