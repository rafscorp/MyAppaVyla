import { ImageCache } from './ImageCache.js';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css'; // Importa CSS para ser bundlado

export class MapRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = [];
        this.isInitialized = false;
        this.userLocationMarker = null;
        this.hasIndicatorEvents = false;
        // Token público para Mapbox (Substitua pelo seu se necessário)
        this.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    }

    init() {
        if (this.isInitialized || !document.getElementById(this.containerId)) return;

        if (mapboxgl) {
            mapboxgl.accessToken = this.accessToken;
            const isDark = localStorage.getItem('theme') === 'dark';
            
            this.map = new mapboxgl.Map({
                container: this.containerId,
                style: isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
                center: [-46.6333, -23.5505],
                zoom: 11,
                attributionControl: false
            });

            this.map.on('load', () => {
                this.isInitialized = true;
                const loader = document.getElementById('map-loader');
                if (loader) loader.classList.remove('visible');
                this.map.resize(); // Força ajuste inicial
            });

            // Log de erros do Mapbox para debug
            this.map.on('error', (e) => {
                console.warn('[Mapbox] Erro:', e.error);
                // Se for erro de autenticação (401), esconde o loader para não travar a UI
                if (e.error && (e.error.status === 401 || (e.error.message && e.error.message.includes('access token')))) {
                    const loader = document.getElementById('map-loader');
                    if (loader) {
                        loader.textContent = 'Erro de Token';
                        setTimeout(() => loader.classList.remove('visible'), 2000);
                    }
                }
            });
        }
    }

    setTheme(isDark) {
        if (this.map) {
            this.map.setStyle(isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11');
        }
    }

    renderMarkers(cars, onMarkerClick) {
        if (!this.map) return;

        // 1. LIMPEZA: Remove marcadores antigos para evitar duplicação
        this.clearMarkers();

        // 2. RENDERIZAÇÃO: Cria novos marcadores
        cars.forEach((car, index) => {
            if (!car.location) return;

            const el = document.createElement('div');
            el.className = 'custom-map-marker';
            
            // Tenta usar foto, se não tiver, usa placeholder
            if (car.photo) {
                el.style.backgroundImage = `url(${car.photo})`;
            } else if (car.imgId) {
                // Carregamento assíncrono da imagem do cache
                ImageCache.get(car.imgId).then(base64 => {
                    if (base64) el.style.backgroundImage = `url(${base64})`;
                });
                el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;">⏳</div>';
            } else {
                el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;">🚘</div>';
            }

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                onMarkerClick(index);
                this.updateSelection(index);
            });

            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat([car.location.lng, car.location.lat])
                .addTo(this.map);

            this.markers.push(marker);
        });
    }

    clearMarkers() {
        if (this.markers && this.markers.length > 0) {
            this.markers.forEach(marker => marker.remove());
            this.markers = [];
        }
    }

    updateSelection(index) {
        this.markers.forEach((marker, i) => {
            const el = marker.getElement();
            if (i === index) {
                el.classList.add('selected');
                el.style.zIndex = '100';
            } else {
                el.classList.remove('selected');
                el.style.zIndex = '1';
            }
        });
    }

    flyTo(location, zoom = 16) {
        if (this.map && location) {
            this.map.flyTo({
                center: [location.lng, location.lat],
                zoom: zoom,
                speed: 1.5
            });
        }
    }

    verifyAndResize() {
        if (this.map) {
            // Pequeno delay para garantir que o CSS display:flex já foi aplicado
            setTimeout(() => {
                this.map.resize();
                // Re-render markers to ensure they are positioned correctly after resize
                // Note: Mapbox handles this internally usually, but this forces a sync
            }, 100);
        } else {
            this.init();
        }
    }

    updateUserLocation(coords) {
        if (!this.map) return;
        if (!this.userLocationMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-marker';
            this.userLocationMarker = new mapboxgl.Marker({ element: el })
                .setLngLat(coords)
                .addTo(this.map);
        } else {
            this.userLocationMarker.setLngLat(coords);
        }
    }

    updateOffscreenIndicators(cars) {
        // Limpa indicadores antigos para evitar artefatos
        const container = document.getElementById('map-indicators-container');
        if (container) container.innerHTML = ''; 
    }
}