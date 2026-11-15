/**
 * Small, dependency-free helpers for checking PDB SSBOND records.
 *
 * Do not impose an idealised Sγ–Sγ interval on a historical experimental
 * structure. For 1LYZ the SSBOND record itself reports the deposited length;
 * this validator checks that the coordinates agree with that record.
 */
export function parseSsbondRecord(line) {
  if (!line.startsWith('SSBOND')) {
    throw new Error('Expected an SSBOND record.');
  }

  const residueNameA = line.slice(11, 14).trim();
  const chainA = line.slice(15, 16).trim();
  const a = Number.parseInt(line.slice(17, 21).trim(), 10);
  const residueNameB = line.slice(25, 28).trim();
  const chainB = line.slice(29, 30).trim();
  const b = Number.parseInt(line.slice(31, 35).trim(), 10);
  // PDB format: SSBOND length occupies columns 74–78 (1-based).
  const declaredDistance = Number.parseFloat(line.slice(73, 78).trim());

  if (residueNameA !== 'CYS' || residueNameB !== 'CYS') {
    throw new Error(`SSBOND record must connect cysteines; found ${residueNameA} ${a}–${residueNameB} ${b}.`);
  }
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error('SSBOND record contains an invalid residue number.');
  }
  if (!Number.isFinite(declaredDistance) || declaredDistance <= 0) {
    throw new Error(`SSBOND record for Cys ${a}–${b} has no valid deposited bond length.`);
  }

  return {
    a,
    b,
    chainA,
    chainB,
    declaredDistance,
    key: `${Math.min(a, b)}-${Math.max(a, b)}`,
  };
}

/**
 * Compare the coordinate-derived Sγ distance with the deposited SSBOND value.
 * The small tolerance accounts for the two-decimal PDB annotation and
 * three-decimal Cartesian coordinates. This validates the deposited model,
 * rather than grading its geometry against an ideal covalent bond length.
 */
export function validateSgDistance(pair, measuredDistance, tolerance = 0.02) {
  if (!Number.isFinite(measuredDistance) || measuredDistance <= 0) {
    throw new Error(`Invalid coordinate-derived Sγ–Sγ distance for Cys ${pair.a}–${pair.b}.`);
  }
  const difference = Math.abs(measuredDistance - pair.declaredDistance);
  if (difference > tolerance) {
    throw new Error(
      `Sγ–Sγ coordinates for Cys ${pair.a}–${pair.b} disagree with the PDB SSBOND record: ` +
      `${measuredDistance.toFixed(2)} Å measured vs ${pair.declaredDistance.toFixed(2)} Å deposited.`,
    );
  }
  return {
    a: pair.a,
    b: pair.b,
    measuredDistance,
    declaredDistance: pair.declaredDistance,
  };
}
