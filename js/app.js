import '../css/tailwind.css';
import { Renderer } from './modules/Renderer.js';
import { PostProcessor } from './modules/PostProcessor.js';
import { MeshManager } from './modules/MeshManager.js';
import { EffectController } from './modules/EffectController.js';
import { Recorder } from './modules/Recorder.js';
import { UIController } from './modules/UIController.js';
import { PresetManager } from './modules/PresetManager.js';
import { AudioRouting } from './modules/AudioRouting.js';
import { ColorPalette } from './modules/ColorPalette.js';
import AudioManager from './modules/AudioManager.js';

class GlitchVisualizer {
  constructor() {
    this.rendererManager = new Renderer(this);
    this.postProcessor = new PostProcessor(this);
    this.meshManager = new MeshManager(this);
    this.effectController = new EffectController(this);
    this.recorder = new Recorder(this);
    this.audioManager = new AudioManager();
    this.audioRouting = new AudioRouting(this);
    this.colorPalette = new ColorPalette(this);
    this.uiController = new UIController(this);
    this.presetManager = new PresetManager(this);
  }

  init() {
    // Initialize components in logical order: renderer first, then others that depend on it
    this.rendererManager.init();
    this.postProcessor.init();
    this.colorPalette.init(); // before meshManager so initial materials get the palette
    this.meshManager.init();
    this.effectController.init();
    this.recorder.init();
    this.audioRouting.init();
    this.uiController.init();
    this.presetManager.init(); // after UIController so applied presets hit live listeners

    // Set initial size
    this.rendererManager.onWindowResize();

    // Start render loop
    this.rendererManager.start();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new GlitchVisualizer();
  app.init();
  window.visualizerApp = app; // console/debug access
});

// Offline support for the home-screen install. Production only, so the dev
// server's hot reload never fights a cached bundle.
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker registration failed:', e));
  });
}
