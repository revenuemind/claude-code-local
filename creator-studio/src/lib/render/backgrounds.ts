/**
 * Procedural, deterministic motion backgrounds (Code-Only mode). Each is a
 * pure function of (time, style), so frames are reproducible and identical
 * between preview and export.
 */
import type { BackgroundStyle } from '../composition/types';
import { rng, withAlpha, mix } from './util';

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

function linearFill(ctx: Ctx, W: number, H: number, colors: string[], angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  const r = Math.hypot(W, H) / 2;
  const cx = W / 2; const cy = H / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  const cs = colors.length === 1 ? [colors[0], colors[0]] : colors;
  cs.forEach((c, i) => g.addColorStop(i / (cs.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function blob(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function drawBackground(ctx: Ctx, W: number, H: number, tMs: number, style: BackgroundStyle) {
  const t = (tMs / 1000) * (style.speed ?? 1);
  const c = style.colors.length ? style.colors : ['#0b0b12'];
  const c0 = c[0]; const c1 = c[1] ?? c0; const c2 = c[2] ?? c1; const c3 = c[3] ?? c2;
  const S = Math.min(W, H); const L = Math.max(W, H);
  const seed = style.seed ?? 7;
  const k = style.intensity ?? 1;
  ctx.save();
  switch (style.kind) {
    case 'solid':
      ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H); break;
    case 'linear':
      linearFill(ctx, W, H, c, (style.angle ?? 135) + Math.sin(t * 0.4) * 12); break;
    case 'radial': {
      const x = W / 2 + Math.sin(t * 0.5) * W * 0.08; const y = H * 0.42 + Math.cos(t * 0.4) * H * 0.05;
      const g = ctx.createRadialGradient(x, y, 0, x, y, L * 0.75);
      g.addColorStop(0, c1); g.addColorStop(1, c0);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break;
    }
    case 'aurora':
    case 'mesh': {
      ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
      const cols = [c1, c2, c3, c[4] ?? c1];
      const R = rng(seed);
      const slow = style.kind === 'mesh' ? 0.25 : 0.6;
      cols.forEach((col, i) => {
        const px = R(); const py = R(); const ph = R() * TAU;
        const x = W * (0.2 + 0.6 * px) + Math.sin(t * slow * (0.7 + i * 0.13) + ph) * W * 0.22;
        const y = H * (0.2 + 0.6 * py) + Math.cos(t * slow * (0.5 + i * 0.11) + ph) * H * 0.18;
        blob(ctx, x, y, L * (0.45 + 0.15 * R()), col, 0.55 * k);
      });
      break;
    }
    case 'particles': {
      linearFill(ctx, W, H, [c0, c1], style.angle ?? 160);
      const R = rng(seed);
      const n = Math.round(70 * k);
      for (let i = 0; i < n; i++) {
        const bx = R(); const by = R(); const sp = 0.02 + R() * 0.06; const sz = (0.6 + R() * 2.6) * S / 1080 * 3;
        const tw = 0.5 + 0.5 * Math.sin(t * (1 + R() * 2) + i);
        const x = (bx * W + Math.sin(t * 0.6 + i) * S * 0.02) % W;
        const y = ((by - t * sp) % 1 + 1) % 1 * H;
        ctx.fillStyle = withAlpha(i % 3 === 0 ? c2 : '#ffffff', 0.25 + 0.6 * tw);
        ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'grid': {
      linearFill(ctx, W, H, [c0, c1], style.angle ?? 180);
      const step = S / 12;
      const off = (t * step * 0.35) % step;
      ctx.strokeStyle = withAlpha(c2, 0.22 * k); ctx.lineWidth = Math.max(1, S / 900);
      ctx.beginPath();
      for (let x = -step + off; x < W + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = -step + off; y < H + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      blob(ctx, W * 0.5, H * 0.5, L * 0.6, c2, 0.25 * k);
      break;
    }
    case 'waves': {
      linearFill(ctx, W, H, [c0, c1], style.angle ?? 180);
      for (let i = 0; i < 4; i++) {
        const base = H * (0.55 + i * 0.1);
        const amp = H * (0.035 + i * 0.012);
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += W / 60) {
          ctx.lineTo(x, base + Math.sin(x / W * TAU * (1.2 + i * 0.3) + t * (0.8 + i * 0.25)) * amp);
        }
        ctx.lineTo(W, H); ctx.closePath();
        ctx.fillStyle = withAlpha(i % 2 ? c2 : c3, 0.18 + i * 0.05);
        ctx.fill();
      }
      break;
    }
    case 'bokeh': {
      linearFill(ctx, W, H, [c0, c1], style.angle ?? 150);
      const R = rng(seed);
      for (let i = 0; i < Math.round(26 * k); i++) {
        const x = R() * W + Math.sin(t * 0.3 + i) * S * 0.05;
        const y = R() * H + Math.cos(t * 0.25 + i * 1.7) * S * 0.05;
        blob(ctx, x, y, S * (0.04 + R() * 0.12), [c2, c3, '#ffffff'][i % 3], 0.18 + R() * 0.25);
      }
      break;
    }
    case 'stripes': {
      ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2); ctx.rotate(((style.angle ?? -30) * Math.PI) / 180);
      const w = S / 9; const off = (t * w * 0.6) % (w * 2);
      ctx.fillStyle = withAlpha(c1, 0.35 * k);
      for (let x = -L - w * 2 + off; x < L; x += w * 2) ctx.fillRect(x, -L, w, L * 2);
      break;
    }
    case 'spotlight': {
      ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
      const x = W * (0.5 + Math.sin(t * 0.45) * 0.25); const y = H * (0.35 + Math.cos(t * 0.35) * 0.1);
      blob(ctx, x, y, L * 0.55, c1, 0.85 * k);
      blob(ctx, W - x, H - y, L * 0.4, c2, 0.35 * k);
      break;
    }
    case 'rays': {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, L * 0.8);
      g.addColorStop(0, c1); g.addColorStop(1, c0);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2); ctx.rotate(t * 0.12);
      ctx.fillStyle = withAlpha(c2, 0.12 * k);
      const n = 16;
      for (let i = 0; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, L, (i / n) * TAU, (i / n) * TAU + TAU / n / 2); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'dots': {
      ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
      const step = S / 18;
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          const d = Math.hypot(x - W / 2, y - H / 2) / L;
          const r = step * 0.18 * (0.6 + 0.4 * Math.sin(t * 1.5 - d * 10));
          ctx.fillStyle = withAlpha(mix(c1, c2, d * 1.5), 0.55 * k);
          ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, TAU); ctx.fill();
        }
      }
      break;
    }
    default:
      ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  if (style.vignette) drawVignette(ctx, W, H, style.vignette);
  if (style.grain) drawGrain(ctx, W, H, tMs, style.grain);
}

export function drawVignette(ctx: Ctx, W: number, H: number, amount: number) {
  const L = Math.max(W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, L * 0.25, W / 2, H / 2, L * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, amount)})`);
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}

export function drawGrain(ctx: Ctx, W: number, H: number, tMs: number, amount: number) {
  const R = rng(Math.floor(tMs / 41) + 99);
  const n = Math.round(1800 * amount);
  const s = Math.max(1, Math.min(W, H) / 700);
  ctx.save();
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = R() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(R() * W, R() * H, s, s);
  }
  ctx.restore();
}
