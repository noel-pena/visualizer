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
    const routing = this.app.audioRouting;

    if (!postProcessor || !rendererManager) return;

    const audioSpeedMult = 1 + (routing ? routing.value('rotationBoost', audioData) : 0) * 5;

    // 1. Auto Rotation — modulate the slider's base speed instead of overriding it
    if (this.isAutoRotate) {
      this.rotationSpeed = this.baseRotationSpeed * (Math.sin(now * 0.0005) + 1.1) * 4 * audioSpeedMult;
    }

    // 2. Hue Shader animation
    if (postProcessor.huePass && postProcessor.huePass.enabled) {
      const time = now * 0.0002;
      // Modulate hue by the routed band (default: mids)
      const hueOffset = (routing ? routing.value('hueShift', audioData) : 0) * Math.PI;
      this.hueValue = Math.sin(time) + hueOffset;
      if (postProcessor.huePass.uniforms['hue']) {
        postProcessor.huePass.uniforms['hue'].value = this.hueValue;
      }
    }

    // (FilmPass advances its own time uniform each render; no manual increment needed)

    // 4. Pulse / Audio-Reactive Glitch Effects
    if (this.isPulseEffectsEnabled && postProcessor.filmPass) {
      let shouldTrigger = false;

      if (audioData && routing && routing.band('glitchTrigger') !== 'off') {
        const beat = this.app.audioManager?.beat;
        if (routing.band('glitchTrigger') === 'bass' && beat) {
          // Adaptive: fire on detected kicks. Sensitivity scales how strong a
          // kick (instant/average ratio) must be — 1 catches typical kicks,
          // lower values only the biggest hits, higher values every beat.
          if (beat.isBeat && beat.strength * routing.amount('glitchTrigger') >= 1.3) {
            shouldTrigger = true;
          }
        } else if (routing.value('glitchTrigger', audioData) > 0.85) {
          // Other bands: level threshold, amount acts as sensitivity
          shouldTrigger = true;
        }
      } else if (audioData) {
        // Glitch routing set to off — no audio-driven glitches
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
          postProcessor.rgbShiftPass.uniforms['amount'].value = 0.015 + (routing ? routing.value('glitchTrigger', audioData) : 0) * 0.05;
        }
        if (postProcessor.filmPass.uniforms?.intensity) {
          postProcessor.filmPass.uniforms['intensity'].value = Math.min(1.0, postProcessor.baseFilmIntensity * 5);
        }
        this.lastBeatTime = now;
      }
    }

    // 4b. Bloom Pulse (routed band swells the glow)
    if (postProcessor.bloomPass) {
      if (routing && audioData && routing.band('bloomPulse') !== 'off') {
        postProcessor.bloomPass.strength = postProcessor.baseBloomStrength + routing.value('bloomPulse', audioData) * 1.5;
      } else {
        postProcessor.bloomPass.strength = postProcessor.baseBloomStrength;
      }
    }

    // 4c. Kaleidoscope Spin (routed band rotates the kaleidoscope)
    if (postProcessor.kaleidoPass?.enabled && routing && audioData) {
      postProcessor.kaleidoPass.uniforms['angle'].value += routing.value('kaleidoSpin', audioData) * 0.05;
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
