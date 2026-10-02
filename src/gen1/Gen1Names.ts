// Layout of the Pokémon name table (internal index → fixed-size entry).
//
// The table holds one entry per internal index (see docs/text-and-names.md
// for the evidence). Entries are fixed-size; names shorter than the entry
// are terminated with 0x50 and padded with 0x50. The longest names fill
// the whole entry with no terminator.

import type { RomReader } from "../rom/RomReader.ts";
import { resolveBankedPointer } from "../rom/RomReader.ts";
import { GEN1_TEXT_PADDING, GEN1_TEXT_TERMINATOR } from "./Gen1Text.ts";

/** ROM bank containing the name table. Observed in both Red and Blue. */
export const GEN1_NAME_TABLE_BANK = 0x07;

/** CPU address of the name table. Observed in both Red and Blue. */
export const GEN1_NAME_TABLE_ADDRESS = 0x421e;

/** Number of entries in the name table (internal indexes 0–189). */
export const GEN1_NAME_TABLE_COUNT = 190;

/** Size of one name entry in bytes. */
export const GEN1_NAME_ENTRY_LENGTH = 10;

/** Longest name that fits: a full entry carries no terminator. */
export const GEN1_NAME_MAX_LENGTH = 10;

export class Gen1NameError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1NameError";
	}
}

export function gen1NameTableBase(reader: RomReader): number {
	return resolveBankedPointer(
		reader,
		GEN1_NAME_TABLE_BANK,
		GEN1_NAME_TABLE_ADDRESS,
	);
}

/**
 * Reads the raw bytes of the name entry for an internal index.
 * Returns a copy; the 0x50 terminator and padding are included so
 * callers can verify the entry shape (see `decodeGen1Name` for decoding).
 */
export function readGen1NameEntry(reader: RomReader, index: number): Buffer {
	if (!Number.isInteger(index) || index < 0 || index >= GEN1_NAME_TABLE_COUNT) {
		throw new Gen1NameError(
			`Invalid Pokémon index ${index} (must be an integer 0–${GEN1_NAME_TABLE_COUNT - 1})`,
		);
	}
	const base = gen1NameTableBase(reader);
	const entry = reader.slice(
		base + index * GEN1_NAME_ENTRY_LENGTH,
		GEN1_NAME_ENTRY_LENGTH,
	);
	// Shape check: after the first 0x50 terminator only 0x50 padding may
	// follow. Anything else is not a well-formed name entry.
	const end = entry.indexOf(GEN1_TEXT_TERMINATOR);
	if (end >= 0) {
		for (let i = end + 1; i < entry.length; i++) {
			if (entry[i] !== GEN1_TEXT_PADDING) {
				throw new Gen1NameError(
					`Malformed name entry for index ${index}: byte 0x${(entry[i] as number).toString(16).padStart(2, "0")} after terminator at entry offset ${i}`,
				);
			}
		}
	}
	return entry;
}
