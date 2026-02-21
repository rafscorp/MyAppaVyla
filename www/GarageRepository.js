import { RemoteStorage } from './RemoteStorage.js';
import { ImageCache } from './ImageCache.js';

export class GarageRepository {
    constructor(storageKey = 'hyperengine_garage', remoteStorage = null, imageCache = null) {
        this.storageKey = storageKey;
        this.remote = remoteStorage || new RemoteStorage();
        this.imageCache = imageCache || ImageCache;
    }

    async init() {
        // Garante que o storage remoto esteja pronto antes de configurar sync
        await this.remote.init().catch(e => console.warn('[GarageRepository] Remote init warning:', e));
        
        // Configura sincronização automática ao recuperar conexão
        this.remote.setupAutoSync(async () => {
            const localData = this._loadLocal();
            // Importante: Reidrata as imagens do cache local antes de enviar para nuvem
            return await this._rehydrateImages(localData);
        });
    }

    getRemoteUserId() {
        return this.remote.getUserId();
    }

    setRemoteUserId(id) {
        return this.remote.setUserId(id);
    }

    async load() {
        let garage = this._loadLocal();

        // 1.5 Verifica se há pendências de upload (evita sobrescrever local com remoto antigo)
        if (this.remote.isPending && this.remote.isPending()) {
            console.log('[Sync] Pendência detectada no boot. Agendando sync...');
            // Reidrata e salva no remoto
            this._rehydrateImages(garage).then(fullData => this.save(fullData, false, true));
            return garage;
        }

        // 2. Tenta Sincronizar Remoto (Offline-first)
        try {
            const remoteData = await this.remote.load();
            if (remoteData) {
                console.log('[Sync] Dados remotos encontrados, atualizando...');
                garage = Array.isArray(remoteData) ? remoteData : [remoteData];
                // Salva localmente o que veio da nuvem (sem re-enviar para nuvem)
                await this.save(garage, true, false);
            }
        } catch (e) {
            console.warn('[Sync] Falha na sincronização (Offline?):', e);
        }

        return garage;
    }

    async save(garage, saveLocal = true, saveRemote = true) {
        if (saveLocal) {
            try {
                // Separa imagens pesadas do localStorage para o IndexedDB
                const garageToSave = await Promise.all(garage.map(async (car) => {
                    if (car.photo && car.photo.startsWith('data:image')) {
                        const imgId = car.imgId || `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        await this.imageCache.set(imgId, car.photo);
                        return { ...car, photo: null, imgId: imgId };
                    }
                    return car;
                }));

                localStorage.setItem(this.storageKey, JSON.stringify(garageToSave));
            } catch (e) {
                console.error('[Storage] Erro ao salvar no LocalStorage:', e);
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    alert('Armazenamento cheio! Tente remover alguns veículos antigos.');
                }
            }
        }
        if (saveRemote) {
            this.remote.save(garage); 
        }
    }

    _loadLocal() {
        const savedCarData = localStorage.getItem(this.storageKey);
        if (savedCarData) {
            try {
                const parsed = JSON.parse(savedCarData);
                if (Array.isArray(parsed)) return parsed;
                if (parsed && typeof parsed === 'object') return [parsed];
            } catch (e) {
                console.error('[Storage] Falha ao ler dados locais:', e);
                return [];
            }
        }
        return [];
    }

    async _rehydrateImages(garage) {
        if (!garage || garage.length === 0) return [];
        
        // Reconstrói o objeto completo com as fotos em Base64 para envio remoto
        return await Promise.all(garage.map(async (car) => {
            if (car.imgId && !car.photo) {
                try {
                    const base64 = await this.imageCache.get(car.imgId);
                    if (base64) {
                        return { ...car, photo: base64 }; // Retorna com a foto preenchida
                    }
                } catch (e) { console.warn('Falha ao reidratar imagem para sync:', e); }
            }
            return car;
        }));
    }
}