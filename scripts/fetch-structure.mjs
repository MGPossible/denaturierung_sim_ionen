import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/data/1LYZ.pdb');
const sources = [
  { url: 'https://files.rcsb.org/download/1LYZ.pdb', compressed: false },
  { url: 'https://files.rcsb.org/view/1LYZ.pdb', compressed: false },
  { url: 'https://ftp.wwpdb.org/pub/pdb/data/structures/all/pdb/pdb1lyz.ent', compressed: false },
  { url: 'https://ftp.wwpdb.org/pub/pdb/data/structures/all/pdb/pdb1lyz.ent.gz', compressed: true },
];

function inspectPdb(pdb) {
  const lines = pdb.split(/\r?\n/);
  const header = lines.find((line) => line.startsWith('HEADER')) ?? '';
  const atoms = lines.filter((line) => line.startsWith('ATOM  '));
  const ca = atoms.filter((line) => line.slice(12, 16).trim() === 'CA' && line[21] === 'A');
  const residues = new Set(ca.map((line) => line.slice(22, 27).trim()));
  const ssbonds = lines.filter((line) => line.startsWith('SSBOND'));
  return {
    valid: /1LYZ/i.test(header) && ca.length === 129 && residues.size === 129 && ssbonds.length === 4,
    atoms: atoms.length,
    ca: ca.length,
    residues: residues.size,
    ssbonds: ssbonds.length,
  };
}

try {
  const existing = await readFile(target, 'utf8');
  const result = inspectPdb(existing);
  if (result.valid) {
    console.log(`Using checked-in 1LYZ.pdb (${result.atoms} atoms, ${result.ca} Cα positions, 4 S–S bonds).`);
    process.exit(0);
  }
  console.warn('Existing public/data/1LYZ.pdb failed validation; retrieving a clean official copy.');
} catch {
  // The official coordinate file is fetched below when it is not included in a clone.
}

let lastError;
for (const source of sources) {
  try {
    console.log(`Fetching experimental PDB coordinates from ${source.url}`);
    const response = await fetch(source.url, {
      headers: { 'User-Agent': 'LysozymeLab/1.1 educational application' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    const pdb = (source.compressed ? gunzipSync(data) : data).toString('utf8');
    const result = inspectPdb(pdb);
    if (!result.valid) {
      throw new Error(`Validation mismatch: ${result.ca} Cα positions, ${result.residues} residues, ${result.ssbonds} SSBOND records.`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, pdb, 'utf8');
    console.log(`Saved official 1LYZ: ${result.atoms} atoms, ${result.residues} residues, four disulfide bonds.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`Source unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

throw new Error(
  `Could not retrieve a valid experimental 1LYZ coordinate file. Download it from https://www.rcsb.org/structure/1LYZ and place it at public/data/1LYZ.pdb. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
);
