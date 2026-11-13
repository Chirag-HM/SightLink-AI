import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import StaticHeroOrbFallback from './StaticHeroOrbFallback';

function canUseLightweight3D() {
  if (typeof window === 'undefined') return false;
  try {
    const cores = navigator.hardwareConcurrency;
    const mem = navigator.deviceMemory;
    if (typeof cores === 'number' && cores < 2) return false;
    if (typeof mem === 'number' && mem < 1.5) return false;
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

function createRadialGlowTexture(stops) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export default function HeroOrbScene({ micLevel = 0, pulseTimestamp = 0, reducedMotion = false }) {
  const mountRef = useRef(null);
  const micRef = useRef(micLevel);
  const pulseRef = useRef(0);
  const [supported, setSupported] = useState(() => !reducedMotion && canUseLightweight3D());

  micRef.current = micLevel;

  useEffect(() => {
    if (pulseTimestamp > 0) {
      pulseRef.current = 1.0;
    }
  }, [pulseTimestamp]);

  useEffect(() => {
    if (reducedMotion || !canUseLightweight3D()) {
      setSupported(false);
      return undefined;
    }
    setSupported(true);

    const container = mountRef.current;
    if (!container) return undefined;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setSupported(false);
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height, false);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fov = 46;
    const camera = new THREE.PerspectiveCamera(fov, Math.max(0.5, width / Math.max(1, height)), 0.1, 100);
    camera.position.set(0, 0, 8.2);

    // Studio lighting tailored for Soft Ivory canvas: crisp Royal Emerald facets + brushed Champagne Gold rims
    const hemiLight = new THREE.HemisphereLight(0xfcfbf7, 0x065f46, 1.35);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(-5, 5, 6);
    scene.add(keyLight);

    const emeraldBounceLight = new THREE.DirectionalLight(0x10b981, 2.0);
    emeraldBounceLight.position.set(5, -4, 5);
    scene.add(emeraldBounceLight);

    const goldRimLight = new THREE.DirectionalLight(0xd4af37, 2.1);
    goldRimLight.position.set(0, 4, -4);
    scene.add(goldRimLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Subtle luminous mist behind the 3D orb (NormalBlending so it stays visible and refined on Ivory)
    const haloTex = createRadialGlowTexture([
      [0, 'rgba(212, 175, 55, 0.24)'],
      [0.34, 'rgba(6, 95, 70, 0.16)'],
      [0.68, 'rgba(16, 185, 129, 0.08)'],
      [1, 'rgba(250, 247, 240, 0)'],
    ]);
    const spriteMat = new THREE.SpriteMaterial({
      map: haloTex,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const haloSprite = new THREE.Sprite(spriteMat);
    haloSprite.scale.set(6.2, 6.2, 1);
    haloSprite.position.z = -1.2;
    rootGroup.add(haloSprite);

    // Sculpted Royal Emerald crystal inner core
    const coreGeo = new THREE.IcosahedronGeometry(1.06, 2);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x059669,
      emissive: 0x064e3b,
      emissiveIntensity: 0.42,
      roughness: 0.18,
      metalness: 0.28,
      clearcoat: 0.95,
      clearcoatRoughness: 0.12,
      flatShading: true,
      transparent: true,
      opacity: 0.94,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    rootGroup.add(coreMesh);

    // Morphing sound-wave geodesic wireframe shell
    const detail = width < 640 ? 2 : 3;
    const waveGeo = new THREE.IcosahedronGeometry(1.56, detail);
    const waveBasePositions = Float32Array.from(waveGeo.attributes.position.array);
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0x065f46,
      wireframe: true,
      transparent: true,
      opacity: 0.36,
    });
    const waveMesh = new THREE.Mesh(waveGeo, waveMat);
    rootGroup.add(waveMesh);

    // Champagne Gold vertex particles locked to the acoustic geodesic shell
    const dotTex = createRadialGlowTexture([
      [0, 'rgba(184, 142, 61, 1)'],
      [0.45, 'rgba(197, 155, 66, 0.78)'],
      [1, 'rgba(197, 155, 66, 0)'],
    ]);
    const shellPtsMat = new THREE.PointsMaterial({
      map: dotTex,
      color: 0xb88e3d,
      size: 0.1,
      transparent: true,
      opacity: 0.9,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const shellPoints = new THREE.Points(waveGeo, shellPtsMat);
    rootGroup.add(shellPoints);

    // Lit 3D Gyroscope & Beacon Rings (Champagne Gold + Royal Emerald + Forest Jade)
    const ringGeo1 = new THREE.TorusGeometry(2.05, 0.032, 16, 108);
    const ringMat1 = new THREE.MeshStandardMaterial({
      color: 0xc9a456,
      emissive: 0x8a651d,
      emissiveIntensity: 0.28,
      metalness: 0.78,
      roughness: 0.22,
      transparent: true,
      opacity: 0.94,
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI * 0.36;
    ring1.rotation.y = Math.PI * 0.12;
    rootGroup.add(ring1);

    const ringGeo2 = new THREE.TorusGeometry(2.46, 0.026, 16, 108);
    const ringMat2 = new THREE.MeshStandardMaterial({
      color: 0x047857,
      emissive: 0x064e3b,
      emissiveIntensity: 0.32,
      metalness: 0.55,
      roughness: 0.26,
      transparent: true,
      opacity: 0.88,
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.y = Math.PI * 0.38;
    ring2.rotation.x = Math.PI * 0.24;
    rootGroup.add(ring2);

    const ringGeo3 = new THREE.TorusGeometry(2.26, 0.018, 12, 96);
    const ringMat3 = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x065f46,
      emissiveIntensity: 0.26,
      metalness: 0.6,
      roughness: 0.25,
      transparent: true,
      opacity: 0.78,
    });
    const ring3 = new THREE.Mesh(ringGeo3, ringMat3);
    ring3.rotation.y = -Math.PI * 0.32;
    ring3.rotation.x = -Math.PI * 0.22;
    rootGroup.add(ring3);

    // Equatorial acoustic visualizer ring (32 bars rippling smoothly)
    const equalizerGroup = new THREE.Group();
    equalizerGroup.rotation.x = Math.PI * 0.36;
    equalizerGroup.rotation.y = Math.PI * 0.12;
    rootGroup.add(equalizerGroup);

    const barCount = 32;
    const barGeo = new THREE.BoxGeometry(0.042, 0.22, 0.042);
    const barMatGold = new THREE.MeshStandardMaterial({
      color: 0xc59b42,
      emissive: 0x8a651d,
      emissiveIntensity: 0.32,
      metalness: 0.65,
      roughness: 0.25,
    });
    const barMatEmerald = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      emissive: 0x064e3b,
      emissiveIntensity: 0.35,
      metalness: 0.45,
      roughness: 0.28,
    });
    const eqBars = [];
    const eqRadius = 1.84;
    for (let i = 0; i < barCount; i += 1) {
      const angle = (i / barCount) * Math.PI * 2;
      const bar = new THREE.Mesh(barGeo, i % 2 === 0 ? barMatGold : barMatEmerald);
      bar.position.set(Math.cos(angle) * eqRadius, Math.sin(angle) * eqRadius, 0);
      bar.rotation.z = angle - Math.PI / 2;
      bar.userData = { angle, index: i };
      equalizerGroup.add(bar);
      eqBars.push(bar);
    }

    // Floating 3D route/map beacon nodes + fine emerald filaments
    const nodeGeo = new THREE.OctahedronGeometry(0.125, 0);
    const goldNodeMat = new THREE.MeshStandardMaterial({
      color: 0xc9a456,
      emissive: 0x8a651d,
      emissiveIntensity: 0.35,
      metalness: 0.72,
      roughness: 0.2,
    });
    const emeraldNodeMat = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      emissive: 0x064e3b,
      emissiveIntensity: 0.4,
      metalness: 0.5,
      roughness: 0.22,
    });
    const jadeNodeMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x047857,
      emissiveIntensity: 0.35,
      metalness: 0.5,
      roughness: 0.24,
    });

    const nodePoints = [
      [2.35, 1.35, -0.3],
      [-2.35, 1.25, 0.35],
      [2.15, -1.45, 0.55],
      [-2.1, -1.35, -0.35],
      [0.3, 2.35, -0.65],
      [-0.45, -2.35, 0.45],
      [1.75, 0.15, 1.85],
      [-1.7, -0.1, -1.75],
    ];
    const nodeMats = [goldNodeMat, emeraldNodeMat, jadeNodeMat];
    const nodes = nodePoints.map((pos, idx) => {
      const mesh = new THREE.Mesh(nodeGeo, nodeMats[idx % 3]);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.userData = { base: [...pos], phase: idx * 0.95 };
      rootGroup.add(mesh);
      return mesh;
    });

    // Dynamic connecting route lines between nearby beacons & core
    const pairs = [];
    for (let i = 0; i < nodes.length; i += 1) {
      pairs.push([i, -1]); // beacon -> orb core
      pairs.push([i, (i + 1) % nodes.length]);
    }
    const linePositions = new Float32Array(pairs.length * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x065f46,
      transparent: true,
      opacity: 0.26,
    });
    const meshLines = new THREE.LineSegments(lineGeo, lineMat);
    rootGroup.add(meshLines);

    // Subtle parallax pointer
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointerMove = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      pointer.tx = nx * 0.32;
      pointer.ty = -ny * 0.24;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const syncSize = () => {
      if (!container) return;
      const nextW = container.clientWidth || window.innerWidth;
      const nextH = container.clientHeight || window.innerHeight;
      if (nextW <= 0 || nextH <= 0) return;
      width = nextW;
      height = nextH;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(container);
    window.addEventListener('resize', syncSize);

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      pulseRef.current = Math.max(0, pulseRef.current * 0.94);
      const energy = Math.min(1.4, micRef.current * 1.15 + pulseRef.current * 1.1);

      // Compute exact world center of the right-hand hero column on desktop
      const aspect = Math.max(0.5, width / Math.max(1, height));
      const halfH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * camera.position.z;
      const halfW = halfH * aspect;

      if (width >= 1024) {
        rootGroup.position.x = halfW * 0.44 + pointer.x * 0.45;
        rootGroup.position.y = 0.04 + pointer.y * 0.35;
        rootGroup.scale.setScalar(THREE.MathUtils.clamp(aspect * 0.56, 0.72, 1.04));
      } else {
        rootGroup.position.x = pointer.x * 0.25;
        rootGroup.position.y = 0.22 + pointer.y * 0.25;
        rootGroup.scale.setScalar(width >= 640 ? 0.75 : 0.58);
      }

      rootGroup.rotation.y = elapsed * 0.16 + pointer.x * 0.4;
      rootGroup.rotation.x = pointer.y * 0.28;

      // Sculpted crystal core gentle rotation & voice pulse
      coreMesh.rotation.y = -elapsed * 0.25;
      coreMesh.rotation.z = elapsed * 0.12;
      coreMesh.scale.setScalar(1 + energy * 0.18 + Math.sin(elapsed * 2) * 0.025);
      coreMat.emissiveIntensity = 0.52 + energy * 0.75;

      // Acoustic geodesic shell displacement
      const posAttr = waveGeo.attributes.position;
      const arr = posAttr.array;
      const waveAmp = 0.055 + energy * 0.24;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = waveBasePositions[i];
        const by = waveBasePositions[i + 1];
        const bz = waveBasePositions[i + 2];
        const ripple =
          Math.sin(bx * 2.4 + elapsed * 3.1) *
          Math.cos(by * 2.2 - elapsed * 2.5) *
          waveAmp;
        const s = 1 + ripple + energy * 0.12;
        arr[i] = bx * s;
        arr[i + 1] = by * s;
        arr[i + 2] = bz * s;
      }
      posAttr.needsUpdate = true;

      waveMat.opacity = 0.44 + energy * 0.36;
      haloSprite.scale.setScalar(6.2 + energy * 1.4);

      ring1.rotation.z = elapsed * (0.28 + energy * 0.35);
      ring1.scale.setScalar(1 + energy * 0.12);
      ring2.rotation.z = -elapsed * (0.22 + energy * 0.28);
      ring2.scale.setScalar(1 + energy * 0.09);
      ring3.rotation.z = elapsed * 0.18;

      // Equalizer ring bars ripple around equator
      equalizerGroup.rotation.z = elapsed * 0.24;
      eqBars.forEach((bar) => {
        const { index } = bar.userData;
        const wave = 0.45 + 0.55 * Math.sin(elapsed * 4.2 + index * 0.45);
        bar.scale.y = 0.55 + wave * (0.7 + energy * 2.2);
      });

      // Float orbital beacons & update mesh vector lines
      nodes.forEach((n) => {
        const { base, phase } = n.userData;
        n.position.y = base[1] + Math.sin(elapsed * 1.3 + phase) * 0.2;
        n.position.x = base[0] + Math.cos(elapsed * 0.8 + phase) * 0.1;
        n.rotation.y = elapsed * 1.1 + phase;
        n.rotation.x = elapsed * 0.7;
      });

      const lineArr = lineGeo.attributes.position.array;
      for (let p = 0; p < pairs.length; p += 1) {
        const [aIdx, bIdx] = pairs[p];
        const aPos = nodes[aIdx].position;
        const bPos = bIdx === -1 ? coreMesh.position : nodes[bIdx].position;
        const baseOffset = p * 6;
        lineArr[baseOffset] = aPos.x;
        lineArr[baseOffset + 1] = aPos.y;
        lineArr[baseOffset + 2] = aPos.z;
        lineArr[baseOffset + 3] = bPos.x;
        lineArr[baseOffset + 4] = bPos.y;
        lineArr[baseOffset + 5] = bPos.z;
      }
      lineGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', syncSize);
      haloTex?.dispose();
      dotTex?.dispose();
      spriteMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      waveGeo.dispose();
      waveMat.dispose();
      shellPtsMat.dispose();
      ringGeo1.dispose();
      ringMat1.dispose();
      ringGeo2.dispose();
      ringMat2.dispose();
      ringGeo3.dispose();
      ringMat3.dispose();
      barGeo.dispose();
      barMatGold.dispose();
      barMatEmerald.dispose();
      nodeGeo.dispose();
      goldNodeMat.dispose();
      emeraldNodeMat.dispose();
      jadeNodeMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      renderer.dispose();
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [reducedMotion]);

  if (!supported || reducedMotion) {
    return <StaticHeroOrbFallback isPulsing={pulseTimestamp > 0 || micLevel > 0.1} />;
  }

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 pointer-events-none select-none overflow-hidden z-[1]"
      aria-hidden="true"
    />
  );
}
