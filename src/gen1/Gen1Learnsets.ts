// Physical layout of the evolution/level-up data (internal index → entries).
//
// The pointer table holds one little-endian pointer per internal index
// (190 entries) at file 0x3B05C. Each pointer is a Game Boy CPU address
// in the banked window; all 190 values observed in both ROMs fall in
// 0x4000–0x7FFF. The entries live in the same bank as the table
// (bank 0x0E), so each pointer resolves within its own bank exactly
// like the type-name table does (see docs/learnsets.md). Entries are
// variable-length: evolution records, then level-up (level, move)
// pairs, each section terminated by a single 0x00 byte.
//
// This module reads only the level-up section. Evolution records are
// skipped, not decoded: their type/length rules are documented in
// docs/learnsets.md for provenance, and the skipper enforces them so a
// malformed evolution section throws instead of misaligning the
// learnset that follows. Evolution semantics (level/item/trade) and
// TM/HM decoding are out of scope.
//
// Kept independent of Gen1Moves/Gen1Stats the way Gen1Effectiveness.ts
// stands apart: only shared RomReader helpers and the existing
// order/name helpers (for dex → index resolution) are used.

import type { RomReader } from "../rom/RomReader.ts";
import { GEN1_NAME_TABLE_COUNT } from "./Gen1Names.ts";
import { findGen1IndexByDex, GEN1_MAX_DEX_NUMBER } from "./Gen1Order.ts";

/** ROM file offset of the first pointer-table entry (internal index 0). */
export const GEN1_LEARNSET_POINTER_TABLE_OFFSET = 0x3b05c;

/** Entries in the pointer table: one per internal index. */
export const GEN1_LEARNSET_POINTER_TABLE_COUNT = GEN1_NAME_TABLE_COUNT;

/** ROM bank containing the pointer table and the entries. */
export const GEN1_LEARNSET_BANK = 0x0e;

/** Section/record terminator: ends the evolution list and the learnset. */
export const GEN1_LEARNSET_SENTINEL = 0x00;

/** Lowest valid level-up level (game levels start at 1; 0x00 is the sentinel). */
export const GEN1_LEARNSET_MIN_LEVEL = 1;

/** Highest valid level-up level observed in the dumped ROMs. */
export const GEN1_LEARNSET_MAX_LEVEL = 100;

/** First valid move id in a learnset entry. */
export const GEN1_LEARNSET_FIRST_MOVE_ID = 1;

/** Last valid move id (STRUGGLE, the end of the move table). */
export const GEN1_LEARNSET_LAST_MOVE_ID = 165;

/**
 * Maximum bytes the reader will scan for one species entry before
 * giving up. Bounds a missing-sentinel scan; the observed entry sizes
 * (2–22 bytes) are far below it.
 */
export const GEN1_LEARNSET_MAX_ENTRY_BYTES = 512;

export class Gen1LearnsetError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1LearnsetError";
	}
}

export interface Gen1LevelUpMove {
	/** Raw level as stored (observed domain 2–100 in the dumped ROMs). */
	readonly level: number;
	/** Raw move id (observed 1–165; validated against the move table range). */
	readonly move: number;
}

function assertValidIndex(index: number): void {
	if (
		!Number.isInteger(index) ||
		index < 0 ||
		index >= GEN1_LEARNSET_POINTER_TABLE_COUNT
	) {
		throw new Gen1LearnsetError(
			`Invalid Pokémon index ${index} (must be an integer 0–${GEN1_LEARNSET_POINTER_TABLE_COUNT - 1})`,
		);
	}
}

/**
 * Resolves the file offset of the entry for an internal index: reads
 * the little-endian pointer and resolves it within the table's own
 * bank. A pointer outside the banked window or past the loaded image
 * throws instead of resolving to unrelated bytes.
 */
export function gen1LearnsetEntryOffset(
	reader: RomReader,
	index: number,
): number {
	assertValidIndex(index);
	const pointer = reader.readUInt16LE(
		GEN1_LEARNSET_POINTER_TABLE_OFFSET + index * 2,
	);
	if (pointer < 0x4000 || pointer >= 0x8000) {
		throw new Gen1LearnsetError(
			`Learnset pointer for index ${index} is 0x${pointer.toString(16)} ` +
				`(offset 0x${(GEN1_LEARNSET_POINTER_TABLE_OFFSET + index * 2).toString(16)}, expected 0x4000–0x7fff)`,
		);
	}
	return reader.resolveBankAddress(GEN1_LEARNSET_BANK, pointer);
}

/**
 * Skips the evolution section of an entry, returning the file offset
 * of the first learnset byte. Enforces the observed record shapes
 * (type 1: 3 bytes, type 2: 4 bytes, type 3: 3 bytes, 0x00 ends the
 * section) so a malformed section throws with the entry's file
 * offset instead of misaligning the learnset.
 */
function skipEvolutionSection(
	reader: RomReader,
	entryOffset: number,
	index: number,
): number {
	let offset = entryOffset;
	for (;;) {
		if (offset - entryOffset >= GEN1_LEARNSET_MAX_ENTRY_BYTES) {
			throw new Gen1LearnsetError(
				`Missing evolution terminator 0x00 for index ${index} ` +
					`at entry offset 0x${entryOffset.toString(16)}`,
			);
		}
		const kind = reader.byteAt(offset);
		if (kind === GEN1_LEARNSET_SENTINEL) {
			return offset + 1;
		}
		let length: number;
		if (kind === 1 || kind === 3) {
			length = 3;
		} else if (kind === 2) {
			length = 4;
		} else {
			throw new Gen1LearnsetError(
				`Invalid evolution type 0x${kind.toString(16).padStart(2, "0")} for index ${index} ` +
					`(offset 0x${offset.toString(16)}, expected 0x01, 0x02, 0x03, or 0x00)`,
			);
		}
		// Bounds-check the whole record through the reader.
		reader.slice(offset, length);
		offset += length;
	}
}

/**
 * Reads the level-up learnset for an internal index (0–189): the
 * (level, move) pairs after the evolution section, in ROM order, up
 * to the 0x00 terminator. Empty lists (terminator first) are valid
 * and return []. Levels must be 1–100 and strictly increasing; move
 * ids must be 1–165; violations throw with the entry index and file
 * offset.
 */
export function readGen1LevelUpLearnsetByIndex(
	reader: RomReader,
	index: number,
): Array<Gen1LevelUpMove> {
	assertValidIndex(index);
	const entryOffset = gen1LearnsetEntryOffset(reader, index);
	let offset = skipEvolutionSection(reader, entryOffset, index);
	const moves: Array<Gen1LevelUpMove> = [];
	let previousLevel = -1;
	for (;;) {
		if (offset - entryOffset >= GEN1_LEARNSET_MAX_ENTRY_BYTES) {
			throw new Gen1LearnsetError(
				`Missing learnset terminator 0x00 for index ${index} ` +
					`at entry offset 0x${entryOffset.toString(16)}`,
			);
		}
		const level = reader.byteAt(offset);
		if (level === GEN1_LEARNSET_SENTINEL) {
			return moves;
		}
		const move = reader.byteAt(offset + 1);
		if (
			!Number.isInteger(level) ||
			level < GEN1_LEARNSET_MIN_LEVEL ||
			level > GEN1_LEARNSET_MAX_LEVEL
		) {
			throw new Gen1LearnsetError(
				`Invalid level ${level} for index ${index} ` +
					`(offset 0x${offset.toString(16)}, expected ${GEN1_LEARNSET_MIN_LEVEL}–${GEN1_LEARNSET_MAX_LEVEL})`,
			);
		}
		if (
			!Number.isInteger(move) ||
			move < GEN1_LEARNSET_FIRST_MOVE_ID ||
			move > GEN1_LEARNSET_LAST_MOVE_ID
		) {
			throw new Gen1LearnsetError(
				`Invalid move id ${move} for index ${index} ` +
					`(offset 0x${(offset + 1).toString(16)}, expected ${GEN1_LEARNSET_FIRST_MOVE_ID}–${GEN1_LEARNSET_LAST_MOVE_ID})`,
			);
		}
		if (level <= previousLevel) {
			throw new Gen1LearnsetError(
				`Unordered level ${level} after level ${previousLevel} for index ${index} ` +
					`(offset 0x${offset.toString(16)}, levels must strictly increase)`,
			);
		}
		previousLevel = level;
		moves.push({ level, move });
		offset += 2;
	}
}

/**
 * Reads the level-up learnset for a Pokédex number 1–151. The pointer
 * table is keyed by internal index, so the dex number is resolved
 * through the existing order table (`findGen1IndexByDex`) — the same
 * join policy as the CLI pokemon loop. Returns entries in ROM order.
 */
export function readGen1LevelUpLearnset(
	reader: RomReader,
	dexNumber: number,
): ReadonlyArray<Gen1LevelUpMove> {
	if (
		!Number.isInteger(dexNumber) ||
		dexNumber < 1 ||
		dexNumber > GEN1_MAX_DEX_NUMBER
	) {
		throw new Gen1LearnsetError(
			`Invalid Pokédex number ${dexNumber} (must be an integer 1–${GEN1_MAX_DEX_NUMBER})`,
		);
	}
	return readGen1LevelUpLearnsetByIndex(
		reader,
		findGen1IndexByDex(reader, dexNumber),
	);
}
