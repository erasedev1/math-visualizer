# Math Visualizer

An open-source, local-first mathematical and engineering workspace: a
programmable canvas where mathematics, visualization and engineering
calculations live in one environment.

This repository is at **milestone 4**. What is described below as implemented
is implemented and tested; everything else is on the roadmap and deliberately
absent from the interface.

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
  `solve`, `identity`, `eigenvalues` and `eigenvectors`, plus the products
  between matrices, vectors and numbers.
- Appearance: per-object colour, line width and visibility; light and dark
  themes.
- 318 automated tests covering parsing, evaluation, printing, viewport
  transforms, tick selection, sampling, clipping, picking, dependency
  ordering, reactive propagation, plane geometry, linear algebra and slider
  behaviour, checked against analytical results.

**Not built yet** — symbolic calculus, statistics, tables, notebook blocks,
units, engineering modules, 3D, the AI tool layer, project files and
undo/redo. The UI does not contain controls for any of them.

**Known limits at this milestone** — a curve is compiled on the unboxed
numeric path, so a function cannot yet read a point, a vector or a matrix
(`f(x) = distance(A, (x, 0))` reports this rather than failing obscurely).
Intersections are between lines, rays and segments. `eigenvalues` covers
symmetric matrices of any size and any 2x2; anything else, including complex
eigenvalues, is refused rather than approximated. Only plane vectors are
drawn, though longer ones compute normally.

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
                  algebra, and the functions over them
    workspace/    dependency graph, reactive evaluation, slider behaviour
    plot/         compiles an expression into a drawable curve
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
| 5 | calculus, numerical methods, statistics |
| 6 | notebook/document blocks |
| 7 | units and dimensional analysis, engineering modules |
| 8 | 3D surfaces and parametric curves |
| 9 | AI workspace tools (structured operations, not code edits) |
| 10 | performance, export, documentation, polish |

Each milestone leaves the application runnable, with tests, and without UI for
features that do not work.

## Licence

MIT.
