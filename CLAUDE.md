# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start Vite dev server (HMR)
npm run build    # production bundle
npm run preview  # serve the production build locally
```

No test runner or linter is configured. The app is a browser game — verify changes by running the dev server and observing behavior in the browser.

In DEV mode, the game instance is exposed as `window.__game` for console debugging. The preview tab pauses `requestAnimationFrame` when hidden; step the sim manually via `window.__game` rather than relying on the preview tab being active.

## Architecture

The project is a browser-based 3D racing game using **Three.js** (rendering) and **cannon-es** (physics). It is bundled by **Vite** as an ES module project.

### Entry & wiring (`src/main.js`)

`main.js` bootstraps everything: it creates a `Game`, mounts the HUD and FX overlay, creates the `AudioManager`, then calls `game.start()`. The engine (`Game`) is fully UI-agnostic — it publishes state via a DOM `EventTarget`-based API and the UI/audio layers subscribe to it.

### `Game` — the headless engine (`src/game.js`)

Central class. Owns the WebGL renderer, `THREE.Scene`, `CANNON.World`, `Car`, `InputHandler`, `CameraController`, `VFX`, `Opponents`, and `RaceTracker`.

**Event API** (anything can subscribe without touching the engine):
- `loading` — `{ progress, message }` during asset load
- `ready` — emitted once, when the loop begins
- `tick` — emitted every rendered frame with the full state snapshot
- `camerachange`, `gearmodechange`, `audiochange`

**State snapshot** on `tick` includes: `speed`, `gear`, `gearMode`, `manualGear`, `throttle`, `braking`, `handbrake`, `steer`, `drift`, `isDrifting`, `charge` (0–1), `chargeTier` (0–3), `boosting`, `boostTier`, `boostJustFired`, `lap`, `totalLaps`, `position`, `totalCars`.

The game loop runs **fixed-step physics at 120 Hz** (`1/120` s) with a variable render step capped at 50 ms to avoid spiral-of-death on tab hide/show.

### `Car` (`src/car.js`)

Uses `CANNON.RaycastVehicle` with 4 wheels. The car **nose faces local +z** — all directional math assumes this.

Key subsystems:
- **Steering**: speed-sensitive max steer angle; rate slows while drifting to prevent snap-rotation. Counter-steer assist auto-catches slides when the player isn't steering.
- **Drift**: handbrake-only (rear grip drops to `driftGrip`). Natural cornering grip loss does not register as a drift.
- **Drift→boost charge** (the core mechanic): holding a drift charges a meter; releasing fires a tiered speed boost (tier 1–3, Mario Kart mini-turbo style). Straightening mid-drift bleeds charge to prevent banking. Boost also lifts the speed governor.
- **Gear modes**: `auto` (continuous accel, cosmetic gear display) and `manual` (speed capped per gear via `GEAR_SPEEDS`, faster throttle ramp). `Tab` toggles; `Q`/`E` shift.
- **Weight transfer**: estimated from low-passed chassis acceleration, shifts grip front↔rear on accel/brake/corner.
- **Progressive slip curve**: full grip up to `slipPeak`, smooth shoulder to `gripFloor` — forgiving but readable.

Exported constant `GEAR_SPEEDS = [0, 30, 60, 90, 130, 170, 220]` (km/h ceilings, index 0 unused).

### `InputHandler` (`src/input.js`)

Raw `keydown`/`keyup` tracking. Boolean getters: `forward`, `backward`, `left`, `right`, `handbrake`, `reset`, `camera`, `shiftUp`, `shiftDown`, `gearToggle`.

**Crossed steering sign**: `input.left` steers the car toward +x; `input.right` steers toward −x. This is intentional and verified empirically. The AI controller accounts for this explicitly (see the comment in `ai-controller.js`).

### `CameraController` (`src/camera.js`)

Three modes cycled with `C`: `chase` (lagged follow, leads slides), `hood` (driver POV), `orbit` (rotating around the car). Speed-based FOV widening is applied in `game.js`'s loop, not here.

### `VFX` (`src/vfx.js`)

Two pooled `THREE.Points` clouds with custom `ShaderMaterial`:
- **Smoke** — emitted from rear wheels while drifting; grows and fades over lifetime.
- **Sparks** — additive blending, tiered colors (blue/orange/purple); streams during charge, bursts on boost release.

### World setup (`src/world.js`)

- Physics gravity is **−20 m/s²** (not −9.8) — all force/slip calculations are tuned around this.
- The drivable surface is a single **analytic `CANNON.Plane`** positioned at the track's measured surface height. The full track GLB is NOT trimeshed (too slow); only the visual mesh is loaded.
- Track GLB is auto-scaled to ~300 world units and centered at origin.
- Car GLB is auto-scaled to a 4.8-unit length and centered on the chassis.

### AI (`src/ai/`)

- **`track-path.js`**: `RacingLine` — closed polyline with arc-length parameterization. `stadiumLoop()` generates the stadium oval used at runtime. The racing line defines the track for both AI navigation and lap counting (no physical walls exist).
- **`ai-controller.js`**: `AIController` — pure-pursuit steering toward a speed-scaled look-ahead point. Pace from upcoming curvature. Three profiles: `easy`, `medium`, `hard`. AI cars use identical `Car` physics; difficulty comes from driving decisions only.
- **`opponents.js`**: `Opponents` spawns AI cars sharing the loaded car GLB (cloned scene). `RaceTracker` tracks laps and positions for all cars using progress along the racing line.

### UI layer (`src/ui/`)

- **`hud.js`**: `mountHUD(game, root)` — injects HTML/CSS HUD and subscribes to game events. Returns `{ destroy() }`.
- **`fx-overlay.js`**: `mountFxOverlay(game)` — DOM-only speed vignette, speed lines, and boost tint. Zero WebGL cost.
- **`hud.css`**: all HUD styling.

### Audio (`src/audio/audio.js`)

Web Audio API. Unlocked on first user gesture. Engine sample pitch-shifted by RPM; skid loop gated by drift intensity. Boost whoosh and gear-blip are synthesized (no extra assets). `M` = mute, `N` = music toggle. Audio files live in `public/audio/`.
