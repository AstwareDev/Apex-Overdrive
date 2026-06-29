import * as THREE from 'three';

/**
 * VFX — tyre smoke particles emitted from the rear wheels while drifting.
 *
 * Lives in the 3D layer (it adds objects to the scene), and is driven each
 * frame by the game with the rear-wheel world positions and a 0..1 drift
 * intensity. A pooled THREE.Points cloud keeps it cheap.
 */
export class VFX {
  constructor(scene, max = 600) {
    this.scene = scene;
    this.max = max;
    this.cursor = 0;
    this._tmp = new THREE.Vector3();

    // Per-particle CPU state
    this.life   = new Float32Array(max);   // remaining seconds
    this.maxLife = new Float32Array(max);
    this.vel    = new Float32Array(max * 3);

    this.positions = new Float32Array(max * 3);
    this.sizes     = new Float32Array(max);
    this.alphas    = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('alpha',    new THREE.BufferAttribute(this.alphas, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTex: { value: makeSmokeTexture() } },
      vertexShader: /* glsl */`
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(0.82, 0.82, 0.85, t.a * vAlpha);
        }`,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this._initSparks(scene);
  }

  // Tiered drift-charge sparks: a small additive, coloured Points pool. Streams
  // while the drift charge is building (colour = current tier) and bursts on a
  // boost release — the visible feedback that makes the charge loop addictive.
  _initSparks(scene, max = 240) {
    this.sMax    = max;
    this.sCursor = 0;
    this.sLife    = new Float32Array(max);
    this.sMaxLife = new Float32Array(max);
    this.sVel     = new Float32Array(max * 3);
    this.sPos     = new Float32Array(max * 3);
    this.sSize    = new Float32Array(max);
    this.sAlpha   = new Float32Array(max);
    this.sColor   = new Float32Array(max * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(this.sSize, 1));
    geo.setAttribute('alpha',    new THREE.BufferAttribute(this.sAlpha, 1));
    geo.setAttribute('color',    new THREE.BufferAttribute(this.sColor, 3));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: makeSmokeTexture() } },
      vertexShader: /* glsl */`
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = alpha; vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }`,
    });

    this.sparks = new THREE.Points(geo, mat);
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3[]} emitters  rear-wheel world positions
   * @param {number} chargeTier 0..3 live drift-charge tier (steady stream)
   * @param {number} burstTier  >0 = fire a one-shot burst of this tier
   */
  updateSparks(dt, emitters = [], chargeTier = 0, burstTier = 0) {
    if (chargeTier > 0) {
      const rate = chargeTier;                       // 1..3 per wheel per frame
      for (const e of emitters)
        for (let n = 0; n < rate; n++) this._spawnSpark(e, chargeTier, 1);
    }
    if (burstTier > 0) {
      const n = 20 + burstTier * 14;
      for (const e of emitters)
        for (let i = 0; i < n; i++) this._spawnSpark(e, burstTier, 2.4);
    }

    for (let i = 0; i < this.sMax; i++) {
      if (this.sLife[i] <= 0) { this.sAlpha[i] = 0; continue; }
      this.sLife[i] -= dt;
      const i3 = i * 3;
      this.sPos[i3]     += this.sVel[i3]     * dt;
      this.sPos[i3 + 1] += this.sVel[i3 + 1] * dt;
      this.sPos[i3 + 2] += this.sVel[i3 + 2] * dt;
      this.sVel[i3 + 1] -= 6.0 * dt;                 // gravity — sparks arc down

      const t = Math.max(0, this.sLife[i] / this.sMaxLife[i]);
      this.sAlpha[i] = t;
      this.sSize[i]  = 0.25 + t * 0.55;
    }

    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.size.needsUpdate = true;
    this.sparks.geometry.attributes.alpha.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;
  }

  _spawnSpark(pos, tier, energy) {
    const i = this.sCursor;
    this.sCursor = (this.sCursor + 1) % this.sMax;
    const i3 = i * 3;

    this.sPos[i3]     = pos.x + rand(0.15);
    this.sPos[i3 + 1] = pos.y + 0.15;
    this.sPos[i3 + 2] = pos.z + rand(0.15);

    this.sVel[i3]     = rand(2.5) * energy;
    this.sVel[i3 + 1] = 1.5 + Math.random() * 2.5 * energy;
    this.sVel[i3 + 2] = rand(2.5) * energy;

    const c = TIER_COLORS[tier] || TIER_COLORS[1];
    this.sColor[i3]     = c[0];
    this.sColor[i3 + 1] = c[1];
    this.sColor[i3 + 2] = c[2];

    this.sMaxLife[i] = 0.25 + Math.random() * 0.3;
    this.sLife[i]    = this.sMaxLife[i];
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3[]} emitters  world positions to spawn smoke from
   * @param {number} intensity 0..1 drift intensity (0 = no emission)
   */
  update(dt, emitters = [], intensity = 0) {
    // Emit
    if (intensity > 0.06) {
      const rate = Math.floor(intensity * 14) + 1;   // particles/frame per wheel
      for (const e of emitters) {
        for (let n = 0; n < rate; n++) this._spawn(e, intensity);
      }
    }

    // Integrate + write buffers
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alphas[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      this.positions[i3]     += this.vel[i3]     * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      this.vel[i3 + 1] += 0.6 * dt;   // drift upward

      const t = Math.max(0, this.life[i] / this.maxLife[i]); // 1 → 0
      this.alphas[i] = t * 0.5;
      this.sizes[i]  = 0.6 + (1 - t) * 2.4;   // grow as it dissipates
    }

    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;
    this.points.geometry.attributes.alpha.needsUpdate = true;
  }

  _spawn(pos, intensity) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;

    this.positions[i3]     = pos.x + rand(0.2);
    this.positions[i3 + 1] = pos.y + 0.1;
    this.positions[i3 + 2] = pos.z + rand(0.2);

    this.vel[i3]     = rand(1.2);
    this.vel[i3 + 1] = 0.4 + Math.random() * 0.8;
    this.vel[i3 + 2] = rand(1.2);

    this.maxLife[i] = 0.5 + Math.random() * 0.6 + intensity * 0.3;
    this.life[i]    = this.maxLife[i];
  }
}

// Mini-turbo style tier palette: tier1 blue → tier2 orange → tier3 purple
const TIER_COLORS = {
  1: [0.30, 0.65, 1.00],
  2: [1.00, 0.60, 0.20],
  3: [0.78, 0.35, 1.00],
};

function rand(s) { return (Math.random() - 0.5) * 2 * s; }

function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
