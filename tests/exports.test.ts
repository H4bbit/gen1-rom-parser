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
	decodeGen1TypeName,
	GEN1_EFFECTIVENESS_OBSERVED_COUNT,
	GEN1_HEADER,
	Gen1LearnsetError,
	Gen1TmHmError,
	identifyVariant,
	RomReader,
	readGen1BaseStats,
	readGen1EffectivenessTable,
	readGen1LevelUpLearnset,
	readGen1MoveData,
	readGen1MoveNameEntry,
	readGen1NameEntry,
	readGen1TmHmLearnset,
	readGen1TmHmTable,
	readGen1TypeNameEntry,
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
		assert.equal(typeof readGen1MoveData, "function");
		assert.equal(typeof readGen1MoveNameEntry, "function");
		assert.equal(typeof readGen1TypeNameEntry, "function");
		assert.equal(typeof decodeGen1TypeName, "function");
		assert.equal(typeof readGen1LevelUpLearnset, "function");
		assert.equal(typeof Gen1LearnsetError, "function");
		assert.equal(typeof readGen1TmHmTable, "function");
		assert.equal(typeof readGen1TmHmLearnset, "function");
		assert.equal(typeof Gen1TmHmError, "function");
		assert.equal(typeof readGen1EffectivenessTable, "function");
		assert.equal(typeof GEN1_EFFECTIVENESS_OBSERVED_COUNT, "number");
	});
});
