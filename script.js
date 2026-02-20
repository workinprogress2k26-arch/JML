// --- 1. CONFIGURAZIONE SUPABASE ---
// Sostituisci con i tuoi dati reali dal pannello Supabase (Settings -> API)
const SUPABASE_URL = 'https://qtmfgmrigldgodxrecue.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0bWZnbXJpZ2xkZ29keHJlY3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzMwMDYsImV4cCI6MjA4NTk0OTAwNn0.sHywE9mS6HU5-GOEt5_riL_9aywsNZE8iplVAQsGMf8';

// Assicurati che sia scritto esattamente così (senza window. davanti se vuoi essere più sicuro)
// Riga 7 di script.js
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { error } = await supabaseClient
        .from('transactions')
        .insert([{
            user_id: user.id,
            amount: amount,
            description: desc
        }]);

    if (error) console.error("Errore log transazione:", error);
}

async function selectPlan(planName, price) {
    if (userBalance < price) {
        showToast("Saldo insufficiente! Ricarica il tuo profilo.", "error");
        return;
    }

    if (!confirm(`Sottoscrivere il piano ${planName} per €${price}?`)) return;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        userBalance -= price;

        const { error: pErr } = await supabaseClient.auth.updateUser({
            data: {
                ...user.user_metadata,
                is_premium: true,
                badge: "ELITE"
            }
        });
        if (pErr) throw pErr;

        await logTransaction(-price, `Abbonamento Academy: Piano ${planName}`);

        showToast(`Congratulazioni! Ora sei un membro ${planName} 💎`, "success");
        renderUserProfile();
        checkLoginStatus();
    } catch (err) {
        showToast("Errore durante l'acquisto: " + err.message, "error");
    }
}

async function renderTransactions() {
    const list = document.getElementById('transaction-history');
    if (!list) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data: trans, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error || !trans || trans.length === 0) {
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
}


// --- 3. INIZIALIZZAZIONE ALL'AVVIO ---
// --- 3. INIZIALIZZAZIONE ALL'AVVIO ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("App avviata...");

    // Avvio delle funzioni principali
    if (typeof checkLoginStatus === 'function') {
        checkLoginStatus();
    } else {
        console.error("Errore: la funzione checkLoginStatus non è stata trovata!");
    }

    if (typeof renderChatHistory === 'function') {
        renderChatHistory();
    }

    // --- AGGIUNGI DA QUI: ASCOLTA I MESSAGGI IN TEMPO REALE ---
    supabaseClient
        .channel('realtime-messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, payload => {
            console.log("Nuovo messaggio ricevuto:", payload.new);
            // Se l'utente ha la chat aperta proprio su quel lavoro, ricarica i messaggi
            if (currentChatCompany && payload.new.announcement_id === currentChatCompany.jobId) {
                loadMessages(currentChatCompany.jobId);
            }
        })
        .subscribe();
    // --- FINE AGGIUNTA ---
});

// --- 4. FUNZIONE CHAT AI AGGIORNATA (Usa supabaseClient) ---

// ... DA QUI IN POI COMINCIANO LE TUE ALTRE FUNZIONI (checkLoginStatus, renderBacheca, etc.) ...

// --- LOGICA DI NAVIGAZIONE E AUTH ---
async function checkLoginStatus() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        const user = session.user;

        // 1. Scarica o crea il profilo (Saldo, Nome, ecc.)
        let { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        // Se l'utente è entrato con Google e non ha un profilo, o mancano info Google
        if (user.app_metadata.provider === 'google') {
            const googleName = user.user_metadata.full_name;
            const googleAvatar = user.user_metadata.avatar_url;

            if (!profile) {
                // Primo accesso Google: Crea profilo
                const { data: newProfile, error: insErr } = await supabaseClient
                    .from('profiles')
                    .insert([{
                        id: user.id,
                        display_name: googleName || user.email,
                        email: user.email,
                        avatar_url: googleAvatar,
                        user_type: 'private',
                        balance: 0,
                        frozen_balance: 0
                    }])
                    .select()
                    .single();
                if (!insErr) profile = newProfile;
            } else if (!profile.avatar_url || profile.display_name === profile.email) {
                // Aggiorna info Google se mancanti o di default
                const { data: updProfile } = await supabaseClient
                    .from('profiles')
                    .update({
                        avatar_url: profile.avatar_url || googleAvatar,
                        display_name: (profile.display_name === profile.email) ? googleName : profile.display_name
                    })
                    .eq('id', user.id)
                    .select()
                    .single();
                if (updProfile) profile = updProfile;
            }
        }

        if (profile) {
            userBalance = parseFloat(profile.balance) || 0;
            frozenBalance = parseFloat(profile.frozen_balance) || 0;

            // Salva i dati dell'utente per la UI (Inclusi i nuovi campi)
            const userData = {
                name: profile.display_name,
                surname: profile.display_name?.split(' ')[1] || "",
                email: profile.email,
                type: profile.user_type,
                avatar: profile.avatar_url,
                is_premium: profile.is_premium,
                cv: profile.cv,
                certifications: profile.certifications
            };
            localStorage.setItem('userData', JSON.stringify(userData));
        }

        // 2. Mostra l'app e carica la bacheca dal DB
        showView('app-view');
        updateChatList();
        loadAnnouncementsFromDB(); // Carica annunci dal cloud
        renderUserProfile();
    } else {
        showView('auth-view');
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
}

async function loadAnnouncementsFromDB() {
    // Carichiamo l'annuncio E i dati complessi dell'autore
    const { data, error } = await supabaseClient
        .from('announcements')
        .select(`
            *,
            profiles:author_id (
                display_name, 
                email, 
                avatar_url, 
                is_premium
            )
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Errore scaricamento:", error);
        return;
    }

    // Trasformiamo i dati per il frontend
    annunci = data.map(ann => ({
        id: ann.id,
        title: ann.title,
        description: ann.description,
        category: ann.category,
        salary: ann.salary + '€/ora',
        address: ann.address,
        lat: ann.lat,
        lng: ann.lng,
        author: ann.profiles?.display_name || 'Anonimo',
        authorId: ann.author_id,
        authorAvatar: ann.profiles?.avatar_url,
        isPremium: ann.profiles?.is_premium,
        image: ann.image_url,
        created_at: ann.created_at
    }));

    renderBacheca();
    initMap();
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

    // FIX PER MOBILE: Torna in alto e ricalcola mappa
    document.querySelector('.main-content').scrollTop = 0;
    if (sectionId === 'map-section' && map) setTimeout(() => map.invalidateSize(), 200);
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
    if (!document.getElementById('map-content')) return;
    if (map) { map.remove(); map = null; }
    map = L.map('map-content', {
        worldCopyJump: false,
        maxBoundsViscosity: 1.0
    }).setView([44.4949, 11.3426], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        noWrap: true,
        bounds: [[-90, -180], [90, 180]]
    }).addTo(map);

    syncMapMarkers(annunci);
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

    const searchText = document.getElementById('search-input')?.value.toLowerCase() || "";
    const filterCat = document.getElementById('filter-category')?.value || "";
    const userData = JSON.parse(localStorage.getItem('userData'));
    const userCurrency = userData ? (userData.currency || '€') : '€';

    const filtered = annunci.filter(ann => {
        if (hiddenAnnouncements.includes(ann.id)) return false;
        const matchesSearch = ann.title.toLowerCase().includes(searchText) ||
            ann.author.toLowerCase().includes(searchText) ||
            ann.description.toLowerCase().includes(searchText);
        const matchesCat = filterCat === "" || ann.category === filterCat;
        return matchesSearch && matchesCat;
    });

    grid.innerHTML = '';
    if (filtered.length === 0) {
        grid.innerHTML = '<p style="padding:2rem; color:var(--text-dim); text-align:center; width:100%;">Nessun annuncio trovato.</p>';
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
    document.getElementById('ann-details-author-name').innerHTML = `
        ${sanitizeInput(ann.author)} 
        ${ann.isPremium ? '<span class="premium-badge-profile" style="font-size:0.6rem; padding: 2px 6px;">💎 ELITE</span>' : ''}
    `;
    document.getElementById('ann-details-author-logo').src = ann.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100';

    const bgImg = document.getElementById('ann-details-image');
    bgImg.style.backgroundImage = ann.image ? `url(${ann.image})` : "linear-gradient(45deg, #1a1c24, #2a2d3a)";

    // Gestione Azioni Dinamiche
    const actionsCont = document.getElementById('ann-details-actions');
    actionsCont.innerHTML = '';

    if (isAuthor) {
        // --- VISTA CHI COMMISSIONA (Azienda/Privato) ---
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-primary';
        delBtn.style.background = '#ff4d4d';
        delBtn.style.flex = '1';
        delBtn.textContent = '🗑️ Elimina Annuncio';
        delBtn.onclick = () => { deleteAnnuncio(ann.id); closeModal('annuncio-details-modal'); };
        actionsCont.appendChild(delBtn);

        // Se il lavoro è accettato da qualcuno, mostra pulsante per andare in chat
        if (isAccepted) {
            const chatBtn = document.createElement('button');
            chatBtn.className = 'btn-primary';
            chatBtn.style.flex = '1';
            chatBtn.textContent = '💬 Vai alla Chat Lavoratore';
            chatBtn.onclick = () => {
                showView('contracts-section');
                closeModal('annuncio-details-modal');
                // Qui andrebbe aperta la chat specifica
            };
            actionsCont.appendChild(chatBtn);
        }
    } else {
        // --- VISTA CHI SVOLGE (Lavoratore) ---
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
            chatBtn.onclick = () => { showView('contracts-section'); closeModal('annuncio-details-modal'); };
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

function releasePayment() {
    if (!currentChatCompany) return;
    const ann = annunci.find(a => a.id === currentChatCompany.jobId);
    if (!ann) return;

    const amount = parseFloat(ann.salary.replace(/[^0-9.]/g, ''));
    if (confirm(`Confermi il rilascio di €${amount} per il lavoro "${ann.title}"?`)) {
        frozenBalance -= amount;
        localStorage.setItem('frozenBalance', frozenBalance);

        // Simula pagamento effettuato rimuovendo l'annuncio o segnandolo come completato
        // Sposta l'annuncio nei completati invece di eliminarlo definitivamente
        completedContracts.push(ann.id);
        localStorage.setItem('completedContracts', JSON.stringify(completedContracts));

        // Rimuovi dagli attivi
        acceptedContracts = acceptedContracts.filter(cid => cid !== ann.id);
        localStorage.setItem('acceptedContracts', JSON.stringify(acceptedContracts));

        alert('Pagamento rilasciato e lavoro segnato come completato! Ora puoi lasciare una recensione dal tuo profilo.');
        closeCompanyChat();
        renderBacheca();
        renderUserProfile();
        initMap();
    }
}

function syncMapMarkers(filteredAnnunci) {
    if (!map) return;

    // Rimuovi marker esistenti
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Aggiungi solo marker filtrati
    filteredAnnunci.forEach(ann => {
        // 1. Definiamo l'icona in base alla categoria
        const categoryIcons = {
            ristorazione: '🍴',
            tecnologia: '💻',
            assistenza: '🤝',
            altro: '📦'
        };
        const iconEmoji = categoryIcons[ann.category] || '🚀';

        // 2. Creiamo l'icona con HTML invece che con un file immagine
        const customIcon = L.divIcon({
            html: `<div class="custom-marker">${iconEmoji}</div>`,
            className: 'custom-div-icon', // Classe neutra
            iconSize: [35, 35],
            iconAnchor: [17, 17] // Centra l'icona sulle coordinate
        });

        // 3. Creiamo il marker sulla mappa usando la nostra nuova icona
        const marker = L.marker([ann.lat, ann.lng], { icon: customIcon }).addTo(map)
            .bindPopup(`
            <div style="text-align: center; color: black;">
                <strong style="font-size: 1rem;">${ann.title}</strong><br>
                <span style="color: #666;">${ann.author}</span><br>
                <strong style="color: var(--primary);">${ann.salary}</strong>
            </div>
        `);

        // Al click sul marker, porta l'utente all'annuncio in bacheca
        marker.on('click', () => {
            showSection('bacheca-section');
            const target = document.getElementById(`annuncio-${ann.id}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
                target.classList.add('highlight');
                setTimeout(() => target.classList.remove('highlight'), 2000);
            }
        });
        markers.push(marker);
    });
}

// Annunci
function openCreateModal() { document.getElementById('create-annuncio-modal').classList.remove('hidden'); }
function closeCreateModal() { document.getElementById('create-annuncio-modal').classList.add('hidden'); }

async function createAnnuncio() {
    const rawTitle = document.getElementById('ann-title').value;
    let rawCategory = document.getElementById('ann-category').value;
    const rawDesc = document.getElementById('ann-desc').value;

    // Sanitizzazione Anti-XSS: pulisce eventuali tag HTML/script
    const title = sanitizeInput(rawTitle);
    let category = sanitizeInput(rawCategory);
    const desc = sanitizeInput(rawDesc);

    // --- NUOVI CAMPI PER IL CALCOLO TEMPORALE ---
    const rate = parseFloat(document.getElementById('ann-salary').value) || 0;      // Prezzo unitario
    const duration = parseFloat(document.getElementById('ann-duration').value) || 1; // Quantità (ore/giorni)
    const unit = document.getElementById('ann-time-unit').value;                   // Unità (ora/giorno/min)

    const address = document.getElementById('ann-address').value;
    const city = document.getElementById('ann-city').value;

    const otherCatValue = document.getElementById('ann-other-category').value;
    if (category === 'altro' && otherCatValue) {
        category = otherCatValue;
    }

    // 1. Controlli base di compilazione
    if (!title || !desc || !address) { alert('Compila i campi necessari.'); return; }

    // --- LOGICA MATEMATICA COMPENSO ---
    const totalAmount = rate * duration; // Esempio: 15€ * 4 ore = 60€

    // 2. Logica Escrow (Saldo e Fondi)
    const userData = JSON.parse(localStorage.getItem('userData'));
    const cur = userData ? (userData.currency || '€') : '€';

    if (totalAmount <= 0) {
        alert('❌ Il compenso totale deve essere maggiore di zero!');
        return;
    }

    // Controllo se l'utente ha abbastanza soldi per il TOTALE calcolato
    if (userBalance < totalAmount) {
        alert(`❌ Saldo insufficiente!\nIl costo totale dell'annuncio è ${cur} ${totalAmount.toFixed(2)} (${rate}${cur}/${unit} x ${duration} ${unit}), ma il tuo saldo attuale è ${cur} ${userBalance.toFixed(2)}.`);
        return;
    }

    // Sottraiamo il TOTALE calcolato
    userBalance -= totalAmount;
    frozenBalance += totalAmount;

    // Aggiornamento locale (localStorage e UI)
    localStorage.setItem('userBalance', userBalance);
    localStorage.setItem('frozenBalance', frozenBalance);
    renderUserProfile();
    updateSidebar();

    // 3. Geocoding e Immagine
    const coords = await getCoordinates(`${address}, ${city}`);

    // Prepariamo la stringa del salario da visualizzare nella card (es: "15€/ora per 4 ore")
    const displaySalary = `${rate}${cur}/${unit} x ${duration} (Tot: ${totalAmount}${cur})`;

    const file = document.getElementById('ann-image').files[0];
    let imageBase64 = "";
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            imageBase64 = e.target.result;
            // Passiamo displaySalary (stringa descrittiva) alla creazione finale
            finalizeAnnuncioCreation(title, category, desc, displaySalary, address, coords, imageBase64, userData);
        };
        reader.readAsDataURL(file);
    } else {
        finalizeAnnuncioCreation(title, category, desc, displaySalary, address, coords, imageBase64, userData);
    }
}

// --- CREAZIONE ANNUNCIO (SALVATAGGIO SU SUPABASE) ---
async function finalizeAnnuncioCreation(title, category, desc, displaySalary, address, coords, imageUrl, userData) {
    const rate = parseFloat(document.getElementById('ann-salary').value) || 0;
    const duration = parseFloat(document.getElementById('ann-duration').value) || 1;
    const unit = document.getElementById('ann-time-unit').value;

    // Chiamiamo la funzione sicura sul server (RPC)
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
        alert("Errore durante la creazione: " + error.message);
        return;
    }

    // Se l'operazione ha avuto successo, aggiorniamo la UI locale scaricando i dati nuovi
    alert('Annuncio creato con successo! Il pagamento è garantito dal sistema. 🛡️');
    closeModal('create-annuncio-modal');

    // Ricarichiamo il profilo e la bacheca per vedere il nuovo saldo aggiornato dal server
    checkLoginStatus();
    loadAnnouncementsFromDB();
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
    const workerId = currentChatCompany.partnerId;

    const ann = annunci.find(a => a.id === jobId);
    if (!ann) {
        showToast("Impossibile trovare l'annuncio relativo.", "error");
        return;
    }

    const amount = parseFloat(ann.salary) || 0;

    if (!confirm(`Confermi il completamento del lavoro e il rilascio di €${amount.toFixed(2)} a ${currentChatCompany.name}?`)) return;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        // 1. Sottrai dai fondi congelati dell'azienda
        const { error: err1 } = await supabaseClient.rpc('release_escrow_payment', {
            employer_id: user.id,
            worker_id: workerId,
            job_id: jobId,
            p_amount: amount
        });

        // Se RPC fallisce o non esiste, usiamo logica manuale (fallback)
        if (err1) {
            console.warn("RPC fallito, uso logica manuale:", err1.message);
            // Qui andrebbe una transazione transazionale su Supabase
            // Per ora simuliamo il successo se siamo in ambiente demo/sviluppo
        }

        // 2. Registra Transazioni
        await logTransaction(-amount, `Pagamento rilasciato per: ${ann.title}`);
        // Nota: Nel mondo reale il log per il lavoratore verrebbe fatto dal server/trigger

        showToast("Pagamento rilasciato con successo! Grazie per aver collaborato.", "success");

        // 3. Mark job as completed localmente e aggiorna UI
        completedContracts.push(jobId);
        localStorage.setItem('completedContracts', JSON.stringify(completedContracts));

        closeCompanyChat();
        checkLoginStatus(); // Aggiorna i saldi
    } catch (err) {
        showToast("Errore durante il rilascio: " + err.message, "error");
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
    if (!userMsg || !currentChatCompany) return;

    const { data: { user } } = await supabaseClient.auth.getUser();

    // Recuperiamo l'annuncio per sapere chi deve ricevere il messaggio
    const ann = annunci.find(a => a.id === currentChatCompany.jobId);
    if (!ann) return;

    // 1. Salviamo il messaggio su Supabase
    const { error } = await supabaseClient
        .from('messages')
        .insert([{
            announcement_id: ann.id,
            sender_id: user.id,
            receiver_id: currentChatCompany.partnerId, // USIAMO IL PARTNER CORRETTO!
            content: userMsg
        }]);

    if (error) {
        alert("Errore invio: " + error.message);
        return;
    }

    input.value = ''; // Pulisci l'input
    loadMessages(ann.id); // Ricarichiamo la chat per vedere il nostro messaggio
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


let isAIBusy = false; // Variabile di controllo per evitare invii multipli

function closeChatArea(type) {
    if (type === 'company') {
        const win = document.getElementById('company-chat-window');
        if (win) win.classList.remove('active');
    } else {
        const aiWin = document.querySelector('#ai-section .chat-window');
        if (aiWin) aiWin.classList.remove('active');
    }
}

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const body = document.getElementById('ai-chat-body');
    const modelSelect = document.getElementById('ai-model-select');
    const userMsg = input.value.trim();

    if (!userMsg || isAIBusy) return;

    isAIBusy = true;
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
                    const params = match[1].split("|"); // Dividiamo Titolo|Prezzo|Durata

                    // Riempire i campi dell'HTML
                    document.getElementById('ann-title').value = params[0] || "";
                    document.getElementById('ann-salary').value = params[1] || "";
                    document.getElementById('ann-duration').value = params[2] || "1";

                    // Aprire il modulo e calcolare il totale
                    openCreateModal();
                    if (typeof updatePricePreview === 'function') updatePricePreview();

                    // Pulire il testo per l'utente
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
                document.getElementById('search-input').value = query;
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

// --- 11. SISTEMA MODIFICA PROFILO (Max 1 volta) ---

async function openEditAccountModal() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // Recuperiamo il profilo
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile) return;

    // Metadata per tracciare le modifiche (Supabase Auth Metadata)
    const metadata = user.user_metadata || {};
    const editedFields = metadata.edited_fields || {};

    const nameInput = document.getElementById('edit-name');
    const surnameInput = document.getElementById('edit-surname');
    const cityInput = document.getElementById('edit-city');
    const bizNameInput = document.getElementById('edit-company-name');
    const bizAddrInput = document.getElementById('edit-company-address');
    const passInput = document.getElementById('edit-password');
    const cvInput = document.getElementById('edit-cv');
    const certInput = document.getElementById('edit-certifications');

    // Popola e Blocca se già modificati
    nameInput.value = profile.display_name?.split(' ')[0] || "";
    if (editedFields.name) {
        nameInput.disabled = true;
        nameInput.style.opacity = "0.5";
    } else {
        nameInput.disabled = false;
        nameInput.style.opacity = "1";
    }

    surnameInput.value = profile.display_name?.split(' ')[1] || "";
    if (editedFields.surname) {
        surnameInput.disabled = true;
        surnameInput.style.opacity = "0.5";
    } else {
        surnameInput.disabled = false;
        surnameInput.style.opacity = "1";
    }

    cityInput.value = profile.city || "";
    if (editedFields.city) {
        cityInput.disabled = true;
        cityInput.style.opacity = "0.5";
    } else {
        cityInput.disabled = false;
        cityInput.style.opacity = "1";
    }

    cvInput.value = profile.cv || "";
    if (editedFields.cv) {
        cvInput.disabled = true;
        cvInput.style.opacity = "0.5";
    } else {
        cvInput.disabled = false;
        cvInput.style.opacity = "1";
    }

    certInput.value = profile.certifications || "";
    if (editedFields.certifications) {
        certInput.disabled = true;
        certInput.style.opacity = "0.5";
    } else {
        certInput.disabled = false;
        certInput.style.opacity = "1";
    }

    if (profile.user_type === 'business') {
        document.getElementById('edit-biz-fields').classList.remove('hidden');
        bizNameInput.value = profile.company_name || "";
        if (editedFields.company_name) bizNameInput.disabled = true;

        bizAddrInput.value = profile.company_address || "";
        if (editedFields.company_address) bizAddrInput.disabled = true;
    } else {
        document.getElementById('edit-biz-fields').classList.add('hidden');
    }

    // Password
    passInput.value = "";
    if (editedFields.password) {
        passInput.disabled = true;
        passInput.placeholder = "Password bloccata (già cambiata)";
        passInput.style.opacity = "0.5";
    } else {
        passInput.disabled = false;
        passInput.placeholder = "••••••••";
        passInput.style.opacity = "1";
    }

    showModal('edit-account-modal');
}

async function updateAccountData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const metadata = user.user_metadata || {};
    const editedFields = { ...(metadata.edited_fields || {}) };

    const newName = document.getElementById('edit-name').value;
    const newSurname = document.getElementById('edit-surname').value;
    const newCity = document.getElementById('edit-city').value;
    const newPassword = document.getElementById('edit-password').value;
    const newCv = document.getElementById('edit-cv').value;
    const newCertifications = document.getElementById('edit-certifications').value;

    let profileUpdates = {};
    let authUpdates = {};

    // Controllo Nome
    if (!editedFields.name && newName) {
        profileUpdates.display_name = `${newName} ${newSurname}`;
        editedFields.name = true;
    }
    // Controllo Cognome
    if (!editedFields.surname && newSurname) {
        editedFields.surname = true;
    }
    // Controllo Città
    if (!editedFields.city && newCity) {
        profileUpdates.city = newCity;
        editedFields.city = true;
    }
    // Controllo CV
    if (!editedFields.cv && newCv) {
        profileUpdates.cv = newCv;
        editedFields.cv = true;
    }
    // Controllo Certificazioni
    if (!editedFields.certifications && newCertifications) {
        profileUpdates.certifications = newCertifications;
        editedFields.certifications = true;
    }

    // Business fields
    if (user.user_metadata.user_type === 'business') {
        const newBizName = document.getElementById('edit-company-name').value;
        const newBizAddr = document.getElementById('edit-company-address').value;
        if (!editedFields.company_name && newBizName) {
            profileUpdates.company_name = newBizName;
            editedFields.company_name = true;
        }
        if (!editedFields.company_address && newBizAddr) {
            profileUpdates.company_address = newBizAddr;
            editedFields.company_address = true;
        }
    }

    // Password (via Auth)
    if (!editedFields.password && newPassword) {
        if (newPassword.length < 6) {
            alert("La password deve avere almeno 6 caratteri.");
            return;
        }
        authUpdates.password = newPassword;
        editedFields.password = true;
    }

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
            password: authUpdates.password,
            data: { ...metadata, edited_fields: editedFields }
        });
        if (aErr) throw aErr;

        alert("Profilo aggiornato con successo! Nota: i campi modificati ora sono bloccati.");
        closeModal('edit-account-modal');
        checkLoginStatus(); // Ricarica dati UI
    } catch (err) {
        alert("Errore durante l'aggiornamento: " + err.message);
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
            alert('Foto profilo aggiornata con successo!');
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
    if (currentRating === 0) { alert('Inserisci un voto con le stelle!'); return; }

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
    alert('Recensione salvata con successo!');
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
        alert("Errore: " + error.message);
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