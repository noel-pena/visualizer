const STORAGE_KEY = 'visualizer-presets-v1';

// Every preset-managed control, grouped by how it's read/applied.
// Apply order matters: scene mode first so geometry controls land on the right scene.
const SELECTS = [
  'scene-mode-select', 'shape-select', 'material-select', 'layout-select', 'color-mode-select',
  'route-scale-band', 'route-rotation-band', 'route-hue-band',
  'route-glitch-band', 'route-bloom-band', 'route-kaleido-band',
];
const CHECKBOXES = [
  'auto-rotate-toggle', 'auto-camera-toggle', 'smooth-surface-toggle',
  'bloom-toggle', 'sobel-toggle', 'halftone-toggle', 'pulse-effects-toggle',
  'random-glitch-toggle', 'afterimage-toggle', 'kaleidoscope-toggle',
  'ascii-toggle', 'dot-screen-toggle',
];
const RANGES = [
  'rotation-slider', 'scale-slider', 'detail-slider', 'box-segments-slider',
  'torus-radial-slider', 'torus-tubular-slider', 'cone-segments-slider',
  'shape-count-slider', 'afterimage-damp-slider', 'film-noise-slider',
  'route-scale-amount', 'route-rotation-amount', 'route-hue-amount',
  'route-glitch-amount', 'route-bloom-amount', 'route-kaleido-amount',
  // color inputs behave like ranges: value + 'input' event
  'primary-color-input', 'secondary-color-input', 'background-color-input',
];

const DEFAULTS = {
  'scene-mode-select': 'Shapes', 'shape-select': 'Sphere', 'material-select': 'Hue', 'layout-select': 'Nested',
  'auto-rotate-toggle': true, 'auto-camera-toggle': false, 'smooth-surface-toggle': false,
  'bloom-toggle': true, 'sobel-toggle': false, 'halftone-toggle': false, 'pulse-effects-toggle': true,
  'random-glitch-toggle': false, 'afterimage-toggle': true, 'kaleidoscope-toggle': false,
  'ascii-toggle': false, 'dot-screen-toggle': false,
  'rotation-slider': 0.005, 'scale-slider': 1, 'detail-slider': 3, 'box-segments-slider': 1,
  'torus-radial-slider': 16, 'torus-tubular-slider': 100, 'cone-segments-slider': 32,
  'shape-count-slider': 1, 'afterimage-damp-slider': 0.9, 'film-noise-slider': 0.2,
  'route-scale-band': 'bass', 'route-rotation-band': 'high', 'route-hue-band': 'mid',
  'route-glitch-band': 'bass', 'route-bloom-band': 'off', 'route-kaleido-band': 'off',
  'route-scale-amount': 1, 'route-rotation-amount': 1, 'route-hue-amount': 1,
  'route-glitch-amount': 1, 'route-bloom-amount': 1, 'route-kaleido-amount': 1,
  'color-mode-select': 'spectrum',
  'primary-color-input': '#ffffff', 'secondary-color-input': '#c084fc', 'background-color-input': '#0f172a',
};

const FACTORY_PRESETS = {
  'Classic Holo': { ...DEFAULTS },
  'Pastel Orb': { ...DEFAULTS, 'smooth-surface-toggle': true, 'afterimage-toggle': false, 'film-noise-slider': 0.1, 'detail-slider': 4 },
  'Neon Knot': { ...DEFAULTS, 'shape-select': 'TorusKnot', 'material-select': 'Monochrome', 'rotation-slider': 0.012, 'torus-tubular-slider': 150, 'afterimage-damp-slider': 0.94, 'primary-color-input': '#00ffd0', 'background-color-input': '#03120f' },
  'Gyroscope': { ...DEFAULTS, 'shape-select': 'Torus', 'shape-count-slider': 6, 'rotation-slider': 0.01, 'torus-radial-slider': 8, 'torus-tubular-slider': 60 },
  'Kaleido Dream': { ...DEFAULTS, 'kaleidoscope-toggle': true, 'smooth-surface-toggle': true, 'shape-count-slider': 4, 'auto-camera-toggle': true, 'route-kaleido-band': 'mid' },
  'Synthwave Drive': { ...DEFAULTS, 'scene-mode-select': 'Synthwave', 'film-noise-slider': 0.35, 'rotation-slider': 0.008, 'color-mode-select': 'palette', 'primary-color-input': '#ff2d95', 'secondary-color-input': '#00e5ff', 'background-color-input': '#12032e' },
  'Galaxy Dust': { ...DEFAULTS, 'scene-mode-select': 'Particles', 'afterimage-damp-slider': 0.95, 'rotation-slider': 0.015, 'route-bloom-band': 'bass', 'color-mode-select': 'palette', 'primary-color-input': '#7dd3fc', 'secondary-color-input': '#f0abfc', 'background-color-input': '#020617' },
  'Retro Terminal': { ...DEFAULTS, 'ascii-toggle': true, 'shape-select': 'Box', 'material-select': 'Monochrome', 'random-glitch-toggle': true },
  'Newsprint Ring': { ...DEFAULTS, 'dot-screen-toggle': true, 'material-select': 'Lit', 'smooth-surface-toggle': true, 'shape-select': 'Dodecahedron', 'shape-count-slider': 8, 'layout-select': 'Radial', 'auto-camera-toggle': true },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => min + Math.random() * (max - min);

const hslToHex = (h, s, l) => {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

export class PresetManager {
  constructor(app) {
    this.app = app;
    this.autopilotEnabled = false;
    this.autopilotSync = 'timer'; // 'timer' | 'beats'
    this.autopilotTimer = null;
    this.beatCounter = 0;
  }

  init() {
    this.refreshPresetList();

    const presetSelect = document.getElementById('preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const state = this.getPreset(e.target.value);
        if (state) this.applyState(state);
      });
    }

    document.getElementById('preset-save-btn')?.addEventListener('click', () => this.saveCurrentAsPreset());
    document.getElementById('preset-delete-btn')?.addEventListener('click', () => this.deleteSelectedPreset());
    document.getElementById('randomize-btn')?.addEventListener('click', () => this.applyState(this.randomState()));

    const autopilotToggle = document.getElementById('autopilot-toggle');
    if (autopilotToggle) {
      autopilotToggle.addEventListener('change', (e) => {
        this.autopilotEnabled = e.target.checked;
        this.beatCounter = 0;
        this.restartAutopilotTimer();
      });
    }

    const syncSelect = document.getElementById('autopilot-sync-select');
    const timerControl = document.getElementById('autopilot-timer-control');
    const barsControl = document.getElementById('autopilot-bars-control');
    if (syncSelect) {
      syncSelect.addEventListener('change', (e) => {
        this.autopilotSync = e.target.value;
        this.beatCounter = 0;
        this.restartAutopilotTimer();
        if (timerControl) timerControl.style.display = this.autopilotSync === 'timer' ? 'block' : 'none';
        if (barsControl) barsControl.style.display = this.autopilotSync === 'beats' ? 'block' : 'none';
      });
    }

    const intervalSlider = document.getElementById('autopilot-interval-slider');
    const intervalValue = document.getElementById('autopilot-interval-value');
    if (intervalSlider) {
      intervalSlider.addEventListener('input', (e) => {
        if (intervalValue) intervalValue.textContent = `${e.target.value}s`;
        this.restartAutopilotTimer();
      });
    }

    const barsSlider = document.getElementById('autopilot-bars-slider');
    const barsValue = document.getElementById('autopilot-bars-value');
    if (barsSlider) {
      barsSlider.addEventListener('input', (e) => {
        if (barsValue) barsValue.textContent = `${e.target.value} bar${e.target.value === '1' ? '' : 's'}`;
        this.beatCounter = 0;
      });
    }

    // Beat-synced mode: tick on bar boundaries (4 detected beats = 1 bar)
    this.app.audioManager?.beatCallbacks.push(() => {
      if (!this.autopilotEnabled || this.autopilotSync !== 'beats') return;
      this.beatCounter++;
      const bars = parseInt(document.getElementById('autopilot-bars-slider')?.value || '4');
      if (this.beatCounter >= bars * 4) {
        this.beatCounter = 0;
        this.autopilotTick();
      }
    });
  }

  // --- State capture & apply -------------------------------------------------

  getState() {
    const state = {};
    const read = (id, prop) => {
      const el = document.getElementById(id);
      if (el) state[id] = prop === 'checked' ? el.checked : el.value;
    };
    SELECTS.forEach(id => read(id, 'value'));
    CHECKBOXES.forEach(id => read(id, 'checked'));
    RANGES.forEach(id => read(id, 'value'));
    return state;
  }

  // Applies by driving the real DOM controls and firing their events, so all
  // existing UIController wiring (rebuilds, pass toggles, visibility) just works.
  applyState(state) {
    const apply = (id, isCheckbox, eventName) => {
      if (!(id in state)) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (isCheckbox) {
        const target = !!state[id];
        if (el.checked === target) return;
        el.checked = target;
      } else {
        if (String(el.value) === String(state[id])) return;
        el.value = state[id];
      }
      el.dispatchEvent(new Event(eventName, { bubbles: true }));
    };
    SELECTS.forEach(id => apply(id, false, 'change'));
    CHECKBOXES.forEach(id => apply(id, true, 'change'));
    RANGES.forEach(id => apply(id, false, 'input'));
  }

  // --- Presets ---------------------------------------------------------------

  getUserPresets() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  setUserPresets(presets) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }

  getPreset(name) {
    if (name in FACTORY_PRESETS) return FACTORY_PRESETS[name];
    return this.getUserPresets()[name] || null;
  }

  getAllPresetNames() {
    return [...Object.keys(FACTORY_PRESETS), ...Object.keys(this.getUserPresets())];
  }

  saveCurrentAsPreset() {
    const nameInput = document.getElementById('preset-name-input');
    let name = nameInput?.value.trim();
    if (!name) name = `Preset ${Object.keys(this.getUserPresets()).length + 1}`;
    if (name in FACTORY_PRESETS) name = `${name} (mine)`;

    const presets = this.getUserPresets();
    presets[name] = this.getState();
    this.setUserPresets(presets);

    if (nameInput) nameInput.value = '';
    this.refreshPresetList(name);
  }

  deleteSelectedPreset() {
    const presetSelect = document.getElementById('preset-select');
    const name = presetSelect?.value;
    if (!name || name in FACTORY_PRESETS) return; // factory presets can't be deleted

    const presets = this.getUserPresets();
    delete presets[name];
    this.setUserPresets(presets);
    this.refreshPresetList();
  }

  refreshPresetList(selectName = '') {
    const presetSelect = document.getElementById('preset-select');
    if (!presetSelect) return;

    presetSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Select Preset —';
    presetSelect.appendChild(placeholder);

    const addGroup = (label, names) => {
      if (names.length === 0) return;
      const group = document.createElement('optgroup');
      group.label = label;
      names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        group.appendChild(opt);
      });
      presetSelect.appendChild(group);
    };
    addGroup('Factory', Object.keys(FACTORY_PRESETS));
    addGroup('My Presets', Object.keys(this.getUserPresets()));

    presetSelect.value = selectName;
  }

  // --- Randomizer ------------------------------------------------------------

  // Full random look. Curated rather than uniform: bias toward Shapes scenes,
  // at most a couple of full-screen stylizer passes at once.
  randomState() {
    const state = { ...DEFAULTS };

    state['scene-mode-select'] = pick(['Shapes', 'Shapes', 'Shapes', 'Synthwave', 'Particles']);
    state['shape-select'] = pick(['Sphere', 'Box', 'Torus', 'Cone', 'TorusKnot', 'Dodecahedron', 'Octahedron', 'Tetrahedron', 'Cylinder']);
    state['material-select'] = pick(['Hue', 'Hue', 'Monochrome', 'Lit']);
    state['smooth-surface-toggle'] = Math.random() < 0.35;
    state['layout-select'] = pick(['Nested', 'Radial', 'Linear']);
    state['shape-count-slider'] = pick([1, 1, 1, 2, 3, 5, 8, 12, 20]);

    state['detail-slider'] = pick([1, 2, 3, 4]);
    state['box-segments-slider'] = pick([1, 1, 2, 4, 8]);
    state['torus-radial-slider'] = pick([4, 8, 16, 24]);
    state['torus-tubular-slider'] = pick([16, 40, 100, 160]);
    state['cone-segments-slider'] = pick([4, 8, 16, 32, 48]);

    state['rotation-slider'] = rand(0.002, 0.025).toFixed(3);
    state['scale-slider'] = rand(0.6, 1.6).toFixed(1);
    state['auto-camera-toggle'] = Math.random() < 0.3;

    Object.assign(state, this.randomEffectsState());
    return state;
  }

  // Effects-only random: safe to apply mid-recording — never rebuilds geometry,
  // so there's no visual pop, just an evolving treatment of the same scene.
  randomEffectsState() {
    const state = {};
    state['bloom-toggle'] = Math.random() < 0.8;
    state['afterimage-toggle'] = Math.random() < 0.5;
    state['afterimage-damp-slider'] = rand(0.7, 0.96).toFixed(2);
    state['film-noise-slider'] = rand(0, 0.5).toFixed(2);
    state['pulse-effects-toggle'] = Math.random() < 0.7;
    state['random-glitch-toggle'] = Math.random() < 0.3;

    // Full-screen stylizers muddy each other when stacked — allow 0-2
    const stylizers = ['sobel-toggle', 'halftone-toggle', 'kaleidoscope-toggle', 'ascii-toggle', 'dot-screen-toggle'];
    stylizers.forEach(id => { state[id] = false; });
    const roll = Math.random();
    if (roll > 0.5) state[pick(stylizers)] = true;
    if (roll > 0.9) state[pick(stylizers)] = true;

    // Colors — half the time pick a harmonious random palette
    if (Math.random() < 0.5) {
      const h = Math.random();
      const spread = pick([0.08, 0.33, 0.5]); // analogous, triadic, complementary
      state['color-mode-select'] = 'palette';
      state['primary-color-input'] = hslToHex(h, 0.85, 0.62);
      state['secondary-color-input'] = hslToHex((h + spread) % 1, 0.85, 0.62);
      state['background-color-input'] = hslToHex((h + 0.5) % 1, 0.45, 0.06);
    } else {
      state['color-mode-select'] = 'spectrum';
      state['primary-color-input'] = pick(['#ffffff', '#ffffff', hslToHex(Math.random(), 0.9, 0.7)]);
      state['secondary-color-input'] = DEFAULTS['secondary-color-input'];
      state['background-color-input'] = pick([DEFAULTS['background-color-input'], '#000000', hslToHex(Math.random(), 0.4, 0.05)]);
    }

    // Audio routing — bias toward the classic mapping, occasionally rewire
    state['route-scale-band'] = pick(['bass', 'bass', 'bass', 'mid', 'avg']);
    state['route-rotation-band'] = pick(['high', 'high', 'mid', 'bass']);
    state['route-hue-band'] = pick(['mid', 'mid', 'high', 'bass']);
    state['route-glitch-band'] = pick(['bass', 'bass', 'high', 'off']);
    state['route-bloom-band'] = pick(['off', 'off', 'bass', 'avg']);
    state['route-kaleido-band'] = state['kaleidoscope-toggle'] ? pick(['mid', 'high', 'bass']) : 'off';
    ['route-scale-amount', 'route-rotation-amount', 'route-hue-amount', 'route-glitch-amount', 'route-bloom-amount', 'route-kaleido-amount']
      .forEach(id => { state[id] = rand(0.6, 1.6).toFixed(2); });

    return state;
  }

  // --- Auto-Pilot ------------------------------------------------------------

  // The interval timer only runs in 'timer' sync mode; 'beats' mode ticks
  // from the beat callback registered in init().
  restartAutopilotTimer() {
    if (this.autopilotTimer) {
      clearInterval(this.autopilotTimer);
      this.autopilotTimer = null;
    }
    if (this.autopilotEnabled && this.autopilotSync === 'timer') {
      const intervalSlider = document.getElementById('autopilot-interval-slider');
      const seconds = intervalSlider ? parseInt(intervalSlider.value) : 8;
      this.autopilotTimer = setInterval(() => this.autopilotTick(), seconds * 1000);
    }
  }

  autopilotTick() {
    const mode = document.getElementById('autopilot-mode-select')?.value || 'effects';
    if (mode === 'presets') {
      const names = this.getAllPresetNames();
      const name = pick(names);
      this.applyState(this.getPreset(name));
      const presetSelect = document.getElementById('preset-select');
      if (presetSelect) presetSelect.value = name;
    } else if (mode === 'full') {
      this.applyState(this.randomState());
    } else {
      this.applyState(this.randomEffectsState());
    }
  }
}
