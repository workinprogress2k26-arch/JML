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

        // 1. Scarica il profilo (Saldo, Nome, ecc.)
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profile) {
            userBalance = parseFloat(profile.balance) || 0;
            frozenBalance = parseFloat(profile.frozen_balance) || 0;

            // Salva i dati dell'utente per la UI
            const userData = {
                name: profile.display_name,
                email: profile.email,
                type: profile.user_type
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
    // Carichiamo l'annuncio E i dati dell'autore (profiles) in un colpo solo
    const { data, error } = await supabaseClient
        .from('announcements')
        .select('*, profiles(display_name, email)')
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
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML; // Trasforma < > " ' & in entità sicure
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
                <p>${sanitizeInput(ann.description)}</p>
                <div class="card-footer">
                    <strong>${userCurrency} ${ann.salary.replace(/[^0-9.]/g, '')}</strong>
                    <div style="display:flex; flex-direction:column; gap:0.5rem; align-items: flex-end;">
                        ${isAuthor ? `
                            <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: #ff4d4d; color: white;" onclick="deleteAnnuncio(${ann.id})">
                                🗑️ Elimina Annuncio
                            </button>` : `
                            <div style="display:flex; gap: 0.5rem;">
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem;" onclick="toggleContract(${ann.id})">
                                    ${isAccepted ? 'Contratto Attivo' : 'Accetta Contratto'}
                                </button>
                                ${isAccepted ? `
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: #ffb347; color: white;" onclick="openRevokeModal(${ann.id})" title="Revoca incarico">
                                    🚩 Revoca
                                </button>` : `
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: var(--text-dim); color: white;" onclick="hideAnnuncio(${ann.id})" title="Nascondi">
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

async function deleteAnnuncio(id) {
    if (!confirm("Sei sicuro di voler eliminare definitivamente questo annuncio? Verrà rimosso anche dal database Cloud.")) return;

    // 1. Elimina da Supabase
    const { error } = await supabaseClient
        .from('announcements')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Errore durante l'eliminazione: " + error.message);
        return;
    }

    // 2. Ricarica i dati dal DB per aggiornare la bacheca
    alert("Annuncio rimosso con successo! 🗑️");
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

    // 1. Prendiamo gli ID dei contratti accettati localmente (quelli appena cliccati)
    const localAcceptedIds = acceptedContracts.map(id => Number(id));

    // 2. Chiediamo a Supabase gli ID degli annunci dove ci sono già messaggi per noi
    const { data: myMessages } = await supabaseClient
        .from('messages')
        .select('announcement_id')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

    const messageJobIds = myMessages ? myMessages.map(m => m.announcement_id) : [];

    // Uniamo gli ID (senza duplicati)
    const allInvolvedIds = [...new Set([...localAcceptedIds, ...messageJobIds])];

    if (allInvolvedIds.length === 0) {
        list.innerHTML = '<p style="padding:1rem; color:var(--text-dim);">Accetta un contratto per sbloccare la chat.</p>';
        return;
    }

    // 3. Scarichiamo i dettagli di questi annunci per mostrarli nella lista
    const { data: chatJobs, error } = await supabaseClient
        .from('announcements')
        .select('id, title, author_id, profiles!announcements_author_id_fkey(display_name)')
        .in('id', allInvolvedIds);

    if (error) {
        console.error("Errore caricamento lista chat:", error);
        return;
    }

    list.innerHTML = '';
    chatJobs.forEach(ann => {
        const isOwner = ann.author_id === user.id;
        const chatPartnerName = isOwner ? "Candidato Lavoratore" : (ann.profiles?.display_name || "Autore");

        const item = document.createElement('div');
        item.className = 'chat-item glass';
        item.innerHTML = `
            <strong>${chatPartnerName}</strong><br>
            <small>${ann.title}</small>
        `;
        item.onclick = () => openCompanyChat({
            id: ann.id,
            jobId: ann.id,
            name: chatPartnerName
        });
        list.appendChild(item);
    });
}

function openCompanyChat(chat) {
    currentChatCompany = chat;

    // Sezione Messaggi: cambiamo il titolo della finestra
    const header = document.getElementById('company-chat-header');
    if (header) header.textContent = `Chat con ${chat.name}`;

    const body = document.getElementById('company-chat-body');
    body.innerHTML = `
        <div class="message company glass">
            <div class="msg-content">Ciao! Hai accettato il lavoro per "${annunci.find(a => a.id === chat.jobId)?.title}". Come possiamo organizzarci?</div>
            <span class="msg-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;
    // Aggiorna il nome della persona nell'header
    document.getElementById('chat-partner-name').textContent = `Chat con ${chat.name}`;

    // MOSTRA IL TASTO CESTINO
    document.getElementById('btn-clear-chat').classList.remove('hidden');
    // Mostriamo l'area di input
    document.getElementById('company-chat-input-area').classList.remove('hidden');
    loadMessages(chat.jobId); // <--- Carica i messaggi veri!




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
            receiver_id: ann.authorId, // L'autore dell'annuncio
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
    msg.innerHTML = text.replace(/\n/g, '<br>');
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
        alert("Errore registrazione: " + error.message);
        return;
    }

    // Se "Confirm Email" è disattivato, data.session sarà già pieno!
    if (data.session) {
        alert("Registrazione riuscita! Benvenuto in Worky.");

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
        alert("Registrazione completata, ma devi confermare l'email o fare il login manuale.");
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
        alert("Email o Password errati: " + error.message);
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
            <strong>Nome:</strong> ${data.name || '---'} 
            ${data.isPremium ? '<span class="verified-badge gold" style="margin-left: 5px;" title="Membro Premium">✔</span>' : ''}
        </div>
        <div class="profile-info"><strong>Cognome:</strong> ${data.surname || '---'}</div>
        <div class="profile-info"><strong>Email:</strong> ${data.email || '---'}</div>
        <div class="profile-info"><strong>Città:</strong> ${data.city || '---'}</div>
        ${data.type === 'business' ? `
            <div class="profile-info" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border);">
                <strong>🏢 Azienda:</strong> ${data.companyName || '---'}
            </div>
            <div class="profile-info"><strong>📍 Sede:</strong> ${data.companyAddress || '---'}</div>
            <div class="company-tag">Account Aziendale Verificato</div>
        ` : ''}
    `;
    if (data.avatar) document.getElementById('profile-avatar-big').src = data.avatar;

    // Mostra saldo con valuta corretta
    const cur = data.currency || '€';
    const bal = document.getElementById('user-balance');
    const fro = document.getElementById('frozen-balance');
    if (bal) bal.textContent = `${cur} ${userBalance.toFixed(2)}`;
    if (fro) fro.textContent = `${cur} ${frozenBalance.toFixed(2)}`;

    renderReviews();
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
            <p style="font-size: 0.95rem; margin-bottom: 0.5rem;">"${rev.text || 'Nessun commento'}"</p>
            <div style="font-size: 0.8rem; color: var(--text-dim);">
                <strong>${rev.type === 'received' ? 'Da: ' : 'Per: '}${rev.author}</strong> - ${rev.jobTitle}<br>
                <span>${rev.date}</span>
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