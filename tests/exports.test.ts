import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Consumer smoke test: verifies the compiled public entry point is
// importable as plain JavaScript after `npm run build`. Uses a
// self-reference by package name so the check exercises the published
// `exports` entry exactly as an external consumer resolves it
// (self-reference requires `exports` and is limited to it). Parsing
// behavior itself is covered by the other suites; this only pins the
// entry contract.

import {
	decodeGen1MoveName,
	decodeGen1Name,
	GEN1_HEADER,
	identifyVariant,
	RomReader,
	readGen1BaseStats,
	readGen1NameEntry,
} from "gen1-rom-parser";

describe("package entry (dist)", () => {
	it("exposes the public API as importable JavaScript", () => {
		assert.equal(typeof RomReader, "function");
		assert.equal(typeof identifyVariant, "function");
		assert.equal(typeof readGen1NameEntry, "function");
		assert.equal(typeof readGen1BaseStats, "function");
		assert.equal(typeof decodeGen1Name, "function");
		assert.equal(typeof GEN1_HEADER, "object");
	});

	it("decodes a name through the built entry", () => {
		assert.equal(
			decodeGen1Name([0x91, 0x87, 0x98, 0x83, 0x8e, 0x8d, 0x50]),
			"RHYDON",
		);
		assert.equal(typeof decodeGen1MoveName, "function");
	});

	it("reads through RomReader from the built entry", () => {
		const reader = new RomReader(Buffer.from([0x34, 0x12]));
		assert.equal(reader.readUInt16LE(0), 0x1234);
	});
});
