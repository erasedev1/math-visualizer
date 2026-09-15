import { useCallback, useEffect, useRef, useState } from 'react';
import { renderScene, type RenderStats, type Scene } from '@/rendering/2d/scene';
import { graphTheme, type ThemeName } from '@/rendering/2d/theme';
import {
  createViewport,
  resize,
  toWorld,
  viewportsEqual,
  zoomCenter,
  type Point,
  type Viewport,
} from '@/rendering/2d/viewport';
import { useElementSize } from '@/ui/hooks/useElementSize';
import { usePointerNavigation } from '@/ui/hooks/usePointerNavigation';

export interface GraphCanvasProps {
  readonly viewport: Viewport;
  readonly onViewportChange: (viewport: Viewport) => void;
  readonly scene: Scene;
  readonly theme: ThemeName;
  /**
   * World-space width to frame once the canvas has its real size. The viewport
   * cannot be framed before layout, because framing depends on pixel size.
   */
  readonly initialSpanX: number;
  readonly onCursorMove?: (world: Point | null) => void;
  readonly onRender?: (stats: RenderStats) => void;
}

/** How long after the last gesture the scene is redrawn at full quality. */
const SETTLE_MS = 140;

/**
 * The plotting surface.
 *
 * Rendering is driven by an animation frame that coalesces viewport, scene and
 * size changes, so a fast drag produces one draw per frame rather than one per
 * event. While a gesture is in flight the scene is sampled at reduced quality
 * and then redrawn sharply once the view settles.
 */
export function GraphCanvas(props: GraphCanvasProps): React.JSX.Element {
  const { viewport, onViewportChange, scene, theme, initialSpanX, onCursorMove, onRender } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = useElementSize(containerRef);

  const [interacting, setInteracting] = useState(false);
  const frameRef = useRef<number | null>(null);

  // Gestures read the latest viewport through a ref so a drag is never applied
  // to a stale value.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  usePointerNavigation(containerRef, {
    viewportRef,
    onChange: onViewportChange,
    onInteractingChange: setInteracting,
  });

  // The first real layout sets the framing; later ones only reveal more of the
  // plane, keeping the scale so a window resize never distorts the plot.
  const framedRef = useRef(false);
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const current = viewportRef.current;

    if (!framedRef.current) {
      framedRef.current = true;
      onViewportChange(
        createViewport({ size, spanX: initialSpanX, center: current.center }),
      );
      return;
    }

    const next = resize(current, size);
    if (!viewportsEqual(next, current)) onViewportChange(next);
  }, [size, initialSpanX, onViewportChange]);

  const draw = useCallback(
    (quality: 'interactive' | 'full') => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      const current = viewportRef.current;
      if (current.size.width === 0 || current.size.height === 0) return;

      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(current.size.width * ratio);
      const pixelHeight = Math.round(current.size.height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const ctx = canvas.getContext('2d');
      if (ctx === null) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const stats = renderScene(ctx, current, scene, graphTheme(theme), { quality });
      onRender?.(stats);
    },
    [scene, theme, onRender],
  );

  // One draw per frame, whatever produced the change.
  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      draw(interacting ? 'interactive' : 'full');
    });
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [draw, viewport, interacting]);

  // Redraw sharply once the view stops moving.
  useEffect(() => {
    if (interacting) return;
    const timer = window.setTimeout(() => draw('full'), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [interacting, draw, viewport]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (onCursorMove === undefined) return;
      const rect = event.currentTarget.getBoundingClientRect();
      onCursorMove(
        toWorld(viewportRef.current, {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }),
      );
    },
    [onCursorMove],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === '+' || event.key === '=') {
        onViewportChange(zoomCenter(viewportRef.current, 1.3));
        event.preventDefault();
      } else if (event.key === '-' || event.key === '_') {
        onViewportChange(zoomCenter(viewportRef.current, 1 / 1.3));
        event.preventDefault();
      }
    },
    [onViewportChange],
  );

  return (
    <div
      className="graph-canvas"
      ref={containerRef}
      role="img"
      aria-label="Graph canvas. Drag to pan, scroll to zoom."
      tabIndex={0}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onCursorMove?.(null)}
      onKeyDown={handleKeyDown}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
