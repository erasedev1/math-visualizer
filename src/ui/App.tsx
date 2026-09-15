import { useCallback, useMemo, useState } from 'react';
import { analyzeEntry, type Analysis } from '@/core/plot/analyze';
import { graphTheme, seriesColor, type ThemeName } from '@/rendering/2d/theme';
import type { RenderStats, Scene } from '@/rendering/2d/scene';
import {
  createViewport,
  equaliseAxes,
  type Point,
  type Viewport,
} from '@/rendering/2d/viewport';
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
  type ExpressionEntry,
} from './state/entries';

const INITIAL_SOURCES = ['x^2', 'sin(x)', '(x^2 + 1)/(x - 3)'];

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

  // Every entry is analysed once per change; the graph and the panels then
  // read the same result, so the list and the canvas can never disagree.
  const analyses = useMemo(() => {
    const result = new Map<string, Analysis>();
    for (const entry of entries) result.set(entry.id, analyzeEntry(entry.source));
    return result;
  }, [entries]);

  const colorOf = useCallback(
    (entry: ExpressionEntry) => seriesColor(graphTheme(theme), entry.colorIndex),
    [theme],
  );

  const scene = useMemo<Scene>(() => {
    const curves = entries.flatMap((entry) => {
      const analysis = analyses.get(entry.id);
      if (!entry.visible || analysis?.kind !== 'curve') return [];
      return [
        {
          id: entry.id,
          evaluate: analysis.evaluate,
          style: { color: colorOf(entry), width: entry.lineWidth },
        },
      ];
    });
    return { curves };
  }, [entries, analyses, colorOf]);

  const handleAdd = useCallback((afterId: string | null) => {
    setEntries((previous) => {
      const entry = createEntry('', nextColorIndex(previous, palette.length));
      setSelectedId(entry.id);
      setFocusId(entry.id);
      return insertEntryAfter(previous, afterId, entry);
    });
  }, [palette.length]);

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

  const handleResetView = useCallback(() => {
    setViewport((previous) =>
      createViewport({ size: previous.size, spanX: INITIAL_SPAN_X }),
    );
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => {
      const next: ThemeName = previous === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;
  const problems = [...analyses.values()].filter(
    (analysis) => analysis.kind === 'error' || analysis.kind === 'unsupported',
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
          analyses={analyses}
          colorOf={colorOf}
          selectedId={selectedId}
          focusId={focusId}
          onChange={handleChange}
          onSelect={setSelectedId}
          onToggleVisible={handleToggleVisible}
          onRemove={handleRemove}
          onAdd={handleAdd}
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
          analysis={selectedEntry === null ? null : analyses.get(selectedEntry.id) ?? null}
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
        problems={problems}
      />
    </div>
  );
}

function readTheme(): ThemeName {
  const attribute = document.documentElement.dataset.theme;
  return attribute === 'light' ? 'light' : 'dark';
}
