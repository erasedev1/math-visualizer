import { useEffect, useRef } from 'react';
import { formatNumber } from '@/core/expression/print';
import type { ItemResult } from '@/core/workspace/types';
import { resultCurve } from '@/core/workspace/types';
import type { SliderConfig } from '@/core/workspace/slider';
import type { ExpressionEntry } from '@/ui/state/entries';
import { SliderControl } from './SliderControl';

export interface ExpressionRowProps {
  readonly entry: ExpressionEntry;
  readonly result: ItemResult;
  readonly color: string;
  readonly selected: boolean;
  readonly autoFocus: boolean;
  /** Present when this entry defines a draggable number. */
  readonly slider: SliderConfig | null;
  readonly onChange: (source: string) => void;
  readonly onSelect: () => void;
  readonly onToggleVisible: () => void;
  readonly onRemove: () => void;
  readonly onEnter: () => void;
  readonly onSliderValue: (value: number) => void;
  readonly onTogglePlay: () => void;
}

export function ExpressionRow(props: ExpressionRowProps): React.JSX.Element {
  const { entry, result, color, selected, autoFocus, slider } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const drawable = resultCurve(result) !== null;
  const status = statusText(result);

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
          placeholder="Enter an expression, e.g. sin(x)"
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

        {result.kind === 'value' && slider !== null && (
          <SliderControl
            name={result.name}
            value={result.value}
            config={slider}
            onValueChange={props.onSliderValue}
            onTogglePlay={props.onTogglePlay}
          />
        )}

        {status !== null && <p className="expression-status">{status}</p>}
      </div>

      <button
        type="button"
        className="row-action"
        onClick={props.onRemove}
        title="Delete this expression"
        aria-label="Delete this expression"
      >
        &times;
      </button>
    </li>
  );
}

/** One line explaining what the entry currently is, or why it is not working. */
function statusText(result: ItemResult): string | null {
  switch (result.kind) {
    case 'error':
      return result.message;

    case 'value':
      // A draggable value shows its number on the slider itself.
      return result.literal === null ? `= ${formatNumber(result.value)}` : null;

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
