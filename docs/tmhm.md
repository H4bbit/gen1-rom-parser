# Gen I TM/HM learnsets (Phase 2b)

Evidence for `src/gen1/Gen1TmHm.ts`
(`readGen1TmHmTable`, `decodeGen1TmHm`, `readGen1TmHmLearnset`) and
the `learnset.tmhm` field of the CLI dataset. All byte values below
were read from the same two real local images as in
`rom-foundation.md` (Red and Blue, 1 MiB “(USA, Europe) (SGB
Enhanced)” releases). No ROM files are committed; paths stay local.

Conventions follow `rom-foundation.md`:

- **Observed fact** — bytes read directly from the ROMs.
- **Interpretation** — what those bytes mean.
- **Implementation decision** — how the parser represents the information.
- **Assumption** — believed but not fully established.
- **Unknown** — intentionally left unresolved.

Level-up learnsets are documented separately in `learnsets.md` and
are unchanged by this phase. Evolution exposure, move-effect
semantics, and Yellow support are out of scope here.

## 1. Machine table location and contents (observed fact)

The machine table holds one move-id byte per TM/HM slot at ROM file
offset `0x13773`:

- **Observed fact:** the 55-byte run at file `0x13773` reads
  `05 0D 0E 12 19 5C 20 22 24 26 3D 37 3A 3B 3F 06 42 44 45 63 48 4C
  52 55 57 59 5A 5B 5E 64 66 68 73 75 76 78 79 7E 81 82 87 8A 8F 9C
  56 95 99 9D A1 A4 0F 13 39 46 94` — decimal
  `5, 13, 14, 18, 25, 92, 32, 34, 36, 38, 61, 55, 58, 59, 63, 6, 66,
  68, 69, 99, 72, 76, 82, 85, 87, 89, 90, 91, 94, 100, 102, 104,
  115, 117, 118, 120, 121, 126, 129, 130, 135, 138, 143, 156, 86,
  149, 153, 157, 161, 164, 15, 19, 57, 70, 148` — in **both** Red and
  Blue (byte-identical; exactly one full-ROM occurrence of the
  55-byte sequence in each ROM).
- **Observed fact:** every one of the 55 bytes is a move id in
  1–165 (min 5, max 164). No byte is 0 or above 165.
- **Observed fact:** file `0x13773` sits in ROM bank `0x04`
  (`0x13773 >> 14 = 4`), CPU `0x7773` in the switchable window.

**Provenance (observed fact):** `0x13773` is an empirically observed
location, like the move table (`moves.md` §1) and the base-stats
tables (`base-stats.md` §6): byte-verified in both ROMs without a
stored bank/pointer provenance. Two same-bank `LD HL,$7773`
(`21 73 77`) code references exist in bank `0x04` (files `0x13751`
and `0x13767`, on both sides of the table), but no decode of the
surrounding routines was performed — they are recorded as address
coincidences (cross-evidence only), not as established callers.

**Interpretation:** the 55 bytes are the TM→move list (slots 1–50)
followed by the HM→move list (slots 51–55):

| Slot | Move id | Move name (for readability only) |
| --- | --- | --- |
| TM01–TM10 | 5, 13, 14, 18, 25, 92, 32, 34, 36, 38 | MEGA PUNCH, RAZOR WIND, SWORDS DANCE, WHIRLWIND, MEGA KICK, TOXIC, HORN DRILL, BODY SLAM, TAKE DOWN, DOUBLE EDGE |
| TM11–TM20 | 61, 55, 58, 59, 63, 6, 66, 68, 69, 99 | BUBBLEBEAM, WATER GUN, ICE BEAM, BLIZZARD, HYPER BEAM, PAY DAY, SUBMISSION, COUNTER, SEISMIC TOSS, RAGE |
| TM21–TM30 | 72, 76, 82, 85, 87, 89, 90, 91, 94, 100 | MEGA DRAIN, SOLARBEAM, DRAGON RAGE, THUNDERBOLT, THUNDER, EARTHQUAKE, FISSURE, DIG, PSYCHIC, TELEPORT |
| TM31–TM40 | 102, 104, 115, 117, 118, 120, 121, 126, 129, 130 | MIMIC, DOUBLE TEAM, REFLECT, BIDE, METRONOME, SELFDESTRUCT, EGG BOMB, FIRE BLAST, SWIFT, SKULL BASH |
| TM41–TM50 | 135, 138, 143, 156, 86, 149, 153, 157, 161, 164 | SOFTBOILED, DREAM EATER, SKY ATTACK, REST, THUNDER WAVE, PSYWAVE, EXPLOSION, ROCK SLIDE, TRI ATTACK, SUBSTITUTE |
| HM01–HM05 | 15, 19, 57, 70, 148 | CUT, FLY, SURF, STRENGTH, FLASH |

Names above are decoded with the committed move-name reader (the
same verification used in `tmnames` spot checks: 5 MEGA PUNCH, 13
RAZOR WIND, 15 CUT, 19 FLY, 57 SURF, 70 STRENGTH, 148 FLASH, 164
SUBSTITUTE) — they are labels for the verified ids, not a separate
ROM discovery.

How the mapping was verified (observed fact): the 55-byte run was
not assumed from the disassembly list — the candidate order from
pokered's `item_constants.asm` `add_tm`/`add_hm` sequence was
searched as bytes and found exactly once at `0x13773` in each ROM
(an initial search with one wrong id, 62 instead of 61 at TM11,
found nothing; correcting it to the ROM bytes matched). The
bit-rule direction (§2) was then confirmed independently: decoding
Bulbasaur's, Pikachu's, and Rhydon's ROM bitfields LSB-first
through this table reproduces exactly the move sets in pokered's
per-species `base_stats/*.asm` `tmhm` lists (Bulbasaur §4, Pikachu,
Rhydon — all OK), while MSB-first does not.

## 2. Bitfield layout and bit order (observed fact + interpretation)

Each species' compatibility bitfield is the raw 7-byte `tmhm` field
of its base-stats entry (entry offsets `0x14–0x1A`; `base-stats.md`
§2), read through `readGen1BaseStats` — never re-parsed ad hoc.

- **Observed fact:** Mew's bitfield is all `0xFF` (7 bytes) in both
  ROMs (`base-stats.md` §5); 6 dex entries are all `0x00` (dex 10,
  11, 13, 14, 129, 132 — §5).
- **Observed fact:** bit 7 of byte 6 is set **only** by Mew's
  all-`0xFF` bitfield: across dex 1–151 in both ROMs, byte-6 values
  are `0x00–0x7F` everywhere except Mew (`0xFF`). No species sets
  the spare bit without also setting every real slot.
- **Interpretation (bit order):** slot `s` (0-based: TM01 = slot 0
  … TM50 = slot 49, HM01 = slot 50 … HM05 = slot 54) is byte
  `s >> 3`, bit `s & 7` — LSB-first within each byte. This is the
  disassembly's `tmhm` macro rule (`byte = (TMNUM − 1) / 8`,
  `bit = (TMNUM − 1) % 8`, `bitmask = 1 << bit`), confirmed against
  the ROM bytes per §1 (Bulbasaur/Pikachu/Rhydon cross-checks).
- **Observed fact:** 7 bytes = 56 bits cover 50 TMs + 5 HMs + 1
  spare, matching the disassembly comment (“50 TMs + 5 HMs = 55
  learnable TM/HM flags … fit in 7 bytes, with one unused bit left
  over”).

**Implementation decision:** `decodeGen1TmHm` emits move ids in slot
order (TM01–TM50, then HM01–HM05) — a stable documented order, not
numeric move-id sorting. The spare bit (byte 6, bit 7) is ignored:
Mew's own ROM bytes set it, so rejecting a set spare bit would
reject the ROM's own data. Bitfield lengths other than 7 bytes and
machine tables other than 55 entries are rejected; machine-table
move ids outside 1–165 are rejected with the slot label and, for
the ROM read, the file offset.

## 3. Reader API (implementation decision)

- `readGen1TmHmTable(reader)` — the 55 move ids at `0x13773` in
  slot order, each validated 1–165.
- `decodeGen1TmHm(bitfield, machineTable)` — pure mapping from a
  7-byte bitfield through a 55-entry table to slot-ordered move
  ids; `[]` for an all-zero bitfield; spare bit ignored.
- `readGen1TmHmLearnset(reader, dexNumber)` — dex 1–151 policy (same
  as the other species APIs): bitfield via `readGen1BaseStats`,
  table via `readGen1TmHmTable`, mapped via `decodeGen1TmHm`.
- Errors use `Gen1TmHmError` (same shape as `Gen1LearnsetError` /
  `Gen1MoveError`) and carry the structure, the dex/slot, and the
  ROM offset where applicable. No new runtime dependencies; no
  move-effect semantics; no “TM34” display strings (consumers join
  move ids against the top-level `moves` array).

## 4. Census and spot entries (observed fact)

Computed over all 151 dex entries in both ROMs with the committed
reader (slot order, table of §1):

- **Observed fact:** 3037 total TM/HM pairs; per-species counts
  0–55 (max 55 = Mew, dex 151; min non-zero 12 = dex 109).
- **Observed fact:** 6 dex entries are empty (all-zero bitfield):
  dex 10, 11, 13, 14, 129, 132. Ditto (dex 132) is one of them.
- **Observed fact:** every emitted move id is in 1–165; Red and
  Blue bitfields, tables, and decoded lists are identical for every
  dex number.

Spot entries (Red; Blue byte-identical), given as slot-ordered move
ids (names from the move-name list in `moves.md` §4, for readability
only):

- dex 151 MEW (bitfield all-`0xFF`): the full 55-entry table —
  `5, 13, 14, 18, 25, 92, 32, 34, 36, 38, 61, 55, 58, 59, 63, 6, 66,
  68, 69, 99, 72, 76, 82, 85, 87, 89, 90, 91, 94, 100, 102, 104,
  115, 117, 118, 120, 121, 126, 129, 130, 135, 138, 143, 156, 86,
  149, 153, 157, 161, 164, 15, 19, 57, 70, 148`.
- dex 1 BULBASAUR (`A4 03 38 C0 03 08 06`): `14, 92, 34, 36, 38,
  99, 72, 76, 102, 104, 115, 117, 156, 164, 15` — matches pokered's
  `bulbasaur.asm` list (SWORDS DANCE … CUT).
- dex 25 PIKACHU (`B1 83 8D C1 C3 18 42`): `5, 25, 92, 34, 36, 38,
  6, 66, 69, 99, 85, 87, 102, 104, 115, 117, 129, 130, 156, 86,
  164, 148` — matches pokered's `pikachu.asm` list.
- dex 112 RHYDON (`F1 FF 8F CF A2 88 32`): `5, 25, 92, 32, 34, 36,
  38, 61, 55, 58, 59, 63, 6, 66, 68, 69, 99, 85, 87, 89, 90, 91,
  102, 104, 117, 126, 130, 156, 157, 164, 57, 70` — matches pokered's
  `rhydon.asm` list.
- dex 150 MEWTWO (`B1 FF AF F1 AF 38 63`): `5, 25, 92, 34, 36, 38,
  61, 55, 58, 59, 63, 6, 66, 68, 69, 99, 76, 85, 87, 94, 100, 102,
  104, 115, 117, 118, 120, 126, 130, 156, 86, 149, 161, 164, 70,
  148`.
- dex 132 DITTO (all-`0x00`): `[]`.

Note: the 6 empty-TM/HM species (10, 11, 13, 14, 129, 132) are not
the 12 empty-level-up species (`learnsets.md` §5) — the two
emptiness sets overlap only at dex 10, 11, 13, 14, 132. TM/HM and
level-up emptiness are independent ROM facts.

## 5. Red vs. Blue (observed fact)

The 55-byte machine table, all 151 bitfields, and every decoded
TM/HM list are byte-identical in Red and Blue. Like the move,
base-stats, order, and level-up tables, this structure does not
distinguish the games.

## 6. Reference comparison

- **pokered (disassembly):** used strictly as a search guide and
  cross-check **after** ROM observation, per AGENTS.md. Guides: the
  `add_tm`/`add_hm` order in `constants/item_constants.asm` (TM
  move sequence + HM CUT/FLY/SURF/STRENGTH/FLASH), the
  `TechnicalMachines` table shape in `data/moves/tmhm_moves.asm`
  (TMs then HMs, 1 byte each), the `tmhm` bit-packing macro in
  `macros/data.asm` (LSB-first, 7 bytes, one spare bit), and the
  per-species lists in `data/pokemon/base_stats/*.asm`. Every
  offset, byte, count, and bit assignment above was established
  from the ROM dumps first; the disassembly agreed in each
  cross-check (Bulbasaur/Pikachu/Rhydon; Mew's full list). No code
  or data was copied.
- **seanmorris/pokemon-parser:** knowledge reference only, per
  AGENTS.md. No TM/HM-specific behavior was adopted from it.

## 7. What was deliberately NOT established

- **Unknown:** evolution exposure. Evolution records stay skipped,
  not decoded (`learnsets.md` §8) — no evolution API was added.
- **Unknown:** move-effect semantics. Move ids stay raw 1–165; the
  move table itself is in `moves.md`.
- **Unknown:** level-up changes. Phase 2a behavior is byte-for-byte
  unchanged; only the new `tmhm` field was added alongside it.
- **Unknown:** display names (“TM34”, item prices). The parser
  emits move ids only; consumers join names via `moves`.
- **Unknown:** Yellow or any other-revision layout. Established for
  the two investigated ROMs only.
- **Unknown:** whether a stored pointer/bank pair locating
  `0x13773` exists elsewhere in the image. `0x13773` is an
  empirically observed location; a pointer discovery would change
  the provenance note, not the layout.
- **Assumption:** the two investigated images (USA/Europe SGB
  Enhanced releases) represent the canonical Red/Blue layout, as in
  `rom-foundation.md` §10.
