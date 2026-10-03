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
	decodeGen1Name,
	findGen1IndexByDex,
	GEN1_BASE_STATS_MAX_DEX,
	type Gen1Variant,
	identifyGen1Rom,
	RomReader,
	readGen1BaseStats,
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

export interface CliDataset {
	readonly rom: {
		readonly variant: Gen1Variant;
	};
	readonly pokemon: ReadonlyArray<CliPokemonEntry>;
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
 * one entry per Pokédex number 1–151, each joining the decoded name
 * (via the order table) with its base-stats entry. Throws the same
 * library errors (`RomIdentityError`, `Gen1OrderError`,
 * `Gen1NameError`, `Gen1StatsError`, …) callers already handle.
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
	return { rom: { variant: identity.variant }, pokemon };
}

/**
 * Implements `gen1-rom-parser <rom>`: exactly one ROM path argument,
 * JSON document on stdout, diagnostics on stderr, non-zero exit on
 * invalid input or any parsing failure.
 */
export function runCli(
	args: ReadonlyArray<string>,
	readFile: (path: string) => Buffer = readFileSync,
): CliResult {
	if (args.length !== 1 || args[0] === undefined || args[0] === "") {
		return {
			exitCode: 1,
			stdout: "",
			stderr: "Usage: gen1-rom-parser <rom>\n",
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
