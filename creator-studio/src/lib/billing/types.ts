/** Plan limits are data (stored in the `plans` table), never hardcoded business pricing. */
export interface PlanLimits {
  /** -1 means unlimited. */
  seats: number;
  projects: number;
  renderMinutesPerMonth: number;
  maxRenderHeight: number;
  storageMb: number;
  aiCreditsUsdPerMonth: number;
  scheduledPosts: number;
  customTemplates: number;
  watermark: boolean;
}

export const USAGE_KINDS = [
  'render.seconds', 'ai.image', 'ai.video.seconds', 'ai.tts.chars', 'ai.llm.tokens', 'ai.music.seconds', 'storage.bytes', 'publish.post',
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];
