import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	GEN1_MOVE_ENTRY_LENGTH,
	GEN1_MOVE_FIRST_ID,
	GEN1_MOVE_LAST_ID,
	GEN1_MOVE_TABLE_COUNT,
	GEN1_MOVE_TABLE_OFFSET,
	Gen1MoveError,
	readGen1MoveData,
} from "../src/gen1/Gen1Moves.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Synthetic image: move table at the real file offset with controllable
// entries. Only the table bytes matter here.
function makeRomWithMoves(entries: Array<Array<number>>): RomReader {
	const rom = Buffer.alloc(
		GEN1_MOVE_TABLE_OFFSET +
			GEN1_MOVE_TABLE_COUNT * GEN1_MOVE_ENTRY_LENGTH +
			16,
		0x00,
	);
	entries.forEach((entry, k) => {
		Buffer.from(entry).copy(
			rom,
			GEN1_MOVE_TABLE_OFFSET + k * GEN1_MOVE_ENTRY_LENGTH,
		);
	});
	return new RomReader(rom);
}

describe("move data table", () => {
	it("reads fields of an entry by move id", () => {
		// POUND: bytes observed at 0x38000 in both ROMs.
		const reader = makeRomWithMoves([[0x01, 0x00, 0x28, 0x00, 0xff, 0x23]]);
		const move = readGen1MoveData(reader, 1);
		assert.equal(move.animationId, 1);
		assert.equal(move.effect, 0x00);
		assert.equal(move.power, 0x28);
		assert.equal(move.type, 0x00);
		assert.equal(move.accuracy, 0xff);
		assert.equal(move.pp, 0x23);
		assert.equal(GEN1_MOVE_TABLE_OFFSET, 0x38000);
		assert.equal(GEN1_MOVE_ENTRY_LENGTH, 6);
		assert.equal(GEN1_MOVE_TABLE_COUNT, 165);
	});

	it("reads a later entry by stride, not the table start", () => {
		// KARATE CHOP then DOUBLESLAP: bytes observed in both ROMs.
		const reader = makeRomWithMoves([
			[0x01, 0x00, 0x28, 0x00, 0xff, 0x23],
			[0x02, 0x00, 0x32, 0x00, 0xff, 0x19],
			[0x03, 0x1d, 0x0f, 0x00, 0xd8, 0x0a],
		]);
		const move = readGen1MoveData(reader, 3);
		assert.equal(move.animationId, 3);
		assert.equal(move.effect, 0x1d);
		assert.equal(move.power, 0x0f);
		assert.equal(move.accuracy, 0xd8);
		assert.equal(move.pp, 0x0a);
	});

	it("rejects a stored id that does not match the requested id", () => {
		const reader = makeRomWithMoves([[0x02, 0x00, 0x28, 0x00, 0xff, 0x23]]);
		assert.throws(() => readGen1MoveData(reader, 1), Gen1MoveError);
	});

	it("rejects ids 0 and 166 and non-integers", () => {
		const reader = makeRomWithMoves([[0x01, 0x00, 0x28, 0x00, 0xff, 0x23]]);
		assert.throws(() => readGen1MoveData(reader, 0), Gen1MoveError);
		assert.throws(
			() => readGen1MoveData(reader, GEN1_MOVE_LAST_ID + 1),
			Gen1MoveError,
		);
		assert.throws(() => readGen1MoveData(reader, 1.5), Gen1MoveError);
		assert.throws(() => readGen1MoveData(reader, -1), Gen1MoveError);
		assert.equal(GEN1_MOVE_FIRST_ID, 1);
		assert.equal(GEN1_MOVE_LAST_ID, 165);
	});

	it("rejects a truncated table", () => {
		const reader = new RomReader(
			Buffer.alloc(GEN1_MOVE_TABLE_OFFSET + 2, 0x00),
		);
		assert.throws(() => readGen1MoveData(reader, 1), Error);
	});
});
