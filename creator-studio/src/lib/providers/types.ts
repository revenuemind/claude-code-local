/**
 * AI Engine Manager — provider abstraction. Each provider exposes adapters per
 * capability; the orchestrator never calls provider HTTP APIs directly, so a
 * new model or provider is added by registering an adapter.
 */
import type { CaptionWord } from '../composition/types';

export type Capability = 'llm' | 'image' | 'video' | 'tts' | 'music';

/**
 * Honest integration status shown in the UI:
 *  - builtin:     runs inside the platform (procedural / offline); tested end-to-end.
 *  - implemented: adapter written against the provider's documented API and
 *                 unit-tested with mocked HTTP; NOT verified against the live API.
 *  - manual:      no supported public API — generate externally and upload.
 *  - discontinued / unavailable: listed for transparency, cannot be selected.
 */
export type IntegrationStatus = 'builtin' | 'implemented' | 'manual' | 'discontinued' | 'unavailable';

export interface CostEstimate {
  unit: 'image' | 'second' | '1k-chars' | '1m-input-tokens' | 'request' | 'minute';
  usd: number;
  note?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  capability: Capability;
  cost?: CostEstimate;
  maxDurationSec?: number;
  durations?: number[];
  aspects?: string[];
  imageToVideo?: boolean;
  notes?: string;
  default?: boolean;
}

export interface CredentialField { key: string; label: string; secret: boolean; optional?: boolean; placeholder?: string }

export interface ProviderInfo {
  id: string;
  name: string;
  website: string;
  docsUrl: string;
  capabilities: Capability[];
  status: IntegrationStatus;
  statusNote: string;
  credentialFields: CredentialField[];
  /** Env var that holds a platform-managed key (optional). */
  platformEnvKey?: string;
  models: ModelInfo[];
  commercialUse: string;
  /** Hosts the adapter calls (for egress allow-lists). */
  hosts: string[];
  pricingReviewed?: string;
}

export type Credentials = Record<string, string>;

export interface AdapterContext {
  credentials: Credentials;
  config?: Record<string, string>;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export interface LlmRequest {
  system: string;
  prompt: string;
  model: string;
  maxTokens?: number;
  /** JSON schema the response must satisfy (passed to structured-output features where supported). */
  jsonSchema?: Record<string, unknown>;
}
export interface LlmResult { text: string; json?: unknown; usage: { inputTokens: number; outputTokens: number }; model: string }
export interface LlmAdapter { generate(req: LlmRequest, ctx: AdapterContext): Promise<LlmResult> }

export interface ImageRequest { prompt: string; negativePrompt?: string; aspect: string; model: string; seed?: number }
export interface ImageResult { data: Buffer; mimeType: string; width?: number; height?: number; revisedPrompt?: string }
export interface ImageAdapter { generate(req: ImageRequest, ctx: AdapterContext): Promise<ImageResult> }

export interface VideoRequest {
  prompt: string;
  model: string;
  aspect: string;
  durationSec: number;
  /** Public HTTPS URL or data: URI of a first frame (image-to-video). */
  imageUrl?: string;
  negativePrompt?: string;
  seed?: number;
}
export type VideoTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export interface VideoPoll { status: VideoTaskStatus; videoUrl?: string; error?: string; progress?: number }
export interface VideoAdapter {
  submit(req: VideoRequest, ctx: AdapterContext): Promise<{ taskId: string }>;
  poll(taskId: string, ctx: AdapterContext): Promise<VideoPoll>;
  download(url: string, ctx: AdapterContext): Promise<Buffer>;
}

export interface TtsRequest { text: string; voiceId?: string; model: string; language: string; style?: string }
export interface TtsResult { audio: Buffer; mimeType: string; words?: CaptionWord[]; durationMs?: number }
export interface TtsAdapter { synthesize(req: TtsRequest, ctx: AdapterContext): Promise<TtsResult> }

export interface MusicRequest { prompt: string; durationMs: number; model: string }
export interface MusicResult { audio: Buffer; mimeType: string }
export interface MusicAdapter { compose(req: MusicRequest, ctx: AdapterContext): Promise<MusicResult> }

export interface ProviderAdapters {
  llm?: LlmAdapter;
  image?: ImageAdapter;
  video?: VideoAdapter;
  tts?: TtsAdapter;
  music?: MusicAdapter;
}

/** Per-organization engine choices for each task. */
export interface EnginePreferences {
  planner?: { providerId: string; modelId: string };
  image?: { providerId: string; modelId: string };
  video?: { providerId: string; modelId: string };
  tts?: { providerId: string; modelId: string; voiceId?: string };
  music?: { providerId: string; modelId: string };
  quality?: 'draft' | 'standard' | 'high';
  allowPlatformCredentials?: boolean;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly retryable: boolean, public readonly providerId: string) {
    super(message);
    this.name = 'ProviderError';
  }
}
