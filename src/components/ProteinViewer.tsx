import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ProteinModel, ProteinResidue, SecondaryType, SulfurAtom, Vec3Tuple } from '../lib/pdb';
import { getSecondaryRetention, morphCoordinates } from '../lib/model';

type Props = {
  model: ProteinModel | null;
  onReset: () => void;
  unfolded: number;
  trapped: number;
  irreversible: boolean;
  concentration: number;
  compare: boolean;
  showHelices: boolean;
  showSheets: boolean;
  showDisulfides: boolean;
  showIons: boolean;
  showHydrogenBonds: boolean;
};

const COLORS: Record<SecondaryType, number> = {
  helix: 0x55d6d2,
  sheet: 0xf4bf64,
  loop: 0xc7d1d8,
};

const ION_COLORS = {
  guanidinium: 0xff8c68,
  chloride: 0x72bfff,
  hydrogenBond: 0x28efff,
};

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
  });
  group.clear();
}

function makeRibbon(points: THREE.Vector3[], width: number, color: number, opacity = 1) {
  const curve = new THREE.CatmullRomCurve3(points);
  const steps = Math.max(points.length * 3, 18);
  const vertices: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const alternateUp = new THREE.Vector3(1, 0, 0);
  const side = new THREE.Vector3();
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 0.001) side.crossVectors(tangent, alternateUp);
    side.normalize();
    const taper = t > 0.78 ? Math.max(0.08, 1 - (t - 0.78) / 0.22) : 1;
    const halfWidth = width * taper * 0.5;
    const left = position.clone().addScaledVector(side, halfWidth);
    const right = position.clone().addScaledVector(side, -halfWidth);
    vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
    if (i < steps) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.12,
    roughness: 0.46,
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    depthWrite: opacity > 0.85,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.proteinSurface = true;
  return mesh;
}

function runsOfType(residues: ProteinResidue[], type: SecondaryType): ProteinResidue[][] {
  const runs: ProteinResidue[][] = [];
  let active: ProteinResidue[] = [];
  for (const residue of residues) {
    if (residue.secondary === type) active.push(residue);
    else if (active.length) {
      if (active.length > 1) runs.push(active);
      active = [];
    }
  }
  if (active.length > 1) runs.push(active);
  return runs;
}

type ProteinVisualCache = {
  helixRuns: ProteinResidue[][];
  sheetRuns: ProteinResidue[][];
  sulfurBySeq: Map<number, SulfurAtom>;
};

const proteinVisualCache = new WeakMap<ProteinModel, ProteinVisualCache>();

function getProteinVisualCache(model: ProteinModel): ProteinVisualCache {
  const cached = proteinVisualCache.get(model);
  if (cached) return cached;
  const sulfurBySeq = new Map<number, SulfurAtom>();
  model.sulfurs.forEach((atom) => sulfurBySeq.set(atom.residue, atom));
  const data = {
    helixRuns: runsOfType(model.residues, 'helix'),
    sheetRuns: runsOfType(model.residues, 'sheet'),
    sulfurBySeq,
  };
  proteinVisualCache.set(model, data);
  return data;
}

function addCovalentSegment(group: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, color: number, radius: number, opacity = 1) {
  if (start.distanceToSquared(end) < 1e-6) return;
  const curve = new THREE.LineCurve3(start, end);
  const geometry = new THREE.TubeGeometry(curve, 6, radius, 6, false);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.16,
    roughness: 0.42,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity > 0.85,
  });
  group.add(new THREE.Mesh(geometry, material));
}


function addGlowingDisulfide(group: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, opacity = 1) {
  if (start.distanceToSquared(end) < 1e-6) return;
  const curve = new THREE.LineCurve3(start, end);
  const halo = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 10, 0.074, 9, false),
    new THREE.MeshBasicMaterial({ color: 0x9cff78, transparent: true, opacity: 0.24 * opacity, depthWrite: false, toneMapped: false }),
  );
  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 10, 0.036, 9, false),
    new THREE.MeshBasicMaterial({ color: 0xdfffbd, transparent: true, opacity, depthWrite: false, toneMapped: false }),
  );
  halo.renderOrder = 5;
  core.renderOrder = 6;
  group.add(halo, core);
}

function addGlowingSulfur(group: THREE.Group, position: THREE.Vector3, opacity = 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.062, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xe4ffbd,
      emissive: 0x91ff52,
      emissiveIntensity: 1.05,
      roughness: 0.2,
      metalness: 0.02,
      transparent: opacity < 1,
      opacity,
      toneMapped: false,
    }),
  );
  mesh.position.copy(position);
  group.add(mesh);
}

function renderProtein(
  group: THREE.Group,
  model: ProteinModel,
  reversibleAmount: number,
  trappedAmount: number,
  concentration: number,
  options: { helices: boolean; sheets: boolean; disulfides: boolean; ions: boolean; hydrogenBonds: boolean },
  opacity = 1,
  irreversibleTint = false,
) {
  disposeGroup(group);
  const visualCache = getProteinVisualCache(model);
  const effectiveAmount = 1 - (1 - reversibleAmount) * (1 - trappedAmount);
  const morphedPositions = morphCoordinates(model, reversibleAmount, trappedAmount);
  let centroidX = 0;
  let centroidY = 0;
  let centroidZ = 0;
  for (const point of morphedPositions) {
    centroidX += point[0];
    centroidY += point[1];
    centroidZ += point[2];
  }
  const inverseCount = 1 / morphedPositions.length;
  const centroid: [number, number, number] = [centroidX * inverseCount, centroidY * inverseCount, centroidZ * inverseCount];
  const coords = morphedPositions.map(([x, y, z]) => new THREE.Vector3((x - centroid[0]) * 0.15, (y - centroid[1]) * 0.15, (z - centroid[2]) * 0.15));
  const coordBySeq = new Map<number, THREE.Vector3>();
  const deltaBySeq = new Map<number, Vec3Tuple>();
  model.residues.forEach((residue, index) => {
    coordBySeq.set(residue.seq, coords[index]);
    deltaBySeq.set(residue.seq, [
      morphedPositions[index][0] - residue.xyz[0],
      morphedPositions[index][1] - residue.xyz[1],
      morphedPositions[index][2] - residue.xyz[2],
    ]);
  });
  const toScene = (position: Vec3Tuple, residue: number) => {
    const delta = deltaBySeq.get(residue) ?? [0, 0, 0];
    return new THREE.Vector3(
      (position[0] + delta[0] - centroid[0]) * 0.15,
      (position[1] + delta[1] - centroid[1]) * 0.15,
      (position[2] + delta[2] - centroid[2]) * 0.15,
    );
  };

  const backboneCurve = new THREE.CatmullRomCurve3(coords);
  const backboneMesh = new THREE.Mesh(
    new THREE.TubeGeometry(backboneCurve, Math.max(180, coords.length * 3), 0.105 + effectiveAmount * 0.035, 7, false),
    new THREE.MeshStandardMaterial({ color: 0xaab7bd, roughness: 0.68, transparent: opacity < 1, opacity: 0.68 * opacity }),
  );
  backboneMesh.userData.proteinSurface = true;
  group.add(backboneMesh);

  if (options.helices) {
    const retention = getSecondaryRetention(effectiveAmount, 'helix');
    const tint = new THREE.Color(COLORS.helix).lerp(new THREE.Color(COLORS.loop), 1 - retention * 0.88);
    for (const run of visualCache.helixRuns) {
      const points = run.map((residue) => coordBySeq.get(residue.seq)).filter((point): point is THREE.Vector3 => Boolean(point));
      if (points.length < 3) continue;
      const curve = new THREE.CatmullRomCurve3(points);
      const helixMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, points.length * 3, 0.09 + 0.155 * retention, 7, false),
        new THREE.MeshStandardMaterial({
          color: tint,
          metalness: 0.16,
          roughness: 0.4 + (1 - retention) * 0.25,
          transparent: true,
          opacity: opacity * (0.28 + 0.72 * retention),
          depthWrite: retention > 0.45 && opacity > 0.85,
        }),
      );
      helixMesh.userData.proteinSurface = true;
      group.add(helixMesh);
    }
  }

  if (options.sheets) {
    const retention = getSecondaryRetention(effectiveAmount, 'sheet');
    const tint = new THREE.Color(COLORS.sheet).lerp(new THREE.Color(COLORS.loop), 1 - retention * 0.9);
    for (const run of visualCache.sheetRuns) {
      const points = run.map((residue) => coordBySeq.get(residue.seq)).filter((point): point is THREE.Vector3 => Boolean(point));
      if (points.length < 3) continue;
      group.add(makeRibbon(points, 0.28 + 0.62 * retention, tint.getHex(), opacity * (0.25 + 0.75 * retention)));
    }
  }

  if (options.disulfides) {
    const sulfurBySeq = visualCache.sulfurBySeq;
    for (const bond of model.disulfides) {
      const a = sulfurBySeq.get(bond.a);
      const b = sulfurBySeq.get(bond.b);
      const caA = coordBySeq.get(bond.a);
      const caB = coordBySeq.get(bond.b);
      if (!a || !b || !caA || !caB) continue;

      // Display the actual PDB side-chain path CA -> CB -> SG, followed by the
      // covalent S-S link. The residue identities are fixed by the SSBOND
      // records: 6-127, 30-115, 64-80 and 76-94 in native hen lysozyme.
      const sgA = toScene(a.xyz, bond.a);
      const sgB = toScene(b.xyz, bond.b);
      const cbA = a.betaCarbon ? toScene(a.betaCarbon, bond.a) : null;
      const cbB = b.betaCarbon ? toScene(b.betaCarbon, bond.b) : null;

      if (cbA) {
        addCovalentSegment(group, caA, cbA, 0xaebdc2, 0.018, opacity);
        addCovalentSegment(group, cbA, sgA, 0xaebdc2, 0.018, opacity);
      } else {
        addCovalentSegment(group, caA, sgA, 0xaebdc2, 0.018, opacity);
      }
      if (cbB) {
        addCovalentSegment(group, caB, cbB, 0xaebdc2, 0.018, opacity);
        addCovalentSegment(group, cbB, sgB, 0xaebdc2, 0.018, opacity);
      } else {
        addCovalentSegment(group, caB, sgB, 0xaebdc2, 0.018, opacity);
      }

      // Sulfur atoms and S-S bond use a distinct vivid green, separated from
      // the yellow β-sheet colour. Coordinates are PDB SG positions, not a
      // manually positioned cross-link overlay.
      addGlowingDisulfide(group, sgA, sgB, opacity);
      addGlowingSulfur(group, sgA, opacity);
      addGlowingSulfur(group, sgB, opacity);
    }
  }

  if (options.hydrogenBonds) {
    const contactOpacity = opacity * Math.max(0.025, 0.82 * (1 - effectiveAmount));
    const anchorVertices: THREE.Vector3[] = [];
    const dashedSegments: Array<{ start: THREE.Vector3; end: THREE.Vector3 }> = [];

    // Only PDB-derived, geometrically screened backbone O···N contacts are
    // drawn. Thin anchor lines connect each atom endpoint to its own C-alpha.
    for (const bond of model.hydrogenBonds.slice(0, 72)) {
      const acceptor = toScene(bond.acceptorXYZ, bond.acceptor);
      const donor = toScene(bond.donorXYZ, bond.donor);
      const acceptorCa = coordBySeq.get(bond.acceptor);
      const donorCa = coordBySeq.get(bond.donor);
      if (acceptorCa) anchorVertices.push(acceptorCa, acceptor);
      if (donorCa) anchorVertices.push(donorCa, donor);

      const vector = donor.clone().sub(acceptor);
      const length = vector.length();
      if (length < 0.015) continue;
      vector.normalize();
      const dashLength = 0.055;
      const gapLength = 0.035;
      for (let offset = 0; offset < length; offset += dashLength + gapLength) {
        const from = Math.min(length, offset);
        const to = Math.min(length, offset + dashLength);
        if (to - from < 0.012) continue;
        dashedSegments.push({
          start: acceptor.clone().addScaledVector(vector, from),
          end: acceptor.clone().addScaledVector(vector, to),
        });
      }
    }

    if (anchorVertices.length) {
      const geometry = new THREE.BufferGeometry().setFromPoints(anchorVertices);
      group.add(new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: ION_COLORS.hydrogenBond, transparent: true, opacity: contactOpacity * 0.52, depthWrite: false, toneMapped: false }),
      ));
    }
    if (dashedSegments.length) {
      // Instanced, emissive cyan dashes are thicker and retain the same vivid
      // colour as the legend without creating hundreds of individual meshes.
      const geometry = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, false);
      const material = new THREE.MeshStandardMaterial({
        color: ION_COLORS.hydrogenBond,
        emissive: ION_COLORS.hydrogenBond,
        emissiveIntensity: 0.9,
        roughness: 0.32,
        transparent: true,
        opacity: Math.min(1, contactOpacity * 1.14),
        depthWrite: false,
        toneMapped: false,
      });
      const bondsMesh = new THREE.InstancedMesh(geometry, material, dashedSegments.length);
      const transform = new THREE.Object3D();
      const yAxis = new THREE.Vector3(0, 1, 0);
      dashedSegments.forEach(({ start, end }, index) => {
        const direction = end.clone().sub(start);
        const length = direction.length();
        transform.position.copy(start).add(end).multiplyScalar(0.5);
        transform.quaternion.setFromUnitVectors(yAxis, direction.normalize());
        transform.scale.set(1, length, 1);
        transform.updateMatrix();
        bondsMesh.setMatrixAt(index, transform.matrix);
      });
      bondsMesh.instanceMatrix.needsUpdate = true;
      bondsMesh.renderOrder = 4;
      group.add(bondsMesh);
    }
  }

  if (options.ions) {
    // Reuse one geometry/material per ion class and render particles as
    // InstancedMeshes. This cuts dozens of draw calls down to two.
    const amount = THREE.MathUtils.clamp(concentration / 8, 0, 1);
    const targets = model.gdmTargets;
    const maximumGdmIons = 30;
    const activeGdmCount = amount * maximumGdmIons;
    const gdmCount = Math.ceil(activeGdmCount);
    const sceneCenter = new THREE.Vector3(0, 0, 0);

    if (gdmCount > 0 && targets.length > 0) {
      const ionGeometry = new THREE.SphereGeometry(0.115, 10, 8);
      const ionMaterial = new THREE.MeshStandardMaterial({
        color: ION_COLORS.guanidinium,
        emissive: 0x872e25,
        emissiveIntensity: 0.55,
        roughness: 0.28,
      });
      const ions = new THREE.InstancedMesh(ionGeometry, ionMaterial, gdmCount);
      ions.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const connectorPositions: THREE.Vector3[] = [];
      const transform = new THREE.Object3D();

      for (let i = 0; i < gdmCount; i += 1) {
        const activation = THREE.MathUtils.clamp(activeGdmCount - i, 0, 1);
        const target = targets[Math.floor(((i + 0.5) * targets.length) / maximumGdmIons)];
        const anchor = toScene(target.xyz, target.residue);
        const residueCa = coordBySeq.get(target.residue);
        const outward = anchor.clone().sub(residueCa ?? sceneCenter);
        if (outward.lengthSq() < 0.0001) outward.copy(anchor).sub(sceneCenter);
        if (outward.lengthSq() < 0.0001) outward.set(Math.sin(i * 1.7), Math.cos(i * 1.3), 0.7);
        outward.normalize();
        const ionPosition = anchor.clone().addScaledVector(outward, THREE.MathUtils.lerp(0.72, 0.22, activation));

        transform.position.copy(ionPosition);
        transform.quaternion.identity();
        transform.scale.setScalar(0.28 + 0.72 * activation);
        transform.updateMatrix();
        ions.setMatrixAt(i, transform.matrix);
        if (activation > 0.03) connectorPositions.push(anchor, ionPosition);
      }
      ions.instanceMatrix.needsUpdate = true;
      group.add(ions);

      if (connectorPositions.length) {
        const connectorGeometry = new THREE.BufferGeometry().setFromPoints(connectorPositions);
        group.add(new THREE.LineSegments(connectorGeometry, new THREE.LineBasicMaterial({
          color: ION_COLORS.guanidinium,
          transparent: true,
          opacity: opacity * 0.5,
          depthWrite: false,
        })));
      }
    }

    const chlorideCount = Math.min(12, Math.round(amount * 12));
    if (chlorideCount > 0) {
      const bounds = new THREE.Box3().setFromPoints(coords);
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius + 0.56;
      const chlorideGeometry = new THREE.SphereGeometry(0.105, 9, 7);
      const chlorideMaterial = new THREE.MeshStandardMaterial({
        color: ION_COLORS.chloride,
        emissive: 0x1f5d9b,
        emissiveIntensity: 0.38,
        roughness: 0.34,
      });
      const chloride = new THREE.InstancedMesh(chlorideGeometry, chlorideMaterial, chlorideCount);
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const transform = new THREE.Object3D();
      for (let i = 0; i < chlorideCount; i += 1) {
        const y = 1 - 2 * ((i + 0.5) / chlorideCount);
        const radial = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = goldenAngle * i + 0.45;
        transform.position.set(Math.cos(theta) * radial * radius, y * radius, Math.sin(theta) * radial * radius);
        transform.scale.setScalar(1);
        transform.updateMatrix();
        chloride.setMatrixAt(i, transform.matrix);
      }
      chloride.instanceMatrix.needsUpdate = true;
      group.add(chloride);
    }
  }

  // After the irreversible model boundary, tint only the protein body in lilac.
  // Ion, H-bond and disulfide colours remain distinct and scientifically legible.
  if (irreversibleTint) {
    const lilac = new THREE.Color(0xb39aec);
    const tintStrength = 0.19 + 0.08 * THREE.MathUtils.clamp(trappedAmount / 0.42, 0, 1);
    group.traverse((object) => {
      if (!object.userData.proteinSurface) return;
      const materials = object instanceof THREE.Mesh ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
      for (const material of materials) {
        if ('color' in material && material.color instanceof THREE.Color) material.color.lerp(lilac, tintStrength);
        if ('emissive' in material && material.emissive instanceof THREE.Color) material.emissive.lerp(new THREE.Color(0x58458f), 0.24);
      }
    });
  }
}

export function ProteinViewer({ model, onReset, unfolded, trapped, irreversible, concentration, compare, showHelices, showSheets, showDisulfides, showIons, showHydrogenBonds }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(unfolded);
  const trappedRef = useRef(trapped);
  const concentrationRef = useRef(concentration);
  const irreversibleRef = useRef(irreversible);
  const optionsRef = useRef({ helices: showHelices, sheets: showSheets, disulfides: showDisulfides, ions: showIons, hydrogenBonds: showHydrogenBonds, compare });
  const resetRef = useRef<(() => void) | null>(null);
  const centerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    targetRef.current = unfolded;
    if (model) window.dispatchEvent(new Event('lysozyme:target-change'));
  }, [unfolded, model]);
  useEffect(() => {
    trappedRef.current = trapped;
    if (model) window.dispatchEvent(new Event('lysozyme:target-change'));
  }, [trapped, model]);
  useEffect(() => {
    concentrationRef.current = concentration;
    if (model) window.dispatchEvent(new Event('lysozyme:target-change'));
  }, [concentration, model]);
  useEffect(() => {
    irreversibleRef.current = irreversible;
    if (model) window.dispatchEvent(new Event('lysozyme:refresh-view'));
  }, [irreversible, model]);
  useEffect(() => {
    optionsRef.current = { helices: showHelices, sheets: showSheets, disulfides: showDisulfides, ions: showIons, hydrogenBonds: showHydrogenBonds, compare };
    if (model) window.dispatchEvent(new Event('lysozyme:refresh-view'));
  }, [compare, model, showDisulfides, showHelices, showSheets, showIons, showHydrogenBonds]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !model) return;

    let renderer: THREE.WebGLRenderer;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      host.innerHTML = '<div class="viewer-empty"><strong>3D-Darstellung nicht verfügbar</strong><span>Bitte aktiviere WebGL bzw. Hardwarebeschleunigung in diesem Browser.</span></div>';
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101a22');
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 1000);
    // A moderate internal render scale reduces fragment work on high-DPI iPads
    // and laptops while keeping the canvas visually sharp.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.18 : 1.35));
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.className = 'protein-canvas';
    renderer.domElement.setAttribute('aria-label', 'Interaktive dreidimensionale Cartoon-Darstellung des Lysozyms 1LYZ');
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x182630, 2.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.35);
    keyLight.position.set(8, 9, 11);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x8ec9c9, 0.9);
    fillLight.position.set(-9, -2, 7);
    scene.add(fillLight);

    const proteinGroup = new THREE.Group();
    const ghostGroup = new THREE.Group();
    scene.add(ghostGroup, proteinGroup);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 2.4;
    controls.maxDistance = 40;

    let current = targetRef.current;
    let currentTrapped = trappedRef.current;
    let currentConcentration = concentrationRef.current;
    let frameId: number | null = null;
    let disposed = false;
    let lastFrameTime = 0;
    let lastGeometryBuild = 0;
    let geometryFrameInterval = 1000 / 60;
    let lastGhostState: boolean | null = null;
    let lastIrreversible = irreversibleRef.current;
    let shakeStartedAt = 0;
    let proteinDirty = true;
    let forceProteinBuild = true;
    let sceneDirty = true;
    let controlsChanged = false;
    let controlsInteracting = false;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const fitSphere = () => {
      const box = new THREE.Box3().setFromObject(proteinGroup);
      return box.getBoundingSphere(new THREE.Sphere());
    };
    const resetCamera = () => {
      const sphere = fitSphere();
      controls.target.copy(sphere.center);
      const fittedDistance = Math.max(7, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.3);
      const distance = Math.max(3.6, fittedDistance * 0.54);
      camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0, distance));
      camera.near = Math.max(0.05, distance / 250);
      camera.far = distance * 20;
      camera.updateProjectionMatrix();
      controls.update();
      sceneDirty = true;
    };
    const centerCamera = () => {
      const sphere = fitSphere();
      const direction = camera.position.clone().sub(controls.target).normalize();
      const distance = Math.max(3.2, camera.position.distanceTo(controls.target));
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).add(direction.multiplyScalar(distance));
      controls.update();
      sceneDirty = true;
      scheduleFrame();
    };
    resetRef.current = resetCamera;
    centerRef.current = centerCamera;

    const drawProtein = () => {
      const startedAt = performance.now();
      const opts = optionsRef.current;
      renderProtein(proteinGroup, model, current, currentTrapped, currentConcentration, opts, 1, irreversibleRef.current);
      if (lastGhostState !== opts.compare) {
        disposeGroup(ghostGroup);
        if (opts.compare) renderProtein(ghostGroup, model, 0, 0, 0, { helices: true, sheets: true, disulfides: false, ions: false, hydrogenBonds: false }, 0.22);
        lastGhostState = opts.compare;
      }
      if (lastGeometryBuild === 0) resetCamera();
      lastGeometryBuild = performance.now();
      const buildDuration = lastGeometryBuild - startedAt;
      // Adapt the geometry refresh cadence to the actual CPU cost. The camera
      // can still render between structure rebuilds, while slow devices avoid
      // accumulating a queue of expensive geometry work.
      if (buildDuration > 27) geometryFrameInterval = 1000 / 30;
      else if (buildDuration > 18) geometryFrameInterval = 1000 / 40;
      else if (buildDuration < 13) geometryFrameInterval = 1000 / 60;
      proteinDirty = false;
      forceProteinBuild = false;
      sceneDirty = true;
    };

    let animate: (time: number) => void;
    const scheduleFrame = () => {
      if (disposed || document.hidden || frameId !== null) return;
      frameId = requestAnimationFrame((time) => animate(time));
    };

    const onControlsChange = () => {
      controlsChanged = true;
      sceneDirty = true;
      scheduleFrame();
    };
    const onControlsStart = () => {
      controlsInteracting = true;
      scheduleFrame();
    };
    const onControlsEnd = () => {
      controlsInteracting = false;
      scheduleFrame();
    };
    controls.addEventListener('change', onControlsChange);
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('end', onControlsEnd);

    const onRefresh = () => {
      proteinDirty = true;
      forceProteinBuild = true;
      scheduleFrame();
    };
    const onTargetChange = () => scheduleFrame();
    window.addEventListener('lysozyme:refresh-view', onRefresh);
    window.addEventListener('lysozyme:target-change', onTargetChange);

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      sceneDirty = true;
      scheduleFrame();
    }) : null;
    resizeObserver?.observe(host);

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
      } else {
        sceneDirty = true;
        proteinDirty = true;
        forceProteinBuild = true;
        scheduleFrame();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    animate = (now) => {
      frameId = null;
      if (disposed || document.hidden) return;
      const deltaSeconds = lastFrameTime === 0 ? 1 / 60 : Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const irreversibleNow = irreversibleRef.current;
      if (irreversibleNow && !lastIrreversible) {
        lastIrreversible = true;
        shakeStartedAt = reduceMotion ? 0 : now;
        sceneDirty = true;
      } else if (!irreversibleNow && lastIrreversible) {
        lastIrreversible = false;
        shakeStartedAt = 0;
        proteinGroup.position.set(0, 0, 0);
        proteinGroup.rotation.set(0, 0, 0);
        sceneDirty = true;
      }

      let shaking = false;
      if (shakeStartedAt > 0) {
        const progress = (now - shakeStartedAt) / 520;
        if (progress >= 1) {
          shakeStartedAt = 0;
          proteinGroup.position.set(0, 0, 0);
          proteinGroup.rotation.set(0, 0, 0);
        } else {
          const envelope = (1 - progress) * (1 - progress);
          const phase = progress * Math.PI * 8;
          proteinGroup.position.set(0.055 * envelope * Math.sin(phase), 0.028 * envelope * Math.sin(phase * 0.73), 0);
          proteinGroup.rotation.set(0.009 * envelope * Math.sin(phase * 0.8), 0, 0.012 * envelope * Math.cos(phase));
          shaking = true;
        }
        sceneDirty = true;
      }

      const target = targetRef.current;
      const targetTrapped = trappedRef.current;
      const targetConcentration = concentrationRef.current;
      const delta = target - current;
      const trappedDelta = targetTrapped - currentTrapped;
      const concentrationDelta = targetConcentration - currentConcentration;
      const isMorphing = Math.abs(delta) > 0.0006 || Math.abs(trappedDelta) > 0.0006 || Math.abs(concentrationDelta) > 0.004;
      if (isMorphing) {
        // Time-based exponential easing has the same response on 60/120 Hz
        // displays and does not lag by a fixed number of animation frames.
        const alpha = 1 - Math.exp(-deltaSeconds / 0.052);
        current += delta * alpha;
        currentTrapped += trappedDelta * alpha;
        currentConcentration += concentrationDelta * alpha;
        proteinDirty = true;
      } else if (Math.abs(delta) > 0 || Math.abs(trappedDelta) > 0 || Math.abs(concentrationDelta) > 0) {
        current = target;
        currentTrapped = targetTrapped;
        currentConcentration = targetConcentration;
        proteinDirty = true;
      }

      if (proteinDirty && (forceProteinBuild || now - lastGeometryBuild >= geometryFrameInterval || !isMorphing)) {
        drawProtein();
      }

      controlsChanged = false;
      controls.update();
      if (sceneDirty || controlsChanged || shaking) {
        renderer.render(scene, camera);
        sceneDirty = false;
      }

      const stillMorphing = Math.abs(targetRef.current - current) > 0.0006
        || Math.abs(trappedRef.current - currentTrapped) > 0.0006
        || Math.abs(concentrationRef.current - currentConcentration) > 0.004;
      if (stillMorphing || shaking || controlsChanged || controlsInteracting) scheduleFrame();
    };

    // First frame creates the native structure and fits the camera; thereafter
    // rendering is demand-driven instead of running a permanent idle RAF loop.
    drawProtein();
    renderer.render(scene, camera);
    sceneDirty = false;

    return () => {
      disposed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      window.removeEventListener('lysozyme:refresh-view', onRefresh);
      window.removeEventListener('lysozyme:target-change', onTargetChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controls.removeEventListener('change', onControlsChange);
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('end', onControlsEnd);
      resizeObserver?.disconnect();
      controls.dispose();
      disposeGroup(proteinGroup);
      disposeGroup(ghostGroup);
      renderer.dispose();
      renderer.domElement.remove();
      resetRef.current = null;
      centerRef.current = null;
    };
  }, [model]);

  return (
    <div className="protein-viewer-shell">
      <div className="protein-viewer" ref={hostRef}>
        {!model && (
          <div className="viewer-empty">
            <div className="viewer-empty-mark">α β</div>
            <strong>Native Struktur wird geladen</strong>
            <span>Die 1LYZ-PDB-Koordinaten werden lokal benötigt.</span>
          </div>
        )}
      </div>
      {model && (
        <div className="viewer-toolbar" aria-label="Molekül- und Kamerasteuerung">
          <button className="viewer-experiment-reset" type="button" onClick={onReset} title="Das Experiment auf 0,0 mol/L und den nativen Ausgangszustand zurücksetzen" aria-label="Experiment zurücksetzen">↺ Reset</button>
          <button type="button" onClick={() => resetRef.current?.()} title="Kameraposition zurücksetzen" aria-label="Kameraposition zurücksetzen">⌂</button>
          <button type="button" onClick={() => centerRef.current?.()} title="Protein im Bild zentrieren" aria-label="Protein zentrieren">◎</button>
          <span>Ziehen: drehen · Zwei Finger: zoomen/verschieben</span>
        </div>
      )}
      <div className="viewer-state-badge"><span className="live-dot" /> Didaktisches Strukturmodell</div>
    </div>
  );
}
