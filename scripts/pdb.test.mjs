import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePdb } from '../src/lib/pdb.ts';

function fixedLine(fields) {
  const line = Array(80).fill(' ');
  for (const [start, end, value] of fields) {
    const content = String(value);
    for (let i = 0; i < Math.min(end - start, content.length); i += 1) line[start + i] = content[i];
  }
  return line.join('');
}

function makeFixture() {
  const lines = [fixedLine([[0, 6, 'HEADER'], [62, 66, '1LYZ']])];
  const pairs = [[1, 129], [2, 128], [3, 127], [4, 126]];
  let serial = 1;
  for (let seq = 1; seq <= 129; seq += 1) {
    const cysteine = pairs.some(([a, b]) => a === seq || b === seq);
    const residueName = cysteine ? 'CYS' : 'ALA';
    const x = seq * 1.45;
    const y = Math.sin(seq * 0.3) * 2;
    const z = Math.cos(seq * 0.3) * 2;
    lines.push(fixedLine([
      [0, 6, 'ATOM  '], [6, 11, String(serial++).padStart(5)], [12, 16, ' CA '],
      [17, 20, residueName], [21, 22, 'A'], [22, 26, String(seq).padStart(4)],
      [30, 38, x.toFixed(3).padStart(8)], [38, 46, y.toFixed(3).padStart(8)], [46, 54, z.toFixed(3).padStart(8)],
    ]));
    if (cysteine) {
      lines.push(fixedLine([
        [0, 6, 'ATOM  '], [6, 11, String(serial++).padStart(5)], [12, 16, ' SG '],
        [17, 20, 'CYS'], [21, 22, 'A'], [22, 26, String(seq).padStart(4)],
        [30, 38, (x + 0.5).toFixed(3).padStart(8)], [38, 46, (y + 0.2).toFixed(3).padStart(8)], [46, 54, (z - 0.2).toFixed(3).padStart(8)],
      ]));
    }
  }
  for (let i = 0; i < pairs.length; i += 1) {
    const [a, b] = pairs[i];
    lines.push(fixedLine([[0, 6, 'SSBOND'], [7, 10, String(i + 1).padStart(3)], [11, 14, 'CYS'], [15, 16, 'A'], [17, 21, String(a).padStart(4)], [25, 28, 'CYS'], [29, 30, 'A'], [31, 35, String(b).padStart(4)]]));
  }
  return lines.join('\n');
}

test('PDB parser reads 1LYZ chain A, native secondary-free Cα trace and four disulfides', () => {
  const model = parsePdb(makeFixture());
  assert.equal(model.id, '1LYZ');
  assert.equal(model.chain, 'A');
  assert.equal(model.residues.length, 129);
  assert.equal(model.disulfides.length, 4);
  assert.equal(model.sulfurs.length, 8);
});
