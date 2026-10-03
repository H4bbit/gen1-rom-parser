// Layout of the move name list (move id → variable-length string).
//
// The list holds one 0x50-terminated string per move id 1–165 starting
// at file 0xB0000 (see docs/moves.md for the evidence). Unlike the
// Pokémon name table there is no fixed stride: entries are read
// sequentially, so looking up id N requires walking the N − 1 strings
// before it. The parser stops after the 165th terminator and never
// reads past it.
//
// Kept independent from Gen1Moves.ts the way Gen1Names.ts stands apart
// from Gen1Stats.ts: name lookup and data lookup share only the move
// id, never an implementation.

import type { RomReader } from "../rom/RomReader.ts";
import { GEN1_MOVE_LAST_ID } from "./Gen1Moves.ts";
import { GEN1_TEXT_TERMINATOR } from "./Gen1Text.ts";

/** ROM file offset of the first move-name string (move 1, POUND). */
export const GEN1_MOVE_NAMES_OFFSET = 0xb0000;

/** Number of move-name strings (one per move id 1–165). */
export const GEN1_MOVE_NAMES_COUNT = GEN1_MOVE_LAST_ID;

/**
 * Longest move name observed in the ROMs (12 content bytes:
 * KARATE CHOP, SAND-ATTACK, DOUBLE-EDGE). Any longer string is not a
 * well-formed move name.
 */
export const GEN1_MOVE_NAME_MAX_LENGTH = 12;

/** Shortest move name observed in the ROMs (CUT, FLY, DIG). */
export const GEN1_MOVE_NAME_MIN_LENGTH = 3;

export class Gen1MoveNameError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1MoveNameError";
	}
}

function assertValidMoveId(moveId: number): void {
	if (
		!Number.isInteger(moveId) ||
		moveId < 1 ||
		moveId > GEN1_MOVE_NAMES_COUNT
	) {
		throw new Gen1MoveNameError(
			`Invalid move id ${moveId} (must be an integer 1–${GEN1_MOVE_NAMES_COUNT})`,
		);
	}
}

/**
 * Reads the raw bytes of the move-name string for a move id, without
 * the 0x50 terminator. Returns a copy.
 */
export function readGen1MoveNameEntry(
	reader: RomReader,
	moveId: number,
): Buffer {
	assertValidMoveId(moveId);
	let offset = GEN1_MOVE_NAMES_OFFSET;
	// Walk the (moveId − 1) preceding strings without decoding them.
	for (let id = 1; id < moveId; id++) {
		const end = findTerminator(reader, id, offset);
		offset = end + 1;
	}
	const end = findTerminator(reader, moveId, offset);
	const length = end - offset;
	if (
		length < GEN1_MOVE_NAME_MIN_LENGTH ||
		length > GEN1_MOVE_NAME_MAX_LENGTH
	) {
		throw new Gen1MoveNameError(
			`Malformed move name for id ${moveId}: ${length} content bytes at offset 0x${offset.toString(16)} (expected ${GEN1_MOVE_NAME_MIN_LENGTH}–${GEN1_MOVE_NAME_MAX_LENGTH})`,
		);
	}
	return reader.slice(offset, length);
}

function findTerminator(
	reader: RomReader,
	moveId: number,
	fromOffset: number,
): number {
	// A move name cannot exceed the maximum length plus its terminator.
	for (
		let offset = fromOffset;
		offset <= fromOffset + GEN1_MOVE_NAME_MAX_LENGTH;
		offset++
	) {
		if (reader.byteAt(offset) === GEN1_TEXT_TERMINATOR) {
			return offset;
		}
	}
	throw new Gen1MoveNameError(
		`Missing terminator for move id ${moveId} at offset 0x${fromOffset.toString(16)} (no 0x50 within ${GEN1_MOVE_NAME_MAX_LENGTH + 1} bytes)`,
	);
}

/**
 * Reads the raw bytes of every move-name string in id order. The 165th
 * terminator ends the list; bytes after it are never read.
 */
export function readAllGen1MoveNameEntries(reader: RomReader): Array<Buffer> {
	const entries: Array<Buffer> = [];
	for (let id = 1; id <= GEN1_MOVE_NAMES_COUNT; id++) {
		entries.push(readGen1MoveNameEntry(reader, id));
	}
	return entries;
}
