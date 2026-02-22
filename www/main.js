/**
 * Main Debug Controller
 * Responsável por orquestrar testes e verificações quando em modo debug.
 */
export async function runDebugTests() {
    const urlParams = new URLSearchParams(window.location.search);
    const isDebug = urlParams.get('debug') === 'true';

    if (isDebug) {
        console.log('%c 🐞 DEBUG MODE INITIATED ', 'background: #ff9800; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;');
        
        try {
            // GSAP Availability Check
            if (window.gsap) {
                console.log('[Debug] ✅ GSAP Global: OK (window.gsap)');
            } else {
                console.log('[Debug] ⚠️ GSAP Global: Missing. Trying dynamic import...');
                try {
                    await import('gsap');
                    console.log('[Debug] ✅ GSAP Module: OK (Imported dynamically)');
                } catch (e) {
                    console.error('[Debug] ❌ GSAP Missing:', e.message);
                }
            }

            await import('./MapRenderer.test.js').catch(e => console.warn('[Debug] MapRenderer tests skipped:', e.message));
            await import('./GarageRepository.test.js').catch(e => console.warn('[Debug] GarageRepository tests skipped:', e.message));
            await import('./FipeApi.test.js').catch(e => console.warn('[Debug] FipeApi tests skipped:', e.message));
            await import('./UIManager.test.js').catch(e => console.warn('[Debug] UIManager tests skipped:', e.message));
            await import('./RemoteStorage.test.js').catch(e => console.warn('[Debug] RemoteStorage tests skipped:', e.message));
            
            // Teste Visual (Executa após um breve delay para garantir renderização)
            setTimeout(async () => {
                const { VisualRegressionTest } = await import('./VisualRegression.test.js');
                VisualRegressionTest.run();
            }, 2000);
        } catch (e) {
            console.error('[Debug] Erro fatal ao executar suite de testes:', e);
        }
    }
}