export class EffectController {
  constructor(app) {
    this.app = app;

    // BPM & Glitch State
    this.bpm = 120;
    this.lastBeatTime = 0;
    this.glitchDuration = 100;
    this.isPulseEffectsEnabled = true;

    // Rotation & Camera State
    this.isAutoRotate = true;
    this.rotationSpeed = 0.005;
    this.isAutoCamera = false;
    this.isRandomGlitchEnabled = false;

    // Local hue state
    this.hueValue = 0;
  }

  init() {
    this.isAutoRotate = document.getElementById('auto-rotate-toggle')?.checked ?? true;
    const rotationSlider = document.getElementById('rotation-slider');
    this.rotationSpeed = rotationSlider ? parseFloat(rotationSlider.value) : 0.005;
    this.isAutoCamera = document.getElementById('auto-camera-toggle')?.checked ?? false;
    this.bpm = parseFloat(document.getElementById('bpm-slider')?.value || '120');
    this.isPulseEffectsEnabled = document.getElementById('pulse-effects-toggle')?.checked ?? true;
    this.isRandomGlitchEnabled = document.getElementById('random-glitch-toggle')?.checked ?? false;
  }

  update(now) {
    const postProcessor = this.app.postProcessor;
    const rendererManager = this.app.rendererManager;
    const meshManager = this.app.meshManager;

    if (!postProcessor || !rendererManager) return;

    // 1. Auto Rotation
    if (this.isAutoRotate) {
      this.rotationSpeed = (Math.sin(now * 0.0005) + 1.1) * 0.02;
    }

    // 2. Hue Shader animation
    if (postProcessor.huePass && postProcessor.huePass.enabled) {
      const time = now * 0.0002;
      this.hueValue = Math.sin(time);
      if (postProcessor.huePass.uniforms['hue']) {
        postProcessor.huePass.uniforms['hue'].value = this.hueValue;
      }
    }

    // 3. Film Shader time increment
    if (postProcessor.filmPass && postProcessor.filmPass.uniforms && postProcessor.filmPass.uniforms.time) {
      postProcessor.filmPass.uniforms['time'].value += 0.05;
    }

    // 4. BPM Pulse Effects
    if (this.isPulseEffectsEnabled && postProcessor.filmPass) {
      const beatInterval = (60 / this.bpm) * 1000;

      // Check if pulse should end
      if (postProcessor.glitchPass.enabled && (now - this.lastBeatTime > this.glitchDuration)) {
        postProcessor.glitchPass.enabled = false;
        if (postProcessor.rgbShiftPass?.uniforms?.amount) {
          postProcessor.rgbShiftPass.uniforms['amount'].value = 0.0;
        }
        if (postProcessor.filmPass.uniforms?.nIntensity && postProcessor.filmPass.uniforms?.sIntensity) {
          postProcessor.filmPass.uniforms['nIntensity'].value = postProcessor.baseFilmNoise;
          postProcessor.filmPass.uniforms['sIntensity'].value = postProcessor.baseFilmScanlines;
        }
      }

      // Check if pulse should start
      if (!postProcessor.glitchPass.enabled && (now - this.lastBeatTime >= beatInterval)) {
        postProcessor.glitchPass.enabled = true;
        if (postProcessor.rgbShiftPass?.uniforms?.amount) {
          postProcessor.rgbShiftPass.uniforms['amount'].value = 0.015;
        }
        if (postProcessor.filmPass.uniforms?.nIntensity && postProcessor.filmPass.uniforms?.sIntensity) {
          postProcessor.filmPass.uniforms['nIntensity'].value = postProcessor.baseFilmNoise * 5;
          postProcessor.filmPass.uniforms['sIntensity'].value = postProcessor.baseFilmScanlines * 5;
        }
        this.lastBeatTime = now;
      }
    }

    // 5. Random Glitches
    if (this.isRandomGlitchEnabled && !postProcessor.glitchPass.enabled && Math.random() < 0.015) {
      postProcessor.glitchPass.enabled = true;
      if (postProcessor.rgbShiftPass?.uniforms?.amount) {
        postProcessor.rgbShiftPass.uniforms['amount'].value = 0.005 + Math.random() * 0.02;
      }

      const randomDuration = 50 + Math.random() * 150;
      setTimeout(() => {
        const currentTime = Date.now();
        if (currentTime - this.lastBeatTime > this.glitchDuration) {
          postProcessor.glitchPass.enabled = false;
          if (postProcessor.rgbShiftPass?.uniforms?.amount) {
            postProcessor.rgbShiftPass.uniforms['amount'].value = 0.0;
          }
        }
      }, randomDuration);
    }

    // 6. Auto Camera path
    const camera = rendererManager.camera;
    const shapeCount = meshManager ? meshManager.shapeCount : 1;
    if (camera) {
      if (this.isAutoCamera) {
        const time = now * 0.0001;
        camera.position.x = Math.sin(time) * 5;
        camera.position.z = Math.cos(time) * 5;
        if (shapeCount > 1) {
          camera.position.y = Math.cos(time * 0.7) * 2;
        } else {
          camera.position.y = 0;
        }
        camera.lookAt(0, 0, 0);
      } else {
        if (camera.position.y !== 0 || camera.position.x !== 0 || camera.position.z !== 5) {
          camera.position.set(0, 0, 5);
          camera.lookAt(0, 0, 0);
        }
      }
    }
  }
}
