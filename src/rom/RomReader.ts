// Low-level, bounds-checked access to raw ROM bytes.
//
// The ROM is the primary source of truth for this project. Higher-level
// parsers read through RomReader instead of indexing a Buffer directly, so
// out-of-bounds access fails explicitly instead of silently producing
// `undefined` or unrelated bytes.

/** Size of one Game Boy ROM bank: 16 KiB. */
export const ROM_BANK_SIZE_BYTES = 0x4000;

/** First CPU address of the switchable ROM bank window (0x4000-0x7FFF). */
export const SWITCHABLE_BANK_ADDRESS = 0x4000;

/** End (exclusive) of the CPU ROM address area (0x0000-0x7FFF). */
export const ROM_ADDRESS_SPACE_END = 0x8000;

/** First CPU address of the banked-pointer window (0x4000-0x7FFF). */
export const BANKED_POINTER_ADDRESS_MIN = 0x4000;

/** Highest bank number of the supported 1 MiB Red/Blue ROMs (64 banks). */
export const GEN1_MAX_BANK = 63;

export class RomOutOfBoundsError extends Error {
	readonly offset: number;
	readonly length: number;
	readonly size: number;

	constructor(operation: string, offset: number, length: number, size: number) {
		super(
			`${operation}: byte range [0x${offset.toString(16)}, 0x${(offset + length).toString(16)}) out of bounds (ROM size 0x${size.toString(16)})`,
		);
		this.name = "RomOutOfBoundsError";
		this.offset = offset;
		this.length = length;
		this.size = size;
	}
}

function assertValidRange(
	offset: number,
	length: number,
	size: number,
	operation: string,
): void {
	if (
		!Number.isInteger(offset) ||
		!Number.isInteger(length) ||
		offset < 0 ||
		length < 0 ||
		offset + length > size
	) {
		throw new RomOutOfBoundsError(operation, offset, length, size);
	}
}

export class RomReader {
	#data: Buffer;

	constructor(data: Buffer) {
		// Copy so later mutation of the caller's buffer cannot change
		// already-validated reads; parsing must be deterministic.
		this.#data = Buffer.from(data);
	}

	get length(): number {
		return this.#data.length;
	}

	byteAt(offset: number): number {
		assertValidRange(offset, 1, this.#data.length, "RomReader.byteAt");
		return this.#data.readUInt8(offset);
	}

	/** Returns a copy; mutating it cannot affect the reader. */
	slice(offset: number, length: number): Buffer {
		assertValidRange(offset, length, this.#data.length, "RomReader.slice");
		return Buffer.from(this.#data.subarray(offset, offset + length));
	}

	readUInt16LE(offset: number): number {
		assertValidRange(offset, 2, this.#data.length, "RomReader.readUInt16LE");
		return this.#data.readUInt16LE(offset);
	}

	readUInt16BE(offset: number): number {
		assertValidRange(offset, 2, this.#data.length, "RomReader.readUInt16BE");
		return this.#data.readUInt16BE(offset);
	}

	/**
	 * Resolves a banked Game Boy CPU address to a ROM file offset.
	 *
	 * Terminology: `bank` is a 16 KiB ROM bank number (0-63 for these
	 * 1 MiB ROMs); `address` is a Game Boy CPU address in `0x0000-0x7FFF`.
	 * The result is a ROM file offset (0 to length-1).
	 *
	 * CPU `0x0000-0x3FFF` is the fixed bank-0 window and maps identically
	 * regardless of `bank`. CPU `0x4000-0x7FFF` is the switchable window:
	 * `bank * 0x4000 + (address - 0x4000)`. This is the arithmetic both
	 * Gen I banked data pointers and the reference implementation's
	 * `makeRef` use (see docs/rom-foundation.md).
	 *
	 * Hardware note: an MBC3 ROM-bank-register write of `0x00` selects
	 * bank `0x01` in the switchable window, but that register behavior is
	 * a runtime concern, not a property of stored data. This method
	 * resolves bank 0 arithmetically (to file offset `0x0000-0x3FFF`)
	 * so that stored bank numbers are never silently rewritten; callers
	 * working with live register values must handle the quirk themselves.
	 */
	resolveBankAddress(bank: number, address: number): number {
		if (!Number.isInteger(bank) || bank < 0) {
			throw new RangeError(
				`RomReader.resolveBankAddress: invalid bank ${bank} (must be a non-negative integer)`,
			);
		}
		if (
			!Number.isInteger(address) ||
			address < 0 ||
			address >= ROM_ADDRESS_SPACE_END
		) {
			throw new RangeError(
				`RomReader.resolveBankAddress: invalid CPU address 0x${address.toString(16)} (must be 0x0000-0x7FFF)`,
			);
		}
		const offset =
			address < SWITCHABLE_BANK_ADDRESS
				? address
				: bank * ROM_BANK_SIZE_BYTES + (address - SWITCHABLE_BANK_ADDRESS);
		if (offset >= this.#data.length) {
			throw new RomOutOfBoundsError(
				"RomReader.resolveBankAddress",
				offset,
				1,
				this.#data.length,
			);
		}
		return offset;
	}
}

/**
 * Resolves a stored Gen I banked pointer to a ROM file offset.
 *
 * A banked pointer is a little-endian 16-bit Game Boy CPU address stored
 * in the ROM (for example a map header or tileset entry address) together
 * with a bank number stored separately alongside it (for example the
 * leading bank byte of a tileset header, or the parallel bank table for
 * map headers). The CPU address must be in the switchable window
 * `0x4000-0x7FFF`; anything else means the bytes are not a banked
 * pointer and an error is thrown instead of guessing.
 *
 * The bank number is used as stored: bank 0 resolves arithmetically to
 * file offsets `0x0000-0x3FFF` and is NOT rewritten to bank 1. The MBC3
 * register quirk (a register *write* of 0 selecting bank 1 at runtime)
 * does not apply to bank numbers stored in ROM data, and no stored
 * bank-0 banked pointer was observed in the cases examined (map banks,
 * tileset banks, name bank 0x07, evo bank 0x0E, dex bank 0x10 are all
 * non-zero) — so rewriting would be an assumption, not evidence.
 */
export function resolveBankedPointer(
	reader: RomReader,
	bank: number,
	address: number,
): number {
	if (!Number.isInteger(bank) || bank < 0 || bank > GEN1_MAX_BANK) {
		throw new RangeError(
			`resolveBankedPointer: invalid bank ${bank} (must be an integer 0-${GEN1_MAX_BANK} for a 1 MiB ROM)`,
		);
	}
	if (
		!Number.isInteger(address) ||
		address < BANKED_POINTER_ADDRESS_MIN ||
		address >= ROM_ADDRESS_SPACE_END
	) {
		throw new RangeError(
			`resolveBankedPointer: invalid banked address 0x${address.toString(16)} (must be 0x4000-0x7FFF)`,
		);
	}
	return reader.resolveBankAddress(bank, address);
}
