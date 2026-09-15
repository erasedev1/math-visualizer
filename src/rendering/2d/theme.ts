/**
 * Canvas colour tokens.
 *
 * The renderer takes a theme as data so it stays independent of the DOM and
 * of any CSS framework, and so the same scene can be drawn to a light canvas
 * for export while the app itself is dark.
 */

export interface GraphTheme {
  readonly background: string;
  readonly gridMinor: string;
  readonly gridMajor: string;
  readonly axis: string;
  readonly label: string;
  /** Drawn behind labels so they stay readable over the curves. */
  readonly labelHalo: string;
  /** Colours assigned to successive curves. */
  readonly series: readonly string[];
}

const SERIES_DARK = [
  '#5eead4',
  '#a78bfa',
  '#fbbf24',
  '#f472b6',
  '#60a5fa',
  '#4ade80',
  '#fb923c',
  '#e879f9',
] as const;

const SERIES_LIGHT = [
  '#0f766e',
  '#6d28d9',
  '#b45309',
  '#be185d',
  '#1d4ed8',
  '#15803d',
  '#c2410c',
  '#a21caf',
] as const;

export const DARK_THEME: GraphTheme = {
  background: '#0b0e14',
  gridMinor: 'rgba(148, 163, 184, 0.08)',
  gridMajor: 'rgba(148, 163, 184, 0.18)',
  axis: 'rgba(226, 232, 240, 0.55)',
  label: 'rgba(226, 232, 240, 0.75)',
  labelHalo: 'rgba(11, 14, 20, 0.85)',
  series: SERIES_DARK,
};

export const LIGHT_THEME: GraphTheme = {
  background: '#fbfcfd',
  gridMinor: 'rgba(15, 23, 42, 0.06)',
  gridMajor: 'rgba(15, 23, 42, 0.16)',
  axis: 'rgba(15, 23, 42, 0.5)',
  label: 'rgba(15, 23, 42, 0.7)',
  labelHalo: 'rgba(251, 252, 253, 0.85)',
  series: SERIES_LIGHT,
};

export type ThemeName = 'dark' | 'light';

export function graphTheme(name: ThemeName): GraphTheme {
  return name === 'light' ? LIGHT_THEME : DARK_THEME;
}

/** Colour for the n-th curve, cycling through the palette. */
export function seriesColor(theme: GraphTheme, index: number): string {
  const palette = theme.series;
  return palette[((index % palette.length) + palette.length) % palette.length]!;
}
