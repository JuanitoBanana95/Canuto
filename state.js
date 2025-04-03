// Estado en memoria
let state = {
    movements: [],
    balances: {},
    accountCurrencies: {},
    incomeMotivesByCurrency: {},
    expenseCategoriesByCurrency: {},
    undoStack: [],
    redoStack: [],
    lastUsedDate: new Date().toISOString().split('T')[0],
    theme: 'dark-mode',
    bitcoinView: false,
    bitcoinPrices: { bitcoin: 1, dólares: 0.000015, pesos: 0.00000001, euros: 0.000014, arsUsdRate: 1000 }
};

// Configuraciones iniciales por defecto
const defaultAccountCurrencies = {
    'Mercadopago': ['Pesos'],
    'Efectivo Pesos': ['Pesos'],
    'Efectivo Dólar': ['Dólares'],
    'Efectivo Euros': ['Euros'],
    'Poker': ['Dólares'],
    'Exchanges USD': ['Dólares'],
    'Exchanges BTC': ['Bitcoin'],
    'Ahorro': ['Bitcoin'],
    'Deudas Pesos': ['Pesos'],
    'Deudas Dólares': ['Dólares'],
    'Deudas Euros': ['Euros']
};

const defaultIncomeMotivesByCurrency = {
    'Dólares': ['Poker', 'Sueldo', 'Cueva', 'Asesorías', 'Créditos'],
    'Pesos': ['Sueldo', 'Asesorías', 'Créditos', 'Poker', 'Otros'],
    'Bitcoin': ['Fondo', 'Cueva', 'Asesorías'],
    'Euros': ['Sueldo', 'Asesorías', 'Créditos']
};

const defaultExpenseCategoriesByCurrency = {
    'Dólares': ['Poker', 'Cannabis', 'Pago de créditos', 'Otros'],
    'Pesos': ['Expensas', 'ARBA', 'Luz/gas/internet', 'Restaurant', 'Delivery', 'Supermercado', 'Cannabis', 'Pago de créditos', 'Otros', 'Obra social', 'Poker'],
    'Bitcoin': [],
    'Euros': ['Restaurant', 'Supermercado', 'Pago de créditos', 'Otros']
};

// Clave para localStorage
const LOCAL_STORAGE_KEY = 'financialAppData';

// Inicializar estado con valores por defecto o desde localStorage
function initializeState() {
    const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedData) {
        try {
            const data = JSON.parse(storedData);
            importState(data);
        } catch (error) {
            console.error('Error al cargar desde localStorage:', error);
            resetToDefaults();
        }
    } else {
        resetToDefaults();
    }
    synchronizeBalancesAndCurrencies();
}

// Restaurar valores por defecto
function resetToDefaults() {
    state.movements = [];
    state.balances = {};
    state.accountCurrencies = { ...defaultAccountCurrencies };
    state.incomeMotivesByCurrency = { ...defaultIncomeMotivesByCurrency };
    state.expenseCategoriesByCurrency = { ...defaultExpenseCategoriesByCurrency };
    state.undoStack = [];
    state.redoStack = [];
    state.lastUsedDate = new Date().toISOString().split('T')[0];
    state.theme = 'dark-mode';
    state.bitcoinView = false;
    state.bitcoinPrices = { bitcoin: 1, dólares: 0.000015, pesos: 0.00000001, euros: 0.000014, arsUsdRate: 1000 };
    for (let account in defaultAccountCurrencies) {
        state.balances[account] = 0;
    }
    saveToLocalStorage();
}

// Sincronizar balances y accountCurrencies
function synchronizeBalancesAndCurrencies() {
    const balances = state.balances;
    const accountCurrencies = state.accountCurrencies;
    for (let account in balances) {
        if (!accountCurrencies[account]) {
            console.warn(`Cuenta ${account} en balances pero no en accountCurrencies, asignando moneda 'Pesos'`);
            accountCurrencies[account] = ['Pesos'];
        }
    }
    for (let account in accountCurrencies) {
        if (!(account in balances)) {
            balances[account] = 0;
        }
    }
    state.balances = { ...balances };
    state.accountCurrencies = { ...accountCurrencies };
    saveToLocalStorage();
}

// Guardar estado completo en localStorage
function saveToLocalStorage() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(exportState()));
}

// Obtener snapshot del estado completo
export function getStateSnapshot() {
    return JSON.parse(JSON.stringify(state));
}

// Restaurar estado desde snapshot
export function restoreStateSnapshot(snapshot) {
    state = JSON.parse(JSON.stringify(snapshot));
    document.body.className = state.theme;
    saveToLocalStorage();
}

// Getters
export function getMovements() { return state.movements; }
export function getBalances() { return state.balances; }
export function getAccountCurrencies() { return state.accountCurrencies; }
export function getIncomeMotivesByCurrency() { return state.incomeMotivesByCurrency; }
export function getExpenseCategoriesByCurrency() { return state.expenseCategoriesByCurrency; }
export function getUndoStack() { return state.undoStack; }
export function getRedoStack() { return state.redoStack; }
export function getLastUsedDate() { return state.lastUsedDate; }
export function getTheme() { return state.theme; }
export function getBitcoinView() { return state.bitcoinView; }
export function getBitcoinPrices() { return state.bitcoinPrices; }

// Setters
export function setMovements(movements) { 
    state.movements = movements; 
    saveToLocalStorage();
}
export function setBalances(balances) { 
    state.balances = balances; 
    synchronizeBalancesAndCurrencies();
}
export function setAccountCurrencies(accountCurrencies) { 
    state.accountCurrencies = accountCurrencies; 
    synchronizeBalancesAndCurrencies();
}
export function setIncomeMotivesByCurrency(incomeMotives) { 
    state.incomeMotivesByCurrency = incomeMotives; 
    saveToLocalStorage();
}
export function setExpenseCategoriesByCurrency(expenseCategories) { 
    state.expenseCategoriesByCurrency = expenseCategories; 
    saveToLocalStorage();
}
export function setUndoStack(undoStack) { 
    state.undoStack = undoStack.slice(-20);
    saveToLocalStorage();
}
export function setRedoStack(redoStack) { 
    state.redoStack = redoStack.slice(-20);
    saveToLocalStorage();
}
export function setLastUsedDate(date) { 
    state.lastUsedDate = date; 
    saveToLocalStorage();
}
export function setTheme(theme) { 
    state.theme = theme; 
    document.body.className = theme; 
    saveToLocalStorage();
}
export function setBitcoinView(view) { 
    state.bitcoinView = view; 
    saveToLocalStorage();
}
export function setBitcoinPrices(prices) { 
    state.bitcoinPrices = { ...state.bitcoinPrices, ...prices }; 
    saveToLocalStorage();
}

// Recalcular balances desde movimientos (optimizado)
export function recalculateBalances() {
    const balances = {};
    const accountCurrencies = { ...state.accountCurrencies };

    // Inicializar balances en 0 para todas las cuentas existentes
    for (let account in accountCurrencies) {
        balances[account] = 0;
    }

    // Procesar movimientos
    state.movements.forEach(m => {
        if (!m || !m.movementType) return;

        // Asegurar que las cuentas estén en accountCurrencies
        if (!accountCurrencies[m.account]) {
            accountCurrencies[m.account] = [m.currency];
            balances[m.account] = 0;
        }
        if (m.movementType === 'cambio' && !accountCurrencies[m.accountDest]) {
            accountCurrencies[m.accountDest] = [m.currencyDest];
            balances[m.accountDest] = 0;
        }
        if (m.debtAccount && !accountCurrencies[m.debtAccount]) {
            accountCurrencies[m.debtAccount] = [m.currency];
            balances[m.debtAccount] = 0;
        }

        // Aplicar efectos del movimiento
        if (m.movementType === 'ingreso') {
            balances[m.account] = (balances[m.account] || 0) + m.amount;
            if (m.debtAccount) balances[m.debtAccount] = (balances[m.debtAccount] || 0) - m.amount;
        } else if (m.movementType === 'egreso') {
            balances[m.account] = (balances[m.account] || 0) - m.amount;
            if (m.debtAccount) balances[m.debtAccount] = (balances[m.debtAccount] || 0) + m.amount;
        } else if (m.movementType === 'cambio') {
            balances[m.account] = (balances[m.account] || 0) - m.amount;
            balances[m.accountDest] = (balances[m.accountDest] || 0) + m.amountDest;
        } else if (m.movementType === 'ajuste') {
            const amount = m.amount * (m.adjustType === 'positive' ? 1 : -1);
            balances[m.account] = (balances[m.account] || 0) + amount;
        }
    });

    // Actualizar estado
    state.balances = balances;
    state.accountCurrencies = accountCurrencies;
    synchronizeBalancesAndCurrencies();
}

// Exportar todo el estado para JSON
export function exportState() {
    return {
        movements: [...state.movements],
        balances: { ...state.balances },
        accountCurrencies: { ...state.accountCurrencies },
        incomeMotivesByCurrency: { ...state.incomeMotivesByCurrency },
        expenseCategoriesByCurrency: { ...state.expenseCategoriesByCurrency },
        undoStack: [...state.undoStack],
        redoStack: [...state.redoStack],
        lastUsedDate: state.lastUsedDate,
        theme: state.theme,
        bitcoinView: state.bitcoinView,
        bitcoinPrices: { ...state.bitcoinPrices }
    };
}

// Importar estado desde JSON
export function importState(data) {
    if (!data || typeof data !== 'object') {
        resetToDefaults();
        return;
    }
    state.movements = Array.isArray(data.movements) ? data.movements : [];
    state.balances = data.balances && typeof data.balances === 'object' ? data.balances : {};
    state.accountCurrencies = data.accountCurrencies && typeof data.accountCurrencies === 'object' ? data.accountCurrencies : { ...defaultAccountCurrencies };
    state.incomeMotivesByCurrency = data.incomeMotivesByCurrency && typeof data.incomeMotivesByCurrency === 'object' ? data.incomeMotivesByCurrency : { ...defaultIncomeMotivesByCurrency };
    state.expenseCategoriesByCurrency = data.expenseCategoriesByCurrency && typeof data.expenseCategoriesByCurrency === 'object' ? data.expenseCategoriesByCurrency : { ...defaultExpenseCategoriesByCurrency };
    state.undoStack = Array.isArray(data.undoStack) ? data.undoStack : [];
    state.redoStack = Array.isArray(data.redoStack) ? data.redoStack : [];
    state.lastUsedDate = data.lastUsedDate && typeof data.lastUsedDate === 'string' ? data.lastUsedDate : new Date().toISOString().split('T')[0];
    state.theme = ['light-mode', 'bitcoin-mode', 'dark-mode'].includes(data.theme) ? data.theme : 'dark-mode';
    state.bitcoinView = typeof data.bitcoinView === 'boolean' ? data.bitcoinView : false;
    state.bitcoinPrices = data.bitcoinPrices && typeof data.bitcoinPrices === 'object' ? data.bitcoinPrices : { bitcoin: 1, dólares: 0.000015, pesos: 0.00000001, euros: 0.000014, arsUsdRate: 1000 };
    document.body.className = state.theme;
    recalculateBalances();
}

// Inicializar al cargar el módulo
initializeState();