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
    this.baseRotationSpeed = 0.005; // Set by the rotation slider
    this.rotationSpeed = 0.005;
    this.isAutoCamera = false;
    this.isRandomGlitchEnabled = false;

    // Local hue state
    this.hueValue = 0;
  }

  init() {
    this.isAutoRotate = document.getElementById('auto-rotate-toggle')?.checked ?? true;
    const rotationSlider = document.getElementById('rotation-slider');
    this.baseRotationSpeed = rotationSlider ? parseFloat(rotationSlider.value) : 0.005;
    this.rotationSpeed = this.baseRotationSpeed;
    this.isAutoCamera = document.getElementById('auto-camera-toggle')?.checked ?? false;
    this.bpm = parseFloat(document.getElementById('bpm-slider')?.value || '120');
    this.isPulseEffectsEnabled = document.getElementById('pulse-effects-toggle')?.checked ?? true;
    this.isRandomGlitchEnabled = document.getElementById('random-glitch-toggle')?.checked ?? false;
  }

  update(now, audioData) {
    const postProcessor = this.app.postProcessor;
    const rendererManager = this.app.rendererManager;
    const meshManager = this.app.meshManager;

    if (!postProcessor || !rendererManager) return;

    let audioSpeedMult = 1;
    if (audioData) {
       audioSpeedMult = 1 + audioData.high * 5;
    }

    // 1. Auto Rotation — modulate the slider's base speed instead of overriding it
    if (this.isAutoRotate) {
      this.rotationSpeed = this.baseRotationSpeed * (Math.sin(now * 0.0005) + 1.1) * 4 * audioSpeedMult;
    }

    // 2. Hue Shader animation
    if (postProcessor.huePass && postProcessor.huePass.enabled) {
      const time = now * 0.0002;
      // Modulate hue based on audio mid frequencies if available
      let hueOffset = audioData ? audioData.mid * Math.PI : 0;
      this.hueValue = Math.sin(time) + hueOffset;
      if (postProcessor.huePass.uniforms['hue']) {
        postProcessor.huePass.uniforms['hue'].value = this.hueValue;
      }
    }

    // (FilmPass advances its own time uniform each render; no manual increment needed)

    // 4. Pulse / Audio-Reactive Glitch Effects
    if (this.isPulseEffectsEnabled && postProcessor.filmPass) {
      let shouldTrigger = false;
      
      if (audioData) {
        // Trigger glitch on strong bass kicks
        if (audioData.bass > 0.85) {
            shouldTrigger = true;
        }
      } else {
        // Fallback to static BPM if no audio data
        const beatInterval = (60 / this.bpm) * 1000;
        if (now - this.lastBeatTime >= beatInterval) {
            shouldTrigger = true;
            this.lastBeatTime = now;
        }
      }

      // Turn off glitch
      if (postProcessor.glitchPass.enabled && (now - this.lastBeatTime > this.glitchDuration)) {
        postProcessor.glitchPass.enabled = false;
        if (postProcessor.rgbShiftPass?.uniforms?.amount) {
          postProcessor.rgbShiftPass.uniforms['amount'].value = 0.0;
        }
        if (postProcessor.filmPass.uniforms?.intensity) {
          postProcessor.filmPass.uniforms['intensity'].value = postProcessor.baseFilmIntensity;
        }
      }

      // Turn on glitch
      if (shouldTrigger && !postProcessor.glitchPass.enabled && (now - this.lastBeatTime > 200)) { // 200ms debounce
        postProcessor.glitchPass.enabled = true;
        if (postProcessor.rgbShiftPass?.uniforms?.amount) {
          postProcessor.rgbShiftPass.uniforms['amount'].value = 0.015 + (audioData ? audioData.bass * 0.05 : 0);
        }
        if (postProcessor.filmPass.uniforms?.intensity) {
          postProcessor.filmPass.uniforms['intensity'].value = Math.min(1.0, postProcessor.baseFilmIntensity * 5);
        }
        this.lastBeatTime = now;
      }
    }

    // 5. Random Glitches (Independent of audio)
    if (this.isRandomGlitchEnabled && !postProcessor.glitchPass.enabled && Math.random() < 0.015) {
      postProcessor.glitchPass.enabled = true;
      if (postProcessor.rgbShiftPass?.uniforms?.amount) {
        postProcessor.rgbShiftPass.uniforms['amount'].value = 0.005 + Math.random() * 0.02;
      }

      const randomDuration = 50 + Math.random() * 150;
      setTimeout(() => {
        const currentTime = Date.now();
        // Only turn off if a pulse hasn't overridden it
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
