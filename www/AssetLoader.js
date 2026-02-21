import * as PIXI from 'pixi.js';

export class AssetLoader {
    constructor(renderer) {
        this.renderer = renderer;
        // Lista de assets para pré-carregar na GPU
        this.assets = [
            { alias: 'home', src: 'img/home.svg' },
            { alias: 'location', src: 'img/location.svg' },
            { alias: 'notifications', src: 'img/notifications.svg' },
            { alias: 'settings', src: 'img/settings.svg' },
            { alias: 'camera', src: 'img/camera.svg' },
            { alias: 'crop', src: 'img/crop.svg' },
            { alias: 'edit', src: 'img/edit.svg' },
            { alias: 'trash', src: 'img/trash.svg' }
        ];
    }

    async load() {
        console.log('[AssetLoader] Carregando assets para RAM...');

        // FIX: Desativa ImageBitmap para evitar texturas pretas em alguns dispositivos Android/WebView
        // O ganho de performance é marginal comparado ao risco de compatibilidade aqui.
        if (PIXI.Assets && PIXI.Assets.loader) {
            const loadTextures = PIXI.Assets.loader.parsers.find(p => p.name === 'loadTextures');
            if (loadTextures && loadTextures.config) {
                loadTextures.config.preferCreateImageBitmap = false;
            }
        }
        
        // Helper para redimensionar imagem para POT (Power of Two)
        const resizeToPOT = (img) => {
            const nextPOT = (v) => Math.pow(2, Math.ceil(Math.log(v) / Math.log(2)));
            const width = nextPOT(img.width);
            const height = nextPOT(img.height);
            
            if (img.width === width && img.height === height) return img;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            return canvas;
        };

        // Hook para processar texturas antes do upload
        PIXI.Assets.loader.parsers.push({
            extension: {
                type: PIXI.ExtensionType.LoadParser,
                priority: PIXI.LoaderParserPriority.High,
            },
            test: (url) => /\.(jpg|jpeg|png|webp)$/i.test(url),
            load: async (url) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = url;
                await new Promise(r => img.onload = r);
                const potImg = resizeToPOT(img);
                return PIXI.Texture.from(potImg);
            }
        });

        // 1. Carrega Assets para a RAM com Retry System
        const loadAsset = async (asset) => {
            for (let i = 0; i < 3; i++) {
                try {
                    // Timeout de 5s para evitar hang infinito
                    const loadPromise = PIXI.Assets.load(asset);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
                    
                    await Promise.race([loadPromise, timeoutPromise]);
                    return;
                } catch (e) {
                    console.warn(`[AssetLoader] Retry ${i+1}/3 for ${asset.alias} (${e.message})`);
                    await new Promise(r => setTimeout(r, 500));
                }
            }
            console.error(`[AssetLoader] Failed to load ${asset.alias} after 3 attempts.`);
        };

        await Promise.all(this.assets.map(asset => loadAsset(asset)));

        // Proteção: Se o Renderer falhou ao iniciar (ex: sem WebGL), pula o upload para GPU
        if (!this.renderer || !this.renderer.app || !this.renderer.app.renderer || this.renderer.contextLost) {
            console.warn('[AssetLoader] Renderer não disponível. Pulando upload para GPU.');
            return;
        }

        // 2. Upload Forçado para a GPU (VRAM) - "Pre-loading animations"
        // Criamos um container temporário com todos os sprites para obrigar o Pixi a enviar para a GPU
        const container = new PIXI.Container();
        this.assets.forEach(asset => {
            const texture = PIXI.Assets.get(asset.alias);
            if (texture) {
                const sprite = new PIXI.Sprite(texture);
                container.addChild(sprite);
            }
        });

        // Usa o plugin 'prepare' para upload síncrono/assíncrono para a placa de vídeo
        return new Promise((resolve) => {
            this.renderer.app.renderer.prepare.upload(container, () => {
                console.log('[AssetLoader] Assets enviados para a VRAM (GPU). Pronto para 120 FPS.');
                container.destroy({ children: true }); // Limpa o container auxiliar, mantém texturas na VRAM
                resolve();
            });
        });
    }
}