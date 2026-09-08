import { describe, expect, it } from 'vitest';
import { prepareCodeForIframe } from './ThreeJsViewer';

/** Mirrors the shape of real LLM-generated scenes (IIFE + indented consts). */
const IIFE_SCENE = `(function() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(15, 3, 15);

  if (THREE.OrbitControls) {
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.update();
  }

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
})();`;

describe('prepareCodeForIframe', () => {
  it('exposes IIFE-wrapped scene locals before the IIFE closes', () => {
    const out = prepareCodeForIframe(IIFE_SCENE);
    expect(out).toContain('window.camera = camera;');
    expect(out).toContain('window.renderer = renderer;');
    expect(out).toContain('window.scene = scene;');
    expect(out).toContain('window.controls = controls;');
    expect(out).toMatch(/window\.camera = camera;[\s\S]*window\.controls = controls;[\s\S]*\}\)\(\);/);
  });

  it('keeps the original scene body intact', () => {
    const out = prepareCodeForIframe(IIFE_SCENE);
    expect(out).toContain('new THREE.OrbitControls(camera, renderer.domElement)');
    expect(out).toContain('renderer.render(scene, camera)');
  });

  it('leaves code without a trailing IIFE untouched', () => {
    const plain = `function init() { console.log('hi'); }\ninit();`;
    expect(prepareCodeForIframe(plain)).toBe(plain);
  });
});
