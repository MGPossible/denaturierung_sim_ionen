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
  const lines = [
    fixedLine([[0, 6, 'HEADER'], [62, 66, '1LYZ']]),
    fixedLine([[0, 6, 'HELIX '], [21, 25, '1'], [33, 37, '10']]),
  ];
  const pairs = [[6, 127], [30, 115], [64, 80], [76, 94]];
  let serial = 1;
  for (let seq = 1; seq <= 129; seq += 1) {
    const cysteine = pairs.some(([a, b]) => a === seq || b === seq);
    const residueName = cysteine ? 'CYS' : seq === 10 ? 'ASP' : seq === 20 ? 'ARG' : 'ALA';
    const x = seq * 1.45;
    const y = Math.sin(seq * 0.3) * 2;
    const z = Math.cos(seq * 0.3) * 2;
    lines.push(fixedLine([
      [0, 6, 'ATOM  '], [6, 11, String(serial++).padStart(5)], [12, 16, ' CA '],
      [17, 20, residueName], [21, 22, 'A'], [22, 26, String(seq).padStart(4)],
      [30, 38, x.toFixed(3).padStart(8)], [38, 46, y.toFixed(3).padStart(8)], [46, 54, z.toFixed(3).padStart(8)],
    ]));
    if (seq === 1) {
      lines.push(fixedLine([[0, 6, 'ATOM  '], [6, 11, String(serial++).padStart(5)], [12, 16, ' O  '], [17, 20, residueName], [21, 22, 'A'], [22, 26, String(seq).padStart(4)], [30, 38, '0.000'], [38, 46, '0.000'], [46, 54, '0.000']]));
    }
    if (seq === 5) {
      lines.push(fixedLine([[0, 6, 'ATOM  '], [6, 11, String(serial++).padStart(5)], [12, 16, ' N  '], [17, 20, residueName], [21, 22, 'A'], [22, 26, String(seq).padStart(4)], [30, 38, '2.900'], [38, 46, '0.000'], [46, 54, '0.000']]));
    }
    if (seq === 10) {
      for (const [name, xOffset, yOffset] of [['OD1', 0.3, 0], ['OD2', 0.3, 0.4]]) {
        lines.push(fixedLine([[0, 6, 'ATOM  '], [6, 11, String(serial++).padStart(5)], [12, 16, ` ${name}`], [17, 20, 'ASP'], [21, 22, 'A'], [22, 26, String(seq).padStart(4)], [30, 38, (14.5 + xOffset).toFixed(3)], [38, 46, yOffset.toFixed(3)], [46, 54, '0.000']]));
      }
    }
    if (seq === 20) {
      for (const [name, xValue, yValue] of [['NE', 17.5, 0], ['NH1', 17.8, 0.2], ['NH2', 17.4, 0.4]]) {
        lines.push(fixedLine([[0, 6, 'ATOM  '], [6, 11, String(serial++).padStart(5)], [12, 16, ` ${name}`], [17, 20, 'ARG'], [21, 22, 'A'], [22, 26, String(seq).padStart(4)], [30, 38, xValue.toFixed(3)], [38, 46, yValue.toFixed(3)], [46, 54, '0.000']]));
      }
    }
    if (cysteine) {
      lines.push(fixedLine([
        [0, 6, 'ATOM  '], [6, 11, String(serial++).padStart(5)], [12, 16, ' CB '],
        [17, 20, 'CYS'], [21, 22, 'A'], [22, 26, String(seq).padStart(4)],
        [30, 38, (x + 0.3).toFixed(3).padStart(8)], [38, 46, (y + 0.1).toFixed(3).padStart(8)], [46, 54, (z - 0.1).toFixed(3).padStart(8)],
      ]));
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

test('PDB parser reads 1LYZ chain A, charged side chains, native contacts and four disulfides', () => {
  const model = parsePdb(makeFixture());
  assert.equal(model.id, '1LYZ');
  assert.equal(model.chain, 'A');
  assert.equal(model.residues.length, 129);
  assert.equal(model.disulfides.length, 4);
  assert.deepEqual(model.disulfides.map(({ a, b }) => `${a}-${b}`).sort(), ['30-115', '6-127', '64-80', '76-94']);
  assert.equal(model.sulfurs.length, 8);
  assert.ok(model.sulfurs.every((atom) => Array.isArray(atom.betaCarbon) && atom.betaCarbon.length === 3));
  assert.ok(model.chargedSites.some((site) => site.residue === 10 && site.charge === 'negative'));
  assert.ok(model.chargedSites.some((site) => site.residue === 20 && site.charge === 'positive'));
  assert.ok(model.ionicContacts.some((contact) => contact.negativeResidue === 10 && contact.positiveResidue === 20));
  assert.ok(model.hydrogenBonds.some((bond) => bond.acceptor === 1 && bond.donor === 5 && bond.kind === 'helix'));
});
