import type { ThemeName } from '@/rendering/2d/theme';

export interface CanvasControlsProps {
  readonly theme: ThemeName;
  readonly inspectorOpen: boolean;
  readonly onResetView: () => void;
  readonly onToggleTheme: () => void;
  readonly onToggleInspector: () => void;
}

/**
 * View controls, floating over the top right of the canvas.
 *
 * They live on the canvas rather than in a title bar because a workspace this
 * dense should spend its vertical space on mathematics. The container ignores
 * pointer events so that dragging and panning still work everywhere around
 * the buttons.
 */
export function CanvasControls(props: CanvasControlsProps): React.JSX.Element {
  const { theme, inspectorOpen } = props;

  return (
    <div className="canvas-controls">
      <button type="button" className="canvas-button" onClick={props.onResetView}>
        Reset view
      </button>

      <button
        type="button"
        className="canvas-button"
        onClick={props.onToggleTheme}
        aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
      >
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>

      <button
        type="button"
        className="canvas-button is-icon"
        onClick={props.onToggleInspector}
        aria-expanded={inspectorOpen}
        aria-controls="inspector-panel"
        aria-label={inspectorOpen ? 'Hide the inspector' : 'Show the inspector'}
        title={inspectorOpen ? 'Hide the inspector' : 'Show the inspector'}
      >
        {inspectorOpen ? '›' : '‹'}
      </button>
    </div>
  );
}
