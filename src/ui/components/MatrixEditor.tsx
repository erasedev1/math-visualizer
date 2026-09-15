import { formatDisplayNumber } from '@/core/expression/print';

export interface MatrixEditorProps {
  readonly rows: readonly (readonly number[])[];
  /** Editable only when the definition is a literal that can be written back. */
  readonly editable: boolean;
  readonly onChange: (rows: readonly (readonly number[])[]) => void;
}

const MAX_ROWS = 12;
const MAX_COLUMNS = 12;

/**
 * A matrix as a grid rather than as text.
 *
 * Editing a cell rewrites the matrix literal in the expression, which is the
 * same rule sliders and draggable points follow: the source text stays the one
 * place a value is written down. A computed matrix has nothing to write back
 * to, so it is shown but not edited.
 */
export function MatrixEditor(props: MatrixEditorProps): React.JSX.Element {
  const { rows, editable } = props;
  const columns = rows[0]?.length ?? 0;

  const setCell = (row: number, column: number, value: number) => {
    props.onChange(
      rows.map((current, i) =>
        i === row ? current.map((entry, j) => (j === column ? value : entry)) : current,
      ),
    );
  };

  const resize = (nextRows: number, nextColumns: number) => {
    props.onChange(
      Array.from({ length: nextRows }, (_, i) =>
        Array.from({ length: nextColumns }, (_, j) => rows[i]?.[j] ?? 0),
      ),
    );
  };

  return (
    <div className="matrix-editor">
      <div
        className="matrix-grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))` }}
        role="table"
        aria-label={`${rows.length} by ${columns} matrix`}
      >
        {rows.map((row, i) =>
          row.map((entry, j) =>
            editable ? (
              <input
                key={`${i}-${j}`}
                className="matrix-cell"
                type="number"
                step="any"
                value={entry}
                aria-label={`Row ${i + 1}, column ${j + 1}`}
                onChange={(event) => setCell(i, j, Number(event.target.value))}
              />
            ) : (
              <span key={`${i}-${j}`} className="matrix-cell is-readonly mono">
                {formatDisplayNumber(entry)}
              </span>
            ),
          ),
        )}
      </div>

      {editable && (
        <div className="matrix-controls">
          <span className="matrix-size mono">
            {rows.length}&times;{columns}
          </span>
          <button
            type="button"
            onClick={() => resize(rows.length, Math.max(1, columns - 1))}
            disabled={columns <= 1}
            aria-label="Remove a column"
            title="Remove a column"
          >
            &minus;col
          </button>
          <button
            type="button"
            onClick={() => resize(rows.length, Math.min(MAX_COLUMNS, columns + 1))}
            disabled={columns >= MAX_COLUMNS}
            aria-label="Add a column"
            title="Add a column"
          >
            +col
          </button>
          <button
            type="button"
            onClick={() => resize(Math.max(1, rows.length - 1), columns)}
            disabled={rows.length <= 1}
            aria-label="Remove a row"
            title="Remove a row"
          >
            &minus;row
          </button>
          <button
            type="button"
            onClick={() => resize(Math.min(MAX_ROWS, rows.length + 1), columns)}
            disabled={rows.length >= MAX_ROWS}
            aria-label="Add a row"
            title="Add a row"
          >
            +row
          </button>
        </div>
      )}
    </div>
  );
}
