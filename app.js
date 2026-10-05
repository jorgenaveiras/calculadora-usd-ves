// Calculadora BCV → VES con tasas USD y EUR en tiempo real
const App = {
    // Variables
    rates: { USD: null, EUR: null },
    currentCurrency: 'USD',
    lastUpdate: null,
    history: [],
    isLoading: false,

    // URL del BCV - usamos jina.ai reader para evitar problemas CORS
    BCV_URL: 'https://r.jina.ai/https://www.bcv.org.ve/',

    // Inicializar la app
    init() {
        this.loadSavedCurrency();
        this.loadHistory();
        this.loadSavedRate();
        this.setupEventListeners();
        this.updateCurrencyUI();
        this.fetchExchangeRate();
    },

    // Configurar event listeners
    setupEventListeners() {
        document.getElementById('convertBtn').addEventListener('click', () => this.convert());
        document.getElementById('refreshBtn').addEventListener('click', () => this.fetchExchangeRate());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
        document.getElementById('copyBtn').addEventListener('click', () => this.copyResult());

        // Selector de moneda
        document.querySelectorAll('input[name="currency"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.currentCurrency = radio.value;
                localStorage.setItem('calcCurrency', this.currentCurrency);
                this.updateCurrencyUI();
                this.updateRateDisplay();
            });
        });

        // Input: permitir decimales con coma o punto (iPhone y web)
        const input = document.getElementById('usdAmount');
        input.addEventListener('input', () => this.sanitizeInput(input));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.convert();
        });
    },

    // Sanitizar input: solo dígitos, coma y punto (máx uno de cada)
    sanitizeInput(el) {
        let v = el.value.replace(/[^\d.,]/g, '');
        let seenDot = false, seenComma = false, out = '';
        for (const ch of v) {
            if (ch === '.') { if (seenDot) continue; seenDot = true; }
            else if (ch === ',') { if (seenComma) continue; seenComma = true; }
            out += ch;
        }
        if (out !== el.value) {
            el.value = out;
        }
    },

    // Parsear monto: acepta coma (es-VE) y punto como decimal
    parseAmount(raw) {
        let v = (raw || '').trim().replace(/\s/g, '');
        if (!v) return NaN;
        const hasDot = v.includes('.'), hasComma = v.includes(',');
        if (hasDot && hasComma) {
            if (v.lastIndexOf(',') > v.lastIndexOf('.')) {
                // Formato es-VE: 1.234,56 → 1234.56
                v = v.replace(/\./g, '').replace(',', '.');
            } else {
                // Formato en-US: 1,234.56 → 1234.56
                v = v.replace(/,/g, '');
            }
        } else if (hasComma) {
            const parts = v.split(',');
            if (parts.length === 2) {
                v = parts[0] + '.' + parts[1]; // 50,75 → 50.75
            } else {
                v = v.replace(/,/g, ''); // 1,234,567 → 1234567
            }
        }
        // Si solo hay punto: tratarlo como decimal (50.75 → 50.75)
        return parseFloat(v);
    },

    // Cargar moneda guardada
    loadSavedCurrency() {
        const saved = localStorage.getItem('calcCurrency');
        if (saved && (saved === 'USD' || saved === 'EUR')) {
            this.currentCurrency = saved;
        }
    },

    // Actualizar UI según moneda seleccionada
    updateCurrencyUI() {
        const isUSD = this.currentCurrency === 'USD';
        document.getElementById('amountLabel').textContent = isUSD ? 'Monto en Dólares ($)' : 'Monto en Euros (€)';
        document.getElementById('inputPrefix').textContent = isUSD ? '$' : '€';
        document.getElementById('rateLabel').textContent = isUSD ? 'Tasa Actual (Bs/USD)' : 'Tasa Actual (Bs/EUR)';
        const logoFrom = document.getElementById('logoFrom');
        if (logoFrom) logoFrom.textContent = isUSD ? '$' : '€';

        // Marcar radio activo
        const radio = document.querySelector(`input[name="currency"][value="${this.currentCurrency}"]`);
        if (radio) radio.checked = true;

        // Marcar clase active en la opción
        document.querySelectorAll('.currency-option').forEach(opt => {
            const input = opt.querySelector('input');
            opt.classList.toggle('active', input && input.checked);
        });
    },

    // Obtener ambas tasas (USD y EUR) del BCV
    async fetchExchangeRate() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading(true);

        try {
            const rates = await this.getBCVRates();
            if (rates.USD || rates.EUR) {
                if (rates.USD) this.rates.USD = rates.USD;
                if (rates.EUR) this.rates.EUR = rates.EUR;
                this.lastUpdate = new Date();
                this.saveRate();
                this.updateRateDisplay();
            } else {
                throw new Error('No se pudo obtener ninguna tasa');
            }
        } catch (error) {
            console.error('Error al obtener tasas:', error);
            this.showError('Error al conectar con BCV. Usando última tasa conocida.');
            if (!this.rates.USD && !this.rates.EUR) {
                this.rates.USD = 784.66;
                this.rates.EUR = 916.01;
                this.updateRateDisplay();
            }
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    },

    // Obtener ambas tasas del BCV usando jina.ai reader (evita CORS)
    async getBCVRates() {
        try {
            const response = await fetch(this.BCV_URL);
            const text = await response.text();
            const result = { USD: null, EUR: null };

            // Buscar todas las tasas en negrita con su contexto
            const boldRe = /([^\*]{0,150})\*\*(\d{1,3}[.,]\d{2,})\*\*/g;
            let m;
            const candidates = [];
            while ((m = boldRe.exec(text)) !== null) {
                candidates.push({ ctx: m[1], num: m[2] });
            }

            let bestUSD = null, bestUSDScore = -1;
            let bestEUR = null, bestEURScore = -1;

            for (const c of candidates) {
                const ctxLower = c.ctx.toLowerCase();
                const usdIdx = Math.max(ctxLower.lastIndexOf('usd'), ctxLower.lastIndexOf('dollar'), ctxLower.lastIndexOf('dólar'));
                const eurIdx = Math.max(ctxLower.lastIndexOf('eur'), ctxLower.lastIndexOf('euro'));

                if (usdIdx > -1 && usdIdx > bestUSDScore) {
                    bestUSDScore = usdIdx;
                    bestUSD = c.num;
                }
                if (eurIdx > -1 && eurIdx > bestEURScore) {
                    bestEURScore = eurIdx;
                    bestEUR = c.num;
                }
            }

            if (bestUSD) {
                const rate = parseFloat(bestUSD.replace(',', '.'));
                if (!isNaN(rate) && rate > 100 && rate < 5000) result.USD = rate;
            }

            if (bestEUR) {
                const rate = parseFloat(bestEUR.replace(',', '.'));
                if (!isNaN(rate) && rate > 100 && rate < 5000) result.EUR = rate;
            }

            // Estrategias de fallback para USD
            if (!result.USD) {
                const usdBold = text.match(/USD[\s\S]*?\*\*(\d{1,3}[.,]\d{1,3})\*\*/i);
                if (usdBold) {
                    const r = parseFloat(usdBold[1].replace(',', '.'));
                    if (!isNaN(r) && r > 100 && r < 5000) result.USD = r;
                }
            }
            if (!result.USD) {
                const dollarImg = text.match(/!\[.*?dollar[^\]]*\][\s\S]*?\*\*(\d{1,3}[.,]\d{1,3})\*\*/i);
                if (dollarImg) {
                    const r = parseFloat(dollarImg[1].replace(',', '.'));
                    if (!isNaN(r) && r > 100 && r < 5000) result.USD = r;
                }
            }

            // Estrategias de fallback para EUR
            if (!result.EUR) {
                const eurBold = text.match(/EUR[\s\S]*?\*\*(\d{1,3}[.,]\d{1,3})\*\*/i);
                if (eurBold) {
                    const r = parseFloat(eurBold[1].replace(',', '.'));
                    if (!isNaN(r) && r > 100 && r < 5000) result.EUR = r;
                }
            }
            if (!result.EUR) {
                const euroImg = text.match(/!\[.*?euro[^\]]*\][\s\S]*?\*\*(\d{1,3}[.,]\d{1,3})\*\*/i);
                if (euroImg) {
                    const r = parseFloat(euroImg[1].replace(',', '.'));
                    if (!isNaN(r) && r > 100 && r < 5000) result.EUR = r;
                }
            }
            if (!result.EUR) {
                // Fallback: buscar "Euro" seguido de número (tabla informativa)
                const euroTable = text.match(/Euro[\s\S]{0,80}?(\d{1,3}[.,]\d{2,})/i);
                if (euroTable) {
                    const r = parseFloat(euroTable[1].replace(',', '.'));
                    if (!isNaN(r) && r > 100 && r < 5000) result.EUR = r;
                }
            }

            // Validación: si USD y EUR son iguales, es un error de parsing
            if (result.USD && result.EUR && Math.abs(result.USD - result.EUR) < 1) {
                result.EUR = null;
            }

            console.log('Tasas BCV:', result);
            return result;
        } catch (error) {
            console.error('Error en getBCVRates:', error);
            return { USD: null, EUR: null };
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

        const rate = this.rates[this.currentCurrency];
        if (rate) {
            rateElement.textContent = this.formatNumber(rate, 4);
            dateElement.textContent = this.lastUpdate
                ? `Actualizado: ${this.lastUpdate.toLocaleString('es-VE')}`
                : 'Fecha no disponible';
        } else {
            rateElement.textContent = 'N/D';
            dateElement.textContent = 'Tasa no disponible - pulse Actualizar';
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
        const amount = this.parseAmount(input.value);

        if (!amount || amount <= 0) {
            this.shakeInput();
            return;
        }

        const rate = this.rates[this.currentCurrency];
        if (!rate) {
            alert('No hay tasa disponible. Por favor actualice la tasa.');
            return;
        }

        const vesAmount = amount * rate;

        // Mostrar resultado
        this.showResult(vesAmount);

        // Guardar en historial
        this.addToHistory(amount, vesAmount, this.currentCurrency);

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

    // Animación de shake para input inválido
    shakeInput() {
        const input = document.getElementById('usdAmount');
        input.style.animation = 'shake 0.5s ease';
        setTimeout(() => input.style.animation = '', 500);
    },

    // Copiar resultado al portapapeles
    copyResult() {
        const value = document.getElementById('vesResult').textContent.replace('Bs ', '');
        const btn = document.getElementById('copyBtn');

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(value).then(() => {
                this.showCopiedFeedback(btn);
            });
        } else {
            // Fallback para entornos sin clipboard API
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.showCopiedFeedback(btn);
            } catch (e) {
                prompt('Copia manualmente:', value);
            }
            document.body.removeChild(textarea);
        }
    },

    showCopiedFeedback(btn) {
        const originalSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        const checkSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

        btn.classList.add('copied');
        btn.innerHTML = checkSvg;
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalSvg;
        }, 1500);
    },

    // Agregar al historial
    addToHistory(amount, ves, currency) {
        const item = {
            usd: amount,
            cur: currency || 'USD',
            ves,
            rate: this.rates[currency || 'USD'],
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

        list.innerHTML = this.history.map(item => {
            const symbol = item.cur === 'EUR' ? '€' : '$';
            const curLabel = item.cur || 'USD';
            return `
            <div class="history-item">
                <div>
                    <div class="history-conversion">
                        ${symbol}${this.formatNumber(item.usd)} → Bs ${this.formatNumber(item.ves)}
                    </div>
                    <div class="history-rate">
                        Tasa ${curLabel}: ${this.formatNumber(item.rate, 4)} | ${new Date(item.date).toLocaleString('es-VE')}
                    </div>
                </div>
            </div>
        `;
        }).join('');
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

    // Guardar tasas en localStorage
    saveRate() {
        localStorage.setItem('calcRate', JSON.stringify({
            rates: this.rates,
            date: this.lastUpdate
        }));
    },

    // Cargar tasas de localStorage (compatible con formato antiguo)
    loadSavedRate() {
        const saved = localStorage.getItem('calcRate');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.rates) {
                    this.rates = data.rates;
                } else if (data.rate) {
                    // Formato antiguo: solo una tasa (USD)
                    this.rates.USD = data.rate;
                }
                this.lastUpdate = new Date(data.date);
                this.updateRateDisplay();
            } catch (e) {
                console.error('Error cargando tasa guardada:', e);
            }
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
