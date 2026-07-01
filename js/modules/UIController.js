export class UIController {
  constructor(app) {
    this.app = app;
  }

  init() {
    this.setupEventListeners();
    const initialShape = document.getElementById('shape-select')?.value || 'Sphere';
    this.updateShapeControls(initialShape);
  }

  updateShapeControls(shape) {
    const sphereControls = document.getElementById('sphere-controls');
    const boxControls = document.getElementById('box-controls');
    const torusControls = document.getElementById('torus-controls');
    const coneControls = document.getElementById('cone-controls');

    sphereControls?.classList.add('hidden');
    boxControls?.classList.add('hidden');
    torusControls?.classList.add('hidden');
    coneControls?.classList.add('hidden');

    switch (shape) {
      case 'Box':
        boxControls?.classList.remove('hidden');
        break;
      case 'Torus':
        torusControls?.classList.remove('hidden');
        break;
      case 'Cone':
        coneControls?.classList.remove('hidden');
        break;
      case 'Sphere':
      default:
        sphereControls?.classList.remove('hidden');
        break;
    }
  }

  setupEventListeners() {
    const rendererManager = this.app.rendererManager;
    const meshManager = this.app.meshManager;
    const effectController = this.app.effectController;
    const postProcessor = this.app.postProcessor;
    const recorder = this.app.recorder;

    // --- Auto Rotate & Rotation Speed ---
    const autoRotateToggle = document.getElementById('auto-rotate-toggle');
    const rotationSliderContainer = document.getElementById('rotation-slider-container');
    const rotationSlider = document.getElementById('rotation-slider');

    if (autoRotateToggle && rotationSliderContainer) {
      rotationSliderContainer.style.display = autoRotateToggle.checked ? 'none' : 'block';
      autoRotateToggle.addEventListener('change', (e) => {
        if (effectController) {
          effectController.isAutoRotate = e.target.checked;
        }
        rotationSliderContainer.style.display = e.target.checked ? 'none' : 'block';
      });
    }

    if (rotationSlider) {
      rotationSlider.addEventListener('input', (e) => {
        if (effectController) {
          effectController.rotationSpeed = parseFloat(e.target.value);
        }
      });
    }

    // --- Transform UI (Position & Scale) ---
    const posXSlider = document.getElementById('pos-x-slider');
    const posYSlider = document.getElementById('pos-y-slider');
    const scaleSlider = document.getElementById('scale-slider');
    const posXVal = document.getElementById('pos-x-val');
    const posYVal = document.getElementById('pos-y-val');
    const scaleVal = document.getElementById('scale-val');
    const resetTransformBtn = document.getElementById('reset-transform-btn');

    if (posXSlider) {
      posXSlider.addEventListener('input', (e) => {
        if (rendererManager) {
          rendererManager.offsetX = parseFloat(e.target.value);
          if (posXVal) posXVal.textContent = rendererManager.offsetX;
          rendererManager.updateCameraOffset();
        }
      });
    }

    if (posYSlider) {
      posYSlider.addEventListener('input', (e) => {
        if (rendererManager) {
          rendererManager.offsetY = parseFloat(e.target.value);
          if (posYVal) posYVal.textContent = rendererManager.offsetY;
          rendererManager.updateCameraOffset();
        }
      });
    }

    if (scaleSlider) {
      scaleSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (scaleVal) scaleVal.textContent = val;
        if (meshManager) {
          meshManager.setScale(val);
        }
      });
    }

    if (resetTransformBtn) {
      resetTransformBtn.addEventListener('click', () => {
        if (posXSlider) posXSlider.value = 0;
        if (posYSlider) posYSlider.value = 0;
        if (scaleSlider) scaleSlider.value = 1;
        if (posXVal) posXVal.textContent = 0;
        if (posYVal) posYVal.textContent = 0;
        if (scaleVal) scaleVal.textContent = 1;

        if (rendererManager) {
          rendererManager.offsetX = 0;
          rendererManager.offsetY = 0;
          if (rendererManager.camera) {
            rendererManager.camera.clearViewOffset();
            rendererManager.camera.updateProjectionMatrix();
          }
        }
        if (meshManager) {
          meshManager.setScale(1);
        }
      });
    }

    // --- Camera Controls ---
    const autoCameraToggle = document.getElementById('auto-camera-toggle');
    if (autoCameraToggle) {
      autoCameraToggle.addEventListener('change', (e) => {
        if (effectController) {
          effectController.isAutoCamera = e.target.checked;
        }
      });
    }

    // --- Shape Setup & Parameters ---
    const shapeSelect = document.getElementById('shape-select');
    if (shapeSelect) {
      shapeSelect.addEventListener('change', (e) => {
        const shape = e.target.value;
        this.updateShapeControls(shape);
        if (meshManager) {
          meshManager.currentShape = shape;
          meshManager.updateMeshInstances();
        }
      });
    }

    const shapeCountSlider = document.getElementById('shape-count-slider');
    const shapeCountValue = document.getElementById('shape-count-value');
    if (shapeCountSlider) {
      shapeCountSlider.addEventListener('input', (e) => {
        const count = parseInt(e.target.value);
        if (shapeCountValue) shapeCountValue.textContent = count;
        if (meshManager) {
          meshManager.shapeCount = count;
          meshManager.updateMeshInstances();
        }
      });
    }

    const detailSlider = document.getElementById('detail-slider');
    const detailValue = document.getElementById('detail-value');
    if (detailSlider) {
      detailSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (detailValue) detailValue.textContent = val;
        if (meshManager) {
          meshManager.sphereDetail = val;
          meshManager.updateMeshInstances();
        }
      });
    }

    const boxSegmentsSlider = document.getElementById('box-segments-slider');
    const boxSegmentsValue = document.getElementById('box-segments-value');
    if (boxSegmentsSlider) {
      boxSegmentsSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (boxSegmentsValue) boxSegmentsValue.textContent = val;
        if (meshManager) {
          meshManager.boxSegments = val;
          meshManager.updateMeshInstances();
        }
      });
    }

    const torusRadialSlider = document.getElementById('torus-radial-slider');
    const torusRadialValue = document.getElementById('torus-radial-value');
    if (torusRadialSlider) {
      torusRadialSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (torusRadialValue) torusRadialValue.textContent = val;
        if (meshManager) {
          meshManager.torusRadialSeg = val;
          meshManager.updateMeshInstances();
        }
      });
    }

    const torusTubularSlider = document.getElementById('torus-tubular-slider');
    const torusTubularValue = document.getElementById('torus-tubular-value');
    if (torusTubularSlider) {
      torusTubularSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (torusTubularValue) torusTubularValue.textContent = val;
        if (meshManager) {
          meshManager.torusTubularSeg = val;
          meshManager.updateMeshInstances();
        }
      });
    }

    const coneSegmentsSlider = document.getElementById('cone-segments-slider');
    const coneSegmentsValue = document.getElementById('cone-segments-value');
    if (coneSegmentsSlider) {
      coneSegmentsSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (coneSegmentsValue) coneSegmentsValue.textContent = val;
        if (meshManager) {
          meshManager.coneRadialSeg = val;
          meshManager.updateMeshInstances();
        }
      });
    }

    // --- Material & Shading ---
    const materialSelect = document.getElementById('material-select');
    if (materialSelect) {
      materialSelect.addEventListener('change', (e) => {
        const mat = e.target.value;
        if (postProcessor && postProcessor.huePass) {
          postProcessor.huePass.enabled = (mat === 'Hue');
        }
        if (meshManager) {
          meshManager.materialMode = mat;
          meshManager.updateMeshInstances();
        }
      });
    }

    const smoothSurfaceToggle = document.getElementById('smooth-surface-toggle');
    if (smoothSurfaceToggle) {
      smoothSurfaceToggle.addEventListener('change', (e) => {
        if (meshManager) {
          meshManager.isSmoothSurface = e.target.checked;
          meshManager.updateMeshInstances();
        }
      });
    }

    // --- BPM & Effects ---
    const bpmSlider = document.getElementById('bpm-slider');
    const bpmValue = document.getElementById('bpm-value');
    if (bpmSlider) {
      bpmSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (bpmValue) bpmValue.textContent = val;
        if (effectController) {
          effectController.bpm = val;
        }
      });
    }

    const pulseEffectsToggle = document.getElementById('pulse-effects-toggle');
    if (pulseEffectsToggle) {
      pulseEffectsToggle.addEventListener('change', (e) => {
        if (effectController) {
          effectController.isPulseEffectsEnabled = e.target.checked;
          if (!effectController.isPulseEffectsEnabled && postProcessor) {
            if (postProcessor.glitchPass) postProcessor.glitchPass.enabled = false;
            if (postProcessor.rgbShiftPass?.uniforms?.amount) {
              postProcessor.rgbShiftPass.uniforms['amount'].value = 0.0;
            }
            if (postProcessor.filmPass?.uniforms?.nIntensity && postProcessor.filmPass?.uniforms?.sIntensity) {
              postProcessor.filmPass.uniforms['nIntensity'].value = postProcessor.baseFilmNoise;
              postProcessor.filmPass.uniforms['sIntensity'].value = postProcessor.baseFilmScanlines;
            }
          }
        }
      });
    }

    const randomGlitchToggle = document.getElementById('random-glitch-toggle');
    if (randomGlitchToggle) {
      randomGlitchToggle.addEventListener('change', (e) => {
        if (effectController) {
          effectController.isRandomGlitchEnabled = e.target.checked;
        }
      });
    }

    const filmNoiseSlider = document.getElementById('film-noise-slider');
    if (filmNoiseSlider) {
      filmNoiseSlider.addEventListener('input', (e) => {
        if (postProcessor) {
          postProcessor.baseFilmNoise = parseFloat(e.target.value);
          if ((!effectController || !effectController.isPulseEffectsEnabled || !postProcessor.glitchPass.enabled) && postProcessor.filmPass?.uniforms?.nIntensity) {
            postProcessor.filmPass.uniforms['nIntensity'].value = postProcessor.baseFilmNoise;
          }
        }
      });
    }

    const filmScanlineSlider = document.getElementById('film-scanline-slider');
    if (filmScanlineSlider) {
      filmScanlineSlider.addEventListener('input', (e) => {
        if (postProcessor) {
          postProcessor.baseFilmScanlines = parseFloat(e.target.value);
          if ((!effectController || !effectController.isPulseEffectsEnabled || !postProcessor.glitchPass.enabled) && postProcessor.filmPass?.uniforms?.sIntensity) {
            postProcessor.filmPass.uniforms['sIntensity'].value = postProcessor.baseFilmScanlines;
          }
        }
      });
    }

    const afterimageToggle = document.getElementById('afterimage-toggle');
    if (afterimageToggle) {
      afterimageToggle.addEventListener('change', (e) => {
        if (postProcessor && postProcessor.afterimagePass) {
          postProcessor.afterimagePass.enabled = e.target.checked;
        }
      });
    }

    const afterimageSlider = document.getElementById('afterimage-damp-slider');
    if (afterimageSlider) {
      afterimageSlider.addEventListener('input', (e) => {
        if (postProcessor && postProcessor.afterimagePass?.uniforms?.damp) {
          postProcessor.afterimagePass.uniforms['damp'].value = parseFloat(e.target.value);
        }
      });
    }

    const dotScreenToggle = document.getElementById('dot-screen-toggle');
    if (dotScreenToggle) {
      dotScreenToggle.addEventListener('change', (e) => {
        if (postProcessor && postProcessor.dotScreenPass) {
          postProcessor.dotScreenPass.enabled = e.target.checked;
        }
      });
    }

    const dotScreenSlider = document.getElementById('dot-screen-scale-slider');
    if (dotScreenSlider) {
      dotScreenSlider.addEventListener('input', (e) => {
        if (postProcessor && postProcessor.dotScreenPass?.uniforms?.scale) {
          postProcessor.dotScreenPass.uniforms['scale'].value = parseFloat(e.target.value);
        }
      });
    }

    // --- Spotify Canvas Tools (9:16 portrait + BG image) ---
    const forcePortraitToggle = document.getElementById('force-portrait-toggle');
    if (forcePortraitToggle) {
      forcePortraitToggle.addEventListener('change', (e) => {
        const canvas = rendererManager?.renderer?.domElement;
        if (canvas) {
          if (e.target.checked) {
            canvas.classList.add('portrait-mode');
          } else {
            canvas.classList.remove('portrait-mode');
          }
        }
        if (rendererManager) {
          rendererManager.onWindowResize();
        }
      });
    }

    const bgImageUpload = document.getElementById('bg-image-upload');
    const canvasContainer = document.getElementById('canvas-container');
    const clearBgButton = document.getElementById('clear-bg-button');
    const transparentBgToggle = document.getElementById('transparent-bg-toggle');

    if (bgImageUpload && canvasContainer) {
      bgImageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target.result;

          // Apply background style to container
          canvasContainer.style.backgroundImage = `url(${dataUrl})`;
          if (clearBgButton) clearBgButton.classList.remove('hidden');

          // Set the image in Recorder for video/snapshot composites
          if (recorder) {
            recorder.uploadedImageElement = new Image();
            recorder.uploadedImageElement.src = dataUrl;
            recorder.isTransparentBackground = false;
          }

          if (rendererManager && rendererManager.scene) {
            rendererManager.scene.background = null;
          }

          if (transparentBgToggle) {
            transparentBgToggle.checked = false;
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (clearBgButton) {
      clearBgButton.addEventListener('click', () => {
        if (canvasContainer) canvasContainer.style.backgroundImage = '';
        if (recorder) {
          recorder.uploadedImageElement = null;
        }
        if (bgImageUpload) bgImageUpload.value = '';
        clearBgButton.classList.add('hidden');
      });
    }

    // --- Recording & Saving Snapshots ---
    const startRecordingButton = document.getElementById('start-recording-button');
    if (startRecordingButton) {
      startRecordingButton.addEventListener('click', () => {
        if (recorder && !recorder.isRecording) {
          recorder.startRecording();
        }
      });
    }

    const saveImageButton = document.getElementById('save-image-button');
    if (saveImageButton) {
      saveImageButton.addEventListener('click', () => {
        if (recorder) {
          recorder.saveImage();
        }
      });
    }

    const imageOrientationToggle = document.getElementById('image-orientation-toggle');
    if (imageOrientationToggle) {
      imageOrientationToggle.addEventListener('change', (e) => {
        if (recorder) {
          recorder.isPortraitMode = e.target.checked;
        }
      });
    }

    if (transparentBgToggle) {
      transparentBgToggle.addEventListener('change', (e) => {
        if (recorder) {
          recorder.isTransparentBackground = e.target.checked;
        }
      });
    }

    // --- Expand / Collapse UI Controls Content ---
    const toggleButton = document.getElementById('toggle-controls');
    const controlsContent = document.getElementById('controls-content');
    const arrowIcon = document.getElementById('arrow-icon');

    if (toggleButton && controlsContent && arrowIcon) {
      toggleButton.addEventListener('click', () => {
        controlsContent.classList.toggle('max-h-0');
        controlsContent.classList.toggle('opacity-0');
        controlsContent.classList.toggle('flex-1');
        controlsContent.classList.toggle('opacity-100');
        arrowIcon.classList.toggle('rotate-180');
      });
    }
  }
}
