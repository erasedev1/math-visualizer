import type { ItemResult } from '@/core/workspace/types';
import type { SliderConfig } from '@/core/workspace/slider';
import { isTrailingBlank, type ExpressionEntry } from '@/ui/state/entries';
import { ExpressionRow } from './ExpressionRow';

export interface ExpressionPanelProps {
  readonly entries: readonly ExpressionEntry[];
  readonly results: ReadonlyMap<string, ItemResult>;
  readonly sliderOf: (entry: ExpressionEntry) => SliderConfig | null;
  readonly colorOf: (entry: ExpressionEntry) => string;
  readonly selectedId: string | null;
  readonly focusId: string | null;
  readonly onChange: (id: string, source: string) => void;
  readonly onSelect: (id: string) => void;
  readonly onToggleVisible: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onEnter: (id: string) => void;
  readonly onSliderValue: (id: string, value: number) => void;
  readonly onTogglePlay: (id: string) => void;
  readonly onMatrixChange: (id: string, rows: readonly (readonly number[])[]) => void;
  readonly onToggleVectors: (id: string) => void;
}

const EMPTY_RESULT: ItemResult = { kind: 'empty', id: '', dependencies: [] };

export function ExpressionPanel(props: ExpressionPanelProps): React.JSX.Element {
  const { entries, results, colorOf, sliderOf, selectedId, focusId } = props;

  return (
    <section className="panel expression-panel" aria-label="Expressions">
      <header className="panel-header">
        <h2>Expressions</h2>
      </header>

      <ul className="expression-list">
        {entries.map((entry, index) => (
          <ExpressionRow
            key={entry.id}
            entry={entry}
            result={results.get(entry.id) ?? EMPTY_RESULT}
            slider={sliderOf(entry)}
            color={colorOf(entry)}
            selected={entry.id === selectedId}
            autoFocus={entry.id === focusId}
            // The blank row at the end is always there, so there is nothing
            // for a delete button to do to it.
            removable={!isTrailingBlank(entries, index)}
            onChange={(source) => props.onChange(entry.id, source)}
            onSelect={() => props.onSelect(entry.id)}
            onToggleVisible={() => props.onToggleVisible(entry.id)}
            onRemove={() => props.onRemove(entry.id)}
            onEnter={() => props.onEnter(entry.id)}
            onSliderValue={(value) => props.onSliderValue(entry.id, value)}
            onTogglePlay={() => props.onTogglePlay(entry.id)}
            onMatrixChange={(rows) => props.onMatrixChange(entry.id, rows)}
            onToggleVectors={() => props.onToggleVectors(entry.id)}
          />
        ))}
      </ul>

    </section>
  );
}
