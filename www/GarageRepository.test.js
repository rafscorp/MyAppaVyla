import { GarageRepository } from './GarageRepository.js';

// --- Mocks (Simulações) ---

class MockRemoteStorage {
    constructor() {
        this.data = null;
        this.userId = 'test_user_123';
        this.saveCalled = false;
    }
    getUserId() { return this.userId; }
    setUserId(id) { this.userId = id; return true; }
    async load() { return this.data; }
    async save(data) { this.data = data; this.saveCalled = true; }
}

const MockImageCache = {
    store: {},
    async set(key, value) { this.store[key] = value; },
    async get(key) { return this.store[key]; },
    async delete(key) { delete this.store[key]; },
    clear() { this.store = {}; }
};

// --- Utilitários de Teste ---

function assert(condition, message) {
    if (!condition) {
        throw new Error(`❌ FALHA: ${message}`);
    }
    console.log(`✅ PASSOU: ${message}`);
}

async function runTests() {
    console.log('--- Iniciando Testes Unitários: GarageRepository ---');
    const TEST_KEY = 'test_garage_db';

    // Setup: Limpa ambiente antes de cada teste
    const setup = () => {
        localStorage.removeItem(TEST_KEY);
        MockImageCache.clear();
        return new MockRemoteStorage();
    };

    try {
        // Teste 1: Carregar vazio
        await (async () => {
            const mockRemote = setup();
            const repo = new GarageRepository(TEST_KEY, mockRemote, MockImageCache);
            const data = await repo.load();
            assert(Array.isArray(data) && data.length === 0, 'Deve carregar array vazio se não houver dados');
        })();

        // Teste 2: Salvar e Carregar Localmente
        await (async () => {
            const mockRemote = setup();
            const repo = new GarageRepository(TEST_KEY, mockRemote, MockImageCache);
            
            const cars = [{ brand: 'Fiat', model: 'Uno', nick: 'Escada' }];
            await repo.save(cars, true, false); // Salva apenas local

            // Verifica se salvou no localStorage
            const raw = localStorage.getItem(TEST_KEY);
            assert(raw !== null, 'Deve ter dados no localStorage');
            
            // Recarrega
            const loaded = await repo.load();
            assert(loaded.length === 1 && loaded[0].model === 'Uno', 'Deve recuperar os dados salvos localmente');
        })();

        // Teste 3: Separação de Imagens (ImageCache)
        await (async () => {
            const mockRemote = setup();
            const repo = new GarageRepository(TEST_KEY, mockRemote, MockImageCache);
            
            const heavyPhoto = 'data:image/jpeg;base64,simulacao_de_foto_pesada';
            const cars = [{ brand: 'Honda', model: 'Civic', photo: heavyPhoto }];
            
            await repo.save(cars, true, false);

            // Verifica localStorage (não deve ter a foto, deve ter imgId)
            const raw = JSON.parse(localStorage.getItem(TEST_KEY));
            assert(raw[0].photo === null, 'Foto deve ser null no localStorage');
            assert(raw[0].imgId !== undefined, 'Deve ter gerado um imgId');

            // Verifica ImageCache (deve ter a foto)
            const cachedImg = await MockImageCache.get(raw[0].imgId);
            assert(cachedImg === heavyPhoto, 'Foto deve estar salva no ImageCache');
        })();

        // Teste 4: Sincronização Remota (Prioridade da Nuvem)
        await (async () => {
            const mockRemote = setup();
            // Simula dados na nuvem
            mockRemote.data = [{ brand: 'Ferrari', model: 'F40', nick: 'Dream' }];
            
            const repo = new GarageRepository(TEST_KEY, mockRemote, MockImageCache);
            
            // Local está vazio, mas remoto tem dados
            const loaded = await repo.load();
            
            assert(loaded.length === 1 && loaded[0].brand === 'Ferrari', 'Deve carregar dados da nuvem se local estiver vazio ou desatualizado');
            
            // Verifica se atualizou o local automaticamente
            const localRaw = localStorage.getItem(TEST_KEY);
            assert(localRaw !== null, 'Deve atualizar o cache local após baixar da nuvem');
        })();

        // Teste 5: Salvar Remoto
        await (async () => {
            const mockRemote = setup();
            const repo = new GarageRepository(TEST_KEY, mockRemote, MockImageCache);
            
            const cars = [{ brand: 'VW', model: 'Fusca' }];
            await repo.save(cars, false, true); // Salva apenas remoto

            assert(mockRemote.saveCalled === true, 'Deve chamar o método save do remoteStorage');
            assert(mockRemote.data[0].model === 'Fusca', 'Dados devem ser passados para o remoteStorage');
        })();

        console.log('🎉 TODOS OS TESTES PASSARAM!');
        document.body.style.backgroundColor = '#1a331a';
        document.body.innerHTML += '<h1 style="color:#4caf50; text-align:center; margin-top:20px;">SUCESSO: Todos os testes passaram.</h1>';

    } catch (e) {
        console.error(e);
        document.body.style.backgroundColor = '#331a1a';
        document.body.innerHTML += `<h1 style="color:#ff4444; text-align:center; margin-top:20px;">FALHA: ${e.message}</h1>`;
    } finally {
        // Limpeza final
        localStorage.removeItem(TEST_KEY);
    }
}

runTests();