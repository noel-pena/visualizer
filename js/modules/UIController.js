export class UIController {
  constructor(app) {
    this.app = app;
  }

  init() {
    this.setupSidebar();
    this.setupEventListeners();
  }

  setupSidebar() {
    const header = document.getElementById('sidebar-header');
    const content = document.getElementById('sidebar-content');
    const icon = document.getElementById('sidebar-icon');

    // Desktop collapse
    if (header && content && icon) {
      header.addEventListener('click', () => {
        // Only trigger desktop collapse if we are not on mobile (sidebar is relatively positioned)
        if (window.innerWidth >= 768) {
          const isCollapsed = content.style.display === 'none';
          if (isCollapsed) {
            content.style.display = 'block';
            icon.style.transform = 'rotate(0deg)';
          } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(-90deg)';
          }
        }
      });
    }

    // Mobile menu toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const closeBtn = document.getElementById('mobile-close-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    const openMobileMenu = () => {
      sidebar.classList.remove('-translate-x-full');
      overlay.classList.remove('hidden');
    };

    const closeMobileMenu = () => {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    };

    if (mobileBtn) mobileBtn.addEventListener('click', openMobileMenu);
    if (closeBtn) closeBtn.addEventListener('click', closeMobileMenu);
    if (overlay) overlay.addEventListener('click', closeMobileMenu);
  }

  setupEventListeners() {
    const { rendererManager, meshManager, effectController, postProcessor, recorder, audioManager } = this.app;

    // --- Scene Mode ---
    const sceneModeSelect = document.getElementById('scene-mode-select');
    const geometrySection = document.getElementById('geometry-section');
    if (sceneModeSelect) {
      sceneModeSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        if (meshManager) {
          meshManager.setSceneMode(mode);
        }
        // Hide shape options if not in Shapes mode
        if (geometrySection) {
          geometrySection.style.display = mode === 'Shapes' ? 'block' : 'none';
        }
      });
    }

    // --- Motion ---
    const autoRotateToggle = document.getElementById('auto-rotate-toggle');
    if (autoRotateToggle) {
      autoRotateToggle.addEventListener('change', (e) => {
        if (effectController) {
          effectController.isAutoRotate = e.target.checked;
          // Snap back to the slider's base speed when auto-rotate turns off
          if (!e.target.checked) effectController.rotationSpeed = effectController.baseRotationSpeed;
        }
      });
    }

    const rotationSlider = document.getElementById('rotation-slider');
    if (rotationSlider) {
      rotationSlider.addEventListener('input', (e) => {
        if (effectController) {
          effectController.baseRotationSpeed = parseFloat(e.target.value);
          effectController.rotationSpeed = effectController.baseRotationSpeed;
        }
      });
    }

    const autoCameraToggle = document.getElementById('auto-camera-toggle');
    if (autoCameraToggle) {
      autoCameraToggle.addEventListener('change', (e) => {
        if (effectController) effectController.isAutoCamera = e.target.checked;
      });
    }

    const scaleSlider = document.getElementById('scale-slider');
    if (scaleSlider) {
      scaleSlider.addEventListener('input', (e) => {
        if (meshManager) meshManager.baseScale = parseFloat(e.target.value);
      });
    }

    // --- Geometry ---
    // Show only the detail sliders relevant to the selected shape
    const updateGeometryControls = (shape) => {
      const show = (id, visible) => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? 'block' : 'none';
      };
      show('detail-control', shape === 'Sphere');
      show('box-segments-control', shape === 'Box');
      show('torus-controls', shape === 'Torus' || shape === 'TorusKnot');
      show('cone-segments-control', shape === 'Cone' || shape === 'Cylinder');
    };

    const shapeSelect = document.getElementById('shape-select');
    if (shapeSelect) {
      updateGeometryControls(shapeSelect.value);
      shapeSelect.addEventListener('change', (e) => {
        if (meshManager) {
          meshManager.currentShape = e.target.value;
          meshManager.updateMeshInstances();
        }
        updateGeometryControls(e.target.value);
      });
    }

    // Detail / segment sliders — each sets its MeshManager property and rebuilds
    const wireGeometrySlider = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', (e) => {
        if (meshManager) {
          meshManager[prop] = parseInt(e.target.value);
          meshManager.updateMeshInstances();
        }
      });
    };
    wireGeometrySlider('detail-slider', 'sphereDetail');
    wireGeometrySlider('box-segments-slider', 'boxSegments');
    wireGeometrySlider('torus-radial-slider', 'torusRadialSeg');
    wireGeometrySlider('torus-tubular-slider', 'torusTubularSeg');
    wireGeometrySlider('cone-segments-slider', 'coneRadialSeg');

    const smoothSurfaceToggle = document.getElementById('smooth-surface-toggle');
    if (smoothSurfaceToggle) {
      smoothSurfaceToggle.addEventListener('change', (e) => {
        if (meshManager) {
          meshManager.isSmoothSurface = e.target.checked;
          meshManager.updateMeshInstances();
        }
      });
    }

    const materialSelect = document.getElementById('material-select');
    if (materialSelect) {
      materialSelect.addEventListener('change', (e) => {
        if (meshManager) {
          meshManager.materialMode = e.target.value;
          meshManager.updateMeshInstances();
        }
        if (postProcessor && postProcessor.huePass) {
          postProcessor.huePass.enabled = (e.target.value === 'Hue');
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

    const layoutSelect = document.getElementById('layout-select');
    if (layoutSelect) {
      layoutSelect.addEventListener('change', (e) => {
        if (meshManager) {
          meshManager.layoutMode = e.target.value;
          meshManager.updateMeshInstances();
        }
      });
    }

    // --- Effects ---
    const bloomToggle = document.getElementById('bloom-toggle');
    if (bloomToggle) {
      bloomToggle.addEventListener('change', (e) => {
        if (postProcessor && postProcessor.bloomPass) {
          postProcessor.bloomPass.enabled = e.target.checked;
        }
      });
    }

    const sobelToggle = document.getElementById('sobel-toggle');
    if (sobelToggle) {
      sobelToggle.addEventListener('change', (e) => {
        if (postProcessor && postProcessor.sobelPass) {
          postProcessor.sobelPass.enabled = e.target.checked;
        }
      });
    }

    const halftoneToggle = document.getElementById('halftone-toggle');
    if (halftoneToggle) {
      halftoneToggle.addEventListener('change', (e) => {
        if (postProcessor && postProcessor.halftonePass) {
          postProcessor.halftonePass.enabled = e.target.checked;
        }
      });
    }

    const pulseEffectsToggle = document.getElementById('pulse-effects-toggle');
    if (pulseEffectsToggle) {
      pulseEffectsToggle.addEventListener('change', (e) => {
        if (effectController) {
          effectController.isPulseEffectsEnabled = e.target.checked;
          if (!e.target.checked && postProcessor) {
             if (postProcessor.glitchPass) postProcessor.glitchPass.enabled = false;
             if (postProcessor.rgbShiftPass?.uniforms?.amount) postProcessor.rgbShiftPass.uniforms['amount'].value = 0.0;
          }
        }
      });
    }

    const randomGlitchToggle = document.getElementById('random-glitch-toggle');
    if (randomGlitchToggle) {
      randomGlitchToggle.addEventListener('change', (e) => {
        if (effectController) effectController.isRandomGlitchEnabled = e.target.checked;
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

    const afterimageDampSlider = document.getElementById('afterimage-damp-slider');
    if (afterimageDampSlider) {
      afterimageDampSlider.addEventListener('input', (e) => {
        if (postProcessor?.afterimagePass?.uniforms?.damp) {
          postProcessor.afterimagePass.uniforms['damp'].value = parseFloat(e.target.value);
        }
      });
    }

    const filmNoiseSlider = document.getElementById('film-noise-slider');
    if (filmNoiseSlider) {
      filmNoiseSlider.addEventListener('input', (e) => {
        if (postProcessor && postProcessor.filmPass) {
          postProcessor.baseFilmIntensity = parseFloat(e.target.value);
          postProcessor.filmPass.uniforms['intensity'].value = postProcessor.baseFilmIntensity;
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

    const kaleidoscopeToggle = document.getElementById('kaleidoscope-toggle');
    if (kaleidoscopeToggle) {
      kaleidoscopeToggle.addEventListener('change', (e) => {
        if (postProcessor && postProcessor.kaleidoPass) {
          postProcessor.kaleidoPass.enabled = e.target.checked;
        }
      });
    }

    const asciiToggle = document.getElementById('ascii-toggle');
    if (asciiToggle) {
      asciiToggle.addEventListener('change', (e) => {
        if (postProcessor && postProcessor.asciiPass) {
          postProcessor.asciiPass.enabled = e.target.checked;
        }
      });
    }

    // --- Audio Controls ---
    const audioUpload = document.getElementById('audio-upload');
    const trackNameDisplay = document.getElementById('track-name-display');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const timeDisplay = document.getElementById('time-display');
    const timelineContainer = document.getElementById('timeline-container');
    const timelineProgress = document.getElementById('timeline-progress');

    if (audioUpload && audioManager) {
      audioUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          audioManager.loadFromFile(file);
          trackNameDisplay.textContent = file.name.substring(0, 20) + (file.name.length > 20 ? '...' : '');
          playPauseBtn.disabled = false;
        }
      });
    }

    if (playPauseBtn && audioManager) {
      playPauseBtn.addEventListener('click', () => {
        audioManager.togglePlay();
      });

      // Hook up Audio Manager callbacks to UI
      audioManager.onPlay = () => {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
      };
      
      audioManager.onPause = () => {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
      };

      audioManager.onTimeUpdate = (currentTime, duration) => {
        // Format time M:SS
        const formatTime = (secs) => {
          const m = Math.floor(secs / 60);
          const s = Math.floor(secs % 60).toString().padStart(2, '0');
          return `${m}:${s}`;
        };
        timeDisplay.textContent = formatTime(currentTime);

        // Update progress bar
        if (duration > 0 && timelineProgress) {
          const percent = (currentTime / duration) * 100;
          timelineProgress.style.width = `${percent}%`;
        }
      };

      audioManager.onEnded = () => {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        if (timelineProgress) timelineProgress.style.width = '0%';
        timeDisplay.textContent = '0:00';

        // Auto-stop recording if the song finishes (UI reset happens in onStopCallback)
        if (recorder && recorder.isRecording) {
          recorder.stopRecording();
        }
      };
    }

    if (timelineContainer && audioManager) {
      timelineContainer.addEventListener('click', (e) => {
        if (!audioManager.isLoaded) return;
        const rect = timelineContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / rect.width;
        audioManager.seek(percent * audioManager.duration);
      });
    }


    // --- Export Settings ---
    const aspectRatioSelect = document.getElementById('aspect-ratio-select');
    const qualitySelect = document.getElementById('quality-select');
    
    const updateResolution = () => {
        if (rendererManager && aspectRatioSelect && qualitySelect) {
            rendererManager.setRenderConfig(qualitySelect.value, aspectRatioSelect.value);
        }
    };

    if (aspectRatioSelect) aspectRatioSelect.addEventListener('change', updateResolution);
    if (qualitySelect) qualitySelect.addEventListener('change', updateResolution);

    // Initial resolution setup
    updateResolution();

    const startRecordingButton = document.getElementById('start-recording-button');
    const recordBtnText = document.getElementById('record-btn-text');

    if (startRecordingButton && recorder) {
      // Single source of truth for resetting the record button — runs on every
      // stop path (manual click, song end, unsupported codec).
      recorder.onStopCallback = () => {
        if (recordBtnText) recordBtnText.textContent = "Record";
        startRecordingButton.classList.remove('animate-pulse');
      };

      startRecordingButton.addEventListener('click', () => {
        if (!recorder.isRecording) {
           // Start Audio if not playing
           if (audioManager && audioManager.isLoaded && !audioManager.isPlaying) {
               audioManager.play();
           }

           // Start recording and pass the audio stream
           recorder.startRecording(audioManager ? audioManager.getStream() : null);

           if (recorder.isRecording) {
             if (recordBtnText) recordBtnText.textContent = "Stop";
             startRecordingButton.classList.add('animate-pulse');
           }
        } else {
           recorder.stopRecording();
        }
      });
    }

    // --- Snapshot (PNG still export) ---
    const saveImageButton = document.getElementById('save-image-button');
    if (saveImageButton && recorder) {
      saveImageButton.addEventListener('click', () => recorder.saveImage());
    }
  }
}
