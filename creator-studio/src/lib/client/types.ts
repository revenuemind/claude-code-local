import type { Composition } from '../composition/types';
import type { ProductionPlan } from '../planning/types';
import type { ProjectSettings } from '../projects/types';

export interface ClientProject {
  id: string; name: string; type: string; description: string | null; status: string; templateId: string | null; brandId: string | null;
  inputs: Record<string, unknown>; settings: ProjectSettings; productionMode: string; plan: ProductionPlan | null; planSource: string | null;
  planApprovedAt: string | null; composition: Composition | null; compositionRevision: number; updatedAt: string; createdAt: string;
}

export interface ClientJob {
  id: string; type: string; status: string; progress: number; sceneId: string | null; error: string | null; result: Record<string, unknown> | null;
  providerId: string | null; modelId: string | null; createdAt: string; attempts: number; maxAttempts: number; payload: Record<string, unknown>;
}

export interface ClientAsset {
  id: string; kind: string; name: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null; durationMs: number | null;
  source: string; providerId: string | null; modelId: string | null; prompt: string | null; meta: Record<string, unknown>; createdAt: string; projectId: string | null;
}

export interface ClientRender {
  id: string; presetId: string; width: number; height: number; fps: number; status: string; videoAssetId: string | null; subtitleAssetId: string | null;
  thumbnailAssetId: string | null; durationMs: number | null; createdAt: string; jobId: string | null;
}

export interface ClientProviderModel { id: string; name: string; capability: string; default?: boolean; maxDurationSec?: number; cost?: { unit: string; usd: number; note?: string }; notes?: string }
export interface ClientProvider {
  id: string; name: string; status: string; statusNote: string; capabilities: string[]; models: ClientProviderModel[]; docsUrl: string; website: string;
  credentialFields: Array<{ key: string; label: string; secret: boolean; optional?: boolean }>; commercialUse: string; platformKeyAvailable?: boolean; pricingReviewed?: string;
}
