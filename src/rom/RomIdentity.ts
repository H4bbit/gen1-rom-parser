// Identification of supported Generation I ROMs (Pokémon Red/Blue).
//
// The Game Boy cartridge header lives at 0x0100-0x014F. Its layout follows
// Pan Docs ("The Cartridge Header"); every field meaning used here was
// checked byte-by-byte against real Red and Blue ROMs, and the evidence is
// recorded in docs/rom-foundation.md.
//
// Three levels are kept separate on purpose:
//
// - structurally valid Game Boy ROM: entry point + Nintendo logo present;
// - identified Red/Blue ROM: a bootable image whose title is exactly
//   POKEMON RED or POKEMON BLUE (`identifyVariant`);
// - known supported dump: the exact USA/Europe SGB-Enhanced revision
//   investigated so far — fixed header fields, 1 MiB length and both
//   checksums verified (`identifyGen1Rom`).
//
// Only the known supported dump is accepted by `identifyGen1Rom`.
// Anything else is rejected explicitly instead of being guessed.

import type { RomReader } from "./RomReader.ts";

export type Gen1Variant = "red" | "blue";

export class RomIdentityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RomIdentityError";
	}
}

/**
 * Centralized Red/Blue cartridge-header layout. Offsets are absolute ROM
 * file offsets; values are the exact bytes observed in both real ROMs
 * unless noted otherwise.
 */
export const GEN1_HEADER = {
	entryOffset: 0x0100,
	/** NOP; JP 0x0150. */
	entryBytes: [0x00, 0xc3, 0x50, 0x01] as const,
	logoOffset: 0x0104,
	logoLength: 48,
	/** Canonical Nintendo logo bitmap, identical in Red and Blue. */
	logoBytes: [
		0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83,
		0x00, 0x0c, 0x00, 0x0d, 0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e,
		0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 0xd9, 0x99, 0xbb, 0xbb, 0x67, 0x63,
		0x6e, 0x0e, 0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 0x33, 0x3e,
	] as const,
	titleOffset: 0x0134,
	titleLength: 16,
	/** Upper-case ASCII, NUL-padded to 16 bytes. */
	titleRed: "POKEMON RED",
	titleBlue: "POKEMON BLUE",
	newLicenseeOffset: 0x0144,
	newLicenseeLength: 2,
	/** ASCII "01": Nintendo. Meaningful because oldLicenseeValue is 0x33. */
	newLicenseeAscii: "01",
	sgbOffset: 0x0146,
	/** 0x03: SGB functions supported. */
	sgbValue: 0x03,
	cartridgeTypeOffset: 0x0147,
	/** 0x13: MBC3 + RAM + battery. */
	cartridgeTypeValue: 0x13,
	romSizeOffset: 0x0148,
	/** 0x05: 32 KiB << 5 = 1 MiB = 64 banks. */
	romSizeValue: 0x05,
	ramSizeOffset: 0x0149,
	/** 0x03: 32 KiB of cartridge RAM (4 banks of 8 KiB). */
	ramSizeValue: 0x03,
	destinationOffset: 0x014a,
	/** 0x01: overseas only (Pan Docs destination code). */
	destinationValue: 0x01,
	oldLicenseeOffset: 0x014b,
	/** 0x33 ("3"): use the new licensee code instead. */
	oldLicenseeValue: 0x33,
	versionOffset: 0x014c,
	/** 0x00: release version observed in both ROMs. */
	versionValue: 0x00,
	headerChecksumOffset: 0x014d,
	headerChecksumStart: 0x0134,
	/** Inclusive end of the header-checksum range. */
	headerChecksumEnd: 0x014c,
	globalChecksumOffset: 0x014e,
	bankCount: 64,
	romLengthBytes: 0x100000,
} as const;

export interface ChecksumInfo {
	readonly stored: number;
	readonly computed: number;
}

export interface ChecksumVerdict extends ChecksumInfo {
	/**
	 * Whether stored and computed checksums agree. A `false` header
	 * checksum means the image cannot boot on real hardware; a `false`
	 * global checksum means the bytes differ from what the cartridge
	 * claims (corruption or tampering) but says nothing about which game
	 * the image is — global validity is integrity evidence, not identity.
	 */
	readonly valid: boolean;
}

export interface RomChecksums {
	readonly header: ChecksumVerdict;
	readonly global: ChecksumVerdict;
}

export interface Gen1RomIdentity {
	readonly variant: Gen1Variant;
	readonly title: string;
	readonly cartridgeType: number;
	readonly romSizeBytes: number;
	readonly bankCount: number;
	readonly ramSizeCode: number;
	readonly destinationCode: number;
	readonly version: number;
	readonly headerChecksum: ChecksumVerdict;
	readonly globalChecksum: ChecksumVerdict;
}

function hexByte(value: number): string {
	return `0x${value.toString(16).padStart(2, "0")}`;
}

function checkByte(
	reader: RomReader,
	label: string,
	offset: number,
	expected: number,
): void {
	const actual = reader.byteAt(offset);
	if (actual !== expected) {
		throw new RomIdentityError(
			`Unsupported ROM header: ${label} at 0x${offset.toString(16)} is ${hexByte(actual)}, expected ${hexByte(expected)}`,
		);
	}
}

/**
 * Header checksum as verified by the Game Boy boot ROM:
 * `x = 0; for each byte in 0x0134-0x014C: x = x - byte - 1` (mod 0x100).
 */
export function computeHeaderChecksum(reader: RomReader): number {
	if (reader.length < GEN1_HEADER.headerChecksumOffset + 1) {
		throw new RomIdentityError(
			`Truncated ROM: ${reader.length} bytes, cannot read the header checksum range 0x${GEN1_HEADER.headerChecksumStart.toString(16)}-0x${GEN1_HEADER.headerChecksumEnd.toString(16)}`,
		);
	}
	let checksum = 0;
	for (
		let offset = GEN1_HEADER.headerChecksumStart;
		offset <= GEN1_HEADER.headerChecksumEnd;
		offset++
	) {
		checksum = (checksum - reader.byteAt(offset) - 1) & 0xff;
	}
	return checksum;
}

/**
 * Global checksum: 16-bit big-endian sum of all ROM bytes except the two
 * checksum bytes themselves. Unlike the header checksum, the boot ROM does
 * not verify it; this parser requires it as integrity evidence.
 */
export function computeGlobalChecksum(reader: RomReader): number {
	if (reader.length < GEN1_HEADER.globalChecksumOffset + 2) {
		throw new RomIdentityError(
			`Truncated ROM: ${reader.length} bytes, cannot read the global checksum at 0x${GEN1_HEADER.globalChecksumOffset.toString(16)}`,
		);
	}
	let sum = 0;
	for (let offset = 0; offset < reader.length; offset++) {
		if (
			offset === GEN1_HEADER.globalChecksumOffset ||
			offset === GEN1_HEADER.globalChecksumOffset + 1
		) {
			continue;
		}
		sum = (sum + reader.byteAt(offset)) & 0xffff;
	}
	return sum;
}

function paddedTitleBytes(title: string): Buffer {
	const bytes = Buffer.alloc(GEN1_HEADER.titleLength, 0x00);
	bytes.write(title, 0, "ascii");
	return bytes;
}

function identifyVariantFromTitle(titleBytes: Buffer): Gen1Variant {
	if (titleBytes.equals(paddedTitleBytes(GEN1_HEADER.titleRed))) {
		return "red";
	}
	if (titleBytes.equals(paddedTitleBytes(GEN1_HEADER.titleBlue))) {
		return "blue";
	}
	const printable = [...titleBytes]
		.map((byte) =>
			byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : "?",
		)
		.join("");
	const hex = [...titleBytes]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join(" ");
	throw new RomIdentityError(
		`Unsupported ROM title "${printable}" (hex: ${hex}); expected "${GEN1_HEADER.titleRed}" or "${GEN1_HEADER.titleBlue}"`,
	);
}

/**
 * Verifies both checksums of any header-sized image and reports the
 * stored/computed pair for each. Integrity evidence only: it does not
 * identify the game and does not throw on mismatch — callers decide what
 * a mismatch means (for `identifyGen1Rom` it is rejection).
 */
export function verifyChecksums(reader: RomReader): RomChecksums {
	if (reader.length < GEN1_HEADER.globalChecksumOffset + 2) {
		throw new RomIdentityError(
			`Truncated ROM: ${reader.length} bytes, need at least 0x150 to read the cartridge header`,
		);
	}
	const storedHeader = reader.byteAt(GEN1_HEADER.headerChecksumOffset);
	const computedHeader = computeHeaderChecksum(reader);
	const storedGlobal = reader.readUInt16BE(GEN1_HEADER.globalChecksumOffset);
	const computedGlobal = computeGlobalChecksum(reader);
	return {
		header: {
			stored: storedHeader,
			computed: computedHeader,
			valid: storedHeader === computedHeader,
		},
		global: {
			stored: storedGlobal,
			computed: computedGlobal,
			valid: storedGlobal === computedGlobal,
		},
	};
}

function assertBootableHeader(reader: RomReader): void {
	if (reader.length < GEN1_HEADER.globalChecksumOffset + 2) {
		throw new RomIdentityError(
			`Truncated ROM: ${reader.length} bytes, need at least 0x150 to read the cartridge header`,
		);
	}

	for (let i = 0; i < GEN1_HEADER.entryBytes.length; i++) {
		checkByte(
			reader,
			"entry point",
			GEN1_HEADER.entryOffset + i,
			GEN1_HEADER.entryBytes[i] as number,
		);
	}

	for (let i = 0; i < GEN1_HEADER.logoBytes.length; i++) {
		checkByte(
			reader,
			"Nintendo logo",
			GEN1_HEADER.logoOffset + i,
			GEN1_HEADER.logoBytes[i] as number,
		);
	}
}

/**
 * Identifies which game a bootable image is from its title alone.
 *
 * Requires only a structurally valid Game Boy header (entry point +
 * Nintendo logo) plus an exact `POKEMON RED` / `POKEMON BLUE` title. It
 * deliberately does NOT check the remaining fixed fields, the ROM
 * length, or either checksum: those pin down the exact investigated
 * revision (see `identifyGen1Rom`), they are not what makes an image
 * Red vs. Blue.
 */
export function identifyVariant(reader: RomReader): Gen1Variant {
	assertBootableHeader(reader);
	return identifyVariantFromTitle(
		reader.slice(GEN1_HEADER.titleOffset, GEN1_HEADER.titleLength),
	);
}

/**
 * Validates the known supported Red/Blue dump: bootable header, exact
 * investigated-revision fixed fields, exact title, 1 MiB length, and
 * both checksums. This is the revision/dump gate the parser builds on —
 * it is stricter than `identifyVariant` on purpose, because unstudied
 * revisions, hacks, or corrupted images must not flow into Gen I
 * structure parsing as if they were the investigated ROMs.
 *
 * Throws RomIdentityError on anything else.
 */
export function identifyGen1Rom(reader: RomReader): Gen1RomIdentity {
	assertBootableHeader(reader);

	const licensee = reader
		.slice(GEN1_HEADER.newLicenseeOffset, GEN1_HEADER.newLicenseeLength)
		.toString("ascii");
	if (licensee !== GEN1_HEADER.newLicenseeAscii) {
		throw new RomIdentityError(
			`Unsupported ROM header: new licensee code at 0x${GEN1_HEADER.newLicenseeOffset.toString(16)} is "${licensee}", expected "${GEN1_HEADER.newLicenseeAscii}"`,
		);
	}

	checkByte(reader, "SGB flag", GEN1_HEADER.sgbOffset, GEN1_HEADER.sgbValue);
	checkByte(
		reader,
		"cartridge type",
		GEN1_HEADER.cartridgeTypeOffset,
		GEN1_HEADER.cartridgeTypeValue,
	);
	checkByte(
		reader,
		"ROM size",
		GEN1_HEADER.romSizeOffset,
		GEN1_HEADER.romSizeValue,
	);
	checkByte(
		reader,
		"RAM size",
		GEN1_HEADER.ramSizeOffset,
		GEN1_HEADER.ramSizeValue,
	);
	checkByte(
		reader,
		"destination code",
		GEN1_HEADER.destinationOffset,
		GEN1_HEADER.destinationValue,
	);
	checkByte(
		reader,
		"old licensee code",
		GEN1_HEADER.oldLicenseeOffset,
		GEN1_HEADER.oldLicenseeValue,
	);
	checkByte(
		reader,
		"mask ROM version",
		GEN1_HEADER.versionOffset,
		GEN1_HEADER.versionValue,
	);

	const variant = identifyVariantFromTitle(
		reader.slice(GEN1_HEADER.titleOffset, GEN1_HEADER.titleLength),
	);

	if (reader.length !== GEN1_HEADER.romLengthBytes) {
		throw new RomIdentityError(
			`Unsupported ROM size: ${reader.length} bytes, expected ${GEN1_HEADER.romLengthBytes} bytes for ROM size code ${hexByte(GEN1_HEADER.romSizeValue)}`,
		);
	}

	const checksums = verifyChecksums(reader);
	if (!checksums.header.valid) {
		throw new RomIdentityError(
			`Invalid header checksum at 0x${GEN1_HEADER.headerChecksumOffset.toString(16)}: stored ${hexByte(checksums.header.stored)}, computed ${hexByte(checksums.header.computed)}`,
		);
	}
	if (!checksums.global.valid) {
		throw new RomIdentityError(
			`Invalid global checksum at 0x${GEN1_HEADER.globalChecksumOffset.toString(16)}: stored 0x${checksums.global.stored.toString(16).padStart(4, "0")}, computed 0x${checksums.global.computed.toString(16).padStart(4, "0")}`,
		);
	}

	return {
		variant,
		title: variant === "red" ? GEN1_HEADER.titleRed : GEN1_HEADER.titleBlue,
		cartridgeType: GEN1_HEADER.cartridgeTypeValue,
		romSizeBytes: GEN1_HEADER.romLengthBytes,
		bankCount: GEN1_HEADER.bankCount,
		ramSizeCode: GEN1_HEADER.ramSizeValue,
		destinationCode: GEN1_HEADER.destinationValue,
		version: GEN1_HEADER.versionValue,
		headerChecksum: checksums.header,
		globalChecksum: checksums.global,
	};
}
