import * as THREE from 'three';
import { buildPhysicsWorld, buildScene, loadTrack, loadCar } from './world.js';
import { Car, GEAR_SPEEDS }  from './car.js';
import { InputHandler }      from './input.js';
import { CameraController } from './camera.js';
import { VFX }              from './vfx.js';
import { stadiumLoop }      from './ai/track-path.js';
import { Opponents, RaceTracker, gridPositions } from './ai/opponents.js';

/**
 * Game — the headless racing engine.
 *
 * It owns the renderer, physics, car, camera and game loop, but knows NOTHING
 * about the HUD/UI. It publishes everything a UI needs through an event API so
 * any UI layer (vanilla, React, Vue, Svelte, …) can be plugged in or swapped
 * out without changing the engine.
 *
 * ── UI integration API ──────────────────────────────────────────────────────
 *   const game = new Game(canvasContainerEl);
 *
 *   game.on('loading', ({ progress, message }) => {...}); // 0–100, status text
 *   game.on('ready',   () => {...});                       // assets loaded, loop running
 *   game.on('tick',    (state) => {...});                  // every rendered frame
 *   game.on('camerachange', ({ mode }) => {...});          // camera mode switched
 *
 *   game.getState();      // current snapshot (same shape as the 'tick' payload)
 *   game.cycleCamera();   // change camera view (also bound to the C key)
 *   game.reset();         // respawn the car (also bound to the R key)
 *
 *   await game.start();   // load assets and begin the loop
 *
 * `game.on(type, cb)` returns an unsubscribe function.
 *
 * state shape:
 *   { phase: 'loading'|'ready', loading: { progress, message },
 *     speed: number (km/h), maxSpeed: number, gear: string, cameraMode: string }
 */
export class Game {
  constructor(container = document.body) {
    this.container = container;
    this.events = new EventTarget();

    this.state = {
      phase: 'loading',
      loading: { progress: 0, message: 'Initializing...' },
      speed: 0,
      maxSpeed: 250,
      gear: 'N',
      cameraMode: 'CHASE CAM',
      gearMode: 'auto',
      manualGear: 1,
    };

    this._initRenderer();
    this._initWorld();

    this._clock = new THREE.Timer();
    this._accumulator = 0;
    this._resetKeyHeld  = false;
    this._cameraKeyHeld = false;
    this._gearToggleHeld = false;
    this._shiftUpHeld    = false;
    this._shiftDownHeld  = false;
    this._loop = this._loop.bind(this);
  }

  // ── Public event API ──────────────────────────────────────────────────────
  on(type, callback) {
    const handler = (e) => callback(e.detail);
    this.events.addEventListener(type, handler);
    return () => this.events.removeEventListener(type, handler);
  }

  _emit(type, detail) {
    this.events.dispatchEvent(new CustomEvent(type, { detail }));
  }

  getState() { return this.state; }

  // ── Setup ───────────────────────────────────────────────────────────────--
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  _initWorld() {
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 10, -20);

    this.world = buildPhysicsWorld();
    this.scene = buildScene(this.renderer);
  }

  _setLoading(progress, message) {
    this.state.phase = 'loading';
    this.state.loading = { progress, message: message ?? this.state.loading.message };
    this._emit('loading', { ...this.state.loading });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────--
  async start() {
    this._setLoading(5, 'Loading track...');

    const [trackResult, carGltf] = await Promise.all([
      loadTrack(this.scene, this.world, p => this._setLoading(5 + p * 60, 'Loading track...')),
      loadCar(p => this._setLoading(65 + p * 25, 'Loading car model...')),
    ]);

    this._setLoading(95, 'Building physics...');

    const spawnY = (trackResult?.spawnY ?? 0) + 1.0;

    // Course + grid. The flat plane has no walls, so the racing line defines the
    // track for both the AI and lap tracking.
    this.racingLine = stadiumLoop();
    const NUM_OPPONENTS = 3;
    const grid = gridPositions(this.racingLine, NUM_OPPONENTS + 1);

    // Player on pole; opponents behind. Spawn opponents BEFORE the player
    // attaches the model so they clone the pristine (unscaled) scene.
    this.car = new Car(this.world, this.scene, spawnY, grid[0]);
    this.opponents = new Opponents(this.world, this.scene, carGltf, this.racingLine, {
      spawnY,
      grid: grid.slice(1),
      profiles: ['hard', 'medium', 'easy'],
    });
    if (carGltf) this.car.attachModel(carGltf);

    // Race bookkeeping (laps, positions). Rubber-banding off by default.
    this.rubberBanding = false;
    this.race = new RaceTracker(this.racingLine, 3);
    this.race.register(this.car, 'You');
    for (const ai of this.opponents.cars) this.race.register(ai.car, ai.label);

    this.input   = new InputHandler();
    this.camCtrl = new CameraController(this.camera);
    this.vfx     = new VFX(this.scene);
    this.state.cameraMode = this.camCtrl.modeName;

    this._rearWheels = [new THREE.Vector3(), new THREE.Vector3()];

    // Camera cycle on C (edge-triggered)
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyC' && !this._cameraKeyHeld) {
        this._cameraKeyHeld = true;
        this.cycleCamera();
      }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'KeyC') this._cameraKeyHeld = false;
    });

    this._setLoading(100, 'Ready!');
    this.state.phase = 'ready';
    this._emit('ready', {});

    this._loop();
  }

  // ── Player-facing actions (key-bound and callable from any UI) ────────────--
  cycleCamera() {
    this.camCtrl.switchMode();
    this.state.cameraMode = this.camCtrl.modeName;
    this._emit('camerachange', { mode: this.state.cameraMode });
  }

  toggleGearMode() {
    if (!this.car) return;
    this.car.gearMode = this.car.gearMode === 'auto' ? 'manual' : 'auto';
    if (this.car.gearMode === 'manual') {
      // Snap the manual gear to whatever the car's current speed implies
      const spd = this.car.speed;
      this.car.manualGear = GEAR_SPEEDS.findIndex((top, i) => i > 0 && spd < top);
      if (this.car.manualGear < 1) this.car.manualGear = 6;
    }
    this.state.gearMode   = this.car.gearMode;
    this.state.manualGear = this.car.manualGear;
    this._emit('gearmodechange', { mode: this.car.gearMode, gear: this.car.manualGear });
  }

  shiftGear(delta) {
    if (!this.car || this.car.gearMode !== 'manual') return;
    this.car.manualGear = Math.max(1, Math.min(6, this.car.manualGear + delta));
    this.state.manualGear = this.car.manualGear;
    this._emit('gearmodechange', { mode: this.car.gearMode, gear: this.car.manualGear });
  }

  reset() {
    if (this.car) this.car.reset();
    if (this.opponents) this.opponents.reset();
    if (this.race) this.race.reset();
  }

  // ── Loop ────────────────────────────────────────────────────────────────--
  _loop() {
    requestAnimationFrame(this._loop);

    this._clock.update();
    const dt = Math.min(this._clock.getDelta(), 0.05);
    this._accumulator += dt;

    // Reset (edge-triggered)
    if (this.input.reset && !this._resetKeyHeld) {
      this._resetKeyHeld = true;
      this.reset();
    }
    if (!this.input.reset) this._resetKeyHeld = false;

    // Gear mode toggle (Tab) and manual shifting (Q / E) — all edge-triggered
    if (this.input.gearToggle && !this._gearToggleHeld) {
      this._gearToggleHeld = true;
      this.toggleGearMode();
    }
    if (!this.input.gearToggle) this._gearToggleHeld = false;

    if (this.input.shiftUp && !this._shiftUpHeld) {
      this._shiftUpHeld = true;
      this.shiftGear(1);
    }
    if (!this.input.shiftUp) this._shiftUpHeld = false;

    if (this.input.shiftDown && !this._shiftDownHeld) {
      this._shiftDownHeld = true;
      this.shiftGear(-1);
    }
    if (!this.input.shiftDown) this._shiftDownHeld = false;

    // Fixed-step physics — player + AI opponents share one world.step
    const FIXED_STEP = 1 / 120;
    while (this._accumulator >= FIXED_STEP) {
      this.car.update(this.input, FIXED_STEP);
      this.opponents.update(FIXED_STEP);
      this.world.step(FIXED_STEP);
      this._accumulator -= FIXED_STEP;
    }

    // Race standings (laps + live position), and optional catch-up balancing
    this.race.update();
    if (this.rubberBanding) this.race.applyBanding(this.opponents, this.car);

    // Boost fired this frame (consumed once, then cleared so it fires only once)
    const boostJustFired = this.car.boostJustFired;
    this.car.boostJustFired = 0;

    // Tyre smoke + tiered boost sparks from the rear wheels
    this.car.getWheelWorldPosition(2, this._rearWheels[0]);
    this.car.getWheelWorldPosition(3, this._rearWheels[1]);
    this.vfx.update(dt, this._rearWheels, this.car.driftIntensity);
    this.vfx.updateSparks(dt, this._rearWheels, this.car.chargeTier, boostJustFired);

    // Camera — pass drift/steer/boost so it can lead the slide and react to boost
    this.camCtrl.update(this.car.position, this.car.quaternion, this.car.speed, dt, {
      drift: this.car.driftIntensity,
      steer: this.car.currentSteer,
      boost: this.car.boosting,
    });

    // Speed-based FOV — widens at high speed (sense of velocity) with a boost punch
    const mode = this.camCtrl.modeName;
    if (mode.startsWith('CHASE') || mode.startsWith('HOOD')) {
      const targetFov = 65 + Math.min(22, this.car.speed * 0.11) + (this.car.boosting ? 10 : 0);
      const lerp = this.car.boosting ? 8 : 4;   // snappier punch when boosting
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * lerp);
      this.camera.updateProjectionMatrix();
    }

    // Publish state for the UI / audio
    this.state.speed     = Math.round(this.car.speed);
    this.state.speedRaw  = this.car.speed;
    this.state.gear      = this.car.gearMode === 'manual'
      ? String(this.car.manualGear)
      : calcGear(this.car.speed);
    this.state.gearMode   = this.car.gearMode;
    this.state.manualGear = this.car.manualGear;
    this.state.throttle  = this.input.forward;
    this.state.braking   = this.input.backward;
    this.state.handbrake = this.input.handbrake;
    this.state.steer     = this.car.currentSteer;
    this.state.drift     = this.car.driftIntensity;
    this.state.isDrifting = this.car.isDrifting;
    this.state.charge      = this.car.charge;       // 0..1 drift-boost meter
    this.state.chargeTier  = this.car.chargeTier;   // 0..3 (live while drifting)
    this.state.boosting    = this.car.boosting;
    this.state.boostTier   = this.car.boostTier;
    this.state.boostJustFired = boostJustFired;
    const r = this.race.getFor(this.car);
    if (r) {
      this.state.lap       = r.lap;
      this.state.totalLaps = r.totalLaps;
      this.state.position  = r.position;
      this.state.totalCars = r.totalCars;
    }
    this._emit('tick', this.state);

    this.renderer.render(this.scene, this.camera);
  }
}

// Cosmetic gear indicator derived from speed
function calcGear(speed) {
  if (speed < 1)   return 'N';
  if (speed < 30)  return '1';
  if (speed < 60)  return '2';
  if (speed < 90)  return '3';
  if (speed < 130) return '4';
  if (speed < 170) return '5';
  return '6';
}
