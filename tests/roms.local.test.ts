// Opt-in local integration check against real ROM images.
//
// NOT part of the default test suite: it requires copyrighted ROM files
// that are never committed. Provide the paths via environment:
//
//   GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
//
// Each variable is optional. Set ROMs are identified and reported; unset
// variables are skipped without failing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { identifyGen1Rom } from "../src/rom/RomIdentity.ts";
import { RomReader } from "../src/rom/RomReader.ts";

const cases = [
	{ envName: "GEN1_ROM_RED", label: "red", expectedVariant: "red" },
	{ envName: "GEN1_ROM_BLUE", label: "blue", expectedVariant: "blue" },
] as const;

for (const { envName, label, expectedVariant } of cases) {
	const path = process.env[envName];
	if (path === undefined || path === "") {
		describe(`real ${label} ROM (opt-in)`, () => {
			it(`skipped: set ${envName} to enable`, () => {
				assert.ok(true, "no ROM path configured; skipping");
			});
		});
	} else {
		const romPath: string = path;
		describe(`real ${label} ROM (opt-in)`, () => {
			it(`identifies the real ${label} ROM`, () => {
				const identity = identifyGen1Rom(new RomReader(readFileSync(romPath)));
				assert.equal(identity.variant, expectedVariant);
				assert.equal(identity.romSizeBytes, 0x100000);
				assert.equal(identity.bankCount, 64);
				assert.equal(
					identity.headerChecksum.stored,
					identity.headerChecksum.computed,
				);
				assert.equal(
					identity.globalChecksum.stored,
					identity.globalChecksum.computed,
				);
			});
		});
	}
}
