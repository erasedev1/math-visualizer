import { formatNumber } from '@/core/expression/print';
import { formatSliderValue, type SliderConfig } from '@/core/workspace/slider';

/**
 * Workspace entries.
 *
 * Entries are plain, serialisable data: the graph and every computed value are
 * derived from them, never the other way round. The source text is the single
 * source of truth, so a slider writes its number back into the expression
 * rather than holding a value beside it.
 */

export interface ExpressionEntry {
  readonly id: string;
  readonly source: string;
  /** Index into the theme palette, so entries keep their colour across themes. */
  readonly colorIndex: number;
  readonly lineWidth: number;
  readonly visible: boolean;
  /** Slider settings, once the user has adjusted them. */
  readonly slider: SliderConfig | null;
}

export const DEFAULT_LINE_WIDTH = 2;
export const MIN_LINE_WIDTH = 1;
export const MAX_LINE_WIDTH = 6;

let nextId = 0;

export function createEntry(source = '', colorIndex = 0): ExpressionEntry {
  nextId += 1;
  return {
    id: `entry-${nextId}`,
    source,
    colorIndex,
    lineWidth: DEFAULT_LINE_WIDTH,
    visible: true,
    slider: null,
  };
}

/** Lowest palette index not already in use, so new curves look distinct. */
export function nextColorIndex(entries: readonly ExpressionEntry[], paletteSize: number): number {
  const used = new Set(entries.map((entry) => entry.colorIndex));
  for (let index = 0; index < paletteSize; index += 1) {
    if (!used.has(index)) return index;
  }
  return entries.length % paletteSize;
}

export function updateEntry(
  entries: readonly ExpressionEntry[],
  id: string,
  patch: Partial<Omit<ExpressionEntry, 'id'>>,
): ExpressionEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
}

export function insertEntryAfter(
  entries: readonly ExpressionEntry[],
  id: string | null,
  entry: ExpressionEntry,
): ExpressionEntry[] {
  const index = id === null ? -1 : entries.findIndex((candidate) => candidate.id === id);
  if (index < 0) return [...entries, entry];
  return [...entries.slice(0, index + 1), entry, ...entries.slice(index + 1)];
}

/**
 * Keeps one blank entry at the end of the list.
 *
 * The blank row is where the next expression gets typed, so it takes the place
 * of an "add" button: there is always somewhere to start writing, and filling
 * the last row opens another one below it. The same array comes back when the
 * invariant already holds, so the animation loop still bails out of rendering
 * when nothing has moved.
 */
export function withTrailingBlank(
  entries: ExpressionEntry[],
  paletteSize: number,
): ExpressionEntry[] {
  const last = entries[entries.length - 1];
  if (last !== undefined && last.source.trim() === '') return entries;
  return [...entries, createEntry('', nextColorIndex(entries, paletteSize))];
}

/** True for the blank row the list always keeps at the end. */
export function isTrailingBlank(
  entries: readonly ExpressionEntry[],
  index: number,
): boolean {
  return index === entries.length - 1 && entries[index]?.source.trim() === '';
}

export function removeEntry(
  entries: readonly ExpressionEntry[],
  id: string,
): ExpressionEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

/**
 * Rewrites a definition's right-hand side, which is how a slider moves: the
 * expression text stays the one place a value is written down.
 */
export function withValue(entry: ExpressionEntry, name: string, value: number, step: number): ExpressionEntry {
  return { ...entry, source: `${name} = ${formatSliderValue(value, step)}` };
}

/** Rewrites a definition's right-hand side with arbitrary source text. */
export function withBody(entry: ExpressionEntry, name: string, body: string): ExpressionEntry {
  return { ...entry, source: `${name} = ${body}` };
}

/** The source text for a matrix literal, one bracketed list per row. */
export function matrixSource(rows: readonly (readonly number[])[]): string {
  const row = (entries: readonly number[]) =>
    `[${entries.map((entry) => formatNumber(entry)).join(', ')}]`;
  if (rows.length === 1) return row(rows[0]!);
  return `[${rows.map(row).join(', ')}]`;
}

/** The source text for a vector literal. */
export function vectorSource(components: readonly number[]): string {
  return `<${components.map((component) => formatNumber(component)).join(', ')}>`;
}
