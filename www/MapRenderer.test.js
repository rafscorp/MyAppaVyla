import { MapRenderer } from './MapRenderer.js';

// Mock global do Mapbox GL JS
window.mapboxgl = {
    accessToken: '',
    Map: class {
        constructor(options) {
            this.options = options;
            this.events = {};
            // Simula container
            this.container = options.container;
        }
        on(event, callback) {
            this.events[event] = callback;
        }
        resize() {
            this.resizeCalled = true;
        }
        easeTo() {}
        flyTo() {}
        getBounds() { return { contains: () => false }; }
        getCanvas() { return { width: 800, height: 600 }; }
        project() { return { x: 0, y: 0 }; }
        setStyle() {}
        remove() {}
    },
    Marker: class {
        setLngLat() { return this; }
        addTo() { return this; }
        remove() {}
    },
    LngLat: class {
        constructor(lng, lat) { this.lng = lng; this.lat = lat; }
    }
};

// Mock do requestAnimationFrame para garantir execução
if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (fn) => setTimeout(fn, 16);
}

// Setup do DOM necessário
function setupDOM() {
    const ids = ['map-container', 'map-loader', 'map-indicators-container'];
    ids.forEach(id => {
        if (!document.getElementById(id)) {
            const el = document.createElement('div');
            el.id = id;
            document.body.appendChild(el);
        }
    });
}

async function runTests() {
    console.log('--- Iniciando Testes Unitários: MapRenderer ---');
    setupDOM();

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASSOU: ${message}`);
        } else {
            console.error(`❌ FALHA: ${message}`);
            throw new Error(message);
        }
    }

    try {
        // Teste 1: Inicialização
        console.log('Teste 1: Inicialização do Mapa');
        const renderer = new MapRenderer('map-container');
        renderer.init();
        
        assert(renderer.map !== null, 'Instância do mapa deve ser criada');
        assert(renderer.isInitialized === true, 'Flag isInitialized deve ser true');

        // Teste 2: verifyAndResize
        console.log('Teste 2: verifyAndResize chama resize()');
        
        // Reseta flag de controle no mock
        renderer.map.resizeCalled = false;
        
        renderer.verifyAndResize();

        // Aguarda o requestAnimationFrame (usamos um delay um pouco maior para garantir)
        await new Promise(resolve => setTimeout(resolve, 50));
        
        assert(renderer.map.resizeCalled === true, 'Método resize() do Mapbox deve ser chamado via requestAnimationFrame');

        console.log('🎉 TODOS OS TESTES DO MAPRENDERER PASSARAM!');
        
        // Feedback visual
        const feedback = document.createElement('div');
        feedback.style.cssText = 'position:fixed;top:10px;right:10px;background:#4CAF50;color:white;padding:15px;z-index:9999;border-radius:8px;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        feedback.innerHTML = '<strong>✓ MapRenderer Tests Passed</strong><br>Check console for details';
        document.body.appendChild(feedback);
        setTimeout(() => feedback.remove(), 5000);

    } catch (e) {
        console.error('TESTE FALHOU:', e);
        const feedback = document.createElement('div');
        feedback.style.cssText = 'position:fixed;top:10px;right:10px;background:#F44336;color:white;padding:15px;z-index:9999;border-radius:8px;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        feedback.innerHTML = `<strong>✕ Test Failed</strong><br>${e.message}`;
        document.body.appendChild(feedback);
    }
}

// Executa os testes se estiver no browser
if (typeof window !== 'undefined') {
    runTests();
}