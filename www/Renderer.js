import * as PIXI from 'pixi.js';

export class Renderer {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.canvas = document.getElementById(canvasId);
        this.currentTier = 0;
        this.contextLost = false;
        this.tiers = [
            { name: 'WebGL2 High', settings: { powerPreference: 'high-performance', antialias: false, preserveDrawingBuffer: false, resolution: 1 } },
            { name: 'WebGL1 Default', settings: { powerPreference: 'default', antialias: false, preserveDrawingBuffer: false, resolution: 0.85 } },
            { name: 'WebGL Low', settings: { powerPreference: 'low-power', antialias: false, resolution: 0.75 } },
            { name: 'Canvas Fallback', settings: { forceCanvas: true, resolution: 0.5 } }
        ];

        // Singleton check for PIXI App
        if (window.__PIXI_APP__) {
            this.app = window.__PIXI_APP__;
        } else {
            this.app = null;
        }
        
        // Configurações Globais PIXI para Mobile (Performance)
        PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.MEDIUM;
        PIXI.settings.MIPMAP_TEXTURES = PIXI.MIPMAP_MODES.OFF;
        PIXI.settings.ANISOTROPIC_LEVEL = 0;
        PIXI.settings.GC_MODE = PIXI.GC_MODES.AUTO;

        // 🔴 1 — BLOQUEAR CONTEXT LOSS
        this.canvas.addEventListener(
            'webglcontextlost',
            (e) => {
                console.warn('[Renderer] 🚨 WebGL Context LOST');
                e.preventDefault();
                this.handleContextLoss();
            },
            false
        );

        this.canvas.addEventListener(
            'webglcontextrestored',
            () => {
                console.warn('[Renderer] ✅ WebGL Context RESTORED');
                this.handleContextRestore();
            },
            false
        );
    }

    async init(forceReinit = false, startTier = 0) {
        if (this.app && !forceReinit) {
            console.log('[Renderer] PIXI App already initialized. Skipping.');
            return;
        }
        return this.attemptInitTier(startTier);
    }

    async attemptInitTier(tierIndex) {
        if (tierIndex >= this.tiers.length) {
            console.error('[Renderer] Fatal: Todos os tiers gráficos falharam.');
            return;
        }

        this.currentTier = tierIndex;
        const tier = this.tiers[tierIndex];
        console.log(`[Renderer] Tentando inicializar Tier ${tierIndex}: ${tier.name}`);

        if (window.__PIXI_APP__) {
            try { window.__PIXI_APP__.destroy(true, { children: true, texture: true, baseTexture: true }); } catch (e) {}
            window.__PIXI_APP__ = null;
            this.app = null;
        }

        try {
            this.app = new PIXI.Application({
                view: this.canvas,
                resizeTo: window,
                // CAP de resolução em 1.0 para garantir 60fps em dispositivos intermediários
                // Telas retina (2x, 3x) matam a performance de fill-rate em mobile
                resolution: tier.settings.resolution || Math.min(window.devicePixelRatio || 1, 1), 
                autoDensity: true,
                backgroundColor: 0x000000,
                backgroundAlpha: 0, // Permite que o fundo CSS apareça
                clearBeforeRender: true,
                autoStart: false,
                ...tier.settings
            });

            window.__PIXI_APP__ = this.app;
            
            // Benchmark rápido
            const fps = await this.runBenchmark();
            console.log(`[Renderer] Benchmark Tier ${tierIndex}: ${fps.toFixed(1)} FPS`);

            if (fps < 30 && tierIndex < this.tiers.length - 1) {
                console.warn('[Renderer] Performance insuficiente. Downgrading...');
                return this.attemptInitTier(tierIndex + 1);
            }

            console.log(`[Renderer] Engine Gráfica Pronta: ${tier.name}`);

        } catch (e) {
            console.error(`[Renderer] Falha no Tier ${tierIndex}:`, e);
            return this.attemptInitTier(tierIndex + 1);
        }
    }

    runBenchmark() {
        return new Promise(resolve => {
            if (!this.app || !this.app.renderer) {
                resolve(0);
                return;
            }
            
            let frames = 0;
            const start = performance.now();
            const dummy = new PIXI.Container(); // Renderiza algo vazio
            
            const tick = () => {
                frames++;
                this.app.renderer.render(dummy);
                if (frames < 10) {
                    requestAnimationFrame(tick);
                } else {
                    const duration = performance.now() - start;
                    const fps = (frames / duration) * 1000;
                    resolve(fps);
                }
            };
            tick();
        });
    }

    handleContextLoss() {
        this.contextLost = true;
        console.warn('[Renderer] Contexto perdido. Parando aplicação...');
        if (this.app) {
            this.app.stop();
        }
        // Notify Engine to stop loop immediately to prevent freeze
        if (window.__ENGINE__ && window.__ENGINE__.loop) {
            window.__ENGINE__.loop.stop();
        }
    }

    async handleContextRestore() {
        if (!this.contextLost) return;

        console.warn(`[Renderer] Reinitializing GPU Pipeline (Starting at Tier ${this.currentTier})...`);

        this.contextLost = false;

        if (this.app && this.app.renderer) {
            try { this.app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch (e) {}
            this.app = null;
        }

        // Tenta restaurar mantendo o tier atual.
        // Se a performance cair (< 30 FPS), o attemptInitTier fará o downgrade automaticamente.
        await this.init(true, this.currentTier);

        console.warn('[Renderer] GPU Pipeline Recovered');
        
        // Reinicia o loop se o Engine estiver disponível
        if (window.__ENGINE__ && window.__ENGINE__.loop) {
            window.__ENGINE__.loop.start();
        }
    }

    resize() {
        if (this.app && this.app.renderer) {
            // PixiJS lida com isso via resizeTo, mas podemos forçar atualização
            this.app.renderer.resize(window.innerWidth, window.innerHeight);
        }
    }

    render() {
        if (this.contextLost) return;
        if (this.app && this.app.renderer) {
            this.app.render();
        }
    }

    clear() {
        if (this.app && this.app.stage) {
            this.app.stage.removeChildren();
        }
    }

    // Método placeholder para desenhar entidades
    drawEntities(entities) {
        // Em PixiJS, idealmente usamos Scene Graph (adicionar sprites ao stage)
        // em vez de desenhar a cada frame.
    }
}