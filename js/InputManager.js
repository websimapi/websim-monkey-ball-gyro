export class InputManager {
    constructor() {
        this.tilt = { x: 0, y: 0 };
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, a: false, s: false, d: false };
        
        // Gyro
        window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
        
        // Keyboard fallback
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }

    handleOrientation(event) {
        // beta: x-axis (-180 to 180) - Forward/Back
        // gamma: y-axis (-90 to 90) - Left/Right
        
        let x = event.gamma; // Left/Right
        let y = event.beta;  // Forward/Back
        
        // Handle landscape modes quirks if necessary, but standard locking usually works
        // Normalize to -1...1 for about 45 degrees tilt
        
        const maxTilt = 30;
        
        if (x === null || y === null) return; // Desktop
        
        this.tilt.x = Math.max(-1, Math.min(1, x / maxTilt));
        this.tilt.y = Math.max(-1, Math.min(1, (y - 30) / maxTilt)); // Bias y by 30 deg for comfortable holding angle? 
        // Actually for a flat game, user holds phone flat (beta ~ 0).
        // Let's assume flat hold.
        this.tilt.y = Math.max(-1, Math.min(1, y / maxTilt));
    }

    getInput() {
        // Combine gyro and keyboard
        let x = this.tilt.x;
        let y = this.tilt.y;
        
        // Keyboard overrides if present
        if (this.keys.ArrowRight || this.keys.d) x = 0.5;
        if (this.keys.ArrowLeft || this.keys.a) x = -0.5;
        if (this.keys.ArrowUp || this.keys.w) y = -0.5;
        if (this.keys.ArrowDown || this.keys.s) y = 0.5;
        
        return { x, y };
    }
}

