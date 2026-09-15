import type { Analysis } from '@/core/plot/analyze';
import type { ExpressionEntry } from '@/ui/state/entries';
import { MAX_LINE_WIDTH, MIN_LINE_WIDTH } from '@/ui/state/entries';
import { bounds, type Viewport } from '@/rendering/2d/viewport';
import { formatNumber } from '@/core/expression/print';
import { FunctionReference } from './FunctionReference';

export interface InspectorProps {
  readonly entry: ExpressionEntry | null;
  readonly analysis: Analysis | null;
  readonly palette: readonly string[];
  readonly viewport: Viewport;
  readonly onPatch: (patch: Partial<Omit<ExpressionEntry, 'id'>>) => void;
  readonly onResetView: () => void;
  readonly onEqualiseAxes: () => void;
}

/** Properties of the selected expression, plus the state of the view. */
export function Inspector(props: InspectorProps): React.JSX.Element {
  const { entry, analysis, palette, viewport } = props;
  const view = bounds(viewport);

  return (
    <section className="panel inspector" aria-label="Inspector">
      <header className="panel-header">
        <h2>Inspector</h2>
      </header>

      <div className="panel-scroll">
        <div className="field-group">
          <h3>Selection</h3>
          {entry === null || analysis === null ? (
            <p className="hint">Select an expression to edit its appearance.</p>
          ) : (
            <>
              <dl className="readout">
                <dt>Entry</dt>
                <dd>{analysis.kind === 'curve' ? analysis.label : '—'}</dd>
                <dt>Status</dt>
                <dd>{describeStatus(analysis)}</dd>
                {analysis.kind === 'curve' && (
                  <>
                    <dt>Variable</dt>
                    <dd>{analysis.variable}</dd>
                    <dt>Normalised</dt>
                    <dd className="mono">{analysis.normalised}</dd>
                  </>
                )}
              </dl>

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
              {formatNumber(round(viewport.scale.x))} / {formatNumber(round(viewport.scale.y))} px per unit
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

function describeStatus(analysis: Analysis): string {
  switch (analysis.kind) {
    case 'curve':
      return 'plotted';
    case 'empty':
      return 'empty';
    case 'unsupported':
      return 'not graphable yet';
    case 'error':
      return analysis.message;
  }
}

function round(value: number): number {
  return Number(value.toPrecision(6));
}
