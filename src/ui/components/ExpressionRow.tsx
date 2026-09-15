import { useEffect, useRef } from 'react';
import { formatDisplayNumber } from '@/core/expression/print';
import type { ItemResult } from '@/core/workspace/types';
import { resultCurve, resultShape } from '@/core/workspace/types';
import { drawableAsVectors } from '@/core/values/types';
import type { SliderConfig } from '@/core/workspace/slider';
import { describeValue } from '@/core/values/types';
import type { ExpressionEntry } from '@/ui/state/entries';
import { MatrixEditor } from './MatrixEditor';
import { SliderControl } from './SliderControl';

export interface ExpressionRowProps {
  readonly entry: ExpressionEntry;
  readonly result: ItemResult;
  readonly color: string;
  readonly selected: boolean;
  readonly autoFocus: boolean;
  /** False for the blank row the list always keeps at the end. */
  readonly removable: boolean;
  /** Present when this entry defines a draggable number. */
  readonly slider: SliderConfig | null;
  readonly onChange: (source: string) => void;
  readonly onSelect: () => void;
  readonly onToggleVisible: () => void;
  readonly onRemove: () => void;
  readonly onEnter: () => void;
  readonly onSliderValue: (value: number) => void;
  readonly onTogglePlay: () => void;
  readonly onMatrixChange: (rows: readonly (readonly number[])[]) => void;
  readonly onToggleVectors: () => void;
}

export function ExpressionRow(props: ExpressionRowProps): React.JSX.Element {
  const { entry, result, color, selected, autoFocus, removable, slider } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Curves, geometry, and a matrix asked to show its columns are all drawn,
  // so all of them get a colour and a visibility toggle.
  const drawable =
    resultCurve(result) !== null ||
    resultShape(result) !== null ||
    (entry.showVectors && result.kind === 'value' && drawableAsVectors(result.value));
  const status = statusText(result, entry.showVectors);

  return (
    <li className={`expression-row${selected ? ' is-selected' : ''}`} data-state={result.kind}>
      {drawable ? (
        <button
          type="button"
          className="swatch"
          style={{ '--swatch-color': color } as React.CSSProperties}
          data-hidden={!entry.visible}
          onClick={props.onToggleVisible}
          title={entry.visible ? 'Hide this curve' : 'Show this curve'}
          aria-label={entry.visible ? 'Hide this curve' : 'Show this curve'}
          aria-pressed={entry.visible}
        />
      ) : (
        <span className="swatch-placeholder" aria-hidden="true" />
      )}

      <div className="expression-row-body">
        <input
          ref={inputRef}
          className="expression-input"
          value={entry.source}
          spellCheck={false}
          autoComplete="off"
          aria-label="Expression"
          onChange={(event) => props.onChange(event.target.value)}
          onFocus={props.onSelect}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              props.onEnter();
            } else if (event.key === 'Escape') {
              event.currentTarget.blur();
            }
          }}
        />

        {result.kind === 'value' && result.name !== null && slider !== null && (
          <SliderControl
            name={result.name}
            value={result.literal?.kind === 'number' ? result.literal.value : 0}
            config={slider}
            onValueChange={props.onSliderValue}
            onTogglePlay={props.onTogglePlay}
          />
        )}

        {result.kind === 'value' && result.value.kind === 'matrix' && (
          <MatrixEditor
            rows={result.value.rows}
            editable={result.literal?.kind === 'matrix'}
            showVectors={entry.showVectors}
            onChange={props.onMatrixChange}
            onToggleVectors={props.onToggleVectors}
          />
        )}

        {status !== null && <p className="expression-status">{status}</p>}
      </div>

      {removable ? (
        <button
          type="button"
          className="row-action"
          onClick={props.onRemove}
          title="Delete this expression"
          aria-label="Delete this expression"
        >
          &times;
        </button>
      ) : (
        <span className="row-action-placeholder" aria-hidden="true" />
      )}
    </li>
  );
}

/** One line explaining what the entry currently is, or why it is not working. */
function statusText(result: ItemResult, showVectors: boolean): string | null {
  switch (result.kind) {
    case 'error':
      return result.message;

    case 'value':
      // Sliders and matrix grids already show their own contents.
      if (result.literal?.kind === 'number') return null;
      if (result.value.kind === 'matrix') {
        return showVectors && !drawableAsVectors(result.value)
          ? `Only a matrix with two rows can be drawn as plane vectors; transpose it if its vectors are the rows`
          : null;
      }
      return `= ${describeValue(result.value, formatDisplayNumber)}`;

    case 'function':
      return result.curve === null
        ? `${result.name}(${result.params.join(', ')}) is defined; graphing it needs the 3D engine`
        : null;

    case 'curve':
      return result.curve.variable === 'x' ? null : `plotted against ${result.curve.variable}`;

    case 'empty':
      return null;
  }
}
