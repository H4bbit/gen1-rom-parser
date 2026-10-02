// Gen I text decoding for the byte values actually observed in the ROM.
//
// Only the mapping proven by the name-table investigation is included:
// uppercase A–Z, the terminator, padding, and the four special bytes that
// appear in real names (see docs/text-and-names.md). Anything else is
// rejected explicitly instead of being guessed.

/** Byte that terminates a Gen I name string. */
export const GEN1_TEXT_TERMINATOR = 0x50;

/** Byte used to pad fixed-size name entries after the terminator. */
export const GEN1_TEXT_PADDING = 0x50;

/** First byte of the uppercase A–Z range. */
export const GEN1_TEXT_AZ_MIN = 0x80;

/** Last byte of the uppercase A–Z range. */
export const GEN1_TEXT_AZ_MAX = 0x99;

const AZ_OFFSET = GEN1_TEXT_AZ_MIN;

/**
 * Special bytes observed inside real Pokémon names, with the meaning
 * established by cross-checking the decoded names against the known
 * species (see docs/text-and-names.md):
 *
 * - 0xE0: apostrophe (FARFETCH'D)
 * - 0xE8: period (MISSINGNO., MR.MIME)
 * - 0xEF: male sign (NIDORAN♂)
 * - 0xF5: female sign (NIDORAN♀)
 */
export const GEN1_TEXT_SPECIALS: Readonly<Record<number, string>> = {
	224: "'",
	232: ".",
	239: "♂",
	245: "♀",
};

export class Gen1TextError extends Error {
	readonly offset: number;
	readonly byte: number;

	constructor(offset: number, byte: number) {
		super(
			`Gen I text: undecodable byte 0x${byte.toString(16).padStart(2, "0")} at entry offset ${offset}`,
		);
		this.name = "Gen1TextError";
		this.offset = offset;
		this.byte = byte;
	}
}

function decodeByte(byte: number, offset: number): string {
	if (byte >= GEN1_TEXT_AZ_MIN && byte <= GEN1_TEXT_AZ_MAX) {
		return String.fromCharCode(0x41 + (byte - AZ_OFFSET));
	}
	const special = GEN1_TEXT_SPECIALS[byte];
	if (special !== undefined) {
		return special;
	}
	throw new Gen1TextError(offset, byte);
}

/**
 * Decodes a Gen I name entry: bytes up to (not including) the first
 * 0x50 terminator. Bytes after the terminator are padding and are not
 * read. Throws Gen1TextError on a byte outside the established mapping.
 */
export function decodeGen1Name(entry: readonly number[]): string {
	let text = "";
	for (let i = 0; i < entry.length; i++) {
		const byte = entry[i] as number;
		if (byte === GEN1_TEXT_TERMINATOR) {
			return text;
		}
		text += decodeByte(byte, i);
	}
	return text;
}
