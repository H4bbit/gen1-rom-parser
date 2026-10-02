// Internal-index → Pokédex-number order table at file 0x41024.
//
// The table is parallel to the name table: entry `i` holds the Pokédex
// number of the Pokémon with internal index `i` (see
// docs/text-and-names.md for the evidence). Kept separate from
// Gen1Names.ts because the name table stands on its own; the order
// table only adds the index→dex mapping.

import type { RomReader } from "../rom/RomReader.ts";
import { GEN1_NAME_TABLE_COUNT } from "./Gen1Names.ts";

/** ROM file offset of the order table. Observed in both Red and Blue. */
export const GEN1_ORDER_TABLE_OFFSET = 0x41024;

/** Entries in the order table: one per internal index. */
export const GEN1_ORDER_TABLE_COUNT = GEN1_NAME_TABLE_COUNT;

/** Highest valid Pokédex number (Mew). */
export const GEN1_MAX_DEX_NUMBER = 151;

/**
 * Value stored for slots without a Pokédex number. Every such slot
 * observed in the ROMs corresponds to a MISSINGNO. name entry (see
 * docs/text-and-names.md); the parser exposes the raw value and does
 * not assign it dex semantics.
 */
export const GEN1_ORDER_NO_DEX = 0;

export class Gen1OrderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1OrderError";
	}
}

/**
 * Reads the raw order-table value for an internal index: the Pokédex
 * number (1–151), or 0 for slots without one.
 */
export function readGen1OrderValue(reader: RomReader, index: number): number {
	if (
		!Number.isInteger(index) ||
		index < 0 ||
		index >= GEN1_ORDER_TABLE_COUNT
	) {
		throw new Gen1OrderError(
			`Invalid Pokémon index ${index} (must be an integer 0–${GEN1_ORDER_TABLE_COUNT - 1})`,
		);
	}
	return reader.byteAt(GEN1_ORDER_TABLE_OFFSET + index);
}

/**
 * Finds the internal index for a Pokédex number (1–151) by scanning the
 * order table. Each number occurs exactly once in the investigated ROMs;
 * throws if the number is out of range or absent.
 */
export function findGen1IndexByDex(
	reader: RomReader,
	dexNumber: number,
): number {
	if (
		!Number.isInteger(dexNumber) ||
		dexNumber < 1 ||
		dexNumber > GEN1_MAX_DEX_NUMBER
	) {
		throw new Gen1OrderError(
			`Invalid Pokédex number ${dexNumber} (must be an integer 1–${GEN1_MAX_DEX_NUMBER})`,
		);
	}
	for (let index = 0; index < GEN1_ORDER_TABLE_COUNT; index++) {
		if (reader.byteAt(GEN1_ORDER_TABLE_OFFSET + index) === dexNumber) {
			return index;
		}
	}
	throw new Gen1OrderError(
		`Pokédex number ${dexNumber} not present in the order table`,
	);
}
