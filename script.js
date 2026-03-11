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
    if (supabaseClient) {
        console.log('ℹ️ Supabase client già inizializzato, skip.');
        return supabaseAvailable;
    }
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

        // Auth state listener: aggiorna UI subito dopo login/logout/refresh token
        try {
            supabaseClient.auth.onAuthStateChange(async (_event, session) => {
                try {
                    const user = session?.user || null;
                    if (typeof updateUI === 'function') updateUI(user);

                    // Bounce tracking mitigation: pulisce l'URL dal token dopo login
                    if (user && window.location.hash.includes('access_token')) {
                        try {
                            // Rimuovi il token dall'URL per evitare bounce tracking warnings
                            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
                            console.log('🧹 URL pulita da token OAuth per bounce tracking mitigation');
                        } catch (e) {
                            console.warn('Impossibile pulire URL:', e);
                        }
                    }
                } catch (e) {
                    console.warn('onAuthStateChange handler error:', e?.message || e);
                }
            });
        } catch (e) {
            console.warn('Impossibile registrare onAuthStateChange:', e?.message || e);
        }

        // Pulisce l'URL da #access_token dopo OAuth (Supabase legge prima i parametri, poi noi ripuliamo)
        try {
            if (window.location.hash && window.location.hash.includes('access_token')) {
                setTimeout(() => {
                    try {
                        const cleanUrl = window.location.pathname + window.location.search;
                        window.history.replaceState(null, document.title, cleanUrl);
                    } catch (e) {
                        // ignore
                    }
                }, 800);
            }
        } catch (e) {
            // ignore
        }

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

function updateUI(user) {
    if (!user) {
        try { localStorage.removeItem('isLoggedIn'); } catch (e) {}
        showView('auth-view');
        return;
    }

    const metadata = user.user_metadata || {};
    const displayName = metadata.full_name || user.email || 'Utente';
    const avatarUrl = metadata.avatar_url || '';

    try {
        const existing = JSON.parse(localStorage.getItem('userData')) || {};
        const merged = {
            ...existing,
            id: user.id,
            email: user.email,
            display_name: displayName,
            name: existing.name || displayName,
            avatar_url: existing.avatar_url || avatarUrl
        };
        localStorage.setItem('userData', JSON.stringify(merged));
        localStorage.setItem('isLoggedIn', 'true');
    } catch (e) {}

    showView('app-view');
    if (typeof updateSidebar === 'function') updateSidebar();
    if (typeof renderUserProfile === 'function') renderUserProfile();
}

function togglePassword(inputId, iconEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (iconEl) iconEl.textContent = isPassword ? '🔒' : '👁️';
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
        // Auto-check login status after OAuth redirect (e.g., after Google login)
        setTimeout(() => checkAutoLoginAfterRedirect(), 300);
    });
} else {
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

// --- SISTEMA BANNER ---
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
let userMarker = null;

async function findJobsNearMe() {
    if (!navigator.geolocation) {
        showToast("Il tuo browser non supporta la geolocalizzazione", "error");
        return;
    }

    showToast("Ricerca della tua posizione...");
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        if (map) {
            map.setView([latitude, longitude], 14);

            // Rimuove vecchio marker utente se presente
            if (userMarker) map.removeLayer(userMarker);

            // Crea Marker Utente speciale (pulsante e rotondo)
            const userIcon = L.divIcon({
                html: `<div style="background:var(--secondary); width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 0 15px rgba(52, 152, 219, 0.8); color:white; font-size:1.2rem; animation: pulse-blue 2s infinite;">🧍</div>`,
                className: 'custom-user-icon',
                iconSize: [35, 35],
                iconAnchor:[17, 17]
            });

            userMarker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map)
                .bindPopup('<div style="color:black; font-weight:bold; text-align:center;">Tu sei qui<br><small>La tua posizione attuale</small></div>');
        }

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
        // Controlliamo se c'è una sessione attiva PRIMA di chiedere i dati
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            list.innerHTML = '<p style="color: var(--text-dim);">Effettua il login per vedere i movimenti.</p>';
            return;
        }

        const { data: trans, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

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
        console.warn("Avviso transazioni:", e.message);
    }
}

// --- 3. INIZIALIZZAZIONE ALL'AVVIO ---
// --- 3. INIZIALIZZAZIONE ALL'AVVIO ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("App avviata...");
    // Avvio delle funzioni principali
    try {
        initSupabase();
        setupSignupLiveValidation();
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

            // ... dentro checkLoginStatus ...
            if (profile) {
                // Carichiamo i saldi
                userBalance = parseFloat(profile.balance) || 0;
                frozenBalance = parseFloat(profile.frozen_balance) || 0;

                // --- NUOVA PARTE: Caricamento contratti dal DB ---
                const { data: contracts } = await supabaseClient
                    .from('contracts')
                    .select('job_id')
                    .eq('worker_id', user.id)
                    .eq('status', 'active');

                if (contracts) {
                    // Popoliamo l'array globale con gli ID dei lavori accettati
                    acceptedContracts = contracts.map(c => c.job_id);
                }
                // ------------------------------------------------
                
                // Procedi con il resto della funzione
                showView('app-view');
                updateSidebar(); 
                loadAnnouncementsFromDB();
                renderUserProfile();
                updateChatList(); // Aggiorna la lista chat basandosi sui contratti reali
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

// Google Authentication (LEGACY - non usare)
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
        // Prima prova con l'indirizzo completo
        let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        let data = await response.json();
        
        if (data && data.length > 0) {
            // Indirizzo trovato!
            return { 
                lat: parseFloat(data[0].lat), 
                lng: parseFloat(data[0].lon) 
            };
        }
        
        // Fallback: prova solo con la città se l'indirizzo completo non funziona
        const addressParts = address.split(',');
        if (addressParts.length > 1) {
            const cityOnly = addressParts[addressParts.length - 1].trim();
            console.log(`Indirizzo completo non trovato, provo con città: ${cityOnly}`);
            
            response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityOnly)}`);
            data = await response.json();
            
            if (data && data.length > 0) {
                return { 
                    lat: parseFloat(data[0].lat), 
                    lng: parseFloat(data[0].lon) 
                };
            }
        }
        
        // Fallback finale: prova solo la prima parte dell'indirizzo
        const firstPart = addressParts[0].trim();
        console.log(`Provo con prima parte indirizzo: ${firstPart}`);
        
        response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(firstPart)}`);
        data = await response.json();
        
        if (data && data.length > 0) {
            return { 
                lat: parseFloat(data[0].lat), 
                lng: parseFloat(data[0].lon) 
            };
        }
        
        // Indirizzo NON trovato dopo tutti i tentativi
        console.warn("Impossibile geocodificare l'indirizzo:", address);
        return null; 
    } catch (e) { 
        console.error("Errore Geocoding:", e); 
        return null;
    }
}

function showSection(sectionId) {
    // 1. Nasconde tutte le sezioni di contenuto
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    
    // 2. Mostra solo quella cliccata
    const target = document.getElementById(sectionId);
    if (target) target.classList.remove('hidden');

    // 3. Gestisce la classe "active" nei tasti della sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === sectionId) {
            item.classList.add('active');
        }
    });

    // 4. Se è la mappa, forziamo il ricalcolo delle dimensioni
    if (sectionId === 'map-section' && map) {
        setTimeout(() => map.invalidateSize(), 200);
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

// Funzioni wrapper per compatibilità
function openCreateModal() {
    showModal('create-annuncio-modal');
}

function closeCreateModal() {
    closeModal('create-annuncio-modal');
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
            attribution: ' OpenStreetMap'
            }).addTo(map)
            .on('tileerror', function (error, tile) {
                console.warn('Tile error:', error);
                // Mostra un messaggio utente leggibile solo la prima volta
                showToast('Problema rete: impossibile caricare alcune tessere della mappa. Verifica la tua connessione o riprova più tardi.', 'warning');
            });
        
        // Forza il ricalcolo finale
        map.invalidateSize();
        
        // IMPORTANT: Chiama syncMapMarkers SOLO dopo che la mappa è completamente inizializzata
        console.log(" Mappa inizializzata con successo, chiamo syncMapMarkers");
        syncMapMarkers(annunci);
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
        // Non chiamare syncMapMarkers qui - verrà chiamata da initMap
        return;
    }

    filtered.forEach(ann => {
        // --- LOGICA MODIFICATA: Controllo tramite ID per sicurezza totale ---
        const isAuthor = ann.authorId === currentUserId;
        const isAccepted = acceptedContracts.includes(ann.id);

        const card = document.createElement('div');
        card.className = `annuncio-card glass ${isAccepted ? 'accepted' : ''}`;
        card.id = `annuncio-${ann.id}`;
        card.onclick = () => {
            openAnnuncioDetails(ann.id);
            // FlyTo animation per centrare la mappa sull'annuncio
            if (map && ann.lat && ann.lng) {
                map.flyTo([ann.lat, ann.lng], 15, {
                    duration: 1.5,
                    easeLinearity: 'linear'
                });
            }
        };

        // Build card content safely using textContent for user input fields
        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';

        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header';

        const categoryTag = document.createElement('span');
        categoryTag.className = 'category-tag';
        categoryTag.textContent = ann.category;
        cardHeader.appendChild(categoryTag);

        const authorTag = document.createElement('div');
        authorTag.className = 'author-tag';

        const authorImg = document.createElement('img');
        authorImg.src = ann.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100';
        authorImg.className = 'author-logo';
        authorTag.appendChild(authorImg);

        const authorText = document.createTextNode(sanitizeInput(ann.author));
        authorTag.appendChild(authorText);

        cardHeader.appendChild(authorTag);
        cardContent.appendChild(cardHeader);

        const titleEl = document.createElement('h3');
        titleEl.textContent = sanitizeInput(ann.title);
        cardContent.appendChild(titleEl);

        const descEl = document.createElement('p');
        descEl.style.display = '-webkit-box';
        descEl.style.webkitLineClamp = '3';
        descEl.style.webkitBoxOrient = 'vertical';
        descEl.style.overflow = 'hidden';
        descEl.textContent = sanitizeInput(ann.description);
        cardContent.appendChild(descEl);

        const cardFooter = document.createElement('div');
        cardFooter.className = 'card-footer';

        const salaryEl = document.createElement('strong');
        salaryEl.textContent = `${userCurrency} ${ann.salary.replace(/[^0-9.]/g, '')}`;
        cardFooter.appendChild(salaryEl);

        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.flexDirection = 'column';
        actionsDiv.style.gap = '0.5rem';
        actionsDiv.style.alignItems = 'flex-end';

        if (isAuthor) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-primary';
            deleteBtn.style.width = 'auto';
            deleteBtn.style.padding = '0.5rem 1rem';
            deleteBtn.style.background = '#ff4d4d';
            deleteBtn.style.color = 'white';
            deleteBtn.textContent = '🗑️ Elimina';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteAnnuncio(ann.id);
            };
            actionsDiv.appendChild(deleteBtn);
        } else {
            const actionsInnerDiv = document.createElement('div');
            actionsInnerDiv.style.display = 'flex';
            actionsInnerDiv.style.gap = '0.5rem';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn-primary';
            toggleBtn.style.width = 'auto';
            toggleBtn.style.padding = '0.5rem 1rem';
            toggleBtn.textContent = isAccepted ? 'Attivo' : 'Accetta';
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                toggleContract(ann.id);
            };
            actionsInnerDiv.appendChild(toggleBtn);

            if (isAccepted) {
                const revokeBtn = document.createElement('button');
                revokeBtn.className = 'btn-primary';
                revokeBtn.style.width = 'auto';
                revokeBtn.style.padding = '0.5rem 1rem';
                revokeBtn.style.background = '#ffb347';
                revokeBtn.style.color = 'white';
                revokeBtn.title = 'Revoca';
                revokeBtn.textContent = '🚩';
                revokeBtn.onclick = (e) => {
                    e.stopPropagation();
                    openRevokeModal(ann.id);
                };
                actionsInnerDiv.appendChild(revokeBtn);
            } else {
                const hideBtn = document.createElement('button');
                hideBtn.className = 'btn-primary';
                hideBtn.style.width = 'auto';
                hideBtn.style.padding = '0.5rem 1rem';
                hideBtn.style.background = 'var(--text-dim)';
                hideBtn.style.color = 'white';
                hideBtn.title = 'Nascondi';
                hideBtn.textContent = '🚫';
                hideBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideAnnuncio(ann.id);
                };
                actionsInnerDiv.appendChild(hideBtn);
            }

            actionsDiv.appendChild(actionsInnerDiv);
        }

        cardFooter.appendChild(actionsDiv);
        cardContent.appendChild(cardFooter);

        card.appendChild(cardContent);
        grid.appendChild(card);
    });

    // Non chiamare syncMapMarkers qui - verrà chiamata da initMap
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

async function rechargeBalance() {
    if (!ensureSupabase()) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        showToast("Devi essere loggato per ricaricare!", "error");
        return;
    }

    const incremento = 500;
    const nuovoSaldo = userBalance + incremento;

    // 1. Aggiorna il Database (Tabella Profiles)
    const { error } = await supabaseClient
        .from('profiles')
        .update({ balance: nuovoSaldo })
        .eq('id', user.id);

    if (error) {
        console.error("Errore ricarica:", error);
        showToast("Errore durante la ricarica sul server", "error");
        return;
    }

    // 2. Se il DB è aggiornato, aggiorna la UI locale
    userBalance = nuovoSaldo;
    localStorage.setItem('userBalance', userBalance); // Fallback locale
    
    renderUserProfile();
    updateSidebar();
    
    showToast(`Saldo ricaricato con successo di €${incremento.toFixed(2)}! 💰`, "success");
    
    // Registra la transazione nel log per trasparenza
    await logTransaction(incremento, "Ricarica Account (Bonus Test)");
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

    showToast("Contratto revocato. I fondi sono stati riaccreditati.", "success");
    closeRevokeModal();
}

function syncMapMarkers(filteredAnnunci) {
    console.log("🗺️ syncMapMarkers chiamata con", filteredAnnunci.length, "annunci");
    console.log("🗺️ Dati annunci:", filteredAnnunci);
    console.log("🗺️ Mappa inizializzata:", !!map);
    
    if (!map) {
        console.error("🗺️ ERRORE: Mappa non inizializzata!");
        return;
    }

    // Rimuovi marker esistenti
    markers.forEach(m => map.removeLayer(m));
    markers =[];
    console.log("🗺️ Marker vecchi rimossi");

    filteredAnnunci.forEach((ann, index) => {
        console.log(`🗺️ Elaborando annuncio ${index + 1}:`, ann.title, "coord:", ann.lat, ann.lng);
        
        const isPremium = ann.isPremium;
        const borderColor = isPremium ? '#dcaa25' : '#2C3E50'; // Premium = Oro, Base = Blu scuro elegante

        // 1. DEFINIAMO hasPhoto PER EVITARE IL CRASH
        const hasPhoto = ann.authorAvatar && ann.authorAvatar.trim() !== '';

        // 2. Impostiamo l'URL dell'avatar solo se c'è, altrimenti usiamo un placeholder
        const avatarUrl = hasPhoto ? ann.authorAvatar : 'https://via.placeholder.com/50';
        
        // 3. Creazione del PIN sulla mappa (marker)
        const customIcon = L.divIcon({
            className: 'custom-user-marker',
            html: `<div class="marker-container" style="border-color: ${borderColor}">
                      <img src="${avatarUrl}" class="marker-avatar" style="${!hasPhoto ? 'display:none;' : ''}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                      <div class="marker-fallback" style="${hasPhoto ? 'display:none;' : 'display:flex;'}">${getInitials(ann.author || 'Utente')}</div>
                      <div class="marker-edge" style="border-top-color: ${borderColor}"></div>
                   </div>`,
            iconSize: [45, 45],
            iconAnchor:[22, 45],
            popupAnchor: [0, -40]
        });

        // 4. Creazione del Popup al click
        const popupContent = `
            <div class="custom-popup glass">
                <div class="popup-header">
                    <div class="popup-user-info">
                        ${hasPhoto ? 
                            `<img src="${ann.authorAvatar}" alt="${ann.author}" class="popup-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                             <div class="popup-avatar-fallback" style="display:none;">${getInitials(ann.author || 'Utente')}</div>` :
                            `<div class="popup-avatar-fallback">${getInitials(ann.author || 'Utente')}</div>`
                        }
                        <div class="popup-user-details">
                            <h3 class="popup-title">${sanitizeInput(ann.title)}</h3>
                            <p class="popup-author">${sanitizeInput(ann.author || 'Utente')}</p>
                        </div>
                    </div>
                    ${isPremium ? '<div class="premium-badge-popup">💎</div>' : ''}
                </div>
                <div class="popup-body">
                    <div class="popup-price">
                        <span class="price-label">Compenso:</span>
                        <span class="price-value">${sanitizeInput(ann.salary)}</span>
                    </div>
                    <div class="popup-location">
                        📍 ${sanitizeInput(ann.address || ann.city || 'Posizione non specificata')}
                    </div>
                </div>
                <div class="popup-footer">
                    <button class="btn-primary popup-btn" onclick="openAnnuncioDetails(${ann.id})">
                        Vedi Dettagli
                    </button>
                </div>
            </div>
        `;

        try {
            const marker = L.marker([ann.lat, ann.lng], { icon: customIcon }).addTo(map)
                .bindPopup(popupContent, {
                    maxWidth: 280,
                    className: 'custom-leaflet-popup'
                });
            
            markers.push(marker);
            console.log(`🗺️ ✅ Marker aggiunto per ${ann.title} a [${ann.lat}, ${ann.lng}]`);
        } catch (error) {
            console.error(`🗺️ ❌ Errore aggiungendo marker per ${ann.title}:`, error);
        }
    });
    
    console.log(`🗺️ syncMapMarkers completata. Total marker: ${markers.length}`);
}
async function createAnnuncio() {
    const btn = document.getElementById('create-annuncio-submit');
    const title = document.getElementById('ann-title').value.trim();
    const rate = parseFloat(document.getElementById('ann-salary').value) || 0;
    const duration = parseFloat(document.getElementById('ann-duration').value) || 1;
    const desc = document.getElementById('ann-desc').value.trim();
    const address = document.getElementById('ann-address').value;
    const category = document.getElementById('ann-category').value;
    const imageFile = document.getElementById('ann-image').files[0]; // Prende il file vero e proprio

    if (!title || rate <= 0 || !address) {
        showToast("⚠️ Compila i campi obbligatori!", "warning");
        return;
    }

    // Fix 409: Blocca immediatamente il pulsante per evitare doppio click
    btn.disabled = true;
    btn.textContent = "Creazione in corso...";

    try {
        let finalImageUrl = "";

        // 1. SE C'È UNA FOTO, CARICALA SULLO STORAGE
        if (imageFile) {
            const fileName = `${Date.now()}_${imageFile.name}`; // Nome unico per la foto
            
            const { data: uploadData, error: uploadError } = await supabaseClient
                .storage
                .from('announcements') // Nome del bucket creato in Fase 1
                .upload(fileName, imageFile);

            if (uploadError) throw uploadError;

            // Prendi l'indirizzo internet (URL) della foto appena caricata
            const { data: urlData } = supabaseClient
                .storage
                .from('announcements')
                .getPublicUrl(fileName);

            finalImageUrl = urlData.publicUrl;
        }

        // 2. RECUPERA LE COORDINATE
        const coords = await getCoordinates(`${address}, Bologna`);

        // 3. SALVA L'ANNUNCIO NEL DATABASE (con il link della foto)
        const { error } = await supabaseClient.rpc('create_announcement_safe', {
            arg_title: title,
            arg_description: desc,
            arg_category: category,
            arg_rate: Number(rate),
            arg_duration: Number(duration),
            arg_time_unit: document.getElementById('ann-time-unit').value,
            arg_address: address,
            arg_lat: Number(coords ? coords.lat : 44.4949),
            arg_lng: Number(coords ? coords.lng : 11.3426),
            arg_image_url: finalImageUrl // Qui salviamo solo il LINK (es. https://supabase.co/foto.jpg)
        });

        if (error) {
            if (error.code === '409') {
                showToast("Operazione già in corso o saldo insufficiente.", "warning");
                return;
            }
            throw error;
        }

        showToast("Annuncio pubblicato! 🚀", "success");
        closeCreateModal();
        loadAnnouncementsFromDB(); // Aggiorna la bacheca

    } catch (err) {
        console.error(err);
        if (err && err.code === '409') {
            showToast("Operazione già in corso o saldo insufficiente.", "warning");
            return;
        }
        showToast("Errore durante la pubblicazione", "error");
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

async function toggleContract(id) {
    if (!ensureSupabase()) return;
    const jobId = Number(id);
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const ann = annunci.find(a => a.id === jobId);

    const { error } = await supabaseClient
        .from('contracts')
        .insert([{ job_id: jobId, worker_id: user.id, status: 'active' }]);

    if (error) {
        showToast("Hai già accettato questo contratto!", "warning");
        return;
    }

    // GENERIAMO IL MESSAGGIO AUTOMATICO
    const msgConferma = `🤝 Ho accettato il lavoro! Il sistema ha confermato l'impegno dei fondi (${ann.salary}).`;
    await sendSystemMessage(jobId, ann.authorId, msgConferma);

    acceptedContracts.push(jobId);
    showToast("Contratto accettato e messaggio inviato!", "success");
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
        // Fix 406: remove .single() and use array handling with fallbacks
        const { data: annData } = await supabaseClient
            .from('announcements')
            .select('title, author_id')
            .eq('id', info.jobId);

        const { data: partnerData } = await supabaseClient
            .from('profiles')
            .select('display_name')
            .eq('id', info.partnerId);

        const chatName = (Array.isArray(partnerData) && partnerData.length > 0) ? partnerData[0].display_name : "Utente";
        const jobTitle = (Array.isArray(annData) && annData.length > 0) ? annData[0].title : "Lavoro";
        const isOwner = (Array.isArray(annData) && annData.length > 0) ? annData[0].author_id === user.id : false;

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

async function openCompanyChat(chat) {
    currentChatCompany = chat;

    // Sezione Messaggi: attiviamo la finestra
    const chatWindow = document.getElementById('company-chat-window');
    if (chatWindow) chatWindow.classList.add('active');

    // Aggiorna Nome e Titolo Lavoro nell'header
    const partnerName = document.getElementById('chat-partner-name');
    if (partnerName) partnerName.textContent = chat.name;
    const jobTitleLabel = document.getElementById('chat-job-title');
    if (jobTitleLabel) jobTitleLabel.textContent = chat.jobTitle;

     // --- NUOVA LOGICA: Controllo stato contratto per nascondere i tasti ---
    const releaseBtn = document.getElementById('btn-release-payment');
    const reportBtn = document.getElementById('btn-report-job');
    const reviewBtn  = document.getElementById('btn-review-job');

    // Recuperiamo lo stato dal database
    const { data: contract } = await supabaseClient
        .from('contracts')
        .select('status')
        .eq('job_id', chat.jobId)
        .maybeSingle();

    // 1. Se sei Owner e il contratto NON è completato -> Mostra Paga / Segnala
    if (chat.isOwner && contract) {
        if (contract.status !== 'completed') {
            releaseBtn?.classList.remove('hidden');
            reportBtn?.classList.remove('hidden');
            reviewBtn?.classList.add('hidden');
        } else {
            // Contratto completato -> L'Owner può recensire il lavoratore
            releaseBtn?.classList.add('hidden');
            reportBtn?.classList.add('hidden');
            reviewBtn?.classList.remove('hidden');
        }
    } 
    // 2. Se NON sei l'owner (sei il lavoratore) e il contratto è completato -> Puoi recensire l'azienda
    else if (!chat.isOwner && contract && contract.status === 'completed') {
        releaseBtn?.classList.add('hidden');
        reportBtn?.classList.add('hidden');
        reviewBtn?.classList.remove('hidden');
    } 
    // 3. Situazioni in corso per il lavoratore o altri stati
    else {
        releaseBtn?.classList.add('hidden');
        reportBtn?.classList.add('hidden');
        reviewBtn?.classList.add('hidden');
    }
    // ---------------------------------------------------------------------

    // Caricamento messaggi reali dalla cronologia Cloud
    loadMessages(chat.jobId);

    // MOSTRA IL TASTO CESTINO
    const clearBtn = document.getElementById('btn-clear-chat');
    if (clearBtn) clearBtn.classList.remove('hidden');
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

// AUTH & REGISTRAZIONE: Funzioni di validazione

function validateEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Live validation helpers
function validateEmailLive(value) {
    if (!value) return null;
    return validateEmail(value) ? null : "Formato email non valido (es: mario@email.it)";
}

function validateConfirmLive(value, password) {
    if (!value || !password) return null;
    return value === password ? null : "Le password non coincidono";
}

function validateSurnameLive(value) {
    if (!value) return null;
    return value.trim().length >= 2 ? null : "Il cognome deve avere almeno 2 caratteri";
}

function validateCountryLive(value) {
    if (!value) return null;
    // Lista di paesi validi semplificata
    const validCountries =['italia', 'italy', 'francia', 'france', 'germania', 'germany', 'spagna', 'spain', 'regno unito', 'uk', 'united kingdom', 'svizzera', 'switzerland'];
    return validCountries.includes(value.toLowerCase().trim()) ? null : "Paese non supportato o errato";
}

function validateCityZipLive(city, zip) {
    // Gestione sicura nel caso uno dei due campi sia null o undefined
    const c = city ? city.trim() : '';
    const z = zip ? zip.trim() : '';
    
    if (c.length > 0 && z.length === 0) return "Hai inserito la città, manca il CAP";
    if (z.length > 0 && c.length === 0) return "Hai inserito il CAP, manca la città";
    
    // Il CAP deve essere ESATTAMENTE di 5 cifre numeriche
    if (z.length > 0 && !/^\d{5}$/.test(z)) return "Il CAP deve contenere esattamente 5 numeri (es. 40121)";
    
    return null;
}

function validateBirthLive(value) {
    if (!value) return null;
    
    const birthDate = new Date(value);
    // Controllo se la data è valida
    if (isNaN(birthDate.getTime())) return "Data non valida";
    
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    if (age < 14) return `Devi avere almeno 14 anni (ne hai calcolati ${age})`;
    if (age > 100) return "Data di nascita non plausibile"; // Evita anni come 1800
    
    return null;
}



function getCurrencySymbol(country) {
    const c = country.toLowerCase().trim();
    if (c === 'italia' || c === 'italy' || c === 'germania' || c === 'francia' || c === 'spagna' || c === 'europa') return '€';
    if (c === 'uk' || c === 'regno unito' || c === 'inghilterra') return '£';
    if (c === 'giappone' || c === 'japan' || c === 'cina' || c === 'china') return '¥';
    if (c === 'svizzera' || c === 'switzerland') return 'CHF';
    return '€'; // Default
}

async function signup() {
    const email = (document.getElementById('reg-email')?.value || '').trim();
    const password = document.getElementById('reg-password')?.value || '';
    const confirm = document.getElementById('reg-confirm')?.value || '';
    const name = (document.getElementById('reg-name')?.value || '').trim();
    const surname = (document.getElementById('reg-surname')?.value || '').trim();
    const birth = (document.getElementById('reg-birth')?.value || '').trim();
    const city = (document.getElementById('reg-city')?.value || '').trim();
    const zip = (document.getElementById('reg-zip')?.value || '').trim();
    const type = document.getElementById('reg-type').value;

    if (!email || !validateEmail(email)) {
        showToast("⚠️ Inserisci un'email valida", "warning");
        return;
    }

    if (!name || name.trim().length < 2) {
        showToast("⚠️ Inserisci il tuo nome", "warning");
        return;
    }

    if (!surname || surname.length < 2) {
        showToast("⚠️ Inserisci il tuo cognome", "warning");
        return;
    }

    // Data di nascita: minimo 14 anni
    if (!birth) {
        showToast("⚠️ Inserisci la tua data di nascita", "warning");
        return;
    }
    const birthDate = new Date(birth);
    if (Number.isNaN(birthDate.getTime())) {
        showToast("⚠️ Data di nascita non valida", "warning");
        return;
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 14) {
        showToast("⚠️ Devi avere almeno 14 anni per registrarti", "warning");
        return;
    }

    // Controllo città + CAP (devono essere coerenti: se uno è presente, anche l'altro)
    if ((city && !zip) || (!city && zip)) {
        showToast("⚠️ Inserisci sia la città che il CAP", "warning");
        return;
    }

    // Validazione CAP: 5 cifre (Italia)
    if (zip && !/^\d{5}$/.test(zip)) {
        showToast("⚠️ CAP non valido (usa 5 cifre, es. 40121)", "warning");
        return;
    }

    if (type !== 'private' && type !== 'business') {
        showToast("⚠️ Seleziona un tipo di account valido", "warning");
        return;
    }

    // 4. VALIDAZIONE PASSWORD (Nuove regole rigide)
    if (password.length < 8) {
        showToast("⚠️ La password deve avere almeno 8 caratteri", "warning");
        return;
    }
    if (!/[A-Z]/.test(password)) {
        showToast("⚠️ La password deve contenere almeno una lettera maiuscola", "warning");
        return;
    }
    if (!/\d/.test(password)) {
        showToast("⚠️ La password deve contenere almeno un numero", "warning");
        return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password)) {
        showToast("⚠️ La password deve contenere almeno un carattere speciale", "warning");
        return;
    }
    if (password !== confirm) {
        showToast("⚠️ Le password non coincidono", "warning");
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
            data: { display_name: name, user_type: type, full_name: `${name} ${surname}`.trim(), city: city, zip: zip }
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
            surname: surname,
            email: email,
            city: city,
            zip: zip,
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

    // Recuperiamo i dati salvati durante il login (che ora includono le colonne del DB)
    const data = JSON.parse(localStorage.getItem('userData')) || {};

    // 1. Rendering Informazioni Base e Business
    display.innerHTML = `
        <div class="profile-info">
            <strong>Nome:</strong> ${sanitizeInput(data.name || data.display_name) || '---'} 
            ${data.is_premium ? '<span class="premium-badge-profile" title="Membro Academy Unlimited">💎 ELITE Member</span>' : ''}
        </div>
        <div class="profile-info"><strong>Cognome:</strong> ${sanitizeInput(data.surname) || '---'}</div>
        <div class="profile-info"><strong>Email:</strong> ${sanitizeInput(data.email) || '---'}</div>
        <div class="profile-info"><strong>Città:</strong> ${sanitizeInput(data.city) || '---'}</div>
        
        ${data.type === 'business' || data.user_type === 'business' ? `
            <div class="profile-info" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border);">
                <strong>🏢 Azienda:</strong> ${sanitizeInput(data.company_name || data.companyName) || '---'}
            </div>
            <div class="profile-info"><strong>📍 Sede:</strong> ${sanitizeInput(data.company_address || data.companyAddress) || '---'}</div>
            <div class="company-tag">Account Aziendale Verificato</div>
        ` : ''}
    `;

    // 2. Rendering Link Social (Sincronizzati con Passo 3)
    const socialCont = document.getElementById('profile-social-links');
    if (socialCont) {
        socialCont.innerHTML = '';
        
        // Mappiamo le chiavi esatte che abbiamo creato nel database ( Passo 3)
        const platforms = [
            { key: 'instagram_url', icon: '📸', label: 'Instagram' },
            { key: 'x_url', icon: '🐦', label: 'X (Twitter)' },
            { key: 'facebook_url', icon: '👥', label: 'Facebook' },
            { key: 'pinterest_url', icon: '📌', label: 'Pinterest' }
        ];

        let hasSocials = false;

        platforms.forEach(p => {
            const url = data[p.key]; // Legge direttamente la colonna (es. data.instagram_url)
            
            if (url && url.trim() !== '') {
                hasSocials = true;
                const link = document.createElement('a');
                
                // Pulizia URL: aggiunge https se manca
                const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
                
                link.href = cleanUrl;
                link.target = '_blank';
                link.className = 'glass social-link-card';
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

// Aggiornamento dei riquadri CV e Certificazioni
    const cvBox = document.getElementById('profile-cv-data');
    const certBox = document.getElementById('profile-certifications-data');
    if (cvBox) cvBox.textContent = data.cv || "Nessun curriculum inserito.";
    if (certBox) certBox.textContent = data.certifications || "Nessuna certificazione inserita.";

    // Carichiamo anche i movimenti
    renderTransactions();
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

        // Recuperiamo il profilo senza .single() per evitare errore 406
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id);

        const profile = (Array.isArray(data) && data.length > 0) ? data[0] : null;

        if (error) {
            console.warn("Errore recupero profilo:", error);
        }

        // Fallback se il profilo non esiste ancora nel DB (o se la query non torna righe)
        const metadata = user.user_metadata || {};
        const fallbackProfile = {
            display_name: metadata.full_name || user.email || '',
            email: user.email || '',
            avatar_url: metadata.avatar_url || '',
            city: '',
            cv: '',
            certifications: '',
            user_type: metadata.user_type || 'private',
            company_name: '',
            company_address: ''
        };

        const effectiveProfile = profile ? { ...fallbackProfile, ...profile } : fallbackProfile;

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
        const nameParts = (effectiveProfile.display_name || "").split(' ');
        nameInput.value = nameParts[0] || "";
        surnameInput.value = nameParts.slice(1).join(' ') || "";

        nameInput.disabled = false;
        surnameInput.disabled = false;
        cityInput.value = effectiveProfile.city || "";
        cityInput.disabled = false;
        cvInput.value = effectiveProfile.cv || "";
        cvInput.disabled = false;
        certInput.value = effectiveProfile.certifications || "";
        certInput.disabled = false;

        // Business fields
        if (effectiveProfile.user_type === 'business') {
            document.getElementById('edit-biz-fields').classList.remove('hidden');
            if (bizNameInput) bizNameInput.value = effectiveProfile.company_name || "";
            if (bizAddrInput) bizAddrInput.value = effectiveProfile.company_address || "";
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

    // Recupero valori dagli input del modale
    const newName = document.getElementById('edit-name').value;
    const newSurname = document.getElementById('edit-surname').value;
    const newCity = document.getElementById('edit-city').value;
    const newCv = document.getElementById('edit-cv').value;
    const newCertifications = document.getElementById('edit-certifications').value;

    // Dati Social
    const socialData = {
        instagram_url: document.getElementById('edit-instagram').value,
        x_url: document.getElementById('edit-x').value,
        facebook_url: document.getElementById('edit-facebook').value,
        pinterest_url: document.getElementById('edit-pinterest').value
    };

    let profileUpdates = {
        display_name: `${newName} ${newSurname}`.trim(),
        city: newCity,
        cv: newCv,
        certifications: newCertifications,
        ...socialData // Uniamo i social ai dati del profilo
    };

    try {
        // 1. Aggiorna Tabella Profiles (TUTTI i dati, inclusi social)
        const { error: pErr } = await supabaseClient
            .from('profiles')
            .update(profileUpdates)
            .eq('id', user.id);
        
        if (pErr) throw pErr;

        // 2. Opzionale: Aggiorna anche metadata di Auth (per coerenza sessione)
        await supabaseClient.auth.updateUser({
            data: { socials: socialData }
        });

        showToast("Profilo e Social aggiornati con successo!", "success");
        closeModal('edit-account-modal');
        checkLoginStatus(); // Ricarica i dati per aggiornare la UI
    } catch (err) {
        console.error("Errore aggiornamento:", err);
        showToast("Errore durante il salvataggio dei dati", "error");
    }
}



async function handleAvatarUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        showToast("Caricamento foto profilo...", "info");

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            const fileName = `avatars/${user.id}_${Date.now()}.png`;

            // 1. Carica su Storage
            const { error: uploadError } = await supabaseClient
                .storage
                .from('announcements') // Usiamo lo stesso bucket o creane uno 'avatars'
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            // 2. Prendi URL
            const { data: urlData } = supabaseClient.storage.from('announcements').getPublicUrl(fileName);
            const publicUrl = urlData.publicUrl;

            // 3. Aggiorna Tabella Profiles
            await supabaseClient.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);

            // Aggiorna UI
            document.getElementById('profile-avatar-big').src = publicUrl;
            document.getElementById('user-avatar').src = publicUrl;
            showToast("Foto profilo aggiornata!", "success");

        } catch (err) {
            console.error(err);
            showToast("Errore durante il caricamento foto", "error");
        }
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

// --- SISTEMA EVENT LISTENERS (Sicurezza CSP) ---
window.openReviewFromChat = function() {
    if (currentChatCompany && currentChatCompany.jobId) {
        openReviewModal(currentChatCompany.jobId);
    }
};

function initEventListeners() {
    console.log("🔧 Inizializzazione Event Listeners...");

    // 1. Auth Events
    const loginBtn = document.getElementById('btn-login-submit');
    if (loginBtn) loginBtn.addEventListener('click', login);

    const googleBtn = document.getElementById('btn-google-login');
    if (googleBtn) googleBtn.addEventListener('click', loginWithGoogle);

    const signupBtn = document.querySelector('.btn-signup'); 
    if (signupBtn) signupBtn.addEventListener('click', signup);

    // 2. Navigazione Sidebar (Logica Automatica data-section)
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');
            showSection(sectionId);
        });
    });

    // 3. Azioni Profilo
    const rechargeBtn = document.getElementById('btn-recharge-balance');
    if (rechargeBtn) rechargeBtn.addEventListener('click', rechargeBalance);

    const editAccountBtn = document.getElementById('btn-edit-account');
    if (editAccountBtn) editAccountBtn.addEventListener('click', openEditAccountModal);

    const logoutBtn = document.querySelector('button[onclick="logout()"]');
    if (logoutBtn) {
        logoutBtn.removeAttribute('onclick');
        logoutBtn.addEventListener('click', logout);
    }

    // 4. Azioni Annunci (Apertura e Pubblicazione)
    
    // Bottone per APRIRE il modal (+ Crea Annuncio)
    const openModalBtn = document.querySelector('button[onclick="openCreateModal()"]');
    if (openModalBtn) {
        openModalBtn.removeAttribute('onclick');
        openModalBtn.addEventListener('click', openCreateModal);
    }

    // --- COSA ABBIAMO AGGIUNTO PER FAR FUNZIONARE IL TASTO PUBBLICA ---
    const submitAnnuncioBtn = document.getElementById('create-annuncio-submit');
    if (submitAnnuncioBtn) {
        console.log("✅ Listener collegato al tasto Pubblica");
        submitAnnuncioBtn.addEventListener('click', createAnnuncio);
    }

    // Bottone ANNULLA dentro il modal (per chiuderlo)
    const cancelAnnBtn = document.querySelector('#create-annuncio-modal .btn-primary[style*="text-dim"]');
    if (cancelAnnBtn) {
        cancelAnnBtn.addEventListener('click', closeCreateModal);
    }

    // 5. Altre Azioni Mappa
    const findJobsBtn = document.querySelector('button[onclick="findJobsNearMe()"]');
    if (findJobsBtn) {
        findJobsBtn.removeAttribute('onclick');
        findJobsBtn.addEventListener('click', findJobsNearMe);
    }
}

// Chiamiamo la funzione quando il DOM è pronto
document.addEventListener('DOMContentLoaded', initEventListeners);

// Aggiungi questo dentro initEventListeners() o in fondo al file script.js
function setupNavigation() {
    // Seleziona tutti gli elementi della sidebar che hanno l'attributo data-section
    const navItems = document.querySelectorAll('.nav-item[data-section]');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Legge il valore dell'attributo (es. "map-section")
            const sectionId = item.getAttribute('data-section');
            
            // Chiama la funzione per cambiare schermata
            showSection(sectionId);
        });
    });
}

// Assicurati di chiamarla al caricamento
document.addEventListener('DOMContentLoaded', setupNavigation);

async function sendSystemMessage(jobId, partnerId, text) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    await supabaseClient.from('messages').insert([{
        announcement_id: jobId,
        sender_id: user.id, // Il sistema usa l'ID dell'utente che compie l'azione
        receiver_id: partnerId,
        content: text,
        is_system: true // Opzionale: aggiungi una colonna boolean 'is_system' se vuoi uno stile diverso
    }]);
}

async function releasePayment() {
    if (!ensureSupabase()) return;
    if (!currentChatCompany || !currentChatCompany.jobId) {
        showToast("Seleziona una chat valida prima di pagare.", "error");
        return;
    }

    const jobId = currentChatCompany.jobId;
    const workerId = currentChatCompany.partnerId;

    const ann = annunci.find(a => a.id === Number(jobId));
    if (!ann) {
        showToast("Impossibile trovare l'annuncio.", "error");
        return;
    }

    // Puliamo il prezzo per avere solo il numero
    const amount = parseFloat(ann.salary.toString().replace(/[^0-9.]/g, '')) || 0;

    if (!confirm(`Confermi il rilascio di €${amount.toFixed(2)} a ${currentChatCompany.name}?`)) return;

     try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        const { error } = await supabaseClient.rpc('release_escrow_payment', {
            p_employer_id: user.id,
            p_worker_id: workerId,
            p_job_id: Number(jobId),
            p_amount: Number(amount)
        });

        if (error) throw error;

        // GENERIAMO IL MESSAGGIO DI FINE LAVORO
        const msgFine = `✅ Lavoro terminato correttamente. Ho rilasciato il pagamento di €${amount.toFixed(2)}. Grazie!`;
        await sendSystemMessage(jobId, workerId, msgFine);

        showToast("Pagamento inviato e lavoro completato! ✅", "success");

        // NASCONDIAMO I TASTI IMMEDIATAMENTE NELLA UI
        // NASCONDIAMO I TASTI IMMEDIATAMENTE NELLA UI
        document.getElementById('btn-release-payment').classList.add('hidden');
        document.getElementById('btn-report-job').classList.add('hidden');
        document.getElementById('btn-review-job').classList.remove('hidden'); // Appare "Lascia Recensione"

        await loadAnnouncementsFromDB();
        await checkLoginStatus(); 

    } catch (err) {
        console.error(err);
        showToast("Errore durante il saldo", "error");
    }
}


// Controllo in tempo reale se le due password coincidono
// Controllo in tempo reale dei requisiti della password
function checkPasswordRequirements() {
    const pwd = document.getElementById('reg-password').value;
    
    const lengthHint = document.getElementById('hint-length');
    const upperHint = document.getElementById('hint-upper');
    const numberHint = document.getElementById('hint-number');
    const specialHint = document.getElementById('hint-special');

    if (!lengthHint) return;

    // Regola 1: Lunghezza (Minimo 8)
    if (pwd.length >= 8) { 
        lengthHint.innerHTML = '✅ Min. 8 caratteri'; 
        lengthHint.style.color = '#4CAF50'; 
    } else { 
        lengthHint.innerHTML = '❌ Min. 8 caratteri'; 
        lengthHint.style.color = 'var(--text-dim)'; 
    }

    // Regola 2: Lettera Maiuscola
    if (/[A-Z]/.test(pwd)) { 
        upperHint.innerHTML = '✅ 1 lettera maiuscola'; 
        upperHint.style.color = '#4CAF50'; 
    } else { 
        upperHint.innerHTML = '❌ 1 lettera maiuscola'; 
        upperHint.style.color = 'var(--text-dim)'; 
    }

    // Regola 3: Numero
    if (/\d/.test(pwd)) { 
        numberHint.innerHTML = '✅ 1 numero'; 
        numberHint.style.color = '#4CAF50'; 
    } else { 
        numberHint.innerHTML = '❌ 1 numero'; 
        numberHint.style.color = 'var(--text-dim)'; 
    }

    // Regola 4: Carattere speciale
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(pwd)) { 
        specialHint.innerHTML = '✅ 1 carattere speciale (!@#$...)'; 
        specialHint.style.color = '#4CAF50'; 
    } else { 
        specialHint.innerHTML = '❌ 1 carattere speciale (!@#$...)'; 
        specialHint.style.color = 'var(--text-dim)'; 
    }

    // Controlla anche se la conferma password combacia, se l'utente la sta già digitando
    checkPasswordMatch();
}

// Controllo in tempo reale se le due password coincidono
function checkPasswordMatch() {
    const pwd = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const matchHint = document.getElementById('hint-match');
    
    if (!confirm) {
        matchHint.style.display = 'none';
        return;
    }
    
    matchHint.style.display = 'block';
    if (pwd === confirm) {
        matchHint.innerHTML = '✅ Le password coincidono';
        matchHint.style.color = '#4CAF50';
    } else {
        matchHint.innerHTML = '❌ Le password non coincidono';
        matchHint.style.color = '#ff4d4d'; // Rosso accesso per avviso
    }
}


function getInitials(name) {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function setupSignupLiveValidation() {
    console.log("🔧 setupSignupLiveValidation: inizio");
    
    // NOTA: Abbiamo rimosso reg-password e reg-confirm perché ora usano l'oninput HTML (vedi passo precedente)
    const fields =[
        { id: 'reg-email', validator: v => validateEmailLive(v), event: 'blur' },
        { id: 'reg-surname', validator: v => validateSurnameLive(v), event: 'blur' },
        { id: 'reg-country', validator: v => validateCountryLive(v), event: 'blur' },
        { id: 'reg-city', validator: v => validateCityZipLive(v, document.getElementById('reg-zip')?.value), event: 'blur' },
        { id: 'reg-zip', validator: v => validateCityZipLive(document.getElementById('reg-city')?.value, v), event: 'blur' },
        { id: 'reg-birth', validator: v => validateBirthLive(v), event: 'blur' }
    ];

    fields.forEach(({ id, validator, event }) => {
        const el = document.getElementById(id);
        if (!el) return;

        // Crea un piccolo testo di errore nascosto sotto ogni input
        let errorSpan = document.createElement('span');
        errorSpan.style.color = '#ff4d4d'; // Rosso
        errorSpan.style.fontSize = '0.8rem';
        errorSpan.style.display = 'none';
        errorSpan.style.marginTop = '4px';
        el.parentNode.appendChild(errorSpan);

        el.addEventListener(event, () => {
            const err = validator(el.value);
            if (err) {
                // Se c'è errore: bordo rosso e testo visibile
                el.style.borderColor = '#ff4d4d';
                errorSpan.textContent = "❌ " + err;
                errorSpan.style.display = 'block';
            } else if (el.value.trim() !== "") {
                // Se è corretto e non è vuoto: bordo verde e nasconde l'errore
                el.style.borderColor = '#4CAF50';
                errorSpan.style.display = 'none';
            } else {
                // Se è vuoto, resetta al colore base
                el.style.borderColor = 'var(--border)';
                errorSpan.style.display = 'none';
            }
        });
    });
    console.log("🔧 setupSignupLiveValidation: fine");
}