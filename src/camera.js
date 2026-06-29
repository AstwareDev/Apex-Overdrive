import * as THREE from 'three';

const MODES = ['chase', 'hood', 'orbit'];

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;

    this._chaseLag  = new THREE.Vector3();
    this._orbitAngle = 0;
    this._orbitDist  = 18;
    this._justSwitched = false;

    this._prevSpeed = 0;
    this._accel     = 0;   // smoothed (km/h per tick) — drives pull-back
  }

  get modeName() { return MODES[this.modeIndex].toUpperCase() + ' CAM'; }

  switchMode() {
    this.modeIndex = (this.modeIndex + 1) % MODES.length;
  }

  update(carPos, carQuat, speed, dt, fx = {}) {
    const mode = MODES[this.modeIndex];
    const pos  = new THREE.Vector3(carPos.x, carPos.y, carPos.z);
    const quat = new THREE.Quaternion(carQuat.x, carQuat.y, carQuat.z, carQuat.w);

    const drift = fx.drift || 0;
    const steer = fx.steer || 0;
    const boost = fx.boost ? 1 : 0;

    // Smoothed acceleration — the camera pulls back and lags more under power.
    const a = speed - this._prevSpeed;
    this._prevSpeed = speed;
    this._accel += (a - this._accel) * Math.min(1, dt * 6);

    // The car model's nose faces local +z, so that is the true forward direction.
    const FORWARD = new THREE.Vector3(0, 0, 1);

    if (mode === 'chase') {
      // Chase camera — lower and closer so the ground rushes by (sense of speed).
      // Pull back + lag more while accelerating or boosting → visceral launch.
      const forward = FORWARD.clone().applyQuaternion(quat);
      const pullBack = 6.5 + Math.min(2.5, Math.max(0, this._accel) * 4) + boost * 1.6;
      const offset  = new THREE.Vector3()
        .copy(forward).multiplyScalar(-pullBack)
        .add(new THREE.Vector3(0, 2.4, 0));

      const target = pos.clone().add(offset);
      const lagBase = (Math.max(0, this._accel) > 0.05 || boost) ? 4 : 6;
      const lag = Math.max(0.035, Math.min(0.14, dt * lagBase));
      this._chaseLag.lerp(target, lag);

      this.camera.position.copy(this._chaseLag);
      this._applyShake(speed, boost, drift, dt);

      // Lead the slide: shift the look target sideways when drifting/steering.
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
      const lead = right.multiplyScalar((drift * Math.sign(steer || 0)) * 3.0);
      this.camera.lookAt(pos.x + lead.x, pos.y + 0.6, pos.z + lead.z);

    } else if (mode === 'hood') {
      // Hood / driver POV
      const forward = FORWARD.clone().applyQuaternion(quat);
      const up      = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
      const camPos  = pos.clone()
        .add(forward.clone().multiplyScalar(1.2))
        .add(up.multiplyScalar(0.9));

      this.camera.position.copy(camPos);
      this._applyShake(speed, boost, drift, dt);
      const lookTarget = pos.clone()
        .add(forward.clone().multiplyScalar(30))
        .add(up.clone().multiplyScalar(0.3));
      this.camera.lookAt(lookTarget);

    } else if (mode === 'orbit') {
      // Orbit camera — slowly rotates around the car
      this._orbitAngle += dt * 0.4;
      const camPos = new THREE.Vector3(
        pos.x + Math.sin(this._orbitAngle) * this._orbitDist,
        pos.y + 8,
        pos.z + Math.cos(this._orbitAngle) * this._orbitDist,
      );
      this.camera.position.copy(camPos);
      this.camera.lookAt(pos.x, pos.y + 1, pos.z);
    }
  }

  // Subtle positional shake — energy of speed + boost + drift. Kept tiny so it
  // reads as adrenaline, not nausea.
  _applyShake(speed, boost, drift, dt) {
    const amp = Math.min(0.18, speed * 0.0006) + boost * 0.14 + drift * 0.08;
    if (amp <= 0.0001) return;
    this.camera.position.x += (Math.random() - 0.5) * amp;
    this.camera.position.y += (Math.random() - 0.5) * amp;
    this.camera.position.z += (Math.random() - 0.5) * amp;
  }
}
