import type { SliderConfig } from '@/core/workspace/slider';
import { formatSliderValue, sliderDecimals } from '@/core/workspace/slider';

export interface SliderControlProps {
  readonly name: string;
  readonly value: number;
  readonly config: SliderConfig;
  readonly onValueChange: (value: number) => void;
  readonly onTogglePlay: () => void;
}

/**
 * The control for a parameter.
 *
 * Dragging it edits the expression that defines the variable, so everything
 * that reads the variable follows through the dependency graph without this
 * component knowing anything about what depends on it.
 */
export function SliderControl(props: SliderControlProps): React.JSX.Element {
  const { name, value, config } = props;

  return (
    <div className="slider-control">
      <button
        type="button"
        className="slider-play"
        onClick={props.onTogglePlay}
        aria-label={config.playing ? `Pause ${name}` : `Animate ${name}`}
        aria-pressed={config.playing}
        title={config.playing ? 'Pause' : 'Animate'}
      >
        {config.playing ? '❚❚' : '▶'}
      </button>

      <span className="slider-bound mono">{formatSliderValue(config.min, config.step)}</span>

      <input
        type="range"
        className="slider-range"
        min={config.min}
        max={config.max}
        step={config.step}
        value={clamp(value, config)}
        aria-label={`Value of ${name}`}
        onChange={(event) => props.onValueChange(Number(event.target.value))}
      />

      <span className="slider-bound mono">{formatSliderValue(config.max, config.step)}</span>

      <span className="slider-value mono" aria-hidden="true">
        {value.toFixed(sliderDecimals(config.step))}
      </span>
    </div>
  );
}

function clamp(value: number, config: SliderConfig): number {
  if (!Number.isFinite(value)) return config.min;
  return Math.min(config.max, Math.max(config.min, value));
}
