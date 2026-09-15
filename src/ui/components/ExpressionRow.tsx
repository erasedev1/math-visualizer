import { useEffect, useRef } from 'react';
import type { Analysis } from '@/core/plot/analyze';
import type { ExpressionEntry } from '@/ui/state/entries';

export interface ExpressionRowProps {
  readonly entry: ExpressionEntry;
  readonly analysis: Analysis;
  readonly color: string;
  readonly selected: boolean;
  readonly autoFocus: boolean;
  readonly onChange: (source: string) => void;
  readonly onSelect: () => void;
  readonly onToggleVisible: () => void;
  readonly onRemove: () => void;
  readonly onEnter: () => void;
}

export function ExpressionRow(props: ExpressionRowProps): React.JSX.Element {
  const { entry, analysis, color, selected, autoFocus } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const status = statusText(analysis);

  return (
    <li
      className={`expression-row${selected ? ' is-selected' : ''}`}
      data-state={analysis.kind}
    >
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

function statusText(analysis: Analysis): string | null {
  switch (analysis.kind) {
    case 'error':
    case 'unsupported':
      return analysis.message;
    case 'curve':
      return analysis.variable === 'x' ? null : `plotted against ${analysis.variable}`;
    case 'empty':
      return null;
  }
}
