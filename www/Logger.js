export class Logger {
    static logs = [];
    static maxLogs = 2000;

    static init() {
        // 1. Intercepta console.log/warn/error para salvar no histórico
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args) => {
            Logger.add('INFO', args);
            originalLog.apply(console, args);
        };

        console.warn = (...args) => {
            Logger.add('WARN', args);
            originalWarn.apply(console, args);
        };

        console.error = (...args) => {
            Logger.add('ERROR', args);
            originalError.apply(console, args);
        };

        // 2. Captura Erros Globais (Sintaxe/Runtime)
        window.addEventListener('error', (event) => {
            Logger.add('CRITICAL', [`[Global Error] ${event.message} at ${event.filename}:${event.lineno}`]);
        });

        // 3. Captura Rejeições de Promise não tratadas (Async)
        window.addEventListener('unhandledrejection', (event) => {
            let message = event.reason;
            if (event.reason instanceof Error) {
                message = `${event.reason.message}\nStack: ${event.reason.stack}`;
            }
            Logger.add('UNHANDLED_PROMISE', [message]);
        });

        console.log('[Logger] Sistema de logs iniciado.');
    }

    static add(level, args) {
        const timestamp = new Date().toISOString();
        // Converte objetos para string de forma segura
        const messages = args.map(arg => {
            if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return '[Circular/Object]';
                }
            }
            return String(arg);
        });

        const logLine = `[${timestamp}] [${level}] ${messages.join(' ')}`;
        this.logs.push(logLine);

        // Mantém limite de logs para não estourar memória
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
    }

    static export() {
        const blob = new Blob([this.logs.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hyperengine_debug_${Date.now()}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}