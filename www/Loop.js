/**
 * Main Loop de alta precisão.
 * Gerencia requestAnimationFrame e DeltaTime.
 */
export class Loop {
    constructor(callback) {
        this.callback = callback;
        this.running = false;
        this.lastTime = 0;
        this.accumulatedTime = 0;
        this.rafId = null;
        
        // Bind para manter contexto
        this.tick = this.tick.bind(this);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.rafId = requestAnimationFrame(this.tick);
        console.log('[Loop] Started');
    }

    stop() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        console.log('[Loop] Stopped');
    }

    tick(timestamp) {
        if (!this.running) return;

        // Proteção contra timestamps malucos (ex: retorno de background)
        if (timestamp < this.lastTime) this.lastTime = timestamp;

        // Cálculo de Delta Time em segundos
        const deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Clamp do DeltaTime para evitar espiral da morte em lags extremos (max 100ms)
        const dt = (deltaTime > 0.1) ? 0.1 : deltaTime;

        if (typeof this.callback === 'function') {
            this.callback(dt, timestamp);
        }

        this.rafId = requestAnimationFrame(this.tick);
    }
}