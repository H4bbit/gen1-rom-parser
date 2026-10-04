// Opt-in local integration check: verifies the level-up learnset
// table against real Red/Blue images. Requires copyrighted ROM files
// that are never committed:
//
//   GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
//
// Each variable is optional; unset variables are skipped without failing.
//
// Unlike tests/learnsets.test.ts (synthetic fixtures), this suite reads
// the real structures: the 190-entry pointer table at 0x3B05C with its
// entries in bank 0x0E — through the committed
// readGen1LevelUpLearnset / readGen1LevelUpLearnsetByIndex APIs. Dex
// numbers resolve through the order table, so all 151 species are
// covered, including the 12 species whose ROM learnset is truly empty.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	GEN1_LEARNSET_BANK,
	GEN1_LEARNSET_FIRST_MOVE_ID,
	GEN1_LEARNSET_LAST_MOVE_ID,
	GEN1_LEARNSET_MAX_LEVEL,
	GEN1_LEARNSET_MIN_LEVEL,
	GEN1_LEARNSET_POINTER_TABLE_COUNT,
	GEN1_LEARNSET_POINTER_TABLE_OFFSET,
	gen1LearnsetEntryOffset,
	readGen1LevelUpLearnset,
	readGen1LevelUpLearnsetByIndex,
} from "../src/gen1/Gen1Learnsets.ts";
import {
	findGen1IndexByDex,
	GEN1_ORDER_TABLE_OFFSET,
} from "../src/gen1/Gen1Order.ts";
import { RomReader } from "../src/rom/RomReader.ts";

/** Species whose ROM learnset is empty (double-0x00 entry, both ROMs). */
const EXPECTED_EMPTY_DEX = [10, 11, 13, 14, 26, 36, 38, 40, 59, 63, 121, 132];

/** Longest learnset observed in the dumped ROMs (TENTACOOL). */
const EXPECTED_LONGEST_DEX = 72;
const EXPECTED_LONGEST_LENGTH = 8;

const cases = [
	{ envName: "GEN1_ROM_RED", label: "red" },
	{ envName: "GEN1_ROM_BLUE", label: "blue" },
] as const;

for (const { envName, label } of cases) {
	const path = process.env[envName];
	if (path === undefined || path === "") {
		describe(`real ${label} learnsets (opt-in)`, () => {
			it(`skipped: set ${envName} to enable`, () => {
				assert.ok(true, "no ROM path configured; skipping");
			});
		});
	} else {
		const romPath: string = path;
		describe(`real ${label} learnsets (opt-in)`, () => {
			it("reads all 151 dex entries with levels and moves in range", () => {
				const reader = new RomReader(readFileSync(romPath));
				let total = 0;
				const empty: Array<number> = [];
				for (let dex = 1; dex <= 151; dex++) {
					const learnset = readGen1LevelUpLearnset(reader, dex);
					total += learnset.length;
					if (learnset.length === 0) {
						empty.push(dex);
					}
					let previous = -1;
					for (const { level, move } of learnset) {
						assert.ok(
							level >= GEN1_LEARNSET_MIN_LEVEL &&
								level <= GEN1_LEARNSET_MAX_LEVEL,
							`dex ${dex} level ${level}`,
						);
						assert.ok(
							move >= GEN1_LEARNSET_FIRST_MOVE_ID &&
								move <= GEN1_LEARNSET_LAST_MOVE_ID,
							`dex ${dex} move ${move}`,
						);
						assert.ok(level > previous, `dex ${dex} unordered level ${level}`);
						previous = level;
					}
					// By-index read agrees with the dex-keyed read.
					assert.deepEqual(
						readGen1LevelUpLearnsetByIndex(
							reader,
							findGen1IndexByDex(reader, dex),
						),
						[...learnset],
					);
				}
				assert.equal(total, 728);
				assert.deepEqual(empty, EXPECTED_EMPTY_DEX);
				assert.equal(GEN1_LEARNSET_POINTER_TABLE_OFFSET, 0x3b05c);
				assert.equal(GEN1_LEARNSET_POINTER_TABLE_COUNT, 190);
				assert.equal(GEN1_LEARNSET_BANK, 0x0e);
			});

			it("matches ROM-decoded sample learnsets (Pikachu, Bulbasaur, Mew, Tentacool)", () => {
				const reader = new RomReader(readFileSync(romPath));
				assert.deepEqual(readGen1LevelUpLearnset(reader, 25), [
					{ level: 9, move: 86 },
					{ level: 16, move: 98 },
					{ level: 26, move: 129 },
					{ level: 33, move: 97 },
					{ level: 43, move: 87 },
				]);
				assert.deepEqual(readGen1LevelUpLearnset(reader, 1), [
					{ level: 7, move: 73 },
					{ level: 13, move: 22 },
					{ level: 20, move: 77 },
					{ level: 27, move: 75 },
					{ level: 34, move: 74 },
					{ level: 41, move: 79 },
					{ level: 48, move: 76 },
				]);
				assert.deepEqual(readGen1LevelUpLearnset(reader, 151), [
					{ level: 10, move: 144 },
					{ level: 20, move: 5 },
					{ level: 30, move: 118 },
					{ level: 40, move: 94 },
				]);
				assert.deepEqual(
					readGen1LevelUpLearnset(reader, EXPECTED_LONGEST_DEX),
					[
						{ level: 7, move: 48 },
						{ level: 13, move: 35 },
						{ level: 18, move: 40 },
						{ level: 22, move: 55 },
						{ level: 27, move: 132 },
						{ level: 33, move: 112 },
						{ level: 40, move: 103 },
						{ level: 48, move: 56 },
					],
				);
				assert.equal(
					readGen1LevelUpLearnset(reader, EXPECTED_LONGEST_DEX).length,
					EXPECTED_LONGEST_LENGTH,
				);
			});

			it("chains all 190 entries gaplessly from 0x3B1D8 to 0x3B9EC", () => {
				const reader = new RomReader(readFileSync(romPath));
				assert.equal(gen1LearnsetEntryOffset(reader, 0), 0x3b1d8);
				for (
					let index = 0;
					index < GEN1_LEARNSET_POINTER_TABLE_COUNT;
					index++
				) {
					const start = gen1LearnsetEntryOffset(reader, index);
					const learnset = readGen1LevelUpLearnsetByIndex(reader, index);
					// Re-derive the entry end: skip evolutions the same way
					// the parser does, then account for the learnset bytes.
					let offset = start;
					for (;;) {
						const kind = reader.byteAt(offset);
						if (kind === 0x00) {
							offset += 1;
							break;
						}
						offset += kind === 2 ? 4 : 3;
					}
					offset += learnset.length * 2 + 1;
					if (index + 1 < GEN1_LEARNSET_POINTER_TABLE_COUNT) {
						assert.equal(
							offset,
							gen1LearnsetEntryOffset(reader, index + 1),
							`entry ${index} end`,
						);
					} else {
						assert.equal(offset, 0x3b9ec);
					}
					// Every pointer stays in the banked window.
					const pointer = reader.readUInt16LE(
						GEN1_LEARNSET_POINTER_TABLE_OFFSET + index * 2,
					);
					assert.ok(pointer >= 0x4000 && pointer < 0x8000);
				}
				// The glitch slots (order value 0) are all empty.
				for (
					let index = 0;
					index < GEN1_LEARNSET_POINTER_TABLE_COUNT;
					index++
				) {
					if (reader.byteAt(GEN1_ORDER_TABLE_OFFSET + index) === 0) {
						assert.deepEqual(readGen1LevelUpLearnsetByIndex(reader, index), []);
					}
				}
			});
		});
	}
}
