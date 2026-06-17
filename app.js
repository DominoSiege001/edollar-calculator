// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let state = {
        currentView: 'calculate-view',
        rates: {
            ngnToGhsRate: 9.8,  // Naira to Cedis rate
            ghsToNgnRate: 10.3, // Cedis to Naira rate
        },
        transactions: [],
        activeConversion: 'ngn-to-ghs', // 'ngn-to-ghs' or 'ghs-to-ngn'
    };

    // --- SELECTORS ---
    const views = document.querySelectorAll('.view');
    const navButtons = document.querySelectorAll('footer nav button');
    const calculateView = document.getElementById('calculate-view');
    const historyView = document.getElementById('history-view');
    const settingsView = document.getElementById('settings-view');

    // Calculate View Selectors
    const tabLinks = document.querySelectorAll('.tab-link');
    const subTabLinks = document.querySelectorAll('.sub-tab-link');
    const ngnToGhsForm = document.getElementById('ngn-to-ghs-form');
    const ghsToNgnForm = document.getElementById('ghs-to-ngn-form');
    const ngnInput = document.getElementById('ngn-input');
    const ghsInput = document.getElementById('ghs-input');
    const calculateBtn = document.getElementById('calculate-btn');
    const activeRateEl = document.getElementById('active-rate');
    const tabDescription = document.querySelector('.tab-description');
    const resultDisplay = document.getElementById('result-display');
    const payoutAmountEl = document.getElementById('payout-amount');
    const customerNameInput = document.getElementById('customer-name');
    const saveTransactionBtn = document.getElementById('save-transaction-btn');


    // History View Selectors
    const totalTransactionsEl = document.getElementById('total-transactions');
    const ngnVolumeEl = document.getElementById('ngn-volume');
    const ghsVolumeEl = document.getElementById('ghs-volume');
    const transactionsListEl = document.getElementById('transactions-list');

    // Settings View Selectors
    const ngnGhsRateInput = document.getElementById('ngn-ghs-rate');
    const ghsNgnRateInput = document.getElementById('ghs-ngn-rate');
    const ngnGhsExampleEl = document.getElementById('ngn-ghs-example');
    const ghsNgnExampleEl = document.getElementById('ghs-ngn-example');
    const saveRatesBtn = document.getElementById('save-rates-btn');
    const resetRatesBtn = document.getElementById('reset-rates-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');

    // --- CORE LOGIC (Corrected based on documentation) ---
    const calculateNgnToGhs = (amount, rate) => {
        if (isNaN(amount) || amount < 0) return 0;
        // Formula: Remove last 3 digits from NGN, multiply by rate
        // (Amount / 1000) * Rate
        return Number(((amount / 1000) * rate).toFixed(2));
    };

    const calculateGhsToNgn = (amount, rate) => {
        if (isNaN(amount) || amount < 0) return 0;
        // Formula: Divide by rate, add 3 zeros (multiply by 1000)
        // (Amount / Rate) * 1000
        return Number(((amount / rate) * 1000).toFixed(2));
    };

    // --- OFFLINE STORAGE (from Prompt 2) ---
    const storage = {
        saveState: () => {
            try {
                localStorage.setItem('edollarState', JSON.stringify(state));
            } catch (e) {
                console.error("Error saving state to localStorage", e);
            }
        },
        loadState: () => {
            try {
                const savedState = localStorage.getItem('edollarState');
                if (savedState) {
                    const parsedState = JSON.parse(savedState);
                    // Merge saved state with default state to avoid issues with new properties
                    state = { ...state, ...parsedState };
                }
            } catch (e) {
                console.error("Error loading state from localStorage", e);
            }
        }
    };

    // --- TRANSACTION LOGGING (from Prompt 3) ---
    const addTransaction = (type, inputAmount, customerName) => {
        const now = new Date();
        const newTransaction = {
            id: `txn_${now.getTime()}`,
            timestamp: now.toISOString(),
            customerName: customerName || 'N/A',
            type: type,
            inputAmount: parseFloat(inputAmount),
            appliedRate: type === 'NGN_TO_GHS' ? state.rates.ngnToGhsRate : state.rates.ghsToNgnRate,
            calculatedPayout: 0, // will be set below
        };

        if (type === 'NGN_TO_GHS') {
            newTransaction.calculatedPayout = calculateNgnToGhs(inputAmount, state.rates.ngnToGhsRate);
        } else {
            newTransaction.calculatedPayout = calculateGhsToNgn(inputAmount, state.rates.ghsToNgnRate);
        }

        state.transactions.unshift(newTransaction); // Add to the beginning
        storage.saveState();
        renderHistory();
        alert('Transaction saved!');
    };

    const getDailyVolumes = () => {
        const today = new Date().toISOString().split('T')[0];
        return state.transactions.reduce((acc, tx) => {
            if (tx.timestamp.startsWith(today)) {
                if (tx.type === 'NGN_TO_GHS') {
                    acc.ngnVolume += tx.inputAmount;
                    acc.ghsVolume += tx.calculatedPayout;
                } else { // GHS_TO_NGN
                    acc.ghsVolume += tx.inputAmount;
                    acc.ngnVolume += tx.calculatedPayout;
                }
            }
            return acc;
        }, { ngnVolume: 0, ghsVolume: 0 });
    };
    
    const clearDailyLedger = () => {
        if (confirm('Are you sure you want to clear all transactions? This cannot be undone.')) {
            state.transactions = [];
            storage.saveState();
            renderHistory();
        }
    };


    // --- UI RENDER & UPDATE FUNCTIONS ---
    const switchView = (viewId) => {
        state.currentView = viewId;
        views.forEach(view => {
            view.classList.toggle('active', view.id === viewId);
        });
        navButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.view === viewId);
        });
        // Re-render history when switching to it
        if (viewId === 'history-view') {
            renderHistory();
        }
    };

    const switchConversionTab = (tab) => {
        state.activeConversion = tab;
        
        tabLinks.forEach(link => link.classList.toggle('active', link.dataset.tab === tab));
        
        const isNgnToGhs = tab === 'ngn-to-ghs';
        ngnToGhsForm.style.display = isNgnToGhs ? 'block' : 'none';
        ghsToNgnForm.style.display = isNgnToGhs ? 'none' : 'block';
        
        updateCalculatorUI();
    };
    
    const switchSubTab = (subtab) => {
         subTabLinks.forEach(link => link.classList.toggle('active', link.dataset.subtab === subtab));
         if (subtab === 'need-ghs') {
             switchConversionTab('ngn-to-ghs');
         } else {
             switchConversionTab('ghs-to-ngn');
         }
    }

    const updateCalculatorUI = () => {
        const isNgnToGhs = state.activeConversion === 'ngn-to-ghs';
        if (isNgnToGhs) {
            activeRateEl.textContent = state.rates.ngnToGhsRate;
            tabDescription.textContent = "Customer gives you Naira, you pay Cedis";
        } else {
            activeRateEl.textContent = state.rates.ghsToNgnRate;
            tabDescription.textContent = "Customer gives you Cedis, you pay Naira";
        }
        // Clear inputs and results
        ngnInput.value = '';
        ghsInput.value = '';
        resultDisplay.style.display = 'none';
    };

    const renderHistory = () => {
        const today = new Date().toISOString().split('T')[0];
        const dailyTransactions = state.transactions.filter(tx => tx.timestamp.startsWith(today));
        
        totalTransactionsEl.textContent = dailyTransactions.length;

        const volumes = getDailyVolumes();
        ngnVolumeEl.textContent = `NGN ${volumes.ngnVolume.toFixed(2)}`;
        ghsVolumeEl.textContent = `GHS ${volumes.ghsVolume.toFixed(2)}`;

        if (dailyTransactions.length === 0) {
            transactionsListEl.innerHTML = `
                <p class="no-transactions">
                    <span class="clock-icon">🕔</span>
                    No transactions yet<br>
                    Saved transactions will appear here
                </p>`;
        } else {
            transactionsListEl.innerHTML = dailyTransactions.map(tx => `
                <div class="transaction-item">
                    <p><strong>${tx.customerName}</strong> - ${new Date(tx.timestamp).toLocaleTimeString()}</p>
                    <p>${tx.type.replace('_', ' ')}: ${tx.inputAmount.toFixed(2)} @ ${tx.appliedRate} → ${tx.calculatedPayout.toFixed(2)}</p>
                </div>
            `).join('');
        }
    };

    const updateSettingsUI = () => {
        ngnGhsRateInput.value = state.rates.ngnToGhsRate;
        ghsNgnRateInput.value = state.rates.ghsToNgnRate;
        updateRateExamples();
    };

    const updateRateExamples = () => {
        const ngnToGhsRate = parseFloat(ngnGhsRateInput.value) || 0;
        const ghsToNgnRate = parseFloat(ghsNgnRateInput.value) || 0;
        ngnGhsExampleEl.textContent = calculateNgnToGhs(1000, ngnToGhsRate).toFixed(2);
        ghsNgnExampleEl.textContent = calculateGhsToNgn(1, ghsToNgnRate).toFixed(2);
    };

    // --- EVENT LISTENERS ---
    navButtons.forEach(button => {
        button.addEventListener('click', () => switchView(button.dataset.view));
    });

    tabLinks.forEach(link => {
        link.addEventListener('click', () => switchConversionTab(link.dataset.tab));
    });
    
    subTabLinks.forEach(link => {
        link.addEventListener('click', () => switchSubTab(link.dataset.subtab));
    });

    calculateBtn.addEventListener('click', () => {
        let payout = 0;
        let inputAmount = 0;
        if (state.activeConversion === 'ngn-to-ghs') {
            inputAmount = parseFloat(ngnInput.value);
            payout = calculateNgnToGhs(inputAmount, state.rates.ngnToGhsRate);
        } else {
            inputAmount = parseFloat(ghsInput.value);
            payout = calculateGhsToNgn(inputAmount, state.rates.ghsToNgnRate);
        }
        payoutAmountEl.textContent = payout.toFixed(2);
        resultDisplay.style.display = 'block';
    });

    saveTransactionBtn.addEventListener('click', () => {
        const type = state.activeConversion === 'ngn-to-ghs' ? 'NGN_TO_GHS' : 'GHS_TO_NGN';
        const inputAmount = type === 'NGN_TO_GHS' ? ngnInput.value : ghsInput.value;
        const customerName = customerNameInput.value;
        
        if (parseFloat(inputAmount) > 0) {
            addTransaction(type, inputAmount, customerName);
            // Clear inputs after saving
            ngnInput.value = '';
            ghsInput.value = '';
            customerNameInput.value = '';
            resultDisplay.style.display = 'none';
        } else {
            alert('Please enter a valid amount.');
        }
    });

    saveRatesBtn.addEventListener('click', () => {
        const newNgnToGhsRate = parseFloat(ngnGhsRateInput.value);
        const newGhsToNgnRate = parseFloat(ghsNgnRateInput.value);

        if (!isNaN(newNgnToGhsRate) && !isNaN(newGhsToNgnRate)) {
            state.rates.ngnToGhsRate = newNgnToGhsRate;
            state.rates.ghsToNgnRate = newGhsToNgnRate;
            storage.saveState();
            updateCalculatorUI();
            alert('Rates saved!');
        } else {
            alert('Please enter valid numbers for rates.');
        }
    });

    resetRatesBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset rates to their default values?')) {
            state.rates = { ngnToGhsRate: 9.8, ghsToNgnRate: 10.3 };
            storage.saveState();
            updateSettingsUI();
            updateCalculatorUI();
            alert('Rates have been reset.');
        }
    });

    clearAllBtn.addEventListener('click', clearDailyLedger);
    
    ngnGhsRateInput.addEventListener('input', updateRateExamples);
    ghsNgnRateInput.addEventListener('input', updateRateExamples);


    // --- INITIALIZATION ---
    const init = () => {
        storage.loadState();
        switchView(state.currentView);
        switchConversionTab(state.activeConversion);
        renderHistory();
        updateSettingsUI();
        // Set initial active tab for sub-tabs
        const initialSubTab = state.activeConversion === 'ngn-to-ghs' ? 'need-ghs' : 'need-ngn';
        subTabLinks.forEach(link => link.classList.toggle('active', link.dataset.subtab === initialSubTab));
    };

    init();
});
