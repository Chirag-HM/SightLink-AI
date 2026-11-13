import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

function canRender3D() {
  if (typeof window === 'undefined') return false;
  try {
    const cores = navigator.hardwareConcurrency;
    if (typeof cores === 'number' && cores < 2) return false;
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export default function AuthAmbientScene({ reducedMotion = false }) {
  const mountRef = useRef(null);
  const [supported, setSupported] = useState(() => !reducedMotion && canRender3D());

  useEffect(() => {
    if (reducedMotion || !canRender3D()) {
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
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
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
    const camera = new THREE.PerspectiveCamera(48, Math.max(0.5, width / Math.max(1, height)), 0.1, 100);
    camera.position.z = 7.4;

    const hemi = new THREE.HemisphereLight(0xfcfbf7, 0x065f46, 1.3);
    scene.add(hemi);
    const emeraldLight = new THREE.DirectionalLight(0x10b981, 1.8);
    emeraldLight.position.set(-4, 4, 5);
    scene.add(emeraldLight);
    const goldLight = new THREE.DirectionalLight(0xd4af37, 1.7);
    goldLight.position.set(4, -3, 5);
    scene.add(goldLight);

    const ringGeo = new THREE.TorusGeometry(2.85, 0.026, 14, 96);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xc59b42,
      emissive: 0x8a651d,
      emissiveIntensity: 0.25,
      metalness: 0.7,
      roughness: 0.25,
      transparent: true,
      opacity: 0.42,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.36;
    scene.add(ring);

    const ringGeo2 = new THREE.TorusGeometry(3.65, 0.022, 14, 96);
    const ringMat2 = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      emissive: 0x064e3b,
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.28,
      transparent: true,
      opacity: 0.36,
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.y = Math.PI * 0.28;
    scene.add(ring2);

    const particlesCount = 96;
    const pos = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ptsMat = new THREE.PointsMaterial({
      color: 0x065f46,
      size: 0.055,
      transparent: true,
      opacity: 0.42,
    });
    const pts = new THREE.Points(ptsGeo, ptsMat);
    scene.add(pts);

    const syncSize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    window.addEventListener('resize', syncSize);

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      ring.rotation.z = t * 0.14;
      ring2.rotation.z = -t * 0.11;
      pts.rotation.y = t * 0.04;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener('resize', syncSize);
      ringGeo.dispose();
      ringMat.dispose();
      ringGeo2.dispose();
      ringMat2.dispose();
      ptsGeo.dispose();
      ptsMat.dispose();
      renderer.dispose();
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [reducedMotion]);

  if (!supported || reducedMotion) {
    return (
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 22% 28%, rgba(6,95,70,0.08), transparent 55%), radial-gradient(circle at 78% 72%, rgba(197,155,66,0.12), transparent 52%), linear-gradient(155deg, #FCFBF7 0%, #FAF7F0 52%, #F3EDE0 100%)',
        }}
        aria-hidden="true"
      />
    );
  }

  return <div ref={mountRef} className="fixed inset-0 pointer-events-none z-[1]" aria-hidden="true" />;
}
