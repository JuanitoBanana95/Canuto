import { 
    getMovements, getBalances, getAccountCurrencies, getIncomeMotivesByCurrency, 
    getExpenseCategoriesByCurrency, getUndoStack, getRedoStack, getLastUsedDate, 
    setMovements, setBalances, setAccountCurrencies, setUndoStack, setRedoStack, 
    setLastUsedDate, recalculateBalances, setIncomeMotivesByCurrency, setExpenseCategoriesByCurrency,
    setTheme, getBitcoinView, setBitcoinView, getStateSnapshot, restoreStateSnapshot
} from './state.js';
import { normalizeName, calculateAmountDest, fetchBitcoinPrices } from './utils.js';
import { updateTable, updateSummary, updatePreferencesUI } from './ui.js';

// Configurar eventos iniciales
export function setupEventListeners() {
    document.getElementById('financeForm').addEventListener('submit', handleFinanceFormSubmit);
    document.getElementById('date').value = getLastUsedDate();
    reprocessDebtMovements();
    document.querySelector('.menu-toggle').addEventListener('click', toggleSidebar);
    document.querySelector('.close-sidebar').addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
}

// Alternar secciones colapsables
export function toggleCollapsible(contentId) {
    const content = document.getElementById(contentId);
    content.classList.toggle('active');
}

// Cambiar tema
export function toggleTheme() {
    const previousSnapshot = getStateSnapshot();
    const currentTheme = document.body.className;
    let newTheme;
    if (currentTheme === 'dark-mode') newTheme = 'light-mode';
    else if (currentTheme === 'light-mode') newTheme = 'bitcoin-mode';
    else newTheme = 'dark-mode';
    setTheme(newTheme);
    pushToUndoStack({ action: 'toggleTheme', snapshot: previousSnapshot });
    setRedoStack([]);
    updateSummary();
}

// Alternar vista en Bitcoin
export async function toggleBitcoinView() {
    const previousSnapshot = getStateSnapshot();
    const currentView = getBitcoinView();
    if (!currentView) {
        await fetchBitcoinPrices(true);
    }
    setBitcoinView(!currentView);
    pushToUndoStack({ action: 'toggleBitcoinView', snapshot: previousSnapshot });
    setRedoStack([]);
    updateSummary();
}

// Cambiar pestaña
export function switchTab(section) {
    document.querySelectorAll('.content-section').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById(section).classList.add('active');
    document.querySelector(`.menu-item[data-section="${section}"]`).classList.add('active');
    if (section === 'movements') updateTable();
    if (section === 'settings') updatePreferencesUI();
}

// Validar formulario
export function checkFormValidity() {
    const type = document.getElementById('movementType').value;
    const addBtn = document.getElementById('addMovementSubmit');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = '';

    if (!type) {
        addBtn.disabled = true;
        return false;
    }

    const date = document.getElementById('date').value || getLastUsedDate();
    const balances = getBalances();
    let isValid = false;

    if (type === 'ingreso') {
        isValid = validateIngresoFields(balances);
    } else if (type === 'egreso') {
        isValid = validateEgresoFields(balances);
    } else if (type === 'cambio') {
        isValid = validateCambioFields(balances);
    } else if (type === 'ajuste') {
        isValid = validateAjusteFields(balances);
    }

    addBtn.disabled = !isValid;
    return isValid;
}

function validateIngresoFields(balances) {
    const currency = document.getElementById('currencyIngreso').value;
    const amount = parseFloat(document.getElementById('amountIngreso').value);
    const account = document.getElementById('accountIngreso').value;
    const motive = document.getElementById('motive').value;
    return !!currency && !isNaN(amount) && amount > 0 && !!account && !!motive;
}

function validateEgresoFields(balances) {
    const currency = document.getElementById('currencyEgreso').value;
    const amount = parseFloat(document.getElementById('amountEgreso').value);
    const account = document.getElementById('accountEgreso').value;
    const category = document.getElementById('category').value;
    const isDebtAccount = account.toLowerCase().startsWith('deuda');
    const balanceAfter = (balances[account] || 0) - amount;

    if (isDebtAccount) {
        document.getElementById('errorMessage').textContent = 'No puedes gastar directamente desde una cuenta de deuda.';
        return false;
    }
    if (balanceAfter < 0) {
        document.getElementById('errorMessage').textContent = 'Saldo insuficiente en la cuenta.';
        return false;
    }
    return !!currency && !isNaN(amount) && amount > 0 && !!account && !!category;
}

function validateCambioFields(balances) {
    const currencyOrigen = document.getElementById('currencyOrigen').value;
    const amount = parseFloat(document.getElementById('amountOrigen').value);
    const account = document.getElementById('accountOrigen').value;
    const currencyDest = document.getElementById('currencyDest').value;
    const amountDest = parseFloat(document.getElementById('amountDest').value);
    const accountDest = document.getElementById('accountDest').value;
    const exchangeRate = parseFloat(document.getElementById('exchangeRate').value) || null;
    const isDebtAccount = account.toLowerCase().startsWith('deuda');
    const balanceAfter = (balances[account] || 0) - amount;

    if (isDebtAccount) {
        document.getElementById('errorMessage').textContent = 'No puedes transferir desde una cuenta de deuda.';
        return false;
    }
    if (balanceAfter < 0) {
        document.getElementById('errorMessage').textContent = 'Saldo insuficiente en la cuenta origen.';
        return false;
    }
    if (account === accountDest) {
        document.getElementById('errorMessage').textContent = 'La cuenta origen y destino deben ser diferentes.';
        return false;
    }
    return !!currencyOrigen && !isNaN(amount) && amount > 0 && !!account && 
           !!currencyDest && !isNaN(amountDest) && amountDest > 0 && !!accountDest;
}

function validateAjusteFields(balances) {
    const account = document.getElementById('adjustAccount').value;
    const amount = parseFloat(document.getElementById('adjustAmount').value);
    const isDebtAccount = account.toLowerCase().startsWith('deuda');
    const newBalance = (balances[account] || 0) + amount;

    if (!isDebtAccount && newBalance < 0) {
        document.getElementById('errorMessage').textContent = 'El ajuste no puede dejar un saldo negativo.';
        return false;
    }
    return !!account && !isNaN(amount);
}

// Manejar envío del formulario
export function handleFinanceFormSubmit(event) {
    event.preventDefault();
    if (!checkFormValidity()) return;

    const previousSnapshot = getStateSnapshot();
    const type = document.getElementById('movementType').value;
    const date = document.getElementById('date').value || getLastUsedDate();
    const index = parseInt(document.getElementById('movementIndex').value);
    setLastUsedDate(date);

    const movement = { date, movementType: type };
    const movements = getMovements();

    if (type === 'ingreso') processIngreso(movement);
    else if (type === 'egreso') processEgreso(movement);
    else if (type === 'cambio') processCambio(movement);
    else if (type === 'ajuste') processAjuste(movement);

    if (index === -1) {
        movements.push(movement);
        setMovements([...movements]);
        pushToUndoStack({ action: 'addMovement', data: movement, snapshot: previousSnapshot });
    } else {
        const oldMovement = { ...movements[index] };
        movements[index] = movement;
        setMovements([...movements]);
        pushToUndoStack({ action: 'editMovement', data: { oldMovement, newMovement: movement, index }, snapshot: previousSnapshot });
        recalculateBalances();
    }

    setRedoStack([]);
    resetForm();
    document.getElementById('movementModal').classList.remove('active');
    updateTable();
    updateSummary();
}

function processIngreso(movement) {
    const currency = document.getElementById('currencyIngreso').value;
    const amount = parseFloat(document.getElementById('amountIngreso').value);
    const account = document.getElementById('accountIngreso').value;
    const motive = document.getElementById('motive').value;
    const description = document.getElementById('descriptionIngreso').value.trim();

    movement.currency = currency;
    movement.amount = amount;
    movement.account = account;
    movement.motive = motive;
    if (description) movement.description = description;

    const balances = getBalances();
    balances[account] = (balances[account] || 0) + amount;

    const normalizedMotive = normalizeName(motive);
    if (normalizedMotive.includes('credito')) {
        handleDebtAccount(currency, -amount, movement);
    }
    setBalances({ ...balances });
}

function processEgreso(movement) {
    const currency = document.getElementById('currencyEgreso').value;
    const amount = parseFloat(document.getElementById('amountEgreso').value);
    const account = document.getElementById('accountEgreso').value;
    const category = document.getElementById('category').value;
    const description = document.getElementById('descriptionEgreso').value.trim();

    movement.currency = currency;
    movement.amount = amount;
    movement.account = account;
    movement.category = category;
    if (description) movement.description = description;

    const balances = getBalances();
    balances[account] = (balances[account] || 0) - amount;

    const normalizedCategory = normalizeName(category);
    if (normalizedCategory.includes('pago') && normalizedCategory.includes('credito')) {
        handleDebtAccount(currency, amount, movement);
    }
    setBalances({ ...balances });
}

function processCambio(movement) {
    const currency = document.getElementById('currencyOrigen').value;
    const amount = parseFloat(document.getElementById('amountOrigen').value);
    const account = document.getElementById('accountOrigen').value;
    const currencyDest = document.getElementById('currencyDest').value;
    const amountDest = parseFloat(document.getElementById('amountDest').value);
    const accountDest = document.getElementById('accountDest').value;
    const exchangeRate = parseFloat(document.getElementById('exchangeRate').value) || 1;

    movement.currency = currency;
    movement.amount = amount;
    movement.account = account;
    movement.currencyDest = currencyDest;
    movement.amountDest = amountDest;
    movement.accountDest = accountDest;
    if (currency !== currencyDest && exchangeRate !== 1) movement.exchangeRate = exchangeRate;

    const balances = getBalances();
    balances[account] = (balances[account] || 0) - amount;
    balances[accountDest] = (balances[accountDest] || 0) + amountDest;
    setBalances({ ...balances });
}

function processAjuste(movement) {
    const account = document.getElementById('adjustAccount').value;
    const amount = parseFloat(document.getElementById('adjustAmount').value);
    const currency = getAccountCurrencies()[account][0];

    movement.currency = currency;
    movement.account = account;
    movement.amount = Math.abs(amount);
    movement.adjustType = amount >= 0 ? 'positive' : 'negative';

    const balances = getBalances();
    balances[account] = (balances[account] || 0) + amount;
    setBalances({ ...balances });
}

function handleDebtAccount(currency, amount, movement) {
    const debtAccount = `Deudas ${currency}`;
    const accountCurrencies = getAccountCurrencies();
    const balances = getBalances();
    if (!accountCurrencies[debtAccount]) {
        accountCurrencies[debtAccount] = [currency];
        balances[debtAccount] = 0;
        setAccountCurrencies({ ...accountCurrencies });
    }
    balances[debtAccount] = (balances[debtAccount] || 0) + amount;
    movement.debtAccount = debtAccount;
}

export function reprocessDebtMovements() {
    const movements = getMovements();
    const accountCurrencies = getAccountCurrencies();
    const balances = getBalances();
    let changesMade = false;

    movements.forEach(movement => {
        if (movement.movementType === 'ingreso') {
            const normalizedMotive = normalizeName(movement.motive);
            if (normalizedMotive.includes('credito') && !movement.debtAccount) {
                handleDebtAccount(movement.currency, -movement.amount, movement);
                changesMade = true;
            }
        } else if (movement.movementType === 'egreso') {
            const normalizedCategory = normalizeName(movement.category);
            if (normalizedCategory.includes('pago') && normalizedCategory.includes('credito') && !movement.debtAccount) {
                handleDebtAccount(movement.currency, movement.amount, movement);
                changesMade = true;
            }
        }
    });

    if (changesMade) {
        const usedDebtAccounts = new Set(movements.map(m => m.debtAccount).filter(Boolean));
        Object.keys(accountCurrencies).forEach(acc => {
            if (acc.toLowerCase().startsWith('deuda') && !usedDebtAccounts.has(acc) && balances[acc] === 0) {
                delete accountCurrencies[acc];
                delete balances[acc];
            }
        });
        setAccountCurrencies({ ...accountCurrencies });
        setBalances({ ...balances });
    }
}

// Alternar campos del formulario
export function toggleFields() {
    const type = document.getElementById('movementType').value;
    document.getElementById('ingresoFields').classList.toggle('active', type === 'ingreso');
    document.getElementById('egresoFields').classList.toggle('active', type === 'egreso');
    document.getElementById('cambioFields').classList.toggle('active', type === 'cambio');
    document.getElementById('ajusteFields').classList.toggle('active', type === 'ajuste');

    document.getElementById('descriptionIngreso').style.display = type === 'ingreso' ? 'block' : 'none';
    document.getElementById('descriptionEgreso').style.display = type === 'egreso' ? 'block' : 'none';

    if (type === 'ingreso') {
        updateAccountOptions('ingreso');
        updateMotiveOptions();
    } else if (type === 'egreso') {
        updateAccountOptions('egreso');
        updateCategoryOptions();
    } else if (type === 'cambio') {
        updateCurrencyDestOptions();
        updateAccountOptions('origen');
        updateAccountOptions('destino');
    } else if (type === 'ajuste') {
        updateAccountOptions('ajuste');
    }
}

// Eliminar movimiento
export function deleteMovement(event) {
    const index = parseInt(event.currentTarget.dataset.index);
    const movements = getMovements();
    if (index < 0 || index >= movements.length) return;

    const previousSnapshot = getStateSnapshot();
    const movement = movements[index];
    const balances = getBalances();

    let canDelete = false;
    if (movement.movementType === 'ingreso') {
        reverseIngreso(movement, balances);
        canDelete = true;
    } else if (movement.movementType === 'egreso') {
        canDelete = reverseEgreso(movement, balances);
    } else if (movement.movementType === 'cambio') {
        canDelete = reverseCambio(movement, balances);
    } else if (movement.movementType === 'ajuste') {
        reverseAjuste(movement, balances);
        canDelete = true;
    }

    if (canDelete) {
        movements.splice(index, 1);
        setMovements([...movements]);
        setBalances({ ...balances });
        pushToUndoStack({ action: 'deleteMovement', data: movement, snapshot: previousSnapshot });
        setRedoStack([]);
        reprocessDebtMovements();
        updateTable();
        updateSummary();
    } else {
        showNotificationModal('No se puede eliminar el movimiento debido a restricciones de saldo.');
    }
}

// Editar movimiento
export function editMovement(event) {
    const index = parseInt(event.currentTarget.dataset.index);
    const movements = getMovements();
    if (index < 0 || index >= movements.length) return;

    const movement = movements[index];
    const form = document.getElementById('financeForm');
    document.getElementById('movementIndex').value = index;
    document.getElementById('movementType').value = movement.movementType;
    document.getElementById('date').value = movement.date;
    toggleFields();

    if (movement.movementType === 'ingreso') {
        document.getElementById('currencyIngreso').value = movement.currency;
        document.getElementById('amountIngreso').value = movement.amount;
        updateAccountOptions('ingreso');
        document.getElementById('accountIngreso').value = movement.account;
        updateMotiveOptions();
        document.getElementById('motive').value = movement.motive || '';
        document.getElementById('descriptionIngreso').value = movement.description || '';
    } else if (movement.movementType === 'egreso') {
        document.getElementById('currencyEgreso').value = movement.currency;
        document.getElementById('amountEgreso').value = movement.amount;
        updateAccountOptions('egreso');
        document.getElementById('accountEgreso').value = movement.account;
        updateCategoryOptions();
        document.getElementById('category').value = movement.category || '';
        document.getElementById('descriptionEgreso').value = movement.description || '';
    } else if (movement.movementType === 'cambio') {
        document.getElementById('currencyOrigen').value = movement.currency;
        document.getElementById('amountOrigen').value = movement.amount;
        updateAccountOptions('origen');
        document.getElementById('accountOrigen').value = movement.account;
        document.getElementById('currencyDest').value = movement.currencyDest;
        updateAccountOptions('destino');
        document.getElementById('accountDest').value = movement.accountDest;
        document.getElementById('amountDest').value = movement.amountDest;
        document.getElementById('exchangeRate').value = movement.exchangeRate || '';
        calculateAmountDest();
    } else if (movement.movementType === 'ajuste') {
        updateAccountOptions('ajuste');
        document.getElementById('adjustAccount').value = movement.account;
        document.getElementById('adjustAmount').value = movement.adjustType === 'positive' ? movement.amount : -movement.amount;
    }

    checkFormValidity();
    document.getElementById('movementModal').classList.add('active');
}

function reverseIngreso(movement, balances) {
    balances[movement.account] = (balances[movement.account] || 0) - movement.amount;
    if (movement.debtAccount) {
        balances[movement.debtAccount] = (balances[movement.debtAccount] || 0) + movement.amount;
    }
}

function reverseEgreso(movement, balances) {
    const isDebtAccount = movement.account.toLowerCase().startsWith('deuda');
    const newBalance = (balances[movement.account] || 0) + movement.amount;
    if (!isDebtAccount && newBalance < 0) {
        return false;
    }
    balances[movement.account] = newBalance;
    if (movement.debtAccount) {
        balances[movement.debtAccount] = (balances[movement.debtAccount] || 0) - movement.amount;
    }
    return true;
}

function reverseCambio(movement, balances) {
    const isDebtAccount = movement.account.toLowerCase().startsWith('deuda');
    const newBalanceOrigin = (balances[movement.account] || 0) + movement.amount;
    if (!isDebtAccount && newBalanceOrigin < 0) {
        return false;
    }
    balances[movement.account] = newBalanceOrigin;
    balances[movement.accountDest] = (balances[movement.accountDest] || 0) - movement.amountDest;
    return true;
}

function reverseAjuste(movement, balances) {
    const amount = movement.amount * (movement.adjustType === 'positive' ? -1 : 1);
    balances[movement.account] = (balances[movement.account] || 0) + amount;
}

// Deshacer acción
export function undoDelete() {
    const undoStack = getUndoStack();
    if (undoStack.length === 0) {
        showNotificationModal('No hay acciones para deshacer.');
        return;
    }

    const lastAction = undoStack.pop();
    const previousSnapshot = lastAction.snapshot;
    const currentSnapshot = getStateSnapshot();

    applyUndoAction(lastAction);
    setUndoStack([...undoStack]);
    pushToRedoStack({ ...lastAction, snapshot: currentSnapshot });
    reprocessDebtMovements();
    updateTable();
    updateSummary();
    updatePreferencesUI();
}

function applyUndoAction(lastAction) {
    restoreStateSnapshot(lastAction.snapshot);
}

// Rehacer acción
export function redoMovement() {
    const redoStack = getRedoStack();
    if (redoStack.length === 0) {
        showNotificationModal('No hay acciones para rehacer.');
        return;
    }

    const lastAction = redoStack.pop();
    const nextSnapshot = lastAction.snapshot;
    const currentSnapshot = getStateSnapshot();

    applyRedoAction(lastAction);
    setRedoStack([...redoStack]);
    pushToUndoStack({ ...lastAction, snapshot: currentSnapshot });
    reprocessDebtMovements();
    updateTable();
    updateSummary();
    updatePreferencesUI();
}

function applyRedoAction(lastAction) {
    restoreStateSnapshot(lastAction.snapshot);
}

// Gestión de cuentas y preferencias
export function addAccount() {
    const previousSnapshot = getStateSnapshot();
    const name = document.getElementById('accountName').value.trim();
    const currency = document.getElementById('accountCurrency').value;
    const accountCurrencies = getAccountCurrencies();
    const balances = getBalances();

    if (!validateNewAccount(name, currency, accountCurrencies)) return;

    accountCurrencies[name] = [currency];
    balances[name] = 0;

    setAccountCurrencies({ ...accountCurrencies });
    setBalances({ ...balances });
    pushToUndoStack({ action: 'addAccount', snapshot: previousSnapshot });
    setRedoStack([]);
    resetAccountForm();
    updatePreferencesUI();
    updateSummary();
}

export function removeAccount(account) {
    const previousSnapshot = getStateSnapshot();
    const accountCurrencies = getAccountCurrencies();
    const balances = getBalances();
    const movements = getMovements();

    if (!validateRemoveAccount(account, accountCurrencies, balances, movements)) return;

    delete accountCurrencies[account];
    delete balances[account];

    setAccountCurrencies({ ...accountCurrencies });
    setBalances({ ...balances });
    pushToUndoStack({ action: 'removeAccount', snapshot: previousSnapshot });
    setRedoStack([]);
    updatePreferencesUI();
    updateSummary();
}

export function renameAccount(oldName) {
    const previousSnapshot = getStateSnapshot();
    const accountCurrencies = getAccountCurrencies();
    if (!accountCurrencies[oldName]) {
        showNotificationModal('La cuenta no existe.');
        return;
    }

    const newName = prompt(`Nuevo nombre para '${oldName}' (máx. 14 caracteres):`, oldName);
    if (!newName || newName.trim() === oldName || newName.length > 14) return;

    const normalizedNewName = normalizeName(newName);
    if (Object.keys(accountCurrencies).some(account => normalizeName(account) === normalizedNewName && account !== oldName)) {
        showNotificationModal('Ya existe una cuenta con ese nombre.');
        return;
    }

    const movements = getMovements();
    const balances = getBalances();

    accountCurrencies[newName] = accountCurrencies[oldName];
    balances[newName] = balances[oldName];
    delete accountCurrencies[oldName];
    delete balances[oldName];

    movements.forEach(m => {
        if (m.account === oldName) m.account = newName;
        if (m.movementType === 'cambio' && m.accountDest === oldName) m.accountDest = newName;
        if (m.debtAccount === oldName) m.debtAccount = newName;
    });

    setAccountCurrencies({ ...accountCurrencies });
    setBalances({ ...balances });
    setMovements([...movements]);
    pushToUndoStack({ action: 'renameAccount', snapshot: previousSnapshot });
    setRedoStack([]);
    updatePreferencesUI();
    updateTable();
    updateSummary();
}

export function addIncomeMotive() {
    const previousSnapshot = getStateSnapshot();
    const name = document.getElementById('incomeMotiveName').value.trim();
    const currency = document.getElementById('incomeMotiveCurrency').value;
    const motives = getIncomeMotivesByCurrency();

    if (!validateNewPreference(name, currency, motives[currency])) return;

    if (!motives[currency]) motives[currency] = [];
    motives[currency].push(name);
    setIncomeMotivesByCurrency({ ...motives });
    pushToUndoStack({ action: 'addIncomeMotive', snapshot: previousSnapshot });
    setRedoStack([]);
    resetIncomeMotiveForm();
    updatePreferencesUI();
}

export function removeIncomeMotive(currency, motive) {
    const previousSnapshot = getStateSnapshot();
    const motives = getIncomeMotivesByCurrency();
    const movements = getMovements();
    if (!validateRemovePreference(currency, motive, motives[currency], movements, 'ingreso')) return;

    motives[currency] = motives[currency].filter(m => m !== motive);
    if (motives[currency].length === 0) delete motives[currency];
    setIncomeMotivesByCurrency({ ...motives });
    pushToUndoStack({ action: 'removeIncomeMotive', snapshot: previousSnapshot });
    setRedoStack([]);
    updatePreferencesUI();
}

export function renameIncomeMotive(currency, oldName) {
    const previousSnapshot = getStateSnapshot();
    const motives = getIncomeMotivesByCurrency();
    if (!motives[currency] || !motives[currency].includes(oldName)) {
        showNotificationModal('El motivo no existe para esta moneda.');
        return;
    }

    const newName = prompt(`Nuevo nombre para '${oldName}' en ${currency}:`, oldName);
    if (!newName || newName.trim() === oldName || motives[currency].includes(newName)) return;

    const movements = getMovements();
    const index = motives[currency].indexOf(oldName);
    motives[currency][index] = newName;
    movements.forEach(m => {
        if (m.movementType === 'ingreso' && m.motive === oldName && m.currency === currency) m.motive = newName;
    });

    setIncomeMotivesByCurrency({ ...motives });
    setMovements([...movements]);
    pushToUndoStack({ action: 'renameIncomeMotive', snapshot: previousSnapshot });
    setRedoStack([]);
    updatePreferencesUI();
    updateTable();
}

export function addExpenseCategory() {
    const previousSnapshot = getStateSnapshot();
    const name = document.getElementById('expenseCategoryName').value.trim();
    const currency = document.getElementById('expenseCategoryCurrency').value;
    const categories = getExpenseCategoriesByCurrency();

    if (!validateNewPreference(name, currency, categories[currency])) return;

    if (!categories[currency]) categories[currency] = [];
    categories[currency].push(name);
    setExpenseCategoriesByCurrency({ ...categories });
    pushToUndoStack({ action: 'addExpenseCategory', snapshot: previousSnapshot });
    setRedoStack([]);
    resetExpenseCategoryForm();
    updatePreferencesUI();
}

export function removeExpenseCategory(currency, category) {
    const previousSnapshot = getStateSnapshot();
    const categories = getExpenseCategoriesByCurrency();
    const movements = getMovements();
    if (!validateRemovePreference(currency, category, categories[currency], movements, 'egreso')) return;

    categories[currency] = categories[currency].filter(c => c !== category);
    if (categories[currency].length === 0) delete categories[currency];
    setExpenseCategoriesByCurrency({ ...categories });
    pushToUndoStack({ action: 'removeExpenseCategory', snapshot: previousSnapshot });
    setRedoStack([]);
    updatePreferencesUI();
}

export function renameExpenseCategory(currency, oldName) {
    const previousSnapshot = getStateSnapshot();
    const categories = getExpenseCategoriesByCurrency();
    if (!categories[currency] || !categories[currency].includes(oldName)) {
        showNotificationModal('La categoría no existe para esta moneda.');
        return;
    }

    const newName = prompt(`Nuevo nombre para '${oldName}' en ${currency}:`, oldName);
    if (!newName || newName.trim() === oldName || categories[currency].includes(newName)) return;

    const movements = getMovements();
    const index = categories[currency].indexOf(oldName);
    categories[currency][index] = newName;
    movements.forEach(m => {
        if (m.movementType === 'egreso' && m.category === oldName && m.currency === currency) m.category = newName;
    });

    setExpenseCategoriesByCurrency({ ...categories });
    setMovements([...movements]);
    pushToUndoStack({ action: 'renameExpenseCategory', snapshot: previousSnapshot });
    setRedoStack([]);
    updatePreferencesUI();
    updateTable();
}

// Actualizar opciones de formulario
export function updateAccountOptions(type) {
    const accountCurrencies = getAccountCurrencies();
    let select, currency;
    if (type === 'ingreso') {
        select = document.getElementById('accountIngreso');
        currency = document.getElementById('currencyIngreso').value;
    } else if (type === 'egreso') {
        select = document.getElementById('accountEgreso');
        currency = document.getElementById('currencyEgreso').value;
    } else if (type === 'origen') {
        select = document.getElementById('accountOrigen');
        currency = document.getElementById('currencyOrigen').value;
    } else if (type === 'destino') {
        select = document.getElementById('accountDest');
        currency = document.getElementById('currencyDest').value;
    } else if (type === 'ajuste') {
        select = document.getElementById('adjustAccount');
        currency = null;
    }

    select.innerHTML = '<option value="">Selecciona</option>';
    const accounts = Object.keys(accountCurrencies)
        .filter(account => !currency || accountCurrencies[account][0] === currency)
        .filter(account => type !== 'ingreso' || !account.toLowerCase().startsWith('deuda'))
        .filter(account => (type !== 'egreso' && type !== 'origen') || !account.toLowerCase().startsWith('deuda'))
        .sort();
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account;
        option.text = account;
        select.appendChild(option);
    });
}

export function updateMotiveOptions() {
    const select = document.getElementById('motive');
    const currency = document.getElementById('currencyIngreso').value;
    const motives = getIncomeMotivesByCurrency();

    select.innerHTML = '<option value="">Selecciona</option>';
    select.disabled = !currency || !motives[currency];
    if (currency && motives[currency]) {
        motives[currency].forEach(motive => {
            const option = document.createElement('option');
            option.value = motive;
            option.text = motive;
            select.appendChild(option);
        });
    }
}

export function updateCategoryOptions() {
    const select = document.getElementById('category');
    const currency = document.getElementById('currencyEgreso').value;
    const categories = getExpenseCategoriesByCurrency();

    select.innerHTML = '<option value="">Selecciona</option>';
    select.disabled = !currency || !categories[currency];
    if (currency && categories[currency]) {
        categories[currency].forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.text = category;
            select.appendChild(option);
        });
    }
}

export function updateCurrencyDestOptions() {
    const select = document.getElementById('currencyDest');
    const currencyOrigen = document.getElementById('currencyOrigen').value;
    select.innerHTML = '<option value="">Selecciona</option>';
    ['Bitcoin', 'Dólares', 'Pesos', 'Euros'].forEach(currency => {
        const option = document.createElement('option');
        option.value = currency;
        option.text = currency;
        select.appendChild(option);
    });
    calculateAmountDest();
}

// Mostrar modal de notificación
export function showNotificationModal(message, options = {}) {
    const modal = document.getElementById('notificationModal');
    const messageElement = document.getElementById('notificationMessage');
    const confirmBtn = document.getElementById('notificationConfirm');
    const cancelBtn = document.getElementById('notificationCancel');

    messageElement.textContent = message;
    confirmBtn.style.display = 'inline-block';
    cancelBtn.style.display = options.showCancel ? 'inline-block' : 'none';

    return new Promise((resolve) => {
        const closeModal = (result) => {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(result);
        };

        const confirmHandler = () => closeModal(true);
        const cancelHandler = () => closeModal(false);

        confirmBtn.addEventListener('click', confirmHandler);
        if (options.showCancel) {
            cancelBtn.addEventListener('click', cancelHandler);
        }

        modal.classList.add('active');
    });
}

// Utilidades internas
function pushToUndoStack(action) {
    const undoStack = getUndoStack();
    undoStack.push(action);
    setUndoStack([...undoStack]);
}

function pushToRedoStack(action) {
    const redoStack = getRedoStack();
    redoStack.push(action);
    setRedoStack([...redoStack]);
}

function resetForm() {
    document.getElementById('financeForm').reset();
    document.getElementById('movementIndex').value = '-1';
    document.getElementById('date').value = getLastUsedDate();
    toggleFields();
}

function resetAccountForm() {
    document.getElementById('accountName').value = '';
    document.getElementById('accountCurrency').value = '';
}

function resetIncomeMotiveForm() {
    document.getElementById('incomeMotiveName').value = '';
    document.getElementById('incomeMotiveCurrency').value = '';
}

function resetExpenseCategoryForm() {
    document.getElementById('expenseCategoryName').value = '';
    document.getElementById('expenseCategoryCurrency').value = '';
}

function validateNewAccount(name, currency, accountCurrencies) {
    if (!name || name.length > 14) {
        showNotificationModal('El nombre debe tener entre 1 y 14 caracteres.');
        return false;
    }
    if (!currency) {
        showNotificationModal('Selecciona una moneda.');
        return false;
    }
    const normalizedName = normalizeName(name);
    if (Object.keys(accountCurrencies).some(account => normalizeName(account) === normalizedName)) {
        showNotificationModal('Esta cuenta ya existe.');
        return false;
    }
    return true;
}

function validateRemoveAccount(account, accountCurrencies, balances, movements) {
    if (!accountCurrencies[account]) {
        showNotificationModal('La cuenta no existe.');
        return false;
    }
    if (balances[account] !== 0) {
        showNotificationModal('No puedes eliminar una cuenta con saldo distinto de cero.');
        return false;
    }
    if (movements.some(m => m.account === account || (m.movementType === 'cambio' && m.accountDest === account))) {
        showNotificationModal('No puedes eliminar una cuenta con movimientos asociados.');
        return false;
    }
    return true;
}

function validateNewPreference(name, currency, existingItems) {
    if (!name || !currency) {
        showNotificationModal('Ingresa un nombre y selecciona una moneda.');
        return false;
    }
    if (existingItems && existingItems.includes(name)) {
        showNotificationModal('Este item ya existe para esta moneda.');
        return false;
    }
    return true;
}

function validateRemovePreference(currency, item, existingItems, movements, type) {
    if (!existingItems || !existingItems.includes(item)) {
        showNotificationModal(`El ${type === 'ingreso' ? 'motivo' : 'categoría'} no existe para esta moneda.`);
        return false;
    }
    if (movements.some(m => m.movementType === type && m[type === 'ingreso' ? 'motive' : 'category'] === item && m.currency === currency)) {
        showNotificationModal(`No puedes eliminar un ${type === 'ingreso' ? 'motivo' : 'categoría'} con movimientos asociados.`);
        return false;
    }
    return true;
}