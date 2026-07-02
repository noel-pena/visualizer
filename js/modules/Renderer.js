import * as THREE from 'three';

export class Renderer {
  constructor(app) {
    this.app = app;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.ambientLight = null;
    this.pointLight = null;

    this.offsetX = 0;
    this.offsetY = 0;
    this.currentWidth = window.innerWidth;
    this.currentHeight = window.innerHeight;
  }

  init() {
    const canvas = document.getElementById('visualizer-canvas');
    if (!canvas) {
      console.error("Canvas element not found!");
      return;
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true // Crucial for CSS background to show through
    });

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0); // Transparent clear color

    this.initLights();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initLights() {
    this.ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(this.ambientLight);

    this.pointLight = new THREE.PointLight(0xffffff, 1, 100);
    this.pointLight.position.set(5, 5, 5);
    this.scene.add(this.pointLight);

    this.camera.position.z = 5;
  }

  start() {
    this.animate();
  }

  setRenderConfig(qualityHeight, aspectRatioStr) {
    this.qualityHeight = parseInt(qualityHeight) || 1080;
    
    // Parse aspect ratio string like "16:9"
    const [ratioW, ratioH] = aspectRatioStr.split(':').map(Number);
    this.targetAspectRatio = ratioW / ratioH;
    
    // Calculate actual render resolution
    if (this.targetAspectRatio >= 1) {
      // Landscape or square
      this.renderHeight = this.qualityHeight;
      this.renderWidth = Math.round(this.renderHeight * this.targetAspectRatio);
    } else {
      // Portrait
      // When we say 1080p portrait, do we mean 1080x1920 or 607x1080?
      // Usually mobile 1080p is 1080x1920. So width is the "quality" in portrait?
      // Let's ensure the long edge is at least the quality height, or explicitly set it.
      // If quality is 1080, let's make the height 1920 and width 1080.
      this.renderWidth = this.qualityHeight;
      this.renderHeight = Math.round(this.renderWidth / this.targetAspectRatio);
    }

    this.onWindowResize(); // Re-calculate CSS sizes
  }

  onWindowResize() {
    const container = document.getElementById('canvas-container') || document.body;
    
    // Available space in the window
    const availableWidth = window.innerWidth;
    const availableHeight = window.innerHeight;

    // Use default if not set
    if (!this.renderWidth || !this.renderHeight) {
      this.renderWidth = availableWidth;
      this.renderHeight = availableHeight;
      this.targetAspectRatio = availableWidth / availableHeight;
    }

    // Calculate CSS sizes to fit within the screen while maintaining aspect ratio
    let cssWidth = availableWidth;
    let cssHeight = availableWidth / this.targetAspectRatio;

    if (cssHeight > availableHeight) {
      cssHeight = availableHeight;
      cssWidth = cssHeight * this.targetAspectRatio;
    }

    this.updateSizes(this.renderWidth, this.renderHeight, cssWidth, cssHeight);
  }

  updateSizes(renderW, renderH, cssW, cssH) {
    this.currentWidth = renderW;
    this.currentHeight = renderH;

    this.camera.aspect = renderW / renderH;
    this.camera.updateProjectionMatrix();

    this.updateCameraOffset();

    // Set the internal render size (number of pixels)
    // We set pixel ratio to 1 because we are manually defining the exact pixel count.
    this.renderer.setPixelRatio(1); 
    this.renderer.setSize(renderW, renderH, false); // false means don't update CSS style

    // Set the CSS display size
    const canvas = this.renderer.domElement;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    
    if (this.app.postProcessor) {
      this.app.postProcessor.setSize(renderW, renderH, renderW, renderH);
    }
  }

  updateCameraOffset() {
    const xPixelOffset = -this.offsetX * (this.currentWidth / 5);
    const yPixelOffset = this.offsetY * (this.currentHeight / 5);

    this.camera.setViewOffset(
      this.currentWidth,
      this.currentHeight,
      xPixelOffset,
      yPixelOffset,
      this.currentWidth,
      this.currentHeight
    );
    this.camera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const now = Date.now();
    let audioData = null;

    if (this.app.audioManager && this.app.audioManager.isPlaying) {
      this.app.audioManager.update();
      audioData = {
        bass: this.app.audioManager.getBassEnergy(),
        mid: this.app.audioManager.getMidEnergy(),
        high: this.app.audioManager.getHighEnergy(),
        avg: this.app.audioManager.getAverageEnergy()
      };
    }

    // 1. Update effects (BPM pulse, auto camera, auto rotation)
    if (this.app.effectController) {
      this.app.effectController.update(now, audioData);
    }

    // 2. Update mesh rotations
    if (this.app.meshManager) {
      this.app.meshManager.update(this.app.effectController?.rotationSpeed || 0.005, audioData);
    }

    // 3. Render post-processing passes
    if (this.app.postProcessor) {
      this.app.postProcessor.render(now);
    }

    // 4. Update Composite Canvas if Recording
    if (this.app.recorder && this.app.recorder.isRecording) {
      this.app.recorder.renderCompositeFrame();
    }
  }
}
