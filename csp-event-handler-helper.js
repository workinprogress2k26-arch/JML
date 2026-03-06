/**
 * CSP Event Handler Migration Helper
 * Questo modulo aiuta a migrare gli inline event handlers (onclick="...") 
 * a event listeners addEventListener() per conformità CSP strict
 * 
 * COME USARE:
 * 1. Definisci i tuoi event handlers nel mapping di seguito
 * 2. Rimuovi gli onclick="..." dall'HTML
 * 3. Aggiungi id o data-action agli elementi
 * 4. Chiama setupEventListeners() al caricamento della pagina
 */

/**
 * Mapping di event handlers
 * Format: { selector: "selector", event: "click", action: functionName }
 */
const eventHandlerMapping = [
  // Auth events
  { selector: 'button.btn-login', event: 'click', action: 'login' },
  { selector: 'button.btn-signup', event: 'click', action: 'signup' },
  { selector: '#auth-toggle-link', event: 'click', action: 'toggleForms' },
  
  // Navigation events
  { selector: '[data-nav="bacheca"]', event: 'click', action: () => showSection('bacheca-section') },
  { selector: '[data-nav="map"]', event: 'click', action: () => showSection('map-section') },
  { selector: '[data-nav="contracts"]', event: 'click', action: () => showSection('contracts-section') },
  { selector: '[data-nav="profile"]', event: 'click', action: () => showSection('profile-section') },
  { selector: '[data-nav="subscriptions"]', event: 'click', action: () => showSection('subscriptions-section') },
  { selector: '[data-nav="business"]', event: 'click', action: () => showSection('business-section') },
  
  // Action events
  { selector: '#btn-create-announcement', event: 'click', action: 'openCreateModal' },
  { selector: '#btn-find-jobs-nearby', event: 'click', action: 'findJobsNearMe' },
  { selector: '#btn-logout', event: 'click', action: 'logout' },
  { selector: '#btn-edit-account', event: 'click', action: 'openEditAccountModal' },
  { selector: '#btn-recharge-balance', event: 'click', action: 'rechargeBalance' },
  { selector: '#btn-release-payment', event: 'click', action: 'releasePayment' },
  { selector: '#btn-report', event: 'click', action: 'openReportModal' },
  { selector: '#btn-send-message', event: 'click', action: 'sendCompanyMessage' },
  { selector: '#btn-clear-chat', event: 'click', action: () => clearChat(currentChatCompany?.jobId) },
];

/**
 * Inizializza tutti gli event listener
 * Chiama questa funzione al caricamento della pagina
 */
function setupEventListeners() {
  console.log('🔧 Configurazione event listeners per CSP compliance...');
  
  eventHandlerMapping.forEach(({ selector, event, action }) => {
    const elements = document.querySelectorAll(selector);
    
    if (elements.length === 0) {
      console.warn(`⚠️ Nessun elemento trovato per selector: ${selector}`);
      return;
    }
    
    elements.forEach(el => {
      const handler = resolveHandler(action);

      if (typeof handler !== 'function') {
        console.error(`❌ Funzione non trovata o non valida per action: ${action}`);
        return;
      }

      el.addEventListener(event, handler);
      console.log(`✅ Event listener aggiunto: ${selector} -> ${typeof action === 'string' ? action : 'callback'}`);
    });
  });
  
  console.log('✅ Tutti gli event listener configurati!');
}

/**
 * Risolve un'azione mappata in una funzione handler.
 * - Se `action` è già una funzione la ritorna
 * - Se è una stringa prova a risolvere `window['name']` o percorsi dot-notated
 */
function resolveHandler(action) {
  if (typeof action === 'function') return action;
  if (typeof action !== 'string') return null;

  if (typeof window === 'undefined') return null;

  // supporta percorsi come "MyApp.auth.login"
  if (action.indexOf('.') !== -1) {
    const parts = action.split('.');
    let obj = window;
    for (const p of parts) {
      if (obj == null) return null;
      obj = obj[p];
    }
    if (typeof obj === 'function') return obj;
  }

  // fallback semplice
  if (typeof window[action] === 'function') return window[action];

  return null;
}

/**
 * REFACTORING GUIDE
 * 
 * Vecchio modo (non CSP-compliant):
 * <button onclick="login()">Accedi</button>
 * 
 * Nuovo modo:
 * <button class="btn-login">Accedi</button>
 * 
 * poi aggiungi il mapping in eventHandlerMapping[]
 * 
 * ALTERNATIVA usando data-attributes:
 * <button data-action="login">Accedi</button>
 * 
 * const buttons = document.querySelectorAll('[data-action]');
 * buttons.forEach(btn => {
 *   const actionName = btn.getAttribute('data-action');
 *   btn.addEventListener('click', () => window[actionName]?.());
 * });
 */

/**
 * STEP-BY-STEP MIGRATION:
 * 
 * 1. Aggiungi id o classe a ogni elemento con onclick:
 *    <button onclick="login()">Accedi</button>
 *    ↓
 *    <button class="btn-login" id="btn-login">Accedi</button>
 * 
 * 2. Aggiungi il selector nel mapping:
 *    { selector: '.btn-login', event: 'click', action: 'login' }
 * 
 * 3. Rimuovi l'onclick dall'HTML
 * 
 * 4. Chiama setupEventListeners() in DOMContentLoaded
 * 
 * 5. Aggiorna CSP per rimuovere 'unsafe-inline' da script-src una volta completato
 */

// Export per uso in altri moduli
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { setupEventListeners, eventHandlerMapping };
}

// Se stai includendo questo script direttamente nel browser, prova ad inizializzare
// gli event listeners quando il DOM è pronto. Non esegue nulla in ambienti senza DOM.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEventListeners);
  } else {
    setupEventListeners();
  }
}
