// Opt-in local integration check: verifies the move data table and the
// move-name list against real Red/Blue images. Requires copyrighted ROM
// files that are never committed:
//
//   GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
//
// Each variable is optional; unset variables are skipped without failing.
//
// Unlike tests/moves.test.ts and tests/move-names.test.ts (synthetic
// fixtures), this suite reads the real tables: the 165-entry data table
// at 0x38000 and the 165 move-name strings from 0xB0000 — through the
// committed readGen1MoveData / readGen1MoveNameEntry APIs.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	GEN1_MOVE_NAME_MAX_LENGTH,
	GEN1_MOVE_NAME_MIN_LENGTH,
	GEN1_MOVE_NAMES_COUNT,
	readAllGen1MoveNameEntries,
	readGen1MoveNameEntry,
} from "../src/gen1/Gen1MoveNames.ts";
import {
	GEN1_MOVE_ENTRY_LENGTH,
	GEN1_MOVE_LAST_ID,
	GEN1_MOVE_TABLE_COUNT,
	GEN1_MOVE_TABLE_OFFSET,
	readGen1MoveData,
} from "../src/gen1/Gen1Moves.ts";
import { decodeGen1MoveName } from "../src/gen1/Gen1Text.ts";
import { RomReader } from "../src/rom/RomReader.ts";

/** Accuracy values observed across all 165 entries in both ROMs. */
const OBSERVED_ACCURACY = new Set([
	0x4c, 0x8c, 0x99, 0xa5, 0xb2, 0xbf, 0xcc, 0xd8, 0xe5, 0xf2, 0xff,
]);

/** Type values observed in the move table; equal to the base-stats type domain. */
const OBSERVED_TYPES = new Set([
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x14, 0x15, 0x16, 0x17, 0x18,
	0x19, 0x1a,
]);

const cases = [
	{ envName: "GEN1_ROM_RED", label: "red" },
	{ envName: "GEN1_ROM_BLUE", label: "blue" },
] as const;

for (const { envName, label } of cases) {
	const path = process.env[envName];
	if (path === undefined || path === "") {
		describe(`real ${label} moves (opt-in)`, () => {
			it(`skipped: set ${envName} to enable`, () => {
				assert.ok(true, "no ROM path configured; skipping");
			});
		});
	} else {
		const romPath: string = path;
		describe(`real ${label} moves (opt-in)`, () => {
			it("holds sequential ids 1–165 with valid column domains", () => {
				const reader = new RomReader(readFileSync(romPath));
				for (let id = 1; id <= GEN1_MOVE_LAST_ID; id++) {
					const move = readGen1MoveData(reader, id);
					assert.equal(move.animationId, id);
					assert.ok(
						OBSERVED_ACCURACY.has(move.accuracy),
						`move ${id} accuracy 0x${move.accuracy.toString(16)}`,
					);
					assert.ok(
						Number.isInteger(move.pp) &&
							move.pp >= 5 &&
							move.pp <= 40 &&
							move.pp % 5 === 0,
						`move ${id} pp ${move.pp}`,
					);
					assert.ok(
						OBSERVED_TYPES.has(move.type),
						`move ${id} type 0x${move.type.toString(16)}`,
					);
				}
				assert.equal(GEN1_MOVE_TABLE_OFFSET, 0x38000);
				assert.equal(GEN1_MOVE_ENTRY_LENGTH, 6);
				assert.equal(GEN1_MOVE_TABLE_COUNT, 165);
			});

			it("matches canonical entries read from the ROM", () => {
				const reader = new RomReader(readFileSync(romPath));
				assert.deepEqual(
					{ ...readGen1MoveData(reader, 1) },
					{
						animationId: 1,
						effect: 0x00,
						power: 0x28,
						type: 0x00,
						accuracy: 0xff,
						pp: 0x23,
					},
				);
				assert.deepEqual(
					{ ...readGen1MoveData(reader, 33) },
					{
						animationId: 33,
						effect: 0x00,
						power: 0x23,
						type: 0x00,
						accuracy: 0xf2,
						pp: 0x23,
					},
				);
				assert.deepEqual(
					{ ...readGen1MoveData(reader, 165) },
					{
						animationId: 165,
						effect: 0x30,
						power: 0x32,
						type: 0x00,
						accuracy: 0xff,
						pp: 0x0a,
					},
				);
			});

			it("ends the move table exactly where base stats begin", () => {
				const reader = new RomReader(readFileSync(romPath));
				const last = readGen1MoveData(reader, GEN1_MOVE_LAST_ID);
				assert.equal(last.animationId, GEN1_MOVE_LAST_ID);
				// 0x38000 + 165 × 6 = 0x383DE: the base-stats table start.
				assert.equal(
					GEN1_MOVE_TABLE_OFFSET +
						GEN1_MOVE_TABLE_COUNT * GEN1_MOVE_ENTRY_LENGTH,
					0x383de,
				);
			});

			it("decodes all 165 move names, 3–12 characters each", () => {
				const reader = new RomReader(readFileSync(romPath));
				const entries = readAllGen1MoveNameEntries(reader);
				assert.equal(entries.length, GEN1_MOVE_NAMES_COUNT);
				const names = entries.map((entry) => decodeGen1MoveName([...entry]));
				for (const [k, name] of names.entries()) {
					assert.ok(
						name.length >= GEN1_MOVE_NAME_MIN_LENGTH &&
							name.length <= GEN1_MOVE_NAME_MAX_LENGTH,
						`move ${k + 1} name ${JSON.stringify(name)}`,
					);
				}
				assert.equal(names[0], "POUND");
				assert.equal(names[1], "KARATE CHOP");
				assert.equal(names[27], "SAND-ATTACK");
				assert.equal(names[37], "DOUBLE-EDGE");
				assert.equal(names[164], "STRUGGLE");
				// Sequential reader agrees with the bulk reader.
				assert.equal(
					decodeGen1MoveName([...readGen1MoveNameEntry(reader, 165)]),
					"STRUGGLE",
				);
			});
		});
	}
}
