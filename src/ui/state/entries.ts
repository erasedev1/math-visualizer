/**
 * Workspace entries for milestone 1.
 *
 * Entries are plain, serialisable data: the graph is derived from them, never
 * the other way round. When the reactive dependency graph and the
 * command/undo system arrive, this becomes the payload they operate on rather
 * than something to rewrite.
 */

export interface ExpressionEntry {
  readonly id: string;
  readonly source: string;
  /** Index into the theme palette, so entries keep their colour across themes. */
  readonly colorIndex: number;
  readonly lineWidth: number;
  readonly visible: boolean;
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

export function removeEntry(
  entries: readonly ExpressionEntry[],
  id: string,
): ExpressionEntry[] {
  return entries.filter((entry) => entry.id !== id);
}
