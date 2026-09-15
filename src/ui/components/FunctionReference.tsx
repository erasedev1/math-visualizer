import { useMemo, useState } from 'react';
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTION_LIST } from '@/core/expression/functions';

/**
 * Lists exactly what the engine can evaluate.
 *
 * It is generated from the registry rather than written by hand, so it cannot
 * drift into advertising functions that do not exist.
 */
export function FunctionReference(): React.JSX.Element {
  const [query, setQuery] = useState('');

  const functions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return BUILTIN_FUNCTION_LIST;
    return BUILTIN_FUNCTION_LIST.filter(
      (definition) =>
        definition.name.includes(needle) ||
        definition.description.toLowerCase().includes(needle),
    );
  }, [query]);

  const constants = useMemo(
    () => Object.keys(BUILTIN_CONSTANTS).filter((name) => /^[a-z]+$/.test(name)),
    [],
  );

  return (
    <div className="field-group">
      <h3>Reference</h3>
      <p className="hint">
        Implicit multiplication is supported: <code>2x</code>, <code>3(x+1)</code>,{' '}
        <code>2pi</code>. Angles are in radians. <code>log</code> is base 10,{' '}
        <code>ln</code> is natural.
      </p>
      <p className="hint">
        Constants: <code>{constants.join(', ')}</code>
      </p>
      <input
        className="search-input"
        value={query}
        placeholder="Search functions"
        aria-label="Search functions"
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="reference-list">
        {functions.map((definition) => (
          <li key={definition.name}>
            <code>{definition.signature}</code>
            <span>{definition.description}</span>
          </li>
        ))}
      </ul>
      {functions.length === 0 && <p className="hint">No matching function.</p>}
    </div>
  );
}
