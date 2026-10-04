import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	decodeGen1TmHm,
	GEN1_HM_COUNT,
	GEN1_TM_COUNT,
	GEN1_TMHM_BITFIELD_LENGTH,
	GEN1_TMHM_COUNT,
	GEN1_TMHM_TABLE_OFFSET,
	Gen1TmHmError,
	readGen1TmHmLearnset,
	readGen1TmHmTable,
} from "../src/gen1/Gen1TmHm.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Minimal machine table fixture: slot s teaches move s + 1, so the
// emitted move ids mirror the slot numbers without copying ROM bytes.
const TABLE = Array.from({ length: GEN1_TMHM_COUNT }, (_, slot) => slot + 1);

function tableRom(patch?: (rom: Buffer) => void): RomReader {
	const rom = Buffer.alloc(GEN1_TMHM_TABLE_OFFSET + GEN1_TMHM_COUNT, 0x00);
	Buffer.from([...TABLE]).copy(rom, GEN1_TMHM_TABLE_OFFSET);
	patch?.(rom);
	return new RomReader(rom);
}

describe("TM/HM constants", () => {
	it("pins the ROM-established table layout", () => {
		assert.equal(GEN1_TMHM_TABLE_OFFSET, 0x13773);
		assert.equal(GEN1_TM_COUNT, 50);
		assert.equal(GEN1_HM_COUNT, 5);
		assert.equal(GEN1_TMHM_COUNT, 55);
		assert.equal(GEN1_TMHM_BITFIELD_LENGTH, 7);
	});
});

describe("readGen1TmHmTable", () => {
	it("reads 55 machine entries in slot order", () => {
		assert.deepEqual(readGen1TmHmTable(tableRom()), TABLE);
	});

	it("rejects an out-of-range move id with slot and offset", () => {
		const reader = tableRom((rom) => {
			rom[GEN1_TMHM_TABLE_OFFSET + 33] = 0;
		});
		assert.throws(
			() => readGen1TmHmTable(reader),
			(error) => {
				assert.ok(error instanceof Gen1TmHmError);
				assert.match((error as Error).message, /TM34/);
				assert.match(
					(error as Error).message,
					new RegExp(`0x${(GEN1_TMHM_TABLE_OFFSET + 33).toString(16)}`),
				);
				return true;
			},
		);
	});

	it("rejects a move id above 165", () => {
		const reader = tableRom((rom) => {
			rom[GEN1_TMHM_TABLE_OFFSET + 54] = 166;
		});
		assert.throws(() => readGen1TmHmTable(reader), Gen1TmHmError);
	});
});

describe("decodeGen1TmHm", () => {
	it("maps LSB-first bits to slot-ordered move ids", () => {
		// Slots 0 (TM01), 8 (TM09), 50 (HM01) set.
		const bitfield = Buffer.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x04]);
		assert.deepEqual(decodeGen1TmHm(bitfield, TABLE), [1, 9, 51]);
	});

	it("emits an empty list for an all-zero bitfield", () => {
		assert.deepEqual(
			decodeGen1TmHm(Buffer.alloc(GEN1_TMHM_BITFIELD_LENGTH, 0x00), TABLE),
			[],
		);
	});

	it("ignores the spare bit (bit 7 of byte 6)", () => {
		// Only the spare bit set: no real slot, so no moves.
		const bitfield = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80]);
		assert.deepEqual(decodeGen1TmHm(bitfield, TABLE), []);
	});

	it("decodes an all-0xFF bitfield to the full 55-move table", () => {
		assert.deepEqual(
			decodeGen1TmHm(Buffer.alloc(GEN1_TMHM_BITFIELD_LENGTH, 0xff), TABLE),
			TABLE,
		);
	});

	it("rejects short/long bitfields and machine tables", () => {
		assert.throws(
			() => decodeGen1TmHm(Buffer.alloc(6, 0x00), TABLE),
			Gen1TmHmError,
		);
		assert.throws(
			() => decodeGen1TmHm(Buffer.alloc(8, 0x00), TABLE),
			Gen1TmHmError,
		);
		assert.throws(
			() => decodeGen1TmHm(Buffer.alloc(GEN1_TMHM_BITFIELD_LENGTH, 0x00), [1]),
			Gen1TmHmError,
		);
	});

	it("rejects an invalid machine-table move id at a set slot", () => {
		const bad = [...TABLE];
		bad[0] = 0;
		assert.throws(
			() => decodeGen1TmHm(Buffer.from([0x01, 0, 0, 0, 0, 0, 0]), bad),
			(error) => {
				assert.ok(error instanceof Gen1TmHmError);
				assert.match((error as Error).message, /TM01/);
				return true;
			},
		);
	});
});

describe("readGen1TmHmLearnset dex policy", () => {
	it("rejects dex numbers outside 1-151 before any ROM access", () => {
		const reader = tableRom();
		for (const dex of [0, 152, 1.5, Number.NaN]) {
			assert.throws(() => readGen1TmHmLearnset(reader, dex), Gen1TmHmError);
		}
	});
});
