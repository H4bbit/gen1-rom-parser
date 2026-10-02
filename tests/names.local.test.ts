// Opt-in local integration check: decodes every name entry of real
// Red/Blue images and asserts the committed decoder/table rules against
// them. Requires copyrighted ROM files that are never committed:
//
//   GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
//
// Each variable is optional; unset variables are skipped without failing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	GEN1_NAME_TABLE_COUNT,
	readGen1NameEntry,
} from "../src/gen1/Gen1Names.ts";
import {
	findGen1IndexByDex,
	readGen1OrderValue,
} from "../src/gen1/Gen1Order.ts";
import { decodeGen1Name } from "../src/gen1/Gen1Text.ts";
import { RomReader } from "../src/rom/RomReader.ts";

const cases = [
	{ envName: "GEN1_ROM_RED", label: "red" },
	{ envName: "GEN1_ROM_BLUE", label: "blue" },
] as const;

for (const { envName, label } of cases) {
	const path = process.env[envName];
	if (path === undefined || path === "") {
		describe(`real ${label} names (opt-in)`, () => {
			it(`skipped: set ${envName} to enable`, () => {
				assert.ok(true, "no ROM path configured; skipping");
			});
		});
	} else {
		const romPath: string = path;
		describe(`real ${label} names (opt-in)`, () => {
			it(`decodes all ${GEN1_NAME_TABLE_COUNT} name entries`, () => {
				const reader = new RomReader(readFileSync(romPath));
				const names: Array<string> = [];
				for (let index = 0; index < GEN1_NAME_TABLE_COUNT; index++) {
					names.push(decodeGen1Name([...readGen1NameEntry(reader, index)]));
				}
				// Order table cross-checks: index -> dex -> name round trip.
				assert.equal(readGen1OrderValue(reader, 0), 112);
				assert.equal(readGen1OrderValue(reader, 152), 1);
				assert.equal(readGen1OrderValue(reader, 30), 0);
				assert.equal(findGen1IndexByDex(reader, 1), 152);
				assert.equal(findGen1IndexByDex(reader, 112), 0);
				assert.equal(findGen1IndexByDex(reader, 151), 20);
				// Spot checks across short, long, and special-character names.
				assert.equal(names[0], "RHYDON");
				assert.equal(names[1], "KANGASKHAN");
				assert.equal(names[2], "NIDORAN♂");
				assert.equal(names[14], "NIDORAN♀");
				assert.equal(names[20], "MEW");
				assert.equal(names[41], "MR.MIME");
				assert.equal(names[63], "FARFETCH'D");
				assert.equal(names[189], "VICTREEBEL");
			});
		});
	}
}
