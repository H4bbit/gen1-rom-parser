import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GEN1_NAME_TABLE_COUNT } from "../src/gen1/Gen1Names.ts";
import {
	findGen1IndexByDex,
	GEN1_MAX_DEX_NUMBER,
	GEN1_ORDER_NO_DEX,
	GEN1_ORDER_TABLE_COUNT,
	GEN1_ORDER_TABLE_OFFSET,
	Gen1OrderError,
	readGen1OrderValue,
} from "../src/gen1/Gen1Order.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Synthetic image: order table at the real file offset, embedded in a
// larger zeroed body so the offset arithmetic is exercised.
function makeRomWithOrder(values: Array<number>): RomReader {
	const rom = Buffer.alloc(
		GEN1_ORDER_TABLE_OFFSET + GEN1_ORDER_TABLE_COUNT + 16,
		0x00,
	);
	values.forEach((value, i) => {
		rom[GEN1_ORDER_TABLE_OFFSET + i] = value;
	});
	return new RomReader(rom);
}

describe("order table", () => {
	it("reads raw values by internal index at the fixed offset", () => {
		const reader = makeRomWithOrder([112, 115, 32]);
		assert.equal(readGen1OrderValue(reader, 0), 112);
		assert.equal(readGen1OrderValue(reader, 1), 115);
		assert.equal(readGen1OrderValue(reader, 2), 32);
		assert.equal(GEN1_ORDER_TABLE_OFFSET, 0x41024);
		assert.equal(GEN1_ORDER_TABLE_COUNT, GEN1_NAME_TABLE_COUNT);
	});

	it("exposes the no-dex marker as a plain value", () => {
		const reader = makeRomWithOrder([GEN1_ORDER_NO_DEX]);
		assert.equal(readGen1OrderValue(reader, 0), 0);
		assert.equal(GEN1_ORDER_NO_DEX, 0);
	});

	it("finds the internal index for a dex number", () => {
		// Dex 112 (Rhydon) at index 0, dex 1 (Bulbasaur) at index 152.
		const values = new Array<number>(GEN1_ORDER_TABLE_COUNT).fill(0);
		values[0] = 112;
		values[152] = 1;
		values[20] = 151;
		const reader = makeRomWithOrder(values);
		assert.equal(findGen1IndexByDex(reader, 112), 0);
		assert.equal(findGen1IndexByDex(reader, 1), 152);
		assert.equal(findGen1IndexByDex(reader, 151), 20);
		assert.equal(GEN1_MAX_DEX_NUMBER, 151);
	});

	it("rejects out-of-range indexes, dex numbers and absent numbers", () => {
		const reader = makeRomWithOrder([112]);
		assert.throws(() => readGen1OrderValue(reader, -1), Gen1OrderError);
		assert.throws(
			() => readGen1OrderValue(reader, GEN1_ORDER_TABLE_COUNT),
			Gen1OrderError,
		);
		assert.throws(() => readGen1OrderValue(reader, 1.5), Gen1OrderError);
		assert.throws(() => findGen1IndexByDex(reader, 0), Gen1OrderError);
		assert.throws(() => findGen1IndexByDex(reader, 152), Gen1OrderError);
		assert.throws(() => findGen1IndexByDex(reader, 25), Gen1OrderError);
	});
});
