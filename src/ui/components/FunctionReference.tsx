import { Fragment, useMemo, useState } from 'react';
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTION_LIST } from '@/core/expression/functions';
import {
  VALUE_FUNCTION_LIST,
  VALUE_FUNCTIONS,
  type ValueFunction,
} from '@/core/values/functions';

/**
 * Lists exactly what the engine can evaluate.
 *
 * It is generated from the registry rather than written by hand, so it cannot
 * drift into advertising functions that do not exist.
 */
export function FunctionReference(): React.JSX.Element {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filter = <T extends { name: string; description: string }>(list: readonly T[]) =>
      needle === ''
        ? list
        : list.filter(
            (definition) =>
              definition.name.includes(needle) ||
              definition.description.toLowerCase().includes(needle),
          );

    // Grouped from the registry rather than by a hand-written list, so a new
    // heading costs nothing and an untagged function still has a home.
    const grouped = new Map<string, ValueFunction[]>();
    for (const definition of filter(VALUE_FUNCTION_LIST)) {
      const group = definition.group ?? 'Geometry';
      grouped.set(group, [...(grouped.get(group) ?? []), definition]);
    }

    // A name in both registries means the same thing on both paths, with the
    // value entry describing the wider case: `min(data)` covers `min(a, b)`.
    // Listing it twice would suggest two functions where there is one.
    const numeric = filter(BUILTIN_FUNCTION_LIST).filter(
      (definition) => !VALUE_FUNCTIONS.has(definition.name),
    );

    return { values: [...grouped], numeric };
  }, [query]);

  const total =
    matches.values.reduce((running, [, list]) => running + list.length, 0) +
    matches.numeric.length;

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
        <code>ln</code> is natural. A point is written <code>(3, 4)</code>.
      </p>
      <p className="hint">
        Write <code>f&#39;(x)</code> for the derivative of a function of one
        variable, and <code>f&#39;&#39;</code> for the second. It is
        differentiated symbolically, so it plots, composes and can be
        differentiated again.
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
      {matches.values.map(([group, definitions]) => (
        <Fragment key={group}>
          <h4 className="reference-heading">{group}</h4>
          <ul className="reference-list">
            {definitions.map((definition) => (
              <li key={definition.name}>
                <code>{definition.signature}</code>
                <span>{definition.description}</span>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}

      {matches.numeric.length > 0 && (
        <>
          <h4 className="reference-heading">Numeric</h4>
          <ul className="reference-list">
            {matches.numeric.map((definition) => (
              <li key={definition.name}>
                <code>{definition.signature}</code>
                <span>
                  {definition.description}
                  {/* Read from the registry, so the list cannot claim a
                      derivative exists where no rule is declared. Only shown
                      where a prime could be written, which is on a function of
                      exactly one argument. */}
                  {definition.derivative === undefined &&
                    definition.minArgs === 1 &&
                    definition.maxArgs === 1 && (
                      <em className="reference-note"> · no derivative</em>
                    )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {total === 0 && <p className="hint">No matching function.</p>}
    </div>
  );
}
