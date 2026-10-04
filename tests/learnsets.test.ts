import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	GEN1_LEARNSET_BANK,
	GEN1_LEARNSET_FIRST_MOVE_ID,
	GEN1_LEARNSET_LAST_MOVE_ID,
	GEN1_LEARNSET_MAX_LEVEL,
	GEN1_LEARNSET_MIN_LEVEL,
	GEN1_LEARNSET_POINTER_TABLE_COUNT,
	GEN1_LEARNSET_POINTER_TABLE_OFFSET,
	GEN1_LEARNSET_SENTINEL,
	Gen1LearnsetError,
	gen1LearnsetEntryOffset,
	readGen1LevelUpLearnset,
	readGen1LevelUpLearnsetByIndex,
} from "../src/gen1/Gen1Learnsets.ts";
import { GEN1_ORDER_TABLE_COUNT } from "../src/gen1/Gen1Order.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Synthetic image: pointer table at the real file offset plus a
// controllable data area placed where bank 0x0E resolution lands
// (file 0x38000 + (pointer - 0x4000)). Only the table and entry bytes
// matter here; no real ROM data is copied.
const DATA_BASE = GEN1_LEARNSET_BANK * 0x4000;
const ROOM = 0x4000;

function makeRom(
	pointers: Map<number, number>,
	entries: Map<number, Array<number>>,
): RomReader {
	const rom = Buffer.alloc(DATA_BASE + ROOM + 16, 0x00);
	for (const [index, pointer] of pointers) {
		rom.writeUInt16LE(pointer, GEN1_LEARNSET_POINTER_TABLE_OFFSET + index * 2);
	}
	for (const [pointer, bytes] of entries) {
		Buffer.from(bytes).copy(rom, DATA_BASE + (pointer - 0x4000));
	}
	return new RomReader(rom);
}

/** Minimal order table so dex 1 resolves to index 5. */
function makeRomWithOrder(
	pointers: Map<number, number>,
	entries: Map<number, Array<number>>,
): RomReader {
	const rom = Buffer.alloc(0x41024 + GEN1_ORDER_TABLE_COUNT + 16, 0x00);
	for (const [index, pointer] of pointers) {
		rom.writeUInt16LE(pointer, GEN1_LEARNSET_POINTER_TABLE_OFFSET + index * 2);
	}
	for (const [pointer, bytes] of entries) {
		Buffer.from(bytes).copy(rom, DATA_BASE + (pointer - 0x4000));
	}
	rom[0x41024 + 5] = 1;
	return new RomReader(rom);
}

describe("learnset pointer table", () => {
	it("resolves an index to its entry through the table's own bank", () => {
		const reader = makeRom(
			new Map([[3, 0x4000]]),
			new Map([[0x4000, [0x00, 0x00]]]),
		);
		assert.equal(gen1LearnsetEntryOffset(reader, 3), DATA_BASE);
		assert.equal(GEN1_LEARNSET_POINTER_TABLE_OFFSET, 0x3b05c);
		assert.equal(GEN1_LEARNSET_BANK, 0x0e);
		assert.equal(GEN1_LEARNSET_POINTER_TABLE_COUNT, GEN1_ORDER_TABLE_COUNT);
	});

	it("rejects a pointer outside the banked window", () => {
		const reader = makeRom(
			new Map([[0, 0x3fff]]),
			new Map([[0x4000, [0x00, 0x00]]]),
		);
		assert.throws(() => gen1LearnsetEntryOffset(reader, 0), Gen1LearnsetError);
	});

	it("rejects out-of-range indexes", () => {
		const reader = makeRom(new Map(), new Map());
		assert.throws(() => gen1LearnsetEntryOffset(reader, -1), Gen1LearnsetError);
		assert.throws(
			() => gen1LearnsetEntryOffset(reader, GEN1_LEARNSET_POINTER_TABLE_COUNT),
			Gen1LearnsetError,
		);
		assert.throws(
			() => gen1LearnsetEntryOffset(reader, 1.5),
			Gen1LearnsetError,
		);
	});
});

describe("level-up learnset entries", () => {
	it("reads pairs in ROM order after skipping evolutions", () => {
		// Evo record type 1 (3 bytes) then two pairs then terminator.
		const reader = makeRom(
			new Map([[0, 0x4000]]),
			new Map([
				[0x4000, [0x01, 0x10, 0x09, 0x00, 0x07, 0x49, 0x0d, 0x16, 0x00]],
			]),
		);
		assert.deepEqual(readGen1LevelUpLearnsetByIndex(reader, 0), [
			{ level: 7, move: 0x49 },
			{ level: 13, move: 0x16 },
		]);
	});

	it("skips type-2 (4-byte) and type-3 (3-byte) evolution records", () => {
		const reader = makeRom(
			new Map([[1, 0x4100]]),
			new Map([
				[
					0x4100,
					[0x02, 0x20, 0x01, 0x67, 0x03, 0x01, 0x95, 0x00, 0x09, 0x56, 0x00],
				],
			]),
		);
		assert.deepEqual(readGen1LevelUpLearnsetByIndex(reader, 1), [
			{ level: 9, move: 0x56 },
		]);
	});

	it("returns [] for an empty learnset (double terminator)", () => {
		const reader = makeRom(
			new Map([[2, 0x4200]]),
			new Map([[0x4200, [0x00, 0x00]]]),
		);
		assert.deepEqual(readGen1LevelUpLearnsetByIndex(reader, 2), []);
	});

	it("rejects an unknown evolution type", () => {
		const reader = makeRom(
			new Map([[0, 0x4000]]),
			new Map([[0x4000, [0x09, 0x01, 0x02, 0x00, 0x07, 0x49, 0x00]]]),
		);
		assert.throws(
			() => readGen1LevelUpLearnsetByIndex(reader, 0),
			Gen1LearnsetError,
		);
	});

	it("rejects a missing evolution terminator", () => {
		const bytes = new Array<number>(600).fill(0x01);
		const reader = makeRom(new Map([[0, 0x4000]]), new Map([[0x4000, bytes]]));
		assert.throws(
			() => readGen1LevelUpLearnsetByIndex(reader, 0),
			Gen1LearnsetError,
		);
	});

	it("rejects a missing learnset terminator", () => {
		const bytes = [0x00];
		for (let level = 1; level <= 250; level++) {
			bytes.push(level & 0xff, 0x01);
		}
		const reader = makeRom(new Map([[0, 0x4000]]), new Map([[0x4000, bytes]]));
		assert.throws(
			() => readGen1LevelUpLearnsetByIndex(reader, 0),
			Gen1LearnsetError,
		);
	});

	it("rejects level 0 (sentinel), level above 100, and unordered levels", () => {
		const terminator: Array<number> = [0x00];
		const levelZero = makeRom(
			new Map([[0, 0x4000]]),
			new Map([[0x4000, [...terminator, 0x07, 0x49, 0x00]]]),
		);
		// levelZero has a valid list; the bad cases below each throw.
		assert.deepEqual(readGen1LevelUpLearnsetByIndex(levelZero, 0), [
			{ level: 7, move: 0x49 },
		]);
		const badLevel = makeRom(
			new Map([[0, 0x4000]]),
			new Map([[0x4000, [0x00, 0x65, 0x01, 0x00]]]),
		);
		assert.throws(
			() => readGen1LevelUpLearnsetByIndex(badLevel, 0),
			Gen1LearnsetError,
		);
		assert.equal(GEN1_LEARNSET_MIN_LEVEL, 1);
		assert.equal(GEN1_LEARNSET_MAX_LEVEL, 100);
		const unordered = makeRom(
			new Map([[0, 0x4000]]),
			new Map([[0x4000, [0x00, 0x0d, 0x16, 0x07, 0x49, 0x00]]]),
		);
		assert.throws(
			() => readGen1LevelUpLearnsetByIndex(unordered, 0),
			Gen1LearnsetError,
		);
	});

	it("rejects move ids 0 and 166", () => {
		const moveZero = makeRom(
			new Map([[0, 0x4000]]),
			new Map([[0x4000, [0x00, 0x07, 0x00, 0x00]]]),
		);
		assert.throws(
			() => readGen1LevelUpLearnsetByIndex(moveZero, 0),
			Gen1LearnsetError,
		);
		const moveHigh = makeRom(
			new Map([[0, 0x4000]]),
			new Map([[0x4000, [0x00, 0x07, 0xa6, 0x00]]]),
		);
		assert.throws(
			() => readGen1LevelUpLearnsetByIndex(moveHigh, 0),
			Gen1LearnsetError,
		);
		assert.equal(GEN1_LEARNSET_FIRST_MOVE_ID, 1);
		assert.equal(GEN1_LEARNSET_LAST_MOVE_ID, 165);
		assert.equal(GEN1_LEARNSET_SENTINEL, 0x00);
	});

	it("rejects a truncated entry", () => {
		const reader = new RomReader(
			Buffer.alloc(GEN1_LEARNSET_POINTER_TABLE_OFFSET + 2, 0x00),
		);
		assert.throws(() => readGen1LevelUpLearnsetByIndex(reader, 0), Error);
	});
});

describe("dex-keyed learnset reads", () => {
	it("resolves dex numbers through the order table", () => {
		const reader = makeRomWithOrder(
			new Map([[5, 0x4000]]),
			new Map([[0x4000, [0x00, 0x09, 0x56, 0x00]]]),
		);
		assert.deepEqual(readGen1LevelUpLearnset(reader, 1), [
			{ level: 9, move: 0x56 },
		]);
	});

	it("rejects dex numbers outside 1–151", () => {
		const reader = makeRomWithOrder(new Map(), new Map());
		assert.throws(() => readGen1LevelUpLearnset(reader, 0), Gen1LearnsetError);
		assert.throws(
			() => readGen1LevelUpLearnset(reader, 152),
			Gen1LearnsetError,
		);
		assert.throws(
			() => readGen1LevelUpLearnset(reader, 1.5),
			Gen1LearnsetError,
		);
	});
});
