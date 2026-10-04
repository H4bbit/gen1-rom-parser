# Gen I move data table and move names

Evidence for `src/gen1/Gen1Moves.ts` (`readGen1MoveData`),
`src/gen1/Gen1MoveNames.ts` (move-name list), and the move-name
extension of `src/gen1/Gen1Text.ts` (`decodeGen1MoveName`). All byte
values below were read from the same two real local images as in
`rom-foundation.md` (Red and Blue, 1 MiB “(USA, Europe) (SGB Enhanced)”
releases). No ROM files are committed; paths stay local.

Conventions follow `rom-foundation.md`:

- **Observed fact** — bytes read directly from the ROMs.
- **Interpretation** — what those bytes mean.
- **Implementation decision** — how the parser represents the information.
- **Assumption** — believed but not fully established.
- **Unknown** — intentionally left unresolved.

## 1. Data table location and stride (observed fact)

The move data table starts at ROM file offset `0x38000`:

- **Observed fact:** the first bytes of the 6-byte slots at
  `0x38000 + k × 6` are exactly `k + 1` for `k = 0 … 164` — i.e. the
  sequence `0x01 … 0xA5` (1–165) — in **both** Red and Blue.
- **Observed fact:** the 16 bytes immediately before `0x38000`
  (file `0x37FF0–0x37FFF`) are all `0x00` — no 6-byte entry rhythm, no
  sequential id at a 6-byte stride. The table therefore starts exactly
  at `0x38000`.
- **Observed fact:** `0x38000 + 165 × 6 = 0x383DE`, which is exactly the
  base-stats table start (`GEN1_BASE_STATS_OFFSET`). The move table
  ends where base stats begin, with no gap and no overlap.
- **Observed fact:** the 990 bytes (`165 × 6`) are byte-identical in
  Red and Blue.

**Provenance (observed fact + assumption):** unlike the Pokémon name
table — located through a stored bank/pointer pair at file `0x2FA3` /
`0x2FAE` (see `text-and-names.md` §1) — no stored bank byte or pointer
locating the move table was found; none is expected in a same-bank
reference, which carries no bank byte by construction. `0x38000` sits
at the start of ROM bank `0x0E` (`0x38000 >> 14 = 14`, i.e. CPU
`0x4000`), and a same-bank `LD HL,$4000` (`21 00 40`) search finds two
references in bank `0x0E`: `0x39888` (routine `0x39884–0x3989A`:
`PUSH HL/DE/BC; DEC A; LD HL,$4000; LD BC,$0006; CALL $3A87; …`) and
`0x3B031` (routine bounded by `RET`s at `0x3B04D`/`0x3B056`:
`… DEC A; LD HL,$4000; LD BC,$0006; CALL $3A87; …`). Both are same-bank
code references (**interpretation** of code, cross-evidence only), and
`LD HL,$4000` occurs 9 more times ROM-wide in other banks (discarded
as candidates). A `00 40` byte-pair search near a `0x0E` bank byte
found only scattered candidates (offsets `0x1A05C`, `0x4FEF5`,
`0x5D400`, `0x70B7A`, `0x785FF`, each ±8 bytes — none with the tight
bank+address pairing shape the name-table pointer has).
**Assumption:** `0x38000` is therefore an empirically observed
location, like the base-stats `0x383DE` and the order-table `0x41024` —
byte-verified in both ROMs. A future pointer discovery would promote
it to a resolved location without changing the parser contract.

## 2. Entry layout (observed fact + interpretation)

Each entry is 6 bytes. Offsets below are within one entry:

| Offset | Contents (raw) | Evidence status |
| --- | --- | --- |
| 0x00 | entry id | **Observed fact:** equals the 1-based slot number (1–165); see §1. |
| 0x01 | effect id | **Interpretation** (position only): the disassembly's `effect` field. |
| 0x02 | power | **Interpretation** (position only): `0x00` for non-damaging moves. |
| 0x03 | type id | **Interpretation** (position only). |
| 0x04 | accuracy | **Interpretation** (position only, 0–255 scale — see §3). |
| 0x05 | base PP | **Interpretation** (position only). |

The field order is confirmed by the pokered disassembly
`data/moves/moves.asm` macro `move` (animation, effect, power, type,
accuracy percent, PP): the first two data rows it emits (POUND
`40/NORMAL/100/35`, KARATE_CHOP `50/NORMAL/100/25`) match the ROM bytes
`01 00 28 00 FF 23` / `02 00 32 00 FF 19` exactly. Pokered is used here
as a cross-check after the ROM census, not as a source (see §7).

**Implementation decision:** the parser exposes every field as a raw
number and assigns no enums: type, effect, and accuracy-scale meanings
are **unknown** at this layer. Byte 0 is exposed as `animationId`
(labeled "animation" by the disassembly) and validated equal to the
requested id, like Gen1Stats validates the stored dex number.

Spot entries (Red; Blue byte-identical), given as full 6-byte rows:

- move 1 (POUND): `01 00 28 00 FF 23`
- move 2 (KARATE CHOP): `02 00 32 00 FF 19`
- move 3 (DOUBLESLAP): `03 1D 0F 00 D8 0A`
- move 33 (TACKLE): `21 00 23 00 F2 23`
- move 57 (SURF): `39 00 5F 15 FF 0F`
- move 85 (THUNDERBOLT): `55 06 5F 17 FF 0F`
- move 105 (RECOVER): `69 38 00 00 FF 14`
- move 129 (SWIFT): `81 11 3C 00 FF 14`
- move 164 (SUBSTITUTE): `A4 4F 00 00 FF 0A`
- move 165 (STRUGGLE): `A5 30 32 00 FF 0A`

## 3. Column censuses (observed fact + interpretation)

Computed over all 165 entries in both ROMs:

- **Power (observed fact):** 27 distinct values —
  `0x00, 0x01, 0x0A, 0x0E, 0x0F, 0x12, 0x14, 0x19, 0x1E, 0x23, 0x28,
  0x32, 0x37, 0x3C, 0x41, 0x46, 0x4B, 0x50, 0x55, 0x5A, 0x5F, 0x64,
  0x78, 0x82, 0x8C, 0x96, 0xAA` (0–170). Includes `0x00`
  (non-damaging moves) and an isolated `0x01` (9 moves: ids 12, 32,
  49, 68, 69, 82, 90, 149, 162 — fixed-damage moves per the
  disassembly; the meaning is **interpretation**, the value is fact).
- **Type (observed fact):** 15 distinct values —
  `0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x14, 0x15, 0x16,
  0x17, 0x18, 0x19, 0x1A` — exactly equal to the base-stats type
  domain (all type1/type2 values of dex 1–150 plus Mew; see §6).
- **Effect (observed fact):** 68 distinct values; `0x00` ("no
  additional effect" per the disassembly) is the most common (31 of
  165). No effect meaning is assigned by the parser.
- **Accuracy (observed fact):** exactly 11 distinct values —
  `0x4C, 0x8C, 0x99, 0xA5, 0xB2, 0xBF, 0xCC, 0xD8, 0xE5, 0xF2, 0xFF`
  (counts: `FF:104, D8:15, E5:11, BF:11, F2:6, CC:5, 8C:4, B2:4, 4C:3,
  99:1, A5:1`). **Interpretation:** the byte is on a 0–255 scale, not
  percent — 100% stores as `0xFF` (104 moves), 85 as `0xD8`
  (`0xD8 = 216 ≈ 85 × 255 / 100`), 95 as `0xF2` (`242 ≈ 95 × 255 /
  100`). The parser exposes the raw byte without converting; any
  percent conversion is a consumer concern.
- **PP (observed fact):** exactly 8 distinct values —
  `5, 10, 15, 20, 25, 30, 35, 40` (counts: `20:43, 10:31, 15:30,
  30:22, 5:11, 40:10, 25:9, 35:9`) — every PP is a multiple of 5
  between 5 and 40.

## 4. Move names (observed fact)

The move names are 165 variable-length strings starting at ROM file
offset `0xB0000`, each terminated by `0x50`, in move-id order:

- **Observed fact:** decoding 165 consecutive `0x50`-terminated
  strings from `0xB0000` yields, in order, POUND (#1), KARATE CHOP
  (#2), … SAND-ATTACK (#28), DOUBLE-EDGE (#38), … STRUGGLE (#165) —
  the full list matches the disassembly's move order entry for entry.
- **Observed fact:** content lengths are 3–12 bytes (shortest: CUT,
  FLY, DIG; 12-byte names include KARATE CHOP, SAND-ATTACK,
  DOUBLE-EDGE and 16 others). The 165 strings contain only 28
  distinct values: `0x80–0x99` (A–Z), `0x7F`, `0xE3`.
- **Observed fact:** the 165th terminator lands at file `0xB060E`
  (list ends at `0xB060F`); the 16 bytes after are all `0x00` — the
  list ends exactly after the 165th string.
- **Observed fact:** all 165 name strings are byte-identical in Red
  and Blue.

**Provenance (observed fact + assumption):** `0xB0000` is the start of
ROM bank `0x2C` (`0xB0000 >> 14 = 44 = 0x2C`, i.e. CPU `0x4000`), and
both tables sit at bank starts — but as with the data table (§1), no
stored bank/pointer pair locating the name list was found; none is
expected in a same-bank reference, which carries no bank byte by
construction. A same-bank `LD HL,$4000` (`21 00 40`) search finds no
reference in bank `0x2C` at all (and no `LD HL,nn` with any banked
target exists in `0xB0000–0xB3FFF`), while a `00 40` byte-pair search
near a `0x2C` bank byte gave only scattered candidates at `0x38A25`,
`0x5C923`, `0x7381A` (discarded). **Assumption:**
`0xB0000` is an empirically observed location, byte-verified in both
ROMs, without stored-pointer provenance.

**Interpretation:** names are sequential strings indexed by move id
(id N = Nth string), not a fixed-stride table — unlike the Pokémon
name table (190 × 10 bytes), there is no stride: locating id N
requires walking the N − 1 strings before it. No length or count
prefix was observed; the count 165 is fixed by the data table (§1).

**Implementation decision:** `src/gen1/Gen1MoveNames.ts` is a parser
separate from `Gen1Moves.ts` (names and data share only the move id),
in the same way `Gen1Names.ts` stands apart from `Gen1Stats.ts`. It
stops after the 165th terminator and never reads past it; each entry
is length-checked (3–12 content bytes, the observed range) and a
missing terminator throws instead of scanning on.

## 5. Move-name charset (observed fact + implementation decision)

- **Observed fact:** with A–Z (`0x80–0x99`) plus two specials, all 165
  names decode with zero undecodable bytes:
  - `0x7F` → space — observed in ~30 names (KARATE CHOP, DOUBLE KICK,
    …). No other byte could be the space: every multiword name uses
    `0x7F` in the gap position.
  - `0xE3` → hyphen — observed in exactly 2 names: #28 SAND-ATTACK
    (`… 83 E3 80 …`) and #38 DOUBLE-EDGE (`… 84 E3 83 …`). No other
    name contains `0xE3`.
- **Observed fact:** none of the Pokémon-name specials (`0xE0, 0xE8,
  0xEF, 0xF5`) occurs in any of the 165 move names.

**Implementation decision:** the move-name charset (`GEN1_TEXT_MOVE_SPECIALS`)
is kept separate from the Pokémon-name charset (`GEN1_TEXT_SPECIALS`):
`decodeGen1Name` still rejects `0x7F`/`0xE3` (its charset was
established from the Pokémon name table alone — see
`text-and-names.md` — and must not be silently widened by move data),
while `decodeGen1MoveName` accepts only A–Z plus space/hyphen and
rejects the Pokémon-name specials, which were never observed in move
names. Neither `GEN1_TEXT_SPECIALS` was mutated. The alternative —
one shared decoder — would have weakened the Pokémon-name validation
(the CLI decodes all 190 Pokémon names through it) on evidence from
an unrelated table; per-structure charsets keep each decoder exactly
as strong as its own ROM evidence.

## 6. Red vs. Blue (observed fact)

The 990 move-data bytes, all 165 name strings, and both table
locations are byte-identical in Red and Blue. Neither table
distinguishes the games. The move type domain additionally equals the
base-stats type domain (§3) in both ROMs.

## 7. Reference comparison

- **pokered (disassembly):** agrees completely — the `move` macro field
  order (animation, effect, power, type, accuracy, PP) matches the ROM
  bytes position for position (spot-checked: POUND, KARATE_CHOP,
  DOUBLESLAP, TACKLE, SURF, THUNDERBOLT, RECOVER, SWIFT, SUBSTITUTE,
  STRUGGLE), and the move-name order matches all 165 decoded strings.
  Used as a cross-check after the ROM census, not as a source: the
  bytes were read and counted first, then compared. The `ASSERT PP <=
  40` in the macro is consistent with the observed PP domain (§3).
- **seanmorris/pokemon-parser:** investigated as a hypothesis source
  for the move-table offset, but its documentation covers only
  pokédex/evolution/level-up data — no move-table offset or layout
  was obtainable from it. No comparison was possible; no discrepancy
  to record. The ROM stands alone here.

## 8. What was deliberately NOT established

- **Unknown:** the meaning of any type id or effect id. The parser
  exposes raw numbers; type/effect enums are a later step.
- **Unknown:** the percent conversion of the accuracy byte. The 0–255
  scale is an interpretation supported by `100 → 0xFF`, `95 → 0xF2`,
  `85 → 0xD8`; the exact rounding rule (and the `0x4C` value, the
  lowest observed) was not established. The parser does not convert.
- **Unknown:** the meaning of power `0x01` beyond the observed value.
  Fixed-damage semantics come from the disassembly, not the ROM.
- **Unknown:** whether `0x50` terminates all Gen I strings or only the
  tables investigated (established here for move names only).
- **Unknown:** the rest of the Gen I charset beyond A–Z, space,
  hyphen, and the four Pokémon-name specials. The decoders reject
  everything else rather than inheriting reference tables.
- **Out of scope (deliberate):** move↔Pokémon composition, learnsets,
  TM/HM mapping, type semantics, battle behavior. Each parser stays
  independent; joins are a consumer concern.
- **Assumption:** 165 is the table count because 165 sequential-id
  entries were observed ending exactly at the base-stats start,
  corroborated by the disassembly's move list. A longer table would
  require evidence of more entries.
- **Assumption:** `0x38000` and `0xB0000` are table locations because
  the bytes there verify — no stored pointer was found (§1, §4). A
  pointer discovery would change the provenance note, not the layout.
