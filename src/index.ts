// Public entry point for gen1-rom-parser.
//
// Re-exports the ROM-access and Generation I structure layers so
// consumers have a single import. No runtime behavior lives here.

export {
	GEN1_MAX_BANK,
	BANKED_POINTER_ADDRESS_MIN,
	ROM_ADDRESS_SPACE_END,
	ROM_BANK_SIZE_BYTES,
	SWITCHABLE_BANK_ADDRESS,
	RomOutOfBoundsError,
	RomReader,
	resolveBankedPointer,
} from "./rom/RomReader.ts";
export {
	GEN1_HEADER,
	type ChecksumInfo,
	type ChecksumVerdict,
	computeGlobalChecksum,
	computeHeaderChecksum,
	type Gen1RomIdentity,
	type Gen1Variant,
	identifyGen1Rom,
	identifyVariant,
	type RomChecksums,
	RomIdentityError,
	verifyChecksums,
} from "./rom/RomIdentity.ts";
export {
	decodeGen1Name,
	GEN1_TEXT_AZ_MAX,
	GEN1_TEXT_AZ_MIN,
	GEN1_TEXT_PADDING,
	GEN1_TEXT_SPECIALS,
	GEN1_TEXT_TERMINATOR,
	Gen1TextError,
} from "./gen1/Gen1Text.ts";
export {
	GEN1_NAME_ENTRY_LENGTH,
	GEN1_NAME_MAX_LENGTH,
	GEN1_NAME_TABLE_ADDRESS,
	GEN1_NAME_TABLE_BANK,
	GEN1_NAME_TABLE_COUNT,
	gen1NameTableBase,
	Gen1NameError,
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
