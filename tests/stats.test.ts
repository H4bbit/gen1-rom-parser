import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	GEN1_BASE_STATS_ENTRY_LENGTH,
	GEN1_BASE_STATS_MAX_DEX,
	GEN1_BASE_STATS_OFFSET,
	GEN1_MEW_BASE_STATS_OFFSET,
	Gen1StatsError,
	readGen1BaseStats,
} from "../src/gen1/Gen1Stats.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Synthetic image: main table at the real file offset with controllable
// entries, plus Mew's standalone entry at its real offset.
function makeRomWithStats(
	main: Array<Array<number>>,
	mew?: Array<number>,
): RomReader {
	const size = Math.max(
		GEN1_BASE_STATS_OFFSET + main.length * GEN1_BASE_STATS_ENTRY_LENGTH,
		GEN1_MEW_BASE_STATS_OFFSET + GEN1_BASE_STATS_ENTRY_LENGTH,
	);
	const rom = Buffer.alloc(size + 16, 0x00);
	main.forEach((entry, k) => {
		Buffer.from(entry).copy(
			rom,
			GEN1_BASE_STATS_OFFSET + k * GEN1_BASE_STATS_ENTRY_LENGTH,
		);
	});
	if (mew !== undefined) {
		Buffer.from(mew).copy(rom, GEN1_MEW_BASE_STATS_OFFSET);
	}
	return new RomReader(rom);
}

function bulbasaurEntry(): Array<number> {
	return [
		0x01, 0x2d, 0x31, 0x31, 0x2d, 0x41, 0x16, 0x03, 0x2d, 0x40, 0x55, 0x00,
		0x40, 0xe5, 0x40, 0x21, 0x2d, 0x00, 0x00, 0x03, 0xa4, 0x03, 0x38, 0xc0,
		0x03, 0x08, 0x06, 0x00,
	];
}

describe("base stats table", () => {
	it("reads fields of a main-table entry by dex number", () => {
		const reader = makeRomWithStats([bulbasaurEntry()]);
		const stats = readGen1BaseStats(reader, 1);
		assert.equal(stats.dexNumber, 1);
		assert.equal(stats.hp, 0x2d);
		assert.equal(stats.attack, 0x31);
		assert.equal(stats.defense, 0x31);
		assert.equal(stats.speed, 0x2d);
		assert.equal(stats.special, 0x41);
		assert.equal(stats.type1, 0x16);
		assert.equal(stats.type2, 0x03);
		assert.equal(stats.catchRate, 0x2d);
		assert.equal(stats.baseExp, 0x40);
		assert.equal(stats.spriteSize, 0x55);
		assert.equal(stats.frontSprite, 0x4000);
		assert.equal(stats.backSprite, 0x40e5);
		assert.deepEqual(stats.level1Moves, [0x21, 0x2d, 0x00, 0x00]);
		assert.equal(stats.growthRate, 0x03);
		assert.deepEqual(
			[...stats.tmhm],
			[0xa4, 0x03, 0x38, 0xc0, 0x03, 0x08, 0x06],
		);
		assert.equal(stats.padding, 0x00);
		assert.equal(GEN1_BASE_STATS_OFFSET, 0x383de);
		assert.equal(GEN1_BASE_STATS_ENTRY_LENGTH, 28);
	});

	it("reads Mew from its standalone entry, not the main table", () => {
		const mew = [
			0x97, 0x64, 0x64, 0x64, 0x64, 0x64, 0x18, 0x18, 0x2d, 0x40, 0x55, 0x12,
			0x41, 0x05, 0x42, 0x01, 0x00, 0x00, 0x00, 0x03, 0xff, 0xff, 0xff, 0xff,
			0xff, 0xff, 0xff, 0xff,
		];
		const reader = makeRomWithStats([bulbasaurEntry()], mew);
		const stats = readGen1BaseStats(reader, 151);
		assert.equal(stats.dexNumber, 151);
		assert.equal(stats.hp, 100);
		assert.equal(stats.speed, 100);
		assert.equal(stats.growthRate, 0x03);
		assert.deepEqual(stats.level1Moves, [0x01, 0x00, 0x00, 0x00]);
		assert.equal(stats.padding, 0xff);
		assert.equal(GEN1_MEW_BASE_STATS_OFFSET, 0x425b);
		assert.equal(GEN1_BASE_STATS_MAX_DEX, 151);
	});

	it("rejects id mismatch, out-of-range dex and truncated entries", () => {
		const wrong = bulbasaurEntry();
		wrong[0] = 0x02;
		assert.throws(
			() => readGen1BaseStats(makeRomWithStats([wrong]), 1),
			Gen1StatsError,
		);
		const reader = makeRomWithStats([bulbasaurEntry()]);
		assert.throws(() => readGen1BaseStats(reader, 0), Gen1StatsError);
		assert.throws(() => readGen1BaseStats(reader, 152), Gen1StatsError);
		assert.throws(() => readGen1BaseStats(reader, 1.5), Gen1StatsError);
		const short = new RomReader(
			Buffer.alloc(GEN1_BASE_STATS_OFFSET + 10, 0x00),
		);
		assert.throws(() => readGen1BaseStats(short, 1), Error);
	});
});
