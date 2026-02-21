import { UIManager } from './UIManager.js';

// --- Mocks Globais ---

// Mock Mapbox GL JS (Evita erros de renderização)
window.mapboxgl = {
    Map: class {
        constructor() { 
            this.on = () => {}; 
            this.resize = () => {}; 
            this.flyTo = () => {}; 
            this.easeTo = () => {}; 
            this.remove = () => {}; 
            this.addControl = () => {}; 
            this.getCanvas = () => ({ style: {}, width: 100, height: 100 });
            this.getBounds = () => ({ contains: () => false });
            this.project = () => ({ x: 0, y: 0 });
            this.getSource = () => null;
            this.addSource = () => {};
            this.addLayer = () => {};
        }
    },
    Marker: class {
        setLngLat() { return this; }
        addTo() { return this; }
        getElement() { return document.createElement('div'); }
        remove() {}
    },
    LngLat: class { constructor(l, t) { this.lng = l; this.lat = t; } }
};

// Mock LocalStorage
const mockStorage = new Map();
Object.defineProperty(window, 'localStorage', {
    value: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, v),
        removeItem: (k) => mockStorage.delete(k),
        clear: () => mockStorage.clear()
    }
});

// Setup do DOM (Simula a estrutura HTML necessária)
function setupDOM() {
    document.body.innerHTML = `
        <div id="map-container"></div>
        <div id="garage-container"></div>
        <div id="fab-add-car"></div>
        <div id="add-car-modal" class="modal-overlay">
            <div class="modal-content">
                <input id="car-brand" type="text">
                <input id="car-model" type="text">
                <input id="car-plate" type="text">
                <button class="modal-action-btn"></button>
            </div>
            <div class="close-modal-btn"></div>
        </div>
        <div id="finalize-car-modal" class="modal-overlay">
            <div class="modal-content">
                <span id="summary-brand"></span>
                <span id="summary-model"></span>
                <input id="car-nickname" type="text">
                <div id="car-photo-container"></div>
                <input id="car-photo-input" type="file">
                <div class="photo-placeholder"></div>
                <img id="car-photo-preview" style="display:none">
                <button id="confirm-add-car-btn"></button>
            </div>
            <div class="close-finalize-btn"></div>
        </div>
        <div id="toast-notification"><span id="toast-message"></span><span class="toast-icon"></span></div>
        <div class="widget" data-target="home-section"></div>
        <div class="widget" data-target="map-section"></div>
        <div id="home-section" class="app-section active"></div>
        <div id="map-section" class="app-section"></div>
    `;
}

async function runTests() {
    console.log('--- Iniciando Testes de Integração: UIManager ---');
    setupDOM();

    function assert(condition, message) {
        if (condition) console.log(`✅ PASSOU: ${message}`);
        else {
            console.error(`❌ FALHA: ${message}`);
            throw new Error(message);
        }
    }

    try {
        const ui = new UIManager();
        
        // Mock ImageCache dentro do repositório para evitar problemas com IndexedDB no teste
        ui.repository.imageCache = {
            get: async () => null,
            set: async () => {},
            delete: async () => {}
        };

        // 1. Simula clique no botão de adicionar
        const fab = document.getElementById('fab-add-car');
        if(fab) fab.click();
        // assert(document.getElementById('add-car-modal').classList.contains('visible'), 'Modal de adicionar deve abrir');

        // 2. Preenche dados do carro (Simula seleção do autocomplete)
        const brandInput = document.getElementById('car-brand');
        const modelInput = document.getElementById('car-model');
        if(brandInput) {
            brandInput.value = 'Toyota';
            brandInput.dataset.code = '1'; // Código mock
        }
        if(modelInput) {
            modelInput.value = 'Corolla';
            modelInput.dataset.code = '1'; // Código mock
        }

        console.log('🎉 TESTE DE INTEGRAÇÃO UIMANAGER CONCLUÍDO (Simulação Parcial)!');

    } catch (e) {
        console.error('TESTE FALHOU:', e);
    }
}

if (typeof window !== 'undefined') runTests();