import { clipLine, type ClipForm } from './clip';
import type { GraphTheme } from './theme';
import { bounds, toScreenX, toScreenY, type Point, type Viewport } from './viewport';

/**
 * Geometric objects on the canvas.
 *
 * The renderer keeps its own shape types rather than importing the workspace
 * value union, so drawing stays independent of how values happen to be
 * modelled. The caller translates one into the other.
 */

export interface ObjectStyle {
  readonly color: string;
  readonly width: number;
  /** Drawn beside the object when present. */
  readonly label?: string;
}

interface SceneObjectBase {
  readonly id: string;
  readonly style: ObjectStyle;
}

export interface ScenePoint extends SceneObjectBase {
  readonly kind: 'point';
  readonly at: Point;
  /** Draggable points are drawn with a ring to say so. */
  readonly movable: boolean;
}

export interface SceneLine extends SceneObjectBase {
  readonly kind: 'line';
  readonly form: ClipForm;
  readonly from: Point;
  readonly to: Point;
}

export interface SceneCircle extends SceneObjectBase {
  readonly kind: 'circle';
  readonly center: Point;
  readonly radius: number;
}

export interface ScenePolygon extends SceneObjectBase {
  readonly kind: 'polygon';
  readonly vertices: readonly Point[];
}

export type SceneObject = ScenePoint | SceneLine | SceneCircle | ScenePolygon;

/** Radius of a plotted point, in CSS pixels. */
export const POINT_RADIUS = 4.5;
const LABEL_FONT = '12px ui-sans-serif, system-ui, sans-serif';
const LABEL_OFFSET = 9;
const POLYGON_FILL_ALPHA = 0.14;

export function drawObjects(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  objects: readonly SceneObject[],
  theme: GraphTheme,
): void {
  const view = bounds(viewport);
  const x = (value: number) => toScreenX(viewport, value);
  const y = (value: number) => toScreenY(viewport, value);

  // Shapes first, then points, so a vertex is never hidden under an edge.
  for (const object of objects) {
    if (object.kind === 'point') continue;
    drawShape(ctx, object, view, x, y);
  }
  for (const object of objects) {
    if (object.kind === 'point') drawPoint(ctx, object, theme, x, y);
  }
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  object: SceneLine | SceneCircle | ScenePolygon,
  view: ReturnType<typeof bounds>,
  x: (value: number) => number,
  y: (value: number) => number,
): void {
  ctx.save();
  ctx.strokeStyle = object.style.color;
  ctx.fillStyle = object.style.color;
  ctx.lineWidth = object.style.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (object.kind) {
    case 'line': {
      const visible = clipLine(object.from, object.to, object.form, view);
      if (visible !== null) {
        ctx.beginPath();
        ctx.moveTo(x(visible.from.x), y(visible.from.y));
        ctx.lineTo(x(visible.to.x), y(visible.to.y));
        ctx.stroke();
      }
      break;
    }

    case 'circle': {
      if (object.radius > 0 && Number.isFinite(object.radius)) {
        // Scales may differ per axis, so an ellipse is the general case.
        ctx.beginPath();
        ctx.ellipse(
          x(object.center.x),
          y(object.center.y),
          Math.abs(object.radius * (x(1) - x(0))),
          Math.abs(object.radius * (y(1) - y(0))),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      break;
    }

    case 'polygon': {
      const [first, ...rest] = object.vertices;
      if (first !== undefined && rest.length > 0) {
        ctx.beginPath();
        ctx.moveTo(x(first.x), y(first.y));
        for (const vertex of rest) ctx.lineTo(x(vertex.x), y(vertex.y));
        ctx.closePath();
        ctx.globalAlpha = POLYGON_FILL_ALPHA;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
      }
      break;
    }
  }

  ctx.restore();
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  object: ScenePoint,
  theme: GraphTheme,
  x: (value: number) => number,
  y: (value: number) => number,
): void {
  if (!Number.isFinite(object.at.x) || !Number.isFinite(object.at.y)) return;

  const screenX = x(object.at.x);
  const screenY = y(object.at.y);

  ctx.save();
  ctx.fillStyle = object.style.color;
  ctx.strokeStyle = object.style.color;

  ctx.beginPath();
  ctx.arc(screenX, screenY, POINT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if (object.movable) {
    // A halo marks the points that can be dragged.
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, POINT_RADIUS + 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const { label } = object.style;
  if (label !== undefined && label !== '') {
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.labelHalo;
    ctx.strokeText(label, screenX + LABEL_OFFSET, screenY - LABEL_OFFSET + 4);
    ctx.fillText(label, screenX + LABEL_OFFSET, screenY - LABEL_OFFSET + 4);
  }

  ctx.restore();
}
