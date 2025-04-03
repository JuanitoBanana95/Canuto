import { 
    getMovements, getBalances, getAccountCurrencies, getIncomeMotivesByCurrency, 
    getExpenseCategoriesByCurrency, getBitcoinView, getBitcoinPrices
} from './state.js';
import { formatNumber } from './utils.js';
import { removeAccount, renameAccount, removeIncomeMotive, renameIncomeMotive, removeExpenseCategory, renameExpenseCategory, deleteMovement, editMovement } from './handlers.js';

// Actualizar tabla de movimientos
export function updateTable() {
    const container = document.getElementById('financeBody');
    const filters = getFilters();
    const movements = filterMovements(filters);

    // Ordenamiento: por defecto, mostrar en orden inverso de carga (último primero)
    if (filters.sort && filters.sort !== 'load-order') {
        switch (filters.sort) {
            case 'date-asc':
                movements.sort((a, b) => a.date.localeCompare(b.date));
                break;
            case 'date-desc':
                movements.sort((a, b) => b.date.localeCompare(a.date));
                break;
            case 'amount-desc':
                movements.sort((a, b) => b.amount - a.amount);
                break;
            case 'amount-asc':
                movements.sort((a, b) => a.amount - b.amount);
                break;
        }
    } else {
        // Orden predeterminado: inverso al orden de carga
        movements.sort((a, b) => b.index - a.index);
    }

    container.innerHTML = '';
    movements.forEach(m => {
        const item = createMovementItem(m, m.index);
        container.appendChild(item);
    });
}

function getFilters() {
    return {
        type: document.getElementById('filterType').value,
        category: document.getElementById('filterCategory').value,
        account: document.getElementById('filterAccount').value,
        dateFrom: document.getElementById('filterDateFrom').value,
        dateTo: document.getElementById('filterDateTo').value,
        amountMin: parseFloat(document.getElementById('filterAmountMin').value) || -Infinity,
        amountMax: parseFloat(document.getElementById('filterAmountMax').value) || Infinity,
        description: document.getElementById('filterDescription').value.toLowerCase(),
        sort: document.getElementById('filterSort').value
    };
}

function filterMovements(filters) {
    return getMovements().map((m, index) => ({ ...m, index })).filter(m => {
        if (!m || !m.movementType) return false;
        if (filters.type && m.movementType !== filters.type) return false;
        if (filters.category) {
            const detail = m.movementType === 'ingreso' ? m.motive : m.movementType === 'egreso' ? m.category : null;
            if (detail !== filters.category) return false;
        }
        if (filters.account) {
            if (m.account !== filters.account && (m.movementType !== 'cambio' || m.accountDest !== filters.account) && m.debtAccount !== filters.account) return false;
        }
        if (filters.dateFrom && m.date < filters.dateFrom) return false;
        if (filters.dateTo && m.date > filters.dateTo) return false;
        if (m.amount < filters.amountMin || m.amount > filters.amountMax) return false;
        if (filters.description) {
            const details = getMovementDetails(m);
            if (!details.toLowerCase().includes(filters.description)) return false;
        }
        return true;
    });
}

function createMovementItem(m, index) {
    const item = document.createElement('div');
    item.classList.add('movement-item', m.movementType);
    const details = getMovementDetails(m);
    const amountClass = m.currency === 'Bitcoin' ? 'bitcoin' : m.currency === 'Pesos' ? 'pesos' : m.currency === 'Dólares' ? 'dolares' : 'euros';
    const typeDisplay = m.movementType.charAt(0).toUpperCase() + m.movementType.slice(1);

    item.innerHTML = `
        <span>${m.date || 'Sin fecha'}</span>
        <span>${typeDisplay}</span>
        <span>${details}</span>
        <span>${formatNumber(m.amount, m.currency === 'Bitcoin' ? 8 : 2)} <span class="${amountClass}">${m.currency}</span></span>
        <span>${m.account || 'Sin cuenta'}</span>
        <div class="action-buttons">
            <button class="edit-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
            <button class="delete-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
        </div>
    `;
    item.querySelector('.edit-btn').addEventListener('click', editMovement);
    item.querySelector('.delete-btn').addEventListener('click', deleteMovement);
    return item;
}

function getMovementDetails(m) {
    if (m.movementType === 'ingreso') {
        const baseDetail = m.motive || 'Sin motivo';
        return m.description ? `${baseDetail} (${m.description})` : baseDetail;
    } else if (m.movementType === 'egreso') {
        const baseDetail = m.category || 'Sin categoría';
        return m.description ? `${baseDetail} (${m.description})` : baseDetail;
    } else if (m.movementType === 'cambio') {
        return `A ${m.accountDest} (${formatNumber(m.amountDest, m.currencyDest === 'Bitcoin' ? 8 : 2)} ${m.currencyDest}${m.currency === m.currencyDest ? '' : m.exchangeRate ? ` @ ${formatNumber(m.exchangeRate, 2)}` : ''})`;
    }
    return m.adjustType === 'positive' ? 'Ajuste Positivo' : 'Ajuste Negativo';
}

// Actualizar resumen
export function updateSummary() {
    const accountsContainer = document.getElementById('accountsSummary');
    const totalsContainer = document.getElementById('totalsSummary');
    accountsContainer.innerHTML = '';
    totalsContainer.innerHTML = '';

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const balances = getBalances();
    const accountCurrencies = getAccountCurrencies();
    const bitcoinView = getBitcoinView();
    const prices = getBitcoinPrices();

    // Ordenamiento determinista: deuda, pesos, dólares, euros, bitcoin
    const orderedAccounts = Object.keys(balances).sort((a, b) => {
        const isDebtA = a.toLowerCase().startsWith('deuda');
        const isDebtB = b.toLowerCase().startsWith('deuda');
        const currencyA = accountCurrencies[a][0];
        const currencyB = accountCurrencies[b][0];
        const orderA = isDebtA ? 0 : { 'Pesos': 1, 'Dólares': 2, 'Euros': 3, 'Bitcoin': 4 }[currencyA] || 5;
        const orderB = isDebtB ? 0 : { 'Pesos': 1, 'Dólares': 2, 'Euros': 3, 'Bitcoin': 4 }[currencyB] || 5;
        return orderA - orderB || a.localeCompare(b);
    }).filter(account => balances[account] !== 0); // Ocultar cuentas con saldo 0

    orderedAccounts.forEach(account => {
        const card = createBalanceCard(account, threeMonthsAgo, bitcoinView, prices);
        accountsContainer.appendChild(card);
    });

    const totals = calculateTotalsByCurrency(balances, accountCurrencies);
    const orderedCurrencies = ['Pesos', 'Dólares', 'Euros', 'Bitcoin'].filter(currency => totals[currency]); // Mostrar solo monedas con totales
    orderedCurrencies.forEach(currency => {
        const totalCard = createTotalCard(currency, totals[currency], threeMonthsAgo, bitcoinView, prices);
        totalsContainer.appendChild(totalCard);
    });

    updateMovementSummary();
}

function createBalanceCard(account, threeMonthsAgo, bitcoinView, prices) {
    const balances = getBalances();
    const accountCurrencies = getAccountCurrencies();
    const currency = accountCurrencies[account][0];
    const decimals = currency === 'Bitcoin' ? 8 : 2;
    const balance = Number(balances[account] || 0);
    const isDebtAccount = account.toLowerCase().startsWith('deuda');
    let displayBalance = balance;
    let displayCurrency = currency;
    let amountClass = isDebtAccount ? 'deuda' : currency === 'Bitcoin' ? 'bitcoin' : currency === 'Pesos' ? 'pesos' : currency === 'Dólares' ? 'dolares' : 'euros';

    if (bitcoinView && prices[currency.toLowerCase()]) {
        displayBalance = balance * prices[currency.toLowerCase()];
        displayCurrency = 'Bitcoin';
        amountClass = 'bitcoin';
    }

    const isNegative = displayBalance < 0;

    const card = document.createElement('div');
    card.className = 'balance-card';
    card.addEventListener('click', () => showHistoryModal(account));
    const safeAccountId = account.replace(/[^a-zA-Z0-9-_]/g, '-');
    card.innerHTML = `
        <h3>${account} ${isNegative ? '<i class="fas fa-exclamation-triangle" style="color: #e53e3e;"></i>' : ''}</h3>
        <span class="amount ${amountClass}">${formatNumber(displayBalance, displayCurrency === 'Bitcoin' ? 8 : 2)}</span>
        <canvas id="chart-${safeAccountId}" height="60"></canvas>
    `;

    const ctx = card.querySelector(`#chart-${safeAccountId}`).getContext('2d');
    const history = calculateBalanceHistory(account, threeMonthsAgo);
    const chartData = bitcoinView && prices[currency.toLowerCase()] 
        ? history.map(h => ({ date: h.date, balance: h.balance * prices[currency.toLowerCase()] }))
        : history;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(h => h.date),
            datasets: [{
                data: chartData.map(h => h.balance),
                borderColor: isDebtAccount ? '#e53e3e' : currency === 'Bitcoin' ? '#f7931a' : currency === 'Pesos' ? '#3182ce' : currency === 'Dólares' ? '#38a169' : '#8b5cf6',
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: {
            scales: { 
                x: { display: false }, 
                y: { 
                    display: false,
                    min: Math.min(...chartData.map(h => h.balance)) < 0 ? undefined : 0
                } 
            },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            maintainAspectRatio: false
        }
    });

    return card;
}

function createTotalCard(currency, total, threeMonthsAgo, bitcoinView, prices) {
    let displayTotal = total;
    let displayCurrency = currency;
    let amountClass = currency === 'Bitcoin' ? 'bitcoin' : currency === 'Pesos' ? 'pesos' : currency === 'Dólares' ? 'dolares' : 'euros';

    if (bitcoinView && prices[currency.toLowerCase()]) {
        displayTotal = total * prices[currency.toLowerCase()];
        displayCurrency = 'Bitcoin';
        amountClass = 'bitcoin';
    }

    const card = document.createElement('div');
    card.className = 'balance-card total-card';
    card.innerHTML = `
        <h3>Total en ${currency}${bitcoinView ? ' (Bitcoin)' : ''}</h3>
        <span class="amount ${amountClass}">${formatNumber(displayTotal, displayCurrency === 'Bitcoin' ? 8 : 2)}</span>
        <canvas id="chart-total-${currency.toLowerCase()}" height="60"></canvas>
    `;

    const ctx = card.querySelector(`#chart-total-${currency.toLowerCase()}`).getContext('2d');
    const history = calculateTotalHistory(currency, threeMonthsAgo);
    const chartData = bitcoinView && prices[currency.toLowerCase()] 
        ? history.map(h => ({ date: h.date, balance: h.balance * prices[currency.toLowerCase()] }))
        : history;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(h => h.date),
            datasets: [{
                data: chartData.map(h => h.balance),
                borderColor: currency === 'Bitcoin' ? '#f7931a' : currency === 'Pesos' ? '#3182ce' : currency === 'Dólares' ? '#38a169' : '#8b5cf6',
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: {
            scales: { 
                x: { display: false }, 
                y: { 
                    display: false,
                    min: Math.min(...chartData.map(h => h.balance)) < 0 ? undefined : 0
                } 
            },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            maintainAspectRatio: false
        }
    });

    return card;
}

function calculateTotalsByCurrency(balances, accountCurrencies) {
    const totals = {};
    for (let account in balances) {
        const currency = accountCurrencies[account][0];
        totals[currency] = (totals[currency] || 0) + balances[account];
    }
    return totals;
}

function calculateBalanceHistory(account, threeMonthsAgo) {
    const movements = getMovements();
    const threeMonthsAgoDate = new Date(threeMonthsAgo);
    const allMovements = movements.filter(m => 
        m.account === account || 
        (m.movementType === 'cambio' && m.accountDest === account) || 
        m.debtAccount === account
    );
    let balance = 0;

    allMovements.filter(m => new Date(m.date) < threeMonthsAgoDate).forEach(m => {
        if (m.account === account) {
            if (m.movementType === 'ingreso') balance += m.amount;
            else if (m.movementType === 'egreso') balance -= m.amount;
            else if (m.movementType === 'cambio') balance -= m.amount;
            else if (m.movementType === 'ajuste') balance += m.amount * (m.adjustType === 'positive' ? 1 : -1);
        } else if (m.movementType === 'cambio' && m.accountDest === account) {
            balance += m.amountDest;
        } else if (m.debtAccount === account) {
            if (m.movementType === 'ingreso') balance -= m.amount;
            else if (m.movementType === 'egreso') balance += m.amount;
        }
    });

    const history = [{ date: threeMonthsAgoDate.toISOString().split('T')[0], balance }];
    const relevantMovements = allMovements.filter(m => new Date(m.date) >= threeMonthsAgoDate)
        .sort((a, b) => a.date.localeCompare(b.date));

    relevantMovements.forEach(m => {
        const currentDate = new Date(m.date);
        if (m.account === account) {
            if (m.movementType === 'ingreso') balance += m.amount;
            else if (m.movementType === 'egreso') balance -= m.amount;
            else if (m.movementType === 'cambio') balance -= m.amount;
            else if (m.movementType === 'ajuste') balance += m.amount * (m.adjustType === 'positive' ? 1 : -1);
        } else if (m.movementType === 'cambio' && m.accountDest === account) {
            balance += m.amountDest;
        } else if (m.debtAccount === account) {
            if (m.movementType === 'ingreso') balance -= m.amount;
            else if (m.movementType === 'egreso') balance += m.amount;
        }
        history.push({ date: currentDate.toISOString().split('T')[0], balance });
    });

    const now = new Date();
    if (history[history.length - 1].date !== now.toISOString().split('T')[0]) {
        history.push({ date: now.toISOString().split('T')[0], balance });
    }

    return history;
}

function calculateTotalHistory(currency, threeMonthsAgo) {
    const movements = getMovements();
    const accountCurrencies = getAccountCurrencies();
    const threeMonthsAgoDate = new Date(threeMonthsAgo);
    const relevantAccounts = Object.keys(accountCurrencies).filter(acc => accountCurrencies[acc][0] === currency);
    const allMovements = movements.filter(m => 
        relevantAccounts.includes(m.account) || 
        (m.movementType === 'cambio' && relevantAccounts.includes(m.accountDest)) || 
        relevantAccounts.includes(m.debtAccount)
    );
    let balance = 0;

    allMovements.filter(m => new Date(m.date) < threeMonthsAgoDate).forEach(m => {
        if (relevantAccounts.includes(m.account)) {
            if (m.movementType === 'ingreso') balance += m.amount;
            else if (m.movementType === 'egreso') balance -= m.amount;
            else if (m.movementType === 'cambio') balance -= m.amount;
            else if (m.movementType === 'ajuste') balance += m.amount * (m.adjustType === 'positive' ? 1 : -1);
        } else if (m.movementType === 'cambio' && relevantAccounts.includes(m.accountDest)) {
            balance += m.amountDest;
        } else if (relevantAccounts.includes(m.debtAccount)) {
            if (m.movementType === 'ingreso') balance -= m.amount;
            else if (m.movementType === 'egreso') balance += m.amount;
        }
    });

    const history = [{ date: threeMonthsAgoDate.toISOString().split('T')[0], balance }];
    const relevantMovements = allMovements.filter(m => new Date(m.date) >= threeMonthsAgoDate)
        .sort((a, b) => a.date.localeCompare(b.date));

    relevantMovements.forEach(m => {
        const currentDate = new Date(m.date);
        if (relevantAccounts.includes(m.account)) {
            if (m.movementType === 'ingreso') balance += m.amount;
            else if (m.movementType === 'egreso') balance -= m.amount;
            else if (m.movementType === 'cambio') balance -= m.amount;
            else if (m.movementType === 'ajuste') balance += m.amount * (m.adjustType === 'positive' ? 1 : -1);
        } else if (m.movementType === 'cambio' && relevantAccounts.includes(m.accountDest)) {
            balance += m.amountDest;
        } else if (relevantAccounts.includes(m.debtAccount)) {
            if (m.movementType === 'ingreso') balance -= m.amount;
            else if (m.movementType === 'egreso') balance += m.amount;
        }
        history.push({ date: currentDate.toISOString().split('T')[0], balance });
    });

    const now = new Date();
    if (history[history.length - 1].date !== now.toISOString().split('T')[0]) {
        history.push({ date: now.toISOString().split('T')[0], balance });
    }

    return history;
}

// Actualizar resumen de movimientos por moneda
export function updateMovementSummary() {
    const summaryContainer = document.getElementById('movementSummary');
    summaryContainer.innerHTML = '';
    const movements = getMovements();
    const bitcoinView = getBitcoinView();
    const prices = getBitcoinPrices();

    const summaries = {};
    movements.forEach(m => {
        if (m.movementType === 'ingreso') {
            if (!summaries[m.currency]) summaries[m.currency] = { income: 0, expense: 0 };
            summaries[m.currency].income += m.amount;
        } else if (m.movementType === 'egreso') {
            if (!summaries[m.currency]) summaries[m.currency] = { income: 0, expense: 0 };
            summaries[m.currency].expense += m.amount;
        } else if (m.movementType === 'cambio') {
            if (!summaries[m.currency]) summaries[m.currency] = { income: 0, expense: 0 };
            summaries[m.currency].expense += m.amount;
            if (!summaries[m.currencyDest]) summaries[m.currencyDest] = { income: 0, expense: 0 };
            summaries[m.currencyDest].income += m.amountDest;
        }
    });

    Object.keys(summaries).forEach(currency => {
        const summary = summaries[currency];
        let income = summary.income;
        let expense = summary.expense;
        let displayCurrency = currency;
        let amountClass = currency === 'Bitcoin' ? 'bitcoin' : currency === 'Pesos' ? 'pesos' : currency === 'Dólares' ? 'dolares' : 'euros';

        if (bitcoinView && prices[currency.toLowerCase()]) {
            income *= prices[currency.toLowerCase()];
            expense *= prices[currency.toLowerCase()];
            displayCurrency = 'Bitcoin';
            amountClass = 'bitcoin';
        }

        const card = document.createElement('div');
        card.className = 'summary-card';
        card.innerHTML = `
            <h3>${displayCurrency}</h3>
            <span>Ingresos: <span class="${amountClass}">${formatNumber(income, displayCurrency === 'Bitcoin' ? 8 : 2)}</span></span>
            <span>Egresos: <span class="${amountClass}">${formatNumber(expense, displayCurrency === 'Bitcoin' ? 8 : 2)}</span></span>
        `;
        summaryContainer.appendChild(card);
    });
}

// Mostrar historial en modal
export function showHistoryModal(account) {
    const modal = document.getElementById('historyModal');
    const modalTitle = document.getElementById('modalTitle');
    const historyBody = document.getElementById('historyBody');
    modalTitle.textContent = `Historial de ${account}`;
    historyBody.innerHTML = '';

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const accountMovements = getMovements().filter(m => 
        (m.account === account || 
        (m.movementType === 'cambio' && m.accountDest === account) || 
        m.debtAccount === account) && 
        new Date(m.date) >= threeMonthsAgo
    ).slice().reverse();
    const history = calculateBalanceHistory(account, threeMonthsAgo);
    const currency = getAccountCurrencies()[account][0];
    const isDebtAccount = account.toLowerCase().startsWith('deuda');
    const bitcoinView = getBitcoinView();
    const prices = getBitcoinPrices();

    const ctx = document.getElementById('historyChart').getContext('2d');
    if (window.historyChart && typeof window.historyChart.destroy === 'function') {
        window.historyChart.destroy();
    }
    const chartData = bitcoinView && prices[currency.toLowerCase()] 
        ? history.map(h => ({ date: h.date, balance: h.balance * prices[currency.toLowerCase()] }))
        : history;

    window.historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(h => new Date(h.date).toLocaleDateString()),
            datasets: [{
                label: 'Saldo',
                data: chartData.map(h => h.balance),
                borderColor: isDebtAccount ? '#e53e3e' : currency === 'Bitcoin' ? '#f7931a' : currency === 'Pesos' ? '#3182ce' : currency === 'Dólares' ? '#38a169' : '#8b5cf6',
                borderWidth: 2,
                fill: true,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                tension: 0.1
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Fecha' } },
                y: { 
                    title: { display: true, text: 'Saldo' },
                    min: Math.min(...chartData.map(h => h.balance)) < 0 ? undefined : 0
                }
            },
            plugins: { legend: { display: false } }
        }
    });

    if (accountMovements.length === 0) {
        historyBody.innerHTML = '<div class="history-item">No hay movimientos en los últimos 3 meses.</div>';
    } else {
        accountMovements.forEach(m => {
            const item = createHistoryItem(m, account);
            historyBody.appendChild(item);
        });
    }

    modal.classList.add('active');
}

function createHistoryItem(m, account) {
    const item = document.createElement('div');
    item.classList.add('history-item', m.movementType);
    let details = '', amount = m.amount, currency = m.currency;

    if (m.account === account) {
        if (m.movementType === 'ingreso') {
            details = m.motive === 'Otros' && m.description ? `${m.motive} (${m.description})` : m.motive;
            amount = m.amount;
        } else if (m.movementType === 'egreso') {
            details = m.category === 'Otros' && m.description ? `${m.category} (${m.description})` : m.category;
            amount = -m.amount;
        } else if (m.movementType === 'cambio') {
            details = `Cambio a ${m.accountDest}`;
            amount = -m.amount;
        } else if (m.movementType === 'ajuste') {
            details = m.adjustType === 'positive' ? 'Ajuste Positivo' : 'Ajuste Negativo';
            amount = m.amount * (m.adjustType === 'positive' ? 1 : -1);
        }
    } else if (m.movementType === 'cambio' && m.accountDest === account) {
        details = `Cambio desde ${m.account}`;
        amount = m.amountDest;
        currency = m.currencyDest;
    } else if (m.debtAccount === account) {
        details = m.movementType === 'ingreso' ? `${m.motive} (Crédito)` : `${m.category} (Pago)`;
        amount = m.movementType === 'ingreso' ? -m.amount : m.amount;
    }

    const amountClass = currency === 'Bitcoin' ? 'bitcoin' : currency === 'Pesos' ? 'pesos' : currency === 'Dólares' ? 'dolares' : 'euros';
    const typeDisplay = m.movementType.charAt(0).toUpperCase() + m.movementType.slice(1);
    item.innerHTML = `
        <span>${typeDisplay}</span>
        <span>${m.date}</span>
        <span>${details}</span>
        <span class="${amountClass}">${formatNumber(amount, currency === 'Bitcoin' ? 8 : 2)}</span>
    `;
    return item;
}

// Cerrar modal
export function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    modal.classList.remove('active');
    if (window.historyChart && typeof window.historyChart.destroy === 'function') {
        window.historyChart.destroy();
    }
}

// Actualizar UI de preferencias
export function updatePreferencesUI() {
    const accountsList = document.getElementById('accountsList');
    const expenseCategoriesList = document.getElementById('expenseCategoriesList');
    const incomeMotivesList = document.getElementById('incomeMotivesList');
    const filterAccount = document.getElementById('filterAccount');
    const filterCategory = document.getElementById('filterCategory');

    accountsList.innerHTML = '';
    const accountCurrencies = getAccountCurrencies();
    Object.keys(accountCurrencies).forEach(account => {
        const div = document.createElement('div');
        div.className = 'settings-item';
        div.innerHTML = `
            <span>${account} (${accountCurrencies[account][0]})</span>
            <div>
                <button class="rename-btn" aria-label="Renombrar"><i class="fas fa-edit"></i></button>
                <button class="remove-btn" aria-label="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
        `;
        div.querySelector('.remove-btn').addEventListener('click', () => removeAccount(account));
        div.querySelector('.rename-btn').addEventListener('click', () => renameAccount(account));
        accountsList.appendChild(div);
    });

    expenseCategoriesList.innerHTML = '';
    const expenseCategories = getExpenseCategoriesByCurrency();
    for (let currency in expenseCategories) {
        expenseCategories[currency].forEach(category => {
            const div = document.createElement('div');
            div.className = 'settings-item';
            div.innerHTML = `
                <span>${category} (${currency})</span>
                <div>
                    <button class="rename-btn" aria-label="Renombrar"><i class="fas fa-edit"></i></button>
                    <button class="remove-btn" aria-label="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            `;
            div.querySelector('.remove-btn').addEventListener('click', () => removeExpenseCategory(currency, category));
            div.querySelector('.rename-btn').addEventListener('click', () => renameExpenseCategory(currency, category));
            expenseCategoriesList.appendChild(div);
        });
    }

    incomeMotivesList.innerHTML = '';
    const incomeMotives = getIncomeMotivesByCurrency();
    for (let currency in incomeMotives) {
        incomeMotives[currency].forEach(motive => {
            const div = document.createElement('div');
            div.className = 'settings-item';
            div.innerHTML = `
                <span>${motive} (${currency})</span>
                <div>
                    <button class="rename-btn" aria-label="Renombrar"><i class="fas fa-edit"></i></button>
                    <button class="remove-btn" aria-label="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            `;
            div.querySelector('.remove-btn').addEventListener('click', () => removeIncomeMotive(currency, motive));
            div.querySelector('.rename-btn').addEventListener('click', () => renameIncomeMotive(currency, motive));
            incomeMotivesList.appendChild(div);
        });
    }

    filterAccount.innerHTML = '<option value="">Todas</option>';
    Object.keys(accountCurrencies).sort().forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.text = account;
        filterAccount.appendChild(option);
    });

    filterCategory.innerHTML = '<option value="">Todos</option>';
    const allItems = new Set();
    Object.values(incomeMotives).forEach(motives => motives.forEach(m => allItems.add(m)));
    Object.values(expenseCategories).forEach(categories => categories.forEach(c => allItems.add(c)));
    Array.from(allItems).sort().forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        option.text = item;
        filterCategory.appendChild(option);
    });

    const filtersBar = document.getElementById('filtersBar');
    const existingSort = document.getElementById('filterSort');
    if (!existingSort) {
        const sortSelect = document.createElement('select');
        sortSelect.id = 'filterSort';
        sortSelect.innerHTML = `
            <option value="load-order">Orden de carga</option>
            <option value="date-desc">Más reciente primero</option>
            <option value="date-asc">Más antiguo primero</option>
            <option value="amount-desc">Mayor monto</option>
            <option value="amount-asc">Menor monto</option>
        `;
        sortSelect.addEventListener('change', updateTable);
        filtersBar.appendChild(sortSelect);
    }
}