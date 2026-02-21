export class VisualRegressionTest {
    static async run() {
        console.log('--- Iniciando Teste de Regressão Visual ---');
        
        const report = [];
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        console.log(`[Visual] Viewport: ${width}x${height}`);

        // 1. Verifica Elementos Críticos
        const criticalElements = [
            '#garage-container',
            '#bottom-panel',
            '.app-section.active'
        ];

        criticalElements.forEach(selector => {
            const el = document.querySelector(selector);
            if (!el) {
                report.push(`❌ Elemento não encontrado: ${selector}`);
                return;
            }
            
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                report.push(`⚠️ Elemento invisível (0px): ${selector}`);
            } else {
                // Verifica se está dentro da viewport
                if (rect.top < 0 || rect.left < 0 || rect.bottom > height || rect.right > width) {
                    // Tolerância para elementos que podem estar parcialmente fora (ex: listas com scroll)
                    if (!selector.includes('list') && !selector.includes('container')) {
                         report.push(`⚠️ Elemento fora da viewport: ${selector} (${Math.round(rect.top)},${Math.round(rect.left)})`);
                    }
                }
            }
        });

        // 2. Verifica Sobreposição de UI (Z-Index Check básico)
        const bottomPanel = document.getElementById('bottom-panel');
        const modalOverlay = document.querySelector('.modal-overlay.visible');
        
        if (bottomPanel && modalOverlay) {
            const panelZ = parseInt(window.getComputedStyle(bottomPanel).zIndex || 0);
            const modalZ = parseInt(window.getComputedStyle(modalOverlay).zIndex || 0);
            
            if (modalZ <= panelZ) {
                report.push(`❌ Modal Overlay (z:${modalZ}) está abaixo ou igual ao Bottom Panel (z:${panelZ})`);
            }
        }

        // 3. Verifica Layout Shift (CLS Check simulado)
        // Verifica se o container principal tem altura definida
        const garageBox = document.querySelector('.garage-box');
        if (garageBox) {
            const style = window.getComputedStyle(garageBox);
            if (style.position !== 'absolute' && style.position !== 'fixed') {
                 // Se não for absoluto, verifica se não está colapsado
                 if (garageBox.offsetHeight < 100) {
                     report.push(`⚠️ Garage Box parece colapsado (h: ${garageBox.offsetHeight}px)`);
                 }
            }
        }

        // 4. Verifica Variáveis CSS Críticas
        const appHeight = getComputedStyle(document.documentElement).getPropertyValue('--app-height');
        if (!appHeight || appHeight.trim() === '') {
            report.push(`❌ Variável --app-height não definida`);
        }

        // Relatório Final
        if (report.length === 0) {
            console.log('✅ [Visual] Layout parece estável.');
            // Feedback visual discreto
            const indicator = document.createElement('div');
            indicator.style.cssText = 'position:fixed;top:0;right:0;width:10px;height:10px;background:#00ff00;z-index:99999;pointer-events:none;';
            document.body.appendChild(indicator);
            setTimeout(() => indicator.remove(), 2000);
        } else {
            console.error('🚨 [Visual] Problemas detectados:');
            report.forEach(msg => console.warn(msg));
            const indicator = document.createElement('div');
            indicator.style.cssText = 'position:fixed;top:0;right:0;width:10px;height:10px;background:#ff0000;z-index:99999;pointer-events:none;';
            document.body.appendChild(indicator);
            setTimeout(() => indicator.remove(), 5000);
        }
    }
}