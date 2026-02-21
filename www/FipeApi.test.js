import { FipeApi } from './FipeApi.js';

async function runTests() {
    console.log('--- Iniciando Testes Unitários: FipeApi ---');

    // Mock fetch para simular resposta da API
    const originalFetch = window.fetch;
    window.fetch = async (url) => {
        if (url.includes('marcas')) {
            return {
                ok: true,
                json: async () => [{ nome: 'Fiat', codigo: '21' }]
            };
        }
        if (url.includes('modelos')) {
            return {
                ok: true,
                json: async () => ({ modelos: [{ nome: 'Uno', codigo: '1' }] })
            };
        }
        return { ok: false };
    };

    function assert(condition, message) {
        if (condition) console.log(`✅ PASSOU: ${message}`);
        else {
            console.error(`❌ FALHA: ${message}`);
            throw new Error(message);
        }
    }

    try {
        // Teste 1: Get Brands
        const brands = await FipeApi.getBrands();
        assert(brands.length > 0, 'Deve retornar lista de marcas');
        assert(brands[0].nome.includes('Fiat'), 'Deve conter Fiat');

        // Teste 2: Get Models
        const models = await FipeApi.getModels('21', 'carros');
        assert(models.length > 0, 'Deve retornar lista de modelos');
        assert(models[0].nome === 'Uno', 'Deve conter Uno');

        console.log('🎉 TODOS OS TESTES DA FIPEAPI PASSARAM!');
    } catch (e) {
        console.error('TESTE FALHOU:', e);
    } finally {
        window.fetch = originalFetch; // Restaura fetch original
    }
}

if (typeof window !== 'undefined') runTests();