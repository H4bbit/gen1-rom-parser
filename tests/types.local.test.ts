// Opt-in local integration check: verifies the type-name pointer
// table and the effectiveness table against real Red/Blue images.
// Requires copyrighted ROM files that are never committed:
//
//   GEN1_ROM_RED=/path/to/red.gb GEN1_ROM_BLUE=/path/to/blue.gb npm run test:roms
//
// Each variable is optional; unset variables are skipped without failing.
//
// Unlike tests/type-names.test.ts and tests/effectiveness.test.ts
// (synthetic fixtures), this suite reads the real structures: the
// 27-entry pointer table at 0x27DAE with its 16 name strings at
// 0x27DE4–0x27E49, and the 82-entry effectiveness table at 0x3E474
// with its 0xFF sentinel — through the committed parser APIs. It also
// checks the cross-structure invariant that every type id used by
// moves, base stats, and the effectiveness table resolves to a name.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
	GEN1_EFFECTIVENESS_SENTINEL,
	GEN1_EFFECTIVENESS_TABLE_OFFSET,
	readGen1EffectivenessTable,
} from "../src/gen1/Gen1Effectiveness.ts";
import { GEN1_MOVE_LAST_ID, readGen1MoveData } from "../src/gen1/Gen1Moves.ts";
import { readGen1BaseStats } from "../src/gen1/Gen1Stats.ts";
import { decodeGen1TypeName } from "../src/gen1/Gen1Text.ts";
import {
	GEN1_TYPE_LAST_ID,
	GEN1_TYPE_NAMES_POINTER_COUNT,
	GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET,
	GEN1_TYPE_NAMES_REGION_END,
	GEN1_TYPE_NAMES_REGION_START,
	readAllGen1TypeNameEntries,
	readGen1TypeNameEntry,
} from "../src/gen1/Gen1TypeNames.ts";
import { RomReader } from "../src/rom/RomReader.ts";

/** Multiplier bytes observed across all 82 entries in both ROMs. */
const OBSERVED_MULTIPLIERS = new Set([0x00, 0x05, 0x14]);

/** Type-id domain observed across moves, base stats, and effectiveness. */
const OBSERVED_TYPE_IDS = new Set([
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x14, 0x15, 0x16, 0x17, 0x18,
	0x19, 0x1a,
]);

const EXPECTED_NAMES = [
	"NORMAL",
	"FIGHTING",
	"FLYING",
	"POISON",
	"GROUND",
	"ROCK",
	"BIRD",
	"BUG",
	"GHOST",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"NORMAL",
	"FIRE",
	"WATER",
	"GRASS",
	"ELECTRIC",
	"PSYCHIC",
	"ICE",
	"DRAGON",
];

const cases = [
	{ envName: "GEN1_ROM_RED", label: "red" },
	{ envName: "GEN1_ROM_BLUE", label: "blue" },
] as const;

for (const { envName, label } of cases) {
	const path = process.env[envName];
	if (path === undefined || path === "") {
		describe(`real ${label} types (opt-in)`, () => {
			it(`skipped: set ${envName} to enable`, () => {
				assert.ok(true, "no ROM path configured; skipping");
			});
		});
	} else {
		const romPath: string = path;
		describe(`real ${label} types (opt-in)`, () => {
			it("resolves all 27 type ids to the expected names via pointers", () => {
				const reader = new RomReader(readFileSync(romPath));
				const entries = readAllGen1TypeNameEntries(reader);
				assert.equal(entries.length, GEN1_TYPE_NAMES_POINTER_COUNT);
				const names = entries.map((entry) => decodeGen1TypeName([...entry]));
				assert.deepEqual(names, EXPECTED_NAMES);
				assert.equal(GEN1_TYPE_NAMES_POINTER_TABLE_OFFSET, 0x27dae);
				assert.equal(GEN1_TYPE_NAMES_REGION_START, 0x27de4);
				assert.equal(GEN1_TYPE_NAMES_REGION_END, 0x27e4a);
				assert.equal(GEN1_TYPE_LAST_ID, 0x1a);
			});

			it("reads 82 effectiveness entries with observed multipliers", () => {
				const reader = new RomReader(readFileSync(romPath));
				const entries = readGen1EffectivenessTable(reader);
				assert.equal(entries.length, 82);
				const seen = new Set<string>();
				for (const entry of entries) {
					assert.ok(
						OBSERVED_TYPE_IDS.has(entry.attacker),
						`attacker 0x${entry.attacker.toString(16)}`,
					);
					assert.ok(
						OBSERVED_TYPE_IDS.has(entry.defender),
						`defender 0x${entry.defender.toString(16)}`,
					);
					assert.ok(
						OBSERVED_MULTIPLIERS.has(entry.multiplier),
						`multiplier 0x${entry.multiplier.toString(16)}`,
					);
					const key = `${entry.attacker}:${entry.defender}`;
					assert.ok(!seen.has(key), `duplicate pair ${key}`);
					seen.add(key);
				}
				// Sentinel sits exactly after the 82nd entry.
				assert.equal(
					reader.byteAt(GEN1_EFFECTIVENESS_TABLE_OFFSET + 82 * 3),
					GEN1_EFFECTIVENESS_SENTINEL,
				);
				// Spot checks: first and last real entries.
				assert.deepEqual(
					{ ...entries[0] },
					{ attacker: 0x15, defender: 0x14, multiplier: 0x14 },
				);
				assert.deepEqual(
					{ ...entries[81] },
					{ attacker: 0x1a, defender: 0x1a, multiplier: 0x14 },
				);
			});

			it("names every type id used by moves, stats, and effectiveness", () => {
				const reader = new RomReader(readFileSync(romPath));
				const used = new Set<number>();
				for (let id = 1; id <= GEN1_MOVE_LAST_ID; id++) {
					used.add(readGen1MoveData(reader, id).type);
				}
				for (let dex = 1; dex <= 151; dex++) {
					const stats = readGen1BaseStats(reader, dex);
					used.add(stats.type1);
					used.add(stats.type2);
				}
				for (const entry of readGen1EffectivenessTable(reader)) {
					used.add(entry.attacker);
					used.add(entry.defender);
				}
				assert.deepEqual(
					[...used].sort((a, b) => a - b),
					[...OBSERVED_TYPE_IDS].sort((a, b) => a - b),
				);
				for (const typeId of used) {
					const name = decodeGen1TypeName([
						...readGen1TypeNameEntry(reader, typeId),
					]);
					assert.ok(name.length >= 3, `type 0x${typeId.toString(16)}`);
				}
			});
		});
	}
}
