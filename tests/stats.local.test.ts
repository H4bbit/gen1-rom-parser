// Opt-in local integration check: verifies the base-stats table
// structure against real Red/Blue images. Requires copyrighted ROM files
// that are never committed:
//
//   GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
//
// Each variable is optional; unset variables are skipped without failing.
//
// Unlike tests/stats.test.ts (synthetic fixtures), this suite reads the
// real tables: the 150-entry main table at 0x383DE, the table boundaries,
// the padding byte, and Mew's standalone entry at 0x425B — through the
// committed readGen1BaseStats API.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	GEN1_BASE_STATS_ENTRY_LENGTH,
	GEN1_BASE_STATS_LAST_DEX,
	GEN1_BASE_STATS_MAX_DEX,
	GEN1_BASE_STATS_OFFSET,
	GEN1_MEW_BASE_STATS_OFFSET,
	readGen1BaseStats,
} from "../src/gen1/Gen1Stats.ts";
import { RomReader } from "../src/rom/RomReader.ts";

const cases = [
	{ envName: "GEN1_ROM_RED", label: "red" },
	{ envName: "GEN1_ROM_BLUE", label: "blue" },
] as const;

for (const { envName, label } of cases) {
	const path = process.env[envName];
	if (path === undefined || path === "") {
		describe(`real ${label} base stats (opt-in)`, () => {
			it(`skipped: set ${envName} to enable`, () => {
				assert.ok(true, "no ROM path configured; skipping");
			});
		});
	} else {
		const romPath: string = path;
		describe(`real ${label} base stats (opt-in)`, () => {
			it("holds sequential ids 1–150 with zero padding in the main table", () => {
				const reader = new RomReader(readFileSync(romPath));
				for (let dex = 1; dex <= GEN1_BASE_STATS_LAST_DEX; dex++) {
					const stats = readGen1BaseStats(reader, dex);
					assert.equal(stats.dexNumber, dex);
					assert.equal(stats.padding, 0x00);
				}
				assert.equal(GEN1_BASE_STATS_OFFSET, 0x383de);
				assert.equal(GEN1_BASE_STATS_ENTRY_LENGTH, 28);
			});

			it("ends the main table exactly at 0x39446 (slot 150 is not Mew)", () => {
				const reader = new RomReader(readFileSync(romPath));
				const after = reader.byteAt(
					GEN1_BASE_STATS_OFFSET +
						GEN1_BASE_STATS_LAST_DEX * GEN1_BASE_STATS_ENTRY_LENGTH,
				);
				assert.notEqual(after, GEN1_BASE_STATS_MAX_DEX);
			});

			it("reads Mew from the standalone entry at 0x425B", () => {
				const reader = new RomReader(readFileSync(romPath));
				const mew = readGen1BaseStats(reader, GEN1_BASE_STATS_MAX_DEX);
				assert.equal(mew.dexNumber, 151);
				assert.equal(mew.hp, 100);
				assert.equal(mew.attack, 100);
				assert.equal(mew.defense, 100);
				assert.equal(mew.speed, 100);
				assert.equal(mew.special, 100);
				assert.equal(GEN1_MEW_BASE_STATS_OFFSET, 0x425b);
			});

			it("keeps every sprite pointer in the banked window", () => {
				const reader = new RomReader(readFileSync(romPath));
				for (let dex = 1; dex <= GEN1_BASE_STATS_MAX_DEX; dex++) {
					const stats = readGen1BaseStats(reader, dex);
					assert.ok(
						stats.frontSprite >= 0x4000 && stats.frontSprite < 0x8000,
						`dex ${dex} frontSprite 0x${stats.frontSprite.toString(16)}`,
					);
					assert.ok(
						stats.backSprite >= 0x4000 && stats.backSprite < 0x8000,
						`dex ${dex} backSprite 0x${stats.backSprite.toString(16)}`,
					);
				}
			});
		});
	}
}
