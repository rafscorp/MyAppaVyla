/**
 * Gerenciador de Input Zero-Latency.
 * Usa passive listeners para não bloquear a thread de UI.
 */
export class Input {
    constructor(targetElement) {
        this.target = targetElement;
        this.pointers = new Map(); // Rastreia toques ativos
        
        // Pre-alocação de vetores para evitar GC
        this.activePointerCount = 0;
    }

    init() {
        // Passive: true é crucial para performance de scroll/touch
        const opts = { passive: false, capture: false };

        this.target.addEventListener('touchstart', this.onTouchStart.bind(this), opts);
        this.target.addEventListener('touchmove', this.onTouchMove.bind(this), opts);
        this.target.addEventListener('touchend', this.onTouchEnd.bind(this), opts);
        this.target.addEventListener('touchcancel', this.onTouchEnd.bind(this), opts);
    }

    onTouchStart(e) {
        // Verifica se o toque é em um elemento de UI (Input, Botão, Modal, Lista)
        // Se for, NÃO previne o padrão para permitir foco, digitação e scroll
        if (this.isUiElement(e.target)) return;

        // Caso contrário (toque no jogo/canvas), previne zoom/scroll nativo
        if (e.cancelable) e.preventDefault();
        
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            this.pointers.set(t.identifier, { x: t.clientX, y: t.clientY, id: t.identifier });
        }
        this.activePointerCount = this.pointers.size;
    }

    onTouchMove(e) {
        // Permite scroll em listas e interação com UI
        if (this.isUiElement(e.target)) return;

        if (e.cancelable) e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const p = this.pointers.get(t.identifier);
            if (p) {
                p.x = t.clientX;
                p.y = t.clientY;
            }
        }
    }

    onTouchEnd(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            this.pointers.delete(e.changedTouches[i].identifier);
        }
        this.activePointerCount = this.pointers.size;
    }

    // Helper para identificar elementos de interface que precisam de interação nativa
    isUiElement(target) {
        // SOLUÇÃO DEFINITIVA: Se o elemento tocado está dentro da camada de UI (#ui-layer),
        // então é interface e o Input do jogo deve ignorar.
        // O Canvas (#gl-canvas) é irmão do #ui-layer, então toques no jogo retornarão false aqui.
        if (target.closest('#ui-layer') || target.closest('.modal-overlay')) return true;
        if (target.closest('button')) return true; // Garante que ícones/textos dentro de botões funcionem
        if (target.closest('.empty-content-wrapper') || target.closest('.garage-box')) return true; // Garante interação na garagem
        
        return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL', 'A'].includes(target.tagName);
    }
}