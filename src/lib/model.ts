import type { ProteinModel, ProteinResidue, SecondaryType, SulfurAtom } from './pdb';

export interface ModelIndicators {
  unfolded: number;
  reversible: number;
  trapped: number;
  native: number;
  helixRetention: number;
  sheetRetention: number;
  order: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// Didactic hysteresis boundary: above this point the model accumulates a
// kinetically trapped fraction that cannot fully return to the native state.
// It is a teaching parameter, not an experimentally established 1LYZ threshold.
export const IRREVERSIBLE_ONSET_INDEX = 0.82;
export const MAX_TRAPPED_FRACTION = 0.42;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * Illustrative, normalised denaturation coordinate for the teaching model.
 * It is deliberately NOT an experimental fit or a universal GdmCl midpoint.
 */
export function getUnfoldedIndex(concentration: number): number {
  const c = Math.max(0, Math.min(8, concentration));
  const logistic = (value: number) => 1 / (1 + Math.exp(-1.35 * (value - 5.25)));
  const atZero = logistic(0);
  const atEight = logistic(8);
  return clamp01((logistic(c) - atZero) / (atEight - atZero));
}

/**
 * Same class-specific retention functions drive both the viewer geometry and
 * the visible bars. They are visual/model indices, not measured percentages.
 */
export function getSecondaryRetention(amount: number, type: SecondaryType): number {
  const u = clamp01(amount);
  if (type === 'helix') return 1 - 0.94 * smoothstep(0.06, 0.92, u);
  if (type === 'sheet') return 1 - 0.96 * smoothstep(0.12, 0.96, u);
  return 1 - 0.55 * u;
}

export function getTrappedFraction(peakConcentration: number): number {
  const peakIndex = getUnfoldedIndex(peakConcentration);
  return MAX_TRAPPED_FRACTION * smoothstep(IRREVERSIBLE_ONSET_INDEX, 1, peakIndex);
}

export function getIrreversibleThresholdConcentration(): number {
  let low = 0;
  let high = 8;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) / 2;
    if (getUnfoldedIndex(middle) < IRREVERSIBLE_ONSET_INDEX) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function getIndicators(concentration: number, peakConcentration = concentration): ModelIndicators {
  const reversible = getUnfoldedIndex(concentration);
  const trapped = getTrappedFraction(peakConcentration);
  const unfolded = 1 - (1 - reversible) * (1 - trapped);
  return {
    unfolded,
    reversible,
    trapped,
    native: 1 - unfolded,
    helixRetention: getSecondaryRetention(unfolded, 'helix'),
    sheetRetention: getSecondaryRetention(unfolded, 'sheet'),
    order: 1 - unfolded,
  };
}

export function getStructureState(concentration: number, unfolded: number, direction: 'up' | 'down', trapped = 0): string {
  if (trapped > 0.06 && concentration < getIrreversibleThresholdConcentration()) return 'Kinetisch gefangen';
  if (concentration <= 0.02 && trapped <= 0.02) return 'Nativ gefaltet';
  if (direction === 'down' && unfolded < 0.72) return unfolded < 0.13 ? 'Weitgehend renaturiert' : 'Renaturierend';
  if (unfolded < 0.13) return 'Nahezu nativ';
  if (unfolded < 0.72) return 'Teilweise entfaltet';
  return 'Stark entfaltet';
}

function deterministicAngle(sequence: number, variant = 0): number {
  // Deterministic pseudo-random torsion: reproducible on every device and frame.
  const raw = Math.sin(sequence * 12.9898 + 78.233 + variant * 91.731) * 43758.5453;
  return (raw - Math.floor(raw)) * Math.PI * 2;
}

function buildCoilTrace(residues: ProteinResidue[], variant = 0): Array<[number, number, number]> {
  const result = residues.map((residue) => [...residue.xyz] as [number, number, number]);
  if (residues.length < 4) return result;

  const bondLength = 3.83;
  const internalAngle = (108 * Math.PI) / 180;
  const cosAngle = Math.cos(internalAngle);
  const sinAngle = Math.sin(internalAngle);

  for (let index = 3; index < residues.length; index += 1) {
    const a = new Vec3(...result[index - 3]);
    const b = new Vec3(...result[index - 2]);
    const c = new Vec3(...result[index - 1]);
    const axis = c.clone().sub(b).normalize();
    let normal = b.clone().sub(a).cross(axis);
    if (normal.lengthSq() < 1e-8) normal = new Vec3(1, 0, 0).cross(axis);
    normal.normalize();
    const binormal = axis.clone().cross(normal).normalize();
    const torsion = deterministicAngle(residues[index].seq, variant);
    const radial = normal.multiplyScalar(Math.cos(torsion)).add(binormal.multiplyScalar(Math.sin(torsion)));
    const direction = axis.multiplyScalar(-cosAngle).add(radial.multiplyScalar(sinAngle)).normalize();
    const next = c.add(direction.multiplyScalar(bondLength));
    result[index] = [next.x, next.y, next.z];
  }
  return result;
}

// Small dependency-free vector helper keeps the teaching model portable/testable.
class Vec3 {
  x: number;
  y: number;
  z: number;
  constructor(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  sub(v: Vec3) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  add(v: Vec3) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  multiplyScalar(s: number) { this.x *= s; this.y *= s; this.z *= s; return this; }
  cross(v: Vec3) {
    const x = this.y * v.z - this.z * v.y;
    const y = this.z * v.x - this.x * v.z;
    const z = this.x * v.y - this.y * v.x;
    this.x = x; this.y = y; this.z = z;
    return this;
  }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const length = Math.sqrt(this.lengthSq()) || 1; return this.multiplyScalar(1 / length); }
}

function correctDistance(
  points: Array<[number, number, number]>,
  a: number,
  b: number,
  target: number,
  correction: number,
) {
  const pa = points[a];
  const pb = points[b];
  if (!pa || !pb) return;
  const dx = pb[0] - pa[0];
  const dy = pb[1] - pa[1];
  const dz = pb[2] - pa[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-8) return;
  const offset = ((distance - target) / distance) * correction * 0.5;
  const ox = dx * offset;
  const oy = dy * offset;
  const oz = dz * offset;
  points[a] = [pa[0] + ox, pa[1] + oy, pa[2] + oz];
  points[b] = [pb[0] - ox, pb[1] - oy, pb[2] - oz];
}

function preserveBackboneAndDisulfides(
  points: Array<[number, number, number]>,
  model: ProteinModel,
) {
  const indexBySeq = new Map<number, number>();
  model.residues.forEach((residue, index) => indexBySeq.set(residue.seq, index));
  const sulfurBySeq = new Map<number, SulfurAtom>();
  model.sulfurs.forEach((atom) => sulfurBySeq.set(atom.residue, atom));
  const disulfideConstraints = model.disulfides.flatMap((bond) => {
    const a = indexBySeq.get(bond.a);
    const b = indexBySeq.get(bond.b);
    const sulfurA = sulfurBySeq.get(bond.a);
    const sulfurB = sulfurBySeq.get(bond.b);
    if (a === undefined || b === undefined || !sulfurA || !sulfurB) return [];
    const caA = model.residues[a].xyz;
    const caB = model.residues[b].xyz;
    return [{
      a,
      b,
      caDistance: Math.hypot(caA[0] - caB[0], caA[1] - caB[1], caA[2] - caB[2]),
      sgDistance: Math.hypot(
        sulfurA.xyz[0] - sulfurB.xyz[0],
        sulfurA.xyz[1] - sulfurB.xyz[1],
        sulfurA.xyz[2] - sulfurB.xyz[2],
      ),
      offsetA: [sulfurA.xyz[0] - caA[0], sulfurA.xyz[1] - caA[1], sulfurA.xyz[2] - caA[2]] as [number, number, number],
      offsetB: [sulfurB.xyz[0] - caB[0], sulfurB.xyz[1] - caB[1], sulfurB.xyz[2] - caB[2]] as [number, number, number],
    }];
  });

  // Position-based geometric relaxation preserves Cα spacing and both the
  // Cα-pair and Sγ–Sγ distances of disulfide-linked cysteines. This is not MD.
  for (let iteration = 0; iteration < 32; iteration += 1) {
    for (let index = 0; index < model.residues.length - 1; index += 1) {
      if (model.residues[index + 1].seq !== model.residues[index].seq + 1) continue;
      correctDistance(points, index, index + 1, 3.83, 0.78);
    }
    for (const constraint of disulfideConstraints) {
      correctDistance(points, constraint.a, constraint.b, constraint.caDistance, 0.46);
      correctDistanceWithOffsets(
        points, constraint.a, constraint.b, constraint.offsetA, constraint.offsetB, constraint.sgDistance, 0.72,
      );
    }
  }
}

function correctDistanceWithOffsets(
  points: Array<[number, number, number]>,
  a: number,
  b: number,
  offsetA: [number, number, number],
  offsetB: [number, number, number],
  target: number,
  correction: number,
) {
  const pa = points[a];
  const pb = points[b];
  if (!pa || !pb) return;
  const dx = pb[0] + offsetB[0] - pa[0] - offsetA[0];
  const dy = pb[1] + offsetB[1] - pa[1] - offsetA[1];
  const dz = pb[2] + offsetB[2] - pa[2] - offsetA[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-8) return;
  const factor = ((distance - target) / distance) * correction * 0.5;
  const ox = dx * factor;
  const oy = dy * factor;
  const oz = dz * factor;
  points[a] = [pa[0] + ox, pa[1] + oy, pa[2] + oz];
  points[b] = [pb[0] - ox, pb[1] - oy, pb[2] - oz];
}

export function morphCoordinates(
  model: ProteinModel,
  reversibleUnfolded: number,
  trappedFraction = 0,
): Array<[number, number, number]> {
  const reversible = clamp01(reversibleUnfolded);
  const trapped = clamp01(trappedFraction);
  const effective = 1 - (1 - reversible) * (1 - trapped);
  if (effective < 1e-5) return model.residues.map((residue) => [...residue.xyz] as [number, number, number]);

  // Two reproducible coil ensembles distinguish the unfolding trajectory from
  // the off-pathway, kinetically trapped conformation after a high-salt excursion.
  const coilA = buildCoilTrace(model.residues, 0);
  const coilB = buildCoilTrace(model.residues, 1);
  const trappedShare = effective > 1e-8 ? clamp01(trapped / effective) : 0;
  const morphed = model.residues.map((residue, index): [number, number, number] => {
    const native = residue.xyz;
    const unfoldedTarget = coilA[index];
    const trappedTarget = coilB[index];
    const localAmount = residue.secondary === 'helix' || residue.secondary === 'sheet'
      ? 1 - getSecondaryRetention(effective, residue.secondary)
      : effective;
    const reversibleWeight = localAmount * (1 - trappedShare);
    const trappedWeight = localAmount * trappedShare;
    const nativeWeight = 1 - localAmount;
    return [
      native[0] * nativeWeight + unfoldedTarget[0] * reversibleWeight + trappedTarget[0] * trappedWeight,
      native[1] * nativeWeight + unfoldedTarget[1] * reversibleWeight + trappedTarget[1] * trappedWeight,
      native[2] * nativeWeight + unfoldedTarget[2] * reversibleWeight + trappedTarget[2] * trappedWeight,
    ];
  });

  preserveBackboneAndDisulfides(morphed, model);

  const center = morphed.reduce<[number, number, number]>(
    (sum, point) => [sum[0] + point[0] / morphed.length, sum[1] + point[1] / morphed.length, sum[2] + point[2] / morphed.length],
    [0, 0, 0],
  );
  return morphed.map((point) => [point[0] - center[0], point[1] - center[1], point[2] - center[2]]);
}

export function getConcentrationCurve(): Array<{ concentration: number; index: number }> {
  return Array.from({ length: 81 }, (_, index) => {
    const concentration = index / 10;
    return { concentration, index: getUnfoldedIndex(concentration) };
  });
}
