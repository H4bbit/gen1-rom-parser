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
    {
      "dex": 1,
      "name": "BULBASAUR",
      "baseStats": {
        "dexNumber": 1,
        "hp": 45,
        "attack": 49,
        "defense": 49,
        "speed": 45,
        "special": 65,
        "type1": 22,
        "type2": 3,
        "catchRate": 45,
        "baseExp": 64,
        "spriteSize": 85,
        "frontSprite": 16384,
        "backSprite": 16613,
        "level1Moves": [33, 45, 0, 0],
        "growthRate": 3,
        "tmhm": [164, 3, 56, 192, 3, 8, 6],
        "padding": 0
      },
      "learnset": {
        "levelUp": [
          { "level": 7, "move": 73 },
          { "level": 13, "move": 22 }
        ],
        "tmhm": [14, 92, 34]
      }
    }
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
  `dex`, decoded `name`, `baseStats`, and `learnset`. Sourced from
  the existing pokemon loop in `buildDataset` (`findGen1IndexByDex` +
  `decodeGen1Name` + `readGen1BaseStats` + `readGen1LevelUpLearnset`). The `baseStats` object
  matches `CliPokemonBaseStats` in `src/cli.ts` field for field:
  `dexNumber` (the stored entry id, same value as the parent `dex` —
  both are emitted), `hp`, `attack`, `defense`, `speed`, `special`,
  raw type ids `type1`/`type2` (id→name map in `types.md` §2),
  `catchRate`, `baseExp`, `spriteSize`, raw sprite CPU addresses
  `frontSprite`/`backSprite`, raw move ids `level1Moves` (`0` = no
  move; the move table itself is in `moves.md`), `growthRate`,
  `tmhm` as a plain `number[]` (raw 7-byte bitfield; no bit is
  decoded here), and `padding` (the raw trailing byte).
- **pokemon.learnset** — `{ levelUp: [{ level, move }, …], tmhm: [move, …] }`.
  `levelUp` from `readGen1LevelUpLearnset` (ROM order, never sorted; see
  `learnsets.md`). `level` is the raw stored level, `move` is the raw
  move id 1–165 (the move table itself is in `moves.md`). Empty arrays
  are ROM data: 12 real species have truly empty learnsets in both
  dumps (dex 10, 11, 13, 14, 26, 36, 38, 40, 59, 63, 121, 132 — see
  `learnsets.md` §5). Evolution records are skipped, not exposed.
  `tmhm` from `readGen1TmHmLearnset` (slot order TM01–TM50 then
  HM01–HM05; see `tmhm.md`): raw move ids 1–165, joined to names via
  the top-level `moves` array. Empty arrays are ROM data: 6 species
  have all-zero TM/HM bitfields in both dumps (dex 10, 11, 13, 14,
  129, 132 — see `tmhm.md` §4).
- **moves** — exactly ids 1–165 in order. `name` from the move-name
  decoder (`readGen1MoveNameEntry` + `decodeGen1MoveName`); numeric
  fields from `readGen1MoveData` (`animationId`, raw `effect`,
  `power`, raw `type`, raw `accuracy`, `pp`). `animationId` is the
  stored entry id byte, validated equal to the move id
  (`entry[0] === id`) — the name “animation” is disassembly labeling
  (interpretation), not an extra ROM-discovered meaning beyond the id
  byte (see `moves.md` §2).
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
