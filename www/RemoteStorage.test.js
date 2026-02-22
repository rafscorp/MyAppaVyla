import { RemoteStorage } from './RemoteStorage.js';

async function runTests() {
    console.log('--- Iniciando Testes Unitários: RemoteStorage (Offline) ---');

    // Helper para asserções
    function assert(condition, message) {
        if (condition) console.log(`✅ PASSOU: ${message}`);
        else {
            console.error(`❌ FALHA: ${message}`);
            throw new Error(message);
        }
    }

    // Helper para acessar IndexedDB diretamente (já que as funções internas não são exportadas)
    function getQueueFromDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('HyperEngineDB', 1);
            req.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('sync_queue')) return resolve([]);
                const tx = db.transaction('sync_queue', 'readonly');
                tx.objectStore('sync_queue').getAll().onsuccess = (ev) => resolve(ev.target.result);
            };
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = (e) => {
                e.target.result.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
            };
        });
    }

    // Mock de ambiente offline
    const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    const setOffline = () => Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const setOnline = () => {
        if (originalOnLine) Object.defineProperty(navigator, 'onLine', originalOnLine);
        else Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    };

    try {
        // 1. Preparação
        const storage = new RemoteStorage();
        
        // Mock do client para evitar que o init() falhe ou tente conectar
        // Se this.client existir, o save() pula o init()
        storage.client = { from: () => ({ upsert: async () => ({ error: null }) }) };
        
        // Limpa DB antes do teste para garantir estado limpo
        const delReq = indexedDB.deleteDatabase('HyperEngineDB');
        await new Promise(r => { delReq.onsuccess = r; delReq.onerror = r; });

        // 2. Execução (Simulando Offline)
        setOffline();
        console.log('[Test] Simulando estado Offline...');
        
        const testData = { model: 'Test Car Offline', plate: 'OFF-1234' };
        await storage.save(testData);

        // 3. Verificação
        const isPending = await storage.isPending();
        assert(isPending === true, 'isPending() deve retornar true após salvar offline');

        const queue = await getQueueFromDB();
        assert(queue.length === 1, 'Fila no IndexedDB deve conter exatamente 1 item');
        assert(queue[0].action === 'UPSERT', 'Ação enfileirada deve ser UPSERT');
        assert(queue[0].payload.data.plate === 'OFF-1234', 'Dados do payload devem corresponder ao salvo');
        assert(queue[0].timestamp > 0, 'Item deve ter um timestamp válido');

        console.log('🎉 TODOS OS TESTES DO REMOTESTORAGE PASSARAM!');

    } catch (e) {
        console.error('TESTE FALHOU:', e);
    } finally {
        // Restaura estado online para não afetar outros testes ou a app
        setOnline();
    }
}

if (typeof window !== 'undefined') runTests();