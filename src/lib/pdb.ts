export type SecondaryType = 'helix' | 'sheet' | 'loop';

export interface ProteinResidue {
  seq: number;
  aa: string;
  xyz: [number, number, number];
  secondary: SecondaryType;
}

export interface SulfurAtom {
  residue: number;
  xyz: [number, number, number];
}

export interface DisulfideBond {
  a: number;
  b: number;
}

export interface ProteinModel {
  id: string;
  chain: string;
  residues: ProteinResidue[];
  sulfurs: SulfurAtom[];
  disulfides: DisulfideBond[];
  atomCount: number;
  resolution: string;
}

const threeLetterToOne: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
  HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
  THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

type Range = { start: number; end: number; type: 'helix' | 'sheet' };

function numberAt(line: string, start: number, end: number): number | null {
  const parsed = Number.parseInt(line.slice(start, end).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function vectorAt(line: string): [number, number, number] | null {
  const x = Number.parseFloat(line.slice(30, 38));
  const y = Number.parseFloat(line.slice(38, 46));
  const z = Number.parseFloat(line.slice(46, 54));
  if (![x, y, z].every(Number.isFinite)) return null;
  return [x, y, z];
}

function parseBondDistance(a: SulfurAtom, b: SulfurAtom): number {
  return Math.hypot(a.xyz[0] - b.xyz[0], a.xyz[1] - b.xyz[1], a.xyz[2] - b.xyz[2]);
}

/** Parse the fixed-width PDB format and retain the experimental C-alpha trace. */
export function parsePdb(text: string): ProteinModel {
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => line.startsWith('HEADER')) ?? '';
  const id = header.slice(62, 66).trim().toUpperCase() || '1LYZ';
  const resolution = lines.find((line) => line.startsWith('REMARK   2 RESOLUTION.'))?.slice(23, 38).trim() ?? '2.00 Å';
  const ranges: Range[] = [];
  const sulfurByResidue = new Map<number, SulfurAtom>();
  const alphaCarbons = new Map<number, ProteinResidue>();
  const explicitBonds: DisulfideBond[] = [];
  let chain = 'A';
  let atomCount = 0;

  for (const line of lines) {
    if (line.startsWith('HELIX ')) {
      const start = numberAt(line, 21, 25);
      const end = numberAt(line, 33, 37);
      if (start !== null && end !== null) ranges.push({ start, end, type: 'helix' });
      continue;
    }
    if (line.startsWith('SHEET ')) {
      const start = numberAt(line, 22, 26);
      const end = numberAt(line, 33, 37);
      if (start !== null && end !== null) ranges.push({ start, end, type: 'sheet' });
      continue;
    }
    if (line.startsWith('SSBOND')) {
      const a = numberAt(line, 17, 21);
      const b = numberAt(line, 31, 35);
      if (a !== null && b !== null) explicitBonds.push({ a, b });
      continue;
    }
    if (!line.startsWith('ATOM  ')) continue;

    atomCount += 1;
    const atomName = line.slice(12, 16).trim();
    const altLoc = line[16];
    if (altLoc && altLoc !== ' ' && altLoc !== 'A') continue;
    const residueName = line.slice(17, 20).trim();
    const residue = numberAt(line, 22, 26);
    const position = vectorAt(line);
    if (residue === null || !position) continue;
    const thisChain = line[21] || 'A';
    if (atomName === 'CA') {
      chain = thisChain;
      const aa = threeLetterToOne[residueName] ?? 'X';
      if (!alphaCarbons.has(residue)) {
        alphaCarbons.set(residue, { seq: residue, aa, xyz: position, secondary: 'loop' });
      }
    }
    if (atomName === 'SG' && residueName === 'CYS' && !sulfurByResidue.has(residue)) {
      sulfurByResidue.set(residue, { residue, xyz: position });
    }
  }

  for (const range of ranges) {
    for (const [seq, residue] of alphaCarbons) {
      if (seq >= range.start && seq <= range.end) residue.secondary = range.type;
    }
  }

  const residues = [...alphaCarbons.values()].sort((a, b) => a.seq - b.seq);
  const sulfurs = [...sulfurByResidue.values()].sort((a, b) => a.residue - b.residue);
  const sulfurMap = new Map<number, SulfurAtom>();
  sulfurs.forEach((atom) => sulfurMap.set(atom.residue, atom));
  const disulfides = explicitBonds.filter((bond) => sulfurMap.has(bond.a) && sulfurMap.has(bond.b));

  // Some older PDB files omit SSBOND records. In that case identify close CYS-SG pairs.
  if (disulfides.length === 0) {
    const candidates: Array<{ a: number; b: number; distance: number }> = [];
    for (let i = 0; i < sulfurs.length; i += 1) {
      for (let j = i + 1; j < sulfurs.length; j += 1) {
        const distance = parseBondDistance(sulfurs[i], sulfurs[j]);
        if (distance < 2.5) candidates.push({ a: sulfurs[i].residue, b: sulfurs[j].residue, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const used = new Set<number>();
    for (const candidate of candidates) {
      if (!used.has(candidate.a) && !used.has(candidate.b)) {
        disulfides.push({ a: candidate.a, b: candidate.b });
        used.add(candidate.a);
        used.add(candidate.b);
      }
    }
  }

  if (residues.length !== 129) {
    throw new Error(`Die PDB-Datei enthält ${residues.length} Cα-Positionen. Für 1LYZ werden exakt 129 Residuen erwartet.`);
  }
  if (chain !== 'A') {
    throw new Error(`Es wurde Kette ${chain} statt der erwarteten Lysozym-Kette A gelesen.`);
  }
  if (disulfides.length !== 4) {
    throw new Error(`Es wurden ${disulfides.length} Disulfidbrücken erkannt. Für das nicht reduzierte 1LYZ-Modell werden vier erwartet.`);
  }
  if (id !== '1LYZ') {
    throw new Error(`Es wurde PDB ${id} geladen. Bitte die experimentelle Struktur 1LYZ verwenden.`);
  }

  return { id, chain, residues, sulfurs, disulfides, atomCount, resolution };
}
