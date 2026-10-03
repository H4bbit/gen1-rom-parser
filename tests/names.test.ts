import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	GEN1_NAME_ENTRY_LENGTH,
	GEN1_NAME_TABLE_BANK,
	GEN1_NAME_TABLE_COUNT,
	Gen1NameError,
	gen1NameTableBase,
	readGen1NameEntry,
} from "../src/gen1/Gen1Names.ts";
import {
	decodeGen1MoveName,
	decodeGen1Name,
	GEN1_TEXT_MOVE_HYPHEN,
	GEN1_TEXT_MOVE_SPACE,
	GEN1_TEXT_PADDING,
	GEN1_TEXT_TERMINATOR,
	Gen1TextError,
} from "../src/gen1/Gen1Text.ts";
import { RomReader } from "../src/rom/RomReader.ts";

describe("decodeGen1Name", () => {
	it("decodes uppercase letters A–Z from 0x80–0x99", () => {
		assert.equal(
			decodeGen1Name([0x91, 0x87, 0x98, 0x83, 0x8e, 0x8d, 0x50]),
			"RHYDON",
		);
		assert.equal(decodeGen1Name([0x8c, 0x84, 0x96, 0x50]), "MEW");
		assert.equal(decodeGen1Name([0x80, 0x81, 0x91, 0x80, 0x50]), "ABRA");
		// Full range boundaries.
		assert.equal(decodeGen1Name([0x80, 0x50]), "A");
		assert.equal(decodeGen1Name([0x99, 0x50]), "Z");
	});

	it("stops at the 0x50 terminator and ignores padding", () => {
		assert.equal(
			decodeGen1Name([
				0x91, 0x87, 0x98, 0x83, 0x8e, 0x8d, 0x50, 0x50, 0x50, 0x50,
			]),
			"RHYDON",
		);
		assert.equal(decodeGen1Name([0x50, 0x50]), "");
	});

	it("decodes the special bytes observed in real names", () => {
		// FARFETCH'D, MR.MIME / MISSINGNO., NIDORAN♂, NIDORAN♀.
		assert.equal(decodeGen1Name([0x85, 0x80, 0x91, 0xe0, 0x50]), "FAR'");
		assert.equal(decodeGen1Name([0x8c, 0xe8, 0x50]), "M.");
		assert.equal(decodeGen1Name([0x8d, 0xef, 0x50]), "N♂");
		assert.equal(decodeGen1Name([0x8d, 0xf5, 0x50]), "N♀");
	});

	it("decodes a full-length entry with no terminator", () => {
		assert.equal(
			decodeGen1Name([
				0x8a, 0x80, 0x8d, 0x86, 0x80, 0x92, 0x8a, 0x87, 0x80, 0x8d,
			]),
			"KANGASKHAN",
		);
	});

	it("rejects bytes outside the established mapping", () => {
		assert.throws(() => decodeGen1Name([0x7f, 0x50]), Gen1TextError);
		assert.throws(() => decodeGen1Name([0x9a, 0x50]), Gen1TextError);
		assert.throws(() => decodeGen1Name([0x00, 0x50]), Gen1TextError);
		assert.throws(() => decodeGen1Name([0xe1, 0x50]), Gen1TextError);
		try {
			decodeGen1Name([0x80, 0x9a]);
			assert.fail("expected Gen1TextError");
		} catch (error) {
			assert.ok(error instanceof Gen1TextError);
			assert.equal(error.offset, 1);
			assert.equal(error.byte, 0x9a);
		}
	});
});

describe("name table layout", () => {
	// Synthetic image: banked name table at bank 7 / CPU 0x421E, three
	// entries followed by filler. Only the table bytes matter here.
	function makeRomWithNames(entries: Array<Array<number>>): RomReader {
		const base = GEN1_NAME_TABLE_BANK * 0x4000 + 0x021e;
		const rom = Buffer.alloc(
			base + GEN1_NAME_TABLE_COUNT * GEN1_NAME_ENTRY_LENGTH + 16,
			0xaa,
		);
		entries.forEach((entry, i) => {
			Buffer.from(entry).copy(rom, base + i * GEN1_NAME_ENTRY_LENGTH);
		});
		return new RomReader(rom);
	}

	it("resolves the table base through the established banked pointer", () => {
		const reader = makeRomWithNames([]);
		assert.equal(
			gen1NameTableBase(reader),
			GEN1_NAME_TABLE_BANK * 0x4000 + 0x021e,
		);
	});

	it("reads entries by fixed stride and validates padding shape", () => {
		const reader = makeRomWithNames([
			[0x91, 0x87, 0x98, 0x83, 0x8e, 0x8d, 0x50, 0x50, 0x50, 0x50],
			[0x8a, 0x80, 0x8d, 0x86, 0x80, 0x92, 0x8a, 0x87, 0x80, 0x8d],
			[0x8c, 0x84, 0x96, 0x50, 0x50, 0x50, 0x50, 0x50, 0x50, 0x50],
		]);
		assert.deepEqual(
			[...readGen1NameEntry(reader, 0)],
			[0x91, 0x87, 0x98, 0x83, 0x8e, 0x8d, 0x50, 0x50, 0x50, 0x50],
		);
		assert.equal(
			decodeGen1Name([...readGen1NameEntry(reader, 1)]),
			"KANGASKHAN",
		);
		assert.equal(decodeGen1Name([...readGen1NameEntry(reader, 2)]), "MEW");
	});

	it("rejects non-padding bytes after the terminator", () => {
		const reader = makeRomWithNames([
			[0x91, 0x87, 0x50, 0x41, 0x50, 0x50, 0x50, 0x50, 0x50, 0x50],
		]);
		assert.throws(() => readGen1NameEntry(reader, 0), Gen1NameError);
	});

	it("rejects out-of-range indexes", () => {
		const reader = makeRomWithNames([]);
		assert.throws(() => readGen1NameEntry(reader, -1), Gen1NameError);
		assert.throws(
			() => readGen1NameEntry(reader, GEN1_NAME_TABLE_COUNT),
			Gen1NameError,
		);
		assert.throws(() => readGen1NameEntry(reader, 1.5), Gen1NameError);
	});

	it("terminator and padding constants match the observed table", () => {
		assert.equal(GEN1_TEXT_TERMINATOR, 0x50);
		assert.equal(GEN1_TEXT_PADDING, 0x50);
		assert.equal(GEN1_NAME_ENTRY_LENGTH, 10);
	});
});

describe("decodeGen1MoveName", () => {
	it("decodes A–Z plus the move-name space and hyphen", () => {
		assert.equal(GEN1_TEXT_MOVE_SPACE, 0x7f);
		assert.equal(GEN1_TEXT_MOVE_HYPHEN, 0xe3);
		assert.equal(
			decodeGen1MoveName([0x8f, 0x8e, 0x94, 0x8d, 0x83, 0x50]),
			"POUND",
		);
		// KARATE CHOP (space), SAND-ATTACK and DOUBLE-EDGE (hyphen).
		assert.equal(
			decodeGen1MoveName([
				0x8a, 0x80, 0x91, 0x80, 0x93, 0x84, 0x7f, 0x82, 0x87, 0x8e, 0x8f, 0x50,
			]),
			"KARATE CHOP",
		);
		assert.equal(
			decodeGen1MoveName([
				0x92, 0x80, 0x8d, 0x83, 0xe3, 0x80, 0x93, 0x93, 0x80, 0x82, 0x8a, 0x50,
			]),
			"SAND-ATTACK",
		);
		assert.equal(
			decodeGen1MoveName([
				0x83, 0x8e, 0x94, 0x81, 0x8b, 0x84, 0xe3, 0x84, 0x83, 0x86, 0x84, 0x50,
			]),
			"DOUBLE-EDGE",
		);
	});

	it("rejects the Pokémon-name specials in move context", () => {
		// 0xE0 (apostrophe), 0xE8 (period), 0xEF/0xF5 (gender signs)
		// were never observed in move names.
		for (const byte of [0xe0, 0xe8, 0xef, 0xf5]) {
			assert.throws(
				() => decodeGen1MoveName([0x80, byte, 0x50]),
				Gen1TextError,
			);
		}
	});

	it("keeps the Pokémon-name decoder rejecting the move-name bytes", () => {
		assert.throws(() => decodeGen1Name([0x7f, 0x50]), Gen1TextError);
		assert.throws(() => decodeGen1Name([0xe3, 0x50]), Gen1TextError);
	});
});
