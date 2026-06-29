# UI Integration Guide

The game engine is **fully decoupled** from the UI. The engine renders only the
3D WebGL canvas and publishes state through an event API. All HUD/menus/overlays
are a separate, swappable layer.

## Architecture

```
index.html
 ├─ #game      → engine mounts the WebGL <canvas> here   (do not touch)
 └─ #ui-root   → UI overlay renders here                  (your layer)

src/
 ├─ game.js          ← engine entry. Owns renderer, physics, loop. UI-agnostic.
 ├─ car.js, world.js, camera.js, input.js   ← engine internals
 ├─ ui/              ← DEFAULT UI (replaceable). Delete to use your own.
 │   ├─ hud.js
 │   └─ hud.css
 └─ main.js          ← bootstrap: creates Game + mounts a UI
```

The engine **never reads the DOM**, and the UI **never reads engine internals** —
they only communicate through events. So you can replace the UI without editing
any engine file.

## Engine API (`src/game.js`)

```js
const game = new Game(document.getElementById('game'));

// Subscribe (each returns an unsubscribe function)
game.on('loading',      ({ progress, message }) => {});  // progress 0–100
game.on('ready',        () => {});                        // assets loaded, loop running
game.on('tick',         (state) => {});                   // every rendered frame
game.on('camerachange', ({ mode }) => {});                // camera view switched
game.on('audiochange',  ({ muted, musicEnabled }) => {}); // sound/music toggled

game.getState();     // snapshot, same shape as the 'tick' payload
game.cycleCamera();  // change camera view (also bound to C)
game.reset();        // respawn the car (also bound to R)

await game.start();  // load assets and start the loop
```

### State shape (the `tick` payload / `getState()`)

```js
{
  phase: 'loading' | 'ready',
  loading: { progress: Number, message: String },
  speed: Number,        // km/h, rounded
  speedRaw: Number,     // km/h, unrounded
  maxSpeed: Number,     // useful for gauges/bars
  gear: String,         // 'N', '1'..'6'
  cameraMode: String,   // e.g. 'CHASE CAM'
  throttle: Boolean,    // accelerator held
  braking: Boolean,     // brake/reverse held
  handbrake: Boolean,   // handbrake held
  steer: Number,        // current steering angle (rad), signed
}
```

## Audio

Procedural audio lives in `src/audio/audio.js` (a consumer like the UI — it just
subscribes to `tick`). No asset files are needed; engine note, tyre screech and
music are synthesised. Keys: **M** mute, **N** music. To use real audio files,
replace the synthesis inside the `_build*` / `_onTick` methods — the game wiring
stays the same.

## Replacing the UI with another framework

1. Render your app into `#ui-root` (it sits above the canvas; the canvas in
   `#game` stays untouched).
2. Subscribe to the events above to drive your UI.
3. Call `game.cycleCamera()` / `game.reset()` from your own buttons if you want.
4. Delete `src/ui/` and drop the `mountHUD(...)` line in `src/main.js`.

### Example — React

```jsx
import { useEffect, useState } from 'react';

function Hud({ game }) {
  const [s, setS] = useState(game.getState());
  useEffect(() => game.on('tick', setS), [game]);   // on() returns the unsubscribe
  return (
    <div className="hud">
      <div className="speed">{s.speed}<small>km/h</small></div>
      <div className="gear">{s.gear}</div>
      <button onClick={() => game.cycleCamera()}>{s.cameraMode}</button>
    </div>
  );
}
```

```js
// main.js
import { createRoot } from 'react-dom/client';
const game = new Game(document.getElementById('game'));
createRoot(document.getElementById('ui-root')).render(<Hud game={game} />);
await game.start();
```

Same pattern works for Vue, Svelte, Solid, or plain JS — they all just subscribe
to `game.on(...)` and render into `#ui-root`.
