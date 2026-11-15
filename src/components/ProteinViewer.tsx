import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ProteinModel, ProteinResidue, SecondaryType, SulfurAtom } from '../lib/pdb';
import { getSecondaryRetention, morphCoordinates } from '../lib/model';

type Props = {
  model: ProteinModel | null;
  unfolded: number;
  compare: boolean;
  showHelices: boolean;
  showSheets: boolean;
  showDisulfides: boolean;
};

const COLORS: Record<SecondaryType, number> = {
  helix: 0x55d6d2,
  sheet: 0xf4bf64,
  loop: 0xc7d1d8,
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

function renderProtein(
  group: THREE.Group,
  model: ProteinModel,
  amount: number,
  options: { helices: boolean; sheets: boolean; disulfides: boolean },
  opacity = 1,
) {
  disposeGroup(group);
  const morphedPositions = morphCoordinates(model, amount);
  const centroid = morphedPositions.reduce<[number, number, number]>(
    (sum, point) => [sum[0] + point[0] / morphedPositions.length, sum[1] + point[1] / morphedPositions.length, sum[2] + point[2] / morphedPositions.length],
    [0, 0, 0],
  );
  const coords = morphedPositions.map(([x, y, z]) => new THREE.Vector3((x - centroid[0]) * 0.15, (y - centroid[1]) * 0.15, (z - centroid[2]) * 0.15));
  const coordBySeq = new Map<number, THREE.Vector3>();
  model.residues.forEach((residue, index) => coordBySeq.set(residue.seq, coords[index]));
  const indexBySeq = new Map<number, number>();
  model.residues.forEach((residue, index) => indexBySeq.set(residue.seq, index));

  // The backbone is always one connected Cα trace. Secondary-structure overlays
  // lose their visual regularity using the same retention functions as the bars.
  const backboneCurve = new THREE.CatmullRomCurve3(coords);
  group.add(new THREE.Mesh(
    new THREE.TubeGeometry(backboneCurve, Math.max(180, coords.length * 3), 0.105 + amount * 0.035, 7, false),
    new THREE.MeshStandardMaterial({ color: 0xaab7bd, roughness: 0.68, transparent: opacity < 1, opacity: 0.68 * opacity }),
  ));

  if (options.helices) {
    const retention = getSecondaryRetention(amount, 'helix');
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
    const retention = getSecondaryRetention(amount, 'sheet');
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
      const ia = indexBySeq.get(bond.a);
      const ib = indexBySeq.get(bond.b);
      const nativeA = model.residues[ia ?? -1];
      const nativeB = model.residues[ib ?? -1];
      if (!a || !b || !nativeA || !nativeB || ia === undefined || ib === undefined) continue;
      const deltaA = morphedPositions[ia].map((value, axis) => value - nativeA.xyz[axis]) as [number, number, number];
      const deltaB = morphedPositions[ib].map((value, axis) => value - nativeB.xyz[axis]) as [number, number, number];
      const start = new THREE.Vector3((a.xyz[0] + deltaA[0] - centroid[0]) * 0.15, (a.xyz[1] + deltaA[1] - centroid[1]) * 0.15, (a.xyz[2] + deltaA[2] - centroid[2]) * 0.15);
      const end = new THREE.Vector3((b.xyz[0] + deltaB[0] - centroid[0]) * 0.15, (b.xyz[1] + deltaB[1] - centroid[1]) * 0.15, (b.xyz[2] + deltaB[2] - centroid[2]) * 0.15);
      group.add(new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 16, 0.045, 6, false),
        new THREE.MeshStandardMaterial({ color: 0xe2a84f, emissive: 0x57350d, metalness: 0.28, roughness: 0.4, transparent: opacity < 1, opacity }),
      ));
    }
  }
}

export function ProteinViewer({ model, unfolded, compare, showHelices, showSheets, showDisulfides }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(unfolded);
  const optionsRef = useRef({ helices: showHelices, sheets: showSheets, disulfides: showDisulfides, compare });
  const resetRef = useRef<(() => void) | null>(null);
  const centerRef = useRef<(() => void) | null>(null);

  useEffect(() => { targetRef.current = unfolded; }, [unfolded]);
  useEffect(() => {
    optionsRef.current = { helices: showHelices, sheets: showSheets, disulfides: showDisulfides, compare };
    if (model) window.dispatchEvent(new CustomEvent('lysozyme:refresh-view'));
  }, [compare, model, showDisulfides, showHelices, showSheets]);

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
    let frameId = 0;
    let disposed = false;
    let lastDraw = 0;
    let lastGhostState: boolean | null = null;
    const fitSphere = () => {
      const box = new THREE.Box3().setFromObject(proteinGroup);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      return sphere;
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
      renderProtein(proteinGroup, model, current, opts, 1);
      if (lastGhostState !== opts.compare) {
        disposeGroup(ghostGroup);
        if (opts.compare) renderProtein(ghostGroup, model, 0, { helices: true, sheets: true, disulfides: false }, 0.22);
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
      const delta = target - current;
      if (Math.abs(delta) > 0.0015) {
        current += delta * 0.09;
        if (performance.now() - lastDraw >= 34) draw();
      } else if (Math.abs(delta) > 0) {
        current = target;
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
