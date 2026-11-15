export type SecondaryType = 'helix' | 'sheet' | 'loop';
export type SiteCharge = 'positive' | 'negative';
export type InteractionSiteKind = SiteCharge | 'carbonyl';
export type Vec3Tuple = [number, number, number];

export interface ProteinResidue {
  seq: number;
  aa: string;
  xyz: Vec3Tuple;
  secondary: SecondaryType;
}

export interface SulfurAtom {
  residue: number;
  xyz: Vec3Tuple;
}

export interface DisulfideBond {
  a: number;
  b: number;
}

export interface ChargedSite {
  residue: number;
  charge: SiteCharge;
  xyz: Vec3Tuple;
  atoms: Vec3Tuple[];
}

export interface InteractionTarget {
  residue: number;
  kind: 'negative' | 'carbonyl';
  xyz: Vec3Tuple;
}

export interface HydrogenBond {
  acceptor: number;
  donor: number;
  acceptorXYZ: Vec3Tuple;
  donorXYZ: Vec3Tuple;
  kind: 'helix' | 'sheet';
  distance: number;
}

export interface IonicContact {
  positiveResidue: number;
  negativeResidue: number;
  positiveXYZ: Vec3Tuple;
  negativeXYZ: Vec3Tuple;
  distance: number;
}

export interface ProteinModel {
  id: string;
  chain: string;
  residues: ProteinResidue[];
  sulfurs: SulfurAtom[];
  disulfides: DisulfideBond[];
  chargedSites: ChargedSite[];
  gdmTargets: InteractionTarget[];
  hydrogenBonds: HydrogenBond[];
  ionicContacts: IonicContact[];
  atomCount: number;
  resolution: string;
}

const threeLetterToOne: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
  HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
  THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

type Range = { start: number; end: number; type: 'helix' | 'sheet' };
type ResidueAtoms = {
  residueName: string;
  charged: Map<string, Vec3Tuple>;
  nitrogen?: Vec3Tuple;
  carbonylOxygen?: Vec3Tuple;
};

function numberAt(line: string, start: number, end: number): number | null {
  const parsed = Number.parseInt(line.slice(start, end).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function vectorAt(line: string): Vec3Tuple | null {
  const x = Number.parseFloat(line.slice(30, 38));
  const y = Number.parseFloat(line.slice(38, 46));
  const z = Number.parseFloat(line.slice(46, 54));
  if (![x, y, z].every(Number.isFinite)) return null;
  return [x, y, z];
}

function distance(a: Vec3Tuple, b: Vec3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function centroid(points: Vec3Tuple[]): Vec3Tuple {
  const total = points.reduce<Vec3Tuple>((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]], [0, 0, 0]);
  return [total[0] / points.length, total[1] / points.length, total[2] / points.length];
}

function minimumDistance(a: Vec3Tuple[], b: Vec3Tuple[]): number {
  let result = Number.POSITIVE_INFINITY;
  for (const pointA of a) for (const pointB of b) result = Math.min(result, distance(pointA, pointB));
  return result;
}

function buildHydrogenBonds(residues: ProteinResidue[], atomsByResidue: Map<number, ResidueAtoms>): HydrogenBond[] {
  const bySeq = new Map<number, ProteinResidue>(
    residues.map((residue): [number, ProteinResidue] => [residue.seq, residue]),
  );
  const bonds: HydrogenBond[] = [];
  const seen = new Set<string>();
  const add = (acceptor: number, donor: number, kind: 'helix' | 'sheet') => {
    const acceptorAtom = atomsByResidue.get(acceptor)?.carbonylOxygen;
    const donorAtom = atomsByResidue.get(donor)?.nitrogen;
    if (!acceptorAtom || !donorAtom) return;
    const separation = distance(acceptorAtom, donorAtom);
    if (separation < 2.45 || separation > 3.65) return;
    const key = `${acceptor}:${donor}`;
    if (seen.has(key)) return;
    seen.add(key);
    bonds.push({ acceptor, donor, acceptorXYZ: acceptorAtom, donorXYZ: donorAtom, kind, distance: separation });
  };

  // Alpha-helical i -> i+4 backbone contacts, using the actual PDB O and N atoms.
  for (const residue of residues) {
    const donor = bySeq.get(residue.seq + 4);
    if (residue.secondary === 'helix' && donor?.secondary === 'helix') add(residue.seq, donor.seq, 'helix');
  }

  // Beta-sheet backbone contacts: only non-local O...N pairs that are also close in space.
  const sheetResidues = residues.filter((residue) => residue.secondary === 'sheet');
  for (let i = 0; i < sheetResidues.length; i += 1) {
    for (let j = i + 1; j < sheetResidues.length; j += 1) {
      const a = sheetResidues[i];
      const b = sheetResidues[j];
      if (Math.abs(a.seq - b.seq) < 4 || distance(a.xyz, b.xyz) > 8.5) continue;
      add(a.seq, b.seq, 'sheet');
      add(b.seq, a.seq, 'sheet');
    }
  }
  return bonds;
}

/** Parse the fixed-width PDB format and retain the experimental C-alpha and selected all-atom contacts. */
export function parsePdb(text: string): ProteinModel {
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => line.startsWith('HEADER')) ?? '';
  const id = header.slice(62, 66).trim().toUpperCase() || '1LYZ';
  const resolution = lines.find((line) => line.startsWith('REMARK   2 RESOLUTION.'))?.slice(23, 38).trim() ?? '2.00 Å';
  const ranges: Range[] = [];
  const sulfurByResidue = new Map<number, SulfurAtom>();
  const alphaCarbons = new Map<number, ProteinResidue>();
  const atomsByResidue = new Map<number, ResidueAtoms>();
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

    const thisChain = line[21] || 'A';
    if (thisChain !== 'A') continue;
    const altLoc = line[16];
    if (altLoc && altLoc !== ' ' && altLoc !== 'A') continue;

    atomCount += 1;
    const atomName = line.slice(12, 16).trim();
    const residueName = line.slice(17, 20).trim();
    const residue = numberAt(line, 22, 26);
    const position = vectorAt(line);
    if (residue === null || !position) continue;

    if (!atomsByResidue.has(residue)) atomsByResidue.set(residue, { residueName, charged: new Map() });
    const residueAtoms = atomsByResidue.get(residue)!;
    if (atomName === 'N') residueAtoms.nitrogen = position;
    if (atomName === 'O') residueAtoms.carbonylOxygen = position;

    const chargedAtomNames =
      residueName === 'ASP' ? ['OD1', 'OD2'] :
      residueName === 'GLU' ? ['OE1', 'OE2'] :
      residueName === 'LYS' ? ['NZ'] :
      residueName === 'ARG' ? ['NE', 'NH1', 'NH2'] :
      residueName === 'HIS' ? ['ND1', 'NE2'] : [];
    if (chargedAtomNames.includes(atomName) && !residueAtoms.charged.has(atomName)) {
      residueAtoms.charged.set(atomName, position);
    }

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

  if (disulfides.length === 0) {
    const candidates: Array<{ a: number; b: number; distance: number }> = [];
    for (let i = 0; i < sulfurs.length; i += 1) {
      for (let j = i + 1; j < sulfurs.length; j += 1) {
        const separation = distance(sulfurs[i].xyz, sulfurs[j].xyz);
        if (separation < 2.5) candidates.push({ a: sulfurs[i].residue, b: sulfurs[j].residue, distance: separation });
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

  const chargedSites: ChargedSite[] = [];
  const gdmTargets: InteractionTarget[] = [];
  for (const [seq, atoms] of atomsByResidue) {
    const names = [...atoms.charged.keys()];
    if (names.length) {
      const points = names.map((name) => atoms.charged.get(name)!);
      const isNegative = atoms.residueName === 'ASP' || atoms.residueName === 'GLU';
      const isPositive = atoms.residueName === 'LYS' || atoms.residueName === 'ARG' || atoms.residueName === 'HIS';
      if (isNegative || isPositive) {
        const site: ChargedSite = { residue: seq, charge: isNegative ? 'negative' : 'positive', xyz: centroid(points), atoms: points };
        chargedSites.push(site);
        if (isNegative) gdmTargets.push({ residue: seq, kind: 'negative', xyz: site.xyz });
      }
    }
    if (atoms.carbonylOxygen) gdmTargets.push({ residue: seq, kind: 'carbonyl', xyz: atoms.carbonylOxygen });
  }

  const positives = chargedSites.filter((site) => site.charge === 'positive');
  const negatives = chargedSites.filter((site) => site.charge === 'negative');
  const ionicContacts: IonicContact[] = [];
  for (const positive of positives) {
    for (const negative of negatives) {
      const separation = minimumDistance(positive.atoms, negative.atoms);
      if (separation <= 4.2) {
        ionicContacts.push({
          positiveResidue: positive.residue,
          negativeResidue: negative.residue,
          positiveXYZ: positive.xyz,
          negativeXYZ: negative.xyz,
          distance: separation,
        });
      }
    }
  }
  ionicContacts.sort((a, b) => a.distance - b.distance);

  const hydrogenBonds = buildHydrogenBonds(residues, atomsByResidue);

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

  return { id, chain, residues, sulfurs, disulfides, chargedSites, gdmTargets, hydrogenBonds, ionicContacts, atomCount, resolution };
}
