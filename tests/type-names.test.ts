import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	decodeGen1MoveName,
	decodeGen1Name,
	decodeGen1TypeName,
	Gen1TextError,
} from "../src/gen1/Gen1Text.ts";
import {
	GEN1_TYPE_LAST_ID,
	GEN1_TYPE_NAME_MAX_LENGTH,
	GEN1_TYPE_NAME_MIN_LENGTH,
	GEN1_TYPE_NAMES_POINTER_COUNT,
	GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET,
	GEN1_TYPE_NAMES_REGION_END,
	GEN1_TYPE_NAMES_REGION_START,
	Gen1TypeNameError,
	readAllGen1TypeNameEntries,
	readGen1TypeNameEntry,
} from "../src/gen1/Gen1TypeNames.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Synthetic image: pointer table at the real file offset with
// controllable pointers, strings in a synthetic region. The reader
// resolves each pointer within the table's own bank.
const TABLE_BANK = Math.floor(GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET / 0x4000);

function makeRomWithTypePointers(
	pointers: Array<number>,
	strings: Array<{ offset: number; bytes: Array<number> }>,
): RomReader {
	const size = 0x4000 * (TABLE_BANK + 1) + 0x400;
	const rom = Buffer.alloc(size, 0x00);
	pointers.forEach((pointer, i) => {
		rom.writeUInt16LE(pointer, GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET + i * 2);
	});
	for (const entry of strings) {
		Buffer.from(entry.bytes).copy(rom, entry.offset);
	}
	return new RomReader(rom);
}

function stringOffsetFor(pointer: number): number {
	return TABLE_BANK * 0x4000 + (pointer - 0x4000);
}

// Pointers resolving to NORMAL (0x7DE4) and FIRE (0x7E02) in the real
// layout; strings placed at the matching file offsets.
function makeRomWithNormalAndFire(): RomReader {
	const pointers = new Array<number>(GEN1_TYPE_NAMES_POINTER_COUNT).fill(
		0x7de4,
	);
	pointers[0x14] = 0x7e02;
	return makeRomWithTypePointers(pointers, [
		{
			offset: stringOffsetFor(0x7de4),
			bytes: [0x8d, 0x8e, 0x91, 0x8c, 0x80, 0x8b, 0x50],
		},
		{
			// Preceding terminator so FIRE starts a string, as in the ROM.
			offset: stringOffsetFor(0x7e02) - 1,
			bytes: [0x50],
		},
		{
			offset: stringOffsetFor(0x7e02),
			bytes: [0x85, 0x88, 0x91, 0x84, 0x50],
		},
	]);
}

describe("type-name pointer table", () => {
	it("reads entries through the pointer table in the table's own bank", () => {
		const reader = makeRomWithNormalAndFire();
		assert.deepEqual(
			[...readGen1TypeNameEntry(reader, 0x00)],
			[0x8d, 0x8e, 0x91, 0x8c, 0x80, 0x8b],
		);
		assert.deepEqual(
			[...readGen1TypeNameEntry(reader, 0x14)],
			[0x85, 0x88, 0x91, 0x84],
		);
		assert.equal(
			decodeGen1TypeName([...readGen1TypeNameEntry(reader, 0x00)]),
			"NORMAL",
		);
		assert.equal(
			decodeGen1TypeName([...readGen1TypeNameEntry(reader, 0x14)]),
			"FIRE",
		);
		assert.equal(GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET, 0x27dae);
		assert.equal(GEN1_TYPE_NAMES_POINTER_COUNT, 27);
		assert.equal(GEN1_TYPE_LAST_ID, 0x1a);
		assert.equal(GEN1_TYPE_NAMES_REGION_START, 0x27de4);
		assert.equal(GEN1_TYPE_NAMES_REGION_END, 0x27e4a);
		assert.equal(GEN1_TYPE_NAME_MIN_LENGTH, 3);
		assert.equal(GEN1_TYPE_NAME_MAX_LENGTH, 8);
	});

	it("resolves aliased ids to the same target as separate copies", () => {
		const reader = makeRomWithTypePointers(
			[0x7de4, 0x7de4],
			[
				{
					offset: stringOffsetFor(0x7de4),
					bytes: [0x8d, 0x8e, 0x91, 0x8c, 0x80, 0x8b, 0x50],
				},
			],
		);
		const first = readGen1TypeNameEntry(reader, 0x00);
		const alias = readGen1TypeNameEntry(reader, 0x01);
		assert.deepEqual([...alias], [...first]);
		assert.notEqual(alias, first);
	});

	it("rejects a pointer outside the observed name region", () => {
		const reader = makeRomWithTypePointers(
			[0x4000],
			[{ offset: stringOffsetFor(0x4000), bytes: [0x8d, 0x50] }],
		);
		assert.throws(() => readGen1TypeNameEntry(reader, 0x00), Gen1TypeNameError);
	});

	it("rejects a pointer into the middle of a string", () => {
		// Pointer targets the second byte of NORMAL instead of its start.
		const reader = makeRomWithTypePointers(
			[0x7de5],
			[
				{
					offset: stringOffsetFor(0x7de4),
					bytes: [0x8d, 0x8e, 0x91, 0x8c, 0x80, 0x8b, 0x50],
				},
			],
		);
		assert.throws(() => readGen1TypeNameEntry(reader, 0x00), Gen1TypeNameError);
	});

	it("rejects a missing terminator", () => {
		const reader = makeRomWithTypePointers(
			[0x7de4],
			[
				{
					offset: stringOffsetFor(0x7de4),
					bytes: [0x8d, 0x8e, 0x91, 0x8c, 0x80, 0x8b, 0x80, 0x80, 0x80],
				},
			],
		);
		assert.throws(() => readGen1TypeNameEntry(reader, 0x00), Gen1TypeNameError);
	});

	it("rejects a corrupted byte that breaks the terminator", () => {
		// 0x50 replaced by 0x00: no terminator within range.
		const reader = makeRomWithTypePointers(
			[0x7de4],
			[
				{
					offset: stringOffsetFor(0x7de4),
					bytes: [0x8d, 0x8e, 0x91, 0x8c, 0x80, 0x8b, 0x00],
				},
			],
		);
		assert.throws(() => readGen1TypeNameEntry(reader, 0x00), Gen1TypeNameError);
	});

	it("rejects out-of-range type ids", () => {
		const reader = makeRomWithNormalAndFire();
		assert.throws(() => readGen1TypeNameEntry(reader, -1), Gen1TypeNameError);
		assert.throws(
			() => readGen1TypeNameEntry(reader, GEN1_TYPE_LAST_ID + 1),
			Gen1TypeNameError,
		);
		assert.throws(() => readGen1TypeNameEntry(reader, 1.5), Gen1TypeNameError);
	});

	it("reads all entries in id order", () => {
		// All 27 pointers target NORMAL, mirroring the alias shape of
		// the real table (ids 0x09–0x13 alias NORMAL there).
		const reader = makeRomWithTypePointers(
			new Array<number>(GEN1_TYPE_NAMES_POINTER_COUNT).fill(0x7de4),
			[
				{
					offset: stringOffsetFor(0x7de4),
					bytes: [0x8d, 0x8e, 0x91, 0x8c, 0x80, 0x8b, 0x50],
				},
			],
		);
		const entries = readAllGen1TypeNameEntries(reader);
		assert.equal(entries.length, GEN1_TYPE_NAMES_POINTER_COUNT);
		for (const entry of entries) {
			assert.equal(decodeGen1TypeName([...entry]), "NORMAL");
		}
	});
});

describe("decodeGen1TypeName", () => {
	it("decodes A–Z with no specials", () => {
		assert.equal(decodeGen1TypeName([0x88, 0x82, 0x84, 0x50]), "ICE");
		assert.equal(
			decodeGen1TypeName([
				0x85, 0x88, 0x86, 0x87, 0x93, 0x88, 0x8d, 0x86, 0x50,
			]),
			"FIGHTING",
		);
	});

	it("rejects every special byte from the other tables", () => {
		// Pokémon-name specials and move-name space/hyphen were never
		// observed in type names.
		for (const byte of [0xe0, 0xe8, 0xef, 0xf5, 0x7f, 0xe3]) {
			assert.throws(
				() => decodeGen1TypeName([0x80, byte, 0x50]),
				Gen1TextError,
			);
		}
	});

	it("keeps the other decoders rejecting nothing new", () => {
		assert.throws(() => decodeGen1Name([0x7f, 0x50]), Gen1TextError);
		assert.throws(() => decodeGen1MoveName([0xe0, 0x50]), Gen1TextError);
	});
});
