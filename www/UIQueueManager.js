export class UIQueueManager {
    static queue = [];
    static isProcessing = false;

    static schedule(task) {
        this.queue.push(task);
        if (!this.isProcessing) {
            this.process();
        }
    }

    static process() {
        this.isProcessing = true;
        
        const processQueue = (deadline) => {
            // Processa tarefas enquanto houver tempo no frame ou se estourou o timeout
            while ((deadline.timeRemaining() > 0 || deadline.didTimeout) && this.queue.length > 0) {
                const task = this.queue.shift();
                try {
                    task();
                } catch (e) {
                    console.error('[UIQueue] Task failed:', e);
                }
            }

            if (this.queue.length > 0) {
                requestIdleCallback(processQueue);
            } else {
                this.isProcessing = false;
            }
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(processQueue, { timeout: 1000 });
        } else {
            // Fallback para browsers sem requestIdleCallback (Safari)
            setTimeout(() => {
                const start = performance.now();
                while (performance.now() - start < 5 && this.queue.length > 0) {
                    const task = this.queue.shift();
                    try { task(); } catch (e) { console.error(e); }
                }
                if (this.queue.length > 0) {
                    this.process();
                } else {
                    this.isProcessing = false;
                }
            }, 0);
        }
    }
}