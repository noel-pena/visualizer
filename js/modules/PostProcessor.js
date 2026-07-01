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
    this.smaaPass = null;

    this.baseFilmNoise = 0.2;
    this.baseFilmScanlines = 0.1;
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

    // Glitch Pass
    this.glitchPass = new GlitchPass();
    this.glitchPass.enabled = false;
    this.composer.addPass(this.glitchPass);

    // Film Pass
    const filmNoiseSlider = document.getElementById('film-noise-slider');
    const filmScanlineSlider = document.getElementById('film-scanline-slider');
    this.baseFilmNoise = filmNoiseSlider ? parseFloat(filmNoiseSlider.value) : 0.2;
    this.baseFilmScanlines = filmScanlineSlider ? parseFloat(filmScanlineSlider.value) : 0.1;

    this.filmPass = new FilmPass(
      this.baseFilmNoise,
      this.baseFilmScanlines,
      648,
      false
    );
    this.composer.addPass(this.filmPass);

    // Hue Pass
    this.huePass = new ShaderPass(HueSaturationShader);
    // Determine enabled state based on material select
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

    // Afterimage Pass
    this.afterimagePass = new AfterimagePass();
    const afterimageToggle = document.getElementById('afterimage-toggle');
    this.afterimagePass.enabled = afterimageToggle ? afterimageToggle.checked : false;
    const afterimageSlider = document.getElementById('afterimage-damp-slider');
    this.afterimagePass.uniforms['damp'].value = afterimageSlider ? parseFloat(afterimageSlider.value) : 0.9;
    this.composer.addPass(this.afterimagePass);

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
  }

  render(now) {
    if (this.composer) {
      this.composer.render();
    }
  }
}
