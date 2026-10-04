// Opt-in local integration check: verifies the Phase 1 CLI dataset
// export against real Red/Blue images. Requires copyrighted ROM files
// that are never committed:
//
//   GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
//
// Each variable is optional; unset variables are skipped without failing.
//
// Unlike tests/cli.test.ts (synthetic fixture with synthetic move/type
// names), this suite runs buildDataset/runCli on the real tables and
// asserts the full counts 151 / 165 / 27 / 82 plus sample sanity
// (move 1 POUND, dex 25 PIKACHU, type id 23 ELECTRIC).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildDataset, runCli } from "../src/cli.ts";
import { GEN1_HEADER } from "../src/rom/RomIdentity.ts";
import { RomReader } from "../src/rom/RomReader.ts";

const cases = [
	{
		envName: "GEN1_ROM_RED",
		label: "red",
		variant: "red",
		title: "POKEMON RED",
	},
	{
		envName: "GEN1_ROM_BLUE",
		label: "blue",
		variant: "blue",
		title: "POKEMON BLUE",
	},
] as const;

for (const { envName, label, variant, title } of cases) {
	const path = process.env[envName];
	if (path === undefined || path === "") {
		describe(`real ${label} CLI dataset (opt-in)`, () => {
			it(`skipped: set ${envName} to enable`, () => {
				assert.ok(true, "no ROM path configured; skipping");
			});
		});
	} else {
		const romPath: string = path;
		describe(`real ${label} CLI dataset (opt-in)`, () => {
			it("exports meta, 151 pokemon, 165 moves, 27 names, 82 effectiveness entries", () => {
				const dataset = buildDataset(new RomReader(readFileSync(romPath)));
				assert.deepEqual(
					{ ...dataset.meta },
					{
						variant,
						title,
						romSizeBytes: GEN1_HEADER.romLengthBytes,
						bankCount: GEN1_HEADER.bankCount,
						headerChecksumValid: true,
						globalChecksumValid: true,
					},
				);
				assert.equal(dataset.pokemon.length, 151);
				assert.equal(dataset.moves.length, 165);
				assert.equal(dataset.types.names.length, 27);
				assert.equal(dataset.types.effectiveness.length, 82);
			});

			it("matches sample sanity values from the ROM", () => {
				const dataset = buildDataset(new RomReader(readFileSync(romPath)));
				assert.deepEqual(
					{ ...dataset.moves[0] },
					{
						id: 1,
						name: "POUND",
						animationId: 1,
						effect: 0x00,
						power: 0x28,
						type: 0x00,
						accuracy: 0xff,
						pp: 0x23,
					},
				);
				assert.equal(dataset.pokemon[24]?.dex, 25);
				assert.equal(dataset.pokemon[24]?.name, "PIKACHU");
				assert.deepEqual(dataset.pokemon[24]?.learnset, {
					levelUp: [
						{ level: 9, move: 86 },
						{ level: 16, move: 98 },
						{ level: 26, move: 129 },
						{ level: 33, move: 97 },
						{ level: 43, move: 87 },
					],
					tmhm: [
						5, 25, 92, 34, 36, 38, 6, 66, 69, 99, 85, 87, 102, 104, 115, 117,
						129, 130, 156, 86, 164, 148,
					],
				});
				assert.equal(dataset.types.names[23]?.id, 23);
				assert.equal(dataset.types.names[23]?.name, "ELECTRIC");
			});

			it("prints deterministic JSON through runCli", () => {
				const first = runCli([romPath]);
				const second = runCli([romPath]);
				assert.equal(first.exitCode, 0);
				assert.equal(first.stderr, "");
				assert.equal(first.stdout, second.stdout);
				const parsed = JSON.parse(first.stdout) as {
					meta: { variant: string };
					pokemon: Array<{
						dex: number;
						learnset: {
							levelUp: Array<{ level: number; move: number }>;
							tmhm: Array<number>;
						};
					}>;
					moves: Array<{ id: number }>;
					types: {
						names: Array<unknown>;
						effectiveness: Array<unknown>;
					};
				};
				assert.deepEqual(Object.keys(parsed), [
					"meta",
					"pokemon",
					"moves",
					"types",
				]);
				assert.equal(parsed.meta.variant, variant);
				assert.equal(parsed.pokemon.length, 151);
				assert.ok(
					parsed.pokemon.every(
						(entry) =>
							Array.isArray(entry.learnset?.levelUp) &&
							entry.learnset.levelUp.every(
								(pair) =>
									Number.isInteger(pair.level) && Number.isInteger(pair.move),
							) &&
							Array.isArray(entry.learnset?.tmhm) &&
							entry.learnset.tmhm.every(
								(move) => Number.isInteger(move) && move >= 1 && move <= 165,
							),
					),
					"every pokemon entry carries learnset.levelUp pairs and learnset.tmhm move ids",
				);
				assert.deepEqual(parsed.pokemon[24]?.learnset, {
					levelUp: [
						{ level: 9, move: 86 },
						{ level: 16, move: 98 },
						{ level: 26, move: 129 },
						{ level: 33, move: 97 },
						{ level: 43, move: 87 },
					],
					tmhm: [
						5, 25, 92, 34, 36, 38, 6, 66, 69, 99, 85, 87, 102, 104, 115, 117,
						129, 130, 156, 86, 164, 148,
					],
				});
				// Mew's all-0xFF bitfield teaches the full 55-move table.
				assert.deepEqual(
					parsed.pokemon[150]?.learnset.tmhm,
					[
						5, 13, 14, 18, 25, 92, 32, 34, 36, 38, 61, 55, 58, 59, 63, 6, 66,
						68, 69, 99, 72, 76, 82, 85, 87, 89, 90, 91, 94, 100, 102, 104, 115,
						117, 118, 120, 121, 126, 129, 130, 135, 138, 143, 156, 86, 149, 153,
						157, 161, 164, 15, 19, 57, 70, 148,
					],
				);
				assert.equal(parsed.moves.length, 165);
				assert.equal(parsed.types.names.length, 27);
				assert.equal(parsed.types.effectiveness.length, 82);
			});
		});
	}
}
