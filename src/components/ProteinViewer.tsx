import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ProteinModel, ProteinResidue, SecondaryType, SulfurAtom, Vec3Tuple } from '../lib/pdb';
import { getSecondaryRetention, morphCoordinates } from '../lib/model';

type Props = {
  model: ProteinModel | null;
  unfolded: number;
  trapped: number;
  concentration: number;
  compare: boolean;
  showHelices: boolean;
  showSheets: boolean;
  showDisulfides: boolean;
  showIonInteractions: boolean;
};

const COLORS: Record<SecondaryType, number> = {
  helix: 0x55d6d2,
  sheet: 0xf4bf64,
  loop: 0xc7d1d8,
};

const ION_COLORS = {
  guanidinium: 0xff8c68,
  chloride: 0x72bfff,
  hydrogenBond: 0x9ce9dd,
  disulfide: 0xa8efa0,
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
  const steps = Math.max(points.length * 5, 20);
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    let side = tangent.clone().cross(new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 0.001) side = tangent.clone().cross(new THREE.Vector3(1, 0, 0));
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
  return new THREE.Mesh(geometry, material);
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

function addIonSphere(group: THREE.Group, position: THREE.Vector3, color: number, radius: number, emissive: number) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 10),
    new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.62,
      roughness: 0.28,
      metalness: 0.08,
    }),
  );
  mesh.position.copy(position);
  group.add(mesh);
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

function renderProtein(
  group: THREE.Group,
  model: ProteinModel,
  reversibleAmount: number,
  trappedAmount: number,
  concentration: number,
  options: { helices: boolean; sheets: boolean; disulfides: boolean; ions: boolean },
  opacity = 1,
) {
  disposeGroup(group);
  const effectiveAmount = 1 - (1 - reversibleAmount) * (1 - trappedAmount);
  const morphedPositions = morphCoordinates(model, reversibleAmount, trappedAmount);
  const centroid = morphedPositions.reduce<[number, number, number]>(
    (sum, point) => [sum[0] + point[0] / morphedPositions.length, sum[1] + point[1] / morphedPositions.length, sum[2] + point[2] / morphedPositions.length],
    [0, 0, 0],
  );
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
  group.add(new THREE.Mesh(
    new THREE.TubeGeometry(backboneCurve, Math.max(180, coords.length * 3), 0.105 + effectiveAmount * 0.035, 7, false),
    new THREE.MeshStandardMaterial({ color: 0xaab7bd, roughness: 0.68, transparent: opacity < 1, opacity: 0.68 * opacity }),
  ));

  if (options.helices) {
    const retention = getSecondaryRetention(effectiveAmount, 'helix');
    const tint = new THREE.Color(COLORS.helix).lerp(new THREE.Color(COLORS.loop), 1 - retention * 0.88);
    for (const run of runsOfType(model.residues, 'helix')) {
      const points = run.map((residue) => coordBySeq.get(residue.seq)).filter((point): point is THREE.Vector3 => Boolean(point));
      if (points.length < 3) continue;
      const curve = new THREE.CatmullRomCurve3(points);
      group.add(new THREE.Mesh(
        new THREE.TubeGeometry(curve, points.length * 5, 0.09 + 0.155 * retention, 9, false),
        new THREE.MeshStandardMaterial({
          color: tint,
          metalness: 0.16,
          roughness: 0.4 + (1 - retention) * 0.25,
          transparent: true,
          opacity: opacity * (0.28 + 0.72 * retention),
          depthWrite: retention > 0.45 && opacity > 0.85,
        }),
      ));
    }
  }

  if (options.sheets) {
    const retention = getSecondaryRetention(effectiveAmount, 'sheet');
    const tint = new THREE.Color(COLORS.sheet).lerp(new THREE.Color(COLORS.loop), 1 - retention * 0.9);
    for (const run of runsOfType(model.residues, 'sheet')) {
      const points = run.map((residue) => coordBySeq.get(residue.seq)).filter((point): point is THREE.Vector3 => Boolean(point));
      if (points.length < 3) continue;
      group.add(makeRibbon(points, 0.28 + 0.62 * retention, tint.getHex(), opacity * (0.25 + 0.75 * retention)));
    }
  }

  if (options.disulfides) {
    const sulfurBySeq = new Map<number, SulfurAtom>();
    model.sulfurs.forEach((atom) => sulfurBySeq.set(atom.residue, atom));
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
      addCovalentSegment(group, sgA, sgB, ION_COLORS.disulfide, 0.034, opacity);
      addIonSphere(group, sgA, 0xd8ffad, 0.048, 0x457a39);
      addIonSphere(group, sgB, 0xd8ffad, 0.048, 0x457a39);
    }
  }

  if (options.ions) {
    const contactOpacity = opacity * Math.max(0.025, 0.72 * (1 - effectiveAmount));
    const anchorVertices: THREE.Vector3[] = [];
    const dashedVertices: THREE.Vector3[] = [];

    // Show more structurally screened backbone contacts than the earlier
    // 38-line cap. Each O/N endpoint gets a short connector to its own C-alpha
    // trace so that hydrogen-bond marks visibly belong to the polypeptide.
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
        dashedVertices.push(
          acceptor.clone().addScaledVector(vector, from),
          acceptor.clone().addScaledVector(vector, to),
        );
      }
    }

    if (anchorVertices.length) {
      const geometry = new THREE.BufferGeometry().setFromPoints(anchorVertices);
      group.add(new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xa7c2c5, transparent: true, opacity: contactOpacity * 0.58, depthWrite: false }),
      ));
    }
    if (dashedVertices.length) {
      const geometry = new THREE.BufferGeometry().setFromPoints(dashedVertices);
      group.add(new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: ION_COLORS.hydrogenBond, transparent: true, opacity: contactOpacity, depthWrite: false }),
      ));
    }

    // Guanidinium cations are schematically placed near acidic side chains and
    // selected backbone carbonyl oxygens. Chloride is shown in the solvent shell.
    const amount = THREE.MathUtils.clamp(concentration / 8, 0, 1);
    const targets = model.gdmTargets;
    const maximumGdmIons = 30;
    const activeGdmCount = amount * maximumGdmIons;
    const gdmCount = Math.ceil(activeGdmCount);
    const sceneCenter = new THREE.Vector3(0, 0, 0);
    if (gdmCount > 0 && targets.length > 0) {
      const ionGeometry = new THREE.SphereGeometry(0.115, 14, 12);
      for (let i = 0; i < gdmCount; i += 1) {
        const activation = THREE.MathUtils.clamp(activeGdmCount - i, 0, 1);
        const target = targets[Math.floor(((i + 0.5) * targets.length) / maximumGdmIons)];
        const anchor = toScene(target.xyz, target.residue);
        const residueCa = coordBySeq.get(target.residue);
        // Enter from the direction extending the actual side-chain/carbonyl
        // vector. New ions approach the PDB contact site smoothly as GdmCl rises.
        const outward = anchor.clone().sub(residueCa ?? sceneCenter);
        if (outward.lengthSq() < 0.0001) outward.copy(anchor).sub(sceneCenter);
        if (outward.lengthSq() < 0.0001) outward.set(Math.sin(i * 1.7), Math.cos(i * 1.3), 0.7);
        outward.normalize();
        const startOffset = 0.72;
        const boundOffset = 0.22;
        const offset = THREE.MathUtils.lerp(startOffset, boundOffset, activation);
        const ionPosition = anchor.clone().addScaledVector(outward, offset);
        const material = new THREE.MeshStandardMaterial({
          color: ION_COLORS.guanidinium,
          emissive: 0x872e25,
          emissiveIntensity: 0.55,
          roughness: 0.28,
          transparent: activation < 1 || opacity < 1,
          opacity: opacity * activation,
          depthWrite: activation > 0.9 && opacity > 0.85,
        });
        const mesh = new THREE.Mesh(ionGeometry, material);
        mesh.position.copy(ionPosition);
        mesh.scale.setScalar(0.28 + 0.72 * activation);
        group.add(mesh);
        const connectorGeometry = new THREE.BufferGeometry().setFromPoints([anchor, ionPosition]);
        group.add(new THREE.Line(connectorGeometry, new THREE.LineBasicMaterial({
          color: ION_COLORS.guanidinium,
          transparent: true,
          opacity: opacity * 0.5 * activation,
          depthWrite: false,
        })));
      }
    }

    const chlorideCount = Math.min(12, Math.round(amount * 12));
    if (chlorideCount > 0) {
      const bounds = new THREE.Box3().setFromPoints(coords);
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius + 0.56;
      const chlorideGeometry = new THREE.SphereGeometry(0.105, 12, 10);
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < chlorideCount; i += 1) {
        const y = 1 - 2 * ((i + 0.5) / chlorideCount);
        const radial = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = goldenAngle * i + 0.45;
        const position = new THREE.Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial).multiplyScalar(radius);
        const mesh = new THREE.Mesh(
          chlorideGeometry,
          new THREE.MeshStandardMaterial({ color: ION_COLORS.chloride, emissive: 0x1f5d9b, emissiveIntensity: 0.38, roughness: 0.34 }),
        );
        mesh.position.copy(position);
        group.add(mesh);
      }
    }
  }

}

export function ProteinViewer({ model, unfolded, trapped, concentration, compare, showHelices, showSheets, showDisulfides, showIonInteractions }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(unfolded);
  const trappedRef = useRef(trapped);
  const concentrationRef = useRef(concentration);
  const optionsRef = useRef({ helices: showHelices, sheets: showSheets, disulfides: showDisulfides, ions: showIonInteractions, compare });
  const resetRef = useRef<(() => void) | null>(null);
  const centerRef = useRef<(() => void) | null>(null);

  useEffect(() => { targetRef.current = unfolded; }, [unfolded]);
  useEffect(() => { trappedRef.current = trapped; }, [trapped]);
  useEffect(() => { concentrationRef.current = concentration; }, [concentration]);
  useEffect(() => {
    optionsRef.current = { helices: showHelices, sheets: showSheets, disulfides: showDisulfides, ions: showIonInteractions, compare };
    if (model) window.dispatchEvent(new CustomEvent('lysozyme:refresh-view'));
  }, [compare, model, showDisulfides, showHelices, showSheets, showIonInteractions]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !model) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      host.innerHTML = '<div class="viewer-empty"><strong>3D-Darstellung nicht verfügbar</strong><span>Bitte aktiviere WebGL bzw. Hardwarebeschleunigung in diesem Browser.</span></div>';
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101a22');
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 1000);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
    controls.minDistance = 3.2;
    controls.maxDistance = 40;

    let current = targetRef.current;
    let currentTrapped = trappedRef.current;
    let currentConcentration = concentrationRef.current;
    let frameId = 0;
    let disposed = false;
    let lastDraw = 0;
    let lastGhostState: boolean | null = null;
    const fitSphere = () => {
      const box = new THREE.Box3().setFromObject(proteinGroup);
      return box.getBoundingSphere(new THREE.Sphere());
    };
    const resetCamera = () => {
      const sphere = fitSphere();
      controls.target.copy(sphere.center);
      const distance = Math.max(7, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.3);
      camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0, distance));
      camera.near = Math.max(0.05, distance / 250);
      camera.far = distance * 20;
      camera.updateProjectionMatrix();
      controls.update();
    };
    const centerCamera = () => {
      const sphere = fitSphere();
      const direction = camera.position.clone().sub(controls.target).normalize();
      const distance = Math.max(3.2, camera.position.distanceTo(controls.target));
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).add(direction.multiplyScalar(distance));
      controls.update();
    };
    resetRef.current = resetCamera;
    centerRef.current = centerCamera;

    const draw = () => {
      if (disposed) return;
      const opts = optionsRef.current;
      renderProtein(proteinGroup, model, current, currentTrapped, currentConcentration, opts, 1);
      if (lastGhostState !== opts.compare) {
        disposeGroup(ghostGroup);
        if (opts.compare) renderProtein(ghostGroup, model, 0, 0, 0, { helices: true, sheets: true, disulfides: false, ions: false }, 0.22);
        lastGhostState = opts.compare;
      }
      if (lastDraw === 0) resetCamera();
      lastDraw = performance.now();
    };
    draw();

    const onRefresh = () => draw();
    window.addEventListener('lysozyme:refresh-view', onRefresh);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    }) : null;
    resizeObserver?.observe(host);

    const animate = () => {
      if (disposed) return;
      const target = targetRef.current;
      const targetTrapped = trappedRef.current;
      const targetConcentration = concentrationRef.current;
      const delta = target - current;
      const trappedDelta = targetTrapped - currentTrapped;
      const concentrationDelta = targetConcentration - currentConcentration;
      if (Math.abs(delta) > 0.0015 || Math.abs(trappedDelta) > 0.0015 || Math.abs(concentrationDelta) > 0.025) {
        current += delta * 0.09;
        currentTrapped += trappedDelta * 0.09;
        currentConcentration += concentrationDelta * 0.09;
        if (performance.now() - lastDraw >= 34) draw();
      } else if (Math.abs(delta) > 0 || Math.abs(trappedDelta) > 0 || Math.abs(concentrationDelta) > 0) {
        current = target;
        currentTrapped = targetTrapped;
        currentConcentration = targetConcentration;
        draw();
      }
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('lysozyme:refresh-view', onRefresh);
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
        <div className="viewer-toolbar" aria-label="3D-Kamerasteuerung">
          <button type="button" onClick={() => resetRef.current?.()} title="Kameraposition zurücksetzen" aria-label="Kameraposition zurücksetzen">↺</button>
          <button type="button" onClick={() => centerRef.current?.()} title="Protein im Bild zentrieren" aria-label="Protein zentrieren">◎</button>
          <span>Ziehen: drehen · Zwei Finger: zoomen/verschieben</span>
        </div>
      )}
      <div className="viewer-state-badge"><span className="live-dot" /> Didaktisches Strukturmodell</div>
    </div>
  );
}
