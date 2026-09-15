import { formatNumber } from '@/core/expression/print';
import type { WorkspaceState } from '@/core/workspace/evaluate';
import type { ItemResult } from '@/core/workspace/types';
import { resultCurve } from '@/core/workspace/types';
import type { SliderConfig } from '@/core/workspace/slider';
import { bounds, type Viewport } from '@/rendering/2d/viewport';
import {
  MAX_LINE_WIDTH,
  MIN_LINE_WIDTH,
  type ExpressionEntry,
} from '@/ui/state/entries';
import { FunctionReference } from './FunctionReference';

export interface InspectorProps {
  readonly entry: ExpressionEntry | null;
  readonly result: ItemResult | null;
  readonly slider: SliderConfig | null;
  readonly workspace: WorkspaceState;
  readonly entries: readonly ExpressionEntry[];
  readonly palette: readonly string[];
  readonly viewport: Viewport;
  readonly onPatch: (patch: Partial<Omit<ExpressionEntry, 'id'>>) => void;
  readonly onResetView: () => void;
  readonly onEqualiseAxes: () => void;
}

/** Properties of the selected entry, its place in the dependency graph, and the view. */
export function Inspector(props: InspectorProps): React.JSX.Element {
  const { entry, result, slider, workspace, entries, palette, viewport } = props;
  const view = bounds(viewport);
  const drawable = result !== null && resultCurve(result) !== null;

  return (
    <section className="panel inspector" aria-label="Inspector">
      <header className="panel-header">
        <h2>Inspector</h2>
      </header>

      <div className="panel-scroll">
        <div className="field-group">
          <h3>Selection</h3>
          {entry === null || result === null ? (
            <p className="hint">Select an expression to inspect it.</p>
          ) : (
            <>
              <dl className="readout">
                <dt>Entry</dt>
                <dd>{describeEntry(result)}</dd>
                <dt>Status</dt>
                <dd>{describeStatus(result)}</dd>
                <Dependencies result={result} workspace={workspace} entries={entries} />
              </dl>

              {slider !== null && (
                <SliderSettings slider={slider} onPatch={props.onPatch} />
              )}

              {drawable && (
                <>
                  <label className="field">
                    <span>Colour</span>
                    <span className="palette">
                      {palette.map((color, index) => (
                        <button
                          key={color}
                          type="button"
                          className="palette-swatch"
                          style={{ '--swatch-color': color } as React.CSSProperties}
                          aria-label={`Colour ${index + 1}`}
                          aria-pressed={entry.colorIndex === index}
                          data-active={entry.colorIndex === index}
                          onClick={() => props.onPatch({ colorIndex: index })}
                        />
                      ))}
                    </span>
                  </label>

                  <label className="field">
                    <span>Line width</span>
                    <input
                      type="range"
                      min={MIN_LINE_WIDTH}
                      max={MAX_LINE_WIDTH}
                      step={0.5}
                      value={entry.lineWidth}
                      onChange={(event) =>
                        props.onPatch({ lineWidth: Number(event.target.value) })
                      }
                    />
                    <output>{entry.lineWidth}px</output>
                  </label>

                  <label className="field checkbox">
                    <input
                      type="checkbox"
                      checked={entry.visible}
                      onChange={(event) => props.onPatch({ visible: event.target.checked })}
                    />
                    <span>Visible</span>
                  </label>
                </>
              )}
            </>
          )}
        </div>

        <div className="field-group">
          <h3>View</h3>
          <dl className="readout">
            <dt>x</dt>
            <dd className="mono">
              [{formatNumber(round(view.xMin))}, {formatNumber(round(view.xMax))}]
            </dd>
            <dt>y</dt>
            <dd className="mono">
              [{formatNumber(round(view.yMin))}, {formatNumber(round(view.yMax))}]
            </dd>
            <dt>Scale</dt>
            <dd className="mono">
              {formatNumber(round(viewport.scale.x))} / {formatNumber(round(viewport.scale.y))} px
              per unit
            </dd>
          </dl>
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={props.onResetView}>
              Reset view
            </button>
            <button type="button" className="ghost-button" onClick={props.onEqualiseAxes}>
              Equalise axes
            </button>
          </div>
        </div>

        <FunctionReference />
      </div>
    </section>
  );
}

/** What this entry reads and what reads it, straight from the dependency graph. */
function Dependencies(props: {
  result: ItemResult;
  workspace: WorkspaceState;
  entries: readonly ExpressionEntry[];
}): React.JSX.Element | null {
  const { result, workspace, entries } = props;
  const dependents = workspace.graph.dependents.get(result.id) ?? [];
  if (result.dependencies.length === 0 && dependents.length === 0) return null;

  const label = (id: string) => {
    const other = workspace.results.get(id);
    if (other?.kind === 'value' || other?.kind === 'function') return other.name;
    const index = entries.findIndex((entry) => entry.id === id);
    return index >= 0 ? `line ${index + 1}` : id;
  };

  return (
    <>
      {result.dependencies.length > 0 && (
        <>
          <dt>Reads</dt>
          <dd className="mono">{result.dependencies.map(label).join(', ')}</dd>
        </>
      )}
      {dependents.length > 0 && (
        <>
          <dt>Used by</dt>
          <dd className="mono">{dependents.map(label).join(', ')}</dd>
        </>
      )}
    </>
  );
}

function SliderSettings(props: {
  slider: SliderConfig;
  onPatch: (patch: Partial<Omit<ExpressionEntry, 'id'>>) => void;
}): React.JSX.Element {
  const { slider, onPatch } = props;
  const set = (patch: Partial<SliderConfig>) => onPatch({ slider: { ...slider, ...patch } });

  return (
    <div className="slider-settings">
      <label className="field">
        <span>Minimum</span>
        <input
          type="number"
          value={slider.min}
          onChange={(event) => set({ min: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>Maximum</span>
        <input
          type="number"
          value={slider.max}
          onChange={(event) => set({ max: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>Step</span>
        <input
          type="number"
          min={0}
          step={0.01}
          value={slider.step}
          onChange={(event) => set({ step: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>Speed</span>
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.25}
          value={slider.speed}
          onChange={(event) => set({ speed: Number(event.target.value) })}
        />
        <output>{slider.speed}×</output>
      </label>
    </div>
  );
}

function describeEntry(result: ItemResult): string {
  switch (result.kind) {
    case 'value':
      return `${result.name} = ${formatNumber(result.value)}`;
    case 'function':
      return `${result.name}(${result.params.join(', ')})`;
    case 'curve':
      return result.curve.label;
    case 'error':
    case 'empty':
      return '—';
  }
}

function describeStatus(result: ItemResult): string {
  switch (result.kind) {
    case 'value':
      return result.literal === null ? 'computed value' : 'parameter';
    case 'function':
      return result.curve === null ? 'defined (not graphable in 2D)' : 'plotted';
    case 'curve':
      return `plotted against ${result.curve.variable}`;
    case 'empty':
      return 'empty';
    case 'error':
      return result.message;
  }
}

function round(value: number): number {
  return Number(value.toPrecision(6));
}
