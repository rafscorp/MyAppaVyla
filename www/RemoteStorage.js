import { createClient } from '@supabase/supabase-js';

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
        this.url = 'https://SEU_PROJECT_ID.supabase.co';
        this.key = 'SEU_ANON_KEY';
    }

    async init() {
        if (this.client) return; // Idempotência: Se já iniciou, retorna

        // SUBSTITUA PELAS SUAS CHAVES DO SUPABASE
        // Crie a tabela: create table fleets ( id text primary key, data jsonb );
        
        // Validação básica para evitar erros com chaves de exemplo
        const isConfigured = this.url !== 'https://SEU_PROJECT_ID.supabase.co' && this.key !== 'SEU_ANON_KEY';

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
        if (!this.client) await this.init();
        if (!this.client) return;
        
        // Verifica conexão antes de tentar
        if (!navigator.onLine) {
            this._markPending();
            return;
        }

        try {
            const userId = this.getUserId();
            
            const { error } = await this.client
                .from('fleets')
                .upsert({ id: userId, data: data });
                
            if (error) throw error;
            
            console.log('[Remote] Salvo na nuvem com sucesso.');
            this._clearPending();
        } catch (e) {
            console.error('[Remote] Exceção ao salvar:', e);
            this._markPending();
        }
    }

    async load() {
        if (!this.client) await this.init();
        if (!this.client) return null;
        
        // Proteção: Se houver dados pendentes de envio, não baixa do remoto para evitar sobrescrita
        if (this.isPending()) {
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
        try {
            const userId = this.getUserId();
            await this.client.from('fleets').delete().eq('id', userId);
        } catch (e) {
            console.error('[Remote] Exceção ao remover:', e);
        }
    }

    // --- Controle de Estado de Sincronização ---
    isPending() {
        return !!localStorage.getItem('hyperengine_sync_pending');
    }

    _markPending() {
        localStorage.setItem('hyperengine_sync_pending', 'true');
    }

    _clearPending() {
        localStorage.removeItem('hyperengine_sync_pending');
    }

    // Configura o listener de rede para sincronização automática
    setupAutoSync(getDataProvider) {
        window.addEventListener('online', async () => {
            if (this.isPending()) {
                console.log('[Remote] Conexão restabelecida. Iniciando sincronização...');
                try {
                    const data = await getDataProvider();
                    if (data) {
                        await this.save(data);
                    }
                } catch (e) {
                    console.error('[Remote] Erro na auto-sincronização:', e);
                }
            }
        });
    }
}