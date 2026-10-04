import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	GEN1_EFFECTIVENESS_ENTRY_LENGTH,
	GEN1_EFFECTIVENESS_MAX_ENTRIES,
	GEN1_EFFECTIVENESS_SENTINEL,
	GEN1_EFFECTIVENESS_TABLE_OFFSET,
	Gen1EffectivenessError,
	readGen1EffectivenessTable,
} from "../src/gen1/Gen1Effectiveness.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Synthetic image: effectiveness table at the real file offset with
// controllable bytes. Only the table bytes matter here.
function makeRomWithEffectiveness(bytes: Array<number>): RomReader {
	const rom = Buffer.alloc(
		GEN1_EFFECTIVENESS_TABLE_OFFSET + bytes.length,
		0x00,
	);
	Buffer.from(bytes).copy(rom, GEN1_EFFECTIVENESS_TABLE_OFFSET);
	return new RomReader(rom);
}

describe("effectiveness table", () => {
	it("reads entries until the sentinel in ROM order", () => {
		// First two real entries (WATER->FIRE x0x14, FIRE->GRASS x0x14).
		const reader = makeRomWithEffectiveness([
			0x15, 0x14, 0x14, 0x04, 0x16, 0x14, 0xff,
		]);
		const entries = readGen1EffectivenessTable(reader);
		assert.equal(entries.length, 2);
		assert.deepEqual(
			{ ...entries[0] },
			{ attacker: 0x15, defender: 0x14, multiplier: 0x14 },
		);
		assert.deepEqual(
			{ ...entries[1] },
			{ attacker: 0x04, defender: 0x16, multiplier: 0x14 },
		);
		assert.equal(GEN1_EFFECTIVENESS_TABLE_OFFSET, 0x3e474);
		assert.equal(GEN1_EFFECTIVENESS_ENTRY_LENGTH, 3);
		assert.equal(GEN1_EFFECTIVENESS_SENTINEL, 0xff);
	});

	it("returns an empty table when the sentinel is first", () => {
		const reader = makeRomWithEffectiveness([0xff]);
		assert.deepEqual(readGen1EffectivenessTable(reader), []);
	});

	it("rejects a truncated table", () => {
		// Entry claims 3 bytes but the image ends after 2.
		const reader = makeRomWithEffectiveness([0x15, 0x14]);
		assert.throws(() => readGen1EffectivenessTable(reader), Error);
	});

	it("does not mistake a sentinel in defender position for the end", () => {
		// Attacker 0x15 then defender 0xFF: still a data entry.
		const reader = makeRomWithEffectiveness([0x15, 0xff, 0x14, 0xff]);
		const entries = readGen1EffectivenessTable(reader);
		assert.equal(entries.length, 1);
		assert.deepEqual(
			{ ...entries[0] },
			{ attacker: 0x15, defender: 0xff, multiplier: 0x14 },
		);
	});

	it("throws a contextual error past the scan bound", () => {
		// MAX_ENTRIES non-sentinel entries and no sentinel: bounded scan.
		const bytes = new Array<number>(
			GEN1_EFFECTIVENESS_MAX_ENTRIES * GEN1_EFFECTIVENESS_ENTRY_LENGTH,
		).fill(0x15);
		const reader = makeRomWithEffectiveness(bytes);
		assert.throws(
			() => readGen1EffectivenessTable(reader),
			Gen1EffectivenessError,
		);
	});
});
