// Variabili globali
let annunci = JSON.parse(localStorage.getItem('annunci')) || [];
let acceptedContracts = JSON.parse(localStorage.getItem('acceptedContracts')) || [];
let completedContracts = JSON.parse(localStorage.getItem('completedContracts')) || [];
let hiddenAnnouncements = JSON.parse(localStorage.getItem('hiddenAnnouncements')) || [];
let chatHistoryAI = JSON.parse(localStorage.getItem('chatHistoryAI')) || []; // Persistenza chat AI

let userBalance = parseFloat(localStorage.getItem('userBalance')) || 1500.00;
let frozenBalance = parseFloat(localStorage.getItem('frozenBalance')) || 0.00;
let currentChatCompany = null;
let map = null;
let markers = [];

// COSTANTE PER GOOGLE GEMINI (Sostituisci con la tua chiave reale)
const GEMINI_API_KEY = "AIzaSyDdlUhBgqndw9Ep75yz_kYTLpC_XnWdGy0";
// Inizializzazione
document.addEventListener('DOMContentLoaded', () => {
    if (annunci.length === 0) {
        annunci = [
            {
                id: 1, title: "Cameriere part-time", description: "Ricerca cameriere per ristorante nel centro di Bologna...",
                category: "ristorazione", location: "Via dell'Indipendenza, Bologna", salary: "12€/ora",
                author: "Ristorante Bella Napoli", authorId: "admin@bellanapoli.it", authorType: "azienda",
                lat: 44.4949, lng: 11.3426
            }
        ];
        localStorage.setItem('annunci', JSON.stringify(annunci));
    }
    checkLoginStatus();
    renderChatHistory(); // Carica messaggi precedenti dell'AI
});

// --- LOGICA DI NAVIGAZIONE E AUTH ---
function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
        showView('app-view');
        initDashboard();
    } else {
        showView('auth-view');
    }
}

function showView(viewId) {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('app-view').classList.add('hidden');
    document.getElementById(viewId).classList.remove('hidden');
}

function initDashboard() {
    renderBacheca();
    updateSidebar();
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

// Navigazione
function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    const section = document.getElementById(sectionId);
    if (section) section.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeLink = Array.from(document.querySelectorAll('.nav-item')).find(el => el.getAttribute('onclick')?.includes(sectionId));
    if (activeLink) activeLink.classList.add('active');

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

// Bacheca e Annunci
function renderBacheca() {
    const grid = document.getElementById('announcements-grid');
    if (!grid) return;

    // Recupera valori filtri
    const searchText = document.getElementById('search-input')?.value.toLowerCase() || "";
    const filterCat = document.getElementById('filter-category')?.value || "";

    // Recupera dati utente per identificare autore e valuta
    const userData = JSON.parse(localStorage.getItem('userData'));
    const userName = userData ? userData.name : "Me";
    const userCurrency = userData ? (userData.currency || '€') : '€';

    // Filtra annunci (testo, categoria + annunci nascosti)
    const filtered = annunci.filter(ann => {
        if (hiddenAnnouncements.includes(ann.id)) return false;

        const matchesSearch = ann.title.toLowerCase().includes(searchText) ||
            ann.author.toLowerCase().includes(searchText) ||
            ann.description.toLowerCase().includes(searchText);
        const matchesCat = filterCat === "" || ann.category === filterCat;
        return matchesSearch && matchesCat;
    });

    const reviews = JSON.parse(localStorage.getItem('reviews')) || [];

    grid.innerHTML = '';
    if (filtered.length === 0) {
        grid.innerHTML = '<p style="padding:2rem; color:var(--text-dim); text-align:center; width:100%;">Nessun annuncio trovato con questi filtri.</p>';
        syncMapMarkers(filtered);
        return;
    }

    filtered.forEach(ann => {
        const isAuthor = ann.author === userName;
        const isAccepted = acceptedContracts.includes(ann.id);
        const hasReviewed = reviews.some(r => r.jobId === ann.id);

        const card = document.createElement('div');
        card.className = `annuncio-card glass ${isAccepted ? 'accepted' : ''}`;
        card.id = `annuncio-${ann.id}`;
        card.innerHTML = `
            ${ann.image ? `<img src="${ann.image}" class="annuncio-img">` : ''}
            <div class="card-content">
                <div class="card-header">
                    <span class="category-tag">${ann.category}</span>
                    <div class="author-tag">
                        <img src="${ann.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100'}" class="author-logo">
                        ${ann.author}
                    </div>
                </div>
                <h3>${ann.title}</h3>
                <p>${ann.description}</p>
                <div class="card-footer">
                    <strong>${userCurrency} ${ann.salary.replace(/[^0-9.]/g, '')}</strong>
                    <div style="display:flex; flex-direction:column; gap:0.5rem; align-items: flex-end;">
                        ${isAuthor ? `
                            <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: #ff4d4d; color: white;" onclick="deleteAnnuncio(${ann.id})">
                                🗑️ Elimina
                            </button>` : `
                            <div style="display:flex; gap: 0.5rem;">
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem;" onclick="toggleContract(${ann.id})">
                                    ${isAccepted ? 'Contratto Attivo' : 'Accetta Contratto'}
                                </button>
                                ${isAccepted ? `
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: #ffb347; color: white;" onclick="openRevokeModal(${ann.id})" title="Revoca incarico">
                                    🚩 Revoca
                                </button>` : `
                                <button class="btn-primary" style="width: auto; padding: 0.5rem 1rem; background: var(--text-dim); color: white;" onclick="hideAnnuncio(${ann.id})" title="Nascondi questo annuncio">
                                    🚫
                                </button>`}
                            </div>
                            <small style="color:var(--text-dim); font-size:0.7rem;">${isAccepted ? 'Sblocca recensione dopo il pagamento' : ''}</small>
                        `}
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    syncMapMarkers(filtered);
}

// ELIMINAZIONE ANNUNCIO: Rimborso fondi congelati
function deleteAnnuncio(id) {
    const ann = annunci.find(a => a.id === id);
    if (!ann) return;

    if (confirm("Sei sicuro? Il compenso congelato verrà riaccreditato sul tuo saldo.")) {
        const amount = parseFloat(ann.salary.replace(/[^0-9.]/g, '')) || 0;

        // Logica di rimborso
        userBalance += amount;
        frozenBalance -= amount;

        annunci = annunci.filter(a => a.id !== id);
        localStorage.setItem('annunci', JSON.stringify(annunci));

        updateBalances();
        renderBacheca();
        initMap();
    }
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
        const isGold = ann.isPremium;
        const bizTag = ann.companyName ? `<br><span class="company-tag" style="margin-top: 5px;">${ann.companyName}</span>` : '';
        const goldTag = isGold ? `<span class="verified-badge gold" style="margin-left: 5px; font-size: 8px; width: 14px; height: 14px;" title="Inserzionista Premium">✔</span>` : '';

        const popupContent = `
            <div style="text-align: center;">
                <strong style="font-size: 1.1rem; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    ${ann.title} ${goldTag}
                </strong>
                <p style="margin: 5px 0; color: var(--text-dim); display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <img src="${ann.authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100'}" class="author-logo">
                    ${ann.author}
                </p>
                ${bizTag}
                <hr style="border: 0.5px solid var(--border); margin: 8px 0;">
                <small style="color: var(--primary); cursor: pointer; font-weight: bold;">Clicca per i dettagli</small>
            </div>
        `;

        const markerOptions = {};
        if (isGold) {
            markerOptions.icon = L.divIcon({
                className: 'custom-gold-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 30],
                popupAnchor: [0, -30]
            });
        }

        const marker = L.marker([ann.lat, ann.lng], markerOptions).addTo(map)
            .bindPopup(popupContent);

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
    const title = document.getElementById('ann-title').value;
    let category = document.getElementById('ann-category').value;
    const desc = document.getElementById('ann-desc').value;
    const salary = document.getElementById('ann-salary').value;
    const address = document.getElementById('ann-address').value;
    const city = document.getElementById('ann-city').value;

    const otherCatValue = document.getElementById('ann-other-category').value;
    if (category === 'altro' && otherCatValue) {
        category = otherCatValue;
    }

    if (!title || !desc || !address) { alert('Compila i campi necessari.'); return; }

    // Escrow logic
    const amount = parseFloat(salary) || 0;
    const userData = JSON.parse(localStorage.getItem('userData'));
    const cur = userData ? (userData.currency || '€') : '€';

    if (amount <= 0) {
        alert('❌ Il compenso deve essere maggiore di zero!');
        return;
    }

    if (userBalance < amount) {
        alert(`❌ Saldo insufficiente!\nIl costo dell'annuncio è ${cur} ${amount.toFixed(2)}, ma il tuo saldo attuale è ${cur} ${userBalance.toFixed(2)}.\n\nPer favore, ricarica il saldo dal tuo profilo.`);
        return;
    }

    userBalance -= amount;
    frozenBalance += amount;
    localStorage.setItem('userBalance', userBalance);
    localStorage.setItem('frozenBalance', frozenBalance);
    renderUserProfile();
    updateSidebar();

    const coords = await getCoordinates(`${address}, ${city}`);

    const file = document.getElementById('ann-image').files[0];
    let imageBase64 = "";
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            imageBase64 = e.target.result;
            finalizeAnnuncioCreation(title, category, desc, salary, address, coords, imageBase64, userData);
        };
        reader.readAsDataURL(file);
    } else {
        finalizeAnnuncioCreation(title, category, desc, salary, address, coords, imageBase64, userData);
    }
}

// --- CREAZIONE ANNUNCIO (CORRETTA) ---
async function finalizeAnnuncioCreation(title, category, desc, salary, address, coords, imageBase64, userData) {
    const newAnn = {
        id: Date.now(),
        title,
        category,
        description: desc,
        salary: salary + (userData.currency || '€'),
        location: address,
        lat: coords.lat,
        lng: coords.lng,
        author: userData.name + " " + (userData.surname || ""),
        authorId: userData.email, // ID univoco
        authorAvatar: userData.avatar || "",
        image: imageBase64,
        isPremium: userData.isPremium || false
    };

    annunci.unshift(newAnn);
    localStorage.setItem('annunci', JSON.stringify(annunci));

    alert('Annuncio creato. I fondi sono stati congelati in Escrow fino al completamento.');
    closeModal('create-annuncio-modal');
    renderBacheca();
    initMap();
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
    if (acceptedContracts.includes(id)) { alert('Contratto già attivo.'); return; }
    acceptedContracts.push(id);
    localStorage.setItem('acceptedContracts', JSON.stringify(acceptedContracts));
    renderBacheca();
    updateChatList();
    alert('Contratto accettato!');
}

function updateChatList() {
    const list = document.getElementById('company-chat-list');
    if (!list) return;
    list.innerHTML = '';
    const activeContracts = annunci.filter(a => acceptedContracts.includes(a.id) && a.authorType === 'azienda');
    if (activeContracts.length === 0) {
        list.innerHTML = '<p style="padding:1rem; color:var(--text-dim);">Accetta un contratto per sbloccare la chat.</p>';
        return;
    }
    activeContracts.forEach(ann => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `<strong>${ann.author}</strong><br><small>Progetto: ${ann.title}</small>`;
        item.onclick = () => openCompanyChat({ id: ann.id, role: 'company', jobId: ann.id }); // Pass a chat object
        list.appendChild(item);
    });
}

function openCompanyChat(chat) {
    currentChatCompany = chat;

    document.getElementById('company-chat-header').textContent = `Chat con ${chat.role === 'user' ? 'Lavoratore' : 'Azienda'}`;

    // Mostra tasto release payment solo se sono io il committente (cioè ho creato l'annuncio)
    const ann = annunci.find(a => a.id === chat.jobId);
    const userData = JSON.parse(localStorage.getItem('userData'));
    const isOwner = ann && ann.author === (userData ? userData.name : "Me");
    document.getElementById('release-payment-btn').style.display = isOwner ? 'block' : 'none';

    const body = document.getElementById('company-chat-body');
    body.innerHTML = '<div class="message company">Ciao! Grazie per aver accettato il contratto. Come possiamo iniziare?</div>';
    document.getElementById('company-chat-input-area').classList.remove('hidden');
}

function sendCompanyMessage() {
    const input = document.getElementById('company-input');
    const body = document.getElementById('company-chat-body');
    if (!input.value.trim()) return;
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.textContent = input.value;
    body.appendChild(msg);
    input.value = '';
    body.scrollTop = body.scrollHeight;
    setTimeout(() => {
        const reply = document.createElement('div');
        reply.className = 'message company';
        reply.textContent = `Ricevuto! Un nostro responsabile ti contatterà a breve.`;
        body.appendChild(reply);
        body.scrollTop = body.scrollHeight;
    }, 1500);
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

// --- INTEGRAZIONE GOOGLE GEMINI AI ---
async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const body = document.getElementById('ai-chat-body');
    const userMsg = input.value.trim();
    if (!userMsg) return;

    appendMessage('user', userMsg, body);
    input.value = '';

    const thinking = document.createElement('div');
    thinking.className = 'message ai glass thinking';
    thinking.textContent = 'Worky-AI sta elaborando...';
    body.appendChild(thinking);

    try {
        // ENDPOINT STABILE V1
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: userMsg }]
                }]
            })
        });

        const data = await response.json();

        if (body.contains(thinking)) body.removeChild(thinking);

        if (data.error) {
            // Se la v1 dà ancora errore, ti spiego il perché qui sotto
            appendMessage('ai', "Errore Google V1: " + data.error.message, body);
            console.error("Dettagli errore:", data.error);
        } else if (data.candidates && data.candidates[0].content) {
            const aiText = data.candidates[0].content.parts[0].text;
            appendMessage('ai', aiText, body);
        }

    } catch (e) {
        if (body.contains(thinking)) body.removeChild(thinking);
        appendMessage('ai', "Errore di rete: " + e.message, body);
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

function signup() {
    const name = document.getElementById('reg-name').value;
    const surname = document.getElementById('reg-surname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const idCard = document.getElementById('reg-id').value;
    const birth = document.getElementById('reg-birth').value;
    const city = document.getElementById('reg-city').value;
    const country = document.getElementById('reg-country').value;
    const zip = document.getElementById('reg-zip').value;
    const type = document.getElementById('reg-type').value; // Recupero valore mancante

    if (!name || !surname || !email || !password || !idCard || !birth || !city || !country || !zip) {
        alert('Compila tutti i campi!'); return;
    }

    if (!validateEmail(email)) {
        alert('Inserisci un indirizzo email valido!'); return;
    }

    if (password !== confirm) {
        alert('Le password non coincidono!'); return;
    }

    if (password.length < 6) {
        alert('La password deve essere di almeno 6 caratteri!'); return;
    }

    const userData = {
        name, surname, email, idCard, birth, city, country, zip,
        type: type,
        currency: getCurrencySymbol(country)
    };

    if (type === 'business') {
        userData.companyName = document.getElementById('reg-company-name').value;
        userData.companyAddress = document.getElementById('reg-company-address').value;
        if (!userData.companyName) { alert("Inserisci il nome dell'azienda!"); return; }
    }

    localStorage.setItem('userData', JSON.stringify(userData));
    localStorage.setItem('isLoggedIn', 'true');
    alert(`Registrazione completata! Account ${type === 'business' ? 'Business' : 'Personale'} attivato. Valuta: ${userData.currency}`);
    checkLoginStatus();
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
function login() {
    localStorage.setItem('isLoggedIn', 'true');
    // Assicuriamoci che ci sia sempre un profilo minimo per evitare crash
    if (!localStorage.getItem('userData')) {
        const email = document.getElementById('login-email').value || "mario@rossi.it";
        const isBiz = email.includes('azienda');
        const mockUser = {
            name: "Mario",
            surname: "Rossi",
            email: email,
            city: "Bologna",
            type: isBiz ? 'business' : 'private',
            currency: '€'
        };
        if (isBiz) {
            mockUser.companyName = "Worky Business Srl";
            mockUser.companyAddress = "Via dell'Innovazione 1, Bologna";
        }
        localStorage.setItem('userData', JSON.stringify(mockUser));
    }
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

// ACCOUNT BUSINESS: STATS
// Statistiche numeriche essenziali.

// Funzionalità Premium rimosse su richiesta
