import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	GEN1_MOVE_NAME_MAX_LENGTH,
	GEN1_MOVE_NAME_MIN_LENGTH,
	GEN1_MOVE_NAMES_COUNT,
	GEN1_MOVE_NAMES_OFFSET,
	Gen1MoveNameError,
	readAllGen1MoveNameEntries,
	readGen1MoveNameEntry,
} from "../src/gen1/Gen1MoveNames.ts";
import { decodeGen1MoveName } from "../src/gen1/Gen1Text.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Synthetic image: move-name strings at the real file offset. Only the
// list bytes matter here.
function makeRomWithMoveNames(lists: Array<Array<number>>): RomReader {
	const size = GEN1_MOVE_NAMES_OFFSET + lists.flat().length + 16;
	const rom = Buffer.alloc(size, 0xaa);
	Buffer.from(lists.flat()).copy(rom, GEN1_MOVE_NAMES_OFFSET);
	return new RomReader(rom);
}

function encodeName(text: string): Array<number> {
	return [...text].map((ch) =>
		ch === " " ? 0x7f : ch === "-" ? 0xe3 : ch.charCodeAt(0) - 0x41 + 0x80,
	);
}

describe("move name list", () => {
	it("reads entries sequentially by move id", () => {
		const reader = makeRomWithMoveNames([
			[...encodeName("POUND"), 0x50],
			[...encodeName("KARATE CHOP"), 0x50],
			[...encodeName("SAND-ATTACK"), 0x50],
		]);
		assert.deepEqual(
			[...readGen1MoveNameEntry(reader, 1)],
			encodeName("POUND"),
		);
		assert.equal(
			decodeGen1MoveName([...readGen1MoveNameEntry(reader, 2)]),
			"KARATE CHOP",
		);
		assert.equal(
			decodeGen1MoveName([...readGen1MoveNameEntry(reader, 3)]),
			"SAND-ATTACK",
		);
		assert.equal(GEN1_MOVE_NAMES_OFFSET, 0xb0000);
		assert.equal(GEN1_MOVE_NAMES_COUNT, 165);
	});

	it("reads all entries without going past the last terminator", () => {
		const reader = makeRomWithMoveNames([
			[...encodeName("POUND"), 0x50],
			[...encodeName("CUT"), 0x50],
			0xaa,
			0xaa,
		]);
		// Build a 165-entry list on the fly for the full walk.
		const full: Array<number> = [];
		for (let id = 1; id <= GEN1_MOVE_NAMES_COUNT; id++) {
			full.push(...encodeName("CUT"), 0x50);
		}
		full.push(0xbb, 0xcc);
		const fullReader = makeRomWithMoveNames([full]);
		const entries = readAllGen1MoveNameEntries(fullReader);
		assert.equal(entries.length, GEN1_MOVE_NAMES_COUNT);
		for (const entry of entries) {
			assert.equal(decodeGen1MoveName([...entry]), "CUT");
		}
		assert.deepEqual([...readGen1MoveNameEntry(reader, 2)], encodeName("CUT"));
	});

	it("rejects names shorter than 3 or longer than 12 content bytes", () => {
		const short = makeRomWithMoveNames([
			[0x80, 0x81, 0x50, ...encodeName("CUT"), 0x50],
		]);
		assert.throws(() => readGen1MoveNameEntry(short, 1), Gen1MoveNameError);
		const long = makeRomWithMoveNames([
			[...encodeName("CUT"), 0x50, ...new Array(13).fill(0x80), 0x50],
		]);
		assert.throws(() => readGen1MoveNameEntry(long, 2), Gen1MoveNameError);
	});

	it("rejects a missing terminator instead of scanning on", () => {
		const reader = makeRomWithMoveNames([[...new Array(13).fill(0x80), 0x50]]);
		assert.throws(() => readGen1MoveNameEntry(reader, 1), Gen1MoveNameError);
	});

	it("rejects ids 0 and 166 and non-integers", () => {
		const reader = makeRomWithMoveNames([[...encodeName("POUND"), 0x50]]);
		assert.throws(() => readGen1MoveNameEntry(reader, 0), Gen1MoveNameError);
		assert.throws(
			() => readGen1MoveNameEntry(reader, GEN1_MOVE_NAMES_COUNT + 1),
			Gen1MoveNameError,
		);
		assert.throws(() => readGen1MoveNameEntry(reader, 1.5), Gen1MoveNameError);
		assert.equal(GEN1_MOVE_NAME_MIN_LENGTH, 3);
		assert.equal(GEN1_MOVE_NAME_MAX_LENGTH, 12);
	});
});
