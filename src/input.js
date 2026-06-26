export class InputHandler {
  constructor() {
    this.keys = {};
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
  }

  get forward()    { return !!(this.keys['KeyW']     || this.keys['ArrowUp']); }
  get backward()   { return !!(this.keys['KeyS']     || this.keys['ArrowDown']); }
  get left()       { return !!(this.keys['KeyA']     || this.keys['ArrowLeft']); }
  get right()      { return !!(this.keys['KeyD']     || this.keys['ArrowRight']); }
  get handbrake()  { return !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']); }
  get boost()      { return !!(this.keys['Space']); }
  get reset()      { return !!(this.keys['KeyR']); }
  get camera()     { return !!(this.keys['KeyC']); }
  get shiftUp()    { return !!(this.keys['KeyE']); }
  get shiftDown()  { return !!(this.keys['KeyQ']); }
  get gearToggle() { return !!(this.keys['Tab']); }
}
