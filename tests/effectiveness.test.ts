import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	GEN1_EFFECTIVENESS_ENTRY_LENGTH,
	GEN1_EFFECTIVENESS_MAX_TYPE_ID,
	GEN1_EFFECTIVENESS_MULTIPLIERS,
	GEN1_EFFECTIVENESS_OBSERVED_COUNT,
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

// A well-formed 82-entry table: the real first entry, then filler
// (FIRE->GRASS x0x14), then sentinel.
function makeFullTable(): Array<number> {
	const bytes = [0x15, 0x14, 0x14];
	for (let i = 1; i < GEN1_EFFECTIVENESS_OBSERVED_COUNT; i++) {
		bytes.push(0x04, 0x16, 0x14);
	}
	bytes.push(GEN1_EFFECTIVENESS_SENTINEL);
	return bytes;
}

describe("effectiveness table", () => {
	it("reads the observed 82 entries until the sentinel in ROM order", () => {
		const reader = makeRomWithEffectiveness(makeFullTable());
		const entries = readGen1EffectivenessTable(reader);
		assert.equal(entries.length, GEN1_EFFECTIVENESS_OBSERVED_COUNT);
		assert.deepEqual(
			{ ...entries[0] },
			{ attacker: 0x15, defender: 0x14, multiplier: 0x14 },
		);
		assert.equal(GEN1_EFFECTIVENESS_TABLE_OFFSET, 0x3e474);
		assert.equal(GEN1_EFFECTIVENESS_ENTRY_LENGTH, 3);
		assert.equal(GEN1_EFFECTIVENESS_SENTINEL, 0xff);
		assert.equal(GEN1_EFFECTIVENESS_MAX_TYPE_ID, 0x1a);
		assert.deepEqual([...GEN1_EFFECTIVENESS_MULTIPLIERS], [0x00, 0x05, 0x14]);
		assert.equal(GEN1_EFFECTIVENESS_OBSERVED_COUNT, 82);
	});

	it("rejects an empty table (sentinel first)", () => {
		const reader = makeRomWithEffectiveness([0xff]);
		assert.throws(
			() => readGen1EffectivenessTable(reader),
			Gen1EffectivenessError,
		);
	});

	it("rejects a table with fewer entries than observed", () => {
		const reader = makeRomWithEffectiveness([0x15, 0x14, 0x14, 0xff]);
		assert.throws(
			() => readGen1EffectivenessTable(reader),
			Gen1EffectivenessError,
		);
	});

	it("rejects a truncated table", () => {
		// Entry claims 3 bytes but the image ends after 2.
		const reader = makeRomWithEffectiveness([0x15, 0x14]);
		assert.throws(() => readGen1EffectivenessTable(reader), Error);
	});

	it("rejects an attacker above the observed id range", () => {
		const bytes = makeFullTable();
		bytes[0] = 0x1b;
		const reader = makeRomWithEffectiveness(bytes);
		assert.throws(
			() => readGen1EffectivenessTable(reader),
			Gen1EffectivenessError,
		);
	});

	it("rejects a defender above the observed id range", () => {
		const bytes = makeFullTable();
		bytes[1] = 0xff;
		const reader = makeRomWithEffectiveness(bytes);
		assert.throws(
			() => readGen1EffectivenessTable(reader),
			Gen1EffectivenessError,
		);
	});

	it("rejects a multiplier outside the observed set", () => {
		const bytes = makeFullTable();
		bytes[2] = 0x0a;
		const reader = makeRomWithEffectiveness(bytes);
		assert.throws(
			() => readGen1EffectivenessTable(reader),
			Gen1EffectivenessError,
		);
	});

	it("rejects a corrupted attacker byte past the observed domain", () => {
		const bytes = makeFullTable();
		bytes[3 * 40] = 0x1b;
		const reader = makeRomWithEffectiveness(bytes);
		assert.throws(
			() => readGen1EffectivenessTable(reader),
			Gen1EffectivenessError,
		);
	});

	it("throws a contextual error past the scan bound", () => {
		// 512 non-sentinel entries and no sentinel: bounded scan.
		const bytes = new Array<number>(512 * 3).fill(0x15);
		const reader = makeRomWithEffectiveness(bytes);
		assert.throws(
			() => readGen1EffectivenessTable(reader),
			Gen1EffectivenessError,
		);
	});
});
