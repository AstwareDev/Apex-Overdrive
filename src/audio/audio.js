/**
 * AudioManager — Web Audio API audio.
 *
 * Engine is fully synthesized (two detuned sawtooth oscillators + lowpass filter):
 *   • idle    — low freq (~72 Hz), strong LFO wobble, muffled filter
 *   • accel   — freq rises with gear RPM, filter opens wide for snarl
 *   • cruise  — freq stable at current RPM, filter moderately open
 *
 * Skid and music are loaded from /public/audio.
 * Keys: M = mute, N = music toggle.
 */
const FILES = {
  skid:  '/audio/skid.mp3',
  music: '/audio/music.ogg',
};

export class AudioManager {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.buffers = {};
    this.nodes = {};
    this.muted = false;
    this.musicEnabled = true;

    this._startOnGesture();
    this._bindToggles();
    game.on('tick', (s) => this._onTick(s));
  }

  _startOnGesture() {
    const start = async () => {
      if (!this.ctx) await this._setup();
      else if (this.ctx.state === 'suspended') this.ctx.resume();
      window.removeEventListener('keydown', start);
      window.removeEventListener('pointerdown', start);
    };
    window.addEventListener('keydown', start);
    window.addEventListener('pointerdown', start);
  }

  _bindToggles() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyM') this.toggleMute();
      if (e.code === 'KeyN') this.toggleMusic();
    });
  }

  async _setup() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    this._noiseBuffer = this._makeNoiseBuffer();   // for synthesized boost whoosh
    this._lastGear = 'N';

    await this._loadAll();

    this._startSynthEngine();
    this._startSkid();
    this._startMusic();
  }

  async _loadAll() {
    await Promise.all(Object.entries(FILES).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        this.buffers[key] = await this.ctx.decodeAudioData(arr);
      } catch (err) {
        console.warn(`Audio: failed to load ${url}`, err);
        this.buffers[key] = null;
      }
    }));
  }

  _loopSource(buffer, destGain) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(destGain);
    src.start();
    return src;
  }

  // ── Engine: synthesized oscillator bank ───────────────────────────────────
  // Two detuned sawtooth oscillators through a lowpass filter.
  // An LFO adds idle wobble that fades out as the car accelerates.
  _startSynthEngine() {
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 72;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 75;

    // LFO — idle breath; depth fades to zero once moving
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 7;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 5;
    lfo.connect(lfoDepth);
    lfoDepth.connect(osc.frequency);
    lfoDepth.connect(osc2.frequency);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 280;
    lpf.Q.value = 2.0;

    const gain = ctx.createGain();
    gain.gain.value = 0.18;

    osc.connect(lpf);
    osc2.connect(lpf);
    lpf.connect(gain);
    gain.connect(this.master);

    osc.start(); osc2.start(); lfo.start();

    this.nodes.engine = { osc, osc2, lfo, lfoDepth, lpf, gain };
  }

  // ── Skid: looped sample, gated by drift ────────────────────────────────────
  _startSkid() {
    if (!this.buffers.skid) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.connect(this.master);
    const src = this._loopSource(this.buffers.skid, g);
    this.nodes.skid = { src, gain: g };
  }

  // ── Music bed ──────────────────────────────────────────────────────────────
  _startMusic() {
    if (!this.buffers.music) return;
    const g = this.ctx.createGain();
    g.gain.value = this.musicEnabled ? 0.35 : 0.0;
    g.connect(this.master);
    const src = this._loopSource(this.buffers.music, g);
    this.nodes.music = { src, gain: g };
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────
  _onTick(s) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.nodes.engine) {
      const { osc, osc2, lfoDepth, lpf, gain } = this.nodes.engine;
      const speed = s.speedRaw ?? s.speed ?? 0;
      const rpm   = gearRpm(speed);   // 0..1, resets each gear

      const isIdle  = speed < 4;
      const isAccel = !isIdle && !!s.throttle;

      // Frequency: low idle hum → rising pitch within each gear
      const freq = isIdle ? 72 : 65 + rpm * 155;
      osc.frequency.setTargetAtTime(freq,     now, 0.10);
      osc2.frequency.setTargetAtTime(freq + (isAccel ? 5 : 3), now, 0.10);

      // Wobble: full depth at idle, gone by ~6 km/h
      lfoDepth.gain.setTargetAtTime(Math.max(0, 5 - speed * 0.8), now, 0.35);

      // Filter cutoff:
      //   idle   — muffled (~280 Hz)
      //   cruise — moderately open, tracks speed
      //   accel  — wide open, bright snarl
      const cutoff = isIdle  ? 280
        : isAccel ? Math.min(2200, 450 + speed * 5 + rpm * 700)
        :           Math.min(900,  360 + speed * 2.5 + rpm * 200);
      lpf.frequency.setTargetAtTime(cutoff, now, 0.08);

      // Volume: quiet idle → moderate cruise → louder accel
      const vol = isIdle ? 0.17 : isAccel ? 0.38 : 0.25;
      gain.gain.setTargetAtTime(vol, now, 0.10);
    }

    if (this.nodes.skid) {
      const drift = Math.max(s.drift ?? 0, (s.handbrake && s.speed > 15) ? 0.5 : 0);
      const vol = Math.min(0.6, drift * 0.7);
      this.nodes.skid.gain.gain.setTargetAtTime(vol, now, 0.04);
    }

    // Boost whoosh on release (delivered once by the game, tier 1..3)
    if (s.boostJustFired) this._playBoost(s.boostJustFired);

    // Gear-shift blip on upshift
    if (s.gear !== this._lastGear) {
      const up = gearNum(s.gear) > gearNum(this._lastGear);
      if (up && gearNum(s.gear) > 0) this._playGearBlip();
      this._lastGear = s.gear;
    }
  }

  // ── Synthesized one-shots (no asset needed) ────────────────────────────────
  _makeNoiseBuffer() {
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Filtered-noise sweep — brighter and louder with tier.
  _playBoost(tier) {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    const f0 = 500 + tier * 250;
    bp.frequency.setValueAtTime(f0, now);
    bp.frequency.exponentialRampToValueAtTime(f0 * 4, now + 0.35);
    const g = this.ctx.createGain();
    const peak = 0.25 + tier * 0.12;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(now); src.stop(now + 0.55);
  }

  _playGearBlip() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + 0.1);
  }

  // ── Toggles ─────────────────────────────────────────────────────────────────
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    this._announce();
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    if (this.nodes.music) this.nodes.music.gain.gain.setTargetAtTime(this.musicEnabled ? 0.35 : 0, this.ctx.currentTime, 0.05);
    this._announce();
  }

  _announce() {
    this.game.events.dispatchEvent(new CustomEvent('audiochange', { detail: this.getStatus() }));
  }

  getStatus() {
    return { muted: this.muted, musicEnabled: this.musicEnabled };
  }
}

// Gear label → number ('N' = 0) for detecting upshifts
function gearNum(g) { return g === 'N' ? 0 : (parseInt(g, 10) || 0); }

// Map speed → 0..1 rev level that resets each gear (matches game.js gears)
function gearRpm(speed) {
  const bands = [[0, 1], [1, 30], [30, 60], [60, 90], [90, 130], [130, 170], [170, 250]];
  for (const [lo, hi] of bands) {
    if (speed < hi) return 0.25 + 0.75 * Math.max(0, Math.min(1, (speed - lo) / (hi - lo)));
  }
  return 1;
}
