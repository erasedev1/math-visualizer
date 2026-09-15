import type { RenderStats } from '@/rendering/2d/scene';
import type { Point } from '@/rendering/2d/viewport';

export interface StatusBarProps {
  readonly cursor: Point | null;
  readonly stats: RenderStats | null;
  readonly curves: number;
  readonly shapes: number;
  readonly values: number;
  readonly problems: number;
}

/**
 * Bottom bar: pointer position, what the workspace currently holds, and the
 * cost of the last frame. The render stats are real measurements, which makes
 * performance regressions visible during development rather than after.
 */
export function StatusBar(props: StatusBarProps): React.JSX.Element {
  const { cursor, stats, curves, shapes, values, problems } = props;

  return (
    <footer className="status-bar">
      <span className="status-item mono">
        {cursor === null ? 'x —, y —' : `x ${format(cursor.x)}, y ${format(cursor.y)}`}
      </span>
      <span className="status-item">
        {[
          `${curves} ${curves === 1 ? 'curve' : 'curves'}`,
          `${shapes} ${shapes === 1 ? 'shape' : 'shapes'}`,
          `${values} ${values === 1 ? 'value' : 'values'}`,
        ].join(' · ')}
        {problems > 0 && (
          <span className="status-problem"> · {problems} need attention</span>
        )}
      </span>
      {stats !== null && (
        <span className="status-item mono">
          {stats.evaluations.toLocaleString()} samples · {stats.milliseconds.toFixed(1)} ms
        </span>
      )}
      <span className="status-item status-hints">
        drag to pan · scroll to zoom · shift or alt + scroll for one axis · +/- zoom
      </span>
    </footer>
  );
}

function format(value: number): string {
  if (Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 1e-4)) {
    return value.toExponential(3);
  }
  return value.toFixed(4);
}
