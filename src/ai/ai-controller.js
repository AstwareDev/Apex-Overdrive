/**
 * AIController — drives a Car by writing the same boolean input an InputHandler
 * exposes (forward/backward/left/right/handbrake). Because Car.update only reads
 * those flags, an AI car handles IDENTICALLY to the player: difficulty comes
 * from driving decisions and believable mistakes, never from physics cheats.
 *
 * Steering: pure-pursuit toward a speed-scaled look-ahead point on the line.
 * Pace:     target speed from the sharpness of the corner ahead.
 */
export const AI_PROFILES = {
  easy:   { speedScale: 0.80, lookAheadBase: 9, lookAheadPerSpeed: 0.10, cornerCaution: 3.1,  reactionError: 0.12, driftEnabled: false, maxSpeed: 205 },
  medium: { speedScale: 0.90, lookAheadBase: 8, lookAheadPerSpeed: 0.09, cornerCaution: 2.95, reactionError: 0.06, driftEnabled: false, maxSpeed: 214 },
  hard:   { speedScale: 1.00, lookAheadBase: 8, lookAheadPerSpeed: 0.08, cornerCaution: 2.85, reactionError: 0.02, driftEnabled: false, maxSpeed: 220 },
};

export class AIController {
  constructor(car, line, profile = AI_PROFILES.medium) {
    this.car = car;
    this.line = line;
    this.profile = profile;
    this.input = { forward: false, backward: false, left: false, right: false, handbrake: false };
    this.banding = 1;        // rubber-band speed multiplier (1 = neutral, off)
    this._errTimer = 0;      // reaction-error re-roll countdown
    this._steerErr = 0;      // current steering error (radians)
  }

  update(dt) {
    const { car, line, profile: p } = this;
    const pos = car.position;
    const q = car.quaternion;

    // Heading (nose, local +z) in world
    const noseX = 2 * (q.x * q.z + q.w * q.y);
    const noseZ = 1 - 2 * (q.x * q.x + q.y * q.y);
    const speed = car.speed;

    // Believable imperfection — a small steering error re-rolled a few times/sec.
    this._errTimer -= dt;
    if (this._errTimer <= 0) {
      this._errTimer = 0.2 + Math.random() * 0.3;
      this._steerErr = (Math.random() * 2 - 1) * p.reactionError;
    }

    // Pure pursuit: signed angle from heading to the look-ahead target.
    const la = p.lookAheadBase + speed * p.lookAheadPerSpeed;
    const tgt = line.lookAhead(pos.x, pos.z, la);
    const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
    const cross = noseX * dz - noseZ * dx;
    const dot   = noseX * dx + noseZ * dz;
    const angle = Math.atan2(cross, dot) + this._steerErr;

    // NOTE: in this vehicle, input.left steers the car toward +x and input.right
    // toward -x (verified empirically). `angle` is +ve when the target is to -x
    // of the heading, so the mapping is intentionally crossed.
    const dead = 0.04;
    this.input.left  = angle < -dead;
    this.input.right = angle > dead;

    // Pace from the corner ahead.
    const c = line.closest(pos.x, pos.z);
    const curv = line.curvatureAt(c.arc + la, 14);
    let targetSpeed = p.maxSpeed * (1 - curv * p.cornerCaution) * p.speedScale * this.banding;
    targetSpeed = Math.max(55, targetSpeed);

    this.input.forward  = speed < targetSpeed;
    this.input.backward = speed > targetSpeed * 1.25;

    // Drift the sharp, fast corners (higher tiers only) — looks alive + scrubs speed.
    this.input.handbrake = p.driftEnabled && curv > 0.32 && speed > 95 && Math.abs(angle) > 0.18;

    // Safety: drifted/knocked far off the line → ease off and let look-ahead reel it back.
    if (c.dist > 22) {
      this.input.handbrake = false;
      this.input.forward  = speed < targetSpeed * 0.55;
      this.input.backward = speed > targetSpeed * 0.7;
    }
  }
}
