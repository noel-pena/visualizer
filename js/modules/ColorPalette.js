import * as THREE from 'three';

// Longest edge for an uploaded background image — phone photos are 12MP+,
// far more than a 1080p/4K frame needs and heavy on mobile GPU memory.
const MAX_BACKGROUND_IMAGE_EDGE = 2048;

// Palette state + UI wiring. Primary tints Wireframe/Solid materials (any mode);
// Background is the scene backdrop (flat color, or an uploaded image); in
// 'palette' mode the cycling scenes (terrain, particles) blend
// primary<->secondary instead of looping the full hue wheel.
export class ColorPalette {
  constructor(app) {
    this.app = app;
    this.mode = 'spectrum';
    this.primary = new THREE.Color('#ffffff');
    this.secondary = new THREE.Color('#c084fc');
    this.background = '#000000';
    this.backgroundTexture = null; // uploaded image, overrides the color

    // UI hook — set by UIController, fired when an image is set or removed
    this.onBackgroundImageChange = null;
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

  // The background lives inside the WebGL scene so it survives bloom (which
  // makes the canvas opaque) and lands in recordings/snapshots for free.
  applyBackground() {
    const scene = this.app.rendererManager?.scene;
    if (!scene) return;

    if (this.backgroundTexture) {
      scene.background = this.backgroundTexture;
      this.fitBackgroundImage();
    } else {
      scene.background = new THREE.Color(this.background);
    }
  }

  setBackgroundImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);

      const scale = Math.min(1, MAX_BACKGROUND_IMAGE_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;

      if (this.backgroundTexture) this.backgroundTexture.dispose();
      this.backgroundTexture = texture;
      this.applyBackground();
      if (this.onBackgroundImageChange) this.onBackgroundImageChange(true);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.error('Could not load background image');
    };
    img.src = url;
  }

  clearBackgroundImage() {
    if (this.backgroundTexture) this.backgroundTexture.dispose();
    this.backgroundTexture = null;
    this.applyBackground();
    if (this.onBackgroundImageChange) this.onBackgroundImageChange(false);
  }

  // Crop the image to cover the frame (like CSS background-size: cover).
  // Called again whenever the render aspect ratio changes.
  fitBackgroundImage() {
    const texture = this.backgroundTexture;
    const renderer = this.app.rendererManager;
    if (!texture || !renderer) return;

    const frameAspect = renderer.currentWidth / renderer.currentHeight;
    const imageAspect = texture.image.width / texture.image.height;

    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    if (imageAspect > frameAspect) {
      texture.repeat.x = frameAspect / imageAspect;
      texture.offset.x = (1 - texture.repeat.x) / 2;
    } else {
      texture.repeat.y = imageAspect / frameAspect;
      texture.offset.y = (1 - texture.repeat.y) / 2;
    }
  }
}
