/**
 * Viewport: the mapping between world (mathematical) coordinates and screen
 * (CSS pixel) coordinates.
 *
 * The viewport is stored as a centre plus a pixels-per-unit scale rather than
 * as bounds, so resizing the window reveals more of the plane instead of
 * stretching it, and repeated zooming does not accumulate rounding error in
 * the aspect ratio.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Bounds {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
}

export interface Viewport {
  /** World coordinate at the centre of the canvas. */
  readonly center: Point;
  /** Pixels per world unit, per axis. Equal values mean an undistorted plane. */
  readonly scale: Point;
  /** Canvas size in CSS pixels. */
  readonly size: Size;
}

/** Zoom is clamped so the scale cannot collapse to 0 or overflow to Infinity. */
export const MIN_SCALE = 1e-9;
export const MAX_SCALE = 1e12;

export interface CreateViewportOptions {
  readonly size: Size;
  /** World-space width to fit horizontally. Defaults to 20 units. */
  readonly spanX?: number;
  readonly center?: Point;
}

export function createViewport(options: CreateViewportOptions): Viewport {
  const { width, height } = normaliseSize(options.size);
  const spanX = options.spanX !== undefined && options.spanX > 0 ? options.spanX : 20;
  const scale = clampScale(width / spanX);
  return {
    center: options.center ?? { x: 0, y: 0 },
    // Equal scales on both axes, so a circle looks like a circle.
    scale: { x: scale, y: scale },
    size: { width, height },
  };
}

/** Guards against zero-sized canvases during layout. */
function normaliseSize(size: Size): Size {
  return {
    width: Number.isFinite(size.width) && size.width > 0 ? size.width : 1,
    height: Number.isFinite(size.height) && size.height > 0 ? size.height : 1,
  };
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function bounds(viewport: Viewport): Bounds {
  const halfWidth = viewport.size.width / 2 / viewport.scale.x;
  const halfHeight = viewport.size.height / 2 / viewport.scale.y;
  return {
    xMin: viewport.center.x - halfWidth,
    xMax: viewport.center.x + halfWidth,
    yMin: viewport.center.y - halfHeight,
    yMax: viewport.center.y + halfHeight,
  };
}

export function toScreenX(viewport: Viewport, x: number): number {
  return viewport.size.width / 2 + (x - viewport.center.x) * viewport.scale.x;
}

export function toScreenY(viewport: Viewport, y: number): number {
  // Screen y grows downwards.
  return viewport.size.height / 2 - (y - viewport.center.y) * viewport.scale.y;
}

export function toWorldX(viewport: Viewport, screenX: number): number {
  return viewport.center.x + (screenX - viewport.size.width / 2) / viewport.scale.x;
}

export function toWorldY(viewport: Viewport, screenY: number): number {
  return viewport.center.y - (screenY - viewport.size.height / 2) / viewport.scale.y;
}

export function toScreen(viewport: Viewport, point: Point): Point {
  return { x: toScreenX(viewport, point.x), y: toScreenY(viewport, point.y) };
}

export function toWorld(viewport: Viewport, point: Point): Point {
  return { x: toWorldX(viewport, point.x), y: toWorldY(viewport, point.y) };
}

/** Moves the view by a screen-space drag, in CSS pixels. */
export function pan(viewport: Viewport, dxPixels: number, dyPixels: number): Viewport {
  return {
    ...viewport,
    center: {
      x: viewport.center.x - dxPixels / viewport.scale.x,
      y: viewport.center.y + dyPixels / viewport.scale.y,
    },
  };
}

export interface ZoomOptions {
  /** Which axes the zoom applies to. Defaults to both. */
  readonly axis?: 'both' | 'x' | 'y';
}

/**
 * Zooms by `factor` (greater than 1 zooms in) while keeping the world point
 * under `anchor` (a screen position) fixed.
 */
export function zoomAt(
  viewport: Viewport,
  anchor: Point,
  factor: number,
  options: ZoomOptions = {},
): Viewport {
  if (!Number.isFinite(factor) || factor <= 0) return viewport;
  const axis = options.axis ?? 'both';

  const worldAnchor = toWorld(viewport, anchor);
  const scaleX = axis === 'y' ? viewport.scale.x : clampScale(viewport.scale.x * factor);
  const scaleY = axis === 'x' ? viewport.scale.y : clampScale(viewport.scale.y * factor);

  return {
    ...viewport,
    scale: { x: scaleX, y: scaleY },
    center: {
      x: worldAnchor.x - (anchor.x - viewport.size.width / 2) / scaleX,
      y: worldAnchor.y + (anchor.y - viewport.size.height / 2) / scaleY,
    },
  };
}

/** Zooms about the centre of the canvas. */
export function zoomCenter(viewport: Viewport, factor: number, options: ZoomOptions = {}): Viewport {
  const anchor = { x: viewport.size.width / 2, y: viewport.size.height / 2 };
  return zoomAt(viewport, anchor, factor, options);
}

/** Keeps the scale and centre while adopting a new canvas size. */
export function resize(viewport: Viewport, size: Size): Viewport {
  return { ...viewport, size: normaliseSize(size) };
}

/** Restores equal scales on both axes, keeping the x scale. */
export function equaliseAxes(viewport: Viewport): Viewport {
  return { ...viewport, scale: { x: viewport.scale.x, y: viewport.scale.x } };
}

export interface FitBoundsOptions {
  /** Fraction of the canvas left empty around the fitted region. */
  readonly padding?: number;
  /** Force equal scales on both axes. */
  readonly preserveAspect?: boolean;
}

/** Frames a world-space region, used by "reset view" and autoscaling. */
export function fitBounds(
  viewport: Viewport,
  target: Bounds,
  options: FitBoundsOptions = {},
): Viewport {
  const padding = options.padding ?? 0.05;
  const { width, height } = viewport.size;

  const spanX = Math.abs(target.xMax - target.xMin);
  const spanY = Math.abs(target.yMax - target.yMin);
  const usableX = width * (1 - 2 * padding);
  const usableY = height * (1 - 2 * padding);

  let scaleX = spanX > 0 ? usableX / spanX : viewport.scale.x;
  let scaleY = spanY > 0 ? usableY / spanY : viewport.scale.y;

  if (options.preserveAspect ?? true) {
    const shared = Math.min(scaleX, scaleY);
    scaleX = shared;
    scaleY = shared;
  }

  return {
    ...viewport,
    scale: { x: clampScale(scaleX), y: clampScale(scaleY) },
    center: { x: (target.xMin + target.xMax) / 2, y: (target.yMin + target.yMax) / 2 },
  };
}

/** True when the two viewports would render identically. */
export function viewportsEqual(a: Viewport, b: Viewport): boolean {
  return (
    a.center.x === b.center.x &&
    a.center.y === b.center.y &&
    a.scale.x === b.scale.x &&
    a.scale.y === b.scale.y &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height
  );
}
