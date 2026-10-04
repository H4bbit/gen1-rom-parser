# Gen I level-up learnsets (Phase 2a)

Evidence for `src/gen1/Gen1Learnsets.ts`
(`readGen1LevelUpLearnset`, `readGen1LevelUpLearnsetByIndex`,
`gen1LearnsetEntryOffset`) and the `learnset` field of the CLI dataset.
All byte values below were read from the same two real local images as
in `rom-foundation.md` (Red and Blue, 1 MiB “(USA, Europe) (SGB
Enhanced)” releases). No ROM files are committed; paths stay local.

Conventions follow `rom-foundation.md`:

- **Observed fact** — bytes read directly from the ROMs.
- **Interpretation** — what those bytes mean.
- **Implementation decision** — how the parser represents the information.
- **Assumption** — believed but not fully established.
- **Unknown** — intentionally left unresolved.

## 1. The §7.2 lead, re-validated (observed fact)

`rom-foundation.md` §7.2 recorded a **preliminary,
reference-guided hypothesis**: a 190-entry LE address table at file
`0x3B05C` whose entries all fall in the banked window `0x4000–0x7FFF`,
with a reference-supplied bank `0x0E` (from a reference call-site
constant, `makeRef(0x0E, …)`) resolving entry 0 (`D8 71` → `0x71D8`)
to file `0x3B1D8`. What was NOT observed then was a stored bank byte
for the table — unlike the name table (bank byte at `0x2FA3` +
address at `0x2FAE`).

Re-validation performed for this phase:

- **Observed fact:** file `0x3B05C` holds 190 LE pointers, every one
  in `0x4000–0x7FFF` (min `0x71D8`, max `0x79E4`) in **both** ROMs.
- **Observed fact:** the table is byte-identical in Red and Blue
  (0 diff bytes over all 380 bytes).
- **Observed fact:** the table ends exactly where its first entry
  points: `0x3B05C + 190 × 2 = 0x3B1D8` = file offset of entry 0's
  target under bank `0x0E` (`0x0E × 0x4000 + (0x71D8 − 0x4000)`).
  Table and data are contiguous, with no gap and no header.
- **Observed fact:** all 190 resolved entries are back-to-back with
  no gaps: parsing every entry (evolution section + learnset, §2)
  ends exactly at the next entry's resolved start, and the last
  entry ends at file `0x3B9EC`. Data region `0x3B1D8–0x3B9EC` (1956
  bytes) is byte-identical in Red and Blue.
- **Observed fact:** file `0x3B05C` sits in ROM bank `0x0E`
  (`0x3B05C >> 14 = 14`), and every resolved entry (`0x3B1D8–0x3B9EC`)
  sits in the same bank (`0x38000–0x3BFFF`). So this is a **same-bank
  table**: pointers resolve within the table's own bank, exactly like
  the type-name table (§4) — no stored bank byte is expected in a
  same-bank reference, which carries no bank byte by construction.
  The bank `0x0E` is therefore established from the ROM layout
  itself, not only from the reference constant.
- **Observed fact (code cross-evidence):** a same-bank `LD HL,$705C`
  (`21 5C 70`) search finds four references in bank `0x0E` (files
  `0x3AD55`, `0x3AF5B`, `0x3AF68`, `0x3AFBE`; CPU `0x6D55`, `0x6F5B`,
  `0x6F68`, `0x6FBE` — all in bank `0x0E`, i.e. files
  `0x38000–0x3BFFF`). `0x705C` is exactly the CPU address of file
  `0x3B05C` in bank `0x0E` (`0x4000 + (0x3B05C − 0x38000)`), and the
  surrounding bytes show the table-indexing pattern (`87` = `ADD A,A`
  to double the index for 2-byte entries, followed by `CB 10` /
  `4F` / `09` = `RLC`/`LD C,A`/`ADD HL,BC` to add the index into the
  base). These are same-bank code references (**interpretation** of
  code, cross-evidence only), of the same kind as the `LD HL,$4000`
  references behind the move table in `moves.md` §1.
- **Observed fact:** `0x38000` (move table, `moves.md` §1),
  `0x383DE` (base stats), and this table/data (`0x3B05C`/`0x3B1D8`)
  all sit in bank `0x0E` (`0x38000–0x3BFFF`).

**Interpretation:** the §7.2 hypothesis holds. The pointer table at
file `0x3B05C` with same-bank resolution in bank `0x0E` is promoted
from a reference-guided lead to a ROM-established location: the
table/data contiguity, the gapless 190-entry chain, the same-bank
containment, and the in-bank code references converge on it. The
prose in `rom-foundation.md` §7.2 stays as written (it records the
state of knowledge at the time); this document records the completed
provenance.

## 2. Entry layout (observed fact + interpretation)

Each entry is variable-length with two sections, each terminated by a
single `0x00` byte:

| Section | Layout | Evidence status |
| --- | --- | --- |
| Evolutions | records of type `0x01` (3 bytes: type, level/baby, species), `0x02` (4 bytes: type, item, level-babysit, species), `0x03` (3 bytes: type, level, species), then `0x00` | **Observed fact:** every one of the 190 entries parses gaplessly with exactly these three record shapes (§1); any other first byte would break the chain. **Interpretation:** record-type meanings (level/item/trade) come from the disassembly header comment (`db EVOLVE_LEVEL, level, species` / `db EVOLVE_ITEM, used item, min level (1), species` / `db EVOLVE_TRADE, min level (1), species` + `db 0 ; no more evolutions`, see §7) — the parser skips these records without decoding them. |
| Learnset | pairs of (level, move), then `0x00` | **Observed fact:** after the evolution `0x00`, pairs run to the next `0x00`; pair count × 2 + section overhead accounts for every byte of the gapless chain. **Interpretation:** level first, move second (disassembly `db level, move`, see §7); confirmed by the spot entries in §5. |

**Implementation decision:** only the learnset is exposed
(`readGen1LevelUpLearnset` returns `Array<{ level, move }>` in ROM
order). The evolution section is skipped with full shape enforcement
(unknown first byte, missing terminator, or a truncated record
throws) so a malformed evolution list can never silently misalign the
learnset. Evolution semantics, TM/HM decoding, and move-effect
semantics are out of scope for this phase.

Evo census (**observed fact**, both ROMs): record types observed are
exactly `{1, 2, 3}`; 70 of 190 slots carry evolution records (70 of
the 151 real species too — every real-species evo list is non-empty
iff its slot is); 16 `0x02` records total; longest evo list is 3
records (Eevee, index 101: three `0x02` records). Glitch slots (39,
order value 0) all start `00 00` — no evolutions, no learnset.

## 3. Indexing rule: internal index, not dex (observed fact)

- **Observed fact:** the pointer table has 190 entries — the internal
  index count, not 151. Entry `i` belongs to the species with
  internal index `i`:
  - entry 0 parses to Rhydon's learnset (`30,STOMP … 64,TAKE_DOWN`,
    §5) — and internal index 0 is Rhydon (name-table entry 0,
    order value 112).
  - entry 152 parses to Bulbasaur's learnset — and internal index
    152 holds BULBASAUR (order value 1).
  - entry 83 parses to Pikachu's learnset — and internal index 83
    holds PIKACHU (order value 25).
  - entry 20 parses to Mew's learnset — and internal index 20 holds
    MEW (order value 151).
- **Observed fact:** the base-stats table is the opposite: indexed by
  dex number (see `base-stats.md` §4). The two schemes coexist —
  stats by dex, learnsets by internal index. Assuming dex indexing
  here would return the wrong species' moves (e.g. dex 25 would read
  entry 25's bytes instead of Pikachu's entry 83).

**Implementation decision:** `readGen1LevelUpLearnset(reader,
dexNumber)` takes a dex number 1–151 (same policy as base stats and
the CLI pokemon loop) and resolves it through the existing order
table (`findGen1IndexByDex`) — no parallel join API was invented.
`readGen1LevelUpLearnsetByIndex(reader, index)` exposes the raw
index-keyed read. A dex number missing from the order table throws
`Gen1OrderError`; in the investigated ROMs every dex 1–151 occurs
exactly once and no slot value repeats (39 slots hold 0 = no dex).

## 4. Sentinel and validation (observed fact + implementation decision)

- **Observed fact:** both sections end with a single `0x00` byte.
  A `0x00` level is impossible (game levels start at 1) and a `0x00`
  move is impossible (move ids start at 1; `0` = "no move" exists
  only in the fixed base-stats level-1 slots, not in this list) — so
  the terminator is unambiguous in both sections.
- **Observed fact:** no learnset pair with level `0x00` or move
  `0x00` occurs anywhere in the 190 entries; the first data byte of
  every glitch-slot entry is `0x00` (empty evo list) followed
  immediately by a second `0x00` (empty learnset).
- **Observed fact:** levels are strictly increasing within every
  entry (0 of 190 entries violates this); the parser enforces it and
  reports the entry index and file offset on violation — ROM order is
  preserved, never sorted.
- **Observed fact:** entry byte sizes are 2–22 (2 = double-`0x00`
  empty entry) — far below the reader's 512-byte missing-sentinel
  guard, which exists only to bound a corrupt scan.

Validation (**implementation decision**): the reader enforces —
pointer in `0x4000–0x7FFF` (else not a banked pointer); evolution
record shape (`0x01`/`0x03` = 3 bytes, `0x02` = 4 bytes, `0x00` =
end, anything else throws); learnset level 1–100 (game level
domain; `0x00` is the sentinel, never a level); move id 1–165
(the move-table range); strictly increasing levels; missing
sentinels (either section); truncation (every multi-byte read goes
through bounds-checked `RomReader` access). Every error carries the
structure, the internal index or dex number, and the ROM file
offset. Dex numbers outside 1–151 and indexes outside 0–189 are
rejected before any ROM access.

## 5. Census and spot entries (observed fact)

Computed over all 190 entries in both ROMs with the committed reader:

- **Observed fact:** 190 entries parse gaplessly (`0x3B1D8–0x3B9EC`);
  728 total (level, move) pairs; per-entry counts 0–8 (longest: index
  23 = TENTACOOL, 8 moves); 51 of 190 slots are empty, of which 39
  are glitch slots and 12 are real species.
- **Observed fact:** move ids span 1–164 (165 STRUGGLE never appears;
  no id 0, none above 165). Levels span 5–81 in the dumped data
  (min 5, max 81; the parser accepts the full 1–100 game domain).
- **Observed fact:** all 151 dex 1–151 entries are readable; Red and
  Blue learnsets are identical for every dex number.

Real-species empty learnsets (**observed fact**, both ROMs — `db 0`
straight after the evolution `0x00`, matching the disassembly's
`DittoEvosMoves`/`MissingNo*EvosMoves` shape): dex 10 CATERPIE, 11
METAPOD, 13 WEEDLE, 14 KAKUNA, 26 RAICHU, 36 CLEFABLE, 38 NINETALES,
40 WIGGLYTUFF, 59 ARCANINE, 63 ABRA, 121 STARMIE, 132 DITTO. The CLI
emits these as empty `levelUp` arrays — emptiness is ROM data, not a
parser fallback.

Spot entries (Red; Blue byte-identical), given as (level, move id +
decoded move name for readability — names from the move-name list in
`moves.md` §4, not re-established here):

- index 0 = RHYDON (dex 112): `30,23 STOMP / 35,39 TAIL WHIP /
  40,31 FURY ATTACK / 48,32 HORN DRILL / 55,43 LEER / 64,36 TAKE DOWN`
  — matches the disassembly's `RhydonEvosMoves` entry for entry (§7).
- index 83 = PIKACHU (dex 25): `9,86 THUNDER WAVE / 16,98 QUICK
  ATTACK / 26,129 SWIFT / 33,97 AGILITY / 43,87 THUNDER`.
- index 152 = BULBASAUR (dex 1): `7,73 LEECH SEED / 13,22 VINE WHIP
  / 20,77 POISONPOWDER / 27,75 RAZOR LEAF / 34,74 GROWTH /
  41,79 SLEEP POWDER / 48,76 SOLARBEAM`.
- index 20 = MEW (dex 151): `10,144 TRANSFORM / 20,5 MEGA PUNCH /
  30,118 METRONOME / 40,94 PSYCHIC`.
- index 23 = TENTACOOL (dex 72, longest list): `7,48 SUPERSONIC /
  13,35 WRAP / 18,40 POISON STING / 22,55 WATER GUN / 27,132
  CONSTRICT / 33,112 BARRIER / 40,103 SCREECH / 48,56 HYDRO PUMP`.

Note: base-stats level-1 moves (e.g. Bulbasaur `33 TACKLE / 45
GROWL`, Pikachu `84 THUNDERSHOCK / 45 GROWL`) do not overlap these
lists — level 1 is learned outside the level-up table, and no
level-1 pair occurs in any of the 190 entries. The parser exposes
the stored levels unconverted; any level-1 composition is a consumer
concern.

## 6. Red vs. Blue (observed fact)

The 380-byte pointer table, the 1956-byte data region
(`0x3B1D8–0x3B9EC`), and every decoded learnset for dex 1–151 are
byte-identical in Red and Blue. Like the move, base-stats, and order
tables, this structure does not distinguish the games. The 12 empty
real-species learnsets (§5) are the same 12 in both ROMs.

## 7. Reference comparison

- **pokered (disassembly)** `data/pokemon/evos_moves.asm`: the header
  comment fixes the layout (`EVOLVE_LEVEL, level, species` /
  `EVOLVE_ITEM, used item, min level (1), species` / `EVOLVE_TRADE,
  min level (1), species`, `db 0 ; no more evolutions`, then `db
  level, move` in increasing level order, `db 0 ; no more level-up
  moves`), with `EVOLVE_LEVEL = 1, EVOLVE_ITEM = 2, EVOLVE_TRADE = 3`
  (`constants/pokemon_data_constants.asm`) and 190 `dw` pointers
  (`assert_table_length NUM_POKEMON_INDEXES`). Spot entries agree
  completely with the ROM bytes: Rhydon (`30 STOMP … 64 TAKE DOWN`),
  Bulbasaur-region shape, Pikachu, Tentacool, Mew, Eevee's three
  `EVOLVE_ITEM` records, Kadabra/Machoke/Graveler/Haunter
  `EVOLVE_TRADE` records, Ditto's double-`db 0`. Used strictly as a
  cross-check **after** the ROM census (the gapless 190-entry parse,
  the §5 spot values, and the §1 code references were established
  from the bytes first): the bytes were read and counted first, then
  compared. No code or data was copied.
- **seanmorris/pokemon-parser:** knowledge reference only, per
  AGENTS.md. Its banked-address arithmetic was already checked in
  `rom-foundation.md` §7.4; no learnset-specific behavior was adopted
  from it.

## 8. What was deliberately NOT established

- **Unknown:** evolution semantics beyond record shapes. The type
  byte is skipped, never interpreted; item/level/species bytes are
  not exposed. A future evolution parser owns that section.
- **Unknown:** TM/HM learnsets. The 7-byte base-stats bitfield
  (`base-stats.md` §2) and any TM/HM list near these entries are out
  of scope here — no TM/HM work is claimed.
- **Unknown:** move-effect semantics. Move ids stay raw 1–165; the
  move table itself is in `moves.md`.
- **Unknown:** the exact in-game meaning of an empty learnset for
  the 12 real species in §5 (fully-evolved-by-stone? cocoon? Ditto?).
  The parser reports the ROM bytes; interpretation belongs to
  consumers.
- **Unknown:** whether any legitimate Red/Blue revision moves this
  table or uses different record shapes. Established for the two
  investigated ROMs only.
- **Assumption:** the two investigated images (USA/Europe SGB
  Enhanced releases) represent the canonical Red/Blue layout, as in
  `rom-foundation.md` §10.
- **Assumption:** `0x3B05C` + bank `0x0E` is the table location
  because the bytes, the contiguity, and the code references verify
  (§1) — the same empirical-location standing as the move table
  (`moves.md` §1) and stronger than the base-stats table
  (`base-stats.md` §6), which records no code-reference hunt.
