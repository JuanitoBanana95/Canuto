import { setBitcoinPrices, getBitcoinPrices } from './state.js';

// Normalizar nombres eliminando acentos y espacios extra
export function normalizeName(name) {
    return (name && typeof name === 'string' 
        ? name.toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\s+/g, ' ')
              .trim()
        : '');
}

// Formatear números con separadores y decimales específicos
export function formatNumber(number, decimals) {
    const safeNumber = (typeof number === 'number' && !isNaN(number)) ? number : 0;
    const fixedNumber = safeNumber.toFixed(decimals);
    const [integerPart, decimalPart] = fixedNumber.split('.');
    const formattedInteger = Number(integerPart).toLocaleString('es-AR');
    return decimalPart ? `${formattedInteger},${decimalPart}` : formattedInteger;
}

// Calcular monto destino para cambios de moneda
export function calculateAmountDest() {
    const amountOrigen = parseFloat(document.getElementById('amountOrigen').value) || 0;
    const exchangeRateInput = document.getElementById('exchangeRate');
    const exchangeRate = parseFloat(exchangeRateInput.value) || 1;
    const currencyOrigen = document.getElementById('currencyOrigen').value;
    const currencyDest = document.getElementById('currencyDest').value;
    const amountDestInput = document.getElementById('amountDest');

    let amountDest;
    if (currencyOrigen === currencyDest) {
        amountDest = amountOrigen;
        exchangeRateInput.value = '';
        exchangeRateInput.disabled = true;
    } else {
        amountDest = amountOrigen * exchangeRate;
        exchangeRateInput.disabled = false;
    }

    amountDestInput.value = amountDest > 0 ? amountDest.toFixed(currencyDest === 'Bitcoin' ? 8 : 2) : '';
}

// Mostrar modal para ingresar tipo de cambio ARS/USD
function showBitcoinRateModal(defaultRate) {
    const modal = document.getElementById('bitcoinRateModal');
    const form = document.getElementById('bitcoinRateForm');
    const input = document.getElementById('arsUsdRate');
    const error = document.getElementById('bitcoinRateError');
    const submitBtn = document.getElementById('bitcoinRateSubmit');
    const cancelBtn = document.getElementById('bitcoinRateCancel');

    input.value = defaultRate || '';
    error.textContent = '';

    return new Promise((resolve) => {
        const closeModal = (rate) => {
            modal.classList.remove('active');
            form.removeEventListener('submit', submitHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(rate);
        };

        const submitHandler = (e) => {
            e.preventDefault();
            const rate = parseFloat(input.value);
            if (isNaN(rate) || rate <= 0) {
                error.textContent = 'Ingresa un valor válido mayor a 0.';
                return;
            }
            closeModal(rate);
        };

        const cancelHandler = () => closeModal(null);

        form.addEventListener('submit', submitHandler);
        cancelBtn.addEventListener('click', cancelHandler);

        modal.classList.add('active');
        input.focus();
    });
}

// Obtener precios de Bitcoin en tiempo real desde CoinGecko, usando USD como base
export async function fetchBitcoinPrices(forcePrompt = false) {
    const currentPrices = getBitcoinPrices();
    let arsUsdRate = currentPrices.arsUsdRate;

    if (forcePrompt || !arsUsdRate || arsUsdRate <= 0) {
        arsUsdRate = await showBitcoinRateModal(arsUsdRate || 1300);
        if (arsUsdRate === null) {
            // Usuario canceló, usar valor por defecto o existente
            arsUsdRate = currentPrices.arsUsdRate || 1300;
        }
    }

    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur', {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        const btcUsd = data.bitcoin.usd;
        const prices = {
            bitcoin: 1,
            dólares: 1 / btcUsd,
            pesos: 1 / (btcUsd * arsUsdRate),
            euros: 1 / data.bitcoin.eur,
            arsUsdRate: arsUsdRate
        };
        setBitcoinPrices(prices);
        return prices;
    } catch (error) {
        console.error('Error al obtener precios de Bitcoin:', error);
        const fallbackPrices = { 
            bitcoin: 1, 
            dólares: 0.000015, 
            pesos: 0.000015 / arsUsdRate, 
            euros: 0.000014,
            arsUsdRate: arsUsdRate 
        };
        setBitcoinPrices(fallbackPrices);
        return fallbackPrices;
    }
}