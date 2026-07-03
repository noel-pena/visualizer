import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { HueSaturationShader } from 'three/examples/jsm/shaders/HueSaturationShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { DotScreenPass } from 'three/examples/jsm/postprocessing/DotScreenPass.js';
import { KaleidoShader } from 'three/examples/jsm/shaders/KaleidoShader.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SobelOperatorShader } from 'three/examples/jsm/shaders/SobelOperatorShader.js';
import { HalftonePass } from 'three/examples/jsm/postprocessing/HalftonePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as THREE from 'three';

const RetroPixelShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    'pixelSize': { value: 8.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;
    void main() {
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor(vUv / dxy);
      vec4 color = texture2D(tDiffuse, coord);
      
      // Cyberpunk green phosphor luminance map
      float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      vec3 retroColor = vec3(0.1, luminance * 1.5, 0.2); 
      
      // Add a slight grid line for the "terminal block" look
      vec2 grid = fract(vUv / dxy);
      if(grid.x < 0.1 || grid.y < 0.1) retroColor *= 0.6;

      gl_FragColor = vec4(retroColor, color.a);
    }
  `
};

export class PostProcessor {
  constructor(app) {
    this.app = app;
    this.composer = null;
    this.glitchPass = null;
    this.filmPass = null;
    this.huePass = null;
    this.rgbShiftPass = null;
    this.dotScreenPass = null;
    this.afterimagePass = null;
    this.kaleidoPass = null;
    this.asciiPass = null;
    this.bloomPass = null;
    this.sobelPass = null;
    this.halftonePass = null;
    this.outputPass = null;
    this.smaaPass = null;

    this.baseFilmIntensity = 0.2;
    this.baseBloomStrength = 0.55;
  }

  init() {
    const renderer = this.app.rendererManager.renderer;
    const scene = this.app.rendererManager.scene;
    const camera = this.app.rendererManager.camera;

    this.composer = new EffectComposer(renderer);

    // RenderPass must clear with alpha 0
    const renderPass = new RenderPass(scene, camera);
    renderPass.clearAlpha = 0;
    this.composer.addPass(renderPass);

    // Afterimage Pass (Must be early, before noise/glitch, so we only trail the geometry!)
    this.afterimagePass = new AfterimagePass();
    const afterimageToggle = document.getElementById('afterimage-toggle');
    this.afterimagePass.enabled = afterimageToggle ? afterimageToggle.checked : false;
    const afterimageSlider = document.getElementById('afterimage-damp-slider');
    this.afterimagePass.uniforms['damp'].value = afterimageSlider ? parseFloat(afterimageSlider.value) : 0.9;
    this.composer.addPass(this.afterimagePass);

    // Unreal Bloom Pass (Makes bright things glow)
    // Strength tuned for the sRGB output pipeline — higher values blow out to white
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.baseBloomStrength, 0.4, 0.85);
    const bloomToggle = document.getElementById('bloom-toggle');
    this.bloomPass.enabled = bloomToggle ? bloomToggle.checked : true;
    this.composer.addPass(this.bloomPass);

    // Neon Edges (Sobel Operator)
    this.sobelPass = new ShaderPass(SobelOperatorShader);
    this.sobelPass.uniforms['resolution'].value.set(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio);
    const sobelToggle = document.getElementById('sobel-toggle');
    this.sobelPass.enabled = sobelToggle ? sobelToggle.checked : false;
    this.composer.addPass(this.sobelPass);

    // Comic Book (Halftone)
    this.halftonePass = new HalftonePass(window.innerWidth, window.innerHeight, {});
    const halftoneToggle = document.getElementById('halftone-toggle');
    this.halftonePass.enabled = halftoneToggle ? halftoneToggle.checked : false;
    this.composer.addPass(this.halftonePass);

    // Kaleidoscope Pass
    this.kaleidoPass = new ShaderPass(KaleidoShader);
    this.kaleidoPass.uniforms['sides'].value = 6.0;
    this.kaleidoPass.uniforms['angle'].value = 0.0;
    const kaleidoToggle = document.getElementById('kaleidoscope-toggle');
    this.kaleidoPass.enabled = kaleidoToggle ? kaleidoToggle.checked : false;
    this.composer.addPass(this.kaleidoPass);

    // Retro Terminal / ASCII Pass
    this.asciiPass = new ShaderPass(RetroPixelShader);
    this.asciiPass.uniforms['resolution'].value.set(window.innerWidth, window.innerHeight);
    const asciiToggle = document.getElementById('ascii-toggle');
    this.asciiPass.enabled = asciiToggle ? asciiToggle.checked : false;
    this.composer.addPass(this.asciiPass);

    // Glitch Pass
    this.glitchPass = new GlitchPass();
    this.glitchPass.enabled = false;
    this.composer.addPass(this.glitchPass);

    // Hue Pass
    this.huePass = new ShaderPass(HueSaturationShader);
    const materialSelect = document.getElementById('material-select');
    this.huePass.enabled = materialSelect ? (materialSelect.value === 'Hue') : true;
    this.composer.addPass(this.huePass);

    // RGB Shift Pass
    this.rgbShiftPass = new ShaderPass(RGBShiftShader);
    this.rgbShiftPass.uniforms['amount'].value = 0.0;
    this.composer.addPass(this.rgbShiftPass);

    // Dot Screen Pass
    this.dotScreenPass = new DotScreenPass();
    const dotScreenToggle = document.getElementById('dot-screen-toggle');
    this.dotScreenPass.enabled = dotScreenToggle ? dotScreenToggle.checked : false;
    const dotScreenSlider = document.getElementById('dot-screen-scale-slider');
    this.dotScreenPass.uniforms['scale'].value = dotScreenSlider ? parseFloat(dotScreenSlider.value) : 1.0;
    this.composer.addPass(this.dotScreenPass);

    // Film Pass (Should be near the end so grain is crisp)
    // three r157+ FilmPass API: (intensity, grayscale)
    const filmNoiseSlider = document.getElementById('film-noise-slider');
    this.baseFilmIntensity = filmNoiseSlider ? parseFloat(filmNoiseSlider.value) : 0.2;

    this.filmPass = new FilmPass(this.baseFilmIntensity, false);
    this.composer.addPass(this.filmPass);

    // Output Pass (linear -> sRGB conversion; without it colors render too dark)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // SMAA PASS (MUST BE LAST)
    const pixelRatio = renderer.getPixelRatio();
    this.smaaPass = new SMAAPass(
      window.innerWidth * pixelRatio,
      window.innerHeight * pixelRatio
    );
    this.composer.addPass(this.smaaPass);
  }

  setSize(width, height, canvasWidth, canvasHeight) {
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.smaaPass) {
      this.smaaPass.setSize(canvasWidth, canvasHeight);
    }
    if (this.asciiPass) {
      this.asciiPass.uniforms['resolution'].value.set(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.setSize(width, height);
    }
    if (this.sobelPass) {
      this.sobelPass.uniforms['resolution'].value.set(canvasWidth, canvasHeight);
    }
    if (this.halftonePass) {
      this.halftonePass.setSize(width, height);
    }
  }

  render(now) {
    if (this.composer) {
      this.composer.render();
    }
  }
}
