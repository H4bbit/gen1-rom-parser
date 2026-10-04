// Layout of the type-name pointer table (type id → name string).
//
// The table holds one little-endian pointer per type id 0x00–0x1A
// (27 entries) at file 0x27DAE, in the same ROM bank as the name
// strings themselves (bank 9). Each pointer resolves to a 0x50-
// terminated string inside the observed name region 0x27DE4–0x27E49
// (see docs/types.md for the evidence). Ids 0x09–0x13 alias NORMAL;
// no meaning is assigned to that aliasing.
//
// Kept independent from the other Gen I parsers the way Gen1Names.ts
// stands apart from Gen1Stats.ts: each pointer is resolved within the
// table's own bank, sharing no implementation with other parsers.

import type { RomReader } from "../rom/RomReader.ts";
import { GEN1_TEXT_TERMINATOR } from "./Gen1Text.ts";

/** ROM file offset of the first type-name pointer (type id 0x00). */
export const GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET = 0x27dae;

/** Number of pointer entries (type ids 0x00–0x1A). */
export const GEN1_TYPE_NAMES_POINTER_COUNT = 27;

/** Lowest valid type id (NORMAL). */
export const GEN1_TYPE_FIRST_ID = 0x00;

/** Highest valid type id (DRAGON). */
export const GEN1_TYPE_LAST_ID = 0x1a;

/** ROM file offset of the first type-name string (NORMAL). */
export const GEN1_TYPE_NAMES_REGION_START = 0x27de4;

/** ROM file offset just past the last type-name terminator (DRAGON). */
export const GEN1_TYPE_NAMES_REGION_END = 0x27e4a;

/**
 * Longest type-name content length observed in the ROMs (8 bytes:
 * FIGHTING, ELECTRIC). Any longer string is not a well-formed type
 * name. Shortest observed is 3 (ICE, BUG).
 */
export const GEN1_TYPE_NAME_MAX_LENGTH = 8;
export const GEN1_TYPE_NAME_MIN_LENGTH = 3;

export class Gen1TypeNameError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1TypeNameError";
	}
}

function assertValidTypeId(typeId: number): void {
	if (
		!Number.isInteger(typeId) ||
		typeId < GEN1_TYPE_FIRST_ID ||
		typeId > GEN1_TYPE_LAST_ID
	) {
		throw new Gen1TypeNameError(
			`Invalid type id ${typeId} (must be an integer 0x00–0x1a)`,
		);
	}
}

/**
 * Reads the raw bytes of the type-name string for a type id, without
 * the 0x50 terminator. The pointer is resolved within the table's own
 * ROM bank (same-bank reference — see docs/types.md), and the target
 * must be the start of a 0x50-terminated string inside the observed
 * name region: the region start itself, or an offset whose preceding
 * byte is the 0x50 terminator of the previous string. Returns a copy.
 */
export function readGen1TypeNameEntry(
	reader: RomReader,
	typeId: number,
): Buffer {
	assertValidTypeId(typeId);
	const pointerOffset = GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET + typeId * 2;
	const pointer = reader.readUInt16LE(pointerOffset);
	const tableBank = Math.floor(pointerOffset / 0x4000);
	const stringOffset = reader.resolveBankAddress(tableBank, pointer);
	if (
		stringOffset < GEN1_TYPE_NAMES_REGION_START ||
		stringOffset >= GEN1_TYPE_NAMES_REGION_END
	) {
		throw new Gen1TypeNameError(
			`Type-name pointer for id 0x${typeId.toString(16).padStart(2, "0")} ` +
				`resolves to offset 0x${stringOffset.toString(16)} ` +
				`(expected within 0x${GEN1_TYPE_NAMES_REGION_START.toString(16)}–0x${(GEN1_TYPE_NAMES_REGION_END - 1).toString(16)})`,
		);
	}
	if (
		stringOffset !== GEN1_TYPE_NAMES_REGION_START &&
		reader.byteAt(stringOffset - 1) !== GEN1_TEXT_TERMINATOR
	) {
		throw new Gen1TypeNameError(
			`Type-name pointer for id 0x${typeId.toString(16).padStart(2, "0")} ` +
				`resolves to offset 0x${stringOffset.toString(16)}, ` +
				`which is not the start of a 0x50-terminated string`,
		);
	}
	const maxEnd = Math.min(
		stringOffset + GEN1_TYPE_NAME_MAX_LENGTH + 1,
		GEN1_TYPE_NAMES_REGION_END,
	);
	let end = stringOffset;
	while (end < maxEnd && reader.byteAt(end) !== GEN1_TEXT_TERMINATOR) {
		end++;
	}
	if (end >= maxEnd || reader.byteAt(end) !== GEN1_TEXT_TERMINATOR) {
		throw new Gen1TypeNameError(
			`Missing terminator for type id 0x${typeId.toString(16).padStart(2, "0")} ` +
				`at offset 0x${stringOffset.toString(16)} ` +
				`(no 0x50 within ${GEN1_TYPE_NAME_MAX_LENGTH + 1} bytes)`,
		);
	}
	const length = end - stringOffset;
	if (
		length < GEN1_TYPE_NAME_MIN_LENGTH ||
		length > GEN1_TYPE_NAME_MAX_LENGTH
	) {
		throw new Gen1TypeNameError(
			`Malformed type name for id 0x${typeId.toString(16).padStart(2, "0")}: ` +
				`${length} content bytes at offset 0x${stringOffset.toString(16)} ` +
				`(expected ${GEN1_TYPE_NAME_MIN_LENGTH}–${GEN1_TYPE_NAME_MAX_LENGTH})`,
		);
	}
	return reader.slice(stringOffset, length);
}

/**
 * Reads the raw bytes of every type-name string in type-id order.
 * Aliased ids return the same target bytes as separate copies.
 */
export function readAllGen1TypeNameEntries(reader: RomReader): Array<Buffer> {
	const entries: Array<Buffer> = [];
	for (let id = GEN1_TYPE_FIRST_ID; id <= GEN1_TYPE_LAST_ID; id++) {
		entries.push(readGen1TypeNameEntry(reader, id));
	}
	return entries;
}
