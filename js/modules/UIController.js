import { Exporter, ExportError } from './Exporter.js';

export class UIController {
  constructor(app) {
    this.app = app;
  }

  init() {
    this.setupSidebar();
    this.setupEventListeners();
    this.setupContextualControls();
  }

  // Hide controls that can't affect the current look (e.g. shape color while
  // the Holographic material is on, layout with a single shape), so every
  // control on screen does something when touched.
  setupContextualControls() {
    const value = (id) => document.getElementById(id)?.value;
    const isOn = (id) => !!document.getElementById(id)?.checked;
    const show = (id, visible) => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? '' : 'none';
    };

    const update = () => {
      const isShapes = value('scene-mode-select') === 'Shapes';
      const material = value('material-select');
      const isPalette = value('color-mode-select') === 'palette';

      // Colors: Holographic shapes ignore the palette; terrain/particles only
      // use Primary/Secondary in palette mode
      show('color-mode-row', !isShapes);
      show('primary-color-row', isShapes ? material !== 'Hue' : isPalette);
      show('secondary-color-row', !isShapes && isPalette);
      show('holographic-color-hint', isShapes && material === 'Hue');

      // Geometry
      show('smooth-surface-row', material !== 'Monochrome'); // wireframe has no surface
      show('layout-row', parseInt(value('shape-count-slider')) > 1);

      // Effects
      show('afterimage-damp-row', isOn('afterimage-toggle'));

      // Audio routing targets whose effect is switched off
      show('route-hue-row', !isShapes || material === 'Hue');
      show('route-glitch-row', isOn('pulse-effects-toggle'));
      show('route-bloom-row', isOn('bloom-toggle'));
      show('route-kaleido-row', isOn('kaleidoscope-toggle'));
    };

    // Presets/randomize/auto-pilot dispatch bubbling events, so this catches them too
    const content = document.getElementById('sidebar-content');
    if (content) {
      content.addEventListener('change', update);
      content.addEventListener('input', update);
    }
    update();
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

    // On phones the sidebar is a bottom sheet. While it's open the preview
    // shrinks into the space above it, so changes are visible as they're made.
    const container = document.getElementById('canvas-container');
    const fitPreviewAboveSheet = (isOpen) => {
      if (!container) return;
      container.style.height = isOpen ? `calc(100% - ${sidebar.offsetHeight}px)` : '';
      this.app.rendererManager?.onWindowResize();
    };

    const openMobileMenu = () => {
      sidebar.classList.remove('translate-y-full');
      overlay.classList.remove('hidden');
      fitPreviewAboveSheet(true);
    };

    const closeMobileMenu = () => {
      sidebar.classList.add('translate-y-full');
      overlay.classList.add('hidden');
      fitPreviewAboveSheet(false);
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

    // --- Background image ---
    const backgroundImageInput = document.getElementById('background-image-input');
    const backgroundImageClearBtn = document.getElementById('background-image-clear-btn');
    const colorPalette = this.app.colorPalette;
    if (backgroundImageInput && colorPalette) {
      backgroundImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) colorPalette.setBackgroundImage(file);
        e.target.value = ''; // allow re-picking the same file
      });
      backgroundImageClearBtn?.addEventListener('click', () => colorPalette.clearBackgroundImage());
      colorPalette.onBackgroundImageChange = (hasImage) => {
        backgroundImageClearBtn?.classList.toggle('hidden', !hasImage);
      };
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


    // --- Beat indicator + detected BPM readout ---
    const beatDot = document.getElementById('beat-dot');
    const bpmDisplay = document.getElementById('bpm-display');
    if (audioManager && (beatDot || bpmDisplay)) {
      let dotTimeout = null;
      audioManager.beatCallbacks.push((strength, bpm) => {
        if (bpmDisplay && bpm > 0) bpmDisplay.textContent = `≈${bpm} BPM`;
        if (beatDot) {
          beatDot.classList.remove('bg-purple-500/30');
          beatDot.classList.add('bg-purple-400');
          clearTimeout(dotTimeout);
          dotTimeout = setTimeout(() => {
            beatDot.classList.add('bg-purple-500/30');
            beatDot.classList.remove('bg-purple-400');
          }, 120);
        }
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

    // --- Offline export (frame-by-frame render of the track) ---
    this.setupExport();

    // --- Snapshot (PNG still export) ---
    const saveImageButton = document.getElementById('save-image-button');
    if (saveImageButton && recorder) {
      saveImageButton.addEventListener('click', () => recorder.saveImage());
    }

    // --- Phone export: save via the share sheet (Photos, AirDrop, Instagram…) ---
    const exportToast = document.getElementById('export-toast');
    const exportToastText = document.getElementById('export-toast-text');
    const exportShareBtn = document.getElementById('export-share-btn');
    const exportDismissBtn = document.getElementById('export-dismiss-btn');

    if (exportToast && recorder) {
      let pendingFile = null;

      const hideToast = () => {
        pendingFile = null;
        exportToast.classList.add('hidden');
      };

      recorder.onShareReady = (file) => {
        pendingFile = file;
        const isVideo = file.type.startsWith('video/');
        exportToastText.textContent = isVideo ? 'Your video is ready' : 'Your snapshot is ready';
        exportShareBtn.textContent = isVideo ? 'Save Video' : 'Save Image';
        exportToast.classList.remove('hidden');
      };

      exportShareBtn.addEventListener('click', async () => {
        if (!pendingFile) return;
        const file = pendingFile;
        try {
          await navigator.share({ files: [file] });
          hideToast();
        } catch (e) {
          // AbortError = user closed the sheet; keep the toast so they can retry
          if (e.name !== 'AbortError') {
            console.error('Share failed, falling back to download:', e);
            recorder.downloadDataURL(URL.createObjectURL(file), file.name);
            hideToast();
          }
        }
      });

      exportDismissBtn.addEventListener('click', hideToast);
    }
  }

  setupExport() {
    const { exporter, recorder, audioManager } = this.app;
    const exportButton = document.getElementById('export-button');
    const modal = document.getElementById('export-modal');
    if (!exportButton || !modal || !exporter || !Exporter.isSupported()) return;

    exportButton.classList.remove('hidden');

    const panes = {
      setup: document.getElementById('export-setup'),
      progress: document.getElementById('export-progress'),
      message: document.getElementById('export-message')
    };
    const lengthSelect = document.getElementById('export-length-select');
    const setupHint = document.getElementById('export-setup-hint');
    const progressText = document.getElementById('export-progress-text');
    const progressBar = document.getElementById('export-progress-bar');
    const messageText = document.getElementById('export-message-text');

    const formatTime = (secs) => `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;

    const show = (name) => {
      Object.entries(panes).forEach(([key, pane]) => pane.classList.toggle('hidden', key !== name));
      modal.classList.remove('hidden');
    };
    const close = () => modal.classList.add('hidden');
    const showMessage = (text) => {
      messageText.textContent = text;
      show('message');
    };

    // Clips start at the playhead; the full track always starts from the top
    const getRange = () => {
      if (lengthSelect.value === 'full') return { startTime: 0, duration: null };
      const position = audioManager.audioElement.currentTime || 0;
      return { startTime: position, duration: parseFloat(lengthSelect.value) };
    };
    const updateHint = () => {
      const canvas = this.app.rendererManager.renderer.domElement;
      const { startTime, duration } = getRange();
      const end = Math.min(audioManager.duration, startTime + (duration ?? Infinity));
      setupHint.textContent = `${formatTime(startTime)} – ${formatTime(end)} · ${canvas.width}×${canvas.height}`
        + (duration ? ' · starts at the playhead' : '');
    };
    lengthSelect.addEventListener('change', updateHint);

    exportButton.addEventListener('click', () => {
      if (recorder.isRecording) return;
      if (!audioManager.isLoaded) {
        showMessage('Load a track first — the export renders your visuals to the song.');
        return;
      }
      audioManager.pause();
      updateHint();
      show('setup');
    });

    document.getElementById('export-setup-cancel-btn').addEventListener('click', close);
    document.getElementById('export-message-close-btn').addEventListener('click', close);
    document.getElementById('export-cancel-btn').addEventListener('click', () => exporter.cancel());

    document.getElementById('export-start-btn').addEventListener('click', async () => {
      const onProgress = (fraction) => {
        const percent = Math.round(fraction * 100);
        progressText.textContent = `${percent}%`;
        progressBar.style.width = `${percent}%`;
      };
      onProgress(0);
      show('progress');

      try {
        const result = await exporter.export({ ...getRange(), onProgress });
        close();
        // Phones get the "Save Video" toast, desktops a download
        if (result) recorder.deliverFile(result.blob, result.filename);
      } catch (e) {
        console.error('Export failed:', e);
        showMessage(e instanceof ExportError
          ? e.message
          : 'The export was interrupted. Keep the app open and on screen while it renders, then try again.');
      }
    });
  }
}
