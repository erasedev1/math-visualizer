import { drawCurve, type CurveStyle } from './curves';
import { drawGrid } from './grid';
import { sampleFunction, type SampleOptions } from './sampler';
import type { GraphTheme } from './theme';
import { bounds, toScreenX, toScreenY, type Viewport } from './viewport';

/**
 * A scene is the renderable form of the workspace: plain data plus compiled
 * functions. The renderer knows nothing about expressions, React or the
 * document model, which keeps it reusable for export and for tests.
 */

export interface SceneCurve {
  readonly id: string;
  /** Compiled function of one variable, already bound to its parameter. */
  readonly evaluate: (x: number) => number;
  readonly style: CurveStyle;
}

export interface Scene {
  readonly curves: readonly SceneCurve[];
}

/** Lower quality is used while the user is panning or zooming. */
export type RenderQuality = 'interactive' | 'full';

export interface RenderOptions {
  readonly quality?: RenderQuality;
}

const QUALITY: Record<RenderQuality, Pick<SampleOptions, 'samplesPerPixel' | 'maxDepth' | 'tolerance'>> = {
  interactive: { samplesPerPixel: 0.5, maxDepth: 4, tolerance: 0.6 },
  full: { samplesPerPixel: 1, maxDepth: 7, tolerance: 0.25 },
};

export interface RenderStats {
  readonly curves: number;
  readonly evaluations: number;
  readonly milliseconds: number;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  scene: Scene,
  theme: GraphTheme,
  options: RenderOptions = {},
): RenderStats {
  const started = performance.now();
  const view = bounds(viewport);
  const quality = QUALITY[options.quality ?? 'full'];

  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, viewport.size.width, viewport.size.height);
  ctx.restore();

  drawGrid(ctx, viewport, theme);

  const mapX = (x: number) => toScreenX(viewport, x);
  const mapY = (y: number) => toScreenY(viewport, y);

  let evaluations = 0;
  for (const curve of scene.curves) {
    const sampled = sampleFunction(curve.evaluate, {
      xMin: view.xMin,
      xMax: view.xMax,
      yMin: view.yMin,
      yMax: view.yMax,
      pixelsPerUnitX: viewport.scale.x,
      pixelsPerUnitY: viewport.scale.y,
      ...quality,
    });
    evaluations += sampled.evaluations;
    drawCurve(ctx, sampled.segments, curve.style, mapX, mapY);
  }

  return {
    curves: scene.curves.length,
    evaluations,
    milliseconds: performance.now() - started,
  };
}
