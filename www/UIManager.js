import { ImageCache } from './ImageCache.js';
import { FipeApi } from './FipeApi.js';
import { GarageRepository } from './GarageRepository.js';
import { RemoteStorage } from './RemoteStorage.js';
import { MapRenderer } from './MapRenderer.js';
import { Logger } from './Logger.js';
import { UIQueueManager } from './UIQueueManager.js';
import { VirtualScroller } from './VirtualScroller.js';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export class UIManager {
    constructor() {
        // FASE 2: Safe Constructor Hydration - Apenas estado inicial
        this.widgets = [];
        this.repository = null;
        this.brandsData = [];
        this.modelsData = [];
        this.garage = [];
        this.debounceTimer = null;
        this.tempCarData = {};
        this.cropState = { x: 0, y: 0, scale: 1 };
        this.isManualMode = false;
        this.currentFilterQuery = '';
        this.carToDeleteIndex = null;
        this.carToEditIndex = null;
        this.cropper = null;
        this.editCropper = null;
        this.cropCallback = null;
        this.photoQuality = 0.9;
        this.editDirty = false;
        this.mapScrollHandler = null;
        this.mapRenderer = null;
        this.isSwiping = false;
        this.undoTimeout = null;
        this.lastRemovedCar = null;
        this.toastTimeout = null;
        this.virtualScroller = null;
        this.remoteStorage = null;
        
        // State tracking for tab switching stability
        this.currentTab = null;
        this.mapResizeTimeout = null;
        this.virtualScrollRaf = null;

        // Bind methods to ensure 'this' context
        this.setupNicknameValidation = this.setupNicknameValidation.bind(this);
        this.addSafeClickListener = this.addSafeClickListener.bind(this);
    }

    // Helper para Feedback Tátil (Haptics)
    vibrate(ms = 8) {
        try {
            Haptics.impact({ style: ImpactStyle.Light });
        } catch (e) {
            if (navigator.vibrate) navigator.vibrate(ms);
        }
    }

    async init() {
        // 🛡️ METHOD EXISTENCE GUARD
        this._guardMethod('setupNicknameValidation');
        this._guardMethod('handleRemoveAvatar');
        this._guardMethod('initResponsiveSystem');
        this._guardMethod('initRippleEffect');

        try {
            this.widgets = document.querySelectorAll('.widget');
            this.repository = new GarageRepository();
            await this.repository.init(); // 🔄 WAIT FOR REPO: Garante sync configurado
            
            // Inicializa Remote Storage (Supabase)
            this.remoteStorage = new RemoteStorage();
            this.remoteStorage.setupAutoSync(() => this.garage);

            this.mapRenderer = new MapRenderer('map-container');
            
            // Executa lógica funcional
            this._setupEventListeners();
            this.initRippleEffect();
            this.setupNicknameValidation('car-nickname', 'nickname-validation');
            this.setupNicknameValidation('edit-nickname-input', 'edit-nickname-validation');
            this.initResponsiveSystem();
            this.restoreLastTab();
        } catch (e) {
            console.error('[UIManager] Critical Init Error:', e);
        }
    }

    _guardMethod(methodName) {
        if (typeof this[methodName] !== 'function') {
            console.warn(`[AUTO-STUB] Metodo ausente: ${methodName}`);
            Object.defineProperty(this, methodName, {
                value: function() {
                    console.warn(`[STUB] Chamada para ${methodName} ignorada.`);
                },
                writable: true
            });
        }
    }

    restoreLastTab() {
        const lastTabId = localStorage.getItem('last_active_tab');
        let targetWidget = null;

        if (lastTabId) {
            targetWidget = document.querySelector(`.widget[data-target="${lastTabId}"]`);
        }

        if (!targetWidget) {
            targetWidget = document.querySelector('.widget[data-target="home-section"]');
        }

        if (targetWidget) {
            this.setActive(targetWidget);
        }
    }

    setupNicknameValidation(inputId, feedbackId) {
        const input = document.getElementById(inputId);
        const feedback = document.getElementById(feedbackId);

        if (!input) return;

        input.addEventListener('input', () => {
            const hasInvalidChar = /[^a-zA-Z0-9\u00C0-\u00FF ]/.test(input.value);
            if (hasInvalidChar) {
                input.classList.add('input-error');
                if (feedback) feedback.classList.add('visible');
            } else {
                input.classList.remove('input-error');
                if (feedback) feedback.classList.remove('visible');
            }
        });
    }

    handleRemoveAvatar(e, imgDisplay, defaultAvatar) {
        e.stopPropagation();
        const btn = e.currentTarget;
        
        ImageCache.delete('profile_photo').then(() => {
            imgDisplay.src = defaultAvatar;
            imgDisplay.classList.add('default-avatar');
            if (btn && btn.parentNode) {
                btn.parentNode.removeChild(btn);
            }
            this.showToast('Foto removida');
        }).catch(err => {
            console.error('Erro ao remover foto:', err);
            this.showToast('Erro ao remover foto', 'error');
        });
    }

    // Helper Robusto para Cliques em Mobile/Desktop
    addSafeClickListener(element, callback) {
        if (!element) return;
        
        const handler = (e) => {
            e.stopPropagation();
            // Se for touch, previne o mouse emulado e executa
            if (e.type === 'touchstart') {
                if (e.cancelable) e.preventDefault();
                callback(e);
            } else if (e.type === 'click') {
                // Se for click genuíno (desktop), executa
                callback(e);
            }
        };

        element.addEventListener('touchstart', handler, { passive: false });
        element.addEventListener('click', handler);
    }

    _setupEventListeners() {
        // Carrega o carro salvo no localStorage ao iniciar
        this.loadCarsFromStorage();

        // Tratamento Global de Erros (API/Rede)
        window.addEventListener('unhandledrejection', (event) => {
            console.warn('[Global Error]', event.reason);
            let msg = 'Erro de conexão ou servidor.';
            if (event.reason && event.reason.message) {
                if (event.reason.message.toLowerCase().includes('fetch') || event.reason.message.toLowerCase().includes('network')) msg = 'Verifique sua conexão com a internet.';
                else msg = event.reason.message;
            }
            this.showToast(msg, 'error');
        });

        // Tratamento Global de Imagens Quebradas (Fallback para UI)
        document.addEventListener('error', (e) => {
            if (e.target.tagName === 'IMG' && !e.target.dataset.hasError) {
                e.target.dataset.hasError = 'true';
                e.target.style.display = 'none'; // Esconde ícone quebrado
                
                // Fallback para botões críticos de ícone
                const p = e.target.parentElement;
                if (p) {
                    if (p.classList.contains('edit-car-btn')) { p.textContent = '✎'; p.style.color = '#fff'; p.style.fontSize = '20px'; }
                    else if (p.classList.contains('remove-car-btn')) { p.textContent = '×'; p.style.color = '#fff'; p.style.fontSize = '24px'; }
                    else if (p.id === 'header-add-car-btn') { p.textContent = '+'; p.style.fontSize = '24px'; }
                    else if (p.id === 'header-options-btn') { p.textContent = '⋮'; p.style.fontSize = '20px'; }
                }
            }
        }, true);

        // Validação defensiva para Widgets
        if (this.widgets && this.widgets.length > 0) {
            this.widgets.forEach(widget => {
            const handleInteraction = (e) => {
                // Impede que o evento chegue ao Input.js (Canvas)
                e.stopPropagation();

                // Previne "ghost clicks" duplicados em dispositivos touch
                if (e.type === 'touchstart' && e.cancelable) {
                    e.preventDefault();
                }

                this.setActive(widget);
            };

            // Listeners para Mobile (Touch) e Desktop (Click)
            widget.addEventListener('touchstart', handleInteraction, { passive: false }); // Non-passive needed for preventDefault
            widget.addEventListener('click', handleInteraction, { passive: true });
            });
        }

        this.setupAutocomplete();

        // Modal Logic
        const addBtn = document.getElementById('fab-add-car');
        const modal = document.getElementById('add-car-wizard'); // CORREÇÃO: ID atualizado para o Wizard
        const closeBtn = modal ? modal.querySelector('.close-modal-btn') : null;
        const actionBtn = modal ? modal.querySelector('.modal-action-btn') : null;
        const manualModeBtn = document.getElementById('manual-mode-btn');

        // Lógica do Modo Manual
        if (manualModeBtn) {
            manualModeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.isManualMode = !this.isManualMode;
                
                const brandInput = document.getElementById('car-brand');
                const modelInput = document.getElementById('car-model');
                
                if (this.isManualMode) {
                    manualModeBtn.innerHTML = '<img src="img/edit.svg" alt=""><span>Voltar para busca automática</span>';
                    brandInput.placeholder = "(Manual) Digite a Marca";
                    modelInput.placeholder = "(Manual) Digite o Modelo";
                    modelInput.disabled = false;
                    // Limpa sugestões se estiverem abertas
                    document.querySelectorAll('.suggestions-list').forEach(el => el.classList.remove('visible'));
                } else {
                    this.resetAddCarForm(); // Reseta para o estado inicial (automático)
                }
            });
        }

        if (addBtn && modal) {
            // Lógica unificada de abertura
            const openAddModal = () => {
                console.log('[UI] Opening Add Car Modal');
                this.vibrate(15); // Feedback tátil ao abrir
                modal.classList.add('visible');
                this.resetAddCarForm(); // Garante estado limpo ao abrir
                this.loadBrands(); // Carrega marcas apenas ao abrir (Anti-DDoS)
            };
            
            // Usa o listener seguro
            this.addSafeClickListener(addBtn, openAddModal);
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener('touchstart', (e) => this.handleModalClose(e), { passive: false }); // Non-passive needed
            closeBtn.addEventListener('click', (e) => this.handleModalClose(e));
        }

        // Lógica de Adicionar Carro (Simulação CarApi)
        if (actionBtn && modal) {
            const handleAdd = (e) => {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                this.vibrate(10);

                const brandInput = document.getElementById('car-brand');
                const modelInput = document.getElementById('car-model');
                const plateInput = document.getElementById('car-plate');

                // Pega o valor digitado e o código armazenado no dataset
                const brand = brandInput.value.trim();
                const model = modelInput.value.trim();
                const plate = plateInput ? plateInput.value.trim() : '';
                let brandCode = brandInput.dataset.code;
                let modelCode = modelInput.dataset.code;

                // Auto-seleção Inteligente (Apenas no modo automático)
                if (!this.isManualMode && !brandCode && this.brandsData.length > 0) {
                    const match = this.brandsData.find(b => b.nome.toLowerCase() === brand.toLowerCase());
                    if (match) brandCode = match.codigo;
                }

                // Validação: Se for manual, exige apenas texto. Se for auto, exige código.
                if ((!this.isManualMode && !brandCode) || (this.isManualMode && brand.length === 0)) {
                    brandInput.classList.add('input-error');
                    this.showToast('Selecione uma marca da lista', 'error');
                    // Remove erro ao digitar
                    brandInput.addEventListener('input', () => brandInput.classList.remove('input-error'), { once: true });
                    setTimeout(() => {
                        brandInput.classList.remove('input-error');
                    }, 2000); // Mantém o ícone por mais tempo ou até digitar
                    return;
                }

                // Auto-seleção para Modelo (Apenas no modo automático)
                if (!this.isManualMode && !modelCode && this.modelsData.length > 0) {
                    const match = this.modelsData.find(m => m.nome.toLowerCase() === model.toLowerCase());
                    if (match) modelCode = match.codigo;
                }

                // Validação do Modelo
                if ((!this.isManualMode && this.modelsData.length > 0 && !modelCode) || (this.isManualMode && model.length === 0)) {
                    modelInput.classList.add('input-error');
                    this.showToast('Selecione um modelo da lista', 'error');
                    modelInput.addEventListener('input', () => modelInput.classList.remove('input-error'), { once: true });
                    setTimeout(() => modelInput.classList.remove('input-error'), 2000);
                    return;
                }

                // Armazena dados temporários e avança para a tela de foto
                this.tempCarData = { brand, model, plate, brandCode: this.isManualMode ? null : brandCode, modelCode: this.isManualMode ? null : modelCode };
                
                // Fecha modal atual e abre o de finalização
                modal.classList.remove('visible');
                this.openFinalizeModal();
            };
            actionBtn.addEventListener('touchstart', handleAdd, { passive: false }); // Non-passive needed
            actionBtn.addEventListener('click', handleAdd, { passive: true });
        }

        // Fechar ao clicar fora
        if (modal) {
            modal.addEventListener('click', (e) => this.handleModalClose(e));
        }

        // Lógica do Modo Escuro
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        if (darkModeToggle) {
            const isDark = localStorage.getItem('theme') === 'dark';
            if (isDark) {
                document.body.classList.add('dark-mode');
                darkModeToggle.checked = true;
            }

            darkModeToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    document.body.classList.add('dark-mode');
                    localStorage.setItem('theme', 'dark');
                    this.mapRenderer.setTheme(true);
                } else {
                    document.body.classList.remove('dark-mode');
                    localStorage.setItem('theme', 'light');
                    this.mapRenderer.setTheme(false);
                }
            });
        }

        // Lógica de Notificações (Ajustes)
        const notificationsToggle = document.getElementById('notifications-toggle');
        if (notificationsToggle) {
            const areNotificationsEnabled = localStorage.getItem('notifications_enabled') !== 'false'; // Default true
            notificationsToggle.checked = areNotificationsEnabled;

            const updateState = (checked) => {
                localStorage.setItem('notifications_enabled', checked);
            };

            notificationsToggle.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                updateState(isChecked);

                // Sincroniza com permissões do sistema (Android 13+)
                if (isChecked && window.cordova && window.cordova.plugins && window.cordova.plugins.permissions) {
                    const permissions = window.cordova.plugins.permissions;
                    const p = 'android.permission.POST_NOTIFICATIONS';
                    
                    permissions.checkPermission(p, (status) => {
                        if (!status.hasPermission) {
                            permissions.requestPermission(p, () => {}, () => {
                                // Se o usuário negar no sistema, reverte o toggle
                                notificationsToggle.checked = false;
                                updateState(false);
                                this.showToast('Permissão negada pelo sistema', 'error');
                            });
                        }
                    });
                }
            });

            // Permite clicar na linha inteira para alternar
            const row = notificationsToggle.closest('.setting-item');
            if (row) {
                row.addEventListener('click', (e) => {
                    // Se clicou no switch, deixa o evento nativo rolar
                    if (e.target.closest('.switch')) return;
                    
                    notificationsToggle.checked = !notificationsToggle.checked;
                    updateState(notificationsToggle.checked);
                });
            }
        }

        // Lógica de Temas (Cores)
        const themeOptions = document.querySelectorAll('.theme-option');
        const savedTheme = localStorage.getItem('app_theme') || 'theme-blue';
        document.body.classList.add(savedTheme);

        themeOptions.forEach(option => {
            if (option.dataset.theme === savedTheme) option.classList.add('active');

            const handleThemeSelect = (e) => {
                e.stopPropagation();
                if (e.type === 'touchstart' && e.cancelable) e.preventDefault();

                themeOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                // Remove temas antigos
                document.body.classList.remove('theme-blue', 'theme-red', 'theme-green', 'theme-gold', 'theme-purple');
                
                const newTheme = option.dataset.theme;
                document.body.classList.add(newTheme);
                localStorage.setItem('app_theme', newTheme);
            };

            option.addEventListener('click', handleThemeSelect);
            option.addEventListener('touchstart', handleThemeSelect, { passive: false }); // Non-passive needed
        });

        // Lógica do Botão de Suporte
        const supportBtn = document.querySelector('.setting-item:has(img[src*="support.svg"])');
        if (supportBtn) {
            const openSupport = (e) => {
                e.stopPropagation();
                window.open('https://seusite.com/suporte', '_blank'); // Substitua pelo seu link
            };
            supportBtn.addEventListener('click', openSupport);
            supportBtn.addEventListener('touchstart', openSupport, { passive: false });
        }

        // Lógica do Botão de Segurança
        // Usa seletor inteligente para encontrar o botão pelo ícone, já que não adicionei ID no HTML para manter consistência com os outros
        const securityBtn = document.querySelector('.setting-item:has(img[src*="lock.svg"])');
        if (securityBtn) {
            const handleSecurity = () => {
                this.showToast('Configurações de segurança em breve');
            };
            securityBtn.addEventListener('click', handleSecurity);
        }

        // Lógica do Modal Sobre o App
        const aboutBtn = document.getElementById('about-app-btn');
        const aboutModal = document.getElementById('about-app-modal');
        const closeAboutBtn = document.getElementById('close-about-btn');

        if (aboutBtn && aboutModal) {
            aboutBtn.addEventListener('click', () => aboutModal.classList.add('visible'));
        }

        if (closeAboutBtn && aboutModal) {
            closeAboutBtn.addEventListener('click', () => aboutModal.classList.remove('visible'));
            aboutModal.addEventListener('click', (e) => { if(e.target === aboutModal) aboutModal.classList.remove('visible'); });
        }

        // Lógica do Modal de Descarte
        const discardModal = document.getElementById('confirm-discard-modal');
        const confirmDiscardBtn = document.getElementById('confirm-discard-btn');
        const cancelDiscardBtn = document.getElementById('cancel-discard-btn');

        if (confirmDiscardBtn) {
            confirmDiscardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetAddCarForm();
                document.getElementById('add-car-wizard').classList.remove('visible'); // CORREÇÃO ID
                if (discardModal) discardModal.classList.remove('visible');
            });
        }

        if (cancelDiscardBtn) {
            cancelDiscardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (discardModal) discardModal.classList.remove('visible');
            });
        }

        // Lógica do Modal de Finalização (Foto)
        const finalizeModal = document.getElementById('finalize-car-modal');
        const closeFinalizeBtn = document.querySelector('.close-finalize-btn');
        const photoContainer = document.getElementById('car-photo-container');
        const photoInput = document.getElementById('car-photo-input');
        const confirmAddBtn = document.getElementById('confirm-add-car-btn');

        if (closeFinalizeBtn) {
            closeFinalizeBtn.addEventListener('click', () => {
                // Ao fechar a finalização, volta para o primeiro modal para não perder dados
                finalizeModal.classList.remove('visible');
                document.getElementById('add-car-wizard').classList.add('visible'); // CORREÇÃO ID
            });
        }

        if (photoContainer && photoInput) {
            photoContainer.addEventListener('click', () => photoInput.click());
            photoInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.processImage(file, (base64) => {
                        this.openCropModal(base64, NaN, (croppedBase64) => {
                            this.tempCarData.photo = croppedBase64;
                            const preview = document.getElementById('car-photo-preview');
                            if (preview) {
                                preview.src = croppedBase64;
                                preview.style.display = 'block';
                            }
                            document.querySelector('.photo-placeholder').style.display = 'none';
                        });
                    });
                }
            });
        }

        if (confirmAddBtn) {
            confirmAddBtn.addEventListener('click', () => {
                const nickInput = document.getElementById('car-nickname');
                const nick = nickInput.value.trim();

                if (!this.tempCarData.photo) {
                    photoContainer.classList.add('error');
                    setTimeout(() => photoContainer.classList.remove('error'), 500);
                    return;
                }

                // Validação de Caracteres Especiais
                if (/[^a-zA-Z0-9\u00C0-\u00FF ]/.test(nick)) {
                    nickInput.classList.add('input-error');
                    // Força o feedback visual a aparecer se não estiver visível
                    const feedback = document.getElementById('nickname-validation');
                    if (feedback) feedback.classList.add('visible');
                    return;
                }

                // Validação de Limite de Caracteres (Máx 25)
                if (nick.length > 25) {
                    nickInput.classList.add('input-error');
                    this.showToast('Apelido muito longo (máx 25). Por favor, abrevie.');
                    setTimeout(() => nickInput.classList.remove('input-error'), 2000);
                    return;
                }

                // Validação de Duplicidade (Marca + Modelo + Apelido)
                const isDuplicate = this.garage.some(c => 
                    c.brand === this.tempCarData.brand && 
                    c.model === this.tempCarData.model && 
                    c.nick === nick
                );

                if (isDuplicate) {
                    nickInput.classList.add('input-error');
                    nickInput.addEventListener('input', () => nickInput.classList.remove('input-error'), { once: true });
                    setTimeout(() => nickInput.classList.remove('input-error'), 2000);
                    return;
                }

                this.tempCarData.nick = nick;
                this.finalizeAddCar();
            });
        }

        // Lógica do Modal de Edição Unificado (Nome + Crop)
        const editModal = document.getElementById('edit-nickname-modal');
        const saveEditBtn = document.getElementById('save-edit-btn');
        const closeEditBtn = document.getElementById('close-edit-btn');
        const editPhotoPlaceholder = document.getElementById('edit-photo-placeholder');
        const editPhotoInputHidden = document.getElementById('edit-photo-input-hidden');
        const editChangePhotoOverlay = document.getElementById('edit-change-photo-overlay');
        const editPlateInput = document.getElementById('edit-plate-input');

        // Controles do Edit Modal
        const editRotateBtn = document.getElementById('edit-rotate-btn');
        const editZoomSlider = document.getElementById('edit-zoom-slider');

        // Rastreamento de Alterações (Dirty State)
        const editNickInput = document.getElementById('edit-nickname-input');
        const clearEditNickBtn = document.getElementById('clear-edit-nickname');

        if (editNickInput) {
            editNickInput.addEventListener('input', (e) => {
                this.checkEditDirtyState();
                this.updateCharCounter(e.target, 'edit-nickname-counter', 25);
                this.toggleClearBtn(clearEditNickBtn, e.target.value.length > 0);
            });
        }
        if (clearEditNickBtn) {
            clearEditNickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editNickInput.value = '';
                editNickInput.focus();
                this.toggleClearBtn(clearEditNickBtn, false);
                this.updateCharCounter(editNickInput, 'edit-nickname-counter', 25);
                this.checkEditDirtyState();
            });
        }
        if (editPlateInput) editPlateInput.addEventListener('input', () => this.checkEditDirtyState());

        const nickInput = document.getElementById('car-nickname');
        const clearNickBtn = document.getElementById('clear-nickname');
        if (nickInput) {
            nickInput.addEventListener('input', (e) => {
                this.updateCharCounter(e.target, 'nickname-counter', 25);
                this.toggleClearBtn(clearNickBtn, e.target.value.length > 0);
            });
        }
        if (clearNickBtn) {
            clearNickBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                nickInput.value = '';
                nickInput.focus();
                this.toggleClearBtn(clearNickBtn, false);
                this.updateCharCounter(nickInput, 'nickname-counter', 25);
            });
        }

        // Listeners de Controles de Edição
        if (editRotateBtn) {
            editRotateBtn.addEventListener('click', () => {
                if (this.editCropper) this.editCropper.rotate(90);
                this.photoChanged = true;
                this.checkEditDirtyState();
            });
        }
        if (editZoomSlider) {
            editZoomSlider.addEventListener('input', (e) => {
                if (this.editCropper) this.editCropper.zoomTo(parseFloat(e.target.value));
                this.photoChanged = true;
                this.checkEditDirtyState();
            });
        }

        // Botão Reset Zoom (Edição)
        const editResetZoomBtn = document.getElementById('edit-reset-zoom-btn');
        if (editResetZoomBtn) {
            editResetZoomBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.editCropper) {
                    this.editCropper.reset();
                    // Sincroniza o slider com o zoom resetado
                    const imageData = this.editCropper.getImageData();
                    const ratio = imageData.width / imageData.naturalWidth;
                    if (editZoomSlider) editZoomSlider.value = ratio;
                    this.photoChanged = true;
                    this.checkEditDirtyState();
                }
            });
        }

        // Upload de Foto no Edit Modal
        const triggerEditUpload = () => editPhotoInputHidden.click();
        if (editPhotoPlaceholder) editPhotoPlaceholder.addEventListener('click', triggerEditUpload);
        if (editChangePhotoOverlay) editChangePhotoOverlay.addEventListener('click', triggerEditUpload);

        if (editPhotoInputHidden) {
            editPhotoInputHidden.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.processImage(file, (base64) => {
                        this.setupEditCropper(base64);
                        this.photoChanged = true;
                        this.checkEditDirtyState();
                    });
                }
            });
        }

        // Validação da Placa no Modal de Edição
        if (editPlateInput) {
            editPlateInput.addEventListener('input', (e) => {
                let value = e.target.value.toUpperCase();
                value = value.replace(/[^A-Z0-9 -]/g, '');
                if ((value.match(/-/g) || []).length > 1) {
                    const firstIndex = value.indexOf('-');
                    value = value.substring(0, firstIndex + 1) + value.substring(firstIndex + 1).replace(/-/g, '');
                }
                if ((value.match(/ /g) || []).length > 1) {
                    const firstIndex = value.indexOf(' ');
                    value = value.substring(0, firstIndex + 1) + value.substring(firstIndex + 1).replace(/ /g, '');
                }
                e.target.value = value;
            });
        }

        if (closeEditBtn) {
            const handleClose = (e) => {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                
                if (this.editDirty) {
                    const sdModal = document.getElementById('save-discard-modal');
                    if (sdModal) sdModal.classList.add('visible');
                } else {
                    this.closeEditModal();
                }
            };
            closeEditBtn.addEventListener('click', handleClose);
            closeEditBtn.addEventListener('touchstart', handleClose, { passive: false }); // Non-passive needed
        }

        if (saveEditBtn) {
            const handleSave = (e) => {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                this.vibrate(10);
                this.saveEdit();
            };
            saveEditBtn.addEventListener('click', handleSave);
            saveEditBtn.addEventListener('touchstart', handleSave, { passive: false }); // Non-passive needed
        }

        // Lógica do Modal Salvar/Descartar
        const sdSave = document.getElementById('sd-save-btn');
        const sdDiscard = document.getElementById('sd-discard-btn');
        const sdCancel = document.getElementById('sd-cancel-btn');
        const sdModal = document.getElementById('save-discard-modal');

        // Helper para adicionar touch e click com prevenção de duplicidade
        const addTouchClick = (btn, callback) => {
            if (!btn) return;
            const handler = (e) => {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                callback();
            };
            btn.addEventListener('click', handler);
            btn.addEventListener('touchstart', handler, { passive: false }); // Non-passive needed
        };

        addTouchClick(sdSave, () => {
            this.saveEdit();
            if (sdModal) sdModal.classList.remove('visible');
        });

        addTouchClick(sdDiscard, () => {
            if (sdModal) sdModal.classList.remove('visible');
            this.closeEditModal();
        });

        addTouchClick(sdCancel, () => {
            if (sdModal) sdModal.classList.remove('visible');
        });

        // Lógica do Modal de Exclusão
        const deleteModal = document.getElementById('delete-car-modal');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');

        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => {
                this.performDelete();
            });
        }

        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', () => {
                if (deleteModal) deleteModal.classList.remove('visible');
                this.carToDeleteIndex = null;
            });
        }

        // Lógica do Modal de Remoção de Foto de Perfil
        const removePhotoModal = document.getElementById('remove-photo-modal');
        const confirmRemovePhotoBtn = document.getElementById('confirm-remove-photo-btn');
        const cancelRemovePhotoBtn = document.getElementById('cancel-remove-photo-btn');

        if (confirmRemovePhotoBtn) {
            confirmRemovePhotoBtn.addEventListener('click', () => {
                if (removePhotoModal) removePhotoModal.classList.remove('visible');
                ImageCache.delete('profile_photo').then(() => {
                    this.renderGarage();
                    this.showToast('Foto removida');
                });
            });
        }

        if (cancelRemovePhotoBtn) {
            cancelRemovePhotoBtn.addEventListener('click', () => {
                if (removePhotoModal) removePhotoModal.classList.remove('visible');
            });
        }

        // Lógica do Modal de Editar Nome
        const editUsernameModal = document.getElementById('edit-username-modal');
        const saveUsernameBtn = document.getElementById('save-username-btn');
        const cancelUsernameBtn = document.getElementById('cancel-username-btn');
        const usernameInput = document.getElementById('username-input');

        if (saveUsernameBtn) {
            saveUsernameBtn.addEventListener('click', () => {
                const newName = usernameInput.value.trim();
                if (newName) {
                    localStorage.setItem('user_name', newName);
                    this.renderGarage();
                    if (editUsernameModal) editUsernameModal.classList.remove('visible');
                }
            });
        }

        if (cancelUsernameBtn) {
            cancelUsernameBtn.addEventListener('click', () => {
                if (editUsernameModal) editUsernameModal.classList.remove('visible');
            });
        }

        // Fechar modal de edição ao clicar fora
        if (editModal) {
            editModal.addEventListener('click', (e) => {
                if (e.target === editModal) {
                    if (this.editDirty) {
                        const sdModal = document.getElementById('save-discard-modal');
                        if (sdModal) sdModal.classList.add('visible');
                    } else {
                        this.closeEditModal();
                    }
                }
            });
        }

        this.initCropLogic();
    }

    initCropLogic() {
        const confirmBtn = document.getElementById('confirm-crop-btn');
        const cancelBtn = document.getElementById('cancel-crop-btn');
        const btnRotateLeft = document.getElementById('rotate-left-btn');
        const btnRotateRight = document.getElementById('rotate-right-btn');
        const btnFlipH = document.getElementById('flip-h-btn');
        const btnFlipV = document.getElementById('flip-v-btn');
        const slider = document.getElementById('crop-zoom-slider');
        const btnResetZoom = document.getElementById('crop-reset-zoom-btn');

        // Slider Zoom
        if (slider) {
            slider.addEventListener('input', (e) => {
                if (this.cropper) {
                    this.cropper.zoomTo(parseFloat(e.target.value));
                }
            });
        }

        // Botão Reset Zoom (Recorte Inicial)
        if (btnResetZoom) {
            btnResetZoom.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.cropper) {
                    this.cropper.reset();
                    const imageData = this.cropper.getImageData();
                    const ratio = imageData.width / imageData.naturalWidth;
                    if (slider) slider.value = ratio;
                }
            });
        }

        // Ferramentas Avançadas
        if (btnRotateLeft) btnRotateLeft.addEventListener('click', () => this.cropper && this.cropper.rotate(-90));
        if (btnRotateRight) btnRotateRight.addEventListener('click', () => this.cropper && this.cropper.rotate(90));
        
        if (btnFlipH) btnFlipH.addEventListener('click', () => {
            if(this.cropper) {
                const datum = this.cropper.getData();
                this.cropper.scaleX(-datum.scaleX);
            }
        });
        
        if (btnFlipV) btnFlipV.addEventListener('click', () => {
            if(this.cropper) {
                const datum = this.cropper.getData();
                this.cropper.scaleY(-datum.scaleY);
            }
        });

        // Buttons
        if (confirmBtn) confirmBtn.addEventListener('click', () => this.performCrop());
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeCropModal();
            });
        }
    }

    updateCharCounter(input, counterId, limit) {
        const counter = document.getElementById(counterId);
        if (!counter) return;
        
        const len = input.value.length;
        counter.textContent = `${len}/${limit}`;
        
        counter.classList.remove('warning', 'limit');
        if (len >= limit) {
            counter.classList.add('limit');
        } else if (len >= limit - 5) {
            counter.classList.add('warning');
        }
    }

    openCropModal(imageSrc, aspectRatio = NaN, callback = null) {
        this.cropCallback = callback;
        const modal = document.getElementById('crop-modal');
        const img = document.getElementById('crop-image');
        const slider = document.getElementById('crop-zoom-slider');

        img.src = imageSrc;
        modal.classList.add('visible');

        // Destrói instância anterior se existir
        if (this.cropper) {
            this.cropper.destroy();
        }

        // Inicializa Cropper.js
        // Pequeno delay para garantir que o modal esteja visível e o layout calculado
        setTimeout(() => {
            this.cropper = new Cropper(img, {
                viewMode: 1, // Restringe a caixa de corte ao canvas
                dragMode: 'move', // Permite mover a imagem
                aspectRatio: aspectRatio,
                autoCropArea: 1, // Começa maximizado
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true, // Permite redimensionar a caixa!
                toggleDragModeOnDblclick: false,
                zoomable: true,
                zoomOnTouch: true,
                zoomOnWheel: true,
                ready: () => {
                    // Zoom automático para caber (Fit)
                    if (this.cropper) {
                        const imageData = this.cropper.getImageData();
                        const ratio = imageData.width / imageData.naturalWidth;
                        if (slider) slider.value = ratio;
                    }
                },
                zoom: (e) => {
                    if (slider) slider.value = e.detail.ratio;
                }
            });
        }, 100);
    }

    closeCropModal() {
        const modal = document.getElementById('crop-modal');
        modal.classList.remove('visible');
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        // Limpa inputs de arquivo
        const pInput = document.getElementById('car-photo-input');
        if(pInput) pInput.value = '';
        const eInput = document.getElementById('edit-photo-input');
        if(eInput) eInput.value = '';
    }

    performCrop() {
        if (!this.cropper) return;

        // Obtém o canvas recortado do Cropper.js
        const canvas = this.cropper.getCroppedCanvas({
           imageSmoothingQuality: 'medium',
           maxWidth: 1920, // 1080p
           maxHeight: 1920
        });

        if (!canvas) return;

        const croppedBase64 = canvas.toDataURL('image/jpeg', this.photoQuality);
        
        if (this.cropCallback) {
            this.cropCallback(croppedBase64);
        } else {
            // Fallback: Modo Adição (Finalize Modal)
            this.tempCarData.photo = croppedBase64;
            const preview = document.getElementById('car-photo-preview');
            if (preview) {
                preview.src = croppedBase64;
                preview.style.display = 'block';
            }
            document.querySelector('.photo-placeholder').style.display = 'none';
        }

        this.closeCropModal();
    }

    handleBackButton() {
        // 1. Modais (Prioridade Alta)
        const visibleModals = document.querySelectorAll('.modal-overlay.visible');
        if (visibleModals.length > 0) {
            // Pega o último modal aberto (maior z-index implícito)
            const topModal = visibleModals[visibleModals.length - 1];
            
            // Lógica específica para modais aninhados
            if (topModal.id === 'finalize-car-modal') {
                topModal.classList.remove('visible');
                document.getElementById('add-car-wizard').classList.add('visible'); // CORREÇÃO ID
                return true;
            }

            // Modal Salvar/Descartar
            if (topModal.id === 'save-discard-modal') {
                topModal.classList.remove('visible');
                return true;
            }

            if (topModal.id === 'add-car-wizard') { // CORREÇÃO ID
                // Sempre pede confirmação ao voltar no Android
                document.getElementById('confirm-discard-modal').classList.add('visible');
                return true;
            }

            if (topModal.id === 'crop-modal') {
                this.closeCropModal();
                return true;
            }

            // Modal Sobre o App
            if (topModal.id === 'about-app-modal') {
                topModal.classList.remove('visible');
                return true;
            }

            // Fecha o modal
            topModal.classList.remove('visible');
            
            // Limpezas de estado
            if (topModal.id === 'edit-nickname-modal') {
                if (this.editDirty) {
                    const sdModal = document.getElementById('save-discard-modal');
                    if (sdModal) sdModal.classList.add('visible');
                    return true;
                }
                this.closeEditModal();
                return true;
            }

            return true; // Evento consumido
        }

        // 2. Listas de Sugestão (Prioridade Média)
        const suggestions = document.querySelectorAll('.suggestions-list.visible');
        if (suggestions.length > 0) {
            suggestions.forEach(el => el.classList.remove('visible'));
            return true;
        }

        return false; // Não consumido (Engine pode sair do app)
    }

    openFinalizeModal() {
        const modal = document.getElementById('finalize-car-modal');
        document.getElementById('summary-brand').textContent = this.tempCarData.brand;
        document.getElementById('summary-model').textContent = this.tempCarData.model;
        
        const nickInput = document.getElementById('car-nickname');
        if (nickInput) {
            nickInput.value = '';
            this.updateCharCounter(nickInput, 'nickname-counter', 25);
            this.toggleClearBtn(document.getElementById('clear-nickname'), false);
        }

        // Resetar estado da foto
        document.getElementById('car-photo-input').value = '';
        document.getElementById('car-photo-preview').style.display = 'none';
        document.getElementById('car-photo-preview').src = '';
        document.querySelector('.photo-placeholder').style.display = 'flex';
        delete this.tempCarData.photo;

        modal.classList.add('visible');
    }

    finalizeAddCar() {
        // Só fecha os modais se o registro for bem-sucedido (não duplicado)
        if (this.registerCar(this.tempCarData)) {
            this.vibrate([10, 50, 10]); // Sucesso: vibração dupla
            document.getElementById('finalize-car-modal').classList.remove('visible');
            this.resetAddCarForm();
            this.tempCarData = {}; // Limpa dados temporários
            // Toast removido para evitar stutter no loop de renderização
        }
    }

    getOrientation(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const view = new DataView(e.target.result);
                if (view.getUint16(0, false) !== 0xFFD8) return callback(-2);
                const length = view.byteLength;
                let offset = 2;
                while (offset < length) {
                    if (offset + 4 > length) break;
                    const marker = view.getUint16(offset, false);
                    offset += 2;
                    if (marker === 0xFFE1) {
                        if (view.getUint32(offset + 2, false) !== 0x45786966) return callback(-1);
                        const little = view.getUint16(offset + 8, false) === 0x4949;
                        offset += 8;
                        const tagsOffset = offset + view.getUint32(offset + 4, little);
                        if (tagsOffset + 2 > length) return callback(-1);
                        const tags = view.getUint16(tagsOffset, little);
                        for (let i = 0; i < tags; i++) {
                            const entryOffset = tagsOffset + 2 + (i * 12);
                            if (entryOffset + 12 > length) return callback(-1);
                            if (view.getUint16(entryOffset, little) === 0x0112) {
                                return callback(view.getUint16(entryOffset + 8, little));
                            }
                        }
                    } else if ((marker & 0xFF00) !== 0xFF00) {
                        break;
                    } else {
                        offset += view.getUint16(offset, false);
                    }
                }
                return callback(-1);
            } catch (err) {
                console.warn('[UIManager] EXIF Read Error:', err);
                return callback(-1);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    processImage(file, callback, maxWidth = 1920, maxHeight = 1920) { // Padrão 1080p
        this.getOrientation(file, (orientation) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let width = img.width;
                    let height = img.height;

                    // Se estiver rotacionado (5-8), inverte as dimensões para o cálculo de escala
                    if (orientation > 4 && orientation < 9) {
                        [width, height] = [height, width];
                    }

                    if (width > height) {
                        if (width > maxWidth) {
                            height *= maxWidth / width;
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width *= maxHeight / height;
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // Aplica rotação no contexto
                    switch (orientation) {
                        case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
                        case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
                        case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
                        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
                        case 6: ctx.transform(0, 1, -1, 0, width, 0); break;
                        case 7: ctx.transform(0, -1, -1, 0, width, height); break;
                        case 8: ctx.transform(0, -1, 1, 0, 0, height); break;
                        default: break;
                    }

                    // Desenha a imagem (se rotacionado, usa dimensões invertidas no drawImage)
                    if (orientation > 4 && orientation < 9) {
                        ctx.drawImage(img, 0, 0, height, width);
                    } else {
                        ctx.drawImage(img, 0, 0, width, height);
                    }

                    callback(canvas.toDataURL('image/jpeg', 0.9)); // Mantém alta qualidade na entrada para edição
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    resizeImageFromBase64(base64, maxWidth, maxHeight, callback) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            // Mantém aspect ratio
            const scale = Math.min(maxWidth / width, maxHeight / height);
            if (scale < 1) {
                width *= scale;
                height *= scale;
            }
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', this.photoQuality));
        };
        img.src = base64;
    }

    handleModalClose(e) {
        const modal = document.getElementById('add-car-wizard'); // CORREÇÃO ID
        if (!modal) return;

        // Se o evento for no modal (clique fora), verifica se o target é o próprio modal
        if (e.currentTarget === modal && e.target !== modal) return;

        e.stopPropagation();
        
        // Sempre pede confirmação ao tentar sair do modal de adicionar carro
        const discardModal = document.getElementById('confirm-discard-modal');
        if (discardModal) discardModal.classList.add('visible');
    }

    resetAddCarForm() {
        const brandInput = document.getElementById('car-brand');
        const modelInput = document.getElementById('car-model');
        const nickInput = document.getElementById('car-nickname');
        const plateInput = document.getElementById('car-plate');
        const manualModeBtn = document.getElementById('manual-mode-btn');
        
        if (brandInput) {
            brandInput.value = '';
            brandInput.dataset.code = '';
            delete brandInput.dataset.tipo;
            brandInput.disabled = false;
            brandInput.placeholder = "Digite a Marca";
            this.toggleClearBtn(document.getElementById('clear-brand'), false);
        }
        if (modelInput) {
            modelInput.value = '';
            modelInput.dataset.code = '';
            modelInput.disabled = true;
            modelInput.placeholder = "Selecione a Marca primeiro";
            this.toggleClearBtn(document.getElementById('clear-model'), false);
        }
        if (nickInput) {
            nickInput.value = '';
            this.toggleClearBtn(document.getElementById('clear-nickname'), false);
        }
        if (plateInput) {
            plateInput.value = '';
            this.toggleClearBtn(document.getElementById('clear-plate'), false);
            const counter = document.getElementById('plate-counter');
            if (counter) {
                counter.textContent = '0/8';
                counter.style.color = '';
            }
            // Reseta seleção para OLD
            const oldRadio = document.querySelector('input[name="plate-type"][value="OLD"]');
            if (oldRadio) oldRadio.checked = true;
            plateInput.maxLength = 8;
            plateInput.classList.remove('input-error');
        }
        
        this.isManualMode = false;
        // Reseta o botão para o estado inicial (oferecendo modo manual)
        if (manualModeBtn) manualModeBtn.innerHTML = '<img src="img/edit.svg" alt=""><span>Não achou o modelo? <b>Cadastrar Manualmente</b></span>';

        this.modelsData = [];
        
        const brandList = document.getElementById('car-brand-suggestions');
        const modelList = document.getElementById('car-model-suggestions');
        if (brandList) brandList.classList.remove('visible');
        if (modelList) modelList.classList.remove('visible');
    }

    setActive(targetWidget) {
        const targetId = targetWidget.dataset.target;
        
        // 🛡️ ANTI-FLICKER & STABILITY GUARD
        // Previne re-execução se a aba já estiver ativa ou troca duplicada
        if (this.currentTab === targetId) return;
        this.vibrate(5); // Feedback tátil leve na troca de abas
        this.currentTab = targetId;

        localStorage.setItem('last_active_tab', targetId);

        this.widgets.forEach(w => {
            if (w.dataset.target === targetId) w.classList.add('active');
            else w.classList.remove('active');
        });

        document.querySelectorAll('.app-section').forEach(sec => {
            if (sec.id === targetId) {
                sec.classList.add('active');
                
                // --- Lógica Específica da Aba MAPA ---
                if (targetId === 'map-section') {
                    // Renderiza lista imediatamente para evitar "buraco" visual
                    this.renderMapCarList(); 
                    
                    // Cancela timeout anterior se houver (troca rápida de abas)
                    if (this.mapResizeTimeout) clearTimeout(this.mapResizeTimeout);
                    
                    // Agenda resize do mapa com segurança e delay para transição CSS
                    this.mapResizeTimeout = setTimeout(() => {
                        // Verifica se o usuário AINDA está na aba de mapa
                        if (this.currentTab !== 'map-section') return;
                        
                        this.mapRenderer.verifyAndResize();
                        if (this.mapRenderer.map && !this.hasSetupMapControls) {
                            this.mapRenderer.map.resize(); // CORREÇÃO: Força o canvas a preencher o container
                            this.setupMapControls();
                        }
                    }, 150); // Delay aumentado para garantir estabilidade visual
                }

                // --- Lógica Específica da Aba HOME ---
                if (targetId === 'home-section' && this.virtualScroller) {
                    if (this.virtualScrollRaf) cancelAnimationFrame(this.virtualScrollRaf);
                    
                    this.virtualScrollRaf = requestAnimationFrame(() => {
                        if (this.currentTab !== 'home-section') return;
                        const vContainer = document.getElementById('virtual-scroll-container');
                        if (vContainer) this.virtualScroller.resize(vContainer.clientWidth);
                    });
                }
            } else {
                sec.classList.remove('active');
            }
        });

        const fab = document.querySelector('.fab-container') || document.getElementById('fab-add-car');
        if (fab) {
            if (targetId === 'home-section' && this.garage.length > 0) {
                fab.style.display = 'flex';
            } else {
                fab.style.display = 'none';
            }
        }
    }

    renderMapCarList() {
        const container = document.getElementById('map-car-list');
        if (!container) return;
        
        // Force layout recalculation for stability (Fixes missing cards on some DPIs)
        container.style.display = 'none';
        container.offsetHeight; // Trigger reflow
        container.style.display = 'flex';

        // Garante que a classe de estilo e comportamento esteja presente
        container.classList.add('map-car-grid');
        container.innerHTML = '';

        if (this.garage.length === 0) {
            container.innerHTML = '<div class="empty-garage-text" style="width:100%; text-align:center; margin-top:50px;">Nenhum carro na garagem.</div>';
            return;
        }

        // 1. Garantir que todos os carros tenham localização (Simulação)
        let locationsUpdated = false;
        const baseLat = -23.5505; // SP Centro
        const baseLng = -46.6333;
        
        this.garage.forEach(car => {
            if (!car.location) {
                // Gera deslocamento aleatório (~3-5km de raio)
                const latOff = (Math.random() - 0.5) * 0.06;
                const lngOff = (Math.random() - 0.5) * 0.06;
                car.location = { lat: baseLat + latOff, lng: baseLng + lngOff };
                locationsUpdated = true;
            }
        });

        if (locationsUpdated) this.repository.save(this.garage);

        // Rastreia o índice atual para evitar movimentos repetidos do mapa
        this.currentMapListIndex = -1;

        this.garage.forEach(car => {
            const item = document.createElement('div');
            item.className = 'map-car-item';
            
            const displayName = car.nick ? car.nick : `${car.brand} ${car.model}`;
            
            let imgHTML = `<div class="map-car-placeholder">🚘</div>`;
            
            if (car.photo) {
                imgHTML = `<img src="${car.photo}" class="map-car-photo" alt="${displayName}">`;
            } else if (car.imgId) {
                // Placeholder inicial
                imgHTML = `<img src="" class="map-car-photo lazy-map-img" decoding="async" data-img-id="${car.imgId}" alt="${displayName}">`;
                // Carregamento assíncrono
                ImageCache.get(car.imgId).then(base64 => {
                    const img = item.querySelector(`img[data-img-id="${car.imgId}"]`);
                    if (img && base64) img.src = base64;
                });
            }

            item.innerHTML = `
                <div class="map-car-card">
                    ${imgHTML}
                    <div class="map-car-info">
                        <div class="map-car-name-text">
                            <img src="img/location.svg" class="map-name-icon" alt="">
                            <span>${displayName}</span>
                        </div>
                        <button class="map-car-btn">
                            <img src="img/location.svg" alt="">
                            <span>Localizar</span>
                        </button>
                    </div>
                </div>
            `;
            
            // Adiciona ação ao botão Localizar
            const btn = item.querySelector('.map-car-btn');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.mapRenderer.flyTo(car.location);
                });
            }

            container.appendChild(item);
        });

        // Lógica das Setas de Navegação do Mapa
        const prevBtn = document.getElementById('map-prev-btn');
        const nextBtn = document.getElementById('map-next-btn');
        
        if (prevBtn && nextBtn) {
            // Clona para remover listeners antigos e evitar duplicidade
            const newPrev = prevBtn.cloneNode(true);
            const newNext = nextBtn.cloneNode(true);
            
            // Configura para transição suave (remove display: none do HTML e usa opacidade)
            newPrev.style.display = 'flex';
            newNext.style.display = 'flex';
            newPrev.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
            newNext.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
            
            prevBtn.parentNode.replaceChild(newPrev, prevBtn);
            nextBtn.parentNode.replaceChild(newNext, nextBtn);

            const handleScroll = () => {
                const scrollLeft = container.scrollLeft;
                const width = container.offsetWidth;
                const maxScroll = container.scrollWidth - width;
                
                if (this.garage.length <= 1) {
                    newPrev.style.opacity = '0';
                    newPrev.style.pointerEvents = 'none';
                    newPrev.classList.remove('pulsing');
                    newNext.style.opacity = '0';
                    newNext.style.pointerEvents = 'none';
                    newNext.classList.remove('pulsing');
                    return;
                }

                // Mostra setas baseado na posição (com fade suave)
                const showPrev = scrollLeft > 10;
                newPrev.style.opacity = showPrev ? '1' : '0';
                newPrev.style.pointerEvents = showPrev ? 'auto' : 'none';
                if (showPrev) newPrev.classList.add('pulsing'); else newPrev.classList.remove('pulsing');

                const showNext = scrollLeft < maxScroll - 10;
                newNext.style.opacity = showNext ? '1' : '0';
                newNext.style.pointerEvents = showNext ? 'auto' : 'none';
                if (showNext) newNext.classList.add('pulsing'); else newNext.classList.remove('pulsing');

                // Sincronização: Lista -> Mapa
                // Calcula qual carro está visível (snap)
                const index = Math.round(scrollLeft / width);
                this.mapRenderer.updateSelection(index); // Atualiza destaque do marcador
                if (this.currentMapListIndex !== index && this.garage[index]) {
                    this.currentMapListIndex = index;
                    const car = this.garage[index];
                    this.mapRenderer.flyTo(car.location, 16);
                }
            };

            newPrev.addEventListener('click', () => {
                container.scrollBy({ left: -container.offsetWidth, behavior: 'smooth' });
            });
            newNext.addEventListener('click', () => {
                container.scrollBy({ left: container.offsetWidth, behavior: 'smooth' });
            });
            
            // CORREÇÃO DE VAZAMENTO DE MEMÓRIA:
            // Remove o listener anterior antes de criar um novo
            if (this.mapScrollHandler) {
                container.removeEventListener('scroll', this.mapScrollHandler);
            }
            this.mapScrollHandler = handleScroll;

            // Monitora o scroll para atualizar setas em tempo real
            container.addEventListener('scroll', this.mapScrollHandler);
            
            // Verificação inicial (aguarda layout renderizar)
            setTimeout(handleScroll, 100);
        }

        // Atualiza marcadores no mapa se ele já existir
        if (this.mapRenderer.map) {
            this.mapRenderer.renderMarkers(this.garage, (index) => {
                // Callback ao clicar no marcador
                if (container) {
                    container.scrollTo({
                        left: index * container.offsetWidth,
                        behavior: 'smooth'
                    });
                }
            });
            this.mapRenderer.updateSelection(this.currentMapListIndex);
            this.mapRenderer.updateOffscreenIndicators(this.garage);
        }
        
        // Configura eventos de atualização do mapa para os indicadores
        if (this.mapRenderer.map && !this.mapRenderer.hasIndicatorEvents) {
            const update = () => this.mapRenderer.updateOffscreenIndicators(this.garage);
            this.mapRenderer.map.on('move', update);
            this.mapRenderer.map.on('zoom', update);
            this.mapRenderer.hasIndicatorEvents = true;
        }
    }

    initMap() {
        // Método mantido apenas para compatibilidade, mas delega para o renderer
        this.mapRenderer.init();
        this.setupMapControls();
    }

    setupMapControls() {
        // Lógica dos Controles Personalizados (Zoom, Bússola, Localização)
        // Movida para cá para manter o UIManager limpo, mas usando o mapRenderer.map
        const map = this.mapRenderer.map;
        if (!map) return;
        this.hasSetupMapControls = true;

        // Lógica dos Controles Personalizados
        const btnZoomIn = document.getElementById('map-zoom-in');
        const btnZoomOut = document.getElementById('map-zoom-out');
        const btnLocate = document.getElementById('map-locate-me');
        const btnCompass = document.getElementById('map-compass-btn');
        const compassIcon = document.getElementById('map-compass-icon');

        if (btnZoomIn) btnZoomIn.onclick = () => map.zoomIn();
        if (btnZoomOut) btnZoomOut.onclick = () => map.zoomOut();
        
        // Lógica da Bússola
        if (btnCompass && compassIcon) {
            // Clique: Reseta o mapa para o Norte
            const resetCompass = () => {
                map.easeTo({ bearing: 0, pitch: 0, duration: 1000 });
            };
            btnCompass.addEventListener('click', resetCompass);
            btnCompass.addEventListener('touchstart', (e) => { e.preventDefault(); resetCompass(); });

            // Orientação do Dispositivo
            if (window.DeviceOrientationEvent) {
                window.addEventListener('deviceorientation', (e) => {
                    // Verifica se o evento é válido (alguns browsers disparam com null)
                    if (e.alpha === null && e.webkitCompassHeading === undefined) return;

                    let rotation = 0;
                    if (e.webkitCompassHeading) {
                        rotation = -e.webkitCompassHeading; // iOS
                    } else if (e.alpha !== null) {
                        rotation = e.alpha; // Android (Geralmente alpha aumenta anti-horário)
                    }
                    compassIcon.style.transform = `rotate(${rotation}deg)`;
                }, true);
            }
        }

        if (btnLocate) {
            btnLocate.onclick = () => {
                btnLocate.classList.add('pulsing'); // Ativa efeito visual
                Geolocation.getCurrentPosition({ enableHighAccuracy: true }).then(pos => {
                    const coords = [pos.coords.longitude, pos.coords.latitude];
                    this.mapRenderer.flyTo({lng: coords[0], lat: coords[1]}, 15);
                    this.mapRenderer.updateUserLocation(coords);
                    btnLocate.classList.remove('pulsing');
                }).catch(err => {
                    this.showToast('Erro ao obter localização');
                    btnLocate.classList.remove('pulsing');
                    console.error(err);
                });
            };
        }
        // Tenta localizar o usuário assim que o mapa carregar
        if (this.mapRenderer.map) {
            this.mapRenderer.map.on('load', () => {
                if (btnLocate) btnLocate.click();
                this.renderMapCarList();
            });
        }
    }

    async loadCarsFromStorage() {
        this.garage = await this.repository.load();
        this.renderGarage();

        // Se a aba ativa for o mapa, atualiza a lista do mapa também
        const mapSection = document.getElementById('map-section');
        if (mapSection && mapSection.classList.contains('active')) {
            this.renderMapCarList();
        }
    }

    registerCar(data) {
        this.garage.push(data);
        this.repository.save(this.garage);
        this.renderGarage();
        
        // Persistência na Nuvem (Background)
        if (this.remoteStorage) {
            this.remoteStorage.save(this.garage).catch(e => console.warn('[Cloud] Save failed', e));
        }

        return true; // Retorna true indicando sucesso
    }

    // --- Sistema de Cache para API (Performance) ---
    getCachedData(key) {
        const item = localStorage.getItem(key);
        if (!item) return null;
        try {
            const parsed = JSON.parse(item);
            // Cache válido por 7 dias (dados da FIPE mudam mensalmente)
            if (Date.now() - parsed.ts < 7 * 24 * 60 * 60 * 1000) {
                return parsed.data;
            }
        } catch (e) { return null; }
        return null;
    }

    setCachedData(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
        } catch (e) { console.warn('Storage Quota Exceeded'); }
    }

    renderGarage() {
        const container = document.getElementById('garage-container');
        const fabContainer = document.querySelector('.fab-container') || document.getElementById('fab-add-car');

        // FASE 2: Unificação da Barra Inferior - Visibilidade Incondicional e Correção de ID
        const bottomPanel = document.getElementById('bottom-panel');
        if (bottomPanel) {
            bottomPanel.style.display = 'flex';
            // Garante que o painel vazio antigo (se existir por cache) seja ocultado
            const oldEmptyPanel = document.getElementById('bottom-panel-empty');
            if (oldEmptyPanel) oldEmptyPanel.style.display = 'none';
        }
        
        if (!container) return;
        container.innerHTML = '';
        this.currentBgIndex = -1; // Reset para forçar atualização do background
        const savedIndex = this.currentCarIndex || 0; // Salva índice atual
        
        if (this.virtualScroller) {
            this.virtualScroller.destroy();
            this.virtualScroller = null;
        }
        
        // Verifica se a seção Home está ativa para decidir sobre o FAB
        const homeSection = document.getElementById('home-section');
        const isHomeActive = homeSection && homeSection.classList.contains('active');

        // Com carros: mostra o FAB e cria a estrutura da garagem
        // Apenas se estiver na seção Home
        if (fabContainer) {
            fabContainer.style.display = (isHomeActive && this.garage.length > 0) ? 'flex' : 'none';
        }
        
        // Alterna para o widget completo
        if (this.garage.length === 0) {
            // Renderiza estado vazio no container principal
            container.innerHTML = `
                <div class="empty-garage-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; width:100%; gap:20px;">
                    <div style="font-size:18px; font-weight:600; color:var(--text-secondary);">Sua garagem está vazia</div>
                    <button id="add-first-car-btn" class="modal-action-btn" style="width:auto; padding:0 30px;">
                        Adicionar Carro
                    </button>
                </div>
            `;
            const btn = container.querySelector('#add-first-car-btn');
            
            // FASE 3: Delegação de Eventos Segura para Botão Injetado (Programação Defensiva)
            this.addSafeClickListener(btn, () => {
                this.vibrate(10);
                const modal = document.getElementById('add-car-wizard'); // CORREÇÃO ID
                if (modal) {
                    this.resetAddCarForm(); // Reseta o formulário para estado limpo
                    this.loadBrands();      // Inicia carregamento de marcas
                    modal.classList.add('visible');
                }
            });
            return;
        }

        const garageBox = document.createElement('div');
        garageBox.className = 'garage-box';
        const showArrows = this.garage.length > 1 ? '' : 'display: none;';
        
        const defaultAvatar = "img/profile.svg";
        // Carregamento inicial síncrono (placeholder) para não bloquear a renderização
        let hasCustomPhoto = false; 
        const userName = localStorage.getItem('user_name') || 'Adrian';
        
        // Lógica de Data e Saudação (Dashboard)
        const now = new Date();
        const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
        let dateStr = now.toLocaleDateString('pt-BR', dateOptions);
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1); // Capitaliza primeira letra
        const hour = now.getHours();
        const greeting = hour < 12 ? 'Bom dia' : (hour < 18 ? 'Boa tarde' : 'Boa noite');

        garageBox.innerHTML = `
            <div class="dashboard-summary">
                <span class="dashboard-date">${dateStr}</span>
                <div class="dashboard-greeting">${greeting}, <span class="highlight-name">${userName}</span></div>
            </div>

            <div class="garage-header">
                <div style="position: relative; flex-shrink: 0;">
                    <div class="profile-avatar" id="profile-avatar-btn">
                        <img src="${defaultAvatar}" alt="Profile" id="profile-img-display" class="default-avatar">
                        <input type="file" id="profile-upload-input" accept="image/*" style="display: none;">
                    </div>
                    <!-- Botão de remover será injetado via JS se houver foto -->
                </div>
                <div class="header-info">
                    <span class="garage-title">Veículos de <span class="highlight-name">${userName}</span></span>
                    <span class="garage-subtitle">${this.garage.length} Veículo${this.garage.length !== 1 ? 's' : ''}</span>
                </div>
                <div style="margin-left: auto; display: flex; gap: 10px; align-items: center;">
                    <div class="header-add-btn" id="header-add-car-btn">
                        <img src="img/car.svg" alt="Adicionar">
                    </div>
                    <div class="header-options-btn" id="header-options-btn"><img src="img/more.svg" alt="Opções"></div>
                </div>
            </div>
            
            <div class="garage-card-frame">
                <!-- PULL TO REFRESH INDICATOR -->
                <div id="pull-refresh-indicator" class="pull-refresh-indicator">
                    <div class="pull-refresh-content">
                        <svg class="pull-refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                        <span>Puxe para atualizar</span>
                    </div>
                </div>

                <div style="position: relative; width: 100%;">
                    <div id="garage-list"></div>
                    <div id="virtual-scroll-container" style="position: relative; width: 100%; height: 100%; overflow-x: auto; overflow-y: hidden; display: none;"></div>
                </div>
                <div class="carousel-indicators"></div>
                
                <div class="garage-controls-row">
                    <div class="nav-arrow left" style="${showArrows}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></div>
                    <div class="car-card-actions">
                        <button class="card-action-btn" id="home-locate-btn">
                            <img src="img/location.svg" alt="Localizar">
                            <span>Localizar</span>
                        </button>
                        <button class="card-action-btn">
                            <img src="img/notifications.svg" alt="Alertas">
                            <span>Alertas</span>
                        </button>
                    </div>
                    <div class="nav-arrow right" style="${showArrows}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></div>
                </div>
            </div>
        `;
        container.appendChild(garageBox);
        const garageList = garageBox.querySelector('#garage-list');
        const virtualContainer = garageBox.querySelector('#virtual-scroll-container');
        const indicatorsContainer = garageBox.querySelector('.carousel-indicators');
        const leftArrow = garageBox.querySelector('.nav-arrow.left');
        const rightArrow = garageBox.querySelector('.nav-arrow.right');

        // Inicializa Pull-to-Refresh no frame do card
        const cardFrame = garageBox.querySelector('.garage-card-frame');
        if (cardFrame) this.initPullToRefresh(cardFrame);

        // --- Carregamento Assíncrono da Foto de Perfil (IndexedDB) ---
        const imgDisplay = garageBox.querySelector('#profile-img-display');
        const avatarContainer = garageBox.querySelector('.profile-avatar').parentElement;

        ImageCache.get('profile_photo').then(base64 => {
            if (base64) {
                imgDisplay.src = base64;
                imgDisplay.classList.remove('default-avatar');
            }
        });

        // Lógica do Botão Localizar (Home)
        const homeLocateBtn = garageBox.querySelector('#home-locate-btn');
        if (homeLocateBtn) {
            homeLocateBtn.addEventListener('click', () => {
                this.vibrate(10);
                const index = this.currentCarIndex || 0;
                const car = this.garage[index];
                
                if (car) {
                    // 1. Muda para a aba do Mapa
                    const mapWidget = document.querySelector('.widget[data-target="map-section"]');
                    if (mapWidget) this.setActive(mapWidget);
                    
                    // 2. Aguarda transição e foca no carro
                    setTimeout(() => {
                        // Scroll na lista do mapa para o carro certo
                        const mapList = document.getElementById('map-car-list');
                        if (mapList && mapList.children[index]) {
                            mapList.scrollTo({
                                left: mapList.children[index].offsetLeft,
                                behavior: 'smooth'
                            });
                        }
                        // Move o mapa para a localização do carro
                        if (this.mapRenderer.map && car.location) {
                            this.mapRenderer.flyTo(car.location);
                        }
                    }, 100);
                }
            });
        }

        // Lógica do Botão Adicionar (+)
        const headerAddBtn = garageBox.querySelector('#header-add-car-btn');
        if (headerAddBtn) {
            this.addSafeClickListener(headerAddBtn, () => {
                this.vibrate(10);
                const modal = document.getElementById('add-car-wizard'); // CORREÇÃO ID
                if (modal) {
                    modal.classList.add('visible');
                    this.resetAddCarForm();
                    this.loadBrands();
                }
            });
        }

        // Lógica do Botão de Opções (Três Pontos)
        const headerOptionsBtn = garageBox.querySelector('#header-options-btn');
        const optionsModal = document.getElementById('garage-options-modal');
        
        if (headerOptionsBtn && optionsModal) {
            headerOptionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                
                optionsModal.classList.add('visible');
            });

            // Ações do Menu
            const btnEditName = document.getElementById('opt-edit-username');
            const btnChangePhoto = document.getElementById('opt-change-photo');
            const btnRemovePhoto = document.getElementById('opt-remove-photo');
            const btnLogout = document.getElementById('opt-logout');
            const btnCancel = document.getElementById('opt-cancel');

            const closeOptions = () => optionsModal.classList.remove('visible');

            if (btnEditName) {
                btnEditName.onclick = () => {
                    closeOptions();
                    const modal = document.getElementById('edit-username-modal');
                    const input = document.getElementById('username-input');
                    if (modal && input) {
                        input.value = localStorage.getItem('user_name') || 'Adrian';
                        modal.classList.add('visible');
                        setTimeout(() => input.focus(), 100);
                    }
                };
            }

            if (btnChangePhoto) {
                btnChangePhoto.onclick = () => {
                    closeOptions();
                    const input = garageBox.querySelector('#profile-upload-input');
                    if (input) input.click();
                };
            }

            if (btnRemovePhoto) {
                btnRemovePhoto.onclick = () => {
                    closeOptions();
                    const modal = document.getElementById('remove-photo-modal');
                    if (modal) modal.classList.add('visible');
                };
            }

            if (btnLogout) {
                btnLogout.onclick = () => {
                    closeOptions();
                    // Apenas visual por enquanto
                };
            }

            btnCancel.onclick = closeOptions;
            optionsModal.onclick = (e) => { if(e.target === optionsModal) closeOptions(); };
        }

        // Lógica de Upload de Foto de Perfil
        const avatarBtn = garageBox.querySelector('#profile-avatar-btn');
        const uploadInput = garageBox.querySelector('#profile-upload-input');

        if (avatarBtn && uploadInput) {
            // Clique direto na foto desativado. Apenas via menu "Alterar Foto".
            
            uploadInput.addEventListener('click', (e) => e.stopPropagation());

            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.processImage(file, (base64) => {
                        // Abre modal de recorte quadrado (1:1)
                        this.openCropModal(base64, 1, (croppedBase64) => {
                            // Redimensiona para 512x512 para economizar localStorage
                            this.resizeImageFromBase64(croppedBase64, 512, 512, (finalBase64) => {
                                ImageCache.set('profile_photo', finalBase64).then(() => {
                                    imgDisplay.src = finalBase64;
                                    imgDisplay.classList.remove('default-avatar');
                                    
                                    // Adiciona botão de remover se não existir
                                    if (!garageBox.querySelector('#remove-avatar-btn')) {
                                        const btn = document.createElement('div');
                                        btn.className = 'remove-avatar-btn';
                                        btn.id = 'remove-avatar-btn';
                                        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                                        btn.addEventListener('click', (ev) => this.handleRemoveAvatar(ev, imgDisplay, defaultAvatar));
                                        avatarBtn.parentElement.appendChild(btn);
                                    }

                                    this.showToast('Foto de perfil atualizada');
                                }).catch(err => {
                                    this.showToast('Erro: Imagem muito grande');
                                    console.error(err);
                                });
                            });
                        });
                    });
                }
            });
        }

        // Se houver muitos carros (> 10), usa Virtual Scrolling
        if (this.garage.length > 10) {
            garageList.style.display = 'none';
            virtualContainer.style.display = 'block';
            
            // Estima a largura do item baseada na largura do container (assumindo 1 item por vez no carrossel)
            // Como o layout é responsivo, precisamos recalcular isso no resize ou usar 100%
            const itemWidth = virtualContainer.clientWidth || window.innerWidth; // Fallback

            this.virtualScroller = new VirtualScroller(virtualContainer, this.garage, (car, index) => {
                return this.createCarSlotElement(car, index);
            }, itemWidth);
            
            // Atualiza largura do item ao redimensionar
            window.addEventListener('resize', () => {
                if (this.virtualScroller) {
                    this.virtualScroller.itemWidth = virtualContainer.clientWidth;
                    this.virtualScroller.onScroll();
                }
            });

            // Restaura posição do scroll baseada no índice salvo
            if (savedIndex > 0 && savedIndex < this.garage.length) {
                virtualContainer.scrollLeft = savedIndex * itemWidth;
            }

            // Lógica de Navegação do Carrossel (Adaptada para Virtual Scroll)
            const updateCarouselState = () => {
                const scrollLeft = virtualContainer.scrollLeft;
                const width = virtualContainer.offsetWidth;
                const index = Math.round(scrollLeft / width);
                this.currentCarIndex = index;
                
                if (this.garage.length > 1) {
                    leftArrow.style.opacity = index > 0 ? '1' : '0.3';
                    leftArrow.style.pointerEvents = index > 0 ? 'auto' : 'none';
                    if (index > 0) leftArrow.classList.add('pulsing'); else leftArrow.classList.remove('pulsing');
                    rightArrow.style.opacity = index < this.garage.length - 1 ? '1' : '0.3';
                    rightArrow.style.pointerEvents = index < this.garage.length - 1 ? 'auto' : 'none';
                    if (index < this.garage.length - 1) rightArrow.classList.add('pulsing'); else rightArrow.classList.remove('pulsing');
                }

                // Atualiza dots (limitado para performance se forem muitos)
                // Se tiver muitos carros, talvez seja melhor não renderizar todos os dots ou usar paginação
                if (this.garage.length <= 20) {
                     const dots = indicatorsContainer.querySelectorAll('.carousel-dot');
                     dots.forEach((d, i) => {
                        if (i === index) d.classList.add('active');
                        else d.classList.remove('active');
                     });
                }

                this.updateAppBackground(index);
            };

            leftArrow.addEventListener('click', () => virtualContainer.scrollBy({ left: -virtualContainer.offsetWidth, behavior: 'smooth' }));
            rightArrow.addEventListener('click', () => virtualContainer.scrollBy({ left: virtualContainer.offsetWidth, behavior: 'smooth' }));
            
            virtualContainer.addEventListener('scroll', () => {
                window.requestAnimationFrame(updateCarouselState);
            }, { passive: true });

            // Cria dots (limitado)
            if (this.garage.length <= 20) {
                this.garage.forEach((_, index) => {
                    const dot = document.createElement('div');
                    dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`;
                    dot.addEventListener('click', () => {
                        virtualContainer.scrollTo({
                            left: index * virtualContainer.offsetWidth,
                            behavior: 'smooth'
                        });
                    });
                    indicatorsFragment.appendChild(dot);
                });
                indicatorsContainer.appendChild(indicatorsFragment);
            }

            setTimeout(updateCarouselState, 100);
            this.updateLayoutScaling();
            return; // Sai da função, pois o resto é para renderização normal
        }

        // Otimização: DocumentFragment para evitar Reflows múltiplos
        const listFragment = document.createDocumentFragment();
        const indicatorsFragment = document.createDocumentFragment();

        // --- Lazy Loading Setup ---
        // OTIMIZAÇÃO: Desconecta observador anterior para evitar vazamento
        if (this.garageObserver) {
            this.garageObserver.disconnect();
        }

        this.garageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    this.loadCarImage(img);
                    observer.unobserve(img);
                }
            });
        }, {
            root: garageList,
            rootMargin: '0px 50% 0px 50%', // Carrega imagens próximas horizontalmente
            threshold: 0.01
        });

        this.garage.forEach((car, index) => {
            const slot = this.createCarSlotElement(car, index);
            listFragment.appendChild(slot);

            // Cria indicadores (dots)
            const dot = document.createElement('div');
            dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`;
            dot.addEventListener('click', () => {
                garageList.scrollTo({
                    left: index * garageList.offsetWidth,
                    behavior: 'smooth'
                });
            });
            indicatorsFragment.appendChild(dot);
        });

        // Inserção em lote no DOM (Muito mais rápido)
        garageList.appendChild(listFragment);
        indicatorsContainer.appendChild(indicatorsFragment);

        // Restaura posição do scroll para lista normal
        if (savedIndex > 0 && savedIndex < this.garage.length) {
            // Pequeno delay para garantir que o layout calculou a largura
            setTimeout(() => {
                garageList.scrollLeft = savedIndex * garageList.offsetWidth;
            }, 0);
        }

        // Ativa Observer nas imagens criadas
        garageList.querySelectorAll('.lazy-image').forEach(img => this.garageObserver.observe(img));

        // Lógica de Navegação do Carrossel
        const updateCarouselState = () => {
            const scrollLeft = garageList.scrollLeft;
            const width = garageList.offsetWidth;
            const index = Math.round(scrollLeft / width);
            this.currentCarIndex = index; // Atualiza índice global para ações do menu
            
            // Atualiza setas
            if (this.garage.length > 1) {
                leftArrow.style.opacity = index > 0 ? '1' : '0.3';
                leftArrow.style.pointerEvents = index > 0 ? 'auto' : 'none';
                if (index > 0) leftArrow.classList.add('pulsing'); else leftArrow.classList.remove('pulsing');
                rightArrow.style.opacity = index < this.garage.length - 1 ? '1' : '0.3';
                rightArrow.style.pointerEvents = index < this.garage.length - 1 ? 'auto' : 'none';
                if (index < this.garage.length - 1) rightArrow.classList.add('pulsing'); else rightArrow.classList.remove('pulsing');
            }

            // Atualiza dots
            const dots = indicatorsContainer.querySelectorAll('.carousel-dot');
            dots.forEach((d, i) => {
                if (i === index) {
                    d.classList.add('active');
                    // Centraliza o dot ativo na barra de rolagem
                    const container = indicatorsContainer;
                    if (container.scrollWidth > container.clientWidth) {
                        const scrollLeft = d.offsetLeft - (container.clientWidth / 2) + (d.offsetWidth / 2);
                        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
                    }
                } else d.classList.remove('active');
            });

            // OTIMIZAÇÃO: Reset de zoom agora é tratado pelo updateParallax

            // Atualiza background desfocado
            this.updateAppBackground(index);
        };

        leftArrow.addEventListener('click', () => garageList.scrollBy({ left: -garageList.offsetWidth, behavior: 'smooth' }));
        rightArrow.addEventListener('click', () => garageList.scrollBy({ left: garageList.offsetWidth, behavior: 'smooth' }));
        
        let garageScrollTicking = false;
        garageList.addEventListener('scroll', () => {
            if (!garageScrollTicking) {
                window.requestAnimationFrame(() => {
                    updateCarouselState();
                    this.updateParallax(); // Efeito Paralaxe
                    garageScrollTicking = false;
                });
                garageScrollTicking = true;
            }
        }, { passive: true });
        
        // Inicializa estado
        setTimeout(() => { updateCarouselState(); this.updateParallax(); }, 100);
        this.updateLayoutScaling();
    }

    initPullToRefresh(element) {
        let startY = 0;
        let isPulling = false;
        const indicator = element.querySelector('#pull-refresh-indicator');
        const icon = element.querySelector('.pull-refresh-icon');
        const content = element.querySelector('.pull-refresh-content');
        const text = content.querySelector('span');
        
        // Usa o próprio elemento como alvo do toque
        element.addEventListener('touchstart', (e) => {
            // Só permite puxar se estiver no topo da página (caso haja scroll vertical global)
            if (window.scrollY > 5) return;
            
            startY = e.touches[0].clientY;
            isPulling = true;
            indicator.style.transition = 'none';
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            const y = e.touches[0].clientY;
            const delta = y - startY;

            // Apenas movimento para baixo
            if (delta > 0) {
                // Fator de resistência (0.4) para sensação elástica
                const pullHeight = Math.min(delta * 0.4, 120); 
                
                if (pullHeight > 0) {
                    // Previne scroll nativo da página se estiver puxando o card
                    if (e.cancelable && delta > 5) e.preventDefault();
                    
                    indicator.style.height = `${pullHeight}px`;
                    
                    if (pullHeight > 10) {
                        content.style.opacity = '1';
                        content.style.transform = 'translateY(0)';
                    }

                    if (pullHeight >= 60) {
                        icon.style.transform = 'rotate(180deg)';
                        text.textContent = 'Solte para atualizar';
                    } else {
                        icon.style.transform = 'rotate(0deg)';
                        text.textContent = 'Puxe para atualizar';
                    }
                }
            }
        }, { passive: false }); // Non-passive para permitir preventDefault

        element.addEventListener('touchend', async () => {
            if (!isPulling) return;
            isPulling = false;
            
            const currentHeight = parseFloat(indicator.style.height || '0');
            indicator.style.transition = 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
            
            if (currentHeight >= 60) {
                // Gatilho de Atualização
                indicator.style.height = '60px';
                // Substitui ícone por spinner
                content.innerHTML = `<div class="spinner" style="width:20px;height:20px;border:2px solid var(--accent-color);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div><span style="font-size:12px;font-weight:600;color:var(--text-secondary);">Sincronizando...</span>`;
                
                try {
                    await this.refreshGarageData();
                } catch (e) {
                    console.error(e);
                }
                // Nota: renderGarage será chamado em refreshGarageData, reconstruindo o DOM e resetando o indicador.
            } else {
                indicator.style.height = '0px';
                content.style.opacity = '0';
                content.style.transform = 'translateY(-10px)';
            }
        }, { passive: true });
    }

    async refreshGarageData() {
        // Simula delay mínimo para feedback visual e força recarregamento
        await new Promise(r => setTimeout(r, 800));
        
        // Sincronização Real com a Nuvem
        if (this.remoteStorage) {
            try {
                const cloudData = await this.remoteStorage.load();
                if (cloudData && Array.isArray(cloudData)) {
                    this.garage = cloudData;
                    this.repository.save(this.garage);
                }
            } catch (e) {
                console.warn('[Cloud] Refresh failed:', e);
            }
        } else {
            this.garage = await this.repository.load();
        }
        
        this.renderGarage();
        this.showToast('Dados sincronizados');
    }

    createCarSlotElement(car, index) {
            const slot = document.createElement('div');
            slot.className = 'car-slot';
            slot.classList.add('fade-in');
            slot.style.animationDelay = `${index * 0.05}s`; // Stagger mais rápido

            // Ativa a lógica de Swipe (Arrastar)
            /* REMOVIDO: O swipe customizado estava conflitando com o scroll nativo,
               deixando a navegação pesada. Como não há ações atrás do card, desativamos.
            if (this.garage.length > 1) {
                slot.addEventListener('touchstart', (e) => this.handleDragStart(e, slot), { passive: false });
                slot.addEventListener('touchmove', (e) => this.handleDragMove(e), { passive: false });
                slot.addEventListener('touchend', (e) => this.handleDragEnd(e), { passive: false });
            }
            */
            
            // 1. Camada de Conteúdo (Frente)
            const content = document.createElement('div');
            content.className = 'car-slot-content';
            
            // Container da Imagem (Topo do Card)
            const imageContainer = document.createElement('div');
            imageContainer.className = 'car-image-container';

            // --- Montagem do Conteúdo ---
            const displayName = car.nick ? car.nick : `${car.brand} ${car.model}`.trim();
            
            // Imagem
            if (car.photo || car.imgId) {
                const img = document.createElement('img');
                img.className = 'car-photo-display lazy-image';
                img.decoding = 'async'; // OTIMIZAÇÃO: Decodificação fora da main thread
                
                if (car.photo) {
                    img.dataset.src = car.photo;
                } else if (car.imgId) {
                    img.dataset.imgId = car.imgId;
                }
                
                // Placeholder transparente leve
                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                imageContainer.appendChild(img);
            } else {
                imageContainer.innerHTML = `<div class="car-placeholder-icon">🚘</div>`;
            }

            // Nome do Carro (Overlay na Foto)
            const nameOverlay = document.createElement('div');
            nameOverlay.className = 'car-name-overlay';
            const text = document.createElement('span');
            text.className = 'car-name';
            text.textContent = displayName.length > 22 ? displayName.substring(0, 22) + "..." : displayName;
            nameOverlay.appendChild(text);

            if (car.plate) {
                const plateDiv = document.createElement('div');
                plateDiv.className = 'car-plate-display';
                plateDiv.textContent = car.plate;
                
                plateDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    // Efeito Flash Visual
                    plateDiv.classList.remove('flash-effect');
                    void plateDiv.offsetWidth; // Trigger reflow para reiniciar animação
                    plateDiv.classList.add('flash-effect');

                    this.copyToClipboard(car.plate);
                });

                nameOverlay.appendChild(plateDiv);
            }

            imageContainer.appendChild(nameOverlay);

            content.appendChild(imageContainer);

            // Botão de Editar (Lápis)
            const editBtn = document.createElement('div');
            editBtn.className = 'edit-car-btn';
            const editIcon = document.createElement('img');
            editIcon.src = 'img/edit.svg';
            editBtn.appendChild(editIcon);
            
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditModal(index);
            });
            imageContainer.appendChild(editBtn);

            // Botão de Remover (Lixeira)
            const removeBtn = document.createElement('div');
            removeBtn.className = 'remove-car-btn';
            const trashIcon = document.createElement('img');
            trashIcon.src = 'img/trash.svg';
            removeBtn.appendChild(trashIcon);
            
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmDelete(index);
            });
            imageContainer.appendChild(removeBtn);

            slot.appendChild(content);

            return slot;
    }

    updateAppBackground(index) {
        const bg = document.getElementById('dynamic-bg');
        if (!bg) return;

        if (this.currentBgIndex === index) return;
        this.currentBgIndex = index;

        const car = this.garage[index];
        if (!car) {
            bg.classList.remove('active');
            return;
        }

        const setBg = (src) => {
            bg.style.backgroundImage = `url(${src})`;
            bg.classList.add('active');
        };

        if (car.photo) setBg(car.photo);
        else if (car.imgId) ImageCache.get(car.imgId).then(base64 => base64 && this.currentBgIndex === index && setBg(base64));
        else bg.classList.remove('active');
    }

    updateParallax() {
        const garageList = document.getElementById('garage-list');
        if (!garageList) return;

        const width = garageList.offsetWidth;
        const scrollLeft = garageList.scrollLeft;
        const slots = garageList.children;

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            // OTIMIZAÇÃO: Busca direta sem querySelector para performance no scroll
            const img = slot.getElementsByClassName('car-photo-display')[0];
            if (!img) continue;

            const slotLeft = i * width;
            const offset = scrollLeft - slotLeft;

            // Aplica paralaxe apenas se estiver visível
            if (Math.abs(offset) < width) {
                const parallaxX = offset * 0.25; // Move 25% da distância
                img.style.transition = 'none';
                img.style.transform = `translate3d(${parallaxX}px, 0, 0) scale(1.1)`;
            }
        }
    }

    loadCarImage(img) {
        const onImageLoad = () => {
            img.classList.add('loaded');
            img.classList.remove('lazy-image');
        };

        if (img.dataset.src) {
            img.onload = onImageLoad;
            img.src = img.dataset.src;
            delete img.dataset.src;
        } else if (img.dataset.imgId) {
            ImageCache.get(img.dataset.imgId).then(base64 => {
                if (base64) {
                    img.onload = onImageLoad;
                    img.src = base64;
                }
            });
            delete img.dataset.imgId;
        }
    }

    checkEditDirtyState() {
        const input = document.getElementById('edit-nickname-input');
        const plateInput = document.getElementById('edit-plate-input');
        const saveBtn = document.getElementById('save-edit-btn');
        
        if (!input || !saveBtn) return;

        const currentNick = input.value.trim();
        const currentPlate = plateInput ? plateInput.value.trim() : '';
        
        const nickChanged = currentNick !== (this.originalEditValues?.nick || '');
        const plateChanged = currentPlate !== (this.originalEditValues?.plate || '');
        
        const isDirty = nickChanged || plateChanged || this.photoChanged;
        
        this.editDirty = isDirty;
        
        if (isDirty) {
            saveBtn.classList.remove('disabled');
            saveBtn.disabled = false;
        } else {
            saveBtn.classList.add('disabled');
            saveBtn.disabled = true;
        }
    }

    openEditModal(index) {
        this.carToEditIndex = index;
        this.editDirty = false; // Reset dirty state
        const modal = document.getElementById('edit-nickname-modal');
        const input = document.getElementById('edit-nickname-input');
        const plateInput = document.getElementById('edit-plate-input');

        // Preenche com o apelido atual ou vazio se não tiver
        input.value = this.garage[index].nick || '';
        this.updateCharCounter(input, 'edit-nickname-counter', 25);
        this.toggleClearBtn(document.getElementById('clear-edit-nickname'), input.value.length > 0);
        if (plateInput) plateInput.value = this.garage[index].plate || '';

        // Inicializa estado original para validação de alterações
        this.originalEditValues = {
            nick: input.value.trim(),
            plate: plateInput ? plateInput.value.trim() : ''
        };
        this.photoChanged = false;
        this.checkEditDirtyState();

        // Carrega foto atual
        const car = this.garage[index];
        if (car.photo) {
            this.setupEditCropper(car.photo);
        } else if (car.imgId) {
            ImageCache.get(car.imgId).then(base64 => {
                if (base64 && this.carToEditIndex === index) {
                    this.setupEditCropper(base64);
                }
            });
        } else {
            // Sem foto: mostra placeholder
            this.setupEditCropper(null);
        }

        if (modal) modal.classList.add('visible');
    }

    saveEdit() {
        try {
            const input = document.getElementById('edit-nickname-input');
            const editPlateInput = document.getElementById('edit-plate-input');
            
            const newNick = input.value.trim();
            const newPlate = editPlateInput ? editPlateInput.value.trim() : '';
            
            if (!newNick) {
                const modal = document.getElementById('edit-nickname-modal');
                const modalBox = modal ? modal.querySelector('.modal-box') : null;
                
                if (modalBox) {
                    modalBox.classList.remove('shake-modal');
                    void modalBox.offsetWidth; // Trigger reflow para reiniciar animação
                    modalBox.classList.add('shake-modal');
                    setTimeout(() => modalBox.classList.remove('shake-modal'), 500);
                }
                
                input.classList.add('input-error');
                input.addEventListener('input', () => input.classList.remove('input-error'), { once: true });
                return;
            }

            // Validação de Caracteres Especiais
            if (/[^a-zA-Z0-9\u00C0-\u00FF ]/.test(newNick)) {
                input.classList.add('input-error');
                    // Força o feedback visual a aparecer se não estiver visível (Corrigido ID para modal de edição)
                    const feedback = document.getElementById('edit-nickname-validation');
                    if (feedback) feedback.classList.add('visible');
                    
                input.addEventListener('input', () => input.classList.remove('input-error'), { once: true });
                return;
            }

            // Validação de Limite de Caracteres (Máx 25)
            if (newNick.length > 25) {
                input.classList.add('input-error');
                this.showToast('Apelido muito longo (máx 25). Por favor, abrevie.');
                input.addEventListener('input', () => input.classList.remove('input-error'), { once: true });
                return;
            }

            if (this.carToEditIndex !== null && this.garage[this.carToEditIndex]) {
                const currentCar = this.garage[this.carToEditIndex];

                // Validação de Duplicidade (Marca + Modelo + Apelido)
                const isDuplicate = this.garage.some((c, index) => 
                    index !== this.carToEditIndex && 
                    c.brand === currentCar.brand && 
                    c.model === currentCar.model && 
                    c.nick === newNick
                );

                if (isDuplicate) {
                    input.classList.add('input-error');
                    input.addEventListener('input', () => input.classList.remove('input-error'), { once: true });
                    setTimeout(() => input.classList.remove('input-error'), 2000);
                    return;
                }

                // Salva Apelido
                this.garage[this.carToEditIndex].nick = newNick;
                this.garage[this.carToEditIndex].plate = newPlate;

                // Salva Recorte da Foto (se houver cropper ativo)
                if (this.editCropper) {
                    try {
                        const canvas = this.editCropper.getCroppedCanvas({
                            imageSmoothingQuality: 'medium', // Otimização de Performance
                            maxWidth: 1920, // 1080p
                            maxHeight: 1920
                        });
                        if (canvas) {
                            // Limpa a imagem antiga do cache para evitar vazamento de memória
                            if (this.garage[this.carToEditIndex].imgId) {
                                ImageCache.delete(this.garage[this.carToEditIndex].imgId);
                            }
                            this.garage[this.carToEditIndex].photo = canvas.toDataURL('image/jpeg', this.photoQuality);
                            // Remove referência antiga do cache se existir, pois agora temos uma nova base64
                            delete this.garage[this.carToEditIndex].imgId; 
                        }
                    } catch (err) {
                        console.error("Erro ao processar recorte:", err);
                    }
                }

                this.repository.save(this.garage);
                
                // Persistência na Nuvem
                if (this.remoteStorage) {
                    this.remoteStorage.save(this.garage);
                }

                this.renderGarage();
                this.showToast('Alterações salvas');
                this.closeEditModal();
            } else {
                this.closeEditModal(); // Fecha se o índice for inválido
            }
        } catch (e) {
            console.error("Erro fatal em saveEdit:", e);
            this.closeEditModal(); // Força fechamento para não travar o usuário
        }
    }

    closeEditModal() {
        try {
            const editModal = document.getElementById('edit-nickname-modal');
            if (editModal) editModal.classList.remove('visible');
            this.carToEditIndex = null;
            if (this.editCropper) {
                this.editCropper.destroy();
                this.editCropper = null;
            }
            this.editDirty = false;
        } catch (e) {
            console.error("Erro ao fechar modal de edição:", e);
            // Fallback de emergência
            document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('visible'));
            this.editDirty = false;
        }
    }

    setupEditCropper(imageSrc) {
        const img = document.getElementById('edit-crop-image');
        const placeholder = document.getElementById('edit-photo-placeholder');
        const controls = document.getElementById('edit-crop-controls');
        const slider = document.getElementById('edit-zoom-slider');
        const changePhotoBtn = document.getElementById('edit-change-photo-overlay');

        if (this.editCropper) {
            this.editCropper.destroy();
            this.editCropper = null;
        }

        if (!imageSrc) {
            img.style.display = 'none';
            img.src = '';
            placeholder.style.display = 'flex';
            controls.style.display = 'none';
            if (changePhotoBtn) changePhotoBtn.style.display = 'none';
            return;
        }

        placeholder.style.display = 'none';
        controls.style.display = 'flex';
        if (changePhotoBtn) changePhotoBtn.style.display = 'flex';
        img.src = imageSrc;
        img.style.display = 'block';

        setTimeout(() => {
            this.editCropper = new Cropper(img, {
                viewMode: 1,
                dragMode: 'move',
                aspectRatio: NaN, // Livre (Free form)
                autoCropArea: 1,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
                zoomable: true,
                zoomOnTouch: true,
                zoomOnWheel: true,
                ready: () => {
                    // Inicia com a imagem inteira visível (Fit)
                    const imageData = this.editCropper.getImageData();
                    const scale = imageData.width / imageData.naturalWidth;
                    if (slider) slider.value = scale;
                },
                zoom: (e) => {
                    if (slider) slider.value = e.detail.ratio;
                }
            });
        }, 100);
    }

    confirmDelete(index) {
        this.carToDeleteIndex = index;
        const deleteModal = document.getElementById('delete-car-modal');
        if (deleteModal) deleteModal.classList.add('visible');
    }

    performDelete() {
        const index = this.carToDeleteIndex;
        if (index >= 0 && index < this.garage.length) {
            const garageList = document.getElementById('garage-list');
            const slotToRemove = garageList.children[index];

            // Adiciona classe de saída e espera animação
            slotToRemove.classList.add('fade-out');
            
            setTimeout(() => {
                const removed = this.garage.splice(index, 1)[0];
                // Limpa imagem do cache se existir
                if (removed.imgId) {
                    ImageCache.delete(removed.imgId);
                }
                this.repository.save(this.garage);
                
                // Persistência na Nuvem
                if (this.remoteStorage) {
                    this.remoteStorage.save(this.garage);
                }

                this.showUndoMessage(removed, index);

                this.renderGarage();
            }, 300); // Tempo da animação CSS
        }
        const deleteModal = document.getElementById('delete-car-modal');
        if (deleteModal) deleteModal.classList.remove('visible');
        this.carToDeleteIndex = null;
    }
    showUndoMessage(car, originalIndex) {
        const undoMessage = document.getElementById('undo-message');
        if (!undoMessage) return;

        // Limpa timeout anterior
        if (this.undoTimeout) clearTimeout(this.undoTimeout);

        // Armazena dados do carro removido
        this.lastRemovedCar = { car, originalIndex };
        
        // Mostra a mensagem
        undoMessage.style.display = 'block';

        const undoAction = () => {
            // Reinsere o carro na garagem
            this.garage.splice(originalIndex, 0, car);
            this.repository.save(this.garage);
            
            // Persistência na Nuvem
            if (this.remoteStorage) {
                this.remoteStorage.save(this.garage);
            }

            this.renderGarage();

            // Limpa o estado de "desfeito"
            this.lastRemovedCar = null;
            undoMessage.style.display = 'none';
        };

        undoMessage.onclick = (e) => {
            e.stopPropagation();
            undoAction();
        };

        // Define timeout para desativar a opção
        this.undoTimeout = setTimeout(() => {
            // Se o usuário não clicar em "Desfazer" a tempo, remove a ação
            undoMessage.style.display = 'none';
            this.lastRemovedCar = null;
        }, 5000); // 5 segundos
    }

    setupAutocomplete() {

        const brandInput = document.getElementById('car-brand');
        const brandList = document.getElementById('car-brand-suggestions');
        const modelInput = document.getElementById('car-model');
        const modelList = document.getElementById('car-model-suggestions');
        const clearBrandBtn = document.getElementById('clear-brand');
        const clearModelBtn = document.getElementById('clear-model');
        const plateInput = document.getElementById('car-plate');
        const clearPlateBtn = document.getElementById('clear-plate');

        if (!brandInput) return;

        // Função auxiliar para fechar todas as listas
        const closeAllLists = () => {
            brandList.classList.remove('visible');
            modelList.classList.remove('visible');
        };

        // Centraliza as funções de seleção para reuso
        this.onBrandSelect = (item) => {
            brandInput.value = item.nome;
            brandInput.dataset.code = item.codigo;
            brandInput.dataset.tipo = item.tipo;
            brandList.classList.remove('visible');
            this.loadModels(item.codigo, item.tipo);
            this.toggleClearBtn(clearBrandBtn, true);
        };

        this.onModelSelect = (item) => {
            modelInput.value = item.nome;
            modelInput.dataset.code = item.codigo;
            modelList.classList.remove('visible');
            document.getElementById('car-nickname').focus();
            this.toggleClearBtn(clearModelBtn, true);
        };

        // Autocomplete de Marcas
        brandInput.addEventListener('input', () => {
            if (this.isManualMode) return; // Não busca no modo manual
            // Limpa seleção anterior ao digitar para garantir integridade
            brandInput.dataset.code = '';
            delete brandInput.dataset.tipo;
            // Resetar campo de modelo pois a marca mudou/está inválida
            modelInput.value = '';
            modelInput.dataset.code = '';
            modelInput.disabled = true;
            modelInput.placeholder = "Selecione a Marca primeiro";
            this.modelsData = []; // Limpa dados de modelos antigos
            
            modelList.classList.remove('visible'); // Fecha lista de modelos para evitar confusão
            clearTimeout(this.debounceTimer);
            this.currentFilterQuery = brandInput.value;
            this.debounceTimer = setTimeout(() => {
                this.filterSuggestions(brandInput.value, this.brandsData, brandList, this.onBrandSelect);
            }, 150);
            this.toggleClearBtn(clearBrandBtn, brandInput.value.length > 0);
        });

        brandInput.addEventListener('focus', () => {
            if (this.isManualMode) return;
            closeAllLists(); // Fecha outras listas
            this.filterSuggestions(brandInput.value, this.brandsData, brandList, this.onBrandSelect);
            this.toggleClearBtn(clearBrandBtn, brandInput.value.length > 0);
        });

        // Autocomplete de Modelos
        modelInput.addEventListener('input', () => {
            if (this.isManualMode) return;
            // Limpa seleção anterior
            modelInput.dataset.code = '';
            brandList.classList.remove('visible'); // Fecha lista de marcas
            clearTimeout(this.debounceTimer);
            this.currentFilterQuery = modelInput.value;
            this.debounceTimer = setTimeout(() => {
                this.filterSuggestions(modelInput.value, this.modelsData, modelList, this.onModelSelect);
            }, 150);
            this.toggleClearBtn(clearModelBtn, modelInput.value.length > 0);
        });

        modelInput.addEventListener('focus', () => {
            if (this.isManualMode) return;
            closeAllLists(); // Fecha outras listas
            this.filterSuggestions(modelInput.value, this.modelsData, modelList, this.onModelSelect);
            this.toggleClearBtn(clearModelBtn, modelInput.value.length > 0);
        });

        // Fechar sugestões ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.input-group')) {
                closeAllLists();
            }
        });

        // Lógica dos botões de limpar
        if (clearBrandBtn) {
            clearBrandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                brandInput.value = '';
                brandInput.dataset.code = '';
                brandInput.focus();
                this.toggleClearBtn(clearBrandBtn, false);
                // Reseta modelos também
                modelInput.value = '';
                modelInput.dataset.code = '';
                modelInput.disabled = true;
                modelInput.placeholder = "Selecione a Marca primeiro";
                this.modelsData = [];
                this.toggleClearBtn(clearModelBtn, false);
            });
        }

        if (clearModelBtn) {
            clearModelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                modelInput.value = '';
                modelInput.dataset.code = '';
                modelInput.focus();
                this.toggleClearBtn(clearModelBtn, false);
                // Reabre sugestões de modelo
                if (!this.isManualMode) {
                    this.filterSuggestions("", this.modelsData, modelList, this.onModelSelect);
                }
            });
        }

        // Lógica da Placa (Validação e Formatação)
        if (plateInput) {
            const counter = document.getElementById('plate-counter');
            const radios = document.querySelectorAll('input[name="plate-type"]');

            // Listener para mudança de tipo de placa
            radios.forEach(radio => {
                radio.addEventListener('change', () => {
                    plateInput.value = ''; // Limpa ao trocar
                    plateInput.classList.remove('input-error');
                    this.toggleClearBtn(clearPlateBtn, false);
                    
                    if (radio.value === 'OLD') {
                        plateInput.maxLength = 8;
                        if (counter) counter.textContent = '0/8';
                    } else {
                        plateInput.maxLength = 7;
                        if (counter) counter.textContent = '0/7';
                    }
                });
            });

            plateInput.addEventListener('input', (e) => {
                let value = e.target.value.toUpperCase();
                const type = document.querySelector('input[name="plate-type"]:checked').value;

                if (type === 'OLD') {
                    // --- MODELO ANTIGO (ABC-1234) ---
                    // Remove tudo que não é letra, número ou hífen
                    value = value.replace(/[^A-Z0-9-]/g, '');

                    // Máscara e Validação Posição a Posição
                    if (value.length > 0 && !/[A-Z]/.test(value[0])) value = value.slice(1); // 1: Letra
                    if (value.length > 1 && !/[A-Z]/.test(value[1])) value = value.slice(0, 1) + value.slice(2); // 2: Letra
                    if (value.length > 2 && !/[A-Z]/.test(value[2])) value = value.slice(0, 2) + value.slice(3); // 3: Letra
                    
                    // Auto-insere hífen após 3 letras
                    if (value.length > 3 && value[3] !== '-') {
                        value = value.slice(0, 3) + '-' + value.slice(3);
                    }
                    
                    // Valida números após o hífen
                    if (value.length > 4 && !/[0-9]/.test(value[4])) value = value.slice(0, 4) + value.slice(5); // 5: Número
                    if (value.length > 5 && !/[0-9]/.test(value[5])) value = value.slice(0, 5) + value.slice(6); // 6: Número
                    if (value.length > 6 && !/[0-9]/.test(value[6])) value = value.slice(0, 6) + value.slice(7); // 7: Número
                    if (value.length > 7 && !/[0-9]/.test(value[7])) value = value.slice(0, 7) + value.slice(8); // 8: Número

                    if (value.length > 8) value = value.slice(0, 8);
                    if (counter) counter.textContent = `${value.length}/8`;

                } else {
                    // --- MODELO MERCOSUL (ABC1D23) ---
                    // Remove tudo que não é letra ou número (sem hífen)
                    value = value.replace(/[^A-Z0-9]/g, '');

                    // Máscara e Validação Posição a Posição
                    if (value.length > 0 && !/[A-Z]/.test(value[0])) value = value.slice(1); // 1: Letra
                    if (value.length > 1 && !/[A-Z]/.test(value[1])) value = value.slice(0, 1) + value.slice(2); // 2: Letra
                    if (value.length > 2 && !/[A-Z]/.test(value[2])) value = value.slice(0, 2) + value.slice(3); // 3: Letra
                    if (value.length > 3 && !/[0-9]/.test(value[3])) value = value.slice(0, 3) + value.slice(4); // 4: Número
                    if (value.length > 4 && !/[A-Z]/.test(value[4])) value = value.slice(0, 4) + value.slice(5); // 5: Letra
                    if (value.length > 5 && !/[0-9]/.test(value[5])) value = value.slice(0, 5) + value.slice(6); // 6: Número
                    if (value.length > 6 && !/[0-9]/.test(value[6])) value = value.slice(0, 6) + value.slice(7); // 7: Número

                    if (value.length > 7) value = value.slice(0, 7);
                    if (counter) counter.textContent = `${value.length}/7`;
                }

                e.target.value = value;
                this.toggleClearBtn(clearPlateBtn, value.length > 0);
                
                // Validação Final (Regex Exata)
                let isValid = false;
                if (type === 'OLD') {
                    isValid = /^[A-Z]{3}-[0-9]{4}$/.test(value);
                } else {
                    isValid = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(value);
                }

                // Feedback Visual de Erro (se completo mas inválido, ou se vazio não mostra erro)
                if (value.length > 0 && value.length === (type === 'OLD' ? 8 : 7) && !isValid) {
                    plateInput.classList.add('input-error');
                } else {
                    plateInput.classList.remove('input-error');
                }

                if (counter) {
                    counter.style.color = ''; // Mantém a cor padrão (cinza/tema)
                }
            });

            if (clearPlateBtn) {
                clearPlateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    plateInput.value = '';
                    plateInput.focus();
                    this.toggleClearBtn(clearPlateBtn, false);
                    if (counter) {
                        counter.textContent = '0/8';
                        counter.style.color = '';
                    }
                });
            }
        }
    }

    toggleClearBtn(btn, show) {
        if (btn) {
            if (show) btn.classList.add('visible');
            else btn.classList.remove('visible');
        }
    }

    normalizeString(str) {
        if (!str) return "";
        // Fallback seguro para dispositivos antigos que não suportam normalize
        if (str.normalize) {
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        }
        return str.toLowerCase();
    }

    filterSuggestions(query, data, listEl, onSelect) {
        listEl.innerHTML = '';
        
        if (!data || !Array.isArray(data)) {
            listEl.classList.remove('visible');
            return;
        }

        let filtered = data;
        if (query) {
            const normalizedQuery = this.normalizeString(query);
            filtered = data.filter(item => item.nome && this.normalizeString(item.nome).includes(normalizedQuery));
        }
        
        if (filtered.length === 0) {
            listEl.classList.remove('visible');
            return;
        }

        // Adiciona ordenação alfabética
        filtered.sort((a, b) => a.nome.localeCompare(b.nome));

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = item.nome;
            
            // Usa mousedown para prevenir que o input perca o foco antes do click
            div.addEventListener('mousedown', (e) => e.preventDefault());
            
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                onSelect(item);
            });
            listEl.appendChild(div);
        });
        
        listEl.classList.add('visible');
    }

    showErrorInList(listEl, message, onRetry) {
        listEl.innerHTML = '';
        const container = document.createElement('div');
        container.style.padding = '15px';
        container.style.textAlign = 'center';
        container.style.pointerEvents = 'auto';

        const msg = document.createElement('div');
        msg.textContent = message;
        msg.style.color = '#ff6666';
        msg.style.marginBottom = '10px';
        msg.style.fontSize = '14px';

        const btn = document.createElement('button');
        btn.className = 'modal-action-btn';
        btn.textContent = 'Tentar Novamente';
        btn.style.minHeight = '35px';
        btn.style.fontSize = '14px';
        
        const handleRetry = (e) => {
            e.stopPropagation();
            e.preventDefault();
            onRetry();
        };

        btn.addEventListener('click', handleRetry);
        btn.addEventListener('touchstart', handleRetry);

        container.appendChild(msg);
        container.appendChild(btn);
        listEl.appendChild(container);
        listEl.classList.add('visible');
    }

    async loadBrands() {
        // FIX: Busca o botão dentro do modal para não confundir com o botão da tela vazia
        const modal = document.getElementById('add-car-wizard'); // CORREÇÃO ID
        const actionBtn = modal ? modal.querySelector('.modal-action-btn') : null;
        
        // Se já temos dados em memória, não busca novamente
        if (this.brandsData && this.brandsData.length > 0) return;
        
        // Verifica Cache Local
        const cached = this.getCachedData('fipe_brands');
        if (cached) {
            this.brandsData = cached;
            return;
        }

        if (actionBtn) actionBtn.classList.add('loading');
        if (actionBtn) actionBtn.disabled = true;
        try {
            this.brandsData = await FipeApi.getBrands();
            
            if (this.brandsData.length === 0) {
                 const brandList = document.getElementById('car-brand-suggestions');
                 this.showErrorInList(brandList, 'Erro ao carregar marcas.', () => this.loadBrands());
                 return;
            }

            // Ordena para facilitar a busca visual se necessário, embora o filtro resolva
            this.brandsData.sort((a, b) => a.nome.localeCompare(b.nome));
            this.setCachedData('fipe_brands', this.brandsData);
        } catch (err) {
            console.error('[API] Erro ao buscar marcas:', err);
            const brandList = document.getElementById('car-brand-suggestions');
            this.showErrorInList(brandList, `Erro: ${err.message || 'Conexão'}`, () => this.loadBrands());
        } finally {
            if (actionBtn) actionBtn.classList.remove('loading');
            if (actionBtn) actionBtn.disabled = false;
        }
    }

    async loadModels(brandCode, vehicleType) {
        // FIX: Busca o botão dentro do modal para não confundir com o botão da tela vazia
        const modal = document.getElementById('add-car-wizard'); // CORREÇÃO ID
        const actionBtn = modal ? modal.querySelector('.modal-action-btn') : null;
        const modelInput = document.getElementById('car-model');
        const modelList = document.getElementById('car-model-suggestions');
        const loader = document.getElementById('model-loader');

        console.log('[API] Buscando modelos para marca:', brandCode, 'Tipo:', vehicleType);

        if (!brandCode || !vehicleType) {
            console.warn('[API] Dados incompletos (Marca ou Tipo) para buscar modelos.');
            return;
        }
        
        this.modelsData = []; // Limpa modelos anteriores
        if (actionBtn) actionBtn.classList.add('loading');
        if (actionBtn) actionBtn.disabled = true;
        
        modelInput.disabled = true;
        modelInput.placeholder = "Carregando modelos...";
        modelInput.value = "";
        if (loader) loader.classList.add('visible');
        modelList.classList.remove('visible');

        try {
            this.modelsData = await FipeApi.getModels(brandCode, vehicleType);
            this.finalizeModelLoad(modelInput, modelList);
        } catch (err) {
            console.error('[API] Erro ao buscar modelos:', err);
            modelInput.placeholder = "Erro ao carregar modelos";
            modelInput.disabled = true; // Bloqueia digitação manual em caso de erro
            modelInput.value = "";
            
            // Feedback inline melhor que alert
            const msg = err.message === 'Sem conexão' ? 'Sem internet. Use o Modo Manual.' : `Erro: ${err.message || 'Conexão'}`;
            this.showErrorInList(modelList, msg, () => this.loadModels(brandCode, vehicleType));
            
        } finally {
            if (actionBtn) actionBtn.classList.remove('loading');
            if (actionBtn) actionBtn.disabled = false;
            if (loader) loader.classList.remove('visible');
        }
    }

    finalizeModelLoad(modelInput, modelList) {
        modelInput.disabled = false;
        modelInput.placeholder = "Digite o Modelo";
        modelInput.focus();
        // Força a exibição das sugestões imediatamente após carregar
        this.filterSuggestions("", this.modelsData, modelList, this.onModelSelect);
    }

    // --- Drag & Drop Handlers ---

    handleDragStart(e, slot) {
        // Fecha outros cards abertos ao tocar em um novo
        if (!slot.classList.contains('swiped')) {
            this.closeAllSwipes(slot);
        }

        if (e.touches.length > 1) return;
        
        this.touchStartY = e.touches[0].clientY;
        this.touchStartX = e.touches[0].clientX;
        this.isSwiping = false;
        this.currentSlot = slot;
        this.rafPending = false; // Controle de frame
    }

    handleDragMove(e) {
        const touch = e.touches[0];
        const moveY = Math.abs(touch.clientY - this.touchStartY);
        const moveX = Math.abs(touch.clientX - this.touchStartX);
        const deltaX = touch.clientX - this.touchStartX;

        // Se moveu muito antes do timer disparar, cancela (é scroll)
        if (!this.isSwiping) {
            if (moveY > 10 || moveX > 10) {
                // Detecta Swipe Horizontal (prioriza movimento X sobre Y)
                if (moveX > moveY && moveX > 10) {
                    const isOpen = this.currentSlot.classList.contains('swiped');
                    // Permite swipe se: fechado e puxando p/ esquerda OU aberto e puxando p/ direita
                    if ((!isOpen && deltaX < 0) || (isOpen && deltaX > 0)) {
                        this.isSwiping = true;
                        e.preventDefault(); // Bloqueia scroll nativo
                    }
                }
                return;
            }
        }

        if (this.isSwiping) {
            e.preventDefault();
            
            // OTIMIZAÇÃO: requestAnimationFrame para não sobrecarregar a main thread
            if (!this.rafPending) {
                this.rafPending = true;
                requestAnimationFrame(() => {
                    if (!this.currentSlot) { this.rafPending = false; return; }
                    
                    const content = this.currentSlot.querySelector('.car-slot-content');
                    const isOpen = this.currentSlot.classList.contains('swiped');
                    const maxSwipe = -140; 

                    let translateX = deltaX;
                    if (isOpen) translateX = maxSwipe + deltaX;

                    if (translateX > 0) translateX = 0;
                    if (translateX < maxSwipe) translateX = maxSwipe;

                    content.style.transition = 'none';
                    content.style.transform = `translateX(${translateX}px)`;
                    
                    this.rafPending = false;
                });
            }
        }
    }

    handleDragEnd(e) {
        this.rafPending = false; // Reset
        if (this.isSwiping) {
            const content = this.currentSlot.querySelector('.car-slot-content');
            content.style.transition = ''; // Restaura animação CSS

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - this.touchStartX;
            const isOpen = this.currentSlot.classList.contains('swiped');

            if (isOpen) {
                // Se estava aberto e arrastou um pouco p/ direita, fecha
                if (deltaX > 40) this.closeSwipe(this.currentSlot);
                else this.openSwipe(this.currentSlot); // Mantém aberto
            } else {
                // Se estava fechado e arrastou p/ esquerda, abre
                if (deltaX < -40) this.openSwipe(this.currentSlot);
                else this.closeSwipe(this.currentSlot); // Mantém fechado
            }
            
            this.isSwiping = false;
        } else {
            // Toque simples (Tap)
            // Se tocar no card aberto (na área de conteúdo), fecha
            if (this.currentSlot && this.currentSlot.classList.contains('swiped')) {
                const moveX = Math.abs(e.changedTouches[0].clientX - this.touchStartX);
                if (moveX < 10) { // Garante que foi um tap e não drag
                    this.closeSwipe(this.currentSlot);
                }
            }
        }
        this.currentSlot = null;
    }

    // --- Swipe Helpers ---

    openSwipe(slot) {
        slot.classList.add('swiped');
        const content = slot.querySelector('.car-slot-content');
        content.style.transform = ''; // Remove inline style para usar CSS class
    }

    closeSwipe(slot) {
        slot.classList.remove('swiped');
        const content = slot.querySelector('.car-slot-content');
        content.style.transform = ''; // Remove inline style para usar CSS class
    }

    closeAllSwipes(exceptSlot = null) {
        const swipedSlots = document.querySelectorAll('.car-slot.swiped');
        swipedSlots.forEach(slot => {

            if (slot !== exceptSlot) {
                this.closeSwipe(slot);
            }
        });
    }

    showToast(message, type = 'success', action = null) {
        UIQueueManager.schedule(() => {
            const toast = document.getElementById('toast-notification');
            const msg = document.getElementById('toast-message');
            
            if (this.toastTimeout) clearTimeout(this.toastTimeout);

            if (toast && msg) {
                msg.textContent = message;
                
                const icon = toast.querySelector('.toast-icon');
                if (icon) {
                    if (type === 'error') {
                        icon.textContent = '!';
                        icon.style.color = '#FF3B30';
                    } else {
                        icon.textContent = '✓';
                        icon.style.color = '#34C759';
                    }
                }

                // Limpa botão de ação anterior
                const existingBtn = toast.querySelector('.toast-action-btn');
                if (existingBtn) existingBtn.remove();

                // Adiciona novo botão se houver ação
                if (action && action.label && action.callback) {
                    const btn = document.createElement('button');
                    btn.className = 'toast-action-btn';
                    btn.textContent = action.label;
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        action.callback();
                        toast.classList.remove('visible');
                    };
                    toast.appendChild(btn);
                    toast.style.pointerEvents = 'auto';
                } else {
                    toast.style.pointerEvents = 'none';
                }

                toast.classList.add('visible');
                this.toastTimeout = setTimeout(() => toast.classList.remove('visible'), action ? 6000 : 3000);
            }
        });
    }

    copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('Placa copiada!');
            }).catch(() => {
                this.fallbackCopy(text);
            });
        } else {
            this.fallbackCopy(text);
        }
    }

    fallbackCopy(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            this.showToast('Placa copiada!');
        } catch (err) {
            console.error('Fallback copy failed', err);
        }
        document.body.removeChild(textArea);
    }

    initRippleEffect() {
        document.addEventListener('click', (e) => {
            const target = e.target.closest('.setting-item');
            if (target) {
                // Remove ripples anteriores para evitar acúmulo visual
                const existing = target.querySelector('.ripple');
                if (existing) existing.remove();
                
                const ripple = document.createElement('span');
                ripple.className = 'ripple';
                
                target.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            }
        });
    }

    initResponsiveSystem() {
        // Sistema de Responsividade Matemática (JS Pesado/Profissional)
        // Calcula escala baseada na geometria da tela e aplica transformações
        
        // OTIMIZAÇÃO: Limpeza de estilos legados movida para inicialização (roda apenas uma vez)
        const targets = ['.garage-box', '.empty-garage-box', '.settings-box', '.map-ui-box', '#bottom-panel', '.map-list-wrapper'];
        targets.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.style.width = ''; 
                el.style.maxWidth = 'none';
                el.style.position = '';
                el.style.left = '';
                el.style.top = '';
                el.style.margin = '';
                el.style.transform = '';
                el.style.transformOrigin = '';
                el.style.bottom = '';
                el.style.height = '';
            }
        });

        const update = () => {
            this.updateLayoutScaling();
            // Força resize do mapa se existir
            if (this.mapRenderer && this.mapRenderer.map) {
                this.mapRenderer.map.resize();
            }
        };

        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(update));
            this.resizeObserver.observe(document.body);
        } else {
            window.addEventListener('resize', () => window.requestAnimationFrame(update));
            window.addEventListener('orientationchange', () => setTimeout(update, 200));
        }
    }

    updateLayoutScaling() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // UNIVERSAL DPI RESPONSIVE ENGINE
        // Base resolution: Standard Mobile ~360x800 (Logical Pixels)
        const BASE_AREA = 360 * 800;
        const currentArea = width * height;
        
        // Calculate UI_SCALE based on area ratio (Diagonal scaling)
        // Ajuste: Multiplicador 0.85 (Aumentado novamente para preencher melhor a tela)
        let scale = Math.sqrt(currentArea / BASE_AREA) * 0.85;
        
        // --- HEIGHT CONSTRAINT LOGIC (Revisão Matemática) ---
        // Garante que a interface caiba verticalmente, crucial para modo paisagem
        // Safe Height = 85% da tela (deixa espaço para barras de sistema)
        const safeHeight = height * 0.85;
        const baseCardHeight = 600; // Altura base aproximada do card principal
        const maxScaleByHeight = safeHeight / baseCardHeight;

        // Se a escala por área for maior que a permitida pela altura, limita pela altura
        if (scale > maxScaleByHeight) scale = maxScaleByHeight;

        // Clamp scale to avoid extremes on weird displays
        // Ajuste: Mínimo 0.70 para permitir redução maior mas manter legibilidade
        scale = Math.max(0.70, Math.min(scale, 1.8));
        
        // Apply global CSS variables
        document.documentElement.style.setProperty('--app-scale', scale);
        document.documentElement.style.setProperty('--ui-scale', scale);
        document.documentElement.style.setProperty('--app-width', `${width}px`);
        document.documentElement.style.setProperty('--app-height', `${height}px`);
    }
}