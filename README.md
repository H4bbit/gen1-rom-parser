# gen1-rom-parser

A TypeScript parser for the original Pokémon Generation I ROMs.

The project extracts and validates game data directly from the ROM, with
Pokémon Red and Blue as the initial target. Pokémon Yellow may be supported
later once its ROM layout is understood and covered by tests.

The parser is intended to provide a clean, validated dataset for applications
such as battle simulators, APIs, research tools, and ROM-analysis projects.

## Status

Early development, validated against real Red and Blue ROMs.

The project has established its ROM-reading and identification layer plus
the first Pokémon data structures: text decoding, the name table, the
internal-index → Pokédex-number order table, the base-stats table, the
move-data table, the move-name list, the type-name pointer table, and
the type-effectiveness table (see `docs/rom-foundation.md`,
`docs/text-and-names.md`, `docs/base-stats.md`, `docs/moves.md`, and
`docs/types.md`). The first validated dataset export is already
implemented: the CLI builds a deterministic dataset of 151 Pokémon
(`dex`, decoded `name` and `baseStats`) from the ROM (see Usage below).

## Goals

- Parse Generation I game data directly from the original ROM.
- Keep ROM parsing independent from battle-engine and HTTP/API concerns.
- Make ROM structures explicit and testable.
- Validate decoded data instead of silently accepting invalid values.
- Document reverse-engineered structures and the evidence behind them.
- Produce deterministic, reusable data that can be consumed by other
  applications.

The intended architecture is:

```text
ROM
 ↓
ROM reader
 ↓
Gen I structures
 ↓
Validated domain data
 ↓
Export / consumers
```

The battle engine and HTTP API are separate concerns and are not part of
this parser.

## Supported ROMs

Initial support:

- Pokémon Red
- Pokémon Blue

Planned:

- Pokémon Yellow, after its different ROM layout and structures have been
  properly understood and tested.

ROM variants and hacks are not assumed to be compatible unless their layout
is explicitly verified.

## Source of truth

The ROM is the primary source of truth.

Existing ROM-analysis projects, disassemblies, documentation, and other
external references may be used to guide reverse engineering and validate
results, but they are not runtime data sources for this parser.

In particular, the project may use existing implementations as historical or
technical references without treating their behavior as automatically correct.

## Usage

The package is not published to npm. Consume it from a local checkout:

```sh
npm install  # install dev dependencies in a local checkout
npm run build
```

```ts
import { RomReader, identifyGen1Rom, readGen1BaseStats } from "gen1-rom-parser";
import { readFileSync } from "node:fs";

const reader = new RomReader(readFileSync("red.gb"));
const identity = identifyGen1Rom(reader); // throws on anything but the known Red/Blue dump
const bulbasaur = readGen1BaseStats(reader, 1);
```

The package has two entry points sharing one implementation:

- library: `import ... from "gen1-rom-parser"` (single entry
  `src/index.ts`, shipped as `dist/index.js` with `dist/index.d.ts`);
- CLI: `npm run cli -- <rom-path>` (thin entry `src/cli.ts`, built to
  `dist/cli.js` and exposed via the `bin` field as `gen1-rom-parser`
  once the package is installed).

The library is the primary product; the CLI only wraps it to export
ROM-derived data as JSON for other projects (e.g. dataset generation):

```sh
npm run build
npm run cli -- red.gb > dataset.json
```

(Build `dist/` explicitly with `npm run build` before using the CLI — the
`cli` script only runs the compiled `dist/cli.js` and never rebuilds.
A project-level `.npmrc` with `loglevel=silent` keeps npm's script
banner out of the redirected JSON, so `dataset.json` contains only the
CLI's own stdout.)

It takes exactly one ROM path (a Pokémon Red or Blue ROM file) and prints
`{ "rom": { "variant" }, "pokemon": [...] }` (151 entries sorted by
Pokédex number, each with `dex`, decoded `name` and `baseStats`) to
stdout. `-h`/`--help` prints `Usage: gen1-rom-parser <rom-path>` on
stdout with a zero exit code. Any other invalid invocation (missing path,
extra arguments, unreadable file, invalid ROM) reports an `Error: ...`
on stderr followed by the usage line, with a non-zero exit code.

The public API is the single entry point `src/index.ts` (shipped as
`dist/index.js` with `dist/index.d.ts`). `src/rom/` and `src/gen1/` are
internal implementation layers re-exported through that entry; import
only from `"gen1-rom-parser"` — no subpath is exported. Source uses
explicit `.ts` relative imports so it can run directly under Node.js
native type stripping (enabled by default since Node.js v22.18.0); the
compiled output rewrites them to `.js` for consumers. Node.js refuses
type stripping for files inside `node_modules`
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so consumers resolving
through `node_modules` must resolve to the built `dist/*.js`, never to
TypeScript source — this is why the package ships compiled output
instead of `src/`.

## Development

Requirements:

- Node.js `>= 22.18`
- npm

TypeScript is installed as a local dev dependency via `npm install`.
Biome `2.5.14` is expected as an already-installed binary (it ships no
prebuilt binary for every platform, so it is intentionally **not** an
npm dependency).

The project uses Node.js native TypeScript type stripping and the built-in
`node:test` test runner for development, so no test framework dependency
is required. A compile step (`tsc -p tsconfig.build.json`, via
`npm run build`) produces the consumable `dist/` output; `dist/` is
generated and not committed.

Commands:

```sh
npm install
npm run typecheck
npm run build    # emit dist/index.js + dist/index.d.ts and dist/cli.js for consumers
npm test         # portable suite; needs no ROM files (builds dist first: pretest)
npm run check
```

With local Red/Blue images, an extra opt-in check identifies them via
environment-provided paths (never committed):

```sh
GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
```

Unset variables are skipped, not failed.

To let Biome apply safe fixes:

```sh
npm run check:fix
```

## Repository layout

```text
src/       parser implementation
tests/     automated tests and focused fixtures
docs/      ROM-format and reverse-engineering notes
```

Directories and modules are added as the corresponding ROM structures become
understood; the repository intentionally avoids speculative architecture.

## Testing

Tests are part of the parser's specification.

They should cover:

- known ROM structures and values;
- boundary conditions;
- invalid inputs;
- ROM-specific quirks;
- regression cases;
- invariants that must hold across decoded data.

Full ROM images are used only as local development/test inputs and are not
committed to this repository.

Small synthetic fixtures should be preferred when testing low-level parsing
behavior.

## Design principles

**Evidence over assumptions**

ROM structures should be established from observable evidence: ROM bytes,
documented layouts, multiple known cases, and reproducible tests.

**Explicit decoding**

Raw ROM structures and decoded domain data are separate concepts. Parsing
should make the transformation between them explicit.

**No silent corruption**

Invalid pointers, unsupported values, malformed structures, and out-of-range
identifiers should be rejected or reported explicitly rather than converted
into plausible-looking data.

**Small, testable components**

Low-level ROM operations should be isolated from Gen I-specific structures.
Modules should remain small enough that their behavior can be verified
independently.

**Minimal dependencies**

The parser should rely on Node.js facilities whenever they are sufficient.
Dependencies are added only when they provide a concrete benefit that is
difficult to reproduce cleanly in the project itself.

## License

MIT — see [LICENSE](LICENSE).
