// Physical layout of the base-stats table (dex number → fixed entry).
//
// The main table holds one 28-byte entry per Pokédex number 1–150 at file
// 0x383DE; Mew (dex 151) lives in a separate single entry at file 0x425B
// (see docs/base-stats.md for the evidence). Entries are fixed-size and
// linear — no pointers or bank bytes involved.
//
// Only the structure and raw field values are established here. The
// numeric meanings of types, moves, and growth rates were cross-checked
// against references (documented in docs/base-stats.md) but are exposed
// as raw numbers; domain enums come later.

import type { RomReader } from "../rom/RomReader.ts";

/** ROM file offset of the main base-stats table (dex 1–150). */
export const GEN1_BASE_STATS_OFFSET = 0x383de;

/** Size of one base-stats entry in bytes. */
export const GEN1_BASE_STATS_ENTRY_LENGTH = 28;

/** Pokédex numbers covered by the main table. */
export const GEN1_BASE_STATS_FIRST_DEX = 1;
export const GEN1_BASE_STATS_LAST_DEX = 150;

/** ROM file offset of Mew's standalone base-stats entry (dex 151). */
export const GEN1_MEW_BASE_STATS_OFFSET = 0x425b;

/** Highest Pokédex number readable through this module (Mew). */
export const GEN1_BASE_STATS_MAX_DEX = 151;

export class Gen1StatsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Gen1StatsError";
	}
}

export interface Gen1BaseStats {
	readonly dexNumber: number;
	readonly hp: number;
	readonly attack: number;
	readonly defense: number;
	readonly speed: number;
	readonly special: number;
	readonly type1: number;
	readonly type2: number;
	readonly catchRate: number;
	readonly baseExp: number;
	readonly spriteSize: number;
	/** Raw Game Boy CPU addresses (banked window); bank resolution is out of scope. */
	readonly frontSprite: number;
	readonly backSprite: number;
	/** Raw level-1 learnset move ids (0 = no move). */
	readonly level1Moves: readonly number[];
	/** Raw growth-rate id. */
	readonly growthRate: number;
	/** Raw TM/HM learnset bitfield (7 bytes). */
	readonly tmhm: Buffer;
	/**
	 * Raw final entry byte (offset 0x1B). Observed as 0x00 in all 150
	 * main-table entries and 0xFF in Mew's entry in both investigated
	 * ROMs (see docs/base-stats.md); no meaning is assigned. Exposed
	 * explicitly so it is never silently discarded.
	 */
	readonly padding: number;
}

function parseEntry(entry: Buffer, dexNumber: number): Gen1BaseStats {
	const storedDex = entry[0] as number;
	if (storedDex !== dexNumber) {
		throw new Gen1StatsError(
			`Base-stats entry for dex ${dexNumber} holds id 0x${storedDex.toString(16).padStart(2, "0")} (expected 0x${dexNumber.toString(16).padStart(2, "0")})`,
		);
	}
	return {
		dexNumber,
		hp: entry[1] as number,
		attack: entry[2] as number,
		defense: entry[3] as number,
		speed: entry[4] as number,
		special: entry[5] as number,
		type1: entry[6] as number,
		type2: entry[7] as number,
		catchRate: entry[8] as number,
		baseExp: entry[9] as number,
		spriteSize: entry[10] as number,
		frontSprite: (entry[11] as number) | ((entry[12] as number) << 8),
		backSprite: (entry[13] as number) | ((entry[14] as number) << 8),
		level1Moves: [
			entry[15] as number,
			entry[16] as number,
			entry[17] as number,
			entry[18] as number,
		],
		growthRate: entry[19] as number,
		tmhm: Buffer.from(entry.subarray(20, 27)),
		padding: entry[27] as number,
	};
}

/**
 * Reads the base-stats entry for a Pokédex number 1–151.
 * Dex 1–150 come from the linear table at 0x383DE; dex 151 (Mew) comes
 * from its standalone entry at 0x425B.
 */
export function readGen1BaseStats(
	reader: RomReader,
	dexNumber: number,
): Gen1BaseStats {
	if (
		!Number.isInteger(dexNumber) ||
		dexNumber < 1 ||
		dexNumber > GEN1_BASE_STATS_MAX_DEX
	) {
		throw new Gen1StatsError(
			`Invalid Pokédex number ${dexNumber} (must be an integer 1–${GEN1_BASE_STATS_MAX_DEX})`,
		);
	}
	const offset =
		dexNumber <= GEN1_BASE_STATS_LAST_DEX
			? GEN1_BASE_STATS_OFFSET + (dexNumber - 1) * GEN1_BASE_STATS_ENTRY_LENGTH
			: GEN1_MEW_BASE_STATS_OFFSET;
	const entry = reader.slice(offset, GEN1_BASE_STATS_ENTRY_LENGTH);
	return parseEntry(entry, dexNumber);
}
