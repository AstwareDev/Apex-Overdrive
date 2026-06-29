import './hud.css';

export function mountHUD(game, root = document.body) {
  // Premium Motorsport Logo
  const logoSVG = `
    <svg viewBox="0 0 500 120" class="premium-logo" xmlns="http://www.w3.org/2000/svg">
      <path d="M 180 90 L 250 20 L 320 90 L 285 90 L 250 55 L 215 90 Z" fill="#ffcc00" />
      <path d="M 225 90 L 250 65 L 275 90 Z" fill="#111" />
      <text x="50%" y="115" text-anchor="middle" font-family="'Oswald', sans-serif" font-weight="700" font-size="32" fill="#fff" letter-spacing="12">APEX MOTORSPORT</text>
    </svg>
  `;

  root.innerHTML = `
    <div id="loading">
      <div class="loading-viewport">
        ${logoSVG}
        <div class="loading-container">
          <div id="loading-bar-wrap">
            <div id="loading-bar"></div>
          </div>
          <div class="loading-meta">
            <span id="loading-status">CALIBRATING TELEMETRY...</span>
            <span id="loading-percentage">0%</span>
          </div>
        </div>
      </div>
    </div>

    <div id="hud">
      <div class="hud-panel top-left">
        <div class="data-row">
          <span class="lbl">POS</span>
          <div class="val-group">
            <span id="pos-value" class="val text-yellow">1</span>
            <span id="pos-total" class="sub-val">/4</span>
          </div>
        </div>
        <div class="panel-divider"></div>
        <div class="data-row">
          <span class="lbl">LAP</span>
          <div class="val-group">
            <span id="lap-value" class="val text-white">1</span>
            <span id="lap-total" class="sub-val">/3</span>
          </div>
        </div>
      </div>

      <div class="hud-panel top-right">
        <div id="camera-mode" class="spec-badge">CHASE CAM</div>
        <div id="audio-status" class="spec-badge">🔊 ON</div>
        <div id="gear-mode-badge" class="spec-badge gear-mode-auto">AUTO GEARS</div>
      </div>

      <div class="hud-panel bottom-left">
        <div class="ctrl-header">VEHICLE CONTROLS</div>
        <div class="controls-grid">
          <div class="key-bind"><span class="m-key">W A S D</span> <span class="key-desc">DRIVE</span></div>
          <div class="key-bind"><span class="m-key text-yellow">SHIFT</span> <span class="key-desc">E-BRAKE / DRIFT</span></div>
          <div class="key-bind"><span class="m-key">C</span> <span class="key-desc">CAM</span> &nbsp; <span class="m-key">R</span> <span class="key-desc">RESET</span></div>
          <div class="key-bind"><span class="m-key text-yellow">TAB</span> <span class="key-desc">GEAR MODE</span> &nbsp; <span class="m-key">Q/E</span> <span class="key-desc">SHIFT</span></div>
        </div>
      </div>

      <div class="instrument-cluster">
        
        <div id="drift-module" class="hud-panel">
          <div class="drift-header">
            <span class="lbl">DRIFT CHARGE</span>
            <span id="boost-indicator">STANDBY</span>
          </div>
          <div id="charge-bar-wrap">
            <div id="charge-bar" class="tier-0"></div>
            <div class="charge-segments">
              <div></div><div></div><div></div><div></div><div></div>
            </div>
          </div>
        </div>

        <div class="telemetry-main">
          <div class="gear-module hud-panel">
            <span class="lbl">GEAR</span>
            <span id="gear-value">N</span>
          </div>

          <div class="speedo-module hud-panel">
            <svg class="speedo-svg" viewBox="0 0 200 200">
              <circle class="gauge-track" cx="100" cy="100" r="85" />
              <circle class="gauge-fill" id="speed-arc" cx="100" cy="100" r="85" />
            </svg>
            <div class="speedo-readout">
              <span id="speed-value">0</span>
              <span id="speed-unit">KM/H</span>
            </div>
          </div>
        </div>
      </div>

      <div class="input-telemetry hud-panel">
        <div class="steer-wrap">
          <svg id="steer-wheel" class="steer-wheel" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#e0e0e0" stroke-width="7" />
            <rect x="9"  y="45" width="82" height="10" rx="3" fill="#2b2b2b" />
            <rect x="45" y="50" width="10" height="41" rx="3" fill="#2b2b2b" />
            <circle cx="50" cy="50" r="13" fill="#1c1c1c" stroke="#555" stroke-width="2" />
            <path d="M44 53 L50 44 L56 53 Z" fill="#ffcc00" />
            <rect x="46.5" y="6" width="7" height="11" rx="2" fill="#ffcc00" />
          </svg>
          <span class="input-label">STEER</span>
        </div>

        <div class="pedals">
          <div id="pedal-handbrake" class="pedal handbrake">
            <svg class="pedal-svg" viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg">
              <rect class="pedal-arm" x="27" y="2" width="6" height="20" rx="3" />
              <rect class="pedal-pad" x="8" y="20" width="44" height="64" rx="9" />
              <g class="pedal-treads" stroke-width="3" stroke-linecap="round">
                <line x1="16" y1="34" x2="44" y2="34" />
                <line x1="16" y1="46" x2="44" y2="46" />
                <line x1="16" y1="58" x2="44" y2="58" />
                <line x1="16" y1="70" x2="44" y2="70" />
              </g>
            </svg>
            <span class="input-label">E-BRK</span>
          </div>
          <div id="pedal-brake" class="pedal brake">
            <svg class="pedal-svg" viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg">
              <rect class="pedal-arm" x="27" y="2" width="6" height="20" rx="3" />
              <rect class="pedal-pad" x="8" y="20" width="44" height="64" rx="9" />
              <g class="pedal-treads" stroke-width="3" stroke-linecap="round">
                <line x1="16" y1="34" x2="44" y2="34" />
                <line x1="16" y1="46" x2="44" y2="46" />
                <line x1="16" y1="58" x2="44" y2="58" />
                <line x1="16" y1="70" x2="44" y2="70" />
              </g>
            </svg>
            <span class="input-label">BRAKE</span>
          </div>
          <div id="pedal-throttle" class="pedal throttle">
            <svg class="pedal-svg" viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg">
              <rect class="pedal-arm" x="27" y="2" width="6" height="20" rx="3" />
              <rect class="pedal-pad" x="8" y="20" width="44" height="64" rx="9" />
              <g class="pedal-treads" stroke-width="3" stroke-linecap="round">
                <line x1="16" y1="34" x2="44" y2="34" />
                <line x1="16" y1="46" x2="44" y2="46" />
                <line x1="16" y1="58" x2="44" y2="58" />
                <line x1="16" y1="70" x2="44" y2="70" />
              </g>
            </svg>
            <span class="input-label">GAS</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);
  
  const loadingEl     = $('#loading');
  const loadingBar    = $('#loading-bar');
  const loadingStatus = $('#loading-status');
  const loadingPercent= $('#loading-percentage');
  
  const speedValueEl  = $('#speed-value');
  const speedArc      = $('#speed-arc');
  const gearEl        = $('#gear-value');
  
  const chargeBarEl   = $('#charge-bar');
  const boostIndEl    = $('#boost-indicator');
  
  const posValueEl    = $('#pos-value');
  const posTotalEl    = $('#pos-total');
  const lapValueEl    = $('#lap-value');
  const lapTotalEl    = $('#lap-total');
  const cameraModeEl  = $('#camera-mode');
  const audioStatusEl = $('#audio-status');
  const gearModeBadge = $('#gear-mode-badge');

  const steerWheelEl  = $('#steer-wheel');
  const pedalThrottle = $('#pedal-throttle');
  const pedalBrake    = $('#pedal-brake');
  const pedalHandbrake= $('#pedal-handbrake');

  // Max visual lock matches the car's low-speed steer ceiling (Car.maxSteerLow = 0.60)
  const MAX_STEER = 0.60;
  const STEER_LOCK_DEG = 120;

  // Gauge Math (Radius 85 -> Circumference ~534)
  const circumference = 2 * Math.PI * 85;
  speedArc.style.strokeDasharray = circumference;
  const maxArcLength = circumference * 0.75; // 75% of circle
  speedArc.style.strokeDashoffset = circumference;

  const unsubs = [];

  unsubs.push(game.on('loading', ({ progress, message }) => {
    loadingBar.style.width = `${progress}%`;
    loadingPercent.textContent = `${Math.round(progress)}%`;
    if (message) loadingStatus.textContent = message.toUpperCase();
  }));

  unsubs.push(game.on('ready', () => {
    loadingEl.style.opacity = '0';
    setTimeout(() => { loadingEl.style.display = 'none'; }, 800);
  }));

  unsubs.push(game.on('tick', (state) => {
    speedValueEl.textContent = state.speed;

    // SVG Speedometer logic
    const ratio = Math.min(1, state.speed / (state.maxSpeed || 250));
    const targetOffset = circumference - (ratio * maxArcLength);
    speedArc.style.strokeDashoffset = targetOffset;

    // Change gauge color to red near top speed
    if (ratio > 0.85) {
      speedArc.style.stroke = "#ff3300";
    } else {
      speedArc.style.stroke = "#ffcc00";
    }

    gearEl.textContent = state.gear;

    if (state.gearMode === 'manual') {
      gearModeBadge.textContent = `MANUAL · G${state.manualGear}`;
      gearModeBadge.className = 'spec-badge gear-mode-manual';
    } else {
      gearModeBadge.textContent = 'AUTO GEARS';
      gearModeBadge.className = 'spec-badge gear-mode-auto';
    }

    // RESTORED DRIFT UI LOGIC
    const tier = state.boosting ? state.boostTier : (state.chargeTier || 0);
    const chargePercent = Math.round((state.charge || 0) * 100);
    chargeBarEl.style.width = `${chargePercent}%`;
    
    // Update charge bar class for color changes based on tier
    chargeBarEl.className = `tier-${tier}`;
    
    if (state.boosting) {
      boostIndEl.textContent = "BOOST DEPLOYED";
      boostIndEl.className = "status-boosting";
    } else if (tier > 0 && state.charge >= 1) {
      boostIndEl.textContent = `TIER ${tier} READY`;
      boostIndEl.className = `status-tier-${tier}`;
    } else if (chargePercent > 0) {
      boostIndEl.textContent = "CHARGING...";
      boostIndEl.className = "status-charging";
    } else {
      boostIndEl.textContent = "STANDBY";
      boostIndEl.className = "";
    }

    // Driver input visualizer: pedals depress, wheel rotates.
    // Crossed steering sign (input.left -> +steer); negate so the wheel
    // turns left when the player steers left.
    const steerNorm = Math.max(-1, Math.min(1, (state.steer || 0) / MAX_STEER));
    steerWheelEl.style.transform = `rotate(${-steerNorm * STEER_LOCK_DEG}deg)`;
    pedalThrottle.classList.toggle('pressed', !!state.throttle);
    pedalBrake.classList.toggle('pressed', !!state.braking);
    pedalHandbrake.classList.toggle('pressed', !!state.handbrake);

    if (state.position) {
      posValueEl.textContent = state.position;
      posTotalEl.textContent = `/${state.totalCars}`;
      lapValueEl.textContent = state.lap;
      lapTotalEl.textContent = `/${state.totalLaps}`;
    }
  }));

  unsubs.push(game.on('camerachange', ({ mode }) => {
    cameraModeEl.textContent = mode;
  }));

  unsubs.push(game.on('gearmodechange', ({ mode, gear }) => {
    if (mode === 'manual') {
      gearModeBadge.textContent = `MANUAL · G${gear}`;
      gearModeBadge.className = 'spec-badge gear-mode-manual';
    } else {
      gearModeBadge.textContent = 'AUTO GEARS';
      gearModeBadge.className = 'spec-badge gear-mode-auto';
    }
  }));

  unsubs.push(game.on('audiochange', ({ muted, musicEnabled }) => {
    audioStatusEl.textContent = `${muted ? '🔇 MUTED' : '🔊 LIVE'} ${musicEnabled ? '♪' : ''}`;
  }));

  cameraModeEl.textContent = game.getState().cameraMode;

  return {
    destroy() {
      unsubs.forEach(off => off());
      root.innerHTML = '';
    },
  };
}