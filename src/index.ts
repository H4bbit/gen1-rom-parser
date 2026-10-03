// Public entry point for gen1-rom-parser.
//
// Re-exports the ROM-access and Generation I structure layers so
// consumers have a single import. No runtime behavior lives here.

export {
	GEN1_MOVE_ENTRY_LENGTH,
	GEN1_MOVE_FIRST_ID,
	GEN1_MOVE_LAST_ID,
	GEN1_MOVE_TABLE_COUNT,
	GEN1_MOVE_TABLE_OFFSET,
	type Gen1MoveData,
	Gen1MoveError,
	readGen1MoveData,
} from "./gen1/Gen1Moves.ts";
export {
	GEN1_NAME_ENTRY_LENGTH,
	GEN1_NAME_MAX_LENGTH,
	GEN1_NAME_TABLE_ADDRESS,
	GEN1_NAME_TABLE_BANK,
	GEN1_NAME_TABLE_COUNT,
	Gen1NameError,
	gen1NameTableBase,
	readGen1NameEntry,
} from "./gen1/Gen1Names.ts";
export {
	findGen1IndexByDex,
	GEN1_MAX_DEX_NUMBER,
	GEN1_ORDER_NO_DEX,
	GEN1_ORDER_TABLE_COUNT,
	GEN1_ORDER_TABLE_OFFSET,
	Gen1OrderError,
	readGen1OrderValue,
} from "./gen1/Gen1Order.ts";
export {
	GEN1_BASE_STATS_ENTRY_LENGTH,
	GEN1_BASE_STATS_FIRST_DEX,
	GEN1_BASE_STATS_LAST_DEX,
	GEN1_BASE_STATS_MAX_DEX,
	GEN1_BASE_STATS_OFFSET,
	GEN1_MEW_BASE_STATS_OFFSET,
	type Gen1BaseStats,
	Gen1StatsError,
	readGen1BaseStats,
} from "./gen1/Gen1Stats.ts";
export {
	decodeGen1MoveName,
	decodeGen1Name,
	GEN1_TEXT_AZ_MAX,
	GEN1_TEXT_AZ_MIN,
	GEN1_TEXT_MOVE_HYPHEN,
	GEN1_TEXT_MOVE_SPACE,
	GEN1_TEXT_MOVE_SPECIALS,
	GEN1_TEXT_PADDING,
	GEN1_TEXT_SPECIALS,
	GEN1_TEXT_TERMINATOR,
	Gen1TextError,
} from "./gen1/Gen1Text.ts";
export {
	type ChecksumInfo,
	type ChecksumVerdict,
	computeGlobalChecksum,
	computeHeaderChecksum,
	GEN1_HEADER,
	type Gen1RomIdentity,
	type Gen1Variant,
	identifyGen1Rom,
	identifyVariant,
	type RomChecksums,
	RomIdentityError,
	verifyChecksums,
} from "./rom/RomIdentity.ts";
export {
	BANKED_POINTER_ADDRESS_MIN,
	GEN1_MAX_BANK,
	ROM_ADDRESS_SPACE_END,
	ROM_BANK_SIZE_BYTES,
	RomOutOfBoundsError,
	RomReader,
	resolveBankedPointer,
	SWITCHABLE_BANK_ADDRESS,
} from "./rom/RomReader.ts";
