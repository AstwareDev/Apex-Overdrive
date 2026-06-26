import { Game }          from './game.js';
import { mountHUD }      from './ui/hud.js';
import { mountFxOverlay } from './ui/fx-overlay.js';
import { AudioManager }  from './audio/audio.js';

// Bootstrap: wire the engine to the default UI, then start.
// The engine (game.js + car/world/camera/input) is fully UI-agnostic.
// To use a different UI framework, replace the mountHUD line with your own
// renderer that subscribes to the game's events (see API docs in game.js).
const game = new Game(document.getElementById('game'));

mountHUD(game, document.getElementById('ui-root'));
mountFxOverlay(game);    // speed-lines / vignette / boost tint (sense of speed)
new AudioManager(game);  // sampled SFX + music (starts on first key/click)

await game.start();

// Dev-only handle for debugging in the browser console (stripped from prod build)
if (import.meta.env.DEV) window.__game = game;
