import { Loop } from './Loop.js';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { Telemetry } from './Telemetry.js';
import { UIManager } from './UIManager.js';
import { AssetLoader } from './AssetLoader.js';
import { PushNotifications } from '@capacitor/push-notifications';

export class Engine {
    constructor() {
        // FASE 2: Safe Constructor - Zero Logic
        this.renderer = null;
        this.input = null;
        this.telemetry = null;
        this.loop = null;
        this.ui = null;
        this.repairAttempts = 0;
        this.healthCheckInterval = null;
        this.started = false;
    }

    async init() {
        console.log('[Engine] Safe Init Sequence Started...');
        try {
            this.renderer = new Renderer('gl-canvas');
            await this.renderer.init(); // 🎮 WebGL Performance Ladder

            this.input = new Input(document.body);
            this.input.init(); // ✅ Init explícito

            this.telemetry = new Telemetry(document.getElementById('telemetry'));
            this.telemetry.init(); // ✅ Init explícito

            this.loop = new Loop((dt, timestamp) => {
                // Só atualiza se o renderer estiver saudável
                if (this.renderer && !this.renderer.contextLost) {
                    this.safeUpdate(dt, timestamp);
                }
            });
            
            this.ui = new UIManager();
            await this.ui.init(); // 🔄 ENGINE FIX: Await UI Init
            
            this.initLifecycle();

            if (window.cordova) {
                this.setupNative();
            }
        } catch (e) {
            console.error('[Engine] Fatal Init Error:', e);
            this.EngineSelfRepairCycle();
        }
    }

    EngineSelfRepairCycle() {
        this.repairAttempts++;
        console.warn(`[Engine] 🚨 SELF REPAIR CYCLE (Attempt ${this.repairAttempts}) 🚨`);

        if (this.repairAttempts > 3) {
            this.showCriticalErrorModal();
            return;
        }

        // 1. Tenta recuperar Renderer
        if (this.renderer && !this.renderer.app) {
            this.renderer.init(true); // Force Canvas
        }
        // 2. Reinicia UI se falhou
        if (!this.ui) {
            try { 
                this.ui = new UIManager();
                this.ui.init().catch(e => console.error('UI Repair Init Failed', e));
            } catch(e) { console.error('UI Repair Failed'); }
        }
        // 3. Garante Loop
        if (this.loop && !this.loop.running) this.loop.start();

        // Verifica se o reparo funcionou após um breve delay
        setTimeout(() => {
            if ((this.renderer && !this.renderer.app) || !this.ui) {
                this.EngineSelfRepairCycle();
            }
        }, 1500);
    }

    showCriticalErrorModal() {
        if (document.getElementById('critical-error-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'critical-error-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;text-align:center;padding:20px;';
        modal.innerHTML = '<div style="font-size:48px;margin-bottom:20px;">⚠️</div><h2 style="margin-bottom:10px;">Erro Crítico</h2><p style="color:#ccc;margin-bottom:30px;max-width:300px;">O sistema não conseguiu se recuperar automaticamente.</p><button id="reload-btn" style="padding:12px 24px;background:#007AFF;color:white;border:none;border-radius:25px;font-size:16px;font-weight:bold;cursor:pointer;margin-bottom:15px;">Reiniciar App</button><button id="reset-btn" style="padding:12px 24px;background:transparent;color:#FF3B30;border:1px solid #FF3B30;border-radius:25px;font-size:14px;cursor:pointer;">Resetar Dados</button>';
        document.body.appendChild(modal);
        document.getElementById('reload-btn').onclick = () => window.location.reload();
        document.getElementById('reset-btn').onclick = () => {
            localStorage.clear();
            if (window.indexedDB) window.indexedDB.deleteDatabase('CarImagesDB');
            window.location.reload();
        };
    }

    setupNative() {
        console.log('[Engine] Configuring Native Environment...');
        
        // Configurações Nativas (Status Bar)
        if (window.StatusBar) {
            window.StatusBar.styleDefault();
            window.StatusBar.overlaysWebView(true);
        }

        // Botão Voltar (Android)
        document.addEventListener('backbutton', this.onBackButton.bind(this), false);

        this.setupPushNotifications();
    }

    initLifecycle() {
        // Gerenciamento de Ciclo de Vida Mobile (Crucial para iOS/Android)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('[Lifecycle] App Backgrounded. Pausing Loop.');
                this.loop.stop();
            } else {
                console.log('[Lifecycle] App Foregrounded. Resuming Loop.');
                // Only resume if renderer is healthy
                if (this.renderer && !this.renderer.contextLost) {
                    this.loop.start();
                }
            }
        });

        // Cordova specific events
        document.addEventListener('pause', () => this.loop.stop(), false);
        document.addEventListener('resume', async () => {
            console.log('[Lifecycle] Restoring Renderer after Resume');
            
            // Verifica se o contexto foi perdido durante o background
            if (this.renderer && this.renderer.contextLost) {
                // handleContextRestore já reinicia o loop
                await this.renderer.handleContextRestore(); 
            } else {
                this.loop.start();
            }
        }, false);
    }

    onBackButton(e) {
        // Delega para a UI gerenciar fechamento de modais
        if (
            this.ui &&
            typeof this.ui.handleBackButton === 'function' &&
            !this.ui.handleBackButton()
        ) {
            // Se nada foi fechado na UI, sai do app ou minimiza
            if (navigator.app) {
                navigator.app.exitApp();
            }
        }
    }

    async start() {
        if (this.started) {
            console.warn('[Engine] Already started. Skipping.');
            return;
        }
        // Double check global singleton
        if (window.__ENGINE__ && window.__ENGINE__ !== this && window.__ENGINE__.started) {
            console.warn('[Engine] Another instance is running. Aborting.');
            return;
        }
        this.started = true;
        try {
            // Fase de Pré-carregamento (GPU Warm-up)
            const loader = new AssetLoader(this.renderer);
            await loader.load();
            console.log('[Engine] Assets carregados. Iniciando UI...');
        } catch (e) {
            console.error('[Engine] Erro crítico ao carregar assets:', e);
        } finally {
            if (!this.loop) {
                console.error('[Engine] Loop not initialized.');
                return;
            }

            // 🛡️ FAILSAFE (NUNCA MAIS TRAVAR NA TELA BRANCA)
            setTimeout(() => {
                const skeleton = document.getElementById('app-skeleton');
                if (skeleton && skeleton.style.display !== 'none') {
                    console.warn('[Failsafe] Skeleton force removed.');
                    skeleton.style.display = 'none';
                    if (this.loop && !this.loop.running) {
                        this.loop.start();
                    }
                }
            }, 5000);

            console.log('[Engine] Removing Skeleton Loader...');

            // Remove Skeleton Loader
            const skeleton = document.getElementById('app-skeleton');
            if (skeleton) {
                skeleton.style.pointerEvents = 'none'; // Permite clicar durante o fade
                skeleton.style.opacity = '0';
                setTimeout(() => {
                    skeleton.style.display = 'none';
                }, 800);
            }

            // Hide Splash Screen (Native) - UX Improvement: Só esconde quando tudo estiver pronto
            if (navigator.splashscreen) {
                navigator.splashscreen.hide();
            }
    
            this.loop.start();
            this.startHealthCheck();
        }
    }

    startHealthCheck() {
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

        console.log('[Engine] Health Check System Activated');

        this.healthCheckInterval = setInterval(() => {
            // Se o app estiver em background, o loop deve estar parado intencionalmente.
            if (document.hidden) return;

            if (!this.loop) return;

            const now = performance.now();
            // Se o loop diz que está rodando, mas o último frame foi há mais de 2s
            // OU se o loop não está rodando mas estamos em foreground
            const isFrozen = this.loop.running && (now - this.loop.lastTime > 2000);
            const isStoppedUnexpectedly = !this.loop.running;

            if (isFrozen || isStoppedUnexpectedly) {
                console.warn(`[HealthCheck] ⚠️ Loop instability detected (Frozen: ${isFrozen}, Stopped: ${isStoppedUnexpectedly}). Restarting...`);
                
                this.loop.stop();
                this.loop.start();
            }
        }, 2000);
    }

    safeUpdate(dt, timestamp) {
        if (
            !this.renderer ||
            !this.telemetry ||
            typeof this.update !== 'function'
        ) {
            console.warn('[Engine] ⚠️ Update skipped - Engine not ready');
            return;
        }

        this.update(dt, timestamp);
    }

    update(dt, timestamp) {
        const startTime = performance.now();

        const renderer = this.renderer;
        const telemetry = this.telemetry;

        if (!renderer || !telemetry) return;

        renderer.render();
        
        // Frame Budget Guard: Se o render demorou mais que 4ms, pula telemetria
        if (performance.now() - startTime < 4) {
            telemetry.update(dt, 0);
        }
    }

    async setupPushNotifications() {
        try {
            let permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                console.warn('[Push] Permissão negada para notificações.');
                return;
            }

            await PushNotifications.register();

            PushNotifications.addListener('registration', (token) => {
                console.log('[Push] ✅ Token de Registro FCM:', token.value);
                // Exibe o token no console para teste fácil
                console.log('%c COPIE ESTE TOKEN PARA O FIREBASE: ', 'background: #222; color: #bada55', token.value);
            });

            PushNotifications.addListener('registrationError', (error) => {
                console.error('[Push] Erro no registro:', error);
            });

            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('[Push] Notificação recebida:', notification);
                // Feedback visual para teste (Toast)
                if (this.ui && this.ui.showToast) {
                    this.ui.showToast(`🔔 ${notification.title || 'Nova Mensagem'}`);
                }
            });

            // Deep Linking: Ao clicar na notificação, abre a tela de Alertas
            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                console.log('[Push] Notificação clicada:', notification);
                if (this.ui) {
                    // Simula um widget para navegar para a seção de alertas
                    this.ui.setActive({ dataset: { target: 'alerts-section' } });
                }
            });
        } catch (e) {
            console.error('[Push] Falha ao configurar notificações:', e);
        }
    }
}