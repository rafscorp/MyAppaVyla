export class VirtualScroller {
    constructor(container, items, renderItem, itemWidth) {
        this.container = container;
        this.items = items;
        this.renderItem = renderItem;
        this.itemWidth = itemWidth;
        this.buffer = 2;
        this.visibleItems = new Map();
        
        // Cria um espaçador para forçar o tamanho total do scroll
        this.spacer = document.createElement('div');
        this.spacer.style.position = 'absolute';
        this.spacer.style.top = '0';
        this.spacer.style.left = '0';
        this.spacer.style.height = '1px';
        this.spacer.style.width = `${this.items.length * this.itemWidth}px`;
        this.container.appendChild(this.spacer);
        
        this.onScroll = this.onScroll.bind(this);
        this.container.addEventListener('scroll', this.onScroll, { passive: true });
        
        // Renderização inicial
        this.onScroll();
    }

    onScroll() {
        if (!this.container || !this.items.length) return;

        const scrollLeft = this.container.scrollLeft;
        const containerWidth = this.container.clientWidth;
        
        // Calcula índices visíveis
        const startIndex = Math.floor(scrollLeft / this.itemWidth) - this.buffer;
        const endIndex = Math.ceil((scrollLeft + containerWidth) / this.itemWidth) + this.buffer;

        const safeStart = Math.max(0, startIndex);
        const safeEnd = Math.min(this.items.length, endIndex);

        // Remove itens que saíram da visão
        for (const [index, element] of this.visibleItems) {
            if (index < safeStart || index >= safeEnd) {
                element.remove();
                this.visibleItems.delete(index);
            }
        }

        // Adiciona novos itens
        for (let i = safeStart; i < safeEnd; i++) {
            if (!this.visibleItems.has(i)) {
                const element = this.renderItem(this.items[i], i);
                // Força posicionamento absoluto para virtualização
                element.style.position = 'absolute';
                element.style.left = `${i * this.itemWidth}px`;
                element.style.top = '0';
                element.style.height = '100%';
                
                this.container.appendChild(element);
                this.visibleItems.set(i, element);
            }
        }
    }

    resize(newItemWidth) {
        // REVISÃO LÓGICA: Proteção contra divisão por zero ou larguras inválidas
        if (!newItemWidth || newItemWidth <= 0) return;

        // Mantém o índice atual focado durante o redimensionamento
        const currentScroll = this.container.scrollLeft;
        const currentIndex = Math.round(currentScroll / this.itemWidth);

        this.itemWidth = newItemWidth;
        this.spacer.style.width = `${this.items.length * this.itemWidth}px`;
        this.container.scrollLeft = currentIndex * this.itemWidth;

        // Atualiza posição de todos os itens visíveis imediatamente
        for (const [index, element] of this.visibleItems) {
            element.style.left = `${index * this.itemWidth}px`;
        }
        this.onScroll(); // Recalcula visibilidade
    }

    destroy() {
        if (this.container) {
            this.container.removeEventListener('scroll', this.onScroll);
            this.container.innerHTML = '';
        }
        this.visibleItems.clear();
    }
}