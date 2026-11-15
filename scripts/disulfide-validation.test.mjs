import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSsbondRecord, validateSgDistance } from './disulfide-validation.mjs';

function ssbondLine() {
  // Verbatim fixed-width SSBOND record shape from the official 1LYZ PDB.
  return 'SSBOND   2 CYS A   30    CYS A  115                          1555   1555  2.42';
}

test('parses PDB SSBOND fixed-width columns, including a 2.42 Å deposited length', () => {
  const pair = parseSsbondRecord(ssbondLine());
  assert.equal(pair.a, 30);
  assert.equal(pair.b, 115);
  assert.equal(pair.chainA, 'A');
  assert.equal(pair.chainB, 'A');
  assert.equal(pair.declaredDistance, 2.42);
  assert.equal(pair.key, '30-115');
});

test('accepts the authentic 1LYZ deposited distance when coordinates agree', () => {
  const pair = parseSsbondRecord(ssbondLine());
  assert.doesNotThrow(() => validateSgDistance(pair, 2.42));
});

test('rejects disagreement between coordinate distance and the SSBOND annotation', () => {
  const pair = parseSsbondRecord(ssbondLine());
  assert.throws(() => validateSgDistance(pair, 2.10), /disagree with the PDB SSBOND record/);
});


test('recognises all four deposited 1LYZ disulfide annotation lengths', () => {
  const records = [
    'SSBOND   1 CYS A    6    CYS A  127                          1555   1555  2.06',
    'SSBOND   2 CYS A   30    CYS A  115                          1555   1555  2.42',
    'SSBOND   3 CYS A   64    CYS A   80                          1555   1555  2.34',
    'SSBOND   4 CYS A   76    CYS A   94                          1555   1555  2.22',
  ];
  const parsed = records.map(parseSsbondRecord).sort((a, b) => a.key.localeCompare(b.key));
  assert.deepEqual(parsed.map((pair) => [pair.key, pair.declaredDistance]), [
    ['30-115', 2.42],
    ['6-127', 2.06],
    ['64-80', 2.34],
    ['76-94', 2.22],
  ]);
});
