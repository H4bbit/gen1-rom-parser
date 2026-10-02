import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Bootstrap smoke test: verifies the toolchain assumption that Node.js
// Buffer exposes the binary primitives the ROM reader builds on.
// It is not a ROM parser test; no ROM data is involved.

describe("project bootstrap", () => {
	it("reads little-endian integers through Buffer", () => {
		const bytes = Buffer.from([0x34, 0x12]);
		assert.equal(bytes.readUInt16LE(0), 0x1234);
	});

	it("reads big-endian integers through Buffer", () => {
		const bytes = Buffer.from([0x12, 0x34]);
		assert.equal(bytes.readUInt16BE(0), 0x1234);
	});
});
