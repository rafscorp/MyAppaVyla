// Utilitário simples para IndexedDB (Image Cache)
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('CarImagesDB', 1);
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('images')) {
            db.createObjectStore('images');
        }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => { console.error("IndexedDB error:", event.target.error); resolve(null); }; // Resolve null to not block app
});

export const ImageCache = {
    async get(key) {
        const db = await dbPromise;
        if (!db) return null;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    async set(key, value) {
        const db = await dbPromise;
        if (!db) return;
        
        const performPut = () => new Promise((resolve, reject) => {
            const transaction = db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = (e) => {
                e.preventDefault(); // Previne aborto da transação se possível
                e.stopPropagation();
                reject(e.target.error);
            };
        });

        try {
            await performPut();
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.warn('[ImageCache] Limite de armazenamento atingido. Limpando imagens antigas...');
                await this.prune();
                await performPut(); // Tenta novamente após limpeza
            } else {
                throw e;
            }
        }
    },
    async prune() {
        const db = await dbPromise;
        if (!db) return;
        return new Promise((resolve) => {
            const transaction = db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            let count = 0;
            // Remove os 5 primeiros itens encontrados (FIFO aproximado)
            const request = store.openKeyCursor();
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && count < 5) {
                    store.delete(cursor.key);
                    count++;
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => resolve();
        });
    },
    async delete(key) {
        const db = await dbPromise;
        if (!db) return;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};