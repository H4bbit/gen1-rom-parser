# Gen I type names and effectiveness table

Evidence for `src/gen1/Gen1TypeNames.ts` (`readGen1TypeNameEntry`),
`src/gen1/Gen1Effectiveness.ts` (`readGen1EffectivenessTable`), and the
type-name extension of `src/gen1/Gen1Text.ts` (`decodeGen1TypeName`). All
byte values below were read from the same two real local images as in
`rom-foundation.md` (Red and Blue, 1 MiB “(USA, Europe) (SGB Enhanced)”
releases). No ROM files are committed; paths stay local.

Conventions follow `rom-foundation.md`:

- **Observed fact** — bytes read directly from the ROMs.
- **Interpretation** — what those bytes mean.
- **Implementation decision** — how the parser represents the information.
- **Assumption** — believed but not fully established.
- **Unknown** — intentionally left unresolved.

## 1. Correction to the Phase 1 report (observed fact)

The Phase 1 report cited the searches `ae 5d` and `e4 5d`. That was a
reporting error: the pointer bytes actually read from the table are
`e4 7d` (NORMAL) and `ae 7d` is the table's own address (see §2). The
searches that were actually executed and reported with contexts were
`ae 5d` (wrong) and `e4 5d` (wrong). The addendum re-ran the correct
searches over the whole ROM:

- **Observed fact:** `ae 7d` occurs exactly once in either ROM, at file
  `0x27DA1` (bank 9) — as the operand of the `LD HL,$7DAE`
  instruction that references the pointer table itself (§4).
- **Observed fact:** `e4 7d` occurs 13 times: the 12 alias entries of
  the pointer table (§2) plus one unrelated occurrence at file
  `0x2DDA2` (bank 11, context `… 92 fe 1f [e4 7d] 18 55 …`, not an
  address load — byte `0x1F` before it is `RRA`, not `LD HL`).
- **Observed fact:** `74 64` occurs exactly 5 times in either ROM: file
  `0x32B6E` (bank 12), `0x38AB4` (bank 14), `0x3E3F8` (bank 15),
  `0x3E459` (bank 15), `0x4FBC9` (bank 19).

## 2. Type-name pointer table and strings (observed fact)

A 27-entry little-endian pointer table at file `0x27DAE–0x27DE3`
(54 bytes, one entry per type id `0x00–0x1A`) locates 16
`0x50`-terminated name strings at file `0x27DE4–0x27E49` (end
`0x27E4A`). Both the table and the strings sit in ROM bank 9
(`0x27DAE >> 14 = 9`, `0x27DE4 >> 14 = 9`).

- **Observed fact:** resolving each pointer within the table's own bank
  (`bank × 0x4000 + (pointer − 0x4000)`) lands exactly on the start of
  one of the 16 strings. Anchor samples:
  - id `0x00` @`0x27DAE`: `e4 7d` → CPU `0x7DE4` → file `0x27DE4` = NORMAL
  - id `0x01` @`0x27DB0`: `eb 7d` → `0x7DEB` = FIGHTING
  - id `0x04` @`0x27DB6`: `28 7e` → `0x7E28` = GROUND
  - id `0x06` @`0x27DBA`: `34 7e` → `0x7E34` = BIRD
  - ids `0x09–0x13` (@`0x27DC0–0x27DD4`): all `e4 7d` → NORMAL
  - id `0x14` @`0x27DD6`: `02 7e` → FIRE … id `0x1A` @`0x27DE2`:
    `43 7e` → DRAGON.
- **Observed fact:** the 16 strings, in file order, are NORMAL,
  FIGHTING, FLYING, POISON, FIRE, WATER, GRASS, ELECTRIC, PSYCHIC, ICE,
  GROUND, ROCK, BIRD, BUG, GHOST, DRAGON (lengths 3–8, full hex in the
  investigation record). The id→name map through the pointers is
  `00 NORMAL, 01 FIGHTING, 02 FLYING, 03 POISON, 04 GROUND, 05 ROCK,
  06 BIRD, 07 BUG, 08 GHOST, 09–13 NORMAL, 14 FIRE, 15 WATER, 16 GRASS,
  17 ELECTRIC, 18 PSYCHIC, 19 ICE, 1A DRAGON`.
- **Observed fact:** the 16 strings contain only 22 distinct values:
  `0x50` plus 21 A–Z bytes. No special byte from any other table
  occurs (`0x7F/0xE3` move-name bytes absent, `0xE0/0xE8/0xEF/0xF5`
  Pokémon-name bytes absent).
- **Observed fact:** the 16 bytes before the table (`0x27D9E`:
  `cf 87 21 ae 7d 5f 16 00 19 2a 5f 56 e1 c3 55 19`) hold code
  (§4), not more pointers; the byte after the strings (`0x27E4A`:
  `21 64 7e …`) starts code, not text.
- **Observed fact:** pointers, strings, and both table boundaries are
  byte-identical in Red and Blue (0 differing bytes over
  `0x27DAE–0x27E4A`).

## 3. Effectiveness table (observed fact)

82 entries × 3 bytes = 246 bytes at file `0x3E474–0x3E569`, plus a
single `0xFF` sentinel at file `0x3E56A` (247 bytes total). Each entry
is (attacking type id, defending type id, multiplier byte).

- **Observed fact:** the first entry @`0x3E474` is `15 14 14`, the last
  @`0x3E567` is `1a 1a 14`; the byte @`0x3E56A` is `0xFF`, followed by
  `21 67 d0 …` — `0x67` is outside the type-id domain, so the run
  breaks exactly at the sentinel.
- **Observed fact:** column censuses over the 82 entries (both ROMs):
  - attacker `00:2, 01:8, 02:5, 03:6, 04:7, 05:6, 07:7, 08:3, 14:7,
    15:6, 16:9, 17:6, 18:3, 19:6, 1A:1`;
  - defender `00:2, 01:4, 02:7, 03:6, 04:6, 05:8, 07:7, 08:5, 14:6,
    15:5, 16:9, 17:3, 18:4, 19:4, 1A:6`;
  - multiplier `0x00:6, 0x05:38, 0x14:38` — exactly 3 distinct values.
- **Observed fact:** no (attacker, defender) pair repeats (0
  duplicates over the 82 entries).
- **Observed fact:** all 247 bytes are byte-identical in Red and Blue.
- **Observed fact:** the union of type ids used by moves (15 values),
  base stats (type1/type2), and effectiveness attacker/defender is
  exactly `{00, 01, 02, 03, 04, 05, 07, 08, 14–1A}` — every used id
  resolves to a name through the pointer table. Id `0x06` (BIRD) has a
  name but is never used by any of the three structures; ids
  `0x09–0x13` (NORMAL aliases) likewise never appear as values.

## 4. Code references (interpretation, not provenance)

Both tables are referenced by `LD HL,nn` instructions in the same ROM
bank as their target — a same-bank address load, which needs no bank
byte by construction. Decoding below is an interpretation of code
bytes, labeled as such; it is recorded as cross-evidence, not as the
provenance the parsers rely on.

- **Interpretation:** routine at `0x27D98–0x27DAD` (ends in `JP $1955`;
  previous routine ends `JP $36E0` at `0x27D95`):
  `CALL $3E94; PUSH HL; LD A,($CFD5); ADD A,A [0x87];
  LD HL,$7DAE [21 ae 7d]; LD E,A; LD D,$00; ADD HL,DE;
  LD A,(HL+); LD E,A; LD D,(HL); POP HL; JP $1955`.
  The `LD HL,$7DAE` loads the pointer-table base; the following
  `ADD HL,DE` (index `2 × A`) plus the `(HL+)`/`(HL)` double load is
  the shape of a 16-bit table lookup. Target and reference are both in
  bank 9, so no bank byte exists — correctly so.
- **Interpretation:** routine at `0x3E449–0x3E473` (ends in `RET`;
  `RET` at `0x3E448` bounds its start):
  `LD A,($CFCF); LD D,A; LD HL,$D019; LD B,(HL); INC HL;
  LD C,(HL); LD A,$10; LD ($D11E),A; LD HL,$6474 [21 74 64];
  LD A,(HL+); CP $FF [fe ff]; RET Z; CP D; JR NZ,+9; …;
  LD A,(HL); LD ($D11E),A; RET`.
  The loop loads `HL = $6474`, reads a first byte, returns on `0xFF`,
  and otherwise compares the next two bytes against `D`/`B`/`C`
  (attacker/defender) before advancing 3 — the shape of a sequential
  sentinel-terminated effectiveness scan. A second, longer routine at
  `0x3E3A5–0x3E448` (bounded by `RET`s at `0x3E3A4`/`0x3E448`)
  contains the same `LD HL,$6474` + `CP $FF` + `JR Z → $3E448` shape
  at `0x3E3F7–0x3E3FD`. Both references are in bank 15 with their
  target, so again no bank byte exists — correctly so.

**Reclassification of the `74 64` hits (observed fact +
interpretation):** of the 5 ROM-wide hits, `0x3E3F8` and `0x3E459`
 sit in bank 15 (the target's bank) immediately after a `0x21`
 (`LD HL`) opcode and inside the decoded routines above — same-bank
 code references. `0x32B6E` (bank 12), `0x38AB4` (bank 14), and
 `0x4FBC9` (bank 19) sit in other banks, are not preceded by `0x21`
 (`B0/CF/AA` respectively), and have no nearby bank byte in a stored
 bank+address pairing shape — discarded as candidates. The `e4 7d`
 hit at `0x2DDA2` (bank 11) is likewise discarded (preceded by `RRA`,
 not an address load).

**Provenance (implementation decision):** both locations are therefore
recorded at three distinct levels, never conflated:
 (a) no stored bank+address pair exists for either table (correct —
 same-bank references need none);
 (b) a same-bank address load in code references each table
 (`LD HL,$7DAE` at `0x27DA0`, `LD HL,$6474` at `0x3E3F7`/`0x3E458`) —
 interpretation of code, kept as cross-evidence only;
 (c) the parsers use fixed file offsets (`0x27DAE`, `0x3E474`)
 confirmed byte-by-byte in both ROMs, exactly like the base-stats
 `0x383DE`/`0x425B` and order-table `0x41024` empirical offsets.
 The type-name parser additionally resolves each pointer within the
 table's own bank rather than a stored bank constant.

## 5. Type-name charset (observed fact + implementation decision)

- **Observed fact:** the 16 type names decode with zero undecodable
  bytes under A–Z (`0x80–0x99`) + `0x50` terminator alone.
- **Implementation decision:** `decodeGen1TypeName` uses an empty
  special map (`GEN1_TEXT_TYPE_SPECIALS = {}`): it accepts only A–Z
  and rejects every special byte from the other tables
  (`0xE0/0xE8/0xEF/0xF5`, `0x7F/0xE3`). Neither `GEN1_TEXT_SPECIALS`
  nor the move-name map was widened; the per-structure charset rule
  from `docs/moves.md` §5 is preserved.

## 6. Red vs. Blue (observed fact)

The pointer table, all 16 name strings, all 247 effectiveness bytes
(including the sentinel), and every decoded routine above are
byte-identical in Red and Blue. Neither structure distinguishes the
games; the type-id domains of moves, base stats, and effectiveness
agree in both ROMs.

## 7. Reference comparison

- **pokered (disassembly):** agrees completely — used as a cross-check
  after the ROM census, not as a source.
  - `constants/type_constants.asm`: `NORMAL $00 … GHOST $08`,
    gap, `FIRE $14 … DRAGON $1A` — exactly the pointer-table id
    domain including the `0x09–0x13` gap and the `0x06` BIRD slot.
  - `data/types/names.asm`: pointer table in the same id order
    (NORMAL…GHOST, 11 × NORMAL, FIRE…DRAGON) with the same 16 strings
    in the same order.
  - `data/types/type_matchups.asm`: 82 `db attacker, defender,
    effect` rows plus `db -1` — entry-for-entry equal to the ROM
    order once ids and `SUPER_EFFECTIVE/NOT_VERY_EFFECTIVE/NO_EFFECT`
    are mapped to `0x14/0x05/0x00` (values from
    `constants/battle_constants.asm`: `SUPER_EFFECTIVE EQU 20`,
    `NOT_VERY_EFFECTIVE EQU 05`, `NO_EFFECT EQU 00`; counts
    38/38/6 match the ROM census exactly).
  - No divergence found; the ROM wins by construction and nothing
    needed overriding.
- **seanmorris/pokemon-parser:** partial agreement with a documented
  divergence in kind, not in bytes.
  - `source/PokemonRom.js#getAllTypes` reads `piece(0x27DE4, 0x27E49)`
    — the exact observed string region — and `decodeText` with a full
    charset. No discrepancy on location or bytes.
  - It decodes that slice as space-separated text
    (`decodeText(buffer).split(' ')`), and its `decodeText` maps every
    unknown byte to a space — so it cannot distinguish the 16
    `0x50`-terminated strings, the 27-entry pointer table, the 11
    NORMAL aliases, or the unused `0x06`; its `getPokemon` then
    remaps raw ids through a hardcoded table (`s = [0,1,2,3,
    A,B,C,D, null×8, E,4,5,6, 7,8,9,F]`). The ROM census above (27
    pointers, 16 strings, aliases, unused BIRD) stands on its own;
    nothing was copied.

## 8. What was deliberately NOT established

- **Unknown:** the meaning of any multiplier byte beyond its observed
  value. `0x14/0x05/0x00` as double/half/immune comes from the
  disassembly's named constants, not the ROM; the parser exposes raw
  bytes and documents the reading as interpretation.
- **Unknown:** any ordering rule for the 82 rows. The table order is
  preserved as observed; no sort or grouping was inferred
  (entry-for-entry equality with pokered is a cross-check, not a rule).
- **Unknown:** the semantics of the NORMAL aliases (`0x09–0x13`) and
  of the unused `0x06` BIRD beyond the observed facts: the pointers
  exist, the values never occur. Documented, not interpreted.
- **Unknown:** whether the empirical offsets and the same-bank code
  references hold for any other revision. Established for the two
  investigated ROMs only.
- **Out of scope (deliberate):** type↔move composition, learnsets,
  TM/HM, damage calculation, battle behavior. Each parser stays
  independent; joins are a consumer concern.
- **Assumption:** 27 is the pointer count because 27 entries of valid
  shape were observed ending exactly at the string region start;
  82 is the entry count because 82 triples precede a single `0xFF`
  that breaks the run. Both are labeled observed limits in code.
- **Assumption:** the two investigated images represent the canonical
  Red/Blue layout, as in `rom-foundation.md` §10.
