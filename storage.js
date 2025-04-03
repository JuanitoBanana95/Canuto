import { exportState, importState, recalculateBalances, getBalances } from './state.js';
import { updateTable, updateSummary, updatePreferencesUI } from './ui.js';
import { formatNumber } from './utils.js';
import { showNotificationModal } from './handlers.js';

// Usar window.jspdf.jsPDF directamente ya que viene del UMD build
const jsPDF = window.jspdf ? window.jspdf.jsPDF : null;
const LOCAL_STORAGE_KEY = 'financialAppData';

// Exportar datos
export function exportData(format) {
    if (!jsPDF && format === 'pdf') {
        showNotificationModal('La librería jsPDF no está disponible. Asegúrate de incluir el script en el HTML.');
        return;
    }

    const data = exportState();
    recalculateBalances();
    const balances = getBalances();
    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'pdf') {
        const doc = new jsPDF();
        doc.setFontSize(12);
        doc.text('Resumen Financiero - FLDSMDFR', 10, 10);
        doc.text(`Fecha: ${dateStr}`, 10, 20);
        let y = 30;

        // Movimientos
        doc.text('Movimientos:', 10, y);
        y += 10;
        data.movements.forEach((m, i) => {
            const details = getMovementDetails(m);
            const text = `${m.date} | ${m.movementType} | ${formatNumber(m.amount, m.currency === 'Bitcoin' ? 8 : 2)} ${m.currency} | ${m.account} | ${details}`;
            if (y + i * 10 > 280) {
                doc.addPage();
                y = 10;
            }
            doc.text(text.slice(0, 190), 10, y + i * 10);
        });

        y = y + data.movements.length * 10 + 10;
        if (y > 280) {
            doc.addPage();
            y = 10;
        }

        // Saldos
        doc.text('Saldos:', 10, y);
        y += 10;
        Object.keys(data.accountCurrencies).forEach((account, i) => {
            const balance = balances[account] || 0;
            const currency = data.accountCurrencies[account][0];
            const text = `${account}: ${formatNumber(balance, currency === 'Bitcoin' ? 8 : 2)} ${currency}`;
            if (y + i * 10 > 280) {
                doc.addPage();
                y = 10;
            }
            doc.text(text, 10, y + i * 10);
        });

        // Incluir JSON completo en una nueva página
        doc.addPage();
        doc.setFontSize(6);
        doc.text('Datos completos (JSON):', 10, 10);
        const jsonData = JSON.stringify({ ...data, balances }, null, 2);
        doc.text(jsonData, 10, 20, { maxWidth: 190 });

        doc.save(`finanzas_${dateStr}.pdf`);
    } else if (format === 'csv') {
        let csv = '';

        // Sección Movimientos
        csv += 'Movimientos\n';
        csv += 'Fecha,Tipo,Monto,Moneda,Cuenta,Destino,MontoDestino,MonedaDestino,TasaCambio,Detalles,Deuda\n';
        data.movements.forEach(m => {
            const details = getMovementDetails(m).replace(/,/g, '');
            const dest = m.movementType === 'cambio' ? m.accountDest || '' : '';
            const amountDest = m.movementType === 'cambio' ? m.amountDest || '' : '';
            const currencyDest = m.movementType === 'cambio' ? m.currencyDest || '' : '';
            const exchangeRate = m.movementType === 'cambio' && m.exchangeRate ? m.exchangeRate : '';
            const debtAccount = m.debtAccount || '';
            csv += `${m.date},${m.movementType},${m.amount},${m.currency},${m.account},${dest},${amountDest},${currencyDest},${exchangeRate},${details || ''},${debtAccount}\n`;
        });

        // Sección Saldos
        csv += '\nSaldos\n';
        csv += 'Cuenta,Saldo,Moneda\n';
        Object.keys(data.accountCurrencies).forEach(account => {
            csv += `${account},${balances[account] || 0},${data.accountCurrencies[account][0]}\n`;
        });

        // Sección Monedas por Cuenta
        csv += '\nMonedas por Cuenta\n';
        csv += 'Cuenta,Moneda\n';
        Object.keys(data.accountCurrencies).forEach(account => {
            csv += `${account},${data.accountCurrencies[account][0]}\n`;
        });

        // Sección Motivos de Ingreso
        csv += '\nMotivos de Ingreso\n';
        csv += 'Moneda,Motivo\n';
        Object.keys(data.incomeMotivesByCurrency).forEach(currency => {
            data.incomeMotivesByCurrency[currency].forEach(motive => {
                csv += `${currency},${motive}\n`;
            });
        });

        // Sección Categorías de Gasto
        csv += '\nCategorías de Gasto\n';
        csv += 'Moneda,Categoría\n';
        Object.keys(data.expenseCategoriesByCurrency).forEach(currency => {
            data.expenseCategoriesByCurrency[currency].forEach(category => {
                csv += `${currency},${category}\n`;
            });
        });

        // Sección Configuración
        csv += '\nConfiguración\n';
        csv += 'Clave,Valor\n';
        csv += `lastUsedDate,${data.lastUsedDate}\n`;
        csv += `theme,${data.theme}\n`;
        csv += `bitcoinView,${data.bitcoinView}\n`;
        Object.keys(data.bitcoinPrices).forEach(key => {
            csv += `bitcoinPrice_${key},${data.bitcoinPrices[key]}\n`;
        });

        // Sección Undo/Redo
        csv += '\nUndo Stack\n';
        csv += 'Acción,Datos\n';
        data.undoStack.slice(-20).forEach(action => {
            csv += `${action.action},${JSON.stringify(action.data)}\n`;
        });

        csv += '\nRedo Stack\n';
        csv += 'Acción,Datos\n';
        data.redoStack.slice(-20).forEach(action => {
            csv += `${action.action},${JSON.stringify(action.data)}\n`;
        });

        downloadFile(csv, `finanzas_${dateStr}.csv`, 'text/csv');
    } else {
        const json = JSON.stringify({ ...data, balances }, null, 2);
        downloadFile(json, `finanzas_${dateStr}.json`, 'application/json');
    }
}

// Importar datos
export function importData(event) {
    const file = event.target.files[0];
    if (!file) {
        showNotificationModal('No se seleccionó ningún archivo.');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            let data;
            if (file.name.endsWith('.json')) {
                data = JSON.parse(e.target.result);
            } else if (file.name.endsWith('.csv')) {
                data = parseCSV(e.target.result);
            } else if (file.name.endsWith('.pdf')) {
                data = await parsePDF(e.target.result);
            } else {
                throw new Error('Formato no soportado. Usa JSON, CSV o PDF.');
            }

            if (!isValidImportData(data)) {
                throw new Error('Datos inválidos o incompletos.');
            }

            importState(data);
            recalculateBalances();
            updateTable();
            updateSummary();
            updatePreferencesUI();
            showNotificationModal('Datos importados correctamente.');
        } catch (error) {
            console.error('Error al importar datos:', error);
            showNotificationModal(`Error al importar: ${error.message}. Verifica el formato y contenido del archivo.`);
        }
    };

    if (file.name.endsWith('.pdf')) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

// Eliminar todos los datos
export async function deleteAllData() {
    const confirmed = await showNotificationModal('¿Estás seguro de que quieres borrar todos los datos? Esta acción no se puede deshacer.', { showCancel: true });
    if (confirmed) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        importState({});
        updateTable();
        updateSummary();
        updatePreferencesUI();
        showNotificationModal('Todos los datos han sido borrados.');
    }
}

// Funciones auxiliares
function getMovementDetails(m) {
    if (m.movementType === 'ingreso') return m.motive || (m.description ? `Otros (${m.description})` : 'Sin motivo');
    if (m.movementType === 'egreso') return m.category || (m.description ? `Otros (${m.description})` : 'Sin categoría');
    if (m.movementType === 'cambio') return `${formatNumber(m.amountDest, m.currencyDest === 'Bitcoin' ? 8 : 2)} ${m.currencyDest}${m.exchangeRate && m.currency !== m.currencyDest ? ` @ ${m.exchangeRate}` : ''}`;
    if (m.movementType === 'ajuste') return m.adjustType === 'positive' ? 'Ajuste Positivo' : 'Ajuste Negativo';
    return '';
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

function parseCSV(content) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const data = {
        movements: [],
        accountCurrencies: {},
        balances: {},
        incomeMotivesByCurrency: {},
        expenseCategoriesByCurrency: {},
        undoStack: [],
        redoStack: [],
        lastUsedDate: new Date().toISOString().split('T')[0],
        theme: 'dark-mode',
        bitcoinView: false,
        bitcoinPrices: {}
    };
    let section = '';
    let sectionStart = -1;

    lines.forEach((line, index) => {
        if (line === 'Movimientos') { section = 'movements'; sectionStart = index; return; }
        if (line === 'Saldos') { section = 'balances'; sectionStart = index; return; }
        if (line === 'Monedas por Cuenta') { section = 'accountCurrencies'; sectionStart = index; return; }
        if (line === 'Motivos de Ingreso') { section = 'incomeMotives'; sectionStart = index; return; }
        if (line === 'Categorías de Gasto') { section = 'expenseCategories'; sectionStart = index; return; }
        if (line === 'Configuración') { section = 'config'; sectionStart = index; return; }
        if (line === 'Undo Stack') { section = 'undoStack'; sectionStart = index; return; }
        if (line === 'Redo Stack') { section = 'redoStack'; sectionStart = index; return; }

        if (index === sectionStart + 1) return;

        const match = line.match(/^([^,]*),(.*)$/);
        if (!match) return;
        const [_, col1, rest] = match;

        if (section === 'movements' && index > sectionStart + 1) {
            const cols = line.split(',').map(col => col.trim());
            if (cols.length >= 5) {
                const movement = {
                    date: cols[0],
                    movementType: cols[1],
                    amount: parseFloat(cols[2]) || 0,
                    currency: cols[3],
                    account: cols[4]
                };
                if (movement.movementType === 'cambio' && cols[5]) {
                    movement.accountDest = cols[5];
                    movement.amountDest = parseFloat(cols[6]) || 0;
                    movement.currencyDest = cols[7];
                    movement.exchangeRate = cols[8] ? parseFloat(cols[8]) || null : null;
                    if (cols[9]) movement.description = cols[9];
                    if (cols[10] && !cols[10].includes('@')) movement.debtAccount = cols[10];
                } else {
                    if (cols[9]) {
                        if (movement.movementType === 'ingreso') movement.motive = cols[9];
                        else if (movement.movementType === 'egreso') movement.category = cols[9];
                        else if (movement.movementType === 'ajuste') {
                            movement.adjustType = cols[9].includes('Positivo') ? 'positive' : 'negative';
                        } else movement.description = cols[9];
                    }
                    if (cols[10] && !cols[10].includes('@')) movement.debtAccount = cols[10];
                }
                data.movements.push(movement);

                if (!data.accountCurrencies[movement.account]) {
                    data.accountCurrencies[movement.account] = [movement.currency];
                }
                if (movement.accountDest && !data.accountCurrencies[movement.accountDest]) {
                    data.accountCurrencies[movement.accountDest] = [movement.currencyDest];
                }
                if (movement.debtAccount && !data.accountCurrencies[movement.debtAccount]) {
                    data.accountCurrencies[movement.debtAccount] = [movement.currency];
                }
            }
        } else if (section === 'balances' && index > sectionStart + 1) {
            const cols = line.split(',').map(col => col.trim());
            if (cols.length >= 3) {
                const account = cols[0];
                data.balances[account] = parseFloat(cols[1]) || 0;
                if (!data.accountCurrencies[account]) {
                    data.accountCurrencies[account] = [cols[2]];
                }
            }
        } else if (section === 'accountCurrencies' && index > sectionStart + 1) {
            data.accountCurrencies[col1] = [rest];
        } else if (section === 'incomeMotives' && index > sectionStart + 1) {
            const currency = col1;
            if (!data.incomeMotivesByCurrency[currency]) data.incomeMotivesByCurrency[currency] = [];
            data.incomeMotivesByCurrency[currency].push(rest);
        } else if (section === 'expenseCategories' && index > sectionStart + 1) {
            const currency = col1;
            if (!data.expenseCategoriesByCurrency[currency]) data.expenseCategoriesByCurrency[currency] = [];
            data.expenseCategoriesByCurrency[currency].push(rest);
        } else if (section === 'config' && index > sectionStart + 1) {
            if (col1 === 'lastUsedDate') data.lastUsedDate = rest;
            else if (col1 === 'theme') data.theme = rest;
            else if (col1 === 'bitcoinView') data.bitcoinView = rest === 'true';
            else if (col1.startsWith('bitcoinPrice_')) {
                const key = col1.replace('bitcoinPrice_', '');
                data.bitcoinPrices[key] = parseFloat(rest) || 0;
            }
        } else if (section === 'undoStack' && index > sectionStart + 1) {
            try {
                data.undoStack.push({ action: col1, data: JSON.parse(rest) });
            } catch (e) {
                console.warn(`No se pudo parsear acción de undoStack: ${line}`, e);
            }
        } else if (section === 'redoStack' && index > sectionStart + 1) {
            try {
                data.redoStack.push({ action: col1, data: JSON.parse(rest) });
            } catch (e) {
                console.warn(`No se pudo parsear acción de redoStack: ${line}`, e);
            }
        }
    });

    const validAccounts = new Set();
    data.movements.forEach(m => {
        validAccounts.add(m.account);
        if (m.accountDest) validAccounts.add(m.accountDest);
        if (m.debtAccount) validAccounts.add(m.debtAccount);
    });
    Object.keys(data.balances).forEach(account => validAccounts.add(account));
    Object.keys(data.accountCurrencies).forEach(account => validAccounts.add(account));

    const filteredBalances = {};
    Object.keys(data.balances).forEach(account => {
        if (validAccounts.has(account) && !account.includes('@')) {
            filteredBalances[account] = data.balances[account];
        } else {
            console.warn(`Cuenta eliminada de balances: ${account}`);
        }
    });
    data.balances = filteredBalances;

    const filteredAccountCurrencies = {};
    Object.keys(data.accountCurrencies).forEach(account => {
        if (validAccounts.has(account) && !account.includes('@')) {
            filteredAccountCurrencies[account] = data.accountCurrencies[account];
        } else {
            console.warn(`Cuenta eliminada de accountCurrencies: ${account}`);
        }
    });
    data.accountCurrencies = filteredAccountCurrencies;

    return data;
}

async function parsePDF(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }

    const jsonMarker = 'Datos completos (JSON):';
    const jsonStartIndex = fullText.indexOf(jsonMarker);
    if (jsonStartIndex !== -1) {
        const jsonText = fullText.substring(jsonStartIndex + jsonMarker.length).trim();
        const jsonStart = jsonText.indexOf('{');
        if (jsonStart !== -1) {
            const jsonStr = jsonText.substring(jsonStart);
            try {
                const data = JSON.parse(jsonStr);
                if (isValidImportData(data)) return data;
            } catch (e) {
                console.warn('No se encontró JSON válido en el PDF, intentando parseo manual:', e);
            }
        }
    }

    const lines = fullText.split('\n').map(line => line.trim()).filter(line => line);
    const data = { movements: [], accountCurrencies: {}, balances: {} };
    let section = 'movements';

    lines.forEach(line => {
        if (line.startsWith('Movimientos:')) return;
        if (line.startsWith('Saldos:')) { section = 'balances'; return; }
        if (section === 'movements' && line.includes('|')) {
            const [date, type, amountCurrency, account, details] = line.split(' | ');
            const [amount, currency] = amountCurrency.split(' ').filter(Boolean);
            const movement = {
                date,
                movementType: type,
                amount: parseFloat(amount.replace(',', '.')) || 0,
                currency,
                account
            };
            if (!data.accountCurrencies[movement.account]) {
                data.accountCurrencies[movement.account] = [movement.currency];
            }
            if (details) {
                if (movement.movementType === 'ingreso') movement.motive = details;
                else if (movement.movementType === 'egreso') movement.category = details;
                else if (movement.movementType === 'cambio') {
                    const parts = details.split(' @ ');
                    const [amountDestCurrency] = parts[0].split(' ');
                    const [amountDest, currencyDest] = amountDestCurrency.split(' ');
                    movement.amountDest = parseFloat(amountDest.replace(',', '.')) || 0;
                    movement.currencyDest = currencyDest || details.split(' ')[1];
                    movement.accountDest = data.accountCurrencies[account] ? account : 'Unknown';
                    if (parts[1]) movement.exchangeRate = parseFloat(parts[1].replace(',', '.')) || null;
                    if (!data.accountCurrencies[movement.accountDest]) {
                        data.accountCurrencies[movement.accountDest] = [movement.currencyDest];
                    }
                } else if (movement.movementType === 'ajuste') movement.adjustType = details;
            }
            data.movements.push(movement);
        } else if (section === 'balances' && line.includes(': ')) {
            const [account, rest] = line.split(': ');
            const [balance, currency] = rest.split(' ').filter(Boolean);
            data.accountCurrencies[account] = [currency];
            data.balances[account] = parseFloat(balance.replace(',', '.')) || 0;
        }
    });

    return data;
}

function isValidImportData(data) {
    return data && typeof data === 'object' &&
           Array.isArray(data.movements) &&
           data.accountCurrencies && typeof data.accountCurrencies === 'object';
}