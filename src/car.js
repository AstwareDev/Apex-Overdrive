import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const UP    = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

export class Car {
  /**
   * @param {CANNON.World} world
   * @param {THREE.Scene}  scene
   * @param {number} spawnY    surface height to drop onto
   * @param {object} [opts]    { x, z, heading } grid-spawn position + yaw (rad)
   */
  constructor(world, scene, spawnY = 2, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.spawnY = spawnY;
    this.spawnX = opts.x ?? 0;
    this.spawnZ = opts.z ?? 0;
    this.spawnHeading = opts.heading ?? 0;

    // ── Gear mode ('auto' | 'manual') ────────────────────────────────────────
    // Auto: smooth continuous accel up to maxSpeedKmh (original behaviour).
    // Manual: speed capped at the current gear ceiling; throttle ramps faster.
    this.gearMode   = 'auto';
    this.manualGear = 1;            // 1–6 in manual mode

    // ── Core tuning ───────────────────────────────────────────────────────────
    this.maxEngineForce  = 5200;
    this.maxSpeedKmh     = 220;

    // Grip — rear grip is reduced on handbrake so the back steps out (drift),
    // but not so far that the car spins instantly or scrubs all its speed.
    this.baseGrip  = 2.6;
    this.driftGrip = 0.85;

    // Speed-sensitive steering, but full lock stays available while drifting so
    // you can counter-steer and hold the slide.
    this.maxSteerLow      = 0.60;
    this.maxSteerHigh     = 0.18;
    this.steerEaseSpeed   = 7.0;
    this.steerReturnSpeed = 12.0;
    this.driftSteerScale  = 0.4;   // steering changes ~2.5x slower while drifting
    this.currentSteer     = 0;

    // ── Sim-arcade feel tuning ────────────────────────────────────────────────
    // Throttle ramps in instead of slamming on (smoother accel, less twitch).
    this.throttleRamp      = 6.0;   // auto mode: how fast throttle reaches target
    this.throttleRampManual= 11.0;  // manual mode: ramps faster within the gear
    this.throttleCurve     = 1.6;   // >1 = gentle off the line, punchier up top
    this.throttleCurveManual = 1.0; // manual mode: more linear (punchy to gear ceiling)
    this.engineBrake   = 4.0;   // lift-off deceleration at speed (rear bias)

    // Weight transfer: accel/brake/cornering shift grip front<->rear, which is
    // what makes the car feel "weighted" and rewards trail-braking + throttle
    // control. Estimated from chassis acceleration (cheap) and low-passed.
    this.wtAccelGain = 0.35;    // on power: rear gains, front loses
    this.wtBrakeGain = 0.30;    // braking: front gains, rear loses
    this.wtLatGain   = 0.25;    // hard cornering bleeds combined grip
    this.wtSmoothing = 8.0;     // low-pass on the accel estimate (mandatory)

    // Progressive slip curve — grip eases off on a rounded shoulder past the
    // limit instead of falling off a cliff. This is the "forgiving but loseable"
    // feel: easy to hold, with a readable edge to chase.
    this.slipPeak    = 0.14;    // rad of slip the tyre holds before letting go
    this.slipFalloff = 0.55;    // width of the fall-off shoulder
    this.gripFloor   = 0.55;    // fraction of grip retained when fully sliding

    // Counter-steer assist — auto-catches a slide when you're not steering, so
    // the car stays controllable at the limit without removing manual control.
    this.counterSteerGain = 0.6;
    this.counterSteerMax  = 0.25;

    // ── Drift → boost charge loop (the core "addictive" mechanic) ─────────────
    // Holding a drift charges a meter; releasing it fires a tiered speed boost
    // (Mario-Kart mini-turbo style). Sharper angle charges faster.
    this.chargeRate   = 1.6;    // base charge/sec while drifting
    this.chargeAngleK = 1.0;    // extra charge from slip angle
    this.chargeMax    = 3.0;
    this.tier1 = 0.5;           // ~0.3s slide → tier 1 (blue)
    this.tier2 = 1.3;           // ~0.8s slide → tier 2 (orange)
    this.tier3 = 2.2;           // ~1.4s slide → tier 3 (purple)
    // Per-tier boost (index 0 unused). Force on all 4 wheels; speed bump lifts
    // the governor so the boost is actually visible past the normal top speed.
    this.boostForce     = [0, 4200, 6000, 7500];
    this.boostSpeedBump = [0, 20, 40, 70];     // km/h above maxSpeedKmh
    this.boostDuration  = [0, 0.9, 1.5, 2.4];  // seconds

    // ── Telemetry state (read by VFX + audio + HUD) ───────────────────────────
    this.slipAngle      = 0;    // radians between heading and travel
    this.driftIntensity = 0;    // 0..1
    this.isDrifting     = false;
    this._wheelRoll     = 0;

    // Boost runtime
    this._charge        = 0;
    this._chargeTier    = 0;    // live tier while charging (0..3)
    this._boostTimer    = 0;
    this._boostTier     = 0;
    this._straightTimer = 0;
    this._wasDrifting   = false;
    this.boostActive    = false;
    this.boostJustFired = 0;    // tier of a boost fired this step (game clears it)

    // Weight-transfer runtime
    this._prevSpeedMs      = 0;
    this._accelSmoothed    = 0;
    this._latAccelSmoothed = 0;
    this._throttle         = 0;
    this._noseX = 0; this._noseZ = 1;
    this._slideDir = 0;

    this.vehicle     = null;
    this.chassisMesh = null;
    this.carModel    = null;
    this.wheelPivots = [];

    this._buildPhysics();
    this._buildChassisMesh();
  }

  _buildPhysics() {
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.35, 2.3));
    const chassisBody  = new CANNON.Body({ mass: 1200 });
    chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.1, 0));
    chassisBody.position.set(this.spawnX, this.spawnY, this.spawnZ);
    chassisBody.quaternion.setFromEuler(0, this.spawnHeading, 0);
    chassisBody.linearDamping  = 0.02;
    chassisBody.angularDamping = 0.2;   // free enough to rotate, damped enough to control

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody,
      indexRightAxis:   0,
      indexUpAxis:      1,
      indexForwardAxis: 2,
    });

    const wheelOpts = {
      radius: 0.38,
      directionLocal:  new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 55,
      suspensionRestLength: 0.35,
      frictionSlip: this.baseGrip,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 100000,
      rollInfluence: 0.1,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      maxSuspensionTravel: 0.3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };

    const wx = 1.05, wz_f = 1.55, wz_r = -1.55, wy = 0;
    const positions = [
      [-wx, wy,  wz_f],  // 0 FL (front, nose at +z)
      [ wx, wy,  wz_f],  // 1 FR
      [-wx, wy,  wz_r],  // 2 RL
      [ wx, wy,  wz_r],  // 3 RR
    ];
    positions.forEach(([x, y, z]) => {
      wheelOpts.chassisConnectionPointLocal.set(x, y, z);
      this.vehicle.addWheel(wheelOpts);
    });

    this.vehicle.addToWorld(this.world);
  }

  _buildChassisMesh() {
    const geo = new THREE.BoxGeometry(2.0, 0.7, 4.6);
    const mat = new THREE.MeshStandardMaterial({ visible: false });
    this.chassisMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.chassisMesh);
  }

  attachModel(gltf) {
    this.carModel = gltf.scene;

    // Auto-scale to a real-car length and re-center on the chassis
    const box = new THREE.Box3().setFromObject(this.carModel);
    const size = new THREE.Vector3(); box.getSize(size);
    this.carModel.scale.setScalar(4.8 / size.z);

    box.setFromObject(this.carModel);
    const center = new THREE.Vector3(); box.getCenter(center);
    this.carModel.position.sub(center);

    this.chassisMesh.add(this.carModel);
    this.carModel.updateWorldMatrix(true, true);

    this._setupWheelPivots();
  }

  // Wrap each wheel's meshes in a pivot Group centred on the wheel so we can
  // steer (rotate about car-up) and spin (rotate about the axle) them visually.
  _setupWheelPivots() {
    const corners = [
      { tags: ['WHEEL_LF', 'DISC_LF', 'TIRE_LF'], front: true  },
      { tags: ['WHEEL_RF', 'DISC_RF', 'TIRE_RF'], front: true  },
      { tags: ['WHEEL_LR', 'DISC_LR', 'TIRE_LR'], front: false },
      { tags: ['WHEEL_RR', 'DISC_RR', 'TIRE_RR'], front: false },
    ];

    for (const c of corners) {
      const matches = [];
      this.carModel.traverse(o => {
        const n = (o.name || '').toUpperCase();
        if (c.tags.some(t => n.includes(t))) matches.push(o);
      });
      if (!matches.length) continue;

      // Keep only top-most nodes (drop descendants of other matches)
      const tops = matches.filter(n => !matches.some(m => m !== n && isAncestor(m, n)));

      const wbox = new THREE.Box3();
      tops.forEach(n => wbox.expandByObject(n));
      if (wbox.isEmpty()) continue;
      const centerWorld = wbox.getCenter(new THREE.Vector3());

      const pivot = new THREE.Group();
      this.carModel.add(pivot);
      pivot.position.copy(this.carModel.worldToLocal(centerWorld.clone()));
      tops.forEach(n => pivot.attach(n));  // preserves world transform

      this.wheelPivots.push({ pivot, front: c.front });
    }
  }

  reset() {
    const body = this.vehicle.chassisBody;
    body.position.set(this.spawnX, this.spawnY, this.spawnZ);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.quaternion.setFromEuler(0, this.spawnHeading, 0);
    this.currentSteer = 0;
    this._wheelRoll   = 0;
    this._charge = 0; this._chargeTier = 0; this._straightTimer = 0;
    this._boostTimer = 0; this._boostTier = 0; this.boostActive = false;
    this._throttle = 0; this._prevSpeedMs = 0;
    this._accelSmoothed = 0; this._latAccelSmoothed = 0;
  }

  update(input, dt) {
    const v  = this.vehicle;
    const cb = v.chassisBody;
    const handbrake = input.handbrake;

    // --- Telemetry first: slip angle + weight transfer feed everything below ---
    this._updateDrift(cb, dt, handbrake);
    this._updateWeightTransfer(cb, dt);
    this._updateBoost(input, dt);

    // --- Engine + boost (nose is +z, so forward = negative force) ---
    // Boost lifts the speed cap so it stays effective past the normal top speed.
    const boostT = this._boostTimer > 0
      ? this._boostTimer / this.boostDuration[this._boostTier] : 0;
    const gearCap  = this.gearMode === 'manual' ? GEAR_SPEEDS[this.manualGear] : this.maxSpeedKmh;
    const topSpeed = gearCap + this.boostSpeedBump[this._boostTier] * boostT;
    const governed = this.speed >= topSpeed;

    // Throttle ramps toward its target rather than snapping (cleaner accel feel)
    const ramp   = this.gearMode === 'manual' ? this.throttleRampManual : this.throttleRamp;
    const curve  = this.gearMode === 'manual' ? this.throttleCurveManual : this.throttleCurve;
    const throttleTarget = input.forward ? 1 : 0;
    this._throttle += (throttleTarget - this._throttle) * Math.min(1, dt * ramp);

    let engineForce = 0;
    if (input.forward && !governed) {
      engineForce = -this.maxEngineForce * Math.pow(this._throttle, curve);
    } else if (input.backward && !input.forward) {
      engineForce = this.maxEngineForce * 0.6;   // reverse
    }
    // Boost force: applied to ALL four wheels (avoids rear-only wheelspin) and
    // decays over the boost window.
    const boostForce = (this._boostTimer > 0 && this.speed < topSpeed)
      ? -this.boostForce[this._boostTier] * boostT : 0;

    v.applyEngineForce(boostForce, 0);
    v.applyEngineForce(boostForce, 1);
    v.applyEngineForce(engineForce + boostForce, 2);
    v.applyEngineForce(engineForce + boostForce, 3);

    // --- Grip: weight transfer + progressive slip curve + drift break-away ---
    // Load shift normalised against gravity (g = 20 in this world, see world.js).
    const shiftLong = clamp(this._accelSmoothed / 20, -1, 1);
    const shiftLat  = clamp(this._latAccelSmoothed / 20, -1, 1);
    const longGain  = shiftLong >= 0 ? this.wtAccelGain : this.wtBrakeGain;
    const frontWT   = 1 - shiftLong * longGain;   // accel: front loses; brake: front gains
    const rearWT    = 1 + shiftLong * longGain;   // accel: rear gains;  brake: rear loses
    const latLoss   = 1 - Math.abs(shiftLat) * this.wtLatGain;

    const slipFactor      = this._slipGripFactor(this.slipAngle);
    const frontSlipFactor = 1 - (1 - slipFactor) * 0.4;  // front lets go more gently

    let rearGrip  = this.baseGrip;
    let frontGrip = this.baseGrip;
    // Drifting is handbrake-only: the rear steps out when (and only when) the
    // handbrake is pulled — no power/steer-flick oversteer.
    if (handbrake) {
      rearGrip = this.driftGrip;
    }
    // During a boost, restore rear grip so the launch hooks up instead of spinning.
    if (this._boostTimer > 0) rearGrip = Math.max(rearGrip, this.baseGrip * 0.9);

    frontGrip *= frontWT * latLoss * frontSlipFactor;
    rearGrip  *= rearWT  * latLoss * slipFactor;

    v.wheelInfos[0].frictionSlip = frontGrip;
    v.wheelInfos[1].frictionSlip = frontGrip;
    v.wheelInfos[2].frictionSlip = rearGrip;
    v.wheelInfos[3].frictionSlip = rearGrip;

    // --- Braking / handbrake / engine braking ---
    const coasting = !input.forward && !input.backward;
    const natural  = coasting ? 6 : 0;
    // Engine braking: extra rear drag on lift-off at speed → rotates into corners.
    const engBrake = (coasting && this.speed > 15) ? this.engineBrake : 0;
    // Handbrake: light drag if powering (keeps the slide alive), stronger if not.
    const rearBrake = handbrake ? (input.forward ? 3 : 28) : 0;
    v.setBrake(natural, 0);
    v.setBrake(natural, 1);
    v.setBrake(rearBrake + natural + engBrake, 2);
    v.setBrake(rearBrake + natural + engBrake, 3);

    // --- Steering (speed-sensitive, full lock kept for counter-steer) ---
    const speedT   = Math.min(1, this.speed / 150);
    const grippy   = this.maxSteerLow + (this.maxSteerHigh - this.maxSteerLow) * speedT;
    const maxSteer = (handbrake || this.isDrifting) ? this.maxSteerLow : grippy;

    const steering = input.left || input.right;
    let targetSteer = input.left ? maxSteer : input.right ? -maxSteer : 0;

    // Counter-steer assist: when not actively steering, nudge into the slide to
    // catch it. Scaled to zero the moment the player gives a deliberate input.
    const playerDir = input.left ? 1 : input.right ? -1 : 0;
    if (this.slipAngle > this.slipPeak) {
      const assist = clamp(
        this.counterSteerGain * (this.slipAngle - this.slipPeak) * this._slideDir,
        -this.counterSteerMax, this.counterSteerMax,
      ) * (1 - Math.abs(playerDir));
      targetSteer += assist;
    }

    let rate = steering ? this.steerEaseSpeed : this.steerReturnSpeed;
    // Slow the steering right down while drifting so the car doesn't snap-rotate.
    if (handbrake || this.isDrifting) rate *= this.driftSteerScale;
    this.currentSteer += (targetSteer - this.currentSteer) * Math.min(1, dt * rate);
    v.setSteeringValue(this.currentSteer, 0);
    v.setSteeringValue(this.currentSteer, 1);

    // --- Sync chassis visual ---
    this.chassisMesh.position.copy(cb.position);
    this.chassisMesh.quaternion.copy(cb.quaternion);

    // Refresh wheel contact transforms (used for VFX emitter positions)
    for (let i = 0; i < v.wheelInfos.length; i++) v.updateWheelTransform(i);

    // --- Spin + steer the visible wheels ---
    this._updateWheelVisuals(dt);
  }

  _updateDrift(cb, dt, handbrake) {
    const vx = cb.velocity.x, vz = cb.velocity.z;
    const planar = Math.hypot(vx, vz);

    // Heading (nose, local +z) in world
    const q = cb.quaternion;
    const noseX = 2 * (q.x * q.z + q.w * q.y);
    const noseZ = 1 - 2 * (q.x * q.x + q.y * q.y);
    this._noseX = noseX; this._noseZ = noseZ;

    let slip = 0, dir = 1;
    if (planar > 1.5) {
      const dot = (vx * noseX + vz * noseZ) / planar; // cos(angle), signed
      dir  = Math.sign(dot) || 1;
      slip = Math.acos(Math.min(1, Math.max(-1, Math.abs(dot)))); // 0..π/2
    }
    this.slipAngle = slip;

    // Which way the car is sliding (sign of lateral velocity vs heading): the
    // car's right vector is (noseZ, -noseX). Used to aim the counter-steer assist.
    const vLat = vx * noseZ + vz * -noseX;
    this._slideDir = Math.sign(vLat) || 0;

    // A "drift" requires the handbrake — natural grip loss in a corner is not one.
    const intensity = Math.min(1, Math.max(0, (slip - 0.18) / 0.5))
                    * Math.min(1, planar / 6);
    this.driftIntensity = handbrake ? intensity : 0;
    this.isDrifting = this.driftIntensity > 0.06;

    // Accumulate wheel roll from ground speed (m/s ÷ wheel radius)
    this._wheelRoll += dir * (planar / 0.38) * dt;
  }

  // Cheap weight transfer estimate from chassis acceleration (low-passed so the
  // differentiated velocity doesn't make the grip jitter).
  _updateWeightTransfer(cb, dt) {
    const spdMs = Math.hypot(cb.velocity.x, cb.velocity.z);
    const aLong = (spdMs - this._prevSpeedMs) / dt;
    this._prevSpeedMs = spdMs;
    this._accelSmoothed += (aLong - this._accelSmoothed) * Math.min(1, dt * this.wtSmoothing);

    // Lateral accel ≈ lateral speed × yaw rate (centripetal proxy)
    const vLat = cb.velocity.x * this._noseZ + cb.velocity.z * -this._noseX;
    const latAccel = vLat * cb.angularVelocity.y;
    this._latAccelSmoothed += (latAccel - this._latAccelSmoothed) * Math.min(1, dt * this.wtSmoothing);
  }

  // Grip multiplier vs slip angle: full grip up to slipPeak, then a smooth
  // rounded shoulder down to gripFloor. The shoulder (not a cliff) is the
  // forgiving, controllable feel at the limit.
  _slipGripFactor(slip) {
    if (slip <= this.slipPeak) return 1;
    const t = Math.min(1, (slip - this.slipPeak) / this.slipFalloff);
    const s = t * t * (3 - 2 * t);          // smoothstep
    return 1 - (1 - this.gripFloor) * s;
  }

  // Drift→boost charge state machine. Charge while sliding, fire a tiered boost
  // on drift exit. Banking it by stopping or straightening out is blocked.
  _updateBoost(input, dt) {
    if (this.isDrifting && this.speed > 8) {
      this._charge = Math.min(
        this.chargeMax,
        this._charge + (this.chargeRate + this.chargeAngleK * this.slipAngle) * this.driftIntensity * dt,
      );
      // Straightening out mid-drift for too long bleeds the charge (no cheap angle banking)
      if (this.slipAngle < this.slipPeak) {
        this._straightTimer += dt;
        if (this._straightTimer > 0.4) this._charge = Math.max(0, this._charge - dt * 2);
      } else {
        this._straightTimer = 0;
      }
    }

    this._chargeTier = this._charge >= this.tier3 ? 3
                     : this._charge >= this.tier2 ? 2
                     : this._charge >= this.tier1 ? 1 : 0;

    // Release on drift exit → fire boost
    if (this._wasDrifting && !this.isDrifting) {
      if (this._chargeTier > 0) {
        this._boostTier  = this._chargeTier;
        this._boostTimer = this.boostDuration[this._boostTier];
        this.boostJustFired = this._boostTier;
      }
      this._charge = 0; this._chargeTier = 0; this._straightTimer = 0;
    }

    // Cancels: come to a stop, or a hard collision (big decel spike vs g = 20)
    if (this.speed < 8) { this._charge = 0; this._chargeTier = 0; }
    if (this._accelSmoothed < -40) {
      this._charge = 0; this._chargeTier = 0; this._boostTimer = 0;
    }

    if (this._boostTimer > 0) this._boostTimer = Math.max(0, this._boostTimer - dt);
    this.boostActive = this._boostTimer > 0;
    this._wasDrifting = this.isDrifting;
  }

  _updateWheelVisuals() {
    if (!this.wheelPivots.length) return;
    const qSteer = new THREE.Quaternion().setFromAxisAngle(UP, this.currentSteer);
    const qRoll  = new THREE.Quaternion().setFromAxisAngle(RIGHT, this._wheelRoll);

    for (const w of this.wheelPivots) {
      if (w.front) w.pivot.quaternion.copy(qSteer).multiply(qRoll);
      else         w.pivot.quaternion.copy(qRoll);
    }
  }

  // World position of a wheel contact (used by VFX). index 0–3.
  getWheelWorldPosition(index, out = new THREE.Vector3()) {
    const t = this.vehicle.wheelInfos[index].worldTransform;
    return out.set(t.position.x, t.position.y, t.position.z);
  }

  get speed() {
    const vel = this.vehicle.chassisBody.velocity;
    return Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2) * 3.6;
  }

  // Boost telemetry for HUD / VFX / audio
  get charge()     { return this._charge / this.chargeMax; }  // 0..1
  get chargeTier() { return this._chargeTier; }
  get boosting()   { return this.boostActive; }
  get boostTier()  { return this._boostTier; }

  get position()   { return this.vehicle.chassisBody.position; }
  get quaternion() { return this.vehicle.chassisBody.quaternion; }
}

// Speed ceiling per gear (km/h). Index 0 unused; matches calcGear() in game.js.
export const GEAR_SPEEDS = [0, 30, 60, 90, 130, 170, 220];

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function isAncestor(maybeAncestor, node) {
  let p = node.parent;
  while (p) { if (p === maybeAncestor) return true; p = p.parent; }
  return false;
}
