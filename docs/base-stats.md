# Gen I base-stats table (dex number → fixed 28-byte entry)

Evidence for `src/gen1/Gen1Stats.ts` (`readGen1BaseStats`). All byte
values below were read from the same two real local images as in
`rom-foundation.md` (Red and Blue, 1 MiB “(USA, Europe) (SGB Enhanced)”
releases). No ROM files are committed; paths stay local.

Conventions follow `rom-foundation.md`:

- **Observed fact** — bytes read directly from the ROMs.
- **Interpretation** — what those bytes mean.
- **Implementation decision** — how the parser represents the information.
- **Assumption** — believed but not fully established.
- **Unknown** — intentionally left unresolved.

## 1. Main table location and stride (observed fact)

The main table starts at ROM file offset `0x383DE`:

- **Observed fact:** the first bytes of the 28-byte slots at
  `0x383DE + k × 28` are exactly `k + 1` for `k = 0 … 149` — i.e. the
  sequence `0x01, 0x02, …, 0x96` (1–150) — in **both** Red and Blue.
- **Observed fact:** the 28 bytes immediately before `0x383DE`
  (`… 50 00 FF 0A A2 28 01 00 E5 0A A3 00 46 00 FF 14 A4 4F 00 00 FF 0A A5 30 32 00 FF 0A`)
  show no 28-byte entry rhythm (no sequential id at a 28-byte stride);
  the 28 bytes immediately after the 150-entry run (file `0x39446`:
  `11 00 80 03 00 80 00 00 80 …`) break the sequence: the first byte
  there is `0x11`, not `0x97` (151). The table therefore starts exactly
  at `0x383DE` and ends exactly at `0x383DE + 150 × 28 = 0x39446`.
- **Observed fact:** the 4200 bytes (`150 × 28`) are byte-identical in
  Red and Blue.

File `0x383DE` sits in ROM bank 14 (`0x383DE >> 14 = 14`), CPU
`0x43DE` in the switchable window — but no stored bank byte or pointer
locating this table was found; `0x383DE` is an **empirically observed
location**, arrived at via the reference implementation's formula (see
§7) and confirmed byte-by-byte against the ROMs. Like the order table
at `0x41024` (see `text-and-names.md` §4 and the note in §6 below), it
is a fixed file offset without stored-pointer provenance.

## 2. Entry layout (observed fact + interpretation)

Each entry is 28 bytes. Offsets below are within one entry:

| Offset | Contents (raw) | Evidence status |
| --- | --- | --- |
| 0x00 | entry id | **Observed fact:** equals the 1-based slot number (1–150); see §1. |
| 0x01–0x05 | five stat bytes | **Interpretation** (field order only): HP, Attack, Defense, Speed, Special — byte positions match the reference's `buffer[1..5]` mapping and the public species structure; spot values match known species (§4). |
| 0x06–0x07 | two type bytes | **Interpretation** (positions only): type 1 / type 2 (raw ids; id→name map in `types.md` §2). |
| 0x08 | catch rate | **Interpretation** (position only). |
| 0x09 | base experience yield | **Interpretation** (position only). |
| 0x0A | front-sprite dimensions byte | **Interpretation** (position only). |
| 0x0B–0x0C | front-sprite pointer (LE 16-bit CPU address) | **Observed fact:** every one of the 150 values lies in `0x4000–0x7FFF` (banked window). **Interpretation:** sprite-pointer position, per the reference. |
| 0x0D–0x0E | back-sprite pointer (LE 16-bit CPU address) | Same status as front-sprite pointer. |
| 0x0F–0x12 | four level-1 move bytes (`0` = no move) | **Interpretation** (positions only; raw move ids, see `moves.md`). |
| 0x13 | growth-rate byte | **Interpretation** (position only). |
| 0x14–0x1A | seven TM/HM bitfield bytes | **Interpretation** (positions only): 7 bytes = 56 bits cover 50 TMs + 5 HMs + 1 spare, but no bit was decoded here. |
| 0x1B | padding byte | **Observed fact:** `0x00` in all 150 main-table entries in both ROMs (§3). |

The parser exposes every field as a **raw number** (sprite pointers as
raw CPU addresses, moves/growth as raw ids, TM/HM as a raw 7-byte
`Buffer`, padding as a raw byte). At this layer no semantic enums are
assigned: type bytes, move ids, growth-rate ids, and TM-bit assignments
stay raw numbers here. That is a layer boundary, not project-wide
ignorance: the full type-id→name map — including the NORMAL aliases
(`0x09–0x13`), the named-but-unused BIRD (`0x06`), and the union of ids
actually used by stats/moves/effectiveness — is documented in `types.md`
§2–§3 (see also `types.md` §8 for what remains uninterpreted there).
Level-1 move ids likewise stay raw here; the move table itself is
documented in `moves.md`.

Spot entries (Red; Blue byte-identical), given as full 28-byte rows:

- dex 1 (Bulbasaur): `01 2D 31 31 2D 41 16 03 2D 40 55 00 40 E5 40 21 2D 00 00 03 A4 03 38 C0 03 08 06 00`
- dex 25 (Pikachu): `19 23 37 1E 5A 32 17 17 BE 52 55 7D 4D 8B 4E 54 2D 00 00 00 B1 83 8D C1 C3 18 42 00`
- dex 112 (Rhydon): `70 69 82 78 28 2D 04 05 3C CC 77 00 40 02 42 1E 17 27 1F 05 F1 FF 8F CF A2 88 32 00`
- dex 150 (Mewtwo): `96 6A 6E 5A 82 9A 18 18 03 DC 77 7F 58 85 5A 5D 32 81 5E 05 B1 FF AF F1 AF 38 63 00`

## 3. Padding byte 0x1B (observed fact + implementation decision)

- **Observed fact:** byte 0x1B is `0x00` in all 150 main-table entries
  in Red and in all 150 in Blue (histogram `{0x00: 150}` in each ROM).
- **Observed fact:** byte 0x1B of Mew's standalone entry (§5) is `0xFF`
  in both ROMs.

The external species-structure reference documents offset 0x1B as a
padding byte; the ROM census is consistent with that (a constant filler
whose value differs between the two table sites). No other meaning is
assigned, and no constraint is enforced: the parser returns it as the
`padding` field of `Gen1BaseStats` so the byte is **never silently
discarded**. Callers can assert on it if their use case requires it.

## 4. Dex order, not internal-index order (observed fact)

- **Observed fact:** slot `k` holds id `k + 1` for `k = 0 … 149`, and
  the decoded contents match the species with that **Pokédex number**,
  not the species with internal index `k`:
  - slot 0 holds id `0x01` with stats `45/49/49/45/65` and types
    `0x16/0x03` (Bulbasaur, dex 1) — while internal index 0 is Rhydon
    (dex 112, name-table entry 0).
  - slot 111 holds id `0x70` (112) with stats `105/130/120/40/45`
    (Rhydon) — while internal index 111 holds a different species.
  - slot 149 holds id `0x96` (150, Mewtwo) with stats
    `106/110/90/130/154`.
- **Observed fact:** the order-table cross-check closes the loop:
  internal index 0 → order value 112 → slot 111 holds id 112 with
  Rhydon's stats; internal index 152 → order value 1 → slot 0 holds id
  1 with Bulbasaur's stats (see `text-and-names.md` §4 for the order
  table).

**Interpretation:** the table is indexed by Pokédex number
(`offset = 0x383DE + (dex − 1) × 28` for dex 1–150). The name/order
tables are indexed by internal index; the base-stats table is indexed
by dex number. Client code joins them through the order table
(`internal index → dex → stats entry`); the parser provides no combined
model.

## 5. Mew's standalone entry (observed fact)

Mew (dex 151) is **not** in the main table: slot 150 (file `0x39446`)
holds `0x11` as its first byte, not `0x97`.

- **Observed fact:** exactly one full-ROM occurrence of Mew's stat
  signature `97 64 64 64 64 64` (dex 151 + five base stats of 100) was
  found in each ROM, at file `0x425B` in both. The 28 bytes there are:
  `97 64 64 64 64 64 18 18 2D 40 55 12 41 05 42 01 00 00 00 03 FF FF FF FF FF FF FF FF`
  — a well-formed 28-byte entry with id `0x97` (151), five stats of
  100, sprite pointers `0x4112`/`0x4205` (both in `0x4000–0x7FFF`),
  level-1 moves `01 00 00 00`, growth byte `0x03`, seven TM/HM bytes of
  `0xFF`, and trailing byte `0xFF`.
- **Observed fact:** the 28-byte Mew entry is byte-identical in Red and
  Blue, as are the 16 bytes before (`60 A7 52 … F8 40`) and the 16
  bytes after (`21 E9 CC 7E … 2B 7E A7`) it.

**Interpretation:** file `0x425B` (ROM bank 1, CPU `0x425B` in the
switchable window) is Mew's standalone base-stats entry — the same
28-byte layout as a main-table entry, stored separately. Like the main
table, this is an empirically observed location without a stored
pointer/bank provenance.

**Implementation decision:** `readGen1BaseStats(reader, 151)` reads
file `0x425B`; dex 1–150 read the main table. The stored-id check
(`entry[0] === dexNumber`) applies to Mew exactly as to main-table
entries.

## 6. Red vs. Blue (observed fact)

- The 150-entry main table, Mew's 28-byte entry, and the sampled
  surrounding bytes are all byte-identical in Red and Blue.
- Like the name and order tables, the base-stats table does not
  distinguish the games.

Note on provenance (implementation decision): `0x383DE` and `0x425B`
are fixed file offsets confirmed by census, not resolved through a
stored bank/pointer pair. This matches how the order table at
`0x41024` is handled (fixed file offset, documented in
`text-and-names.md` §4): the location is empirically observed in both
ROMs rather than derived from ROM-stored addressing. If a future ROM
revision moves these tables, the constants must be re-established —
they are not decoded from the image. Evidence-level note (for
comparison with `moves.md` §1 and `types.md` §1/§4): no stored
bank/pointer pair was found for `0x383DE`/`0x425B`, and no same-bank
`LD HL,nn` code-reference hunt for these locations is recorded — the
evidence here is the byte census alone plus reference-formula agreement
(§7), not a stored-pointer or code-reference provenance.

## 7. Reference comparison

- **seanmorris/pokemon-parser** (`PokemonRom.getPokemonStats`): reads
  `0x383DE + 28 × (number − 1)` where `number` is the order-table value
  (dex number) for the given internal index, and maps `buffer[0]`
  (number), `buffer[1..5]`, `buffer[6..7]`, `buffer[8]`, `buffer[9]`,
  `buffer[11..13]`/`buffer[13..15]` (via a sprite bank keyed by
  internal index), `buffer[15..18]` — all consistent with the layout in
  §2. Its README TODO (“Account for edge case involving locations for
  Mew's stats & sprite locations”) confirms the reference itself does
  not handle Mew: for Mew's internal index (20) it computes dex 151 and
  reads `0x383DE + 28 × 150 = 0x39446`, which per §1/§5 holds `0x11…`,
  not Mew's entry — the reference returns garbage there (directly
  observable: its Mew record reports `number: 17`, `hp: 0`,
  `attack: 128`, …). The parser's separate `0x425B` path exists
  precisely to refuse that outcome; the stored-id check would reject
  such a misread.
- **pokered (disassembly):** used only as a secondary cross-check for
  field-position labels; the offsets, counts, and byte values above
  were established from the ROMs first.
- No reference code was copied; only the formula was checked against
  the bytes.

## 8. What was deliberately NOT established

- **At this layer only (not project-wide):** the base-stats parser assigns
  no meaning to the type bytes (observed domains: type1 ∈
  `{0x00, 0x01, 0x03, 0x04, 0x05, 0x07, 0x08, 0x14–0x1A}`, type2 ∈ same
  plus `0x02`), the move ids, the growth-rate ids (observed domain
  `{0x00, 0x03, 0x04, 0x05}`), or the TM/HM bit assignments. Raw numbers
  only. The type-id meanings that *are* established project-wide — the
  id→name map, the `0x09–0x13` NORMAL aliases, the unused `0x06` BIRD,
  and the used-id union across stats/moves/effectiveness — live in
  `types.md` §2–§3.
- **Unknown:** the sprite-pointer bank rule. The reference keys it by
  internal index (`0x14 → bank 1`, `0xB5 → bank 0xB`, `<0x1F → 9`,
  `<0x49 → 0xA`, `<0x73 → 0xB`, `<0x98 → 0xC`, else `0xD`), but sprite
  formats and banks were not investigated — the exploratory sprite work
  stayed out of the implementation. Sprite pointers are exposed raw.
- **Unknown:** whether the order-table provenance (fixed offset
  `0x41024`, no stored pointer) and the stats-table provenance (fixed
  offsets `0x383DE`/`0x425B`) hold for any other revision. Established
  for the two investigated ROMs only.
- **Assumption:** the two investigated images (USA/Europe SGB Enhanced
  releases) represent the canonical Red/Blue layout, as in
  `rom-foundation.md` §10.
