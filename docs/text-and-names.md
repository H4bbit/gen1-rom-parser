# Gen I text encoding and the Pokémon name table

Evidence for `src/gen1/Gen1Text.ts` (`decodeGen1Name`),
`src/gen1/Gen1Names.ts` (name table layout), and `src/gen1/Gen1Order.ts`
(order table). All byte values below were read
from the same two real local images as in `rom-foundation.md` (Red and
Blue, 1 MiB “(USA, Europe) (SGB Enhanced)” releases). No ROM files are
committed; paths stay local.

Conventions follow `rom-foundation.md`:

- **Observed fact** — bytes read directly from the ROMs.
- **Interpretation** — what those bytes mean.
- **Implementation decision** — how the parser represents the information.
- **Assumption** — believed but not fully established.
- **Unknown** — intentionally left unresolved.

## 1. Table location (observed fact)

A bank/pointer pair at file offsets `0x2FA3` (bank byte) and `0x2FAE`
(little-endian CPU address) locates the table in both ROMs:

- Red: bank `0x07`, address `0x421E` → file `0x1C21E`.
- Blue: bank `0x07`, address `0x421E` → file `0x1C21E` (byte-identical).

Resolved with the established `resolveBankedPointer` rule (banked window
`0x4000–0x7FFF`). The 1900 bytes starting at file `0x1C21E` are
byte-identical in Red and Blue.

## 2. Table layout (observed fact)

190 entries × 10 bytes = 1900 bytes, fixed stride, no pointer table.
Entry `i` starts at file `0x1C21E + i × 10`.

- **Observed fact:** the first terminator-or-end position per entry is
  never past byte 9, and every byte after the first `0x50` within an
  entry is also `0x50` (checked over all 190 entries).
- **Observed fact:** 53 of 190 entries contain no `0x50` at all; all 53
  are exactly 10 content bytes long (e.g. `KANGASKHAN`,
  `MISSINGNO.`, `HITMONCHAN`).
- **Observed fact:** the shortest entries are 3 content bytes
  (`MEW`, `MUK`) and 4 content bytes (`ONIX`, `SEEL`, `JYNX`, `ABRA`).
- **Observed fact:** the 1900 bytes contain only 31 distinct values:
  `0x80–0x99`, `0xE0`, `0xE8`, `0xEF`, `0xF5`, `0x50`.

**Interpretation:** strings are variable-length, terminated by `0x50`
and padded with `0x50` to the fixed 10-byte entry. Padding and
terminator share the same value, so “terminated at 3, padded to 10” and
“10 content bytes, unterminated” are both directly readable from the
entry shape. A 10-letter name fills the entry with no terminator; the
decoder returns all 10 bytes as content.

The bytes after the table (file `0x1C98A`: `CD 0F 19 CD ED 3D …`) are
code, not more names — the table ends exactly at `0x1C21E + 1900`.

## 3. Character mapping (observed fact + interpretation)

Tested by decoding all 190 entries with the hypothesized mapping and
checking every name, not just one example:

- `0x80–0x99` → `A–Z` (`byte − 0x80 + 'A'`). All 26 values occur in the
  table. Spot checks across lengths: `MEW` (3), `ONIX`/`SEEL`/`ABRA`
  (4), `RHYDON` (6), `EXEGGUTOR`/`LICKITUNG` (9), `KANGASKHAN` (10).
- `0xE0` → `'` — established by entry 63 (`FARFETCH'D`), the only
  apostrophe name in the table.
- `0xE8` → `.` — established by entry 41 (`MR.MIME`) and the
  `MISSINGNO.` entries (39 of them; every 10-byte `.`-final entry ends
  in `0xE8`).
- `0xEF` → `♂` — established by entry 2 (`NIDORAN♂`).
- `0xF5` → `♀` — established by entry 14 (`NIDORAN♀`).
- `0x50` → terminator/padding (see §2).

With this mapping, all 190 entries decode with zero undecodable bytes,
and the full decoded list matches the pokered disassembly
`data/pokemon/names.asm` (`MonsterNames`, 190 `dname` lines) exactly,
entry for entry. The pokered `dname` macro independently confirms the
layout: `table_width NAME_LENGTH - 1` with `NAME_LENGTH = 11`, i.e. 10
content bytes padded with the terminator character.

**Implementation decision:** the decoder contains exactly this mapping
(A–Z + the four specials + terminator). Any other byte throws
`Gen1TextError` with the entry offset and the byte value instead of
being guessed.

## 4. Order table (observed fact + interpretation)

The order table at file `0x41024` is parallel to the name table: one
byte per internal index, `order[i]` at file `0x41024 + i`, 190 entries
(`0x41024–0x410E1`). The 16 bytes before (`… E1 C1 C9`) and the bytes
from `0x410E2` on (`FA 3D CD EA 5E …`) are code, not table data — the
table is exactly the 190 bytes both the reference (`slice(0x41024,
190)`) and the name-table count delimit.

- **Observed fact:** the 190 values are exactly `0x00–0x97` (0–151),
  each dex number 1–151 occurring exactly once, plus 39 `0x00` bytes
  (distinct values = 152 = 151 numbers + zero). No value above 151
  occurs; no dex number repeats or is missing.
- **Observed fact:** the 39 `0x00` slots are internal indexes 30, 31,
  49, 51, 55, 60–62, 66–68, 78–80, 85, 86, 93, 94, 114, 120, 121, 126,
  133, 134, 136, 139, 145, 155, 158–161, 171, 173, 174, 180–183.
- **Observed fact:** all 39 `0x00` slots decode to `MISSINGNO.` in the
  name table, and all 39 `MISSINGNO.` name entries sit at `0x00` slots
  — the correspondence is exact in both directions (checked over all
  190 entries in both ROMs, through the committed `readGen1OrderValue`
  + `decodeGen1Name` APIs).
- **Observed fact:** the table is byte-identical in Red and Blue
  (including the surrounding code bytes).
- **Observed fact:** spot round trips hold in both ROMs: index 0
  (`RHYDON`) → 112, index 152 (`BULBASAUR`) → 1, index 20 (`MEW`) →
  151, index 130 (`MEWTWO`) → 150, index 83 (`PIKACHU`) → 25;
  inversely dex 1 → index 152, dex 112 → index 0, dex 151 → index 20.
  First index (0 = `RHYDON`/112) and last (189 = `VICTREEBEL`/71)
  included.

**Interpretation:** `order[i]` is the Pokédex number of internal index
`i`. The relation is demonstrated, not assumed: the values cover
1–151 exactly once each (a permutation plus zeros), and the sampled
index→value pairs match the species the name table independently
decodes at those indexes (RHYDON = #112, BULBASAUR = #1, MEW = #151,
…).

**On `0x00` (observed correlation, restrained semantics):** `0x00` is
not a Pokédex number — no species is #0, and the value never occurs as
a dex number elsewhere. Within these ROMs it coincides exactly with
the `MISSINGNO.` name entries, and the pokered disassembly writes the
same slots as `db 0 ; MISSINGNO.` with the comment that
`PokedexOrder` “lists 0 as the dex ID for every MissingNo”
(`data/trainers/parties.asm`). The parser therefore exposes the raw
value as `GEN1_ORDER_NO_DEX = 0` (“slot without a Pokédex number”)
and documents the MISSINGNO. coincidence as observed fact — it does
not define `0x00` as “means MISSINGNO.”, since glitch-name semantics
are out of scope and a future ROM could in principle pair the values
differently.

**Implementation decision:** `src/gen1/Gen1Order.ts` reads the table
at the fixed file offset (`GEN1_ORDER_TABLE_OFFSET = 0x41024`). No stored
bank byte or pointer locating this table was found, so — like the
base-stats locations `0x383DE`/`0x425B` (see `docs/base-stats.md` §6) —
the offset is an empirically observed location confirmed byte-by-byte in
both ROMs, not an address resolved from ROM-stored data:
`readGen1OrderValue` returns the raw byte for an internal index
(0–189, else `Gen1OrderError`); `findGen1IndexByDex` scans for a dex
number 1–151 (else `Gen1OrderError`, including absence). No combined
“Pokémon” model, no join with stats/moves — the order table only adds
the index→dex mapping on top of the name table.

## 5. Red vs. Blue (observed fact)

The name bank/pointer, all 1900 name bytes, and all 190 order-table
bytes are byte-identical in Red and Blue. Neither table distinguishes
the games.

## 6. Reference comparison

- **pokered (disassembly):** agrees completely — 190 `dname` entries in
  the same order decode to the same strings; `NAME_LENGTH - 1 = 10`
  confirms the entry size; `assert_table_length NUM_POKEMON_INDEXES`
  confirms the count. Used as a cross-check, not as a source: the ROM
  bytes were decoded first, then compared.
- **seanmorris/pokemon-parser:** reads the same 190 bytes
  (`slice(0x41024, 190)`) as the index→number map (`getPokemonNumber`)
  and the name lookup uses the same shape (`pointer + 0xA × index`,
  terminator `0x50`, max `0xA`). No discrepancy found for the name or
  order tables.
- **pokered order table:** `data/pokemon/dex_order.asm`
  (`PokedexOrder`, `table_width 1`, 190 entries) resolves through
  `constants/pokedex_constants.asm` (`DEX_RHYDON = 112` … `DEX_MEW =
  151`) to a 190-byte sequence that is byte-for-byte equal to the ROM
  table at `0x41024`, including all 39 `db 0 ; MISSINGNO.` slots at the
  same indexes. Used as a cross-check after the ROM census, not as a
  source.

## 7. What was deliberately NOT established

- **Unknown:** the rest of the Gen I charset (lowercase, digits,
  punctuation beyond `'`/`.`, control codes). The reference table lists
  many more assignments, but none were verified against ROM bytes here.
  The decoder rejects them rather than inheriting the reference table.
- **Unknown:** whether `0x50` terminates Gen I strings beyond the three
  structures established here. `0x50` termination is established for
  Pokémon names (137 terminated + 53 full-length entries in this table),
  for move names (165 `0x50`-terminated strings, see `moves.md` §4),
  and for type names (16 `0x50`-terminated strings, see `types.md` §2).
  Other structures (dex text uses `0x50` as a terminator in the
  reference, but that was not investigated) remain unknown.
- **Unknown:** the meaning of order-table value `0x00` beyond the
  observed facts in §4 — it coincides with `MISSINGNO.` slots here, but
  glitch-name semantics are out of scope and the parser does not bless
  the equivalence as a rule.
- **Assumption:** 190 is the table count because 190 entries of valid
  shape were observed followed by code bytes, corroborated by pokered’s
  `assert_table_length`. A longer table would require evidence of more
  entries.
