import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildDataset, runCli } from "../src/cli.ts";
import {
	GEN1_EFFECTIVENESS_OBSERVED_COUNT,
	GEN1_EFFECTIVENESS_SENTINEL,
	GEN1_EFFECTIVENESS_TABLE_OFFSET,
} from "../src/gen1/Gen1Effectiveness.ts";
import {
	GEN1_LEARNSET_BANK,
	GEN1_LEARNSET_POINTER_TABLE_OFFSET,
} from "../src/gen1/Gen1Learnsets.ts";
import { GEN1_MOVE_NAMES_OFFSET } from "../src/gen1/Gen1MoveNames.ts";
import {
	GEN1_MOVE_ENTRY_LENGTH,
	GEN1_MOVE_LAST_ID,
	GEN1_MOVE_TABLE_OFFSET,
} from "../src/gen1/Gen1Moves.ts";
import {
	GEN1_NAME_ENTRY_LENGTH,
	GEN1_NAME_TABLE_ADDRESS,
	GEN1_NAME_TABLE_BANK,
	GEN1_NAME_TABLE_COUNT,
} from "../src/gen1/Gen1Names.ts";
import {
	GEN1_ORDER_TABLE_COUNT,
	GEN1_ORDER_TABLE_OFFSET,
} from "../src/gen1/Gen1Order.ts";
import {
	GEN1_BASE_STATS_ENTRY_LENGTH,
	GEN1_BASE_STATS_MAX_DEX,
	GEN1_BASE_STATS_OFFSET,
	GEN1_MEW_BASE_STATS_OFFSET,
} from "../src/gen1/Gen1Stats.ts";
import { GEN1_TEXT_TERMINATOR } from "../src/gen1/Gen1Text.ts";
import {
	GEN1_TMHM_COUNT,
	GEN1_TMHM_TABLE_OFFSET,
} from "../src/gen1/Gen1TmHm.ts";
import {
	GEN1_TYPE_NAMES_POINTER_COUNT,
	GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET,
	GEN1_TYPE_NAMES_REGION_START,
} from "../src/gen1/Gen1TypeNames.ts";
import { GEN1_HEADER } from "../src/rom/RomIdentity.ts";
import { RomReader } from "../src/rom/RomReader.ts";

// Letters-only name so the committed decoder accepts it; unique per dex.
function dexName(dex: number): string {
	let n = dex;
	let suffix = "";
	while (n > 0) {
		suffix = String.fromCharCode(0x41 + ((n - 1) % 26)) + suffix;
		n = Math.floor((n - 1) / 26);
	}
	return `MON${suffix}`;
}

function encodeName(name: string): Buffer {
	const entry = Buffer.alloc(GEN1_NAME_ENTRY_LENGTH, GEN1_TEXT_TERMINATOR);
	for (let i = 0; i < name.length; i++) {
		entry[i] = name.charCodeAt(i) - 0x41 + 0x80;
	}
	return entry;
}

const TABLE_BANK = Math.floor(GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET / 0x4000);

function encodeMoveName(text: string): Buffer {
	const bytes = [...text].map((ch) =>
		ch === " " ? 0x7f : ch === "-" ? 0xe3 : ch.charCodeAt(0) - 0x41 + 0x80,
	);
	return Buffer.from([...bytes, GEN1_TEXT_TERMINATOR]);
}

// Synthetic 82-entry effectiveness table cycling three valid pairs
// (WATER->FIRE, GRASS->WATER, FIRE->GRASS, all multiplier 0x14): ids
// stay inside the observed range (<= 0x1a), so the committed reader
// accepts the full table without copying real ROM bytes.
function effectivenessBytes(): Buffer {
	const parts: Array<number> = [];
	const chain: Array<[number, number, number]> = [
		[0x15, 0x14, 0x14],
		[0x16, 0x15, 0x14],
		[0x14, 0x16, 0x14],
	];
	for (let i = 0; i < GEN1_EFFECTIVENESS_OBSERVED_COUNT; i++) {
		parts.push(...(chain[i % chain.length] as [number, number, number]));
	}
	parts.push(GEN1_EFFECTIVENESS_SENTINEL);
	return Buffer.from(parts);
}

// Full 1 MiB synthetic image: valid Red-clone header/checksums plus
// populated name, order, base-stats, move, move-name, type-name, and
// effectiveness tables, so the CLI can run its whole pipeline
// (identify + all 151 dex reads + 165 moves + 27 type names + the
// 82-entry effectiveness table) without a real ROM. Move/type names
// are synthetic single letters; only the table shapes and counts are
// asserted here — real names come from the opt-in local test below.
function makeCliRom(): Buffer {
	const rom = Buffer.alloc(GEN1_HEADER.romLengthBytes, 0x00);
	Buffer.from(GEN1_HEADER.entryBytes).copy(rom, GEN1_HEADER.entryOffset);
	Buffer.from(GEN1_HEADER.logoBytes).copy(rom, GEN1_HEADER.logoOffset);
	rom.write("POKEMON RED", GEN1_HEADER.titleOffset, "ascii");
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

	const nameBase =
		GEN1_NAME_TABLE_BANK * 0x4000 + (GEN1_NAME_TABLE_ADDRESS - 0x4000);
	for (let dex = 1; dex <= GEN1_BASE_STATS_MAX_DEX; dex++) {
		const index = dex - 1;
		encodeName(dexName(dex)).copy(
			rom,
			nameBase + index * GEN1_NAME_ENTRY_LENGTH,
		);
		rom[GEN1_ORDER_TABLE_OFFSET + index] = dex;
		const entry = Buffer.alloc(GEN1_BASE_STATS_ENTRY_LENGTH, dex & 0xff);
		entry[0] = dex;
		// Zero the TM/HM bitfield (offsets 0x14-0x1A) so the synthetic
		// dataset decodes to an empty tmhm list; levelUp coverage owns
		// the learnset assertions here.
		entry.fill(0x00, 20, 27);
		entry[GEN1_BASE_STATS_ENTRY_LENGTH - 1] = 0x00;
		const offset =
			dex <= 150
				? GEN1_BASE_STATS_OFFSET + (dex - 1) * GEN1_BASE_STATS_ENTRY_LENGTH
				: GEN1_MEW_BASE_STATS_OFFSET;
		entry.copy(rom, offset);
	}

	for (let id = 1; id <= GEN1_MOVE_LAST_ID; id++) {
		Buffer.from([id & 0xff, 0x00, 0x28, 0x00, 0xff, 0x23]).copy(
			rom,
			GEN1_MOVE_TABLE_OFFSET + (id - 1) * GEN1_MOVE_ENTRY_LENGTH,
		);
	}
	let nameOffset = GEN1_MOVE_NAMES_OFFSET;
	for (let id = 1; id <= GEN1_MOVE_LAST_ID; id++) {
		// Synthetic 3-letter A–Z name; shape only, not real ROM bytes.
		const a = String.fromCharCode(0x41 + ((id - 1) % 26));
		const b = String.fromCharCode(0x41 + (Math.floor((id - 1) / 26) % 26));
		const entry = encodeMoveName(`M${a}${b}`);
		entry.copy(rom, nameOffset);
		nameOffset += entry.length;
	}
	// All 27 type ids alias one synthetic name at the region start,
	// mirroring the alias shape of the real table (ids 0x09–0x13 alias
	// NORMAL there). A single string keeps the 102-byte region valid.
	const typeStringOffset = GEN1_TYPE_NAMES_REGION_START;
	Buffer.from([0x80, 0x81, 0x82, GEN1_TEXT_TERMINATOR]).copy(
		rom,
		typeStringOffset,
	);
	const typePointer = typeStringOffset - TABLE_BANK * 0x4000 + 0x4000;
	for (let id = 0; id < GEN1_TYPE_NAMES_POINTER_COUNT; id++) {
		rom.writeUInt16LE(
			typePointer,
			GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET + id * 2,
		);
	}
	effectivenessBytes().copy(rom, GEN1_EFFECTIVENESS_TABLE_OFFSET);

	// Synthetic machine table: slot s teaches move s + 1, so every
	// species bitfield decodes without copying real ROM bytes. The
	// synthetic base-stats bitfields below are all zero, so every
	// pokemon entry decodes to an empty tmhm list here.
	for (let slot = 0; slot < GEN1_TMHM_COUNT; slot++) {
		rom[GEN1_TMHM_TABLE_OFFSET + slot] = slot + 1;
	}

	// Synthetic level-up learnsets: one minimal entry per internal
	// index used by the pokemon loop (dex d -> index d - 1 here), each
	// with an empty evolution section and a single (level 5, move 1)
	// pair. Placed back-to-back right after the pointer table — the
	// same contiguous shape as the real table/data in docs/learnsets.md.
	// Shape only; real learnsets come from the opt-in local test.
	let learnsetOffset =
		GEN1_LEARNSET_POINTER_TABLE_OFFSET + GEN1_ORDER_TABLE_COUNT * 2;
	for (let index = 0; index < GEN1_ORDER_TABLE_COUNT; index++) {
		const pointer = learnsetOffset - GEN1_LEARNSET_BANK * 0x4000 + 0x4000;
		rom.writeUInt16LE(pointer, GEN1_LEARNSET_POINTER_TABLE_OFFSET + index * 2);
		Buffer.from([0x00, 0x05, 0x01, 0x00]).copy(rom, learnsetOffset);
		learnsetOffset += 4;
	}

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

interface CliJsonPokemon {
	readonly dex: number;
	readonly name: string;
	readonly baseStats: { readonly dexNumber: number };
	readonly learnset: {
		readonly levelUp: Array<{ readonly level: number; readonly move: number }>;
		readonly tmhm: Array<number>;
	};
}

interface CliJsonMove {
	readonly id: number;
	readonly name: string;
	readonly animationId: number;
	readonly effect: number;
	readonly power: number;
	readonly type: number;
	readonly accuracy: number;
	readonly pp: number;
}

interface CliJsonDataset {
	readonly meta: {
		readonly variant: string;
		readonly title: string;
		readonly romSizeBytes: number;
		readonly bankCount: number;
		readonly headerChecksumValid: boolean;
		readonly globalChecksumValid: boolean;
	};
	readonly pokemon: Array<CliJsonPokemon>;
	readonly moves: Array<CliJsonMove>;
	readonly types: {
		readonly names: Array<{ readonly id: number; readonly name: string }>;
		readonly effectiveness: Array<{
			readonly attacker: number;
			readonly defender: number;
			readonly multiplier: number;
		}>;
	};
}

describe("CLI dataset builder", () => {
	it("emits meta, 151 pokemon, 165 moves, 27 type names, 82 effectiveness entries", () => {
		const dataset = buildDataset(new RomReader(makeCliRom()));
		assert.deepEqual(Object.keys(dataset), [
			"meta",
			"pokemon",
			"moves",
			"types",
		]);
		assert.deepEqual(
			{ ...dataset.meta },
			{
				variant: "red",
				title: "POKEMON RED",
				romSizeBytes: GEN1_HEADER.romLengthBytes,
				bankCount: GEN1_HEADER.bankCount,
				headerChecksumValid: true,
				globalChecksumValid: true,
			},
		);
		assert.equal(dataset.pokemon.length, 151);
		for (let i = 0; i < dataset.pokemon.length; i++) {
			const entry = dataset.pokemon[i];
			assert.equal(entry?.dex, i + 1);
			assert.equal(entry?.name, dexName(i + 1));
			assert.equal(entry?.baseStats.dexNumber, i + 1);
			assert.deepEqual(Object.keys(entry ?? {}), [
				"dex",
				"name",
				"baseStats",
				"learnset",
			]);
			assert.deepEqual(entry?.learnset, {
				levelUp: [{ level: 5, move: 1 }],
				tmhm: [],
			});
		}
		assert.equal(dataset.moves.length, GEN1_MOVE_LAST_ID);
		for (let i = 0; i < dataset.moves.length; i++) {
			const move = dataset.moves[i];
			assert.equal(move?.id, i + 1);
			assert.equal(move?.animationId, i + 1);
			assert.equal(typeof move?.name, "string");
			assert.deepEqual(Object.keys(move ?? {}), [
				"id",
				"name",
				"animationId",
				"effect",
				"power",
				"type",
				"accuracy",
				"pp",
			]);
		}
		assert.deepEqual(
			{ ...dataset.moves[0] },
			{
				id: 1,
				name: "MAA",
				animationId: 1,
				effect: 0x00,
				power: 0x28,
				type: 0x00,
				accuracy: 0xff,
				pp: 0x23,
			},
		);
		assert.equal(dataset.types.names.length, GEN1_TYPE_NAMES_POINTER_COUNT);
		for (let i = 0; i < dataset.types.names.length; i++) {
			assert.equal(dataset.types.names[i]?.id, i);
		}
		assert.equal(dataset.types.names[0]?.name, "ABC");
		assert.deepEqual(Object.keys(dataset.types), ["names", "effectiveness"]);
		assert.equal(
			dataset.types.effectiveness.length,
			GEN1_EFFECTIVENESS_OBSERVED_COUNT,
		);
		assert.deepEqual(
			{ ...dataset.types.effectiveness[0] },
			{
				attacker: 0x15,
				defender: 0x14,
				multiplier: 0x14,
			},
		);
	});

	it("is deterministic across runs", () => {
		const first = buildDataset(new RomReader(makeCliRom()));
		const second = buildDataset(new RomReader(makeCliRom()));
		assert.equal(
			JSON.stringify(first, null, 2),
			JSON.stringify(second, null, 2),
		);
	});
});

describe("runCli argument and input handling", () => {
	it("prints usage on stdout for -h/--help", () => {
		for (const flag of ["-h", "--help"]) {
			const result = runCli([flag], () => {
				assert.fail("help must not read any file");
			});
			assert.equal(result.exitCode, 0);
			assert.equal(result.stderr, "");
			assert.equal(result.stdout, "Usage: gen1-rom-parser <rom-path>\n");
		}
	});

	it("rejects a missing ROM argument", () => {
		const result = runCli([]);
		assert.equal(result.exitCode, 1);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /Error: missing ROM path\./);
		assert.match(result.stderr, /Usage: gen1-rom-parser <rom-path>/);
	});

	it("rejects extra arguments", () => {
		const result = runCli(["a.gb", "b.gb"], () => makeCliRom());
		assert.equal(result.exitCode, 1);
		assert.equal(result.stdout, "");
		assert.match(
			result.stderr,
			/Error: expected exactly one ROM path but got 2\./,
		);
		assert.match(result.stderr, /Usage: gen1-rom-parser <rom-path>/);
	});

	it("reports an unreadable file instead of throwing", () => {
		const result = runCli(["missing.gb"], () => {
			throw new Error("ENOENT: no such file");
		});
		assert.equal(result.exitCode, 1);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /cannot read ROM file/);
	});

	it("reports an invalid ROM instead of throwing", () => {
		const result = runCli(["bad.gb"], () => Buffer.alloc(0x200, 0x00));
		assert.equal(result.exitCode, 1);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /^Error: /);
	});

	it("prints stable JSON for a valid ROM", () => {
		const rom = makeCliRom();
		const first = runCli(["fake.gb"], () => rom);
		const second = runCli(["fake.gb"], () => rom);
		assert.equal(first.exitCode, 0);
		assert.equal(first.stderr, "");
		assert.equal(first.stdout, second.stdout);
		assert.ok(first.stdout.endsWith("\n"));
		const parsed = JSON.parse(first.stdout) as CliJsonDataset;
		assert.deepEqual(Object.keys(parsed), [
			"meta",
			"pokemon",
			"moves",
			"types",
		]);
		assert.equal(parsed.meta.variant, "red");
		assert.equal(parsed.meta.title, "POKEMON RED");
		assert.equal(parsed.meta.romSizeBytes, GEN1_HEADER.romLengthBytes);
		assert.equal(parsed.meta.bankCount, GEN1_HEADER.bankCount);
		assert.equal(parsed.meta.headerChecksumValid, true);
		assert.equal(parsed.meta.globalChecksumValid, true);
		assert.equal(parsed.pokemon.length, 151);
		assert.equal(parsed.pokemon[0]?.dex, 1);
		assert.equal(parsed.pokemon[150]?.dex, 151);
		assert.deepEqual(parsed.pokemon[0]?.learnset, {
			levelUp: [{ level: 5, move: 1 }],
			tmhm: [],
		});
		assert.equal(parsed.moves.length, GEN1_MOVE_LAST_ID);
		assert.equal(parsed.moves[0]?.id, 1);
		assert.equal(parsed.moves[164]?.id, GEN1_MOVE_LAST_ID);
		assert.equal(parsed.types.names.length, GEN1_TYPE_NAMES_POINTER_COUNT);
		assert.equal(parsed.types.names[0]?.id, 0);
		assert.equal(
			parsed.types.effectiveness.length,
			GEN1_EFFECTIVENESS_OBSERVED_COUNT,
		);
	});
});

describe("CLI build artifact (dist)", () => {
	it("ships dist/cli.js and keeps the bin and exports contract", () => {
		assert.equal(existsSync("dist/cli.js"), true);
		const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
			bin: Record<string, string>;
			exports: Record<string, Record<string, string>>;
		};
		assert.equal(pkg.bin["gen1-rom-parser"], "./dist/cli.js");
		assert.deepEqual(pkg.exports, {
			".": {
				types: "./dist/index.d.ts",
				default: "./dist/index.js",
			},
		});
	});

	it("runs the compiled CLI end to end on the synthetic ROM", () => {
		const dir = mkdtempSync(join(tmpdir(), "gen1-cli-"));
		const romPath = join(dir, "fake.gb");
		writeFileSync(romPath, makeCliRom());
		const stdout = execFileSync("node", ["dist/cli.js", romPath], {
			encoding: "utf8",
		});
		const parsed = JSON.parse(stdout) as CliJsonDataset;
		assert.equal(parsed.meta.variant, "red");
		assert.equal(parsed.pokemon.length, 151);
		assert.equal(parsed.pokemon[0]?.name, dexName(1));
		assert.equal(typeof parsed.pokemon[0]?.baseStats, "object");
		assert.deepEqual(parsed.pokemon[0]?.learnset, {
			levelUp: [{ level: 5, move: 1 }],
			tmhm: [],
		});
		assert.equal(parsed.moves.length, GEN1_MOVE_LAST_ID);
		assert.equal(parsed.types.names.length, GEN1_TYPE_NAMES_POINTER_COUNT);
		assert.equal(
			parsed.types.effectiveness.length,
			GEN1_EFFECTIVENESS_OBSERVED_COUNT,
		);
	});

	it("exits non-zero with stderr on missing argument (compiled)", () => {
		try {
			execFileSync("node", ["dist/cli.js"], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			assert.fail("expected non-zero exit");
		} catch (error) {
			const failure = error as {
				status: number;
				stderr: string;
				stdout: string;
			};
			assert.equal(failure.status, 1);
			assert.equal(failure.stdout, "");
			assert.match(failure.stderr, /Error: missing ROM path\./);
			assert.match(failure.stderr, /Usage: gen1-rom-parser <rom-path>/);
		}
	});

	it("prints usage on stdout for --help (compiled)", () => {
		const stdout = execFileSync("node", ["dist/cli.js", "--help"], {
			encoding: "utf8",
		});
		assert.equal(stdout, "Usage: gen1-rom-parser <rom-path>\n");
	});

	it("exits non-zero with stderr on an invalid ROM (compiled)", () => {
		const dir = mkdtempSync(join(tmpdir(), "gen1-cli-"));
		const romPath = join(dir, "bad.gb");
		writeFileSync(romPath, Buffer.alloc(0x200, 0x00));
		try {
			execFileSync("node", ["dist/cli.js", romPath], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			assert.fail("expected non-zero exit");
		} catch (error) {
			const failure = error as {
				status: number;
				stderr: string;
				stdout: string;
			};
			assert.equal(failure.status, 1);
			assert.equal(failure.stdout, "");
			assert.match(failure.stderr, /^Error: /);
		}
	});
});

describe("order table fixture sanity", () => {
	it("covers one index per dex in the synthetic ROM", () => {
		assert.equal(GEN1_ORDER_TABLE_COUNT, GEN1_NAME_TABLE_COUNT);
	});
});
