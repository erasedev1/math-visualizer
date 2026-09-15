import type { Polyline } from './sampler';

/** Appearance of one plotted curve. */
export interface CurveStyle {
  readonly color: string;
  /** Stroke width in CSS pixels. */
  readonly width: number;
  readonly dash?: readonly number[];
}

export const DEFAULT_CURVE_WIDTH = 2;

/**
 * Strokes sampled polylines.
 *
 * Points arrive as flat Float64Arrays in world coordinates, and the caller
 * supplies the world-to-screen transform, so no intermediate objects are
 * allocated per point per frame.
 */
export function drawCurve(
  ctx: CanvasRenderingContext2D,
  segments: readonly Polyline[],
  style: CurveStyle,
  toScreenX: (x: number) => number,
  toScreenY: (y: number) => number,
): void {
  if (segments.length === 0) return;

  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (style.dash !== undefined) ctx.setLineDash([...style.dash]);

  ctx.beginPath();
  for (const segment of segments) {
    if (segment.length < 4) continue;
    ctx.moveTo(toScreenX(segment[0]!), toScreenY(segment[1]!));
    for (let i = 2; i < segment.length; i += 2) {
      ctx.lineTo(toScreenX(segment[i]!), toScreenY(segment[i + 1]!));
    }
  }
  ctx.stroke();
  ctx.restore();
}
