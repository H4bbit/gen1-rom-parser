import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildDataset, runCli } from "../src/cli.ts";
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

// Full 1 MiB synthetic image: valid Red-clone header/checksums plus
// populated name, order and base-stats tables, so the CLI can run its
// whole pipeline (identify + all 151 dex reads) without a real ROM.
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
		entry[GEN1_BASE_STATS_ENTRY_LENGTH - 1] = 0x00;
		const offset =
			dex <= 150
				? GEN1_BASE_STATS_OFFSET + (dex - 1) * GEN1_BASE_STATS_ENTRY_LENGTH
				: GEN1_MEW_BASE_STATS_OFFSET;
		entry.copy(rom, offset);
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

describe("CLI dataset builder", () => {
	it("emits the ROM variant and all 151 pokemon sorted by dex", () => {
		const dataset = buildDataset(new RomReader(makeCliRom()));
		assert.equal(dataset.rom.variant, "red");
		assert.equal(dataset.pokemon.length, 151);
		for (let i = 0; i < dataset.pokemon.length; i++) {
			const entry = dataset.pokemon[i];
			assert.equal(entry?.dex, i + 1);
			assert.equal(entry?.name, dexName(i + 1));
			assert.equal(entry?.baseStats.dexNumber, i + 1);
		}
	});

	it("is deterministic across runs", () => {
		const reader = new RomReader(makeCliRom());
		assert.deepEqual(buildDataset(reader), buildDataset(reader));
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
		const parsed = JSON.parse(first.stdout) as {
			rom: { variant: string };
			pokemon: Array<{ dex: number; name: string }>;
		};
		assert.equal(parsed.rom.variant, "red");
		assert.equal(parsed.pokemon.length, 151);
		assert.equal(parsed.pokemon[0]?.dex, 1);
		assert.equal(parsed.pokemon[150]?.dex, 151);
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
		const parsed = JSON.parse(stdout) as {
			rom: { variant: string };
			pokemon: Array<{ dex: number; name: string; baseStats: object }>;
		};
		assert.equal(parsed.rom.variant, "red");
		assert.equal(parsed.pokemon.length, 151);
		assert.equal(parsed.pokemon[0]?.name, dexName(1));
		assert.equal(typeof parsed.pokemon[0]?.baseStats, "object");
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
