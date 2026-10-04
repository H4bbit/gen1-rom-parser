#!/usr/bin/env node
// Thin command-line interface over the public library entry point.
//
// The library (`src/index.ts`, shipped as `dist/index.js`) stays the
// primary product; this module only wires stdin/stdout conventions
// around it: one ROM path argument in, deterministic JSON on stdout,
// diagnostics on stderr with a non-zero exit code. No parsing logic
// lives here — every byte is interpreted through the library API.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
	decodeGen1MoveName,
	decodeGen1Name,
	decodeGen1TypeName,
	findGen1IndexByDex,
	GEN1_BASE_STATS_MAX_DEX,
	GEN1_MOVE_FIRST_ID,
	GEN1_MOVE_LAST_ID,
	GEN1_TYPE_FIRST_ID,
	type Gen1Variant,
	identifyGen1Rom,
	RomReader,
	readAllGen1TypeNameEntries,
	readGen1BaseStats,
	readGen1EffectivenessTable,
	readGen1MoveData,
	readGen1MoveNameEntry,
	readGen1NameEntry,
} from "./index.ts";

export interface CliPokemonBaseStats {
	readonly dexNumber: number;
	readonly hp: number;
	readonly attack: number;
	readonly defense: number;
	readonly speed: number;
	readonly special: number;
	readonly type1: number;
	readonly type2: number;
	readonly catchRate: number;
	readonly baseExp: number;
	readonly spriteSize: number;
	readonly frontSprite: number;
	readonly backSprite: number;
	readonly level1Moves: ReadonlyArray<number>;
	readonly growthRate: number;
	/** TM/HM bitfield as plain numbers so the JSON output stays stable. */
	readonly tmhm: ReadonlyArray<number>;
	readonly padding: number;
}

export interface CliPokemonEntry {
	/** Pokédex number; entries are ordered ascending by it. */
	readonly dex: number;
	readonly name: string;
	readonly baseStats: CliPokemonBaseStats;
}

export interface CliMeta {
	readonly variant: Gen1Variant;
	readonly title: string;
	readonly romSizeBytes: number;
	readonly bankCount: number;
	readonly headerChecksumValid: boolean;
	readonly globalChecksumValid: boolean;
}

export interface CliMoveEntry {
	readonly id: number;
	readonly name: string;
	readonly animationId: number;
	/** Raw effect id. No effect enum exists at this layer. */
	readonly effect: number;
	/** Raw base power (0 for non-damaging moves). */
	readonly power: number;
	/** Raw type id. No type enum exists at this layer. */
	readonly type: number;
	/** Raw accuracy byte (0–255 scale, not percent). Exposed unconverted. */
	readonly accuracy: number;
	/** Raw base PP. */
	readonly pp: number;
}

export interface CliTypeNameEntry {
	readonly id: number;
	readonly name: string;
}

export interface CliEffectivenessEntry {
	/** Raw attacking type id. No type enum exists at this layer. */
	readonly attacker: number;
	/** Raw defending type id. No type enum exists at this layer. */
	readonly defender: number;
	/** Raw multiplier byte. Exposed unconverted. */
	readonly multiplier: number;
}

export interface CliDataset {
	readonly meta: CliMeta;
	readonly pokemon: ReadonlyArray<CliPokemonEntry>;
	readonly moves: ReadonlyArray<CliMoveEntry>;
	readonly types: {
		readonly names: ReadonlyArray<CliTypeNameEntry>;
		readonly effectiveness: ReadonlyArray<CliEffectivenessEntry>;
	};
}

export interface CliResult {
	readonly exitCode: number;
	/** Full stdout payload (empty on error). */
	readonly stdout: string;
	/** Full stderr payload (empty on success). */
	readonly stderr: string;
}

/**
 * Builds the exportable dataset for an already-loaded ROM: identity plus
 * one entry per Pokédex number 1–151 (each joining the decoded name
 * via the order table with its base-stats entry), one entry per move
 * id 1–165 (decoded name plus raw move-data fields), the 27 type
 * names, and the effectiveness table in ROM order. Throws the same
 * library errors (`RomIdentityError`, `Gen1OrderError`,
 * `Gen1NameError`, `Gen1StatsError`, `Gen1MoveError`,
 * `Gen1MoveNameError`, `Gen1TypeNameError`,
 * `Gen1EffectivenessError`, …) callers already handle.
 */
export function buildDataset(reader: RomReader): CliDataset {
	const identity = identifyGen1Rom(reader);
	const pokemon: Array<CliPokemonEntry> = [];
	for (let dex = 1; dex <= GEN1_BASE_STATS_MAX_DEX; dex++) {
		const index = findGen1IndexByDex(reader, dex);
		const name = decodeGen1Name([...readGen1NameEntry(reader, index)]);
		const stats = readGen1BaseStats(reader, dex);
		pokemon.push({
			dex,
			name,
			baseStats: {
				dexNumber: stats.dexNumber,
				hp: stats.hp,
				attack: stats.attack,
				defense: stats.defense,
				speed: stats.speed,
				special: stats.special,
				type1: stats.type1,
				type2: stats.type2,
				catchRate: stats.catchRate,
				baseExp: stats.baseExp,
				spriteSize: stats.spriteSize,
				frontSprite: stats.frontSprite,
				backSprite: stats.backSprite,
				level1Moves: [...stats.level1Moves],
				growthRate: stats.growthRate,
				tmhm: [...stats.tmhm],
				padding: stats.padding,
			},
		});
	}
	const moves: Array<CliMoveEntry> = [];
	for (let id = GEN1_MOVE_FIRST_ID; id <= GEN1_MOVE_LAST_ID; id++) {
		const data = readGen1MoveData(reader, id);
		const name = decodeGen1MoveName([...readGen1MoveNameEntry(reader, id)]);
		moves.push({
			id,
			name,
			animationId: data.animationId,
			effect: data.effect,
			power: data.power,
			type: data.type,
			accuracy: data.accuracy,
			pp: data.pp,
		});
	}
	const names: Array<CliTypeNameEntry> = readAllGen1TypeNameEntries(reader).map(
		(entry, index) => ({
			id: GEN1_TYPE_FIRST_ID + index,
			name: decodeGen1TypeName([...entry]),
		}),
	);
	const effectiveness: Array<CliEffectivenessEntry> =
		readGen1EffectivenessTable(reader).map((entry) => ({
			attacker: entry.attacker,
			defender: entry.defender,
			multiplier: entry.multiplier,
		}));
	return {
		meta: {
			variant: identity.variant,
			title: identity.title,
			romSizeBytes: identity.romSizeBytes,
			bankCount: identity.bankCount,
			headerChecksumValid: identity.headerChecksum.valid,
			globalChecksumValid: identity.globalChecksum.valid,
		},
		pokemon,
		moves,
		types: { names, effectiveness },
	};
}

const CLI_USAGE = "Usage: gen1-rom-parser <rom-path>";

/**
 * Implements `gen1-rom-parser <rom-path>`: exactly one ROM path argument
 * (a Pokémon Red or Blue ROM file), JSON document on stdout,
 * diagnostics on stderr, non-zero exit on invalid input or any parsing
 * failure. `-h`/`--help` prints usage on stdout with a zero exit code.
 */
export function runCli(
	args: ReadonlyArray<string>,
	readFile: (path: string) => Buffer = readFileSync,
): CliResult {
	if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
		return { exitCode: 0, stdout: `${CLI_USAGE}\n`, stderr: "" };
	}
	if (args.length === 0 || args[0] === undefined || args[0] === "") {
		return {
			exitCode: 1,
			stdout: "",
			stderr: `Error: missing ROM path.\n${CLI_USAGE}\n`,
		};
	}
	if (args.length > 1) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: `Error: expected exactly one ROM path but got ${args.length}.\n${CLI_USAGE}\n`,
		};
	}
	let data: Buffer;
	try {
		data = readFile(args[0]);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			exitCode: 1,
			stdout: "",
			stderr: `Error: cannot read ROM file "${args[0]}": ${detail}\n`,
		};
	}
	try {
		const dataset = buildDataset(new RomReader(data));
		return {
			exitCode: 0,
			stdout: `${JSON.stringify(dataset, null, 2)}\n`,
			stderr: "",
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return { exitCode: 1, stdout: "", stderr: `Error: ${detail}\n` };
	}
}

function isMain(): boolean {
	const entry = process.argv[1];
	if (entry === undefined) {
		return false;
	}
	try {
		return import.meta.url === pathToFileURL(entry).href;
	} catch {
		return false;
	}
}

if (isMain()) {
	const result = runCli(process.argv.slice(2));
	if (result.stdout !== "") {
		process.stdout.write(result.stdout);
	}
	if (result.stderr !== "") {
		process.stderr.write(result.stderr);
	}
	process.exitCode = result.exitCode;
}
