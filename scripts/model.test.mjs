import test from 'node:test';
import assert from 'node:assert/strict';
import { getConcentrationCurve, getIndicators, getIrreversibleThresholdConcentration, getSecondaryRetention, getTrappedFraction, morphCoordinates, hasCrossedIrreversibleThreshold } from '../src/lib/model.ts';

function fixture() {
  const xy = [
    [0, 0], [3.83, 0], [7.66, 0], [11.49, 0], [15.32, 0], [19.15, 0],
    [19.15, 3.83], [19.15, 7.66], [15.32, 7.66], [11.49, 7.66],
    [7.66, 7.66], [3.83, 7.66], [0, 7.66], [-3.83, 7.66],
    [-3.83, 3.83], [-3.83, 0],
  ];
  const residues = xy.map(([x, y], index) => ({
    seq: index + 1,
    aa: 'A',
    xyz: [x, y, Math.sin((index + 1) * 0.23) * 0.15],
    secondary: index + 1 >= 3 && index + 1 <= 7 ? 'helix' : index + 1 >= 9 && index + 1 <= 12 ? 'sheet' : 'loop',
  }));
  const disulfides = [{ a: 2, b: 12 }, { a: 4, b: 10 }];
  const sulfurs = disulfides.flatMap(({ a, b }) => [a, b].map((residue) => ({ residue, xyz: [...residues[residue - 1].xyz] })));
  return { id: '1LYZ', chain: 'A', residues, sulfurs, disulfides, atomCount: 0, resolution: '2.00 Å' };
}

test('normalised denaturation index is bounded and monotonic', () => {
  const curve = getConcentrationCurve();
  assert.equal(curve.length, 81);
  assert.equal(getIndicators(0).unfolded, 0);
  assert.equal(getIndicators(8).unfolded, 1);
  for (let i = 1; i < curve.length; i += 1) assert.ok(curve[i].index >= curve[i - 1].index);
});

test('secondary structure retention follows the same monotonic model', () => {
  assert.equal(getSecondaryRetention(0, 'helix'), 1);
  assert.ok(getSecondaryRetention(1, 'helix') < 0.1);
  assert.ok(getSecondaryRetention(1, 'sheet') < 0.1);
  assert.ok(getSecondaryRetention(0.8, 'helix') < getSecondaryRetention(0.2, 'helix'));
});

test('native coordinates are unchanged at zero denaturant', () => {
  const model = fixture();
  const coordinates = morphCoordinates(model, 0);
  assert.deepEqual(coordinates, model.residues.map((residue) => residue.xyz));
});

test('unfolded teaching conformation remains finite and keeps chain/crosslink distances constrained', () => {
  const model = fixture();
  const coordinates = morphCoordinates(model, 1);
  assert.equal(coordinates.length, model.residues.length);
  for (const point of coordinates) assert.ok(point.every(Number.isFinite));
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    assert.ok(distance > 3.5 && distance < 4.2, `Cα distance at ${i + 1}: ${distance}`);
  }
  for (const bond of model.disulfides) {
    const a = coordinates[bond.a - 1];
    const b = coordinates[bond.b - 1];
    const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const nativeDistance = Math.hypot(
      model.residues[bond.a - 1].xyz[0] - model.residues[bond.b - 1].xyz[0],
      model.residues[bond.a - 1].xyz[1] - model.residues[bond.b - 1].xyz[1],
      model.residues[bond.a - 1].xyz[2] - model.residues[bond.b - 1].xyz[2],
    );
    assert.ok(Math.abs(distance - nativeDistance) < 0.2);
    const sulfurA = model.sulfurs.find((atom) => atom.residue === bond.a);
    const sulfurB = model.sulfurs.find((atom) => atom.residue === bond.b);
    const offsetA = sulfurA.xyz.map((value, axis) => value - model.residues[bond.a - 1].xyz[axis]);
    const offsetB = sulfurB.xyz.map((value, axis) => value - model.residues[bond.b - 1].xyz[axis]);
    const sgA = a.map((value, axis) => value + offsetA[axis]);
    const sgB = b.map((value, axis) => value + offsetB[axis]);
    const sgDistance = Math.hypot(sgA[0] - sgB[0], sgA[1] - sgB[1], sgA[2] - sgB[2]);
    const nativeSgDistance = Math.hypot(sulfurA.xyz[0] - sulfurB.xyz[0], sulfurA.xyz[1] - sulfurB.xyz[1], sulfurA.xyz[2] - sulfurB.xyz[2]);
    assert.ok(Math.abs(sgDistance - nativeSgDistance) < 0.2);
  }
});


test('high-salt excursion creates a persistent trapped fraction and hysteresis on dilution', () => {
  const threshold = getIrreversibleThresholdConcentration();
  assert.ok(threshold > 6 && threshold < 7);
  assert.equal(getTrappedFraction(threshold - 0.2), 0);
  assert.ok(getTrappedFraction(8) > 0.4);
  const afterDilution = getIndicators(0, 8);
  assert.ok(afterDilution.unfolded > 0.4);
  assert.ok(afterDilution.native < 0.6);
  assert.equal(getIndicators(0, 0).unfolded, 0);
});

test('kinetically trapped conformation is not identical to the native PDB trace', () => {
  const model = fixture();
  const native = morphCoordinates(model, 0, 0);
  const trapped = morphCoordinates(model, 0, 0.42);
  const displacement = native.reduce((sum, point, index) => sum + Math.hypot(
    point[0] - trapped[index][0], point[1] - trapped[index][1], point[2] - trapped[index][2],
  ), 0);
  assert.ok(displacement > 20, `Expected a visibly different trapped conformation, got displacement ${displacement}`);
});


test('chart marker state becomes irreversible only after the model boundary is crossed', () => {
  const threshold = getIrreversibleThresholdConcentration();
  assert.equal(hasCrossedIrreversibleThreshold(threshold - 0.01), false);
  assert.equal(hasCrossedIrreversibleThreshold(threshold), false);
  assert.equal(hasCrossedIrreversibleThreshold(threshold + 0.01), true);
  // The peak is retained during dilution, so the lilac state remains active.
  assert.equal(hasCrossedIrreversibleThreshold(8), true);
});
