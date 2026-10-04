# Phase 1 CLI dataset export

Contract for the JSON document the CLI prints on stdout
(`npm run cli -- <rom-path> > dataset.json`). Pretty-printed with
`JSON.stringify(data, null, 2)` plus a trailing newline. Top-level
key order is `meta`, `pokemon`, `moves`, `types`.

```json
{
  "meta": {
    "variant": "red",
    "title": "POKEMON RED",
    "romSizeBytes": 1048576,
    "bankCount": 64,
    "headerChecksumValid": true,
    "globalChecksumValid": true
  },
  "pokemon": [
    { "dex": 1, "name": "BULBASAUR", "baseStats": { "...": "..." } }
  ],
  "moves": [
    {
      "id": 1,
      "name": "POUND",
      "animationId": 1,
      "effect": 0,
      "power": 40,
      "type": 0,
      "accuracy": 255,
      "pp": 35
    }
  ],
  "types": {
    "names": [{ "id": 0, "name": "NORMAL" }],
    "effectiveness": [{ "attacker": 21, "defender": 20, "multiplier": 20 }]
  }
}
```

## Shape (observed fact + implementation decision)

- **meta** — from `identifyGen1Rom` only: `variant`, `title`,
  `romSizeBytes`, `bankCount`, and the two checksum verdicts as
  booleans (`headerChecksum.valid`, `globalChecksum.valid`).
- **pokemon** — 151 entries sorted by `dex` ascending, each with
  `dex`, decoded `name`, and `baseStats` (same field shape as the
  pre-Phase-1 CLI output). Sourced from the existing pokemon loop in
  `buildDataset` (`findGen1IndexByDex` + `decodeGen1Name` +
  `readGen1BaseStats`).
- **moves** — exactly ids 1–165 in order. `name` from the move-name
  decoder (`readGen1MoveNameEntry` + `decodeGen1MoveName`); numeric
  fields from `readGen1MoveData` (`animationId`, raw `effect`,
  `power`, raw `type`, raw `accuracy`, `pp`).
- **types.names** — exactly 27 entries, ids `0x00–0x1A` in order.
  `name` from the type-name decoder (`readAllGen1TypeNameEntries` +
  `decodeGen1TypeName`, A–Z only).
- **types.effectiveness** — the effectiveness table in ROM order
  (`readGen1EffectivenessTable`); never sorted. 82 entries in the
  investigated dumps.

## Raw scales (observed fact)

- **Accuracy** is the raw byte on a 0–255 scale, not percent: 100%
  stores as `0xFF`. The parser exposes the byte unconverted; any
  percent conversion is a consumer concern (see `moves.md` §3).
- **Effectiveness multipliers** are raw bytes. The investigated dumps
  use only `0x00` (no damage), `0x05`, and `0x14`; the parser
  enforces that set and rejects anything else (see `types.md` §3).
- **Missing pair = neutral is NOT parser behavior.** The table lists
  only non-neutral matchups; treating an absent attacker/defender
  pair as neutral damage is engine logic for consumers, not something
  this parser defines or emits.

## Errors and CLI UX (implementation decision)

Unchanged from before Phase 1: exactly one ROM path argument;
`-h`/`--help` prints usage on stdout with exit code 0; every other
failure (missing path, extra arguments, unreadable file, invalid ROM)
prints `Error: ...` on stderr with a non-zero exit.
