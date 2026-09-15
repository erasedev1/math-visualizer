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
import { resultCurve } from '@/core/workspace/types';
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
  nextColorIndex,
  removeEntry,
  updateEntry,
  withValue,
  type ExpressionEntry,
} from './state/entries';

const INITIAL_SOURCES = ['a = 2', 'b = 3', 'f(x) = a sin(b x)', 'x^2'];

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
      if (result?.kind !== 'value' || result.literal === null) return null;
      return normaliseSlider(entry.slider ?? defaultSliderFor(result.value));
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
    return { curves };
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
        const config = normaliseSlider(entry.slider ?? defaultSliderFor(result.value));
        const snapped = snapToSlider(value, config);
        return previous.map((candidate) =>
          candidate.id === id ? withValue(candidate, result.name, snapped, config.step) : candidate,
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
      const config = normaliseSlider(entry.slider ?? defaultSliderFor(result.value));
      return updateEntry(previous, id, { slider: { ...config, playing: !config.playing } });
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
    (result) => result.kind === 'value',
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
        />

        <GraphCanvas
          viewport={viewport}
          onViewportChange={setViewport}
          scene={scene}
          theme={theme}
          initialSpanX={INITIAL_SPAN_X}
          onCursorMove={setCursor}
          onRender={setStats}
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
        plotted={scene.curves.length}
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
    if (result?.kind !== 'value' || result.literal === null) return entry;

    const step = advanceSlider(result.value, config, seconds);
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

function readTheme(): ThemeName {
  const attribute = document.documentElement.dataset.theme;
  return attribute === 'light' ? 'light' : 'dark';
}
