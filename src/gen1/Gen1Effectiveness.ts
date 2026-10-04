// Layout of the type-effectiveness table (attacker, defender, raw multiplier).
//
// The table holds 3-byte entries starting at file 0x3E474, terminated
// by a single 0xFF sentinel byte (see docs/types.md for the evidence).
// Each entry is (attacking type id, defending type id, raw multiplier
// byte). No enums exist at this layer: the multiplier is exposed raw,
// and the 82-entry / three-value observations are documented limits,
// not conversions.
//
// Kept independent from the other Gen I parsers the way Gen1Moves.ts
// stands apart from Gen1MoveNames.ts: no implementation is shared with
// any other parser.

import type { RomReader } from "../rom/RomReader.ts";

/** ROM file offset of the first effectiveness entry. */
export const GEN1_EFFECTIVENESS_TABLE_OFFSET = 0x3e474;

/** Size of one effectiveness entry in bytes. */
export const GEN1_EFFECTIVENESS_ENTRY_LENGTH = 3;

/** Sentinel byte terminating the table (observed fact). */
export const GEN1_EFFECTIVENESS_SENTINEL = 0xff;

/**
 * Maximum entries the sequential reader will scan before giving up.
 * Observed fact: the dumped ROMs hold exactly 82 entries; the bound
 * only limits a sentinel-less scan, it is not a table count.
 */
export const GEN1_EFFECTIVENESS_MAX_ENTRIES = 512;

export class Gen1EffectivenessError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1EffectivenessError";
	}
}

export interface Gen1EffectivenessEntry {
	/** Raw attacking type id. No type enum exists at this layer. */
	readonly attacker: number;
	/** Raw defending type id. No type enum exists at this layer. */
	readonly defender: number;
	/** Raw multiplier byte. Exposed unconverted. */
	readonly multiplier: number;
}

/**
 * Reads every effectiveness entry by scanning 3-byte entries from the
 * table start until the 0xFF sentinel. The byte after the last entry
 * must be the sentinel; a truncated table or a missing sentinel
 * throws instead of scanning on. Returns entries in ROM order.
 */
export function readGen1EffectivenessTable(
	reader: RomReader,
): Array<Gen1EffectivenessEntry> {
	const entries: Array<Gen1EffectivenessEntry> = [];
	for (let index = 0; index < GEN1_EFFECTIVENESS_MAX_ENTRIES; index++) {
		const offset =
			GEN1_EFFECTIVENESS_TABLE_OFFSET + index * GEN1_EFFECTIVENESS_ENTRY_LENGTH;
		const attacker = reader.byteAt(offset);
		if (attacker === GEN1_EFFECTIVENESS_SENTINEL) {
			return entries;
		}
		const defender = reader.byteAt(offset + 1);
		const multiplier = reader.byteAt(offset + 2);
		entries.push({ attacker, defender, multiplier });
	}
	throw new Gen1EffectivenessError(
		`Missing 0xFF sentinel after ${GEN1_EFFECTIVENESS_MAX_ENTRIES} entries ` +
			`from offset 0x${GEN1_EFFECTIVENESS_TABLE_OFFSET.toString(16)}`,
	);
}
