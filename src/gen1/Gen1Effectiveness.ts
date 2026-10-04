// Layout of the type-effectiveness table (attacker, defender, raw multiplier).
//
// The table holds 3-byte entries starting at file 0x3E474, terminated
// by a single 0xFF sentinel byte (see docs/types.md for the evidence).
// Each entry is (attacking type id, defending type id, raw multiplier
// byte). No enums exist at this layer: the multiplier is exposed raw.
// Observed limits (see docs/types.md §3): ids never exceed 0x1A, the
// multiplier only takes 0x00/0x05/0x14, and the dumped ROMs hold exactly
// 82 entries. The parser enforces all three and reports violations
// with the offending entry index and file offset.
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

/** Highest type id observed in the dumped ROMs (DRAGON). */
export const GEN1_EFFECTIVENESS_MAX_TYPE_ID = 0x1a;

/** Multiplier bytes observed in the dumped ROMs. */
export const GEN1_EFFECTIVENESS_MULTIPLIERS: ReadonlyArray<number> = [
	0x00, 0x05, 0x14,
];

/** Entry count observed in the dumped ROMs. */
export const GEN1_EFFECTIVENESS_OBSERVED_COUNT = 82;

/**
 * Maximum entries the sequential reader will scan before giving up.
 * Guards a sentinel-less scan; the observed count above is enforced
 * separately once the sentinel is found.
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
 * table start until the 0xFF sentinel. Each entry is validated against
 * the observed limits (ids ≤ 0x1A, multiplier in {0x00, 0x05, 0x14}),
 * and the final count must equal the observed 82 — an empty table, a
 * truncated table, a missing sentinel, or any other count throws with
 * the entry index and file offset. Returns entries in ROM order.
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
			if (entries.length !== GEN1_EFFECTIVENESS_OBSERVED_COUNT) {
				throw new Gen1EffectivenessError(
					`Effectiveness table holds ${entries.length} entries at offset 0x${offset.toString(16)} ` +
						`(expected exactly ${GEN1_EFFECTIVENESS_OBSERVED_COUNT}, the observed count)`,
				);
			}
			return entries;
		}
		const defender = reader.byteAt(offset + 1);
		const multiplier = reader.byteAt(offset + 2);
		if (attacker > GEN1_EFFECTIVENESS_MAX_TYPE_ID) {
			throw new Gen1EffectivenessError(
				`Invalid attacker 0x${attacker.toString(16)} at entry ${index} ` +
					`(offset 0x${offset.toString(16)}, expected ≤ 0x1a)`,
			);
		}
		if (defender > GEN1_EFFECTIVENESS_MAX_TYPE_ID) {
			throw new Gen1EffectivenessError(
				`Invalid defender 0x${defender.toString(16)} at entry ${index} ` +
					`(offset 0x${(offset + 1).toString(16)}, expected ≤ 0x1a)`,
			);
		}
		if (!GEN1_EFFECTIVENESS_MULTIPLIERS.includes(multiplier)) {
			throw new Gen1EffectivenessError(
				`Invalid multiplier 0x${multiplier.toString(16)} at entry ${index} ` +
					`(offset 0x${(offset + 2).toString(16)}, expected one of 0x00, 0x05, 0x14)`,
			);
		}
		entries.push({ attacker, defender, multiplier });
	}
	throw new Gen1EffectivenessError(
		`Missing 0xFF sentinel after ${GEN1_EFFECTIVENESS_MAX_ENTRIES} entries ` +
			`from offset 0x${GEN1_EFFECTIVENESS_TABLE_OFFSET.toString(16)}`,
	);
}
