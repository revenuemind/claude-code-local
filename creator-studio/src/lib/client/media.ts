/** Browser media source for the shared renderer: images and frame-synced video elements. */
import type { ImageClip, VideoClip } from '../composition/types';
import type { MediaSource, Drawable } from '../render/renderer';
import { assetUrl } from './api';

export class BrowserMedia implements MediaSource {
  private images = new Map<string, HTMLImageElement>();
  private videos = new Map<string, HTMLVideoElement>();
  private touched = new Set<string>();
  playing = false;
  constructor(private onReady: () => void) {}

  beginFrame() { this.touched.clear(); }
  endFrame() {
    for (const [id, v] of this.videos) if (!this.touched.has(id) && !v.paused) v.pause();
  }

  image(clip: ImageClip): Drawable | null {
    const id = clip.media.assetId;
    if (!id) return null;
    let img = this.images.get(id);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.onload = () => this.onReady();
      img.src = assetUrl(id);
      this.images.set(id, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  videoFrame(clip: VideoClip, sourceMs: number): Drawable | null {
    const id = clip.media.assetId;
    if (!id) return null;
    let v = this.videos.get(clip.id);
    if (!v) {
      v = document.createElement('video');
      v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'use-credentials';
      v.src = assetUrl(id);
      v.addEventListener('loadeddata', () => this.onReady());
      v.addEventListener('seeked', () => this.onReady());
      this.videos.set(clip.id, v);
    }
    this.touched.add(clip.id);
    v.muted = !!clip.muted || clip.volume === 0 || !this.playing;
    v.volume = Math.min(1, clip.volume);
    const target = sourceMs / 1000;
    if (this.playing) {
      v.playbackRate = clip.speed;
      if (v.paused) v.play().catch(() => {});
      if (Math.abs(v.currentTime - target) > 0.35) v.currentTime = target;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - target) > 0.04) v.currentTime = target;
    }
    return v.readyState >= 2 ? v : null;
  }

  pauseAll() { for (const v of this.videos.values()) v.pause(); }
  dispose() {
    for (const v of this.videos.values()) { v.pause(); v.removeAttribute('src'); v.load(); }
    this.videos.clear(); this.images.clear();
  }
}
