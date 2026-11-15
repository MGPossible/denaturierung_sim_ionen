import { readFile } from 'node:fs/promises';
import { parseSsbondRecord, validateSgDistance } from './disulfide-validation.mjs';

const path = new URL('../public/data/1LYZ.pdb', import.meta.url);
const pdb = await readFile(path, 'utf8');
const lines = pdb.split(/\r?\n/);
const header = lines.find((line) => line.startsWith('HEADER')) ?? '';
const atoms = lines.filter((line) => line.startsWith('ATOM  '));
const chainA = atoms.filter((line) => line[21] === 'A');
const ca = chainA.filter((line) => line.slice(12, 16).trim() === 'CA');
const residueNumbers = new Set(ca.map((line) => line.slice(22, 27).trim()));
const ssbonds = lines.filter((line) => line.startsWith('SSBOND'));
const badCoordinates = ca.filter((line) => ![30, 38, 46].every((start) => Number.isFinite(Number.parseFloat(line.slice(start, start + 8)))));

if (!/1LYZ/i.test(header)) throw new Error('PDB header does not identify entry 1LYZ.');
if (ca.length !== 129 || residueNumbers.size !== 129) {
  throw new Error(`Expected 129 Cα positions in chain A; found ${ca.length} atoms / ${residueNumbers.size} unique residues.`);
}
if (ssbonds.length !== 4) throw new Error(`Expected four native SSBOND records; found ${ssbonds.length}.`);
const disulfidePairs = ssbonds.map(parseSsbondRecord).sort((a, b) => a.key.localeCompare(b.key));
if (disulfidePairs.some((pair) => pair.chainA !== 'A' || pair.chainB !== 'A')) {
  throw new Error('All four native 1LYZ disulfide bonds must belong to chain A.');
}
const expectedPairs = ['30-115', '6-127', '64-80', '76-94'];
if (expectedPairs.some((pair, index) => disulfidePairs[index]?.key !== pair)) {
  throw new Error(`Unexpected 1LYZ disulfide connectivity. Expected ${expectedPairs.join(', ')}; found ${disulfidePairs.map((pair) => pair.key).join(', ')}.`);
}
const atomCoordinates = new Map();
for (const line of chainA) {
  const atomName = line.slice(12, 16).trim();
  const residue = Number.parseInt(line.slice(22, 26).trim(), 10);
  if (!['CB', 'SG'].includes(atomName)) continue;
  const xyz = [30, 38, 46].map((start) => Number.parseFloat(line.slice(start, start + 8)));
  if (xyz.every(Number.isFinite)) atomCoordinates.set(`${residue}:${atomName}`, xyz);
}
const validatedDisulfides = [];
for (const pair of disulfidePairs) {
  for (const residue of [pair.a, pair.b]) {
    if (!atomCoordinates.has(`${residue}:CB`) || !atomCoordinates.has(`${residue}:SG`)) {
      throw new Error(`Missing experimental Cβ/Sγ coordinates for disulfide cysteine ${residue}.`);
    }
  }
  const sulfurA = atomCoordinates.get(`${pair.a}:SG`);
  const sulfurB = atomCoordinates.get(`${pair.b}:SG`);
  const sgDistance = Math.hypot(...sulfurA.map((value, index) => value - sulfurB[index]));
  // The deposited 1LYZ SSBOND distances are not all close to the idealised
  // ~2.0 Å value. Compare coordinates to the entry's own SSBOND annotation
  // instead of rejecting the authentic experimental model at an arbitrary cutoff.
  validatedDisulfides.push(validateSgDistance(pair, sgDistance));
}
if (badCoordinates.length) throw new Error(`Found ${badCoordinates.length} Cα records with invalid coordinates.`);

console.log(`Validated experimental PDB 1LYZ: ${atoms.length} ATOM records; 129 Cα positions in chain A; native disulfides ${validatedDisulfides.map(({ a, b, measuredDistance }) => `Cys ${a}–${b} ${measuredDistance.toFixed(2)} Å`).join(', ')}. Sγ distances match the deposited SSBOND annotations.`);
