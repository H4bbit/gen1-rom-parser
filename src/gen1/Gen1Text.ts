// Gen I text decoding for the byte values actually observed in the ROM.
//
// Charsets are per structure: uppercase A–Z plus the terminator are
// shared, but special bytes are scoped to the table they were observed
// in (see docs/text-and-names.md for Pokémon names, docs/moves.md for
// move names, docs/types.md for type names). Anything else is rejected
// explicitly instead of being guessed.

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

function decodeByte(
	byte: number,
	offset: number,
	specials: Readonly<Record<number, string>>,
): string {
	if (byte >= GEN1_TEXT_AZ_MIN && byte <= GEN1_TEXT_AZ_MAX) {
		return String.fromCharCode(0x41 + (byte - AZ_OFFSET));
	}
	const special = specials[byte];
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
	return decodeWithSpecials(entry, GEN1_TEXT_SPECIALS);
}

/** Byte observed as a space inside real move names (KARATE CHOP). */
export const GEN1_TEXT_MOVE_SPACE = 0x7f;

/**
 * Byte observed as a hyphen inside real move names (SAND-ATTACK,
 * DOUBLE-EDGE — the only two; see docs/moves.md).
 */
export const GEN1_TEXT_MOVE_HYPHEN = 0xe3;

/**
 * Special bytes observed inside real move names. Kept separate from
 * GEN1_TEXT_SPECIALS on purpose: the Pokémon-name decoder above must
 * keep rejecting 0x7F/0xE3 (its charset was established from the name
 * table alone), and the move-name decoder below must keep rejecting
 * the Pokémon-name specials (none were observed in move names).
 */
export const GEN1_TEXT_MOVE_SPECIALS: Readonly<Record<number, string>> = {
	[GEN1_TEXT_MOVE_SPACE]: " ",
	[GEN1_TEXT_MOVE_HYPHEN]: "-",
};

/**
 * Decodes a Gen I move-name string: bytes up to (not including) the
 * first 0x50 terminator, using A–Z plus the move-name specials only.
 * Throws Gen1TextError on any other byte, including the Pokémon-name
 * specials, which were never observed in move names.
 */
export function decodeGen1MoveName(entry: readonly number[]): string {
	return decodeWithSpecials(entry, GEN1_TEXT_MOVE_SPECIALS);
}

/**
 * Special bytes observed inside real type names: none. The 16 type
 * names at file 0x27DE4–0x27E49 contain only A–Z (see docs/types.md).
 * The empty map keeps this decoder exactly as strong as its own ROM
 * evidence: it rejects every special byte from the other tables.
 */
export const GEN1_TEXT_TYPE_SPECIALS: Readonly<Record<number, string>> = {};

/**
 * Decodes a Gen I type-name string: bytes up to (not including) the
 * first 0x50 terminator, using A–Z only. Throws Gen1TextError on any
 * other byte, including the Pokémon-name and move-name specials,
 * which were never observed in type names.
 */
export function decodeGen1TypeName(entry: readonly number[]): string {
	return decodeWithSpecials(entry, GEN1_TEXT_TYPE_SPECIALS);
}

function decodeWithSpecials(
	entry: readonly number[],
	specials: Readonly<Record<number, string>>,
): string {
	let text = "";
	for (let i = 0; i < entry.length; i++) {
		const byte = entry[i] as number;
		if (byte === GEN1_TEXT_TERMINATOR) {
			return text;
		}
		text += decodeByte(byte, i, specials);
	}
	return text;
}
