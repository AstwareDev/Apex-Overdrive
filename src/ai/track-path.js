/**
 * RacingLine — a closed polyline that defines the course.
 *
 * The physics world is a single flat plane (see world.js): there are no walls or
 * road geometry to follow, so this racing line IS the track. AI cars follow it
 * (pure-pursuit) and the race framework measures lap progress against it.
 *
 * All coordinates are world-space {x, z} (y is the ground plane).
 */
export class RacingLine {
  constructor(points) {
    this.points = points;
    this.n = points.length;
    this.seg = [];   // { x, z, dx, dz (unit dir), len }
    this.cum = [];   // arc length at the start of each segment
    let total = 0;
    for (let i = 0; i < this.n; i++) {
      const a = points[i], b = points[(i + 1) % this.n];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1e-6;
      this.cum.push(total);
      this.seg.push({ x: a.x, z: a.z, dx: dx / len, dz: dz / len, len });
      total += len;
    }
    this.length = total;
  }

  // Nearest point on the polyline → { dist, arc, index, px, pz }
  closest(x, z) {
    let best = { dist: Infinity, arc: 0, index: 0, px: x, pz: z };
    for (let i = 0; i < this.n; i++) {
      const s = this.seg[i];
      const t = Math.max(0, Math.min(s.len, (x - s.x) * s.dx + (z - s.z) * s.dz));
      const px = s.x + s.dx * t, pz = s.z + s.dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.dist) best = { dist: d, arc: this.cum[i] + t, index: i, px, pz };
    }
    return best;
  }

  pointAtArc(arc) {
    arc = ((arc % this.length) + this.length) % this.length;
    for (let i = this.n - 1; i >= 0; i--) {
      if (arc >= this.cum[i]) {
        const s = this.seg[i], t = arc - this.cum[i];
        return { x: s.x + s.dx * t, z: s.z + s.dz * t };
      }
    }
    const s = this.seg[0];
    return { x: s.x, z: s.z };
  }

  // A target point `dist` metres ahead of (x,z) along the line.
  lookAhead(x, z, dist) {
    const c = this.closest(x, z);
    return this.pointAtArc(c.arc + dist);
  }

  // Normalised progress around the loop, 0..1.
  progress(x, z) { return this.closest(x, z).arc / this.length; }

  // Upcoming corner sharpness near `arc`, 0 (straight) .. 1 (hairpin).
  curvatureAt(arc, window = 14) {
    const a = this.pointAtArc(arc);
    const b = this.pointAtArc(arc + window);
    const c = this.pointAtArc(arc + window * 2);
    const d1x = b.x - a.x, d1z = b.z - a.z;
    const d2x = c.x - b.x, d2z = c.z - b.z;
    const l1 = Math.hypot(d1x, d1z) || 1e-6;
    const l2 = Math.hypot(d2x, d2z) || 1e-6;
    const dot = (d1x * d2x + d1z * d2z) / (l1 * l2);
    return Math.acos(Math.max(-1, Math.min(1, dot))) / Math.PI;
  }

  // Unit direction of the first segment (used to orient the start grid).
  startDir() { return { x: this.seg[0].dx, z: this.seg[0].dz }; }
  startPoint() { return { x: this.seg[0].x, z: this.seg[0].z }; }
}

/**
 * A stadium circuit (two straights + two semicircle ends), centred at the
 * origin with its start/finish on the +Z straight so cars start facing +Z
 * (heading 0, matching the car's default spawn orientation). Kept modest so it
 * sits on the flat drift-pad.
 */
export function stadiumLoop({ straight = 46, radius = 26, arcSteps = 12 } = {}) {
  const pts = [];
  const hl = straight / 2;

  pts.push({ x: radius, z: -hl });           // start/finish, +Z straight
  pts.push({ x: radius, z:  hl });
  for (let i = 1; i < arcSteps; i++) {       // top semicircle (+x → -x)
    const a = (i / arcSteps) * Math.PI;
    pts.push({ x: Math.cos(a) * radius, z: hl + Math.sin(a) * radius });
  }
  pts.push({ x: -radius, z:  hl });          // -Z straight
  pts.push({ x: -radius, z: -hl });
  for (let i = 1; i < arcSteps; i++) {       // bottom semicircle (-x → +x)
    const a = Math.PI + (i / arcSteps) * Math.PI;
    pts.push({ x: Math.cos(a) * radius, z: -hl + Math.sin(a) * radius });
  }
  return new RacingLine(pts);
}
