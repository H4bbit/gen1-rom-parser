// Physical layout of the move data table (move id → fixed entry).
//
// The table holds one 6-byte entry per move id 1–165 at file 0x38000,
// immediately before the base-stats table (see docs/moves.md for the
// evidence). Entries are fixed-size and linear — no pointers involved.
//
// Entry byte 0 is the stored move id and is validated against the
// requested id, like Gen1Stats validates the stored dex number. It is
// exposed as `animationId`: the byte is observed sequential 1–165 and
// the disassembly labels it "animation", so the name is an
// interpretation, not an established fact. All other fields are raw
// numbers: no type or effect enums exist at this layer.

import type { RomReader } from "../rom/RomReader.ts";

/** ROM file offset of the move data table (move 1). */
export const GEN1_MOVE_TABLE_OFFSET = 0x38000;

/** Size of one move entry in bytes. */
export const GEN1_MOVE_ENTRY_LENGTH = 6;

/** First valid move id (POUND). */
export const GEN1_MOVE_FIRST_ID = 1;

/** Last valid move id (STRUGGLE). */
export const GEN1_MOVE_LAST_ID = 165;

/** Number of entries in the move table. */
export const GEN1_MOVE_TABLE_COUNT = 165;

export class Gen1MoveError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1MoveError";
	}
}

export interface Gen1MoveData {
	/** Stored entry id (validated equal to the requested id). */
	readonly animationId: number;
	/** Raw effect id. No effect enum exists at this layer. */
	readonly effect: number;
	/** Raw base power (0 for non-damaging moves). */
	readonly power: number;
	/** Raw type id. No type enum exists at this layer. */
	readonly type: number;
	/**
	 * Raw accuracy byte (0–255 scale, not percent: 100% stores as
	 * 0xFF — see docs/moves.md). Exposed unconverted.
	 */
	readonly accuracy: number;
	/** Raw base PP. */
	readonly pp: number;
}

/**
 * Reads the move data entry for a move id 1–165.
 */
export function readGen1MoveData(
	reader: RomReader,
	moveId: number,
): Gen1MoveData {
	if (
		!Number.isInteger(moveId) ||
		moveId < GEN1_MOVE_FIRST_ID ||
		moveId > GEN1_MOVE_LAST_ID
	) {
		throw new Gen1MoveError(
			`Invalid move id ${moveId} (must be an integer ${GEN1_MOVE_FIRST_ID}–${GEN1_MOVE_LAST_ID})`,
		);
	}
	const offset = GEN1_MOVE_TABLE_OFFSET + (moveId - 1) * GEN1_MOVE_ENTRY_LENGTH;
	const entry = reader.slice(offset, GEN1_MOVE_ENTRY_LENGTH);
	const storedId = entry[0] as number;
	if (storedId !== moveId) {
		throw new Gen1MoveError(
			`Move entry for id ${moveId} holds id 0x${storedId.toString(16).padStart(2, "0")} at offset 0x${offset.toString(16)} (expected 0x${moveId.toString(16).padStart(2, "0")})`,
		);
	}
	return {
		animationId: storedId,
		effect: entry[1] as number,
		power: entry[2] as number,
		type: entry[3] as number,
		accuracy: entry[4] as number,
		pp: entry[5] as number,
	};
}
