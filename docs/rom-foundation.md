# ROM foundation: reading and identifying Red/Blue images

Evidence for the low-level layer implemented in `src/rom/`
(`RomReader`, `identifyGen1Rom`). All byte values below were read from two
real local images: Pokémon Red and Pokémon Blue, both 1 MiB “(USA, Europe)
(SGB Enhanced)” releases. No ROM files are committed; paths stay local.

Conventions used in this document:

- **Observed fact** — bytes read directly from the ROMs.
- **Interpretation** — what those bytes mean (Pan Docs “The Cartridge
  Header”, “Memory Map”, “MBC3” checked against the bytes).
- **Implementation decision** — how the parser represents the information.
- **Assumption** — believed but not fully established.
- **Unknown** — intentionally left unresolved.

## 1. File size (observed fact)

- Red: **1,048,576 bytes** (1024 KiB).
- Blue: **1,048,576 bytes** (1024 KiB).

The header ROM-size byte is `0x05` in both, which Pan Docs defines as
`32 KiB × (1 << 5)` = 1 MiB. The actual file length matches the declared
size exactly, in both ROMs.

## 2. Cartridge header (observed fact + interpretation)

Absolute offsets below are ROM file offsets. Field meanings follow Pan Docs
“The Cartridge Header”.

| Offset | Length | Observed (Red) | Observed (Blue) | Interpretation |
| --- | --- | --- | --- | --- |
| 0x0100–0x0103 | 4 | `00 C3 50 01` | identical | Entry point: `NOP`, then `JP 0x0150`. Execution resumes right after the header. |
| 0x0104–0x0133 | 48 | `CE ED 66 66 … B9 33 3E` | byte-identical | Nintendo logo bitmap. Must match for the boot ROM to run the game. |
| 0x0134–0x0143 | 16 | `50 4F 4B 45 4D 4F 4E 20 52 45 44 00 00 00 00 00` (“POKEMON RED” + NULs) | `50 … 20 42 4C 55 45 00 00 00 00` (“POKEMON BLUE” + NULs) | Upper-case ASCII title, NUL-padded to 16 bytes. These are pre-CGB cartridges, so no byte is repurposed as a CGB flag or manufacturer code; the full range is title. |
| 0x0144–0x0145 | 2 | `30 31` (“01”) | identical | New licensee code “01” (Nintendo). Meaningful because 0x014B is `0x33`. |
| 0x0146 | 1 | `0x03` | identical | SGB flag: SGB functions supported. Matches the “(SGB Enhanced)” release. |
| 0x0147 | 1 | `0x13` | identical | Cartridge type: MBC3 + RAM + battery. |
| 0x0148 | 1 | `0x05` | identical | ROM size code: 1 MiB, 64 banks of 16 KiB. |
| 0x0149 | 1 | `0x03` | identical | RAM size code: 32 KiB of cartridge RAM (4 banks of 8 KiB). |
| 0x014A | 1 | `0x01` | identical | Destination code: overseas only. |
| 0x014B | 1 | `0x33` | identical | Old licensee code “use new licensee code”. |
| 0x014C | 1 | `0x00` | identical | Mask ROM version 0. |
| 0x014D | 1 | `0x20` | `0xD3` | Header checksum (see §3). Differs only because the title differs. |
| 0x014E–0x014F | 2 | `0x91E6` (big-endian) | `0x9D0A` (big-endian) | Global checksum (see §3). |

## 3. Checksums (observed fact + interpretation)

**Header checksum** (`0x014D`): `x = 0; for 0x0134–0x014C: x = x − byte − 1`
(mod 0x100). Recomputed independently for both ROMs; stored == computed in
both cases (Red `0x20`, Blue `0xD3`). The boot ROM verifies this value, so a
mismatch means the header was corrupted or the image is not a bootable
Game Boy ROM.

**Global checksum** (`0x014E–0x014F`, big-endian): 16-bit sum of all ROM
bytes except the two checksum bytes themselves. Recomputed over the full
1 MiB of both ROMs; stored == computed in both cases (Red `0x91E6`, Blue
`0x9D0A`). Pan Docs notes the boot ROM does *not* verify this checksum —
only Pokémon Stadium’s GB Tower emulator is known to check it — so a
mismatch says nothing about which game an image is. The parser treats both
checksums as **integrity evidence, not identity**: `verifyChecksums`
reports `{stored, computed, valid}` per checksum without identifying
anything, while `identifyGen1Rom` additionally requires both to verify
before accepting an image as the known supported dump.

## 4. Red vs. Blue layout (observed fact)

- Same file size, same entry point, same logo, same fixed fields
  (licensee, SGB, cartridge type, ROM/RAM size, destination, version).
- Full-image diff: **26,670 of 1,048,576 bytes differ (2.54%)**, spread
  across banks 0, 1, 3, 5, 6, 13, 16, 17, 20, 26, 28, 29, 30, 31.
  Concentrations: bank 26 (~13k), bank 29 (~9k), bank 28 (~2k),
  bank 16 (~1k). So the two games share the same fundamental layout but
  differ in several content banks plus scattered bytes — not just the
  header.
- Within the header (`0x0134–0x014F`) exactly 7 bytes differ: the 4 title
  bytes that spell `RED` vs. `BLUE` (`0x013C–0x013F`), the header checksum
  (`0x014D`), and the two global checksum bytes (`0x014E–0x014F`).
- The rest of bank 0 after the header (`0x0150–0x3FFF`) differs in only 29
  bytes; code at `0x0150` starts identically (`FE 11 28 03 …`).

**Interpretation:** Red and Blue are the same ROM layout with different
content. Nothing in the fixed header fields distinguishes the games
besides the title string (and the checksums derived from it).

## 5. Identification model (implementation decision)

Three levels are separated because the evidence supports them separately:

- **Structurally valid Game Boy ROM** (observed fact + boot-ROM rule):
  entry bytes `00 C3 50 01` and the canonical 48-byte Nintendo logo are
  present. Without them the image cannot boot; with them nothing is yet
  known about which game it is.
- **Identified Red/Blue ROM** (implementation decision): a bootable image
  whose 16-byte title is exactly `POKEMON RED` → `"red"` or
  `POKEMON BLUE` → `"blue"` (`identifyVariant`, full NUL-padded
  comparison, no prefix or case-insensitive matching). Only the title
  distinguishes the games — the fixed header fields below are identical
  in both ROMs — so only the title is identity. A Red-titled image with
  a different mask-ROM version or broken checksums is still Red; those
  are revision/integrity facts, covered by a dedicated test.
- **Known supported dump** (implementation decision): the exact
  USA/Europe SGB-Enhanced revision investigated so far. `identifyGen1Rom`
  additionally requires the fixed field values in §2 (`01`, `0x03`,
  `0x13`, `0x05`, `0x03`, `0x01`, `0x33`, `0x00`), total length exactly
  1,048,576 bytes (agreeing with ROM-size code `0x05`), and both
  checksums verifying. Unstudied revisions, hacks, or corrupted images
  are rejected here — not because they are not Red/Blue, but because
  Gen I structure parsing has only been validated against this dump.

Anything else throws `RomIdentityError` with the offending offset and the
expected vs. actual value. Truncated input (< `0x150` bytes) is rejected
before any field access that could read out of bounds.

**What reliably distinguishes Red from Blue:** only the title string
(`POKEMON RED` vs. `POKEMON BLUE`). The two checksum fields also differ,
but they are consequences of the title, not independent signals.

## 6. Bank/addressing model (interpretation + implementation decision)

Per Pan Docs “Memory Map” / “MBC3”:

- CPU `0x0000–0x3FFF`: fixed bank 0 (first 16 KiB of the file).
- CPU `0x4000–0x7FFF`: switchable 16 KiB bank selected through the MBC3
  ROM-bank register (`0x2000–0x3FFF`).
- 64 banks × 16 KiB = 1 MiB, matching the observed size.
- Cartridge RAM: 32 KiB at CPU `0xA000–0xBFFF` (8 KiB × 4 banks), plus an
  RTC per the MBC3 spec. No save-format parsing is implemented at this
  layer.

`RomReader.resolveBankAddress(bank, address)` implements the plain
arithmetic mapping `bank × 0x4000 + (address & 0x3FFF)` for the
switchable window and the identity mapping for bank 0. It accepts any
non-negative bank and any CPU address in `0x0000–0x7FFF`, and rejects a
result past the end of the loaded image — it is a general address
translator, not a Gen I concept.

**MBC3 bank-0 quirk (interpretation):** an MBC3 ROM-bank-register *write*
of `0x00` selects bank `0x01` in the switchable window (Pan Docs “MBC3”).
That is runtime register behavior, not a property of stored data: a bank
number *stored in the ROM* means what it says. `resolveBankAddress` and
`resolveBankedPointer` therefore resolve a stored bank 0 arithmetically
(to file offsets `0x0000–0x3FFF`) and never rewrite it; code modelling
live register writes must handle the quirk itself.

## 7. Pointer and addressing conventions (observed fact + interpretation)

Status: established from ROM evidence below. No Pokémon-domain parsing
follows from it yet; this section only fixes the vocabulary and the
resolution rule future parsers must use.

### 7.1 Terminology (implementation decision)

- **ROM file offset**: byte index into the ROM file (0 to length − 1).
  The only thing `RomReader` reads from.
- **Game Boy CPU address**: a 16-bit address as seen by the CPU.
  `0x0000–0x3FFF` is the fixed bank-0 window; `0x4000–0x7FFF` is the
  switchable bank window; `0x8000–0xFFFF` is never ROM.
- **ROM bank**: a 16 KiB chunk of the file, numbered 0–63 (`file offset
  >> 14`).
- **Banked CPU address**: a CPU address in `0x4000–0x7FFF` together with
  the bank number mapped into the switchable window at the time.
- **Banked file offset**: the file offset a banked CPU address resolves
  to: `bank × 0x4000 + (address − 0x4000)`.
- **Pointer value**: the raw 16-bit integer stored in the ROM
  (little-endian in every case examined).
- **Banked pointer**: a pointer value that is only meaningful with a
  bank number stored separately alongside it (a leading bank byte in the
  same structure, or an entry in a parallel bank table). All stored
  Gen I data pointers examined are of this form; none is self-describing.

### 7.2 What the ROMs show (observed fact)

The bank byte is always stored separately from the 16-bit address:

- **Map headers**: 2-byte LE addresses in a table at file `0x01AE`
  (bank 0, read as raw file offsets) with a parallel bank table at file
  `0xC23D` (each byte is the bank for the corresponding entry). Both
  tables hold 248 entries. Example (Red, map 0):
  - pointer table bytes at file `0x01AE`: `A1 42` → pointer value
    `0x42A1`;
  - bank table byte at file `0xC23D`: `0x06`;
  - banked CPU address: bank 6 + `0x42A1`;
  - banked file offset: `6 × 0x4000 + 0x02A1` = file `0x182A1`;
  - bytes at `0x182A1`: `00 09 0A …` — a sane map header (tileset 0,
    9 rows × 10 columns).
- **Tileset headers**: 12-byte entries at file `0xC7BE` (bank 0),
  layout `db BANK; dw Block, GFX, Coll; …` per the pokered disassembly
  macro `tileset` (`data/tilesets/tileset_headers.asm`). The bank byte
  applies to the Block and GFX pointers (CPU `0x4000–0x7FFF`).
  Example (Red, tileset 0 at file `0xC7BE`):
  - raw bytes: `19 E0 45 00 40 35 17 FF FF FF 52 02`;
  - bank `0x19`, Block pointer value `0x45E0` → file `0x645E0`, whose
    16 bytes (`0A 0A 28 29 4B …`) are plausible 4×4 block tile ids;
  - GFX pointer value `0x4000` → file `0x64000`, inside the tile-graphic
    region noted by the reference (`0x64000–0x67FFF`).
- **Collision lists are NOT banked pointers** (interpretation, confirmed
  against pokered `data/tilesets/collision_tile_ids.asm`): the third
  word (`dw …_Coll`) holds a CPU address in `0x0000–0x3FFF` — the fixed
  bank-0 window — so `& 0x3FFF` is the identity and the bank byte must
  NOT be applied. Example (Red, tileset 0):
  - raw Coll word: `35 17` → pointer value `0x1735`;
  - naive banked resolution would give file `0x65735`, whose bytes
    (`03 FD 03 FD …`) are tile-collision *flags*, not a tile-id list;
  - file `0x1735` itself holds `00 10 1B 20 21 23 … FF` — byte-for-byte
    the `Overworld_Coll` list from the disassembly, terminated by `FF`.
  - This is why `resolveBankedPointer` rejects addresses below `0x4000`
    instead of masking them: applying a bank there silently resolves to
    the wrong data, as demonstrated.
- **Name table**: bank byte at file `0x2FA3` (`0x07`), LE address at
  file `0x2FAE` (`1E 42` → `0x421E`), entries 10 bytes apart terminated
  by `0x50`. Example: bank 7 + `0x421E` → file `0x1C21E`, holding
  `91 87 98 83 8E 8D 50 …` (“RHYDON” in the Gen I text encoding,
  `0x50` terminator). Text decoding itself is out of scope; only the
  addressing is established here.
- **Evolution/level-up and Pokédex entry tables (preliminary,
  reference-guided hypothesis — no parser implements them yet)**:
  LE address tables at file `0x3B05C` (evolution/level-up) and file
  `0x4047E` (Pokédex entries), 190 entries each, are observed, and
  every entry value falls in the banked window `0x4000–0x7FFF`
  (none below `0x4000`, none at/above `0x8000`). What is NOT
  observed is a stored bank byte for either table: the banks
  (`0x0E` from a reference call-site constant, `makeRef(0x0E, …)`;
  `0x10` from reference arithmetic, `pointer − 0x4000 + 0x40000`)
  come from the reference, not from ROM-stored bank+address pairs
  like the name table above (bank byte at `0x2FA3` + address at
  `0x2FAE`). So the table bytes and the pointer-window shape are
  observed; the bank assignments — and therefore the resolved file
  offsets — are leads for future parser work, not closed provenance
  on par with the name table (§1) or the types.md code references.
  Preserved leads (hypothetical until a stored bank or a same-bank
  code reference is found):
  - evolution/level-up entry 0 `D8 71` → `0x71D8` +
    reference-supplied bank `0x0E` → file `0x3B1D8`;
  - Pokédex entry 1 `09 46` → `0x4609` + reference-supplied bank
    `0x10` → file `0x40609`.
- Map offset/bank tables are shared between the games for most entries:
  the first four map headers, the name bank/pointer, and the whole
  evolution table are byte-identical in Red and Blue; 23 of 248 map
  addresses and scattered tileset bytes differ (all in bank-`0x1D` maps
  and tileset counter/animation bytes).

### 7.3 Resolution rule (implementation decision)

`resolveBankedPointer(reader, bank, address)`:

- accepts banks 0–63 and CPU addresses `0x4000–0x7FFF` only;
- resolves via `RomReader.resolveBankAddress` (same arithmetic);
- rejects anything else with `RangeError` (wrong window, wrong bank
  range) or `RomOutOfBoundsError` (past the loaded image).

No stored bank-0 banked pointer was observed: every stored bank byte
examined (map banks, tileset banks, name bank `0x07`) is non-zero.
The `0x0E`/`0x10` evolution/Pokédex banks are reference-supplied
constants, not stored bytes (see §7.2), so they say nothing about
stored bank 0 either way. Bank 0 therefore resolves
arithmetically without special-casing, and the MBC3 *register-write*
quirk stays out of stored-data resolution (see §6).

`RomReader.resolveBankAddress` stays as the general translator (any
non-negative bank, any `0x0000–0x7FFF` address); it is what
`resolveBankedPointer` delegates to. Special cases — collision-style
fixed-window addresses, constant-bank tables, parallel bank tables —
belong in the future structure parsers that know each layout, never
inside the generic resolver.

### 7.4 Reference comparison: `seanmorris/pokemon-parser`

- Its `makeRef(bank, buffer) = (bank << 14) + (byteVal(buffer) & 0x3FFF)`
  is arithmetically correct for every banked case examined (map,
  tileset Block/GFX, name, evolution, Pokédex tables — for the last
  two taking the reference-supplied constant banks as given, per the
  §7.2 preliminary note).
- It is **incomplete, not wrong**: nothing constrains the address
  window or the bank range, and `& 0x3FFF` silently maps a fixed-window
  address like the Coll word `0x1735` into a banked file offset
  (`0x65735`) that points at the wrong data. The parser’s
  `resolveBankedPointer` exists precisely to refuse that.
- The reference passes the tileset Coll word through `makeRef` with the
  tileset bank (`getAllTilesets`), which per the evidence above resolves
  to flag bytes rather than the collision-id list. Whether that matters
  downstream is the reference’s concern; this parser documents the
  distinction so future collision parsing reads file `0x1735`-style
  addresses directly.
- `formatRef` correctly records `{bank, pointer, offset}` together —
  the right shape (bank travelled with the address); the parser keeps
  that pairing at call sites via explicit `(bank, address)` arguments.

No reference code was copied; only the formula was checked against
the bytes.

## 8. Rejected input (implementation decision)

Explicitly rejected with `RomIdentityError` or `RomOutOfBoundsError`:

- shorter than `0x150` bytes (truncated, no header);
- wrong entry point or Nintendo logo (not a bootable Game Boy image);
- any fixed field in §2 differing (different mapper, sizes, region,
  publisher, or version — support not claimed without investigation);
- unknown title (e.g. Yellow or hacks — no guessing);
- length ≠ 1 MiB (does not match the declared ROM-size code);
- either checksum failing (corrupted or tampered image);
- any read past the end of the buffer, via `RomReader` bounds checks;
- invalid `resolveBankAddress` arguments (negative/non-integer bank,
  address outside `0x0000–0x7FFF`, or a bank that maps past the end of
  the loaded image);
- `resolveBankedPointer` misuse: CPU address outside `0x4000–0x7FFF`
  (fixed-window addresses such as collision pointers must not be
  bank-resolved), bank outside 0–63, or a result past the loaded image.

## 9. Comparison with `seanmorris/pokemon-parser` (reference, not authority)

Checked out at investigation time (v0.0.6) and compared against the bytes:

- **Header offsets agree.** Its index table (`entryPoint 0x100`,
  `nintendoLogo 0x104`, `title 0x134`, `superGameboy 0x146`,
  `cartrigeType 0x147`, `romSize 0x148`, `ramSize 0x149`,
  `headerCheck 0x14D`, `globalCheck 0x14E`) matches Pan Docs and the
  observed ROMs. One typo noted: `cartrigeType`.
- **Title handling differs and ours is stricter.** The reference reads 15
  bytes from `0x134` and strips zero bytes (`buffer.slice(title,
  title + 15)`). Both real ROMs use a 16-byte NUL-padded title field
  (`POKEMON RED` is 11 chars + 5 NULs; `POKEMON BLUE` is 12 + 4), so the
  parser compares the full 16 bytes. The 15-byte slice is harmless for
  display but loses the padding byte at `0x143`.
- **Newer-header assumptions do not apply.** Its table includes
  `manufacturer 0x13F`, `colorGameboy 0x143`, `destination 0x14A`,
  `gbcLicensee 0x14B`, `romVersion 0x14C`. On these pre-CGB ROMs,
  `0x013F–0x0143` are all title/padding bytes (`00`) and `0x014B` is the
  old licensee code `0x33`, not a GBC licensee — confirmed by the zero
  bytes observed. The parser therefore treats `0x0134–0x0143` as pure
  title and `0x014B` as the old licensee code.
- **Licensee lookup disagrees on encoding and is unused.** Its `licensee`
  getter slices the *manufacturer* area and builds a hex-string key
  (`bytes.map(b => b.toString(16))`), which would mis-decode ASCII “01”
  (`0x30 0x31` → key `"3031"`, absent from its table). The parser instead
  reads ASCII at `0x0144–0x0145` and requires `"01"`, matching the bytes.
- **Bank math agrees.** Its `makeRef(bank, buffer) = (bank << 14) +
  (byteVal(buffer) & 0x3FFF)` is the same mapping as
  `resolveBankAddress`, including little-endian 16-bit pointer decoding
  (`byteVal`). No discrepancy found here.
- **Robustness differs by design.** The reference performs no identification
  or checksum verification and reads slices without bounds checks; this
  parser adds both (see §5, §7) because silent misreads are worse than
  loud rejections at this layer.

No code was copied from the reference; only facts were cross-checked.

## 10. Assumptions and unknowns

- **Assumption:** the two investigated images (USA/Europe SGB Enhanced
  releases) represent the canonical Red/Blue layout. Covered by
  `identifyGen1Rom`'s fixed-field, length, and checksum gates; any other
  regional revision or re-release is rejected until investigated.
- **Assumption:** requiring the global checksum for the *supported dump*
  is safe. Justified: both real images satisfy it, and it guards against
  corruption the boot ROM itself would not catch. It is reported as
  integrity evidence (`verifyChecksums`), never as identity — a
  same-title image with a broken global checksum is still Red/Blue, just
  not a supported dump.
- **Unknown:** Yellow’s header and layout. Deliberately unimplemented;
  an unknown title is rejected rather than guessed.
- **Unknown:** whether any legitimate Red/Blue dump has trailing bytes or
  a different file length (e.g. overdump). Currently rejected; revisit if
  a real dump demonstrates otherwise.
- **Established elsewhere:** text encoding for the name-table bytes
  (`0x50` terminator/padding, A–Z plus the four specials in real names)
  is documented in `docs/text-and-names.md`; the rest of the Gen I
  charset remains unknown.
- **Unknown:** RTC/save-data layout — out of scope for the ROM reader.
