// Frequency-band routing: each visual target reads one audio band (or none)
// scaled by an amount slider. Consumers call value(name, audioData) per frame.
const TARGETS = {
  scalePulse:    { bandId: 'route-scale-band',    amountId: 'route-scale-amount',    defaultBand: 'bass', defaultAmount: 1 },
  rotationBoost: { bandId: 'route-rotation-band', amountId: 'route-rotation-amount', defaultBand: 'high', defaultAmount: 1 },
  hueShift:      { bandId: 'route-hue-band',      amountId: 'route-hue-amount',      defaultBand: 'mid',  defaultAmount: 1 },
  glitchTrigger: { bandId: 'route-glitch-band',   amountId: 'route-glitch-amount',   defaultBand: 'bass', defaultAmount: 1 },
  bloomPulse:    { bandId: 'route-bloom-band',    amountId: 'route-bloom-amount',    defaultBand: 'off',  defaultAmount: 1 },
  kaleidoSpin:   { bandId: 'route-kaleido-band',  amountId: 'route-kaleido-amount',  defaultBand: 'off',  defaultAmount: 1 },
};

export class AudioRouting {
  constructor(app) {
    this.app = app;
    this.routes = {};
  }

  init() {
    Object.entries(TARGETS).forEach(([name, cfg]) => {
      const bandEl = document.getElementById(cfg.bandId);
      const amountEl = document.getElementById(cfg.amountId);

      this.routes[name] = {
        band: bandEl?.value ?? cfg.defaultBand,
        amount: amountEl ? parseFloat(amountEl.value) : cfg.defaultAmount,
      };

      bandEl?.addEventListener('change', (e) => { this.routes[name].band = e.target.value; });
      amountEl?.addEventListener('input', (e) => { this.routes[name].amount = parseFloat(e.target.value); });
    });
  }

  // Band energy (0-1) x amount for this target; 0 when routed off or no audio.
  value(name, audioData) {
    const route = this.routes[name];
    if (!route || !audioData || route.band === 'off') return 0;
    return (audioData[route.band] ?? 0) * route.amount;
  }

  band(name) {
    return this.routes[name]?.band ?? 'off';
  }
}
