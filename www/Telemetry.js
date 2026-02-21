import { UIQueueManager } from './UIQueueManager.js';

export class Telemetry {
    constructor(domElement) {
        this.el = domElement;
        this.frames = 0;
        this.lastTime = performance.now();
        this.fps = 60;
        this.frameTime = 0;
        this.entityCount = 0;
        
        // Throttle de atualização de DOM (apenas 2x por segundo)
        this.updateInterval = 500; 
        this.timer = 0;

        // Monitoramento de Memória
        this.lastHeapSize = 0;
        this.growthCounter = 0;
    }

    init() {
        // Ativa visualização se estiver em modo debug
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            if (this.el) this.el.style.display = 'block';
        }
    }

    update(dt, entityCount) {
        this.frames++;
        this.timer += dt * 1000;
        this.frameTime = dt * 1000;
        this.entityCount = entityCount;

        if (this.timer > this.updateInterval) {
            const now = performance.now();
            this.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
            this.lastTime = now;
            this.frames = 0;
            this.timer = 0;
            this.renderDOM();
            this.checkMemoryLeak();
        }
    }

    checkMemoryLeak() {
        if (performance.memory) {
            const currentHeap = performance.memory.usedJSHeapSize;
            if (currentHeap > this.lastHeapSize) {
                this.growthCounter++;
            } else {
                this.growthCounter = 0;
            }
            this.lastHeapSize = currentHeap;

            if (this.growthCounter > 5) {
                console.warn('[Telemetry] ⚠️ Possible Memory Leak Detected: JS Heap growing continuously.');
                
                // Tenta forçar GC se estiver em modo debug e disponível
                if (window.gc) {
                    console.log('[Telemetry] Forcing Garbage Collection...');
                    window.gc();
                    this.growthCounter = 0; // Reseta contador após tentativa
                }
            }
        }
    }

    renderDOM() {
        // Acesso a performance.memory é Chrome-only, fallback seguro
        const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 'N/A';

        UIQueueManager.schedule(() => {
            if (this.el) {
                this.el.textContent = 
`FPS: ${this.fps}
FT:  ${this.frameTime.toFixed(2)}ms
ENT: ${this.entityCount}
MEM: ${mem}MB
RES: ${window.innerWidth}x${window.innerHeight}
GPU: ACTIVE`;
                
                // Alerta visual de performance
                this.el.style.color = (this.fps < 55) ? '#ff0000' : '#00ff00';
            }
        });
    }
}