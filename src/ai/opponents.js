import { Car } from '../car.js';
import { AIController, AI_PROFILES } from './ai-controller.js';

/**
 * Start-grid positions staggered behind the line's start point, two per row,
 * all facing along the first segment. Returns { x, z, heading } for `count` cars.
 */
export function gridPositions(line, count, { rowGap = 7, lane = 2.2 } = {}) {
  const start = line.startPoint();
  const dir = line.startDir();                       // unit forward
  const heading = Math.atan2(dir.x, dir.z);          // car nose is local +z
  const rightX = dir.z, rightZ = -dir.x;             // perpendicular
  const out = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 2);
    const col = (i % 2) ? 1 : -1;
    const back = rowGap * (row + 1);                  // behind the start line
    out.push({
      x: start.x - dir.x * back + rightX * lane * col,
      z: start.z - dir.z * back + rightZ * lane * col,
      heading,
    });
  }
  return out;
}

/**
 * Opponents — spawns N AI cars (each a real Car driven by an AIController) and
 * steps them inside the game's fixed-step loop. Reuses the already-loaded car
 * model by cloning its scene (no extra GLB downloads).
 */
export class Opponents {
  constructor(world, scene, carGltf, line, { spawnY, grid, profiles = [] } = {}) {
    this.line = line;
    this.cars = [];   // { car, controller, label }

    grid.forEach((g, i) => {
      const car = new Car(world, scene, spawnY, g);
      if (carGltf?.scene) {
        // Clone the pristine model (shares geometry; model is static so a deep
        // clone is safe — no skinned meshes to rebind).
        car.attachModel({ scene: carGltf.scene.clone(true) });
      }
      const key = profiles[i] || 'medium';
      const controller = new AIController(car, line, AI_PROFILES[key] || AI_PROFILES.medium);
      this.cars.push({ car, controller, label: `CPU ${i + 1}`, profile: key });
    });
  }

  // Run AI decisions + physics for every opponent (call once per fixed step,
  // before world.step()).
  update(dt) {
    for (const ai of this.cars) {
      ai.controller.update(dt);
      ai.car.update(ai.controller.input, dt);
    }
  }

  reset() {
    for (const ai of this.cars) ai.car.reset();
  }
}

/**
 * RaceTracker — lap counting, progress and live position for all cars (player
 * included), measured against the racing line. No physics triggers needed.
 */
export class RaceTracker {
  constructor(line, totalLaps = 3) {
    this.line = line;
    this.totalLaps = totalLaps;
    this.entries = [];
  }

  register(car, label) {
    const p = this.line.progress(car.position.x, car.position.z);
    const e = { car, label, lap: 0, prog: p, lastProg: p, half: false, total: 0, position: 1 };
    this.entries.push(e);
    return e;
  }

  update() {
    for (const e of this.entries) {
      const p = this.line.progress(e.car.position.x, e.car.position.z);
      // A lap counts only after passing the half-way mark then crossing the
      // start line (high progress → low progress), preventing the initial
      // grid-to-line roll and any back-and-forth from scoring a lap.
      if (e.half && e.lastProg > 0.7 && p < 0.3) { e.lap++; e.half = false; }
      if (p > 0.45 && p < 0.55) e.half = true;
      e.prog = p; e.lastProg = p;
      e.total = e.lap + p;
    }
    const ranked = [...this.entries].sort((a, b) => b.total - a.total);
    ranked.forEach((e, i) => { e.position = i + 1; });
  }

  // Optional, off by default. A small, slowly-ramped speed nudge on AI cars to
  // keep races close. Capped low and applied only to the AI's target speed (never
  // physics forces) so it can never look like impossible acceleration.
  applyBanding(opponents, playerCar, maxPct = 0.05) {
    const pe = this.entries.find(e => e.car === playerCar);
    if (!pe) return;
    for (const ai of opponents.cars) {
      const ae = this.entries.find(e => e.car === ai.car);
      if (!ae) continue;
      const gap = pe.total - ae.total;                       // + = AI behind player
      const target = 1 + Math.max(-maxPct, Math.min(maxPct, gap * 0.5));
      ai.controller.banding += (target - ai.controller.banding) * 0.02;  // slow ramp
    }
  }

  getFor(car) {
    const e = this.entries.find(c => c.car === car);
    if (!e) return null;
    return {
      position: e.position,
      lap: Math.min(this.totalLaps, e.lap + 1),
      totalLaps: this.totalLaps,
      totalCars: this.entries.length,
    };
  }

  reset() {
    for (const e of this.entries) {
      const p = this.line.progress(e.car.position.x, e.car.position.z);
      e.lap = 0; e.prog = p; e.lastProg = p; e.half = false; e.total = 0;
    }
  }
}
