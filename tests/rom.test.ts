import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	GEN1_HEADER,
	identifyGen1Rom,
	identifyVariant,
	RomIdentityError,
	verifyChecksums,
} from "../src/rom/RomIdentity.ts";
import {
	GEN1_MAX_BANK,
	RomOutOfBoundsError,
	RomReader,
	resolveBankedPointer,
} from "../src/rom/RomReader.ts";

// Builds a minimal synthetic Red-clone image: correct entry, logo, fixed
// fields, title and checksums, but no real game data. Used as the "valid"
// fixture for all positive tests; game identity comes only from the title.
function makeValidRom(title: string): Buffer {
	const rom = Buffer.alloc(GEN1_HEADER.romLengthBytes, 0x00);
	Buffer.from(GEN1_HEADER.entryBytes).copy(rom, GEN1_HEADER.entryOffset);
	Buffer.from(GEN1_HEADER.logoBytes).copy(rom, GEN1_HEADER.logoOffset);
	rom.write(title, GEN1_HEADER.titleOffset, "ascii");
	rom.write(
		GEN1_HEADER.newLicenseeAscii,
		GEN1_HEADER.newLicenseeOffset,
		"ascii",
	);
	rom[GEN1_HEADER.sgbOffset] = GEN1_HEADER.sgbValue;
	rom[GEN1_HEADER.cartridgeTypeOffset] = GEN1_HEADER.cartridgeTypeValue;
	rom[GEN1_HEADER.romSizeOffset] = GEN1_HEADER.romSizeValue;
	rom[GEN1_HEADER.ramSizeOffset] = GEN1_HEADER.ramSizeValue;
	rom[GEN1_HEADER.destinationOffset] = GEN1_HEADER.destinationValue;
	rom[GEN1_HEADER.oldLicenseeOffset] = GEN1_HEADER.oldLicenseeValue;
	rom[GEN1_HEADER.versionOffset] = GEN1_HEADER.versionValue;
	let headerChecksum = 0;
	for (
		let offset = GEN1_HEADER.headerChecksumStart;
		offset <= GEN1_HEADER.headerChecksumEnd;
		offset++
	) {
		headerChecksum = (headerChecksum - rom.readUInt8(offset) - 1) & 0xff;
	}
	rom[GEN1_HEADER.headerChecksumOffset] = headerChecksum;
	let globalSum = 0;
	for (let offset = 0; offset < rom.length; offset++) {
		if (
			offset === GEN1_HEADER.globalChecksumOffset ||
			offset === GEN1_HEADER.globalChecksumOffset + 1
		) {
			continue;
		}
		globalSum = (globalSum + rom.readUInt8(offset)) & 0xffff;
	}
	rom.writeUInt16BE(globalSum, GEN1_HEADER.globalChecksumOffset);
	return rom;
}

describe("RomReader", () => {
	it("reads bytes, slices and 16-bit integers within bounds", () => {
		const reader = new RomReader(Buffer.from([0x34, 0x12, 0x00, 0xff]));
		assert.equal(reader.length, 4);
		assert.equal(reader.byteAt(0), 0x34);
		assert.equal(reader.readUInt16LE(0), 0x1234);
		assert.equal(reader.readUInt16BE(0), 0x3412);
		assert.deepEqual(reader.slice(1, 2), Buffer.from([0x12, 0x00]));
	});

	it("returns copies from slice so the reader stays immutable", () => {
		const reader = new RomReader(Buffer.from([0x01, 0x02]));
		const first = reader.slice(0, 2);
		first[0] = 0xff;
		assert.equal(reader.byteAt(0), 0x01);
	});

	it("copies the input buffer so later caller mutation cannot change reads", () => {
		const input = Buffer.from([0x01, 0x02]);
		const reader = new RomReader(input);
		input[0] = 0xff;
		assert.equal(reader.byteAt(0), 0x01);
	});

	it("rejects out-of-bounds reads explicitly", () => {
		const reader = new RomReader(Buffer.from([0x01, 0x02]));
		assert.throws(() => reader.byteAt(2), RomOutOfBoundsError);
		assert.throws(() => reader.byteAt(-1), RomOutOfBoundsError);
		assert.throws(() => reader.slice(1, 2), RomOutOfBoundsError);
		assert.throws(() => reader.slice(0, 3), RomOutOfBoundsError);
		assert.throws(() => reader.readUInt16LE(1), RomOutOfBoundsError);
		assert.throws(() => reader.readUInt16BE(1), RomOutOfBoundsError);
	});

	it("maps CPU addresses to file offsets for bank 0 and switchable banks", () => {
		const reader = new RomReader(Buffer.alloc(0x100000, 0x00));
		assert.equal(reader.resolveBankAddress(0, 0x0000), 0x0000);
		assert.equal(reader.resolveBankAddress(0, 0x3fff), 0x3fff);
		// Same byte through the bank-0 window regardless of selected bank.
		assert.equal(reader.resolveBankAddress(5, 0x0150), 0x0150);
		// Switchable window: bank * 0x4000 + (address - 0x4000).
		assert.equal(reader.resolveBankAddress(1, 0x4000), 0x4000);
		assert.equal(reader.resolveBankAddress(3, 0x7fff), 0xffff);
		// Highest bank of a 1 MiB ROM.
		assert.equal(reader.resolveBankAddress(63, 0x7fff), 0xfffff);
	});

	it("rejects invalid banks, addresses and unmapped banks explicitly", () => {
		const reader = new RomReader(Buffer.alloc(0x8000, 0x00));
		assert.throws(() => reader.resolveBankAddress(-1, 0x4000), RangeError);
		assert.throws(() => reader.resolveBankAddress(1.5, 0x4000), RangeError);
		assert.throws(() => reader.resolveBankAddress(1, -1), RangeError);
		assert.throws(() => reader.resolveBankAddress(1, 0x8000), RangeError);
		// Bank 2 maps to 0x8000-0xBFFF, beyond this 32 KiB fixture.
		assert.throws(
			() => reader.resolveBankAddress(2, 0x4000),
			RomOutOfBoundsError,
		);
	});

	it("resolves stored banked pointers and rejects non-banked addresses", () => {
		const reader = new RomReader(Buffer.alloc(0x100000, 0x00));
		// Real map-header case: bank 6 + CPU 0x42A1 -> file 0x182A1.
		assert.equal(resolveBankedPointer(reader, 0x06, 0x42a1), 0x182a1);
		// Window edges: lowest bank and address, highest bank and address.
		assert.equal(resolveBankedPointer(reader, 0, 0x4000), 0x0000);
		assert.equal(resolveBankedPointer(reader, GEN1_MAX_BANK, 0x7fff), 0xfffff);
		// A banked address is required: bank-0-window and non-ROM
		// addresses are rejected instead of being silently mapped.
		assert.throws(() => resolveBankedPointer(reader, 6, 0x3fff), RangeError);
		assert.throws(() => resolveBankedPointer(reader, 6, 0x0150), RangeError);
		assert.throws(() => resolveBankedPointer(reader, 6, 0x8000), RangeError);
		// Only banks of a 1 MiB ROM are accepted.
		assert.throws(() => resolveBankedPointer(reader, -1, 0x4000), RangeError);
		assert.throws(
			() => resolveBankedPointer(reader, GEN1_MAX_BANK + 1, 0x4000),
			RangeError,
		);
		// A banked pointer past the end of the loaded image is rejected.
		const small = new RomReader(Buffer.alloc(0x8000, 0x00));
		assert.throws(
			() => resolveBankedPointer(small, 2, 0x4000),
			RomOutOfBoundsError,
		);
	});
});

describe("identifyVariant", () => {
	it("identifies Red vs. Blue from the title of a bootable image", () => {
		assert.equal(
			identifyVariant(new RomReader(makeValidRom("POKEMON RED"))),
			"red",
		);
		assert.equal(
			identifyVariant(new RomReader(makeValidRom("POKEMON BLUE"))),
			"blue",
		);
	});

	it("still identifies the game when revision fields or checksums differ", () => {
		// A bootable image with the Red title but a different mask-ROM
		// version, a recomputed header checksum and a broken global
		// checksum is still Red — those are revision/integrity facts,
		// not identity.
		const rom = makeValidRom("POKEMON RED");
		rom[GEN1_HEADER.versionOffset] = 0x01;
		let headerChecksum = 0;
		for (
			let offset = GEN1_HEADER.headerChecksumStart;
			offset <= GEN1_HEADER.headerChecksumEnd;
			offset++
		) {
			headerChecksum = (headerChecksum - rom.readUInt8(offset) - 1) & 0xff;
		}
		rom[GEN1_HEADER.headerChecksumOffset] = headerChecksum;
		rom[0x0200] = (rom.readUInt8(0x0200) + 1) & 0xff;
		assert.equal(identifyVariant(new RomReader(rom)), "red");
		assert.throws(() => identifyGen1Rom(new RomReader(rom)), RomIdentityError);
	});

	it("rejects unknown titles and non-bootable images without guessing", () => {
		assert.throws(
			() => identifyVariant(new RomReader(makeValidRom("POKEMON GREEN"))),
			RomIdentityError,
		);
		const rom = makeValidRom("POKEMON RED");
		rom[GEN1_HEADER.logoOffset] = 0x00;
		assert.throws(() => identifyVariant(new RomReader(rom)), RomIdentityError);
	});
});

describe("verifyChecksums", () => {
	it("reports agreeing checksums as valid integrity evidence", () => {
		const checksums = verifyChecksums(
			new RomReader(makeValidRom("POKEMON RED")),
		);
		assert.equal(checksums.header.valid, true);
		assert.equal(checksums.header.stored, checksums.header.computed);
		assert.equal(checksums.global.valid, true);
		assert.equal(checksums.global.stored, checksums.global.computed);
	});

	it("reports a broken global checksum without identifying anything", () => {
		const rom = makeValidRom("POKEMON BLUE");
		rom[0x0200] = (rom.readUInt8(0x0200) + 1) & 0xff;
		const checksums = verifyChecksums(new RomReader(rom));
		assert.equal(checksums.header.valid, true);
		assert.equal(checksums.global.valid, false);
	});
});

describe("identifyGen1Rom", () => {
	it("identifies the synthetic Red ROM", () => {
		const identity = identifyGen1Rom(
			new RomReader(makeValidRom("POKEMON RED")),
		);
		assert.equal(identity.variant, "red");
		assert.equal(identity.title, "POKEMON RED");
		assert.equal(identity.romSizeBytes, 0x100000);
		assert.equal(identity.bankCount, 64);
		assert.equal(identity.cartridgeType, 0x13);
		assert.equal(
			identity.headerChecksum.stored,
			identity.headerChecksum.computed,
		);
		assert.equal(
			identity.globalChecksum.stored,
			identity.globalChecksum.computed,
		);
	});

	it("identifies the synthetic Blue ROM and distinguishes it from Red", () => {
		const identity = identifyGen1Rom(
			new RomReader(makeValidRom("POKEMON BLUE")),
		);
		assert.equal(identity.variant, "blue");
		assert.equal(identity.title, "POKEMON BLUE");
	});

	it("rejects an unknown title without guessing a variant", () => {
		assert.throws(
			() => identifyGen1Rom(new RomReader(makeValidRom("POKEMON GREEN"))),
			RomIdentityError,
		);
	});

	it("rejects a corrupted logo, entry point and every fixed header field", () => {
		const cases: Array<[string, (rom: Buffer) => void]> = [
			["entry point", (rom) => (rom[GEN1_HEADER.entryOffset] = 0xff)],
			["logo", (rom) => (rom[GEN1_HEADER.logoOffset] = 0x00)],
			["licensee", (rom) => (rom[GEN1_HEADER.newLicenseeOffset] = 0x58)],
			["sgb", (rom) => (rom[GEN1_HEADER.sgbOffset] = 0x00)],
			[
				"cartridge type",
				(rom) => (rom[GEN1_HEADER.cartridgeTypeOffset] = 0x00),
			],
			["rom size", (rom) => (rom[GEN1_HEADER.romSizeOffset] = 0x04)],
			["ram size", (rom) => (rom[GEN1_HEADER.ramSizeOffset] = 0x00)],
			["destination", (rom) => (rom[GEN1_HEADER.destinationOffset] = 0x00)],
			["old licensee", (rom) => (rom[GEN1_HEADER.oldLicenseeOffset] = 0x01)],
			["version", (rom) => (rom[GEN1_HEADER.versionOffset] = 0x01)],
		];
		for (const [label, corrupt] of cases) {
			const rom = makeValidRom("POKEMON RED");
			corrupt(rom);
			assert.throws(
				() => identifyGen1Rom(new RomReader(rom)),
				RomIdentityError,
				label,
			);
		}
	});

	it("rejects tampered checksums, wrong length and truncated input", () => {
		// Header checksum wrong while global checksum still matches.
		{
			const rom = makeValidRom("POKEMON RED");
			rom[0x0134] = (rom.readUInt8(0x0134) + 1) & 0xff;
			rom[GEN1_HEADER.headerChecksumOffset] =
				(rom.readUInt8(GEN1_HEADER.headerChecksumOffset) + 1) & 0xff;
			assert.throws(
				() => identifyGen1Rom(new RomReader(rom)),
				RomIdentityError,
			);
		}
		// Global checksum wrong while the header checksum still matches.
		{
			const rom = makeValidRom("POKEMON RED");
			rom[0x0200] = (rom.readUInt8(0x0200) + 1) & 0xff;
			assert.throws(
				() => identifyGen1Rom(new RomReader(rom)),
				RomIdentityError,
			);
		}
		// Full 1 MiB body with a wrong ROM-size code is rejected by size check.
		{
			const rom = makeValidRom("POKEMON RED");
			rom[GEN1_HEADER.romSizeOffset] = 0x06;
			assert.throws(
				() => identifyGen1Rom(new RomReader(rom)),
				RomIdentityError,
			);
		}
		// Truncated below the header.
		assert.throws(
			() => identifyGen1Rom(new RomReader(Buffer.alloc(0x100, 0x00))),
			RomIdentityError,
		);
		assert.throws(
			() => identifyGen1Rom(new RomReader(Buffer.alloc(0, 0x00))),
			RomIdentityError,
		);
	});
});
