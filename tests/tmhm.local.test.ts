// Opt-in local integration check: verifies the TM/HM machine table
// and per-species bitfield decoding against real Red/Blue images.
// Requires copyrighted ROM files that are never committed:
//
//   GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
//
// Each variable is optional; unset variables are skipped without failing.
//
// Unlike tests/tmhm.test.ts (synthetic fixtures), this suite reads the
// real structures: the 55-entry machine table at 0x13773 and the 7-byte
// bitfields inside the base-stats entries (offsets 0x14-0x1A) — through
// the committed readGen1TmHmTable / decodeGen1TmHm /
// readGen1TmHmLearnset APIs. See docs/tmhm.md for the evidence.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readGen1BaseStats } from "../src/gen1/Gen1Stats.ts";
import {
	GEN1_HM_COUNT,
	GEN1_TM_COUNT,
	GEN1_TMHM_COUNT,
	GEN1_TMHM_TABLE_OFFSET,
	readGen1TmHmLearnset,
	readGen1TmHmTable,
} from "../src/gen1/Gen1TmHm.ts";
import { RomReader } from "../src/rom/RomReader.ts";

/** Byte-verified 55-entry machine table at file 0x13773 (both ROMs). */
const EXPECTED_TABLE = [
	5, 13, 14, 18, 25, 92, 32, 34, 36, 38, 61, 55, 58, 59, 63, 6, 66, 68, 69, 99,
	72, 76, 82, 85, 87, 89, 90, 91, 94, 100, 102, 104, 115, 117, 118, 120, 121,
	126, 129, 130, 135, 138, 143, 156, 86, 149, 153, 157, 161, 164, 15, 19, 57,
	70, 148,
];

/** Species whose ROM bitfield is all zero (no TM/HM compatibility). */
const EXPECTED_EMPTY_DEX = [10, 11, 13, 14, 129, 132];

const cases = [
	{ envName: "GEN1_ROM_RED", label: "red" },
	{ envName: "GEN1_ROM_BLUE", label: "blue" },
] as const;

for (const { envName, label } of cases) {
	const path = process.env[envName];
	if (path === undefined || path === "") {
		describe(`real ${label} TM/HM learnsets (opt-in)`, () => {
			it(`skipped: set ${envName} to enable`, () => {
				assert.ok(true, "no ROM path configured; skipping");
			});
		});
	} else {
		const romPath: string = path;
		describe(`real ${label} TM/HM learnsets (opt-in)`, () => {
			it("reads the byte-verified 55-entry machine table", () => {
				const reader = new RomReader(readFileSync(romPath));
				assert.deepEqual(readGen1TmHmTable(reader), EXPECTED_TABLE);
				assert.equal(GEN1_TMHM_TABLE_OFFSET, 0x13773);
				assert.equal(GEN1_TMHM_COUNT, 55);
				assert.equal(GEN1_TM_COUNT, 50);
				assert.equal(GEN1_HM_COUNT, 5);
			});

			it("reads all 151 dex entries with move ids in 1-165", () => {
				const reader = new RomReader(readFileSync(romPath));
				const table = readGen1TmHmTable(reader);
				let total = 0;
				const empty: Array<number> = [];
				for (let dex = 1; dex <= 151; dex++) {
					const learnset = readGen1TmHmLearnset(reader, dex);
					total += learnset.length;
					if (learnset.length === 0) {
						empty.push(dex);
					}
					for (const move of learnset) {
						assert.ok(
							Number.isInteger(move) && move >= 1 && move <= 165,
							`dex ${dex} move ${move}`,
						);
					}
					// Slot order: re-deriving from the bitfield agrees.
					const bits = [...readGen1BaseStats(reader, dex).tmhm];
					const expected: Array<number> = [];
					for (let slot = 0; slot < 55; slot++) {
						const byte = bits[slot >> 3] ?? 0;
						const move = table[slot] ?? 0;
						if (byte & (1 << (slot & 7))) {
							expected.push(move);
						}
					}
					assert.deepEqual(learnset, expected, `dex ${dex} order`);
					// Sorted-by-slot implies ascending within TM and HM runs
					// only where the table itself ascends; assert ROM order
					// preservation instead of numeric sorting.
					assert.deepEqual(learnset, expected);
				}
				assert.equal(total, 3037);
				assert.deepEqual(empty, EXPECTED_EMPTY_DEX);
			});

			it("matches ROM-decoded sample learnsets (Mew, Bulbasaur, Pikachu, Rhydon)", () => {
				const reader = new RomReader(readFileSync(romPath));
				// Mew's all-0xFF bitfield teaches every machine move.
				assert.deepEqual(readGen1TmHmLearnset(reader, 151), EXPECTED_TABLE);
				assert.deepEqual(
					readGen1TmHmLearnset(reader, 1),
					[14, 92, 34, 36, 38, 99, 72, 76, 102, 104, 115, 117, 156, 164, 15],
				);
				assert.deepEqual(
					readGen1TmHmLearnset(reader, 25),
					[
						5, 25, 92, 34, 36, 38, 6, 66, 69, 99, 85, 87, 102, 104, 115, 117,
						129, 130, 156, 86, 164, 148,
					],
				);
				assert.deepEqual(
					readGen1TmHmLearnset(reader, 112),
					[
						5, 25, 92, 32, 34, 36, 38, 61, 55, 58, 59, 63, 6, 66, 68, 69, 99,
						85, 87, 89, 90, 91, 102, 104, 117, 126, 130, 156, 157, 164, 57, 70,
					],
				);
				// Ditto teaches nothing.
				assert.deepEqual(readGen1TmHmLearnset(reader, 132), []);
			});
		});
	}
}
