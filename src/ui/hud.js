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