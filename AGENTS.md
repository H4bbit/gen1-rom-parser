AGENTS.md

Project

"gen1-rom-parser" is a modern TypeScript parser for Generation I Pokémon ROMs.

The ROM is the primary source of truth. The initial target is Pokémon Red/Blue, with Yellow support added only when its layout is understood and tested.

The project is intended to be a high-quality, publishable open-source project.

Working Principles

- Prefer evidence from the ROM over assumptions or external datasets.
- Keep raw ROM parsing separate from decoded data and domain models.
- Do not silently turn invalid or unknown ROM data into plausible values.
- Prefer small, testable changes over large abstractions.
- Do not implement behavior that has not been sufficiently understood.
- Keep the parser independent from the battle engine and HTTP API.

Distinguish clearly between observed facts, documented facts, inferred behavior, hypotheses, and implementation choices.

Repository Structure

Prefer a separation similar to:

src/
  rom/       Low-level ROM access and binary primitives
  gen1/      Generation I ROM structures
  model/     Validated domain types
  export/    Dataset/export functionality

tests/       Automated tests
docs/        Reverse-engineering notes and ROM format documentation

Do not create additional layers or abstractions without a concrete need.

ROM Parsing

Use Node.js "Buffer" for binary access unless a real requirement justifies another dependency.

Low-level ROM access should be centralized behind focused primitives for:

- bounds-checked reads;
- integer decoding;
- byte slices;
- pointers and banks;
- text decoding.

Do not scatter raw "Buffer" offsets throughout higher-level parsers.

ROM layouts must be explicit. Do not assume Red, Blue, and Yellow share identical offsets.

Keep ROM-specific offsets and layout information centralized and named.

Reverse Engineering

When investigating an unknown structure:

1. Inspect existing code and documentation.
2. Check prior research, including "seanmorris/pokemon-parser", when relevant.
3. Identify the exact unknown.
4. Inspect real ROM bytes.
5. Test the hypothesis against multiple known cases.
6. Add a regression test.
7. Document the result and remaining uncertainty.

Do not build substantial code around an unverified interpretation.

The "seanmorris/pokemon-parser" repository is a reference, not a dependency or architectural authority. Reuse knowledge when useful, but do not reproduce its design or behavior blindly.

Testing

Tests are part of the specification.

Every newly understood ROM structure should have automated coverage.

Include:

- known canonical values;
- boundary cases;
- invalid input;
- discovered ROM quirks;
- regression tests for previous bugs;
- dataset-wide invariants where practical.

Prefer testing against the smallest useful fixture.

Do not commit copyrighted ROM files.

When full-ROM tests are necessary, use ROMs supplied locally by the user/environment and document the expected ROM variant.

Before considering a parsing feature complete, test the complete relevant range, not only one example.

Validation

Invalid data must be handled explicitly.

Examples include:

- out-of-range Pokémon or move IDs;
- invalid pointers;
- unsupported ROM variants;
- truncated ROMs;
- impossible enum values;
- malformed structures.

Do not silently return arbitrary bytes, unrelated structures, or "undefined" where the caller would interpret the result as valid data.

Error messages should include useful context such as the structure, ID/index, and ROM offset when applicable.

TypeScript

Use strict TypeScript.

Prefer:

- precise types;
- discriminated unions when appropriate;
- readonly data where mutation is unnecessary;
- exhaustive handling;
- small focused functions;
- meaningful names.

Avoid:

- "any";
- unnecessary type assertions;
- global mutable state;
- unexplained magic numbers;
- oversized utility modules;
- classes without a clear reason to exist.

Dependencies

Keep runtime dependencies minimal.

Before adding a dependency, determine whether Node.js or a small local abstraction already solves the problem clearly.

Do not add libraries merely for convenience.

Development dependencies for testing, linting, formatting, or build tooling are acceptable when they provide clear value.

Comments and Documentation

Comments should explain non-obvious facts, constraints, or reasons.

Do not write comments that merely restate the code.

Example:

// Mew uses a special base-stat location in Red/Blue rather than
// the regular species table.

Reverse-engineering details that are too large for comments belong in "docs/".

Document important structures with their location, size, encoding, interpretation, known exceptions, and supported ROM variants.

Do not present an assumption as established fact.

Git and Changes

Keep changes focused and reviewable.

Do not modify unrelated files.

Do not commit ROMs, secrets, generated junk, or machine-specific files.

Use meaningful commit messages that describe the change.

After changing code, run the relevant project checks defined in "package.json".

Do not claim tests, builds, or investigations were performed unless they were actually performed.

Scope

The parser is responsible for extracting and validating data from Gen I ROMs.

It is not responsible for:

- HTTP endpoints;
- battle simulation;
- emulator functionality;
- later Pokémon generations;
- unrelated tooling.

Those concerns may consume the parser's validated output but should not be coupled to ROM parsing.

Quality Bar

Before declaring a change complete, verify:

- the behavior is supported by evidence;
- relevant tests pass;
- important edge cases are covered;
- invalid input is handled explicitly;
- the implementation is deterministic;
- documentation matches the observed behavior;
- no unnecessary dependency or abstraction was introduced.
