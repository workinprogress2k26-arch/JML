// --- 1. CONFIGURAZIONE SUPABASE (SECURE) ---
// NOTE: For security, avoid hard-coding the ANON key in source. At runtime the key
// should be provided by the hosting environment (Vercel) or injected into the
// page as `window.__SUPABASE_ANON_KEY`. This file will refuse to initialize
// Supabase if the key is missing to prevent accidental leakage or use.

let supabaseClient = null;
function getRuntimeSupabaseConfig() {
    // Fallback to embedded values for temporary restoration (option A)
    const fallbackUrl = 'https://qtmfgmrigldgodxrecue.supabase.co';
    const fallbackAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0bWZnbXJpZ2xkZ29keHJlY3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzMwMDYsImV4cCI6MjA4NTk0OTAwNn0.sHywE9mS6HU5-GOEt5_riL_9aywsNZE8iplVAQsGMf8';
    const url = window.__SUPABASE_URL || sessionStorage.getItem('supabase_url') || fallbackUrl;
    const anon = window.__SUPABASE_ANON_KEY || sessionStorage.getItem('supabase_anon_key') || fallbackAnon;
    return { url, anon };
}

function initSupabase() {
    if (!window.supabase) {
        console.error('❌ Supabase library non caricata. Verifica che supabase-js sia incluso in index.html');
        return false;
    }
    const cfg = getRuntimeSupabaseConfig();
    if (!cfg.url || !cfg.anon) {
        console.error('❌ Supabase non configurato: manca URL o ANON_KEY a runtime. Non inizializzo il client per motivi di sicurezza.');
        showBanner('Supabase non configurato in produzione. Aggiungi le environment variables su Vercel e ridistribuisci.', 'supabase-banner');
        // Show an action banner so the developer can paste a session-only ANON KEY
        showSupabaseSetupBanner();
        // Auto-open the prompt once per session to make recovery immediate
        try {
            if (!sessionStorage.getItem('supabase_prompt_auto_shown')) {
                sessionStorage.setItem('supabase_prompt_auto_shown', '1');
                setTimeout(promptForSupabaseConfig, 300);
            }
        } catch (e) {}
        return false;
    }
    try {
        supabaseClient = window.supabase.createClient(cfg.url, cfg.anon);
    console.log('✅ Supabase inizializzato correttamente');
        // Quick authorization smoke-test to detect 403/406 early and give actionable advice
        (async () => {
            try {
                const { data, error, status } = await supabaseClient
                    .from('profiles')
                    .select('id')
                    .limit(1);
                if (error) {
                    if (status === 403) console.error("Supabase: Accesso negato (403). Controlla il tuo ANON_KEY, le policy RLS e le impostazioni CORS del progetto.");
                    else if (status === 406) console.error("Supabase: Richiesta non accettabile (406). Potrebbe essere un problema con l'header Accept o con la query REST.");
                    else console.warn('Supabase smoke-test errore:', error, 'status:', status);
                } else {
                    console.log('Supabase smoke-test OK');
                    supabaseAvailable = true;
                    // clear any banner
                    removeBanner('supabase-banner');
                }
            } catch (e) {
                console.warn('Supabase smoke-test eccezione:', e.message || e);
                supabaseAvailable = false;
                showBanner('Impossibile contattare Supabase. Alcune funzioni potrebbero non funzionare.', 'supabase-banner');
            }
        })();
    return true;
        } catch (err) {
        console.error('❌ Errore caricamento Supabase:', err);
        supabaseAvailable = false;
        showBanner('Errore inizializzazione Supabase. Controlla la connessione e le chiavi.', 'supabase-banner');
        return false;
    }
}

// Ensure supabaseClient is available before making calls
function ensureSupabase() {
    if (!supabaseClient) {
        if (!ensureSupabaseWarned) {
            console.warn('Supabase non inizializzato. Alcune funzionalità sono disabilitate.');
            showToast('Servizio non pronto: incolla la ANON key con il pulsante di configurazione.', 'warning');
            ensureSupabaseWarned = true;
        }
        return false;
    }
    return true;
}

// Global error handlers to capture unexpected exceptions and promise rejections
window.addEventListener('unhandledrejection', (ev) => {
    console.error('Unhandled rejection:', ev.reason);
});

window.addEventListener('error', (ev) => {
    console.error('Window error:', ev.message, ev.error);
});

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    // Auto-check login status after OAuth redirect (e.g., after Google login)
    setTimeout(() => checkAutoLoginAfterRedirect(), 300);
  });
} else {
  initSupabase();
  setTimeout(() => checkAutoLoginAfterRedirect(), 300);
}

// Controlla se l'utente è autenticato dopo un redirect OAuth (es. da Google)
async function checkAutoLoginAfterRedirect() {
  if (!supabaseClient) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      console.log('✅ Utente autenticato rilevato dopo redirect OAuth, caricamento profilo...');
      checkLoginStatus();
    }
  } catch (err) {
    console.warn('checkAutoLoginAfterRedirect errore:', err);
  }
}

// --- 2. VARIABILI GLOBALI (Caricate da Supabase) ---

let annunci = []; // Caricati dal database
let acceptedContracts = JSON.parse(localStorage.getItem('acceptedContracts')) || [];
let completedContracts = JSON.parse(localStorage.getItem('completedContracts')) || [];
let hiddenAnnouncements = JSON.parse(localStorage.getItem('hiddenAnnouncements')) || [];
let userBalance = 0; // Caricato dal profilo Supabase
let frozenBalance = 0; // Caricato dal profilo Supabase
let chatHistoryAI = JSON.parse(localStorage.getItem('chatHistoryAI')) || [];
let currentChatCompany = null;
let map = null;
let markers = [];
let reviewViewMode = 'received'; // <--- Fondamentale per non far crashare il profilo
let pendingAnnouncements = new Set();
let supabaseAvailable = false;
let ensureSupabaseWarned = false;

// --- SISTEMA TOAST (UX PROFESSIONALE) ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = "🔔";
    if (type === 'success') icon = "✅";
    if (type === 'error') icon = "❌";
    if (type === 'warning') icon = "⚠️";

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    // Fade in
    setTimeout(() => toast.classList.add('show'), 100);

    // Auto remove after 5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => container.removeChild(toast), 400);
    }, 5000);
}

// lightweight UI helpers (toasts, banners)
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('visible'), 10);
    setTimeout(() => t.classList.remove('visible'), 5000 - 300);
    setTimeout(() => t.remove(), 5000);
}

function showBanner(message, id) {
    if (!id) return;
    let b = document.getElementById(id);
    if (!b) {
        b = document.createElement('div');
        b.id = id;
        b.className = 'site-banner';
        b.textContent = message;
        document.body.appendChild(b);
    } else {
        b.textContent = message;
        b.style.display = '';
    }
}

function removeBanner(id) {
    if (!id) return;
    const b = document.getElementById(id);
    if (b) b.style.display = 'none';
}

function showSupabaseSetupBanner() {
    if (document.getElementById('supabase-setup-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'supabase-setup-banner';
    banner.className = 'site-banner';
    banner.style.position = 'fixed';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.top = '0';
    banner.style.zIndex = 9998;
    banner.style.display = 'flex';
    banner.style.justifyContent = 'space-between';
    banner.style.alignItems = 'center';
    banner.style.padding = '10px 16px';
    banner.style.background = '#fffae6';
    banner.style.color = '#222';

    const msg = document.createElement('div');
    msg.textContent = 'Supabase non configurato — incolla la ANON KEY per inizializzare temporaneamente la sessione.';

    const actions = document.createElement('div');
    const btn = document.createElement('button');
    btn.textContent = 'Configura ora';
    btn.className = 'btn-primary';
    btn.style.marginRight = '8px';
    btn.onclick = promptForSupabaseConfig;

    const close = document.createElement('button');
    close.textContent = 'Chiudi';
    close.className = 'btn-secondary';
    close.onclick = () => banner.remove();

    actions.appendChild(btn);
    actions.appendChild(close);

    banner.appendChild(msg);
    banner.appendChild(actions);
    document.body.appendChild(banner);
}

// If the developer/user didn't supply runtime vars, allow entering them temporarily
function showSupabaseConfigPrompt() {
    if (document.getElementById('supabase-config-action')) return; // already shown
    const wrapper = document.createElement('div');
    wrapper.id = 'supabase-config-action';
    wrapper.style.position = 'fixed';
    wrapper.style.right = '16px';
    wrapper.style.bottom = '16px';
    wrapper.style.zIndex = 9999;

    const btn = document.createElement('button');
    btn.textContent = 'Configura Supabase (temporaneo)';
    btn.className = 'btn-primary';
    btn.style.padding = '10px 14px';
    btn.onclick = promptForSupabaseConfig;

    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);
}

function promptForSupabaseConfig() {
    try {
        const defaultUrl = 'https://qtmfgmrigldgodxrecue.supabase.co';
        const url = window.prompt('Inserisci Supabase URL (lascia vuoto per usare default):', defaultUrl) || defaultUrl;
        const key = window.prompt('Inserisci ANON KEY (copiala dalla tua dashboard Supabase). Questa chiave sarà salvata solo in questa sessione del browser.', '');
        if (!key) {
            alert('ANON KEY non fornita. Operazione annullata.');
            return;
        }
        // store only in sessionStorage (ephemeral)
        sessionStorage.setItem('supabase_url', url);
        sessionStorage.setItem('supabase_anon_key', key);
        // populate runtime globals
        window.__SUPABASE_URL = url;
        window.__SUPABASE_ANON_KEY = key;
        removeBanner('supabase-banner');
        const el = document.getElementById('supabase-config-action');
        if (el) el.remove();
        // Re-initialize
        initSupabase();
        if (supabaseAvailable) showToast('Supabase inizializzato (sessione corrente).', 'success');
    } catch (e) {
        console.error('Errore durante la configurazione temporanea di Supabase:', e);
        alert('Errore durante la configurazione temporanea. Vedi console.');
    }
}

// If sessionStorage has runtime config (entered manually earlier), populate globals early
try {
    const sUrl = sessionStorage.getItem('supabase_url');
    const sKey = sessionStorage.getItem('supabase_anon_key');
    if (sUrl && sKey) {
        window.__SUPABASE_URL = sUrl;
        window.__SUPABASE_ANON_KEY = sKey;
    }
} catch (e) { /* ignore */ }

// --- RICERCA PROSSIMITÀ (SMART MAPS) ---
async function findJobsNearMe() {
    if (!navigator.geolocation) {
        showToast("Il tuo browser non supporta la geolocalizzazione", "error");
        return;
    }

    showToast("Ricerca della tua posizione...", "info");

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        if (map) map.setView([latitude, longitude], 14);

        showToast("Mappa aggiornata alla tua posizione!", "success");
        renderBacheca();
    }, (err) => {
        showToast("Impossibile ottenere la tua posizione", "error");
    });
}

// --- SISTEMA TRANSAZIONI & GAMIFICATION ---
async function logTransaction(amount, desc) {
    try {
        if (!supabaseClient) {
            console.error("❌ Supabase non inizializzato");
            return false;
        }

        const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
        if (userErr || !user) {
            console.error("❌ Errore recupero utente:", userErr);
            return false;
        }

        const { error } = await supabaseClient
            .from('transactions')
            .insert([{
                user_id: user.id,
                amount: amount,
                description: desc,
                created_at: new Date().toISOString()
            }]);

        if (error) {
            console.error("❌ Errore log transazione:", error);
            return false;
        } else {
            console.log("✅ Transazione registrata:", desc);
            // Forza il refresh della lista transazioni se visibile
            if (typeof renderTransactions === 'function') {
                renderTransactions();
            }
            return true;
        }
    } catch (e) {
        console.error("❌ Eccezione logTransaction:", e);
        return false;
    }
}

async function selectPlan(planName, price) {
    if (!supabaseClient) {
        showToast("❌ Errore: Sistema non inizializzato", "error");
        return;
    }

    if (userBalance < price) {
        showToast("❌ Saldo insufficiente! Ricarica il tuo profilo.", "error");
        return;
    }

    if (!confirm(`Sottoscrivere il piano ${planName} per €${price}?`)) return;

    try {
        const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
        if (userErr || !user) throw new Error("Utente non trovato");

        userBalance -= price;

        const { error: pErr } = await supabaseClient.auth.updateUser({
            data: {
                ...user.user_metadata,
                is_premium: true,
                badge: "ELITE"
            }
        });
        if (pErr) throw pErr;

        const transactionLogged = await logTransaction(-price, `Abbonamento Academy: Piano ${planName}`);
        if (!transactionLogged) throw new Error("Errore durante il log della transazione");

        showToast(`✅ Congratulazioni! Ora sei un membro ${planName} 💎`, "success");
        if (typeof renderUserProfile === 'function') {
            renderUserProfile();
        }
        if (typeof checkLoginStatus === 'function') {
            checkLoginStatus();
        }
    } catch (err) {
        showToast("❌ Errore durante l'acquisto: " + err.message, "error");
        console.error("Errore selectPlan:", err);
    }
}

async function renderTransactions() {
    const list = document.getElementById('transaction-history');
    if (!list) return;

    if (!supabaseClient) {
        list.innerHTML = '<p style="color: var(--text-dim);">❌ Sistema non inizializzato</p>';
        return;
    }

    try {
        const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
        if (userErr) {
            console.error("❌ Errore recupero utente:", userErr);
            list.innerHTML = '<p style="color: var(--text-dim);">Errore caricamento transazioni</p>';
            return;
        }

        if (!user) {
            list.innerHTML = '<p style="color: var(--text-dim);">Effettua il login per visualizzare le transazioni</p>';
            return;
        }

        const { data: trans, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error("❌ Errore query transazioni:", error);
            list.innerHTML = '<p style="color: var(--text-dim);">Errore caricamento</p>';
            return;
        }

        if (!trans || trans.length === 0) {
            list.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem; padding: 10px;">Nessun movimento recente.</p>';
            return;
        }

        list.innerHTML = '';
        trans.forEach(t => {
            const item = document.createElement('div');
            item.className = 'transaction-item glass';
            const date = new Date(t.created_at).toLocaleDateString();
            const isPlus = t.amount > 0;

            item.innerHTML = `
                <div>
                    <div style="font-weight: 500;">${sanitizeInput(t.description)}</div>
                    <div style="font-size: 0.7rem; color: var(--text-dim);">${date}</div>
                </div>
                <div class="transaction-amount ${isPlus ? 'plus' : 'minus'}">
                    ${isPlus ? '+' : ''}${t.amount.toFixed(2)}€
                </div>
            `;
            list.appendChild(item);
        });
    } catch (e) {
        console.error("❌ Eccezione renderTransactions:", e);
        list.innerHTML = '<p style="color: var(--text-dim);">Errore sconosciuto</p>';
    }
}


// --- 3. INIZIALIZZAZIONE ALL'AVVIO ---
// --- 3. INIZIALIZZAZIONE ALL'AVVIO ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("App avviata...");
    // Avvio delle funzioni principali
    try {
        if (typeof checkLoginStatus === 'function') checkLoginStatus();
        else console.error("Errore: la funzione checkLoginStatus non è stata trovata!");

        if (typeof renderChatHistory === 'function') renderChatHistory();

        // Real-time subscription: solo se Supabase inizializzato
        if (ensureSupabase()) {
            try {
                supabaseClient
                    .channel('realtime-messages')
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'messages'
                    }, payload => {
                        console.log("Nuovo messaggio ricevuto:", payload.new);
                        if (currentChatCompany && payload.new.announcement_id === currentChatCompany.jobId) {
                            if (typeof loadMessages === 'function') loadMessages(currentChatCompany.jobId);
                        }
                    })
                    .subscribe();
            } catch (e) {
                console.warn('Impossibile sottoscrivere canale realtime:', e.message || e);
            }
        }
    } catch (e) {
        console.error('Errore allavvio:', e.message || e);
    }
});

// --- 4. FUNZIONE CHAT AI AGGIORNATA (Usa supabaseClient) ---

// ... DA QUI IN POI COMINCIANO LE TUE ALTRE FUNZIONI (checkLoginStatus, renderBacheca, etc.) ...

// --- LOGICA DI NAVIGAZIONE E AUTH ---
let isCheckingLogin = false; // Flag per evitare doppie esecuzioni

async function checkLoginStatus() {
    if (!supabaseClient || isCheckingLogin) return;
    isCheckingLogin = true; // Blocca esecuzioni simultanee

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            const user = session.user;

            // Prepariamo i dati del profilo
            const profileData = {
                id: user.id,
                display_name: user.user_metadata.full_name || user.email,
                email: user.email,
                avatar_url: user.user_metadata.avatar_url || '',
                user_type: 'private'
                // Non mettiamo balance qui per evitare di sovrascrivere il saldo reale a ogni login
            };

            // UPSERT: Se esiste aggiorna (senza toccare il saldo), se non esiste crea.
            // Usiamo onConflict: 'id' per dire a Supabase di controllare la chiave primaria
            const { data: profile, error: upsertErr } = await supabaseClient
                .from('profiles')
                .upsert(profileData, { onConflict: 'id' })
                .select()
                .maybeSingle();

            if (upsertErr) {
                console.error("Errore sincronizzazione profilo:", upsertErr);
            }

            if (profile) {
                // Carichiamo i saldi REALI dal database
                userBalance = parseFloat(profile.balance) || 0;
                frozenBalance = parseFloat(profile.frozen_balance) || 0;

                const userData = {
                    id: profile.id,
                    name: profile.display_name,
                    email: profile.email,
                    type: profile.user_type,
                    avatar: profile.avatar_url,
                    is_premium: profile.is_premium
                };
                localStorage.setItem('userData', JSON.stringify(userData));
                
                showView('app-view');
                updateSidebar(); 
                loadAnnouncementsFromDB();
                renderUserProfile();
            }
        } else {
            showView('auth-view');
        }
    } catch (err) {
        console.error("Errore critico in checkLoginStatus:", err);
    } finally {
        isCheckingLogin = false; // Sblocca
    }
}
//SHOW VIEW 
function showView(viewId) {
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');

    if (viewId === 'auth-view') {
        // MOSTRA SOLO LOGIN
        authView.classList.remove('hidden');
        appView.classList.add('hidden');
        document.body.classList.add('auth-mode'); // Blocca lo scroll del telefono

        // Chiudi forzatamente il modale se fosse rimasto aperto
        if (document.getElementById('create-annuncio-modal')) {
            document.getElementById('create-annuncio-modal').classList.add('hidden');
        }
    } else {
        // MOSTRA SOLO APP
        authView.classList.add('hidden');
        appView.classList.remove('hidden');
        document.body.classList.remove('auth-mode'); // Sblocca lo scroll
    }

    window.scrollTo(0, 0); // Riporta la pagina all'inizio
}
function initDashboard() {
    renderBacheca();
    updateSidebar();
    initMap();

    // Inizializza messaggio AI se presente e vuoto (nuova integrazione bacheca)
    const aiBody = document.getElementById('ai-chat-body');
    if (aiBody && aiBody.innerHTML.trim() === '') {
        appendMessage('ai', "Ciao! Sono Worky-AI. Come posso aiutarti oggi? Prova a scrivere 'Cerca lavoro' o 'Crea un annuncio per un barista'.", aiBody);
    }
}

async function loadAnnouncementsFromDB() {
    if (!ensureSupabase()) return;
    try {
        console.log("Tentativo scaricamento annunci...");
        // Se l'utente non è autenticato, evitiamo join con `profiles` per non incorrere
        // in 403 dovuti a RLS; mostriamo solo i campi pubblici degli annunci.
        const { data: authData } = await supabaseClient.auth.getUser();
        const isAuthed = !!(authData && authData.user);

        let data;
        let error;

        if (isAuthed) {
            // Utente autenticato: tentiamo la query con join profili
            ({ data, error } = await supabaseClient
                .from('announcements')
                .select(`
                    *,
                    profiles (
                        display_name,
                        email,
                        avatar_url,
                        is_premium
                    )
                `)
                .order('created_at', { ascending: false }));
        } else {
            // Utente anonimo: query più sicura senza join profiles
            ({ data, error } = await supabaseClient
                .from('announcements')
                .select(`id,title,description,category,rate as salary,address,lat,lng,image_url,author_id,created_at`)
                .order('created_at', { ascending: false }));
        }

        if (error) {
            console.error("Errore scaricamento annunci (Tentativo 1):", error);
            // Diagnostic helpers: log status and details if present to help debug 403/406/401
            try {
                console.error('Supabase error status:', error.status, 'message:', error.message, 'details:', error.details, 'hint:', error.hint);
            } catch (e) { /* ignore logging issues */ }
            // If it's a 403, provide actionable hint
            if (error && error.status === 403) {
                showToast('Accesso negato (403) durante il caricamento annunci. Controlla Allowed Origins e le policy RLS in Supabase.', 'warning');
            }

            // Prova fallback senza join se l'errore persiste
            const { data: fallbackData, error: fbError } = await supabaseClient
                .from('announcements')
                .select('*')
                .order('created_at', { ascending: false });

            if (fbError) {
                console.error('Fallback query error:', fbError);
                try { console.error('Fallback status:', fbError.status, 'details:', fbError.details, 'hint:', fbError.hint); } catch(e){}
                showToast("Errore critico database: " + fbError.message + (fbError.status ? (' (status ' + fbError.status + ')') : ''), "error");
                return;
            }
            data = fallbackData;
        }

        if (!data || data.length === 0) {
            console.info("Nessun annuncio trovato nel DB.");
            annunci = [];
            renderBacheca();
            return;
        }

        // Trasformiamo i dati per il frontend con fallback sicuri
        annunci = data.map(ann => {
            const profile = Array.isArray(ann.profiles) ? ann.profiles[0] : ann.profiles;

            return {
                id: ann.id,
                title: ann.title || 'Senza titolo',
                description: ann.description || '',
                category: ann.category || 'altro',
                salary: (ann.salary || ann.rate || '0').toString() + '€/ora',
                address: ann.address || 'Bologna',
                lat: ann.lat || 44.4949,
                lng: ann.lng || 11.3426,
                author: profile?.display_name || 'Anonimo',
                authorId: ann.author_id,
                authorAvatar: profile?.avatar_url,
                isPremium: profile?.is_premium || false, // Fallback sicuro a false
                image: ann.image_url,
                created_at: ann.created_at
            };
        });

        renderBacheca();
        if (typeof initMap === 'function') initMap();

    } catch (err) {
        console.error("Eccezione durante loadAnnouncementsFromDB:", err);
        showToast("Impossibile caricare gli annunci.", "error");
    }
}

// --- LOGICA PAGAMENTI E RICEVUTE (CORRETTA) ---
function updateBalances() {
    localStorage.setItem('userBalance', userBalance.toFixed(2));
    localStorage.setItem('frozenBalance', frozenBalance.toFixed(2));
    updateSidebar();
}

function updateSidebar() {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData) return;

    document.getElementById('user-display-name').textContent = userData.name;
    document.getElementById('user-balance').textContent = `${userData.currency || '€'} ${userBalance.toFixed(2)}`;
    document.getElementById('frozen-balance').textContent = `${userData.currency || '€'} ${frozenBalance.toFixed(2)}`;
}

// Google Authentication
function initGoogleAuth() {
    if (typeof google === 'undefined') return;
    google.accounts.id.initialize({
        client_id: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com", // Sostituire con ID reale
        callback: handleGoogleLogin
    });
    google.accounts.id.renderButton(
        document.getElementById("google-login-btn"),
        { theme: "outline", size: "large", width: "100%" }
    );
}

function handleGoogleLogin(response) {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    const userData = {
        name: payload.given_name,
        surname: payload.family_name,
        email: payload.email,
        avatar: payload.picture,
        type: 'private'
    };
    localStorage.setItem('userData', JSON.stringify(userData));
    localStorage.setItem('isLoggedIn', 'true');
    checkLoginStatus();
}

// 1. LOGIN CON INDIRIZZO FISSO (Come richiesto)
async function loginWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: 'https://jml-gamma-v2.vercel.app'
        }
    });
    if (error) alert("Errore Google: " + error.message);
}

// Geocoding (Nominatim API)
async function getCoordinates(address) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch (e) { console.error("Geocoding error:", e); }
    return { lat: 44.49 + (Math.random() * 0.05), lng: 11.34 + (Math.random() * 0.05) };
}

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    const section = document.getElementById(sectionId);
    if (section) section.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeLink = Array.from(document.querySelectorAll('.nav-item')).find(el => el.getAttribute('onclick')?.includes(sectionId));
    if (activeLink) activeLink.classList.add('active');

    // FIX PER MOBILE: Torna in alto
    document.querySelector('.main-content').scrollTop = 0;

    // Ricalcola o Inizializza Mappa solo se visibile
    if (sectionId === 'map-section') {
        if (!map) {
            initMap();
        } else {
            setTimeout(() => {
                if (map) map.invalidateSize();
            }, 300);
        }
    }
}

function renderBachecaFromAI() {
    renderBacheca();
}


function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

// Mappa
function initMap() {
    const container = document.getElementById('map-content');
    if (!container) return;

    // Pulizia se esiste già una mappa
    if (map) {
        map.off();
        map.remove();
        map = null;
    }

    // Inizializzazione standard con ritardo per attendere che il CSS faccia il suo lavoro
    setTimeout(() => {
        if (!document.getElementById('map-content')) return;

        map = L.map('map-content', {
            zoomControl: true,
            worldCopyJump: false
        }).setView([44.4949, 11.3426], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
            }).addTo(map)
            .on('tileerror', function (error, tile) {
                console.warn('Tile error:', error);
                // Mostra un messaggio utente leggibile solo la prima volta
                showToast('Problema rete: impossibile caricare alcune tessere della mappa. Verifica la tua connessione o riprova più tardi.', 'warning');
            });

        syncMapMarkers(annunci);

        // Forza il ricalcolo finale
        map.invalidateSize();
    }, 100);
}

// --- FUNZIONE HELPER DI SANITIZZAZIONE (Anti-XSS) ---
function sanitizeInput(str) {
    if (!str) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return str.replace(reg, (match) => (map[match]));
}

// Bacheca e Annunci
async function renderBacheca() {
    const grid = document.getElementById('announcements-grid');
    if (!grid) return;

    // Recuperiamo l'ID dell'utente loggato per il controllo "Elimina"
    const { data: { user } } = await supabaseClient.auth.getUser();
    const currentUserId = user ? user.id : null;

    // SOURCE DI RICERCA: prioritizziamo la nuova barra AI integrata
    const searchText = (document.getElementById('ai-input')?.value || "").toLowerCase();
    const filterCat = document.getElementById('filter-category')?.value || "";
    const userData = JSON.parse(localStorage.getItem('userData'));
    const userCurrency = userData ? (userData.currency || '€') : '€';

    const filtered = annunci.filter(ann => {
        if (hiddenAnnouncements.includes(ann.id) || completedContracts.includes(ann.id)) return false;

        // Se searchText è vuoto, vogliamo vedere tutto
        if (!searchText) {
            const matchesCat = filterCat === "" || ann.category === filterCat;
            return matchesCat;
        }

        // Se c'è testo cercato, controlliamo i campi
        const matchesSearch = (ann.title || "").toLowerCase().includes(searchText) ||
            (ann.author || "").toLowerCase().includes(searchText) ||
            (ann.description || "").toLowerCase().includes(searchText);

        const matchesCat = filterCat === "" || ann.category === filterCat;
        return matchesSearch && matchesCat;
    });

    grid.innerHTML = '';
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; padding:3rem; color:var(--text-dim); text-align:center; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed var(--border);">' +
            '<h3>Nessun annuncio trovato</h3>' +
            '<p>Prova a cambiare i filtri o scrivi un comando a Worky-AI</p></div>';
        syncMapMarkers(filtered);
        return;
    }

    filtered.forEach(ann => {
        // --- LOGICA MODIFICATA: Controllo tramite ID per sicurezza totale ---
        const isAuthor = ann.authorId === currentUserId;
        const isAccepted = acceptedContracts.includes(ann.id);

        const card = document.createElement('div');
        card.className = `annuncio-card glass ${isAccepted ? 'accepted' : ''}`;
        card.id = `annuncio-${ann.id}`;
        card.onclick = () => openAnnuncioDetails(ann.id);

        card.innerHTML = `
            ${ann.image ? `<img src="${ann.image}" class="annuncio-img">` : ''}
            <div class="card-content">
                <div class="card-header">
                    <span class="category-tag">${sanitizeInput(ann.category)}</span>
                    <div class="author-tag">
                        <img src="${ann.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100'}" class="author-logo">
                        ${sanitizeInput(ann.author)}
                    </div>
                </div>
                <h3>${sanitizeInput(ann.title)}</h3>
                <p style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${sanitizeInput(ann.description)}</p>
                <div class="card-footer">
                    <strong>${userCurrency} ${ann.salary.replace(/[^0-9.]/g, '')}</strong>
                    <div style="display:flex; flex-direction:column; gap:0.5rem; align-items: flex-end;">
                        ${isAuthor ? `
                            <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: #ff4d4d; color: white;" onclick="event.stopPropagation(); deleteAnnuncio(${ann.id})">
                                🗑️ Elimina
                            </button>` : `
                            <div style="display:flex; gap: 0.5rem;">
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem;" onclick="event.stopPropagation(); toggleContract(${ann.id})">
                                    ${isAccepted ? 'Attivo' : 'Accetta'}
                                </button>
                                ${isAccepted ? `
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: #ffb347; color: white;" onclick="event.stopPropagation(); openRevokeModal(${ann.id})" title="Revoca">
                                    🚩
                                </button>` : `
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: var(--text-dim); color: white;" onclick="event.stopPropagation(); hideAnnuncio(${ann.id})" title="Nascondi">
                                    🚫
                                </button>`}
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    syncMapMarkers(filtered);
}

async function openAnnuncioDetails(annId) {
    const ann = annunci.find(a => a.id === annId);
    if (!ann) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    const isAuthor = ann.authorId === user?.id;
    const isAccepted = acceptedContracts.includes(ann.id);

    // Popola campi base
    document.getElementById('ann-details-title').textContent = ann.title;
    document.getElementById('ann-details-description').textContent = ann.description;
    document.getElementById('ann-details-category').textContent = ann.category;
    document.getElementById('ann-details-salary').textContent = ann.salary;
    document.getElementById('ann-details-address').textContent = ann.address || "Bologna (Centro)";

    const authorNameLabel = document.getElementById('ann-details-author-name');
    if (authorNameLabel) {
        authorNameLabel.innerHTML = `
            ${sanitizeInput(ann.author)} 
            ${ann.isPremium ? '<span class="premium-badge-profile" style="font-size:0.6rem; padding: 2px 6px;">💎 ELITE</span>' : ''}
        `;
    }

    const authorImg = document.getElementById('ann-details-author-logo');
    if (authorImg) {
        authorImg.src = ann.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100';
    }

    const bgImg = document.getElementById('ann-details-image');
    if (bgImg) {
        bgImg.style.backgroundImage = ann.image ? `url(${ann.image})` : "linear-gradient(45deg, #1a1c24, #2a2d3a)";
    }

    // Gestione Azioni Dinamiche
    const actionsCont = document.getElementById('ann-details-actions');
    if (actionsCont) {
        actionsCont.innerHTML = '';

        if (isAuthor) {
            if (isAccepted) {
                const confirmBtn = document.createElement('button');
                confirmBtn.className = 'btn-primary';
                confirmBtn.style.background = '#4CAF50';
                confirmBtn.style.flex = '2';
                confirmBtn.textContent = '✅ Conferma e Paga';
                confirmBtn.onclick = () => {
                    // Se siamo qui e il lavoro è accettato, cerchiamo se c'è un partner in una chat esistente
                    // Altrimenti dobbiamo passare per la sezione messaggi
                    if (currentChatCompany && currentChatCompany.jobId === ann.id && currentChatCompany.partnerId !== 'N/A') {
                        releasePayment();
                    } else {
                        showToast("Per rilasciare il pagamento, apri la chat con il lavoratore nella sezione Messaggi.", "warning");
                    }
                    closeModal('annuncio-details-modal');
                };
                actionsCont.appendChild(confirmBtn);

                const reportBtn = document.createElement('button');
                reportBtn.className = 'btn-primary';
                reportBtn.style.background = '#ff4d4d';
                reportBtn.style.flex = '1';
                reportBtn.textContent = '⚠️ Segnala';
                reportBtn.onclick = () => { openReportModal(); closeModal('annuncio-details-modal'); };
                actionsCont.appendChild(reportBtn);

                const chatBtn = document.createElement('button');
                chatBtn.className = 'btn-primary';
                chatBtn.style.background = 'var(--secondary)';
                chatBtn.style.flex = '1';
                chatBtn.textContent = '💬 Vai alla Chat';
                chatBtn.onclick = () => {
                    showView('contracts-section');
                    closeModal('annuncio-details-modal');
                    updateChatList();
                };
                actionsCont.appendChild(chatBtn);
            } else {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-primary';
                delBtn.style.background = '#ff4d4d';
                delBtn.style.flex = '1';
                delBtn.textContent = '🗑️ Elimina Annuncio';
                delBtn.onclick = () => { deleteAnnuncio(ann.id); closeModal('annuncio-details-modal'); };
                actionsCont.appendChild(delBtn);
            }
        } else {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn-primary';
            toggleBtn.style.flex = '2';
            toggleBtn.textContent = isAccepted ? '✅ Contratto Attivo' : '🤝 Accetta Lavoro ora';
            toggleBtn.onclick = () => { toggleContract(ann.id); openAnnuncioDetails(ann.id); };
            actionsCont.appendChild(toggleBtn);

            if (isAccepted) {
                const chatBtn = document.createElement('button');
                chatBtn.className = 'btn-primary';
                chatBtn.style.background = 'var(--secondary)';
                chatBtn.style.flex = '1';
                chatBtn.textContent = '💬 Messaggio';
                chatBtn.onclick = () => {
                    currentChatCompany = { jobId: ann.id, partnerId: ann.authorId, name: ann.author, jobTitle: ann.title };
                    showView('contracts-section');
                    closeModal('annuncio-details-modal');
                    openCompanyChat(currentChatCompany);
                };
                actionsCont.appendChild(chatBtn);
            } else {
                const hideBtn = document.createElement('button');
                hideBtn.className = 'btn-primary';
                hideBtn.style.background = 'var(--text-dim)';
                hideBtn.style.flex = '1';
                hideBtn.textContent = '🚫 Nascondi';
                hideBtn.onclick = () => { hideAnnuncio(ann.id); closeModal('annuncio-details-modal'); };
                actionsCont.appendChild(hideBtn);
            }
        }
    }

    showModal('annuncio-details-modal');
}

async function deleteAnnuncio(id) {
    if (!confirm("Sei sicuro di voler eliminare definitivamente questo annuncio? Verrà rimosso anche dal database Cloud.")) return;

    // 1. Elimina da Supabase
    const { error } = await supabaseClient
        .from('announcements')
        .delete()
        .eq('id', id);

    if (error) {
        showToast("Errore durante l'eliminazione: " + error.message, "error");
        return;
    }

    // 2. Ricarica i dati dal DB per aggiornare la bacheca
    showToast("Annuncio rimosso con successo! 🗑️", "success");
    loadAnnouncementsFromDB();
}

function rechargeBalance() {
    const userData = JSON.parse(localStorage.getItem('userData'));
    const cur = userData ? (userData.currency || '€') : '€';
    userBalance += 500;
    localStorage.setItem('userBalance', userBalance);
    renderUserProfile();
    updateSidebar();
    alert(`Saldo ricaricato di ${cur} 500.00! 💰`);
}

function handleCategoryChange() {
    const cat = document.getElementById('ann-category').value;
    const otherCont = document.getElementById('other-category-container');
    if (cat === 'altro') {
        otherCont.classList.remove('hidden');
    } else {
        otherCont.classList.add('hidden');
    }
}

function hideAnnuncio(id) {
    if (!hiddenAnnouncements.includes(id)) {
        hiddenAnnouncements.push(id);
        localStorage.setItem('hiddenAnnouncements', JSON.stringify(hiddenAnnouncements));
        renderBacheca();
        initMap();
    }
}

let revokeAnnuncioId = null;

function openRevokeModal(id) {
    revokeAnnuncioId = id;
    showModal('revoke-modal');
}

function closeRevokeModal() {
    closeModal('revoke-modal');
}

// REVOCA CONTRATTO: Rimborso fondi
function confirmRevocation() {
    const title = document.getElementById('revoke-title').value;
    const desc = document.getElementById('revoke-desc').value;
    if (!title || !desc) { alert('Specifica motivo e dettagli.'); return; }

    const ann = annunci.find(a => a.id === revokeAnnuncioId);
    if (ann) {
        const amount = parseFloat(ann.salary.replace(/[^0-9.]/g, '')) || 0;
        userBalance += amount;
        frozenBalance -= amount;
        updateBalances();
    }

    acceptedContracts = acceptedContracts.filter(cid => cid !== revokeAnnuncioId);
    localStorage.setItem('acceptedContracts', JSON.stringify(acceptedContracts));

    alert(`Contratto revocato. I fondi sono stati riaccreditati.`);
    closeModal('revoke-modal');
    renderBacheca();
}


function syncMapMarkers(filteredAnnunci) {
    if (!map) return;

    // Rimuovi marker esistenti
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    filteredAnnunci.forEach(ann => {
        const isPremium = ann.isPremium;
        const markerColor = isPremium ? '#dcaa25' : '#3498db';
        const iconEmoji = isPremium ? '💎' : '📍';

        const customIcon = L.divIcon({
            html: `<div class="custom-marker" style="background:${markerColor}; width:30px; height:30px; border-radius:30px; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.4); color:white;">${iconEmoji}</div>`,
            className: 'custom-div-icon',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const marker = L.marker([ann.lat, ann.lng], { icon: customIcon }).addTo(map)
            .bindPopup(`
                <div style="text-align: center; color: black; min-width:120px;">
                    <strong style="color:${markerColor}">${sanitizeInput(ann.title)}</strong><br>
                    <button class="btn-primary" style="margin-top:5px; padding:2px 8px; font-size:10px; width:100%;" onclick="openAnnuncioDetails(${ann.id})">Dettagli</button>
                </div>
            `);
        markers.push(marker);
    });
}

// Annunci
function openCreateModal() { document.getElementById('create-annuncio-modal').classList.remove('hidden'); }
function closeCreateModal() { document.getElementById('create-annuncio-modal').classList.add('hidden'); }

async function createAnnuncio() {
    console.log("Inizio procedura pubblicazione...");
    
    // Recupero elementi
    const btn = document.getElementById('create-annuncio-submit');
    const title = document.getElementById('ann-title').value.trim();
    const rate = parseFloat(document.getElementById('ann-salary').value) || 0;
    const duration = parseFloat(document.getElementById('ann-duration').value) || 1;
    const desc = document.getElementById('ann-desc').value.trim();
    const category = document.getElementById('ann-category').value;
    const address = document.getElementById('ann-address').value;
    const city = document.getElementById('ann-city').value || "Bologna";
    const timeUnit = document.getElementById('ann-time-unit').value;
    const imageFile = document.getElementById('ann-image').files[0];

    // 1. Validazione
    if (!title || rate <= 0 || !address) {
        alert("⚠️ Inserisci titolo, compenso e indirizzo!");
        return;
    }

    const totalCost = rate * duration;
    if (userBalance < totalCost) {
        alert(`❌ Saldo insufficiente! L'annuncio costa ${totalCost}€, tu hai ${userBalance.toFixed(2)}€`);
        return;
    }

    // Blocca pulsante
    btn.disabled = true;
    btn.textContent = "⌛ Invio in corso...";

    try {
        // 2. Immagine
        let imageBase64 = "";
        if (imageFile) {
            console.log("Conversione immagine...");
            imageBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(imageFile);
            });
        }

        // 3. Coordinate
        console.log("Recupero coordinate...");
        const coords = await getCoordinates(`${address}, ${city}`);

        // 4. Chiamata al Database
        console.log("Chiamata RPC Supabase...");
        const { error } = await supabaseClient.rpc('create_announcement_safe', {
            arg_title: title,
            arg_description: desc,
            arg_category: category,
            arg_rate: Number(rate),          // Forza numero
            arg_duration: Number(duration),  // Forza numero
            arg_time_unit: timeUnit,
            arg_address: address,
            arg_lat: Number(coords.lat),     // Forza numero
            arg_lng: Number(coords.lng),     // Forza numero
            arg_image_url: imageBase64
        });

        if (error) throw error;

        // 5. Successo
        console.log("✅ Annuncio creato!");
        alert("Annuncio pubblicato correttamente! 🚀");
        
        closeCreateModal();
        await checkLoginStatus(); // Ricarica saldo
        await loadAnnouncementsFromDB(); // Ricarica bacheca

    } catch (err) {
        console.error("ERRORE CRITICO:", err);
        alert("Errore durante la pubblicazione: " + (err.message || err.details));
    } finally {
        btn.disabled = false;
        btn.textContent = "Pubblica";
    }
}

// --- CREAZIONE ANNUNCIO (SALVATAGGIO SU SUPABASE) ---
async function finalizeAnnuncioCreation(title, category, desc, displaySalary, address, coords, imageUrl, userData, pendingKey) {
    if (!ensureSupabase()) { showToast('Servizio non disponibile. Riprova più tardi.', 'error'); if (pendingKey) pendingAnnouncements.delete(pendingKey); return; }
    const rate = parseFloat(document.getElementById('ann-salary').value) || 0;
    const duration = parseFloat(document.getElementById('ann-duration').value) || 1;
    const unit = document.getElementById('ann-time-unit').value;
    // Chiamiamo la funzione sicura sul server (RPC)
    try {
        const { error } = await supabaseClient.rpc('create_announcement_safe', {
            arg_title: title,
            arg_description: desc,
            arg_category: category,
            arg_rate: rate,
            arg_duration: duration,
            arg_time_unit: unit,
            arg_address: address,
            arg_lat: coords.lat,
            arg_lng: coords.lng,
            arg_image_url: imageUrl
        });

        if (error) {
            // Handle 409 Conflict (duplicate / already processing)
            const status = error.status || (error.code ? parseInt(error.code, 10) : null);
            if (status === 409 || (error.message && error.message.toLowerCase().includes('conflict'))) {
                // Refund local balances since creation failed
                const totalAmount = rate * duration;
                userBalance += totalAmount;
                frozenBalance -= totalAmount;
                updateBalances();
                showToast('Operazione duplicata o già in corso. Se pensi sia un errore controlla i tuoi annunci.', 'warning');
                return;
            }

            showToast("Errore durante la creazione: " + error.message, "error");
            // Refund local balances
            const totalAmount = rate * duration;
            userBalance += totalAmount;
            frozenBalance -= totalAmount;
            updateBalances();
            return;
        }
    } catch (rpcErr) {
        console.error('Errore RPC create_announcement_safe:', rpcErr);
        const isConflict = rpcErr?.status === 409 || (rpcErr?.message && rpcErr.message.toLowerCase().includes('conflict'));
        const totalAmount = rate * duration;
        userBalance += totalAmount;
        frozenBalance -= totalAmount;
        updateBalances();
        if (isConflict) {
            showToast('Operazione duplicata o già in corso. Se pensi sia un errore controlla i tuoi annunci.', 'warning');
        } else {
            showToast('Errore durante la creazione dell\'annuncio: ' + (rpcErr.message || rpcErr), 'error');
        }
        if (pendingKey) pendingAnnouncements.delete(pendingKey);
        return;
    }

    // Se l'operazione ha avuto successo, registriamo la transazione di impegno fondi
    const totalAmount = rate * duration;
    await logTransaction(-totalAmount, `Fondi impegnati per: ${title}`);

    // Se l'operazione ha avuto successo, aggiorniamo la UI locale scaricando i dati nuovi
    showToast('Annuncio creato con successo! Il pagamento è garantito dal sistema. 🛡️', 'success');
    closeModal('create-annuncio-modal');

    // Ricarichiamo il profilo e la bacheca per vedere il nuovo saldo aggiornato dal server
    checkLoginStatus();
    loadAnnouncementsFromDB();
    if (pendingKey) pendingAnnouncements.delete(pendingKey);
}

// SISTEMA ABBONAMENTI & CORSI
function showSubscriptionPlans() {
    showView('app-view');
    showSection('subscriptions-section');
}

function selectPlan(planType, price) {
    // Simulazione pagamento o redirect a Stripe con parametri diversi
    const confirm = window.confirm(`Vuoi procedere con il piano ${planType.toUpperCase()} a €${price}?`);
    if (confirm) {
        activatePremium(planType);
    }
}

async function activatePremium(planType = 'PRO') {
    // Qui integreremmo Stripe con il priceId specifico del piano
    console.log(`Attivazione piano: ${planType}`);

    try {
        let userData = JSON.parse(localStorage.getItem('userData')) || {};

        // Simulazione successo immediato per demo
        userData.isPremium = true;
        userData.subscriptionPlan = planType;
        userData.credits = planType === 'PRO' ? 999 : (planType === 'STANDARD' ? 2 : 1);

        localStorage.setItem('userData', JSON.stringify(userData));
        localStorage.setItem('isLoggedIn', 'true');

        alert(`Congratulazioni! Piano ${planType} attivato con successo. 💎\nHai accesso ai corsi Worky Academy.`);
        location.reload();
    } catch (err) {
        console.error("Errore attivazione:", err);
        alert("Errore durante l'attivazione dell'abbonamento.");
    }
}

// Contratti e Chat
function toggleContract(id) {
    const jobId = Number(id);

    if (acceptedContracts.includes(jobId)) {
        alert('Contratto già accettato.');
        return;
    }

    acceptedContracts.push(jobId);
    localStorage.setItem('acceptedContracts', JSON.stringify(acceptedContracts));

    alert('Contratto accettato! Vai nella sezione Messaggi per parlare con il committente.');

    // Forza l'aggiornamento della bacheca e della lista chat
    renderBacheca();
    updateChatList();
}
async function updateChatList() {
    const list = document.getElementById('company-chat-list');
    if (!list) return;

    if (!ensureSupabase()) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Recuperiamo tutti i messaggi connessi all'utente per trovare i partner
    const { data: allMessages, error: msgErr } = await supabaseClient
        .from('messages')
        .select('announcement_id, sender_id, receiver_id')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (msgErr) {
        console.error("Errore recupero messaggi:", msgErr);
        return;
    }

    // 2. Mappa delle conversazioni (jobId + partnerId)
    const activeChats = new Map();

    // Aggiungiamo chat dai messaggi esistenti
    if (allMessages) {
        allMessages.forEach(m => {
            const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
            const key = `${m.announcement_id}_${partnerId}`;
            if (!activeChats.has(key)) {
                activeChats.set(key, { jobId: m.announcement_id, partnerId: partnerId });
            }
        });
    }

    // Aggiungiamo contratti accettati localmente (se non già presenti)
    acceptedContracts.forEach(jobId => {
        const ann = annunci.find(a => a.id === Number(jobId));
        if (ann && ann.authorId !== user.id) {
            const key = `${ann.id}_${ann.authorId}`;
            if (!activeChats.has(key)) {
                activeChats.set(key, { jobId: ann.id, partnerId: ann.authorId });
            }
        }
    });

    if (activeChats.size === 0) {
        list.innerHTML = '<p style="padding:1rem; color:var(--text-dim);">Accetta un contratto per sbloccare la chat.</p>';
        return;
    }

    list.innerHTML = '';

    // 3. Per ogni chat, scarichiamo i dettagli (titolo annuncio + nome partner)
    for (const [key, info] of activeChats) {
        const { data: annData } = await supabaseClient
            .from('announcements')
            .select('title, author_id')
            .eq('id', info.jobId)
            .single();

        const { data: partnerData } = await supabaseClient
            .from('profiles')
            .select('display_name')
            .eq('id', info.partnerId)
            .single();

        const chatName = partnerData?.display_name || "Utente";
        const jobTitle = annData?.title || "Lavoro";
        const isOwner = annData?.author_id === user.id;

        const item = document.createElement('div');
        item.className = 'chat-item glass';
        item.innerHTML = `
            <strong>${sanitizeInput(chatName)}</strong><br>
            <small>${sanitizeInput(jobTitle)}</small>
        `;
        item.onclick = () => openCompanyChat({
            jobId: info.jobId,
            partnerId: info.partnerId,
            name: chatName,
            jobTitle: jobTitle,
            isOwner: isOwner
        });
        list.appendChild(item);
    }
}

function openCompanyChat(chat) {
    currentChatCompany = chat;

    // Sezione Messaggi: attiviamo la finestra
    const chatWindow = document.getElementById('company-chat-window');
    if (chatWindow) chatWindow.classList.add('active');

    // Aggiorna Nome e Titolo Lavoro nell'header
    const partnerName = document.getElementById('chat-partner-name');
    if (partnerName) partnerName.textContent = chat.name;
    const jobTitleLabel = document.getElementById('chat-job-title');
    if (jobTitleLabel) jobTitleLabel.textContent = chat.jobTitle;

    // Gestione Pulsanti "Azione" per l'azienda
    const releaseBtn = document.getElementById('btn-release-payment');
    const reportBtn = document.getElementById('btn-report-job');

    if (chat.isOwner) {
        releaseBtn?.classList.remove('hidden');
        reportBtn?.classList.remove('hidden');
    } else {
        releaseBtn?.classList.add('hidden');
        reportBtn?.classList.add('hidden');
    }

    const body = document.getElementById('company-chat-body');
    if (body) {
        body.innerHTML = `
            <div class="message company glass">
                <div class="msg-content">Ciao! Hai accettato il lavoro per "${sanitizeInput(chat.jobTitle)}". Come possiamo organizzarci?</div>
                <span class="msg-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        `;
    }

    // MOSTRA IL TASTO CESTINO
    const clearBtn = document.getElementById('btn-clear-chat');
    if (clearBtn) clearBtn.classList.remove('hidden');

    loadMessages(chat.jobId);
}

async function releasePayment() {
    if (!currentChatCompany) return;
    
    const jobId = currentChatCompany.jobId;
    const workerId = currentChatCompany.partnerId; // ID del lavoratore nella chat
    const ann = annunci.find(a => a.id === jobId);
    const amount = parseFloat(ann.salary); // Importo da sbloccare

    const { data: { user } } = await supabaseClient.auth.getUser();

    // CHIAMA LA RPC (Funzione SQL sicura)
    const { error } = await supabaseClient.rpc('release_escrow_payment', {
        employer_id: user.id,
        worker_id: workerId,
        job_id: jobId,
        p_amount: amount
    });

    if (error) {
        alert("Errore nel pagamento: " + error.message);
    } else {
        alert("Pagamento inviato con successo! Il lavoratore ha ricevuto i fondi.");
        // Aggiorna la UI
        checkLoginStatus(); 
    }
}

function openReportModal() {
    if (!currentChatCompany) return;
    showModal('report-job-modal');
}

async function submitReport() {
    const reason = document.getElementById('report-reason').value;
    const details = document.getElementById('report-details').value;

    if (!currentChatCompany) return;

    showToast("Invio segnalazione in corso...", "info");

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        const { error } = await supabaseClient
            .from('reports')
            .insert([{
                job_id: currentChatCompany.jobId,
                reporter_id: user.id,
                reported_id: currentChatCompany.partnerId,
                reason: reason,
                details: details
            }]);

        if (error) throw error;

        showToast("Segnalazione inviata correttamente. Il nostro team verificherà l'accaduto.", "success");
        closeModal('report-job-modal');
    } catch (err) {
        showToast("Errore invio segnalazione: " + err.message, "error");
    }
}

async function sendCompanyMessage() {
    const input = document.getElementById('company-input');
    const userMsg = input.value.trim();

    if (!userMsg) return;

    if (!currentChatCompany || !currentChatCompany.jobId) {
        showToast("Seleziona una chat prima di inviare.", "error");
        return;
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        showToast("Devi aver effettuato il login per inviare messaggi.", "error");
        return;
    }

    // 1. Salviamo il messaggio
    const { error } = await supabaseClient
        .from('messages')
        .insert([{
            announcement_id: currentChatCompany.jobId,
            sender_id: user.id,
            receiver_id: currentChatCompany.partnerId,
            content: userMsg
        }]);

    if (error) {
        showToast("Impossibile inviare il messaggio: " + error.message, "error");
        return;
    }

    input.value = '';
    loadMessages(currentChatCompany.jobId);
}

// Suggerimenti Ghost Text
const suggestions = [
    "ciao, come posso aiutarti?",
    "ciao, quali sono i lavori disponibili?",
    "lavoro come cameriere a bologna",
    "contratti di lavoro disponibili",
    "quanto guadagna uno sviluppatore?",
    "fammi vedere la mappa dei lavori",
    "come posso cambiare la mia foto profilo?",
    "quali sono i vantaggi di Worky?"
];

let currentSuggestion = "";

function updateAIWithGhostText() {
    const input = document.getElementById('ai-input');
    const ghost = document.getElementById('ai-suggestion-ghost');
    const val = input.value.toLowerCase();

    if (!val) {
        ghost.textContent = "";
        currentSuggestion = "";
        return;
    }

    const match = suggestions.find(s => s.startsWith(val));
    if (match) {
        // Mostriamo solo la parte mancante preceduta dal testo già scritto (per allineamento)
        // Ma siccome l'input è bianco/trasparente e il ghost è sotto, scriviamo tutto il match
        // in modo che le prime lettere sovrappongano esattamente l'input.
        ghost.textContent = match;
        currentSuggestion = match;
    } else {
        ghost.textContent = "";
        currentSuggestion = "";
    }
}

function handleAIKeyDown(e) {
    const input = document.getElementById('ai-input');
    const ghost = document.getElementById('ai-suggestion-ghost');

    if (e.key === 'Tab') {
        e.preventDefault();

        // Caso 1: Input vuoto -> Mostra un suggerimento casuale
        if (!input.value && !currentSuggestion) {
            const randomSuggest = suggestions[Math.floor(Math.random() * suggestions.length)];
            ghost.textContent = randomSuggest;
            currentSuggestion = randomSuggest;
            return;
        }

        // Caso 2: C'è un suggerimento (da digitazione o da Tab precedente) -> Completa
        if (currentSuggestion) {
            input.value = currentSuggestion;
            ghost.textContent = "";
            currentSuggestion = "";
        }
    } else if (e.key === 'Enter') {
        sendAIMessage();
    }
}


let isAIBusy = false;

function closeChatArea(type) {
    if (type === 'company') {
        const win = document.getElementById('company-chat-window');
        if (win) win.classList.remove('active');
    }
}

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const responseCont = document.getElementById('ai-bacheca-response');
    const body = document.getElementById('ai-chat-body');
    const userMsg = input.value.trim();

    if (!ensureSupabase()) { appendMessage('ai warning', 'Servizio IA non disponibile', body); return; }

    if (!userMsg || isAIBusy) return;

    isAIBusy = true;

    // Mostra l'area risposta nella bacheca
    if (responseCont) responseCont.classList.remove('hidden');

    // Puliamo la risposta precedente per focus sul nuovo comando
    body.innerHTML = '';

    appendMessage('user', userMsg, body);
    input.value = '';

    const thinking = document.createElement('div');
    thinking.className = 'message ai glass thinking';
    thinking.textContent = `Worky-AI sta elaborando...`;
    body.appendChild(thinking);

    try {
        const userData = JSON.parse(localStorage.getItem('userData')) || {};

        const { data, error } = await supabaseClient.functions.invoke('gemini-proxy', {
            body: {
                message: userMsg,
                context: {
                    userName: userData.name || "Utente",
                    balance: userBalance + "€",
                    userType: userData.type || "private"
                }
            }
        });

        if (body.contains(thinking)) body.removeChild(thinking);
        if (error) throw error;

        if (data && data.reply) {
            let replyText = data.reply;

            // --- AZIONE 1: MAGIC FILL (Compilazione Automatica) ---
            if (replyText.includes("[ACTION:FILL_FORM:")) {
                const match = replyText.match(/\[ACTION:FILL_FORM:(.*?)\]/);
                if (match) {
                    const params = match[1].split("|");
                    document.getElementById('ann-title').value = params[0] || "";
                    document.getElementById('ann-salary').value = params[1] || "";
                    document.getElementById('ann-duration').value = params[2] || "1";
                    openCreateModal();
                    if (typeof updatePricePreview === 'function') updatePricePreview();
                    replyText = replyText.replace(/\[ACTION:FILL_FORM:.*?\]/, "🪄 Ho preparato il modulo per te!");
                }
            }

            // --- AZIONE 2: VAI ALLA MAPPA ---
            if (replyText.includes("[ACTION:GO_TO_MAP]")) {
                showSection('map-section');
                replyText = replyText.replace("[ACTION:GO_TO_MAP]", "📍");
            }

            // --- AZIONE 3: VAI AL PROFILO ---
            if (replyText.includes("[ACTION:GO_TO_PROFILE]")) {
                showSection('profile-section');
                replyText = replyText.replace("[ACTION:GO_TO_PROFILE]", "👤");
            }

            // --- AZIONE 4: RICERCA LAVORO ---
            if (replyText.includes("[ACTION:SEARCH:")) {
                const query = replyText.split("[ACTION:SEARCH:")[1].split("]")[0];
                document.getElementById('ai-input').value = query;
                renderBacheca();
                showSection('bacheca-section');
                replyText = replyText.replace(`[ACTION:SEARCH:${query}]`, "🔍");
            }

            // --- AZIONE 5: APRI MODULO VUOTO ---
            if (replyText.includes("[ACTION:OPEN_MODAL_ANNUNCIO]")) {
                openCreateModal();
                replyText = replyText.replace("[ACTION:OPEN_MODAL_ANNUNCIO]", "📝");
            }

            appendMessage('ai', replyText.trim(), body);
        }

    } catch (e) {
        if (body.contains(thinking)) body.removeChild(thinking);
        appendMessage('ai warning', "Errore IA: " + e.message, body);
    } finally {
        setTimeout(() => { isAIBusy = false; }, 1000);
    }
}

function renderChatHistory() {
    const body = document.getElementById('ai-chat-body');
    if (!body) return;
    body.innerHTML = '';
    chatHistoryAI.forEach(msg => {
        const role = msg.role === 'user' ? 'user' : 'ai';
        appendMessage(role, msg.parts[0].text, body);
    });
}

function appendMessage(role, text, container) {
    const msg = document.createElement('div');
    msg.className = `message ${role} ${role === 'ai' ? 'glass' : ''}`;
    // Sanitizziamo tutto il testo PRIMA di rimpiazzare i \n con <br>
    msg.innerHTML = sanitizeInput(text).replace(/\n/g, '<br>');
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

// Rimossa gestione manuale DeepSeek Key婆
// AUTH & REGISTRAZIONE
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getCurrencySymbol(country) {
    const c = country.toLowerCase().trim();
    if (c === 'italia' || c === 'italy' || c === 'germania' || c === 'francia' || c === 'spagna' || c === 'europa') return '€';
    if (c === 'usa' || c === 'stati uniti' || c === 'america' || c === 'canada') return '$';
    if (c === 'uk' || c === 'regno unito' || c === 'inghilterra') return '£';
    if (c === 'giappone' || c === 'japan' || c === 'cina' || c === 'china') return '¥';
    if (c === 'svizzera' || c === 'switzerland') return 'CHF';
    return '€'; // Default
}

async function signup() {
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const name = document.getElementById('reg-name').value;
    const type = document.getElementById('reg-type').value;

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
            data: { display_name: name, user_type: type }
        }
    });

    if (error) {
        showToast("Errore registrazione: " + error.message, "error");
        return;
    }

    // Se "Confirm Email" è disattivato, data.session sarà già pieno!
    if (data.session) {
        showToast("Registrazione riuscita! Benvenuto in Worky.", "success");

        // Salviamo i dati per la tua UI
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userData', JSON.stringify({
            name: name,
            email: email,
            type: type
        }));

        // Entriamo direttamente nella dashboard
        checkLoginStatus();
    } else {
        showToast("Controlla la tua email per confermare l'account.", "info");
        toggleForms();
    }
}

function toggleCompanyFields() {
    const type = document.getElementById('reg-type').value;
    const extra = document.getElementById('company-extra-fields');
    if (type === 'business') {
        extra.classList.remove('hidden');
    } else {
        extra.classList.add('hidden');
    }
}

// Auth Logica
async function login() {
    const email = document.getElementById('email-login').value;
    const password = document.getElementById('password-login').value;

    // 2. Chiediamo a Supabase di verificare le credenziali
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        showToast("Email o Password errati.", "error");
        return;
    }

    // Se arrivi qui, Supabase ha creato il Token JWT e lo ha salvato nel browser.
    // L'IA ora riconoscerà l'utente come "Autorizzato".
    console.log("Token generato correttamente!");
    checkLoginStatus();
}

function logout() { localStorage.clear(); location.reload(); }

function toggleForms() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const toggleLink = document.getElementById('auth-toggle-link');

    loginForm.classList.toggle('hidden');
    signupForm.classList.toggle('hidden');

    if (loginForm.classList.contains('hidden')) {
        toggleLink.textContent = 'Hai già un account? Accedi';
    } else {
        toggleLink.textContent = 'Non hai un account? Registrati';
    }
}

// PROFILO
function renderUserProfile() {
    const display = document.getElementById('profile-display-data');
    if (!display) return;
    const data = JSON.parse(localStorage.getItem('userData')) || {};

    display.innerHTML = `
        <div class="profile-info">
            <strong>Nome:</strong> ${sanitizeInput(data.name) || '---'} 
            ${data.isPremium || data.is_premium ? '<span class="premium-badge-profile" title="Membro Academy Unlimited">💎 ELITE Member</span>' : ''}
        </div>
        <div class="profile-info"><strong>Cognome:</strong> ${sanitizeInput(data.surname) || '---'}</div>
        <div class="profile-info"><strong>Email:</strong> ${sanitizeInput(data.email) || '---'}</div>
        <div class="profile-info"><strong>Città:</strong> ${sanitizeInput(data.city) || '---'}</div>
        ${data.type === 'business' ? `
            <div class="profile-info" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border);">
                <strong>🏢 Azienda:</strong> ${sanitizeInput(data.companyName) || '---'}
            </div>
            <div class="profile-info"><strong>📍 Sede:</strong> ${sanitizeInput(data.companyAddress) || '---'}</div>
            <div class="company-tag">Account Aziendale Verificato</div>
        ` : ''}
    `;

    // Render Social Links
    const socialCont = document.getElementById('profile-social-links');
    if (socialCont) {
        socialCont.innerHTML = '';
        const socials = data.socials || {};
        const platforms = [
            { id: 'instagram', icon: '📸', label: 'Instagram' },
            { id: 'x', icon: '🐦', label: 'X (Twitter)' },
            { id: 'facebook', icon: '👥', label: 'Facebook' },
            { id: 'pinterest', icon: '📌', label: 'Pinterest' }
        ];

        let hasSocials = false;
        platforms.forEach(p => {
            if (socials[p.id]) {
                hasSocials = true;
                const link = document.createElement('a');
                link.href = socials[p.id];
                link.target = '_blank';
                link.className = 'glass';
                link.style.padding = '0.5rem 1rem';
                link.style.borderRadius = '10px';
                link.style.textDecoration = 'none';
                link.style.color = 'var(--text)';
                link.style.fontSize = '0.9rem';
                link.style.display = 'flex';
                link.style.alignItems = 'center';
                link.style.gap = '0.5rem';
                link.innerHTML = `<span>${p.icon}</span> ${p.label}`;
                socialCont.appendChild(link);
            }
        });

        if (!hasSocials) {
            socialCont.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem;">Nessun social collegato.</p>';
        }
    }

    // Carichiamo anche i movimenti
    renderTransactions();

    // Curriculum e Certificazioni
    const cvBox = document.getElementById('profile-cv-data');
    const certBox = document.getElementById('profile-certifications-data');
    if (cvBox) cvBox.textContent = data.cv || "Nessun curriculum inserito. Aggiungilo dalle impostazioni.";
    if (certBox) certBox.textContent = data.certifications || "Nessuna certificazione inserita.";

    // Aggiornamento Immagini Profilo (Avatar)
    const avatarUrl = data.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150';

    const profileImgBig = document.getElementById('profile-avatar-big');
    const sidebarAvatar = document.getElementById('user-avatar');

    if (profileImgBig) profileImgBig.src = avatarUrl;
    if (sidebarAvatar) sidebarAvatar.src = avatarUrl;

    // Aggiornamento Nome in Sidebar
    const sideName = document.getElementById('user-display-name');
    if (sideName) sideName.textContent = data.name || "Utente";

    // Mostra saldo con valuta corretta
    const cur = data.currency || '€';
    const bal = document.getElementById('user-balance');
    const fro = document.getElementById('frozen-balance');
    if (bal) bal.textContent = `${cur} ${userBalance.toFixed(2)}`;
    if (fro) fro.textContent = `${cur} ${frozenBalance.toFixed(2)}`;

    renderReviews();
}

// --- 11. SISTEMA MODIFICA PROFILO ---

async function openEditAccountModal() {
    console.log("Apertura modale modifica profilo...");
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            showToast("Devi essere loggato per modificare il profilo.", "error");
            return;
        }

        // Recuperiamo il profilo
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error || !profile) {
            console.error("Errore recupero profilo:", error);
            showToast("Errore nel caricamento del profilo.", "error");
            return;
        }

        const metadata = user.user_metadata || {};
        const socials = metadata.socials || {};

        // Inizializzazione input
        const nameInput = document.getElementById('edit-name');
        const surnameInput = document.getElementById('edit-surname');
        const cityInput = document.getElementById('edit-city');
        const cvInput = document.getElementById('edit-cv');
        const certInput = document.getElementById('edit-certifications');
        const passInput = document.getElementById('edit-password');
        const bizNameInput = document.getElementById('edit-company-name');
        const bizAddrInput = document.getElementById('edit-company-address');

        if (!nameInput || !surnameInput || !cityInput || !cvInput || !certInput) {
            console.error("Elementi del modale non trovati nel DOM.");
            return;
        }

        // Popola i campi (Sbloccati per modifiche illimitate)
        const nameParts = (profile.display_name || "").split(' ');
        nameInput.value = nameParts[0] || "";
        surnameInput.value = nameParts.slice(1).join(' ') || "";

        nameInput.disabled = false;
        surnameInput.disabled = false;
        cityInput.value = profile.city || "";
        cityInput.disabled = false;
        cvInput.value = profile.cv || "";
        cvInput.disabled = false;
        certInput.value = profile.certifications || "";
        certInput.disabled = false;

        // Business fields
        if (profile.user_type === 'business') {
            document.getElementById('edit-biz-fields').classList.remove('hidden');
            if (bizNameInput) bizNameInput.value = profile.company_name || "";
            if (bizAddrInput) bizAddrInput.value = profile.company_address || "";
        } else {
            document.getElementById('edit-biz-fields').classList.add('hidden');
        }

        // Socials - usiamo i metadata di auth
        if (document.getElementById('edit-instagram')) document.getElementById('edit-instagram').value = socials.instagram || "";
        if (document.getElementById('edit-x')) document.getElementById('edit-x').value = socials.x || "";
        if (document.getElementById('edit-facebook')) document.getElementById('edit-facebook').value = socials.facebook || "";
        if (document.getElementById('edit-pinterest')) document.getElementById('edit-pinterest').value = socials.pinterest || "";

        // Password
        if (passInput) {
            passInput.value = "";
            passInput.disabled = false;
            passInput.placeholder = "••••••••";
        }

        showModal('edit-account-modal');
    } catch (err) {
        console.error("Eccezione in openEditAccountModal:", err);
        showToast("Errore critico durante l'apertura: " + err.message, "error");
    }
}

async function updateAccountData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const metadata = user.user_metadata || {};

    const newName = document.getElementById('edit-name').value;
    const newSurname = document.getElementById('edit-surname').value;
    const newCity = document.getElementById('edit-city').value;
    const newPassword = document.getElementById('edit-password').value;
    const newCv = document.getElementById('edit-cv').value;
    const newCertifications = document.getElementById('edit-certifications').value;

    let profileUpdates = {};
    let authUpdates = {};

    // Sincronizzazione Campi
    if (newName) profileUpdates.display_name = `${newName} ${newSurname}`.trim();
    if (newCity) profileUpdates.city = newCity;
    if (newCv) profileUpdates.cv = newCv;
    if (newCertifications) profileUpdates.certifications = newCertifications;

    // Business fields
    if (user.user_metadata.user_type === 'business') {
        const newBizName = document.getElementById('edit-company-name').value;
        const newBizAddr = document.getElementById('edit-company-address').value;
        if (newBizName) profileUpdates.company_name = newBizName;
        if (newBizAddr) profileUpdates.company_address = newBizAddr;
    }

    // Password (con validazione minima)
    if (newPassword) {
        if (newPassword.length < 6) {
            showToast("La password deve avere almeno 6 caratteri.", "warning");
            return;
        }
        authUpdates.password = newPassword;
    }

    // Socials
    const newSocials = {
        instagram: document.getElementById('edit-instagram').value,
        x: document.getElementById('edit-x').value,
        facebook: document.getElementById('edit-facebook').value,
        pinterest: document.getElementById('edit-pinterest').value
    };

    // Esegui aggiornamenti
    try {
        // 1. Aggiorna Tabella Profiles
        if (Object.keys(profileUpdates).length > 0) {
            const { error: pErr } = await supabaseClient
                .from('profiles')
                .update(profileUpdates)
                .eq('id', user.id);
            if (pErr) throw pErr;
        }

        // 2. Aggiorna Metadata e Password su Auth
        const { error: aErr } = await supabaseClient.auth.updateUser({
            password: authUpdates.password || undefined,
            data: { ...metadata, socials: newSocials }
        });
        if (aErr) throw aErr;

        showToast("Profilo aggiornato con successo!", "success");
        closeModal('edit-account-modal');
        checkLoginStatus(); // Ricarica dati UI
    } catch (err) {
        showToast("Errore durante l'aggiornamento: " + err.message, "error");
    }
}

function updateAvatar() {
    // Deprecata - Ora usiamo handleAvatarUpload
}

function handleAvatarUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const base64 = e.target.result;
            const userData = JSON.parse(localStorage.getItem('userData')) || {};
            userData.avatar = base64;
            localStorage.setItem('userData', JSON.stringify(userData));

            // Aggiorna UI immediatamente
            document.getElementById('profile-avatar-big').src = base64;
            if (document.getElementById('user-avatar')) {
                document.getElementById('user-avatar').src = base64;
            }
            showToast('Foto profilo aggiornata con successo!', 'success');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// Sistema Recensioni
let currentRating = 0;
let reviewAnnuncioId = null;

function openReviewModal(annId) {
    reviewAnnuncioId = annId;
    currentRating = 0;
    document.querySelectorAll('.star-rating .star').forEach(s => s.classList.remove('active'));
    document.getElementById('review-text').value = '';
    document.getElementById('review-modal').classList.remove('hidden');
}

function closeReviewModal() {
    document.getElementById('review-modal').classList.add('hidden');
}

function setRating(val) {
    currentRating = val;
    document.querySelectorAll('.star-rating .star').forEach((s, idx) => {
        if (idx < val) s.classList.add('active');
        else s.classList.remove('active');
    });
}

function submitReview() {
    const text = document.getElementById('review-text').value;
    if (currentRating === 0) { showToast('Inserisci un voto con le stelle!', 'warning'); return; }

    const reviews = JSON.parse(localStorage.getItem('reviews')) || [];

    // Controllo unicità
    if (reviews.some(r => r.jobId === reviewAnnuncioId)) {
        alert('Hai già lasciato una recensione per questo annuncio!');
        closeReviewModal();
        return;
    }

    const ann = annunci.find(a => a.id === reviewAnnuncioId);

    const newReview = {
        id: Date.now(),
        jobId: reviewAnnuncioId,
        type: 'given', // Recensione lasciata dall'utente
        author: "Me",
        text: text,
        rating: currentRating,
        date: new Date().toLocaleDateString(),
        jobTitle: ann ? ann.title : "Lavoro Completato"
    };

    reviews.unshift(newReview);
    localStorage.setItem('reviews', JSON.stringify(reviews));

    closeReviewModal();
    renderReviews();
    showToast('Recensione salvata con successo!', 'success');
}

function switchReviewView(mode) {
    reviewViewMode = mode;

    // Aggiorna classi bottoni
    const btnReceived = document.getElementById('btn-reviews-received');
    const btnGiven = document.getElementById('btn-reviews-given');
    if (btnReceived && btnGiven) {
        if (mode === 'received') {
            btnReceived.style.background = 'var(--primary)';
            btnReceived.style.color = '#000';
            btnGiven.style.background = 'transparent';
            btnGiven.style.color = 'var(--text)';
        } else {
            btnGiven.style.background = 'var(--primary)';
            btnGiven.style.color = '#000';
            btnReceived.style.background = 'transparent';
            btnReceived.style.color = 'var(--text)';
        }
    }

    renderReviews();
}

function renderReviews() {
    const list = document.getElementById('reviews-list');
    const avgDisplay = document.getElementById('profile-rating-average');
    if (!list) return;

    const allReviews = JSON.parse(localStorage.getItem('reviews')) || [];

    // Filtra in base al mode
    const reviews = allReviews.filter(r => (r.type || 'received') === reviewViewMode);

    // Calcola media solo sulle ricevute per il profilo
    const receivedReviews = allReviews.filter(r => (r.type || 'received') === 'received');
    if (receivedReviews.length > 0) {
        const totalRatingReceived = receivedReviews.reduce((acc, r) => acc + r.rating, 0);
        const avg = (totalRatingReceived / receivedReviews.length).toFixed(1);
        avgDisplay.innerHTML = `Rating Qualità lavoratore: ${avg} / 5 (${receivedReviews.length} recensioni)`;
    } else {
        avgDisplay.textContent = "Nessuna valutazione ricevuta.";
    }

    if (reviews.length === 0) {
        list.innerHTML = `<p style="color: var(--text-dim); font-size: 0.9rem; padding: 1rem; text-align: center;">Non hai ancora ${reviewViewMode === 'received' ? 'ricevuto' : 'lasciato'} recensioni.</p>`;
        return;
    }

    list.innerHTML = '';
    reviews.forEach(rev => {
        const card = document.createElement('div');
        card.className = 'review-card glass';
        card.innerHTML = `
            <div class="review-stars">${'★'.repeat(rev.rating)}${'☆'.repeat(5 - rev.rating)}</div>
            <p style="font-size: 0.95rem; margin-bottom: 0.5rem;">"${sanitizeInput(rev.text) || 'Nessun commento'}"</p>
            <div style="font-size: 0.8rem; color: var(--text-dim);">
                <strong>${rev.type === 'received' ? 'Da: ' : 'Per: '}${sanitizeInput(rev.author)}</strong> - ${sanitizeInput(rev.jobTitle)}<br>
                <span>${sanitizeInput(rev.date)}</span>
            </div>
        `;
        list.appendChild(card);
    });
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const toggleBtn = input.nextElementSibling; // Prende la span subito dopo l'input

    if (input.type === "password") {
        input.type = "text";
        toggleBtn.textContent = "🙈"; // Cambia icona in scimmietta o occhio sbarrato
    } else {
        input.type = "password";
        toggleBtn.textContent = "👁️"; // Torna all'occhio normale
    }
}

function calculateTotalPreview() {
    const rate = parseFloat(document.getElementById('ann-salary').value) || 0;
    const duration = parseFloat(document.getElementById('ann-duration').value) || 0;
    const unit = document.getElementById('ann-time-unit').value;
    const preview = document.getElementById('total-preview');

    if (rate > 0 && duration > 0) {
        const total = (rate * duration).toFixed(2);
        preview.textContent = `Totale da impegnare: € ${total} (Pagamento garantito in Escrow)`;
    } else {
        preview.textContent = "";
    }
}

function updatePricePreview() {
    const rateInput = document.getElementById('ann-salary');
    const durationInput = document.getElementById('ann-duration');
    const previewElement = document.getElementById('calc-preview');

    if (!rateInput || !durationInput || !previewElement) return;

    const rate = parseFloat(rateInput.value) || 0;
    const duration = parseFloat(durationInput.value) || 0;
    const total = (rate * duration).toFixed(2);

    previewElement.textContent = `Totale da impegnare: € ${total}`;

    if (total > userBalance) {
        previewElement.style.color = "#ff4757";
        previewElement.textContent += " ⚠️ Saldo insufficiente!";
    } else {
        previewElement.style.color = "var(--primary)";
    }
}

async function loadMessages(jobId) {
    const body = document.getElementById('company-chat-body');
    const { data: { user } } = await supabaseClient.auth.getUser();

    // Scarichiamo la cronologia completa dal Cloud
    const { data: msgs, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('announcement_id', jobId)
        .order('created_at', { ascending: true });

    if (error) return;

    body.innerHTML = '';
    msgs.forEach(m => {
        const isMe = m.sender_id === user.id;
        const ora = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isMe ? 'user' : 'company'} glass`;

        // Struttura stile WhatsApp con orario
        msgDiv.innerHTML = `
            <div class="msg-content">${sanitizeInput(m.content)}</div>
            <span class="msg-timestamp">${ora}</span>
        `;
        body.appendChild(msgDiv);
    });

    body.scrollTop = body.scrollHeight;
}

async function clearChat(jobId) {
    if (!confirm("Vuoi cancellare i tuoi messaggi in questa chat?")) return;

    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error } = await supabaseClient
        .from('messages')
        .delete()
        .eq('announcement_id', jobId)
        .eq('sender_id', user.id); // Cancella solo i messaggi inviati da me

    if (error) {
        showToast("Errore: " + error.message, "error");
    } else {
        loadMessages(jobId); // Aggiorna la finestra chat
    }
}

// Funzione dedicata per il modale (se necessario)
async function sendModalCompanyMessage() {
    const input = document.getElementById('modal-company-chat-input');
    const msg = input.value.trim();
    if (!msg || !currentChatCompany) return;

    // Riutilizziamo la logica di invio adattandola
    // Per ora facciamo l'invio standard
    input.value = '';
    // ... logica aggiuntiva ...
}