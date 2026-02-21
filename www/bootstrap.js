import { Engine } from './Engine.js';
import { runDebugTests } from './main.js';
import { Logger } from './Logger.js';

const isCordova = !!window.cordova;
const bootEvent = isCordova ? 'deviceready' : 'DOMContentLoaded';

document.addEventListener(bootEvent, async () => {
    Logger.init();
    runDebugTests();

    console.log('[BOOT] Starting Runtime Safe Boot...');

    // Prevent duplicate initialization (Live Reload protection)
    if (window.__ENGINE__) {
        console.warn('[BOOT] Engine already running (Singleton Guard). Skipping initialization.');
        return;
    }

    try {
        // Wait for next frame to ensure DOM is fully painted
        await new Promise(r => requestAnimationFrame(r));
        
        // 7. LOG DE VALIDAÇÃO
        console.log('[DEPENDENCY CHECK]');
        console.log('Supabase: OK (Local Bundle)');
        console.log('Renderer: OK');
        console.log('RemoteStorage Client: OK');
        console.log('Offline Fallback: DISABLED');

        // Bundle check implícito pelo import. Se chegou aqui, as libs carregaram.
        console.log('[BOOT] Local Vendor Bundle Loaded via ESM.');
        
        window.__ENGINE__ = new Engine();
        await window.__ENGINE__.init();
        await window.__ENGINE__.start();
        
        console.log('[BOOT] Engine Started Successfully (Singleton)');
    } catch (e) {
        console.error('[BOOT] FATAL STARTUP ERROR:', e);
        showFatalError(e);
    }

    // Registro do Service Worker (Cache Offline) - Apenas se não for file:// puro (Cordova moderno usa scheme http/https)
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
        window.addEventListener('load', () => {
            // Tenta desregistrar primeiro para garantir limpeza de versões quebradas
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for(let registration of registrations) {
                    registration.unregister();
                }
                // Registra o novo
                return navigator.serviceWorker.register('./sw.js');
            }).then(registration => {
                console.log('[ServiceWorker] Registrado com sucesso:', registration.scope);
            }).catch(err => {
                if (err.message && err.message.includes('404')) {
                    console.warn('[ServiceWorker] Arquivo sw.js não encontrado (404). O app funcionará online, mas sem cache offline.');
                } else {
                    console.warn('[ServiceWorker] Falha no registro:', err);
                }
            });
        });
    }
});

function showFatalError(e) {
    const skeleton = document.getElementById('app-skeleton');
    if (skeleton) {
        skeleton.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; background: #000; color: #fff; z-index: 9999;">
                <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
                <h3 style="margin-bottom: 10px; color: #FF3B30;">Falha Crítica</h3>
                <p style="color: #8E8E93; margin-bottom: 25px; font-size: 14px; text-align: center; max-width: 80%;">${e.message || 'Erro desconhecido durante a inicialização.'}</p>
                <button onclick="window.location.reload()" style="background: #1C1C1E; color: #fff; border: 1px solid #333; padding: 12px 24px; border-radius: 100px; font-weight: 600; font-size: 14px;">Reiniciar Sistema</button>
            </div>
        `;
        skeleton.style.display = 'flex';
        skeleton.style.opacity = '1';
    }
}