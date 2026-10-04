// Physical layout of the TM/HM machine table and species TM/HM bitfields.
//
// The machine table holds one move-id byte per TM/HM slot (50 TMs then
// 5 HMs) at file 0x13773 (see docs/tmhm.md for the evidence). Each
// species' compatibility bitfield is the raw 7-byte `tmhm` field of its
// base-stats entry (offsets 0x14-0x1A within each 28-byte entry,
// including Mew's standalone entry) and is read through
// `readGen1BaseStats`, never re-parsed ad hoc.
//
// Bit rule (established from ROM bytes, see docs/tmhm.md): slot `s`
// (0-based, TM01 = slot 0 ... TM50 = slot 49, HM01 = slot 50 ...
// HM05 = slot 54) is byte `s >> 3`, bit `s & 7` (LSB-first). Bit 7 of
// byte 6 is spare and is ignored: Mew's all-0xFF bitfield sets it, so
// rejecting it would reject the ROM's own data.
//
// Kept independent of Gen1Moves/Gen1Learnsets the way
// Gen1Effectiveness.ts stands apart: only the shared RomReader and the
// existing base-stats reader are used. No move-effect semantics, no
// evolution data, no display names ("TM34" strings are a consumer
// concern).

import type { RomReader } from "../rom/RomReader.ts";
import { GEN1_BASE_STATS_MAX_DEX, readGen1BaseStats } from "./Gen1Stats.ts";

/** ROM file offset of the first machine-table entry (TM01). */
export const GEN1_TMHM_TABLE_OFFSET = 0x13773;

/** Number of TM slots (TM01-TM50). */
export const GEN1_TM_COUNT = 50;

/** Number of HM slots (HM01-HM05). */
export const GEN1_HM_COUNT = 5;

/** Entries in the machine table: one move id per TM/HM slot. */
export const GEN1_TMHM_COUNT = GEN1_TM_COUNT + GEN1_HM_COUNT;

/** Length of a species TM/HM bitfield in bytes (55 slots + 1 spare). */
export const GEN1_TMHM_BITFIELD_LENGTH = 7;

/** First valid move id in the machine table. */
export const GEN1_TMHM_FIRST_MOVE_ID = 1;

/** Last valid move id (STRUGGLE, the end of the move table). */
export const GEN1_TMHM_LAST_MOVE_ID = 165;

export class Gen1TmHmError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1TmHmError";
	}
}

/** Human slot label for error messages: TM01-TM50, then HM01-HM05. */
function slotLabel(slot: number): string {
	return slot < GEN1_TM_COUNT
		? `TM${String(slot + 1).padStart(2, "0")}`
		: `HM${String(slot - GEN1_TM_COUNT + 1).padStart(2, "0")}`;
}

function assertValidMachineId(move: number, where: string): void {
	if (
		!Number.isInteger(move) ||
		move < GEN1_TMHM_FIRST_MOVE_ID ||
		move > GEN1_TMHM_LAST_MOVE_ID
	) {
		throw new Gen1TmHmError(
			`Invalid move id ${move} for ${where} (expected ${GEN1_TMHM_FIRST_MOVE_ID}-${GEN1_TMHM_LAST_MOVE_ID})`,
		);
	}
}

/**
 * Reads the machine table: the move id taught by each TM/HM slot, in
 * slot order (TM01-TM50, then HM01-HM05). Every entry must be a move id
 * 1-165; violations throw with the slot and the ROM file offset.
 */
export function readGen1TmHmTable(reader: RomReader): Array<number> {
	const table = reader.slice(GEN1_TMHM_TABLE_OFFSET, GEN1_TMHM_COUNT);
	const moves: Array<number> = [];
	for (let slot = 0; slot < GEN1_TMHM_COUNT; slot++) {
		const move = table[slot] as number;
		assertValidMachineId(
			move,
			`machine-table ${slotLabel(slot)} (offset 0x${(GEN1_TMHM_TABLE_OFFSET + slot).toString(16)})`,
		);
		moves.push(move);
	}
	return moves;
}

/**
 * Maps a 7-byte TM/HM bitfield to the ordered list of move ids the
 * species can learn (slot order: TM01-TM50, then HM01-HM05). Only set
 * bits whose slot has a machine-table entry are emitted, so the spare
 * bit (bit 7 of byte 6) is ignored. An all-zero bitfield yields [].
 * The machine table is validated again here so a synthetic or corrupt
 * table throws with its slot instead of emitting an impossible move id.
 */
export function decodeGen1TmHm(
	bitfield: Buffer | ReadonlyArray<number>,
	machineTable: ReadonlyArray<number>,
): Array<number> {
	if (bitfield.length !== GEN1_TMHM_BITFIELD_LENGTH) {
		throw new Gen1TmHmError(
			`Invalid TM/HM bitfield length ${bitfield.length} (expected ${GEN1_TMHM_BITFIELD_LENGTH})`,
		);
	}
	if (machineTable.length !== GEN1_TMHM_COUNT) {
		throw new Gen1TmHmError(
			`Invalid machine-table length ${machineTable.length} (expected ${GEN1_TMHM_COUNT})`,
		);
	}
	const moves: Array<number> = [];
	for (let slot = 0; slot < GEN1_TMHM_COUNT; slot++) {
		if ((bitfield[slot >> 3] as number) & (1 << (slot & 7))) {
			const move = machineTable[slot] as number;
			assertValidMachineId(move, `machine-table ${slotLabel(slot)}`);
			moves.push(move);
		}
	}
	return moves;
}

/**
 * Reads the TM/HM learnset for a Pokedex number 1-151: the species'
 * bitfield from `readGen1BaseStats` decoded through the ROM's machine
 * table. Returns move ids in slot order (TM01-TM50, then HM01-HM05);
 * empty bitfields return []. Same dex 1-151 policy as the other
 * species APIs.
 */
export function readGen1TmHmLearnset(
	reader: RomReader,
	dexNumber: number,
): Array<number> {
	if (
		!Number.isInteger(dexNumber) ||
		dexNumber < 1 ||
		dexNumber > GEN1_BASE_STATS_MAX_DEX
	) {
		throw new Gen1TmHmError(
			`Invalid Pokedex number ${dexNumber} (must be an integer 1-${GEN1_BASE_STATS_MAX_DEX})`,
		);
	}
	return decodeGen1TmHm(
		readGen1BaseStats(reader, dexNumber).tmhm,
		readGen1TmHmTable(reader),
	);
}
