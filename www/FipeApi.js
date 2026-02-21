// Lista de emergência caso a API esteja totalmente fora do ar e o usuário não tenha cache
const FALLBACK_BRANDS = [
    { nome: 'Audi (Carros)', codigo: '6', tipo: 'carros' },
    { nome: 'BMW (Carros)', codigo: '7', tipo: 'carros' },
    { nome: 'Chevrolet (Carros)', codigo: '23', tipo: 'carros' },
    { nome: 'Citroën (Carros)', codigo: '13', tipo: 'carros' },
    { nome: 'Fiat (Carros)', codigo: '21', tipo: 'carros' },
    { nome: 'Ford (Carros)', codigo: '22', tipo: 'carros' },
    { nome: 'Honda (Carros)', codigo: '25', tipo: 'carros' },
    { nome: 'Hyundai (Carros)', codigo: '26', tipo: 'carros' },
    { nome: 'Jeep (Carros)', codigo: '29', tipo: 'carros' },
    { nome: 'Kia (Carros)', codigo: '31', tipo: 'carros' },
    { nome: 'Mercedes-Benz (Carros)', codigo: '39', tipo: 'carros' },
    { nome: 'Mitsubishi (Carros)', codigo: '41', tipo: 'carros' },
    { nome: 'Nissan (Carros)', codigo: '43', tipo: 'carros' },
    { nome: 'Peugeot (Carros)', codigo: '44', tipo: 'carros' },
    { nome: 'Renault (Carros)', codigo: '48', tipo: 'carros' },
    { nome: 'Toyota (Carros)', codigo: '56', tipo: 'carros' },
    { nome: 'Volkswagen (Carros)', codigo: '59', tipo: 'carros' },
    { nome: 'Volvo (Carros)', codigo: '60', tipo: 'carros' },
    { nome: 'Honda (Motos)', codigo: '25', tipo: 'motos' },
    { nome: 'Yamaha (Motos)', codigo: '61', tipo: 'motos' },
    { nome: 'Suzuki (Motos)', codigo: '54', tipo: 'motos' },
    { nome: 'Scania (Caminhões)', codigo: '113', tipo: 'caminhoes' },
    { nome: 'Volvo (Caminhões)', codigo: '115', tipo: 'caminhoes' },
    { nome: 'Mercedes-Benz (Caminhões)', codigo: '111', tipo: 'caminhoes' }
];

// Função auxiliar para tentar requisições múltiplas vezes
async function fetchWithRetry(url, retries = 3, delay = 1000) {
    // OTIMIZAÇÃO OFFLINE: Fail-fast se o SO informar que não há rede
    if (!navigator.onLine) throw new Error('Sem conexão');

    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.warn(`[FipeApi] Tentativa ${i + 1} falhou para ${url}. Retentando em ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay * Math.pow(2, i))); // Backoff exponencial
        }
    }
}

export class FipeApi {
    static async getBrands() {
        const cacheKey = 'fipe_brands_all';
        const ttl = 7 * 24 * 60 * 60 * 1000; // 7 dias de validade ideal
        
        let cachedData = null;
        const cached = localStorage.getItem(cacheKey);
        
        // 1. Tenta recuperar do Cache
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed.timestamp && parsed.data && parsed.data.length > 0) {
                    cachedData = parsed;
                    // Se o cache for recente ou se estivermos offline, usa ele imediatamente
                    if ((Date.now() - parsed.timestamp < ttl) || !navigator.onLine) {
                        console.log('[FipeApi] Usando cache local rápido.');
                        return parsed.data;
                    }
                }
            } catch (e) {
                localStorage.removeItem(cacheKey);
            }
        }

        // 2. Tenta buscar na API (Rede)
        try {
            const types = ['carros', 'motos', 'caminhoes'];
            
            // Busca todos os tipos em paralelo, mas trata falhas individuais
            const results = await Promise.all(types.map(async (type) => {
                try {
                    const data = await fetchWithRetry(`https://parallelum.com.br/fipe/api/v1/${type}/marcas`);
                    const typeLabel = type === 'caminhoes' ? 'Caminhões' : (type.charAt(0).toUpperCase() + type.slice(1));
                    return data.map(b => ({ 
                        nome: `${b.nome} (${typeLabel})`, 
                        codigo: b.codigo,
                        tipo: type
                    }));
                } catch (err) {
                    console.warn(`[FipeApi] Erro ao buscar ${type}:`, err);
                    return []; // Retorna vazio para este tipo, mas não quebra os outros
                }
            }));

            const brandsData = results.flat();

            if (brandsData.length > 0) {
                // Ordena alfabeticamente
                brandsData.sort((a, b) => a.nome.localeCompare(b.nome));
                
                // Salva no cache
                localStorage.setItem(cacheKey, JSON.stringify({
                    timestamp: Date.now(),
                    data: brandsData
                }));
                return brandsData;
            }
            throw new Error('API retornou lista vazia');
        } catch (error) {
            console.warn('[FipeApi] Falha na rede. Tentando fallback.', error);
            
            // 3. Fallback: Cache Expirado (Melhor dados velhos do que nada)
            if (cachedData) {
                console.log('[FipeApi] Usando cache expirado como fallback.');
                return cachedData.data;
            }

            // 4. Fallback: Lista Estática (Último recurso)
            console.log('[FipeApi] Usando lista estática de emergência.');
            return FALLBACK_BRANDS;
        }
    }

    static async getModels(brandCode, vehicleType) {
        const cacheKey = `fipe_models_${vehicleType}_${brandCode}`;
        const ttl = 30 * 24 * 60 * 60 * 1000; // 30 dias (modelos mudam pouco)
        
        let cachedData = null;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed.timestamp && parsed.data) {
                    cachedData = parsed;
                    if (Date.now() - parsed.timestamp < ttl) {
                        return parsed.data;
                    }
                }
            } catch (e) {
                localStorage.removeItem(cacheKey);
            }
        }

        try {
            const data = await fetchWithRetry(`https://parallelum.com.br/fipe/api/v1/${vehicleType}/marcas/${brandCode}/modelos`);
            
            if (!data || !data.modelos || !Array.isArray(data.modelos)) throw new Error('Dados inválidos da API');
            
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: data.modelos }));
            return data.modelos;
        } catch (error) {
            console.warn('[FipeApi] Erro ao buscar modelos.', error);
            
            // Fallback para modelos: Cache expirado
            if (cachedData) {
                console.log('[FipeApi] Usando cache de modelos expirado.');
                return cachedData.data;
            }
            
            throw error; // Se não tem cache de modelos, a UI vai mostrar o botão "Tentar Novamente"
        }
    }
}