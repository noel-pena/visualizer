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

  onWindowResize() {
    const container = document.getElementById('canvas-container');
    let width, height;

    const forcePortrait = document.getElementById('force-portrait-toggle')?.checked || false;

    if (forcePortrait) {
      // Calculate 9:16 dimensions based on available height
      const availableHeight = container.clientHeight * 0.95; // 95% of screen
      height = availableHeight;
      width = height * (9 / 16);
    } else {
      // Full screen
      width = window.innerWidth;
      height = window.innerHeight;
    }

    this.updateSizes(width, height);
  }

  updateSizes(width, height) {
    this.currentWidth = width;
    this.currentHeight = height;

    const pixelRatio = this.renderer.getPixelRatio();
    const canvasWidth = Math.floor(width * pixelRatio);
    const canvasHeight = Math.floor(height * pixelRatio);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // IMPORTANT: Re-apply offset after resize/aspect change
    this.updateCameraOffset();

    this.renderer.setSize(width, height);
    
    if (this.app.postProcessor) {
      this.app.postProcessor.setSize(width, height, canvasWidth, canvasHeight);
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

    // 1. Update effects (BPM pulse, auto camera, auto rotation)
    if (this.app.effectController) {
      this.app.effectController.update(now);
    }

    // 2. Update mesh rotations
    if (this.app.meshManager) {
      this.app.meshManager.update(this.app.effectController?.rotationSpeed || 0.005);
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
