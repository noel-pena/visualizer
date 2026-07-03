import * as THREE from 'three';

// Palette state + UI wiring. Primary tints Wireframe/Solid materials (any mode);
// Background drives the page + recording backdrop (any mode); in 'palette' mode
// the cycling scenes (terrain, particles) blend primary<->secondary instead of
// looping the full hue wheel.
export class ColorPalette {
  constructor(app) {
    this.app = app;
    this.mode = 'spectrum';
    this.primary = new THREE.Color('#ffffff');
    this.secondary = new THREE.Color('#c084fc');
    this.background = '#0f172a';
  }

  init() {
    const modeEl = document.getElementById('color-mode-select');
    const primaryEl = document.getElementById('primary-color-input');
    const secondaryEl = document.getElementById('secondary-color-input');
    const bgEl = document.getElementById('background-color-input');

    this.mode = modeEl?.value || 'spectrum';
    if (primaryEl) this.primary.set(primaryEl.value);
    if (secondaryEl) this.secondary.set(secondaryEl.value);
    if (bgEl) this.background = bgEl.value;

    modeEl?.addEventListener('change', (e) => { this.mode = e.target.value; });
    primaryEl?.addEventListener('input', (e) => {
      this.primary.set(e.target.value);
      this.app.meshManager?.applyPaletteToMaterials();
    });
    secondaryEl?.addEventListener('input', (e) => { this.secondary.set(e.target.value); });
    bgEl?.addEventListener('input', (e) => {
      this.background = e.target.value;
      this.applyBackground();
    });

    this.applyBackground();
  }

  isPalette() {
    return this.mode === 'palette';
  }

  // Lerp primary -> secondary by t (clamped) into the given color object
  mix(t, target) {
    return target.copy(this.primary).lerp(this.secondary, THREE.MathUtils.clamp(t, 0, 1));
  }

  lighterBackgroundHex() {
    return '#' + new THREE.Color(this.background).lerp(new THREE.Color('#ffffff'), 0.12).getHexString();
  }

  applyBackground() {
    // CSS backdrop (only visible where the canvas is transparent)
    const container = document.getElementById('canvas-container');
    if (container) {
      container.style.backgroundImage =
        `radial-gradient(circle at center, ${this.lighterBackgroundHex()} 0%, ${this.background} 100%)`;
    }

    // Scene background — rendered inside WebGL so it survives bloom (which
    // makes the canvas opaque) and lands in recordings/snapshots for free.
    const scene = this.app.rendererManager?.scene;
    if (scene) {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.7);
      gradient.addColorStop(0, this.lighterBackgroundHex());
      gradient.addColorStop(1, this.background);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      if (scene.background && scene.background.dispose) scene.background.dispose();
      scene.background = texture;
    }
  }
}
