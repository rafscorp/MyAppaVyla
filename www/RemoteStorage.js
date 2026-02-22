import { createClient } from '@supabase/supabase-js';

// --- IndexedDB Queue System ---
const DB_NAME = 'HyperEngineDB';
const STORE_NAME = 'sync_queue';
let _db = null;

function getDB() {
    return new Promise((resolve, reject) => {
        if (_db) return resolve(_db);
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (e) => {
            _db = e.target.result;
            resolve(_db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

async function enqueueRequest(action, payload) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add({ action, payload, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function getQueue() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deleteFromQueue(id) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export class OfflineStorageAdapter {
    constructor() {
        console.log('[Remote] Using OfflineStorageAdapter (Supabase Mock)');
        this.storageKey = 'offline_fleets_backup';
    }
    
    from(table) {
        return {
            upsert: async ({ id, data }) => {
                try {
                    this._save(id, data);
                    return { error: null };
                } catch (e) {
                    return { error: { message: e.message, code: 'STORAGE_ERROR' } };
                }
            },
            select: (cols) => ({
                eq: (col, val) => ({
                    single: async () => {
                        const data = this._load(val);
                        return { data: data ? { data } : null, error: null };
                    }
                })
            }),
            delete: () => ({
                eq: async (col, val) => {
                    this._remove(val);
                    return { error: null };
                }
            })
        };
    }

    _save(id, data) {
        const db = this._getDb();
        // Wrap data with timestamp for LRU
        db[id] = { _d: data, _ts: Date.now() };
        
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(db));
        } catch (e) {
            if (this._isQuotaExceeded(e)) {
                console.warn('[Remote] Quota exceeded. Cleaning up old data...');
                if (this._prune(db, id)) {
                    try {
                        localStorage.setItem(this.storageKey, JSON.stringify(db));
                        console.log('[Remote] Cleanup successful.');
                        return;
                    } catch (retryE) {
                        console.error('[Remote] Cleanup failed to free enough space.');
                    }
                }
                throw new Error('Armazenamento local cheio. Não foi possível salvar os dados.');
            }
            throw e;
        }
    }

    _load(id) {
        const db = this._getDb();
        const item = db[id];
        
        if (!item) return null;

        // Check if wrapped
        if (item && typeof item === 'object' && '_d' in item) {
            // Update timestamp (LRU)
            item._ts = Date.now();
            db[id] = item;
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(db));
            } catch (e) { /* Ignore write error on read */ }
            return item._d;
        }
        
        return item; // Legacy
    }

    _remove(id) {
        const db = this._getDb();
        delete db[id];
        localStorage.setItem(this.storageKey, JSON.stringify(db));
    }

    _getDb() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        } catch { return {}; }
    }

    _prune(db, preserveId) {
        const keys = Object.keys(db);
        if (keys.length === 0) return false;

        // Sort keys by timestamp (oldest first)
        const sortedKeys = keys.sort((a, b) => {
            const itemA = db[a];
            const itemB = db[b];
            const tsA = (itemA && typeof itemA === 'object' && '_ts' in itemA) ? itemA._ts : 0;
            const tsB = (itemB && typeof itemB === 'object' && '_ts' in itemB) ? itemB._ts : 0;
            return tsA - tsB;
        });

        let removed = false;
        // Remove oldest 20% or at least 1, excluding preserveId
        const targetCount = Math.max(1, Math.floor(keys.length * 0.2));
        let count = 0;

        for (const key of sortedKeys) {
            if (key === preserveId) continue;
            delete db[key];
            removed = true;
            count++;
            if (count >= targetCount) break;
        }

        return removed;
    }

    _isQuotaExceeded(e) {
        return e instanceof DOMException && (
            // everything except Firefox
            e.code === 22 ||
            // Firefox
            e.code === 1014 ||
            // test name field too, because code might not be present
            e.name === 'QuotaExceededError' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
            (localStorage.length !== 0);
    }
}

export class RemoteStorage {
    constructor() {
        this.client = null;
        this.url = import.meta.env.VITE_SUPABASE_URL;
        this.key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    }

    async init() {
        if (this.client) return; // Idempotência: Se já iniciou, retorna

        // SUBSTITUA PELAS SUAS CHAVES DO SUPABASE
        // Crie a tabela: create table fleets ( id text primary key, data jsonb );
        
        // Validação básica para evitar erros com chaves de exemplo
        const isConfigured = this.url && this.key && 
                             this.url !== 'https://SEU_PROJECT_ID.supabase.co' && 
                             this.key !== 'SEU_ANON_KEY';

        try {
            // Validação de Dependência Crítica
            if (typeof createClient !== 'function') {
                throw new Error('Supabase SDK not loaded from bundle');
            }

            if (isConfigured) {
                this.client = createClient(this.url, this.key);
            } else {
                throw new Error('Supabase credentials not configured');
            }
        } catch (e) {
            console.error('[Remote] FATAL INIT ERROR:', e);
            throw new Error(`FATAL: RemoteStorage init failed. ${e.message}`);
        }
    }

    getUserId() {
        let id = localStorage.getItem('hyperengine_user_id');
        if (!id) {
            // Gera um ID aleatório se não existir
            id = 'user_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('hyperengine_user_id', id);
        }
        return id;
    }

    setUserId(newId) {
        if (newId && newId.trim().length > 0) {
            localStorage.setItem('hyperengine_user_id', newId.trim());
            return true;
        }
        return false;
    }

    async save(data) {
        try {
            if (!this.client) await this.init();
        } catch (e) {
            console.error('[Remote] Init failed, cannot save.', e);
            return;
        }

        const userId = this.getUserId();

        // Tenta envio direto se online
        if (navigator.onLine && this.client) {
            try {
                const { error } = await this.client
                    .from('fleets')
                    .upsert({ id: userId, data: data });
                
                if (error) throw error;
                
                console.log('[Remote] Salvo na nuvem com sucesso.');
                return;
            } catch (e) {
                console.warn('[Remote] Falha no envio online. Enfileirando...', e);
            }
        }

        // Fallback: Enfileira no IndexedDB
        try {
            await enqueueRequest('UPSERT', { id: userId, data: data });
            console.log('[Remote] Salvo na fila offline (IndexedDB).');
        } catch (e) {
            console.error('[Remote] ERRO CRÍTICO: Falha ao salvar na fila offline.', e);
        }
    }

    async load() {
        if (!this.client) await this.init();
        if (!this.client) return null;
        
        // Proteção: Se houver dados pendentes de envio, não baixa do remoto para evitar sobrescrita
        if (await this.isPending()) {
            console.log('[Remote] Sincronização pendente. Mantendo dados locais.');
            return null;
        }

        try {
            const userId = this.getUserId();

            const { data, error } = await this.client
                .from('fleets')
                .select('data')
                .eq('id', userId)
                .single();

            if (error) return null;
            return data?.data;
        } catch (e) {
            console.error('[Remote] Exceção ao carregar:', e);
            return null;
        }
    }

    async remove() {
        if (!this.client) await this.init();
        if (!this.client) return;
        const userId = this.getUserId();

        if (navigator.onLine) {
            try {
                const { error } = await this.client.from('fleets').delete().eq('id', userId);
                if (error) throw error;
                console.log('[Remote] Removido da nuvem.');
                return;
            } catch (e) {
                console.warn('[Remote] Falha ao remover online. Enfileirando...', e);
            }
        }

        try {
            await enqueueRequest('DELETE', { id: userId });
            console.log('[Remote] Remoção enfileirada (Offline).');
        } catch (e) {
            console.error('[Remote] Erro ao enfileirar remoção:', e);
        }
    }

    // --- Controle de Estado de Sincronização ---
    async isPending() {
        try {
            const q = await getQueue();
            return q.length > 0;
        } catch { return false; }
    }

    // Configura o listener de rede para sincronização automática
    setupAutoSync() {
        let retryAttempt = 0;
        let isSyncing = false;

        const processQueue = async () => {
            if (isSyncing || !navigator.onLine) return;
            isSyncing = true;

            try {
                if (!this.client) await this.init();

                const queue = await getQueue();
                if (queue.length === 0) {
                    isSyncing = false;
                    return;
                }

                console.log(`[Remote] Sincronizando ${queue.length} itens da fila...`);

                for (const item of queue) {
                    try {
                        if (item.action === 'UPSERT') {
                            const { error } = await this.client.from('fleets').upsert(item.payload);
                            if (error) throw error;
                        } else if (item.action === 'DELETE') {
                            const { error } = await this.client.from('fleets').delete().eq('id', item.payload.id);
                            if (error) throw error;
                        }
                        await deleteFromQueue(item.id);
                        retryAttempt = 0; // Sucesso: reseta backoff
                    } catch (e) {
                        console.error('[Remote] Falha na sincronização do item:', item, e);
                        
                        // Backoff Exponencial: 2s, 4s, 8s, 16s, 30s (max)
                        const delay = Math.min(2000 * Math.pow(2, retryAttempt), 30000);
                        retryAttempt++;
                        
                        console.log(`[Remote] Agendando retry em ${delay}ms (Tentativa ${retryAttempt})`);
                        setTimeout(() => {
                            isSyncing = false;
                            processQueue();
                        }, delay);
                        
                        return; // Interrompe o loop atual, aguarda o retry
                    }
                }
            } catch (e) {
                console.error('[Remote] Erro no loop de sync:', e);
            }
            isSyncing = false;
        };

        window.addEventListener('online', () => {
            console.log('[Remote] Conexão detectada. Reiniciando fila.');
            retryAttempt = 0;
            processQueue();
        });
        
        // Tenta processar na inicialização
        setTimeout(processQueue, 3000);
    }
}