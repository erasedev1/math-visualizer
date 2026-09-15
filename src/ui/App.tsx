import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_WORKSPACE,
  evaluateWorkspace,
  type WorkspaceState,
} from '@/core/workspace/evaluate';
import {
  advanceSlider,
  defaultSliderFor,
  normaliseSlider,
  snapToSlider,
  type SliderConfig,
} from '@/core/workspace/slider';
import { resultCurve, resultShape } from '@/core/workspace/types';
import type { Value } from '@/core/values/types';
import type { SceneObject } from '@/rendering/2d/objects';
import { formatNumber } from '@/core/expression/print';
import { graphTheme, seriesColor, type ThemeName } from '@/rendering/2d/theme';
import type { RenderStats, Scene } from '@/rendering/2d/scene';
import { createViewport, equaliseAxes, type Point, type Viewport } from '@/rendering/2d/viewport';
import { ExpressionPanel } from './components/ExpressionPanel';
import { GraphCanvas } from './components/GraphCanvas';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import {
  createEntry,
  insertEntryAfter,
  matrixSource,
  nextColorIndex,
  removeEntry,
  updateEntry,
  vectorSource,
  withBody,
  withValue,
  type ExpressionEntry,
} from './state/entries';

const INITIAL_SOURCES = [
  'a = 2',
  'f(x) = a sin(x)',
  'A = (-4, -2)',
  'B = (5, 3)',
  's = segment(A, B)',
  'v = <3, 4>',
  'M = [[1, 2], [3, 4]]',
  'd = det(M)',
];

function initialEntries(): ExpressionEntry[] {
  return INITIAL_SOURCES.map((source, index) => createEntry(source, index));
}

const INITIAL_SPAN_X = 20;

function initialViewport(): Viewport {
  return createViewport({ size: { width: 1, height: 1 }, spanX: INITIAL_SPAN_X });
}

export function App(): React.JSX.Element {
  const [entries, setEntries] = useState<ExpressionEntry[]>(initialEntries);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>(initialViewport);
  // Dragging reads the live viewport to decide how precisely to write
  // coordinates, without making the drag callback change every frame.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [theme, setTheme] = useState<ThemeName>(() => readTheme());
  const [cursor, setCursor] = useState<Point | null>(null);
  const [stats, setStats] = useState<RenderStats | null>(null);

  const palette = graphTheme(theme).series;

  // The previous evaluation is kept so the next one can reuse the results and
  // compiled closures a change cannot reach. It is a cache, so a discarded
  // render writing to it costs at most some recomputation, never correctness.
  const previousRef = useRef<WorkspaceState>(EMPTY_WORKSPACE);
  const workspace = useMemo(() => {
    const next = evaluateWorkspace(entries, previousRef.current);
    previousRef.current = next;
    return next;
  }, [entries]);

  const colorOf = useCallback(
    (entry: ExpressionEntry) => seriesColor(graphTheme(theme), entry.colorIndex),
    [theme],
  );

  /** A parameter gets a slider once its definition is a plain number. */
  const sliderOf = useCallback(
    (entry: ExpressionEntry): SliderConfig | null => {
      const result = workspace.results.get(entry.id);
      if (result?.kind !== 'value' || result.literal?.kind !== 'number') return null;
      return normaliseSlider(entry.slider ?? defaultSliderFor(result.literal.value));
    },
    [workspace],
  );

  const scene = useMemo<Scene>(() => {
    const curves = entries.flatMap((entry) => {
      const result = workspace.results.get(entry.id);
      const curve = result === undefined ? null : resultCurve(result);
      if (!entry.visible || curve === null) return [];
      return [
        {
          id: entry.id,
          evaluate: curve.evaluate,
          style: { color: colorOf(entry), width: entry.lineWidth },
        },
      ];
    });

    const objects = entries.flatMap((entry) => {
      const result = workspace.results.get(entry.id);
      const shape = result === undefined ? null : resultShape(result);
      if (!entry.visible || shape === null || result?.kind !== 'value') return [];
      const style = {
        color: colorOf(entry),
        width: entry.lineWidth,
        ...(result.name === null ? {} : { label: result.name }),
      };
      const movable =
        result.literal?.kind === 'point' || result.literal?.kind === 'vector';
      return toSceneObjects(entry.id, shape, style, movable);
    });

    return { curves, objects };
  }, [entries, workspace, colorOf]);

  const handleAdd = useCallback(
    (afterId: string | null) => {
      setEntries((previous) => {
        const entry = createEntry('', nextColorIndex(previous, palette.length));
        setSelectedId(entry.id);
        setFocusId(entry.id);
        return insertEntryAfter(previous, afterId, entry);
      });
    },
    [palette.length],
  );

  const handleChange = useCallback((id: string, source: string) => {
    setFocusId(null);
    setEntries((previous) => updateEntry(previous, id, { source }));
  }, []);

  const handlePatch = useCallback(
    (patch: Partial<Omit<ExpressionEntry, 'id'>>) => {
      if (selectedId === null) return;
      setEntries((previous) => updateEntry(previous, selectedId, patch));
    },
    [selectedId],
  );

  const handleRemove = useCallback(
    (id: string) => {
      setEntries((previous) => removeEntry(previous, id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  const handleToggleVisible = useCallback((id: string) => {
    setEntries((previous) => {
      const entry = previous.find((candidate) => candidate.id === id);
      if (entry === undefined) return previous;
      return updateEntry(previous, id, { visible: !entry.visible });
    });
  }, []);

  /** Dragging a slider rewrites the definition it belongs to. */
  const handleSliderValue = useCallback(
    (id: string, value: number) => {
      setEntries((previous) => {
        const entry = previous.find((candidate) => candidate.id === id);
        const result = previousRef.current.results.get(id);
        if (entry === undefined || result?.kind !== 'value') return previous;
        if (result.literal?.kind !== 'number' || result.name === null) return previous;
        const config = normaliseSlider(entry.slider ?? defaultSliderFor(result.literal.value));
        const snapped = snapToSlider(value, config);
        return previous.map((candidate) =>
          candidate.id === id ? withValue(candidate, result.name!, snapped, config.step) : candidate,
        );
      });
    },
    [],
  );

  const handleTogglePlay = useCallback((id: string) => {
    setEntries((previous) => {
      const entry = previous.find((candidate) => candidate.id === id);
      const result = previousRef.current.results.get(id);
      if (entry === undefined || result?.kind !== 'value') return previous;
      if (result.literal?.kind !== 'number') return previous;
      const config = normaliseSlider(entry.slider ?? defaultSliderFor(result.literal.value));
      return updateEntry(previous, id, { slider: { ...config, playing: !config.playing } });
    });
  }, []);

  /** Dragging a point moves it; dragging an arrow's tip changes the vector. */
  const handleObjectDrag = useCallback((id: string, world: Point) => {
    setEntries((previous) => {
      const entry = previous.find((candidate) => candidate.id === id);
      const result = previousRef.current.results.get(id);
      if (entry === undefined || result?.kind !== 'value' || result.name === null) return previous;

      const decimals = coordinateDecimals(viewportRef.current);
      const x = round(world.x, decimals);
      const y = round(world.y, decimals);

      if (result.literal?.kind === 'point') {
        return updateEntry(previous, id, {
          source: `${result.name} = (${formatNumber(x)}, ${formatNumber(y)})`,
        });
      }

      if (result.literal?.kind === 'vector' && result.value.kind === 'vector') {
        // The tip follows the pointer, so the components are measured from
        // wherever the arrow is anchored.
        const { anchor } = result.value;
        const body = vectorSource([round(x - anchor.x, decimals), round(y - anchor.y, decimals)]);
        return previous.map((candidate) =>
          candidate.id === id ? withBody(candidate, result.name!, body) : candidate,
        );
      }

      return previous;
    });
  }, []);

  /** Editing a cell rewrites the matrix literal it came from. */
  const handleMatrixChange = useCallback((id: string, rows: readonly (readonly number[])[]) => {
    setEntries((previous) => {
      const result = previousRef.current.results.get(id);
      if (result?.kind !== 'value' || result.literal?.kind !== 'matrix' || result.name === null) {
        return previous;
      }
      return previous.map((candidate) =>
        candidate.id === id ? withBody(candidate, result.name!, matrixSource(rows)) : candidate,
      );
    });
  }, []);

  const animating = entries.some((entry) => entry.slider?.playing === true);

  // One animation loop for every playing slider, driving them all through the
  // same dependency graph pass per frame.
  useEffect(() => {
    if (!animating) return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const seconds = Math.min(0.1, (now - last) / 1000);
      last = now;
      setEntries((previous) => advanceAll(previous, seconds, previousRef.current));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animating]);

  const handleResetView = useCallback(() => {
    setViewport((previous) => createViewport({ size: previous.size, spanX: INITIAL_SPAN_X }));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => {
      const next: ThemeName = previous === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;
  const problems = [...workspace.results.values()].filter(
    (result) => result.kind === 'error',
  ).length;
  const values = [...workspace.results.values()].filter(
    (result) => result.kind === 'value' && result.value.kind === 'number',
  ).length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Math Visualizer</h1>
            <p>Interactive mathematical workspace</p>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={handleResetView}>
            Reset view
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={toggleTheme}
            aria-label="Toggle colour theme"
          >
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </header>

      <main className="app-body">
        <ExpressionPanel
          entries={entries}
          results={workspace.results}
          sliderOf={sliderOf}
          colorOf={colorOf}
          selectedId={selectedId}
          focusId={focusId}
          onChange={handleChange}
          onSelect={setSelectedId}
          onToggleVisible={handleToggleVisible}
          onRemove={handleRemove}
          onAdd={handleAdd}
          onSliderValue={handleSliderValue}
          onTogglePlay={handleTogglePlay}
          onMatrixChange={handleMatrixChange}
        />

        <GraphCanvas
          viewport={viewport}
          onViewportChange={setViewport}
          scene={scene}
          theme={theme}
          initialSpanX={INITIAL_SPAN_X}
          onCursorMove={setCursor}
          onRender={setStats}
          onPointDrag={handleObjectDrag}
        />

        <Inspector
          entry={selectedEntry}
          result={selectedEntry === null ? null : workspace.results.get(selectedEntry.id) ?? null}
          slider={selectedEntry === null ? null : sliderOf(selectedEntry)}
          workspace={workspace}
          entries={entries}
          palette={palette}
          viewport={viewport}
          onPatch={handlePatch}
          onResetView={handleResetView}
          onEqualiseAxes={() => setViewport(equaliseAxes)}
        />
      </main>

      <StatusBar
        cursor={cursor}
        stats={stats}
        curves={scene.curves.length}
        shapes={scene.objects.length}
        values={values}
        problems={problems}
      />
    </div>
  );
}

/** Moves every playing slider on by one frame. */
function advanceAll(
  entries: ExpressionEntry[],
  seconds: number,
  workspace: WorkspaceState,
): ExpressionEntry[] {
  let changed = false;

  const next = entries.map((entry) => {
    const config = entry.slider;
    if (config === null || !config.playing) return entry;

    const result = workspace.results.get(entry.id);
    if (result?.kind !== 'value' || result.literal?.kind !== 'number') return entry;
    if (result.name === null) return entry;

    const step = advanceSlider(result.literal.value, config, seconds);
    changed = true;
    return withValue(
      { ...entry, slider: { ...config, direction: step.direction } },
      result.name,
      step.value,
      config.step,
    );
  });

  // Returning the same array when nothing moved lets React skip the render.
  return changed ? next : entries;
}

/**
 * Translates a workspace value into what the renderer draws. The renderer
 * keeps its own shape types, so this is the only place the two meet.
 */
function toSceneObjects(
  id: string,
  value: Value,
  style: { color: string; width: number; label?: string },
  movable: boolean,
): SceneObject[] {
  switch (value.kind) {
    case 'point':
      return [{ kind: 'point', id, at: { x: value.x, y: value.y }, movable, style }];
    case 'vector': {
      const [dx = 0, dy = 0] = value.components;
      // Only plane vectors have somewhere to be drawn.
      if (value.components.length !== 2) return [];
      return [
        {
          kind: 'vector',
          id,
          anchor: value.anchor,
          tip: { x: value.anchor.x + dx, y: value.anchor.y + dy },
          movable,
          style,
        },
      ];
    }
    case 'line':
      return [{ kind: 'line', id, form: value.form, from: value.from, to: value.to, style }];
    case 'circle':
      return [{ kind: 'circle', id, center: value.center, radius: value.radius, style }];
    case 'polygon':
      return [{ kind: 'polygon', id, vertices: value.vertices, style }];
    case 'number':
    case 'matrix':
      return [];
  }
}

/** Enough decimals to place a point where the pointer actually is. */
function coordinateDecimals(viewport: Viewport): number {
  const scale = Math.max(viewport.scale.x, viewport.scale.y);
  return Math.min(8, Math.max(0, Math.round(Math.log10(Math.max(scale, 1))) + 1));
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

function readTheme(): ThemeName {
  const attribute = document.documentElement.dataset.theme;
  return attribute === 'light' ? 'light' : 'dark';
}
