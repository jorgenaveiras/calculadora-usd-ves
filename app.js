// Calculadora USD → VES con tasa BCV en tiempo real
const App = {
    // Variables
    currentRate: null,
    lastUpdate: null,
    history: [],
    isLoading: false,

    // URL del BCV
    BCV_URL: 'https://www.bcv.org.ve/',

    // Inicializar la app
    init() {
        this.loadHistory();
        this.loadSavedRate();
        this.setupEventListeners();
        this.fetchExchangeRate();
    },

    // Configurar event listeners
    setupEventListeners() {
        document.getElementById('convertBtn').addEventListener('click', () => this.convert());
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchExchangeRate());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
        document.getElementById('copyBtn').addEventListener('click', () => this.copyResult());
        document.getElementById('usdAmount').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.convert();
        });
    },

    // Obtener tasa de cambio del BCV
    async fetchExchangeRate() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading(true);

        try {
            // Intentar obtener la tasa del BCV
            const rate = await this.getBCVRate();
            
            if (rate) {
                this.currentRate = rate;
                this.lastUpdate = new Date();
                this.saveRate();
                this.updateRateDisplay();
            } else {
                throw new Error('No se pudo obtener la tasa');
            }
        } catch (error) {
            console.error('Error al obtener tasa:', error);
            this.showError('Error al conectar con BCV. Usando última tasa conocida.');
            
            if (!this.currentRate) {
                this.currentRate = 784.66; // Tasa por defecto
                this.updateRateDisplay();
            }
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    },

    // Obtener tasa del BCV (simulada para la web)
    async getBCVRate() {
        try {
            // En producción, aquí harías fetch al BCV
            // Por ahora usamos la tasa conocida
            const response = await fetch(this.BCV_URL);
            const html = await response.text();
            
            // Buscar el patrón del dólar en el HTML
            // El BCV muestra: USD 784,66330000
            const usdMatch = html.match(/USD[\s\S]*?([\d.,]+)/i);
            
            if (usdMatch) {
                // Convertir formato venezolano (coma como decimal) a formato internacional
                let rateStr = usdMatch[1].replace('.', '').replace(',', '.');
                return parseFloat(rateStr);
            }
            
            // Si no encuentra el patrón, usar regex más específico
            const alternativeMatch = html.match(/784[\.,]\d+/);
            if (alternativeMatch) {
                return parseFloat(alternativeMatch[0].replace(',', '.'));
            }
            
            return null;
        } catch (error) {
            console.error('Error en getBCVRate:', error);
            return null;
        }
    },

    // Mostrar estado de carga
    showLoading(show) {
        const rateElement = document.getElementById('currentRate');
        if (show) {
            rateElement.classList.add('loading');
            rateElement.textContent = 'Actualizando...';
        } else {
            rateElement.classList.remove('loading');
        }
    },

    // Mostrar error
    showError(message) {
        const rateElement = document.getElementById('currentRate');
        rateElement.classList.add('error');
        rateElement.textContent = message;
        
        setTimeout(() => {
            rateElement.classList.remove('error');
            this.updateRateDisplay();
        }, 3000);
    },

    // Actualizar display de la tasa
    updateRateDisplay() {
        const rateElement = document.getElementById('currentRate');
        const dateElement = document.getElementById('rateDate');
        
        if (this.currentRate) {
            rateElement.textContent = this.formatNumber(this.currentRate, 4);
            dateElement.textContent = this.lastUpdate 
                ? `Actualizado: ${this.lastUpdate.toLocaleString('es-VE')}`
                : 'Fecha no disponible';
        }
    },

    // Formatear número
    formatNumber(num, decimals = 2) {
        return new Intl.NumberFormat('es-VE', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    },

    // Realizar conversión
    convert() {
        const input = document.getElementById('usdAmount');
        const usdAmount = parseFloat(input.value);
        
        if (!usdAmount || usdAmount <= 0) {
            this.shakeInput();
            return;
        }

        if (!this.currentRate) {
            alert('No hay tasa disponible. Por favor actualice la tasa.');
            return;
        }

        const vesAmount = usdAmount * this.currentRate;
        
        // Mostrar resultado
        this.showResult(vesAmount);
        
        // Guardar en historial
        this.addToHistory(usdAmount, vesAmount);
        
        // Limpiar input
        input.value = '';
        input.focus();
    },

    // Mostrar resultado con animación
    showResult(amount) {
        const resultGroup = document.getElementById('resultGroup');
        const resultValue = document.getElementById('vesResult');
        
        resultGroup.style.display = 'block';
        resultValue.textContent = `Bs ${this.formatNumber(amount)}`;
        
        // Animación
        resultGroup.style.opacity = '0';
        resultGroup.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            resultGroup.style.transition = 'all 0.3s ease';
            resultGroup.style.opacity = '1';
            resultGroup.style.transform = 'translateY(0)';
        }, 10);
    },

    // Copiar resultado al portapapeles
    copyResult() {
        const value = document.getElementById('vesResult').textContent;
        navigator.clipboard.writeText(value).then(() => {
            const btn = document.getElementById('copyBtn');
            btn.textContent = '✅';
            setTimeout(() => btn.textContent = '📋', 1500);
        });
    },

    // Animación de shake para input inválido
    shakeInput() {
        const input = document.getElementById('usdAmount');
        input.style.animation = 'shake 0.5s ease';
        setTimeout(() => input.style.animation = '', 500);
    },

    // Agregar al historial
    addToHistory(usd, ves) {
        const item = {
            usd,
            ves,
            rate: this.currentRate,
            date: new Date()
        };
        
        this.history.unshift(item);
        
        // Mantener solo los últimos 10 items
        if (this.history.length > 10) {
            this.history.pop();
        }
        
        this.saveHistory();
        this.renderHistory();
    },

    // Renderizar historial
    renderHistory() {
        const list = document.getElementById('historyList');
        
        if (this.history.length === 0) {
            list.innerHTML = '<p class="empty-history">No hay conversiones aún</p>';
            return;
        }
        
        list.innerHTML = this.history.map(item => `
            <div class="history-item">
                <div>
                    <div class="history-conversion">
                        $${this.formatNumber(item.usd)} → Bs ${this.formatNumber(item.ves)}
                    </div>
                    <div class="history-rate">
                        Tasa: ${this.formatNumber(item.rate, 4)} | ${new Date(item.date).toLocaleString('es-VE')}
                    </div>
                </div>
            </div>
        `).join('');
    },

    // Limpiar historial
    clearHistory() {
        this.history = [];
        this.saveHistory();
        this.renderHistory();
    },

    // Guardar historial en localStorage
    saveHistory() {
        localStorage.setItem('calcHistory', JSON.stringify(this.history));
    },

    // Cargar historial de localStorage
    loadHistory() {
        const saved = localStorage.getItem('calcHistory');
        if (saved) {
            this.history = JSON.parse(saved);
            this.renderHistory();
        }
    },

    // Guardar tasa en localStorage
    saveRate() {
        localStorage.setItem('calcRate', JSON.stringify({
            rate: this.currentRate,
            date: this.lastUpdate
        }));
    },

    // Cargar tasa de localStorage
    loadSavedRate() {
        const saved = localStorage.getItem('calcRate');
        if (saved) {
            const data = JSON.parse(saved);
            this.currentRate = data.rate;
            this.lastUpdate = new Date(data.date);
            this.updateRateDisplay();
        }
    }
};

// Agregar animación de shake al CSS dinámicamente
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
`;
document.head.appendChild(style);

// Iniciar la app cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => App.init());