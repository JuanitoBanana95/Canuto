import { 
    toggleFields, setupEventListeners, toggleTheme, switchTab, 
    addAccount, removeAccount, renameAccount, 
    addExpenseCategory, removeExpenseCategory, renameExpenseCategory, 
    addIncomeMotive, removeIncomeMotive, renameIncomeMotive, 
    deleteMovement, undoDelete, updateAccountOptions, updateMotiveOptions, 
    updateCategoryOptions, updateCurrencyDestOptions, handleFinanceFormSubmit, 
    checkFormValidity, redoMovement, toggleCollapsible, toggleBitcoinView,
    showNotificationModal
} from './handlers.js';
import { updateTable, updateSummary, updatePreferencesUI, showHistoryModal, closeHistoryModal } from './ui.js';
import { exportData, importData, deleteAllData } from './storage.js';
import { calculateAmountDest, fetchBitcoinPrices, formatNumber } from './utils.js';
import { recalculateBalances, getTheme, getBitcoinPrices } from './state.js';

// Inicialización de la aplicación
function initializeApp() {
    if (!window.pdfjsLib) {
        console.error('pdfjsLib no está cargado. Asegúrate de incluir el script en el HTML.');
        showNotificationModal('Falta la librería pdf.js necesaria para importar PDFs. Por favor, agrega el script al HTML.');
        return;
    }

    document.body.className = getTheme();
    recalculateBalances();
    updateSummary();
    updateTable();
    toggleFields();
    updatePreferencesUI();
    initializeBitcoinPrice(); // Nueva función para inicializar el precio de Bitcoin

    setupEventListeners();
    bindEvents();
    document.getElementById('filtersBar').classList.remove('active');
}

// Vincular eventos a elementos del DOM
function bindEvents() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.section));
    });

    const themeSwitch = document.querySelector('.theme-switch');
    if (themeSwitch) themeSwitch.addEventListener('click', toggleTheme);

    const addMovementBtn = document.getElementById('addMovementBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.querySelector('.action-btn[aria-label="Importar"]');
    const undoBtn = document.querySelector('.action-btn[aria-label="Deshacer"]');
    const redoBtn = document.querySelector('.action-btn[aria-label="Rehacer"]');
    const deleteBtn = document.querySelector('.action-btn[aria-label="Borrar todo"]');
    const importFile = document.getElementById('importFile');
    const filterToggle = document.querySelector('.filter-toggle');
    const closeMovementBtn = document.getElementById('closeMovementBtn');
    const bitcoinViewBtn = document.getElementById('toggleBitcoinView');

    if (addMovementBtn) addMovementBtn.addEventListener('click', () => {
        document.getElementById('movementModal').classList.add('active');
        toggleFields();
    });
    if (exportBtn) exportBtn.addEventListener('click', () => {
        document.getElementById('exportModal').classList.add('active');
    });
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', (e) => {
            importData(e);
            importFile.value = '';
        });
    }
    if (undoBtn) undoBtn.addEventListener('click', undoDelete);
    if (redoBtn) redoBtn.addEventListener('click', redoMovement);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteAllData);
    if (filterToggle) filterToggle.addEventListener('click', () => toggleCollapsible('filtersBar'));
    if (closeMovementBtn) closeMovementBtn.addEventListener('click', () => {
        document.getElementById('movementModal').classList.remove('active');
        document.getElementById('financeForm').reset();
        toggleFields();
    });
    if (bitcoinViewBtn) bitcoinViewBtn.addEventListener('click', toggleBitcoinView);

    const exportModal = document.getElementById('exportModal');
    if (exportModal) {
        document.getElementById('exportCSV').addEventListener('click', () => {
            exportData('csv');
            exportModal.classList.remove('active');
        });
        document.getElementById('exportJSON').addEventListener('click', () => {
            exportData('json');
            exportModal.classList.remove('active');
        });
        document.getElementById('exportPDF').addEventListener('click', () => {
            exportData('pdf');
            exportModal.classList.remove('active');
        });
        document.getElementById('closeExportBtn').addEventListener('click', () => {
            exportModal.classList.remove('active');
        });
    }

    const form = document.getElementById('financeForm');
    if (form) {
        const fields = {
            movementType: form.querySelector('#movementType'),
            date: form.querySelector('#date'),
            currencyIngreso: form.querySelector('#currencyIngreso'),
            amountIngreso: form.querySelector('#amountIngreso'),
            accountIngreso: form.querySelector('#accountIngreso'),
            motive: form.querySelector('#motive'),
            descriptionIngreso: form.querySelector('#descriptionIngreso'),
            currencyEgreso: form.querySelector('#currencyEgreso'),
            amountEgreso: form.querySelector('#amountEgreso'),
            accountEgreso: form.querySelector('#accountEgreso'),
            category: form.querySelector('#category'),
            descriptionEgreso: form.querySelector('#descriptionEgreso'),
            currencyOrigen: form.querySelector('#currencyOrigen'),
            accountOrigen: form.querySelector('#accountOrigen'),
            amountOrigen: form.querySelector('#amountOrigen'),
            exchangeRate: form.querySelector('#exchangeRate'),
            currencyDest: form.querySelector('#currencyDest'),
            accountDest: form.querySelector('#accountDest'),
            adjustAccount: form.querySelector('#adjustAccount'),
            adjustAmount: form.querySelector('#adjustAmount')
        };

        if (fields.movementType) fields.movementType.addEventListener('change', () => { toggleFields(); checkFormValidity(); });
        if (fields.date) fields.date.addEventListener('change', checkFormValidity);
        if (fields.currencyIngreso) fields.currencyIngreso.addEventListener('change', () => { updateAccountOptions('ingreso'); updateMotiveOptions(); checkFormValidity(); });
        if (fields.amountIngreso) fields.amountIngreso.addEventListener('input', checkFormValidity);
        if (fields.accountIngreso) fields.accountIngreso.addEventListener('change', checkFormValidity);
        if (fields.motive) fields.motive.addEventListener('change', checkFormValidity);
        if (fields.descriptionIngreso) fields.descriptionIngreso.addEventListener('input', checkFormValidity);
        if (fields.currencyEgreso) fields.currencyEgreso.addEventListener('change', () => { updateAccountOptions('egreso'); updateCategoryOptions(); checkFormValidity(); });
        if (fields.amountEgreso) fields.amountEgreso.addEventListener('input', checkFormValidity);
        if (fields.accountEgreso) fields.accountEgreso.addEventListener('change', checkFormValidity);
        if (fields.category) fields.category.addEventListener('change', checkFormValidity);
        if (fields.descriptionEgreso) fields.descriptionEgreso.addEventListener('input', checkFormValidity);
        if (fields.currencyOrigen) fields.currencyOrigen.addEventListener('change', () => { updateCurrencyDestOptions(); updateAccountOptions('origen'); calculateAmountDest(); checkFormValidity(); });
        if (fields.accountOrigen) fields.accountOrigen.addEventListener('change', () => { calculateAmountDest(); checkFormValidity(); });
        if (fields.amountOrigen) fields.amountOrigen.addEventListener('input', () => { calculateAmountDest(); checkFormValidity(); });
        if (fields.exchangeRate) fields.exchangeRate.addEventListener('input', () => { calculateAmountDest(); checkFormValidity(); });
        if (fields.currencyDest) fields.currencyDest.addEventListener('change', () => { updateAccountOptions('destino'); calculateAmountDest(); checkFormValidity(); });
        if (fields.accountDest) fields.accountDest.addEventListener('change', checkFormValidity);
        if (fields.adjustAccount) fields.adjustAccount.addEventListener('change', checkFormValidity);
        if (fields.adjustAmount) fields.adjustAmount.addEventListener('input', checkFormValidity);
    }

    const filtersBar = document.getElementById('filtersBar');
    if (filtersBar) {
        filtersBar.querySelectorAll('select, input').forEach(element => {
            element.addEventListener('change', updateTable);
            element.addEventListener('input', updateTable);
        });
        document.getElementById('applyFilters').addEventListener('click', updateTable);
    }

    const modalCloseBtn = document.getElementById('closeHistoryBtn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeHistoryModal);

    const addAccountForm = document.getElementById('addAccountForm');
    const addExpenseCategoryForm = document.getElementById('addExpenseCategoryForm');
    const addIncomeMotiveForm = document.getElementById('addIncomeMotiveForm');
    if (addAccountForm) addAccountForm.addEventListener('submit', (e) => { e.preventDefault(); addAccount(); });
    if (addExpenseCategoryForm) addExpenseCategoryForm.addEventListener('submit', (e) => { e.preventDefault(); addExpenseCategory(); });
    if (addIncomeMotiveForm) addIncomeMotiveForm.addEventListener('submit', (e) => { e.preventDefault(); addIncomeMotive(); });

    const helpBtn = document.querySelector('.help-btn');
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    if (helpBtn) helpBtn.addEventListener('click', () => document.getElementById('helpModal').classList.add('active'));
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => document.getElementById('helpModal').classList.remove('active'));
}

// Inicializar y actualizar el precio de Bitcoin en tiempo real
function initializeBitcoinPrice() {
    const bitcoinPriceElement = document.getElementById('bitcoinPrice');
    if (!bitcoinPriceElement) {
        console.warn('Elemento #bitcoinPrice no encontrado en el DOM. Asegúrate de agregar el contenedor en el sidebar.');
        return;
    }
    
    // Función para actualizar el precio
    const updatePrice = async () => {
        try {
            const prices = await fetchBitcoinPrices(); // Obtener precios desde CoinGecko
            const btcUsd = 1 / prices.dólares; // Convertir de BTC a USD
            bitcoinPriceElement.textContent = `${formatNumber(btcUsd, 2)} USD`;
        } catch (error) {
            console.error('Error al actualizar el precio de Bitcoin:', error);
            const currentPrices = getBitcoinPrices();
            const btcUsd = 1 / currentPrices.dólares;
            bitcoinPriceElement.textContent = `${formatNumber(btcUsd, 2)} USD (Offline)`;
        }
    };

    // Actualizar inmediatamente al cargar
    updatePrice();

    // Configurar actualización cada 0.1 segundos
    setInterval(updatePrice, 3000);
}

// Exportaciones globales
window.showHistoryModal = showHistoryModal;
window.closeHistoryModal = closeHistoryModal;

document.addEventListener('DOMContentLoaded', initializeApp);