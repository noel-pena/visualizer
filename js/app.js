import { Renderer } from './modules/Renderer.js';
import { PostProcessor } from './modules/PostProcessor.js';
import { MeshManager } from './modules/MeshManager.js';
import { EffectController } from './modules/EffectController.js';
import { Recorder } from './modules/Recorder.js';
import { UIController } from './modules/UIController.js';
import { PresetManager } from './modules/PresetManager.js';
import AudioManager from './modules/AudioManager.js';

class GlitchVisualizer {
  constructor() {
    this.rendererManager = new Renderer(this);
    this.postProcessor = new PostProcessor(this);
    this.meshManager = new MeshManager(this);
    this.effectController = new EffectController(this);
    this.recorder = new Recorder(this);
    this.audioManager = new AudioManager();
    this.uiController = new UIController(this);
    this.presetManager = new PresetManager(this);
  }

  init() {
    // Initialize components in logical order: renderer first, then others that depend on it
    this.rendererManager.init();
    this.postProcessor.init();
    this.meshManager.init();
    this.effectController.init();
    this.recorder.init();
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
