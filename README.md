# Math Visualizer

An open-source, local-first mathematical and engineering workspace: a
programmable canvas where mathematics, visualization and engineering
calculations live in one environment.

This repository is at **the end of milestone 5**. What is described below as
implemented is implemented and tested; everything else is on the roadmap and
deliberately absent from the interface.

## Status

**Working today**

- Expression engine: tokenizer, parser and a closure compiler for arithmetic,
  variables, constants, function calls, powers, parentheses and implicit
  multiplication (`2x`, `3(x+1)`, `2pi`, `sqrt(2x)`).
- Entry forms: bare expressions (`x^2`), the conventional `y = ...`, and
  function definitions (`f(x) = sin(x)`), graphed against their own variable.
- Interactive 2D graphing: Cartesian grid, axes with 1-2-5 ticks, multiple
  curves, drag to pan, wheel/pinch/keyboard zoom, per-axis zoom, and adaptive
  sampling that resolves high-frequency curves, breaks at domain edges and
  splits at poles.
- A reactive workspace: named values (`a = 2`), named functions
  (`f(x) = a sin(b x)`) and computed values (`p = f(3)`) that read each other
  in any order. A change recomputes exactly the items that read it,
  transitively, and nothing else. Cycles, unknown names and duplicate
  definitions are reported per entry and recover as soon as they are fixed.
- Sliders: any parameter defined as a plain number gets one, with editable
  bounds, step and speed, and play/pause animation that sweeps back and forth.
  Dragging rewrites the number in the expression, so the text stays the single
  source of truth and everything downstream follows.
- Interactive geometry: points written `A = (3, 4)`, plus `line`, `segment`,
  `ray`, `circle`, `polygon`, `midpoint`, `distance`, `angle`, `intersect`,
  `perpendicular`, `parallel`, `area` and `perimeter`. Points can be dragged on
  the canvas, and every construction that reads them follows. Constructions
  compose, so `intersect(l, perpendicular(l, midpoint(A, B)))` is the foot of
  the perpendicular bisector and stays that way as A moves.
- Point arithmetic: `(A + B)/2` means the same as `midpoint(A, B)`, and
  anything without a meaning (`A * B`, `A + 1`) is a type error naming both
  kinds rather than a silent NaN.
- Vectors, written `v = <3, 4>`, drawn as arrows and draggable by the tip:
  `magnitude`, `normalize`, `dot`, `cross` (a vector in 3D, a number in 2D),
  `projection`, and `angle` between two of them. `B - A` is the displacement
  from A to B, and `A + v` moves a point.
- Matrices, written `M = [[1, 2], [3, 4]]`, with an editable grid instead of a
  wall of brackets: add and remove rows and columns, type into a cell, and
  everything downstream recomputes. `transpose`, `det`, `rank`, `inverse`,
  `solve`, `identity`, `column`, `row`, `eigenvalues` and `eigenvectors`, plus
  the products between matrices, vectors and numbers.
- A matrix of two rows can be drawn on the plane, from a toggle beside its
  grid, under either of the two readings its columns support. As vectors it is
  one arrow per column: for a linear map those columns are where the basis
  vectors land, so `eigenvectors(M)` drawn this way shows the directions the
  map leaves alone. As points it is a scatter, which is what makes
  `[[1, 2, 3], [2, 4, 5]]` a data set and puts it on the graph beside the
  `fit` of it. Computed matrices can be drawn as readily as typed ones.
- Symbolic differentiation, written the way it is written by hand: define
  `f(x) = sin(x) + x^2/8` and `f'(x)` is its derivative, `f''(x)` the second.
  The derivative is an expression, not a slope at a point, so it plots, can be
  evaluated (`f'(2)`), composes (`g(x) = f(x)^2` differentiates through `f`)
  and can be differentiated again. Built-in functions differentiate by the same
  mechanism, so `sin'(x)` works too. A step function such as `floor` declares
  no rule and is refused by name rather than reported as zero.
- Numerical calculus over any function in the workspace, written by name:
  `integral(f, 0, 3)` by adaptive Simpson's rule, `root(f, 1, 2)` by Brent's
  method, and `minimum`, `maximum`, `argmin` and `argmax` over an interval.
  Built-in functions work the same way (`integral(sin, 0, pi)`), the limits can
  be parameters, and because the function is resolved where the call is
  compiled, `y = integral(f, 0, x)` plots the antiderivative. Differentiating
  it gives `f` back: the fundamental theorem is one of the derivative rules.
- A tangent line needs nothing new: with a slider `a`, the line
  `y = f(a) + f'(a)(x - a)` touches the curve at `a` and follows the slider.
- Statistics over a sample, which is just a row of numbers: `d = [2, 4, 4, 5]`
  gives `mean`, `median`, `mode`, `min`, `max`, `range`, `count`, `sum`,
  `quantile(d, 0.9)`, `iqr`, and both estimators of spread — `variance` and
  `stddev` divide by n - 1, `variancep` and `stddevp` by n. A sample can be
  written as a row, a vector, a matrix of any shape, or the numbers
  themselves: `mean(1, 2, 3)`. Between two samples there is `covariance`,
  `correlation` and `rsquared`.
- Least squares, drawn rather than reported: `fit(xs, ys)` is a line, so it
  appears on the graph beside the data and follows every slider the data
  depends on. Paired data can equally be one matrix of two rows — `fit(D)`,
  `correlation(D)` — which is the same matrix the canvas draws as a scatter,
  so the data and the line through it come from one entry. `slope` and `intercept` read its coefficients back, and because
  the fit is an ordinary line, `intersect`, `perpendicular` and the rest of
  plane geometry apply to it unchanged. A vertical stack of points has no
  least-squares line that is a function of x, and says so.

- Appearance: per-object colour, line width and visibility; light and dark
  themes.
- 532 automated tests covering parsing, evaluation, printing, viewport
  transforms, tick selection, sampling, clipping, picking, dependency
  ordering, reactive propagation, plane geometry, linear algebra, slider
  behaviour, differentiation, numerical methods and statistics, checked
  against analytical results — every derivative rule against a central
  difference, every integral against its closed form, and every statistic
  against the worked example it comes from.

**Not built yet** — tables, notebook blocks, units, engineering modules, 3D,
the AI tool layer, project files and undo/redo. The UI does not contain
controls for any of them.

**Known limits at this milestone** — a curve is compiled on the unboxed
numeric path, so a function cannot yet read a point, a vector or a matrix
(`f(x) = distance(A, (x, 0))` reports this rather than failing obscurely).
Intersections are between lines, rays and segments. `eigenvalues` covers
symmetric matrices of any size and any 2x2; anything else, including complex
eigenvalues, is refused rather than approximated. Only plane vectors are
drawn, though longer ones compute normally. `minimum` and its relatives scan
the interval before refining, so a dip narrower than the scan can hide from
them, and `root` wants a bracket that changes sign rather than hunting for one.
Statistics are descriptive: there is no distribution, no random sampling and
no hypothesis test, and the only fit is a straight line. Data is drawn as a
scatter but not yet as a histogram or a box plot, and a scatter comes from a
matrix of two rows, so a sample of more than two rows is computed but not
drawn.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # run the test suite
npm run build      # typecheck and produce a production build
```

Requires Node 20 or newer.

## Deploying

The site is static, so GitHub Pages can serve it directly.
`.github/workflows/deploy.yml` builds `main` on every push — it runs the
test suite, then `npm run build`, then publishes `dist/` — so the only
one-time setup is in the repository settings:

**Settings → Pages → Build and deployment → Source: GitHub Actions**

The site then lives at `https://<owner>.github.io/<repo>/`. The build uses
a relative `base` (see `vite.config.ts`), so it also works unchanged from a
user page, a custom domain, or any other subdirectory. To publish from a
branch other than `main`, edit the `branches` list at the top of the
workflow; to deploy without pushing, run the workflow from the Actions tab.

## Architecture

The stack is Vite + React + TypeScript with Vitest, and no mathematics
library: the engine is the product, so it is written and tested here rather
than delegated.

```
src/
  core/
    expression/   tokenizer, parser, AST, closure compiler, printer,
                  definition parser, function/constant registry
    values/       the value domain: numbers, points, vectors, matrices,
                  lines, circles, polygons, plane geometry, dense linear
                  algebra, descriptive statistics and least squares, and the
                  functions over them
    workspace/    dependency graph, reactive evaluation, slider behaviour
    plot/         compiles an expression into a drawable curve
    calculus/     symbolic differentiation, simplification, prime notation,
                  adaptive quadrature, root finding, extremum search
  rendering/
    2d/           viewport transforms, tick selection, adaptive sampler,
                  grid/axis renderer, curve and object renderers, line
                  clipping, point picking, scene entry point, canvas themes
  ui/
    components/   expression panel, canvas, inspector, status bar
    hooks/        element size, pointer/wheel/pinch navigation
    state/        workspace entries
tests/            mirrors src/, one suite per module
```

Three rules hold the design together, and the later milestones depend on them:

1. **The engine does not know about the UI.** `core` and `rendering` have no
   React and no DOM beyond a canvas context, so the same code can serve
   export, a worker, or a headless test.
2. **Data flows one way.** Entries are plain serialisable data; the scene is
   derived from them by pure functions. Nothing mutates the graph directly,
   which is what makes a dependency graph and an undo history addable rather
   than retrofittable.
3. **Behaviour is registry-driven, not switch-driven.** Functions and
   constants live in one registry that the parser, compiler and on-screen
   reference all read, so adding `erf` or a unit-aware quantity type does not
   mean touching a parser.

### How reactivity works

Nothing in the application pushes an update at anything else. Each pass over
the workspace reads every entry's declared name, works out what each entry
reads, orders the work so dependencies come first, and recomputes only the
entries a change can reach. Everything else is reused from the previous pass,
including its compiled closures.

That is why a dragged slider stays cheap as the workspace grows, and why
`geometry`, `tables` and `notebook blocks` can join later as new kinds of node
rather than as new update paths. The graph itself
(`core/workspace/graph.ts`) is plain data over ids and knows nothing about
expressions.

### Notable decisions

- **Juxtaposition is multiplication, resolved against a function registry.**
  `sin(x)` is a call and `a(x+1)` is a product, because the parser asks
  whether the name is a known function. Identifiers are matched greedily, so
  `xy` is one variable, not `x*y`.
- **Compilation, not tree-walking.** Plotting evaluates an expression
  thousands of times per frame, so the AST is compiled once into closures with
  constant subtrees folded, and unknown names fail at compile time instead of
  producing NaN at every sample.
- **Sampling is adaptive and discontinuity-aware.** Uniform sampling aliases
  `sin(50x)` and draws lines through the asymptotes of `tan(x)`; the sampler
  refines on screen-space flatness and splits the polyline at domain edges and
  poles.
- **The viewport is a centre plus a scale.** Resizing the window then reveals
  more of the plane instead of stretching it, and repeated zooming cannot
  drift the aspect ratio.
- **`log` is base 10 and `ln` is natural**, following engineering convention.
  Angles are in radians.
- **A slider has no value of its own.** It writes its number back into the
  expression that defines it, so there is exactly one place a value is
  written down and a saved workspace will keep its slider positions for free.
- **`x` and `y` name the plane, not variables.** `y = ...` is the conventional
  way to write a graph and is drawn as one; `x = ...` would be a vertical
  line, which is not a function of x, and says so rather than quietly
  defining a variable that breaks every other entry.
- **Whether `f(2)` is a call or a product depends on the workspace.** Names
  are collected from every entry's header before any body is parsed, so
  `a(x+1)` is a product until an `a(x) = ...` definition exists.
- **Values are boxed; curves are not.** Workspace values are computed once per
  change by a tree-walking evaluator over a tagged union, while curves are
  sampled thousands of times per frame and stay on the compiled, unboxed
  numeric path. Neither pays for the other.
- **Dragging a point is the same mechanism as dragging a slider.** Both
  rewrite the literal in the expression that defines the object, and only
  literals can be dragged: `M = midpoint(A, B)` has no halo and does not move,
  because its position is a consequence rather than a choice.
- **The renderer keeps its own shape types.** It never imports the value
  union, so drawing stays independent of how values are modelled; one function
  in the UI translates between them.
- **Everything editable is a literal.** A slider, a dragged point, a dragged
  arrow tip and a matrix cell all do the same thing: rewrite the literal in
  the expression that defines the object. Computed values have nothing to
  write back to, so `M = midpoint(A, B)` cannot be dragged and `inverse(M)`
  is shown as a grid but not edited.
- **A derivative is a function, not a number.** `f'` is found symbolically, by
  differentiating the syntax tree, rather than by a difference quotient, which
  would only give a slope at a point. What comes back is an expression, so it
  can be plotted, read, and differentiated again.
- **Every function knows its own derivative.** The rule for `sin` lives in the
  function registry beside its arity and its numeric implementation, and a
  function the workspace defines supplies its rule the same way. `core/calculus`
  knows the chain rule but has never heard of `sin`, so adding `erf` is one
  line in the registry.
- **Simplification stops well short of algebra.** Machine-built derivatives are
  unreadable without it — the power rule alone turns `x^2` into
  `2 * x^(2 - 1) * 1` — but only identities, constant folding and sign
  normalisation are done. A half-finished computer algebra system would be
  worse than an honest `2x`, so `1/3` and `ln(10)` are left as they are.
- **A function passed by name is resolved where the call is compiled.**
  `integral(f, 0, x)` looks `f` up once, at compile time, and the compiled
  closure integrates a plain function of one number on every sample. So the
  value domain needs no function kind, the unboxed numeric path is preserved,
  and plotting an antiderivative works rather than being a later milestone.
- **A data set is a row of numbers, not a new kind of value.** `[2, 4, 4, 5]`
  is already a 1x4 matrix, so statistics read what the language could always
  write, and `column(M, 2)` or `eigenvalues(M)` can be described without
  converting anything. A statistic accepts a matrix of any shape, a vector, or
  the numbers written out, because all three are the same sample.
- **A fit is a line, so it is already drawable.** `fit(xs, ys)` returns the
  same line value that `line(A, B)` does, which is what puts a regression on
  the graph without a renderer, a chart type or a plot mode. The line it
  returns is anchored at x = 0 and x = 1, so `slope` and `intercept` recover
  the coefficients exactly rather than to within the width of the data.
- **One shape, two readings, and the reader chooses.** A matrix of two rows is
  a list of plane points however it was built, so the same numbers are a basis
  under one reading and a data set under another. Rather than guess from
  context, the canvas offers both and neither is the default; the two are
  exclusive because they are readings of one thing, not two things to show at
  once. That is also why a scatter needed no new value kind, no chart type and
  no plot mode.
- **Two estimators, both named.** `stddev` divides by n - 1 and `stddevp` by
  n. Which one is wanted depends on whether the numbers are a sample or the
  whole population, which is a question about the data and not about the
  software, so both are offered under names that say which is which rather
  than one being chosen silently.
- **Refusals over approximations.** A singular matrix has no inverse, a
  rotation has no real eigenvalues, and a system can have no single solution.
  Each says so on the entry that caused it rather than returning a
  plausible-looking number.

## Roadmap

| Milestone | Scope |
| --- | --- |
| 1 ✅ | app shell, canvas, expression parser, function plotting, pan/zoom |
| 2 ✅ | reactive dependency graph, variables, sliders |
| 3 ✅ | points, lines, circles, geometric relationships |
| 4 ✅ | vectors, matrices, a matrix editor |
| 5 ✅ | calculus, numerical methods, statistics |
| 6 | notebook/document blocks |
| 7 | units and dimensional analysis, engineering modules |
| 8 | 3D surfaces and parametric curves |
| 9 | AI workspace tools (structured operations, not code edits) |
| 10 | performance, export, documentation, polish |

Each milestone leaves the application runnable, with tests, and without UI for
features that do not work.

## Licence

MIT.
