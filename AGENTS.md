# AGENTS.md — instructions for agents modifying this repo

## Scope and non-goals

- This parser extracts and validates data from Gen I ROMs. It does not
  implement HTTP endpoints, battle simulation, emulator functionality,
  later generations, or unrelated tooling. Those concerns may consume the
  parser's validated output but must not be coupled to ROM parsing.
- Initial target is Pokémon Red/Blue. Do not add Yellow support (offsets,
  tables, behavior) until its layout is understood and covered by tests.
- Never assume Red, Blue, and Yellow share identical offsets or layouts.
  Every ROM-specific layout must be explicit, per variant, centralized,
  and named.

## ROM as source of truth

- The ROM is the primary source of truth. External datasets,
  disassemblies, documentation, and prior implementations may guide
  investigation but are never runtime data sources and never override
  observed ROM bytes.
- `seanmorris/pokemon-parser` is a knowledge reference only: not a
  dependency and not an architectural authority. Do not reproduce its
  design or behavior without independent ROM evidence.

## Evidence taxonomy

- Label every statement for what it is, following the `docs/` convention:
  observed fact, interpretation, implementation decision, assumption,
  unknown. Never present an assumption or hypothesis as an established
  fact.
- Do not silently turn invalid or unknown ROM data into plausible values.

## Reverse engineering process

When investigating an unknown structure:

1. Inspect existing code and `docs/`.
2. Check prior research, including `seanmorris/pokemon-parser`, when relevant.
3. Identify the exact unknown.
4. Inspect real ROM bytes.
5. Test the hypothesis against multiple known cases.
6. Add a regression test.
7. Document the result and remaining uncertainty in `docs/`.

Do not build substantial code around an unverified interpretation.

## ROM parsing rules

- Use Node.js `Buffer` for binary access unless a real requirement
  justifies another dependency.
- Keep low-level ROM access centralized behind focused primitives
  (bounds-checked reads, integer decoding, slices, banked pointers, text
  decoding). Do not scatter raw `Buffer` offsets through higher-level
  parsers.
- Keep raw ROM parsing separate from decoded data and validated domain
  models. Do not add new layers or abstractions without a concrete need;
  respect the existing `src/` layout instead of inventing architecture.

## Validation and errors

- Handle invalid data explicitly: out-of-range IDs, invalid pointers,
  unsupported ROM variants, truncated ROMs, impossible enum values,
  malformed structures.
- Never return arbitrary bytes, unrelated structures, or `undefined`
  where the caller would interpret the result as valid data.
- Error messages must include the structure, ID/index, and ROM offset
  when applicable.

## Testing

- Tests are part of the specification. Every newly understood ROM
  structure needs automated coverage, including canonical values,
  boundaries, invalid input, ROM quirks, regressions, and dataset-wide
  invariants where practical.
- Before calling a parsing feature complete, test the complete relevant
  range (e.g. all 150 entries), not a single example.
- Prefer the smallest useful (usually synthetic) fixture. Full-ROM tests
  use only local, environment-supplied ROMs and must document the
  expected ROM variant.
- Never commit copyrighted ROM files (`*.gb`, `*.gbc`, `*.sav` — already
  ignored). Never commit secrets, generated output, or machine-specific
  files. Do not modify unrelated files.

## Working in the repo

- After changing code, run the relevant checks defined in `package.json`
  (`typecheck`, `check`, `test`, plus `test:roms` when local ROMs are
  available). Keep runtime dependencies minimal: use Node.js facilities
  unless a new dependency solves a concrete problem that a small local
  abstraction cannot.
- Keep reverse-engineering detail in `docs/`, not in code comments.
  Comments explain non-obvious constraints or reasons only.
- Never claim tests, builds, or investigations were performed unless they
  actually were.

## Checklist before declaring a change complete

- Claim is backed by ROM evidence with its uncertainty labeled.
- No per-variant layout was assumed; no unverified interpretation grew
  into substantial code.
- Invalid input is rejected explicitly with contextual errors.
- Full relevant range plus edge cases are tested; output is deterministic.
- No unnecessary dependency, layer, or abstraction was added; `docs/`
  matches observed behavior.
