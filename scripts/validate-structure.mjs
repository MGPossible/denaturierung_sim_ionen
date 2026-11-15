import { readFile } from 'node:fs/promises';

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
if (badCoordinates.length) throw new Error(`Found ${badCoordinates.length} Cα records with invalid coordinates.`);

console.log(`Validated experimental PDB 1LYZ: ${atoms.length} ATOM records; 129 Cα positions in chain A; four disulfide bridges.`);
