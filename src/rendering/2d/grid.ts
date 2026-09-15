import { axisTicks, formatTick } from './ticks';
import type { GraphTheme } from './theme';
import { bounds, toScreenX, toScreenY, type Viewport } from './viewport';

/**
 * Draws the grid, the axes and their tick labels.
 *
 * Labels follow their axis while it is on screen and stick to the edge of the
 * canvas once it is not, so the numbers stay readable however far the view is
 * panned.
 */

const LABEL_FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
const LABEL_MARGIN = 6;
const AXIS_WIDTH = 1.25;
const TICK_LENGTH = 4;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  theme: GraphTheme,
): void {
  const view = bounds(viewport);
  const xAxis = axisTicks(view.xMin, view.xMax, viewport.scale.x);
  const yAxis = axisTicks(view.yMin, view.yMax, viewport.scale.y);
  const { width, height } = viewport.size;

  ctx.save();

  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.gridMinor;
  ctx.beginPath();
  for (const x of xAxis.minor) verticalLine(ctx, viewport, x, height);
  for (const y of yAxis.minor) horizontalLine(ctx, viewport, y, width);
  ctx.stroke();

  ctx.strokeStyle = theme.gridMajor;
  ctx.beginPath();
  for (const x of xAxis.major) verticalLine(ctx, viewport, x, height);
  for (const y of yAxis.major) horizontalLine(ctx, viewport, y, width);
  ctx.stroke();

  // Axes.
  const originX = toScreenX(viewport, 0);
  const originY = toScreenY(viewport, 0);
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = AXIS_WIDTH;
  ctx.beginPath();
  if (originY >= 0 && originY <= height) {
    ctx.moveTo(0, snap(originY));
    ctx.lineTo(width, snap(originY));
  }
  if (originX >= 0 && originX <= width) {
    ctx.moveTo(snap(originX), 0);
    ctx.lineTo(snap(originX), height);
  }
  ctx.stroke();

  drawXLabels(ctx, viewport, theme, xAxis.major, xAxis.decimals, originY);
  drawYLabels(ctx, viewport, theme, yAxis.major, yAxis.decimals, originX);

  ctx.restore();
}

function verticalLine(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  x: number,
  height: number,
): void {
  const screenX = snap(toScreenX(viewport, x));
  ctx.moveTo(screenX, 0);
  ctx.lineTo(screenX, height);
}

function horizontalLine(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  y: number,
  width: number,
): void {
  const screenY = snap(toScreenY(viewport, y));
  ctx.moveTo(0, screenY);
  ctx.lineTo(width, screenY);
}

/** Half-pixel alignment keeps hairlines crisp. */
function snap(value: number): number {
  return Math.round(value) + 0.5;
}

function drawXLabels(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  theme: GraphTheme,
  ticks: readonly number[],
  decimals: number,
  originY: number,
): void {
  const { width, height } = viewport.size;
  const axisOnScreen = originY >= 0 && originY <= height;
  const baseline = clamp(originY + 14, 12, height - 4);

  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  for (const value of ticks) {
    if (value === 0) continue;
    const x = toScreenX(viewport, value);
    if (x < LABEL_MARGIN || x > width - LABEL_MARGIN) continue;
    // Cull labels that would be cut off by the edge of the canvas.
    const text = formatTick(value, decimals);
    const halfWidth = ctx.measureText(text).width / 2;
    if (x - halfWidth < LABEL_MARGIN || x + halfWidth > width - LABEL_MARGIN) continue;
    if (axisOnScreen) {
      ctx.strokeStyle = theme.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(snap(x), originY - TICK_LENGTH);
      ctx.lineTo(snap(x), originY + TICK_LENGTH);
      ctx.stroke();
    }
    label(ctx, theme, text, x, baseline);
  }
}

function drawYLabels(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  theme: GraphTheme,
  ticks: readonly number[],
  decimals: number,
  originX: number,
): void {
  const { width, height } = viewport.size;
  const axisOnScreen = originX >= 0 && originX <= width;

  ctx.font = LABEL_FONT;
  ctx.textBaseline = 'middle';

  // Right-align beside the axis, unless the axis has left the canvas.
  const pinnedLeft = originX < 40;
  const textX = pinnedLeft ? clamp(originX + 8, 8, width - 8) : clamp(originX - 8, 8, width - 8);
  ctx.textAlign = pinnedLeft ? 'left' : 'right';

  for (const value of ticks) {
    const y = toScreenY(viewport, value);
    if (y < LABEL_MARGIN || y > height - LABEL_MARGIN) continue;
    const text = formatTick(value, decimals);
    const textWidth = ctx.measureText(text).width;
    const leftEdge = pinnedLeft ? textX : textX - textWidth;
    if (leftEdge < LABEL_MARGIN || leftEdge + textWidth > width - LABEL_MARGIN) continue;
    if (axisOnScreen && value !== 0) {
      ctx.strokeStyle = theme.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX - TICK_LENGTH, snap(y));
      ctx.lineTo(originX + TICK_LENGTH, snap(y));
      ctx.stroke();
    }
    label(ctx, theme, text, textX, y);
  }
}

/** Draws text with a halo so it stays legible on top of curves. */
function label(
  ctx: CanvasRenderingContext2D,
  theme: GraphTheme,
  text: string,
  x: number,
  y: number,
): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = theme.labelHalo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = theme.label;
  ctx.fillText(text, x, y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
