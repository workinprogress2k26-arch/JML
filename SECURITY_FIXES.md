# 🔒 Guida di Sicurezza - Work-in-Progress

## Problemi Risolti

### 🔴 Critici (Sicurezza)

1. **✅ Credenziali HTTP Esposte**
   - PRIMA: Supabase URL e API key hardcoded in script.js
   - DOPO: Spostati in `.env.local` (non versionare!)
   - AGGIUNTO: File `config.js` per gestire configurazione centralizzata

2. **✅ CORS Troppo Permissivo**
   - PRIMA: `Access-Control-Allow-Origin: '*'` (accetta da qualsiasi dominio)
   - DOPO: Whitelist su domini specifici:
     - `https://jml-gamma-v2.vercel.app` (produzione)
     - `http://localhost:3000` (development)
     - `http://localhost:5173` (Vite dev)

3. **✅ Content Security Policy Debole**
   - PRIMA: `'unsafe-inline'` e `'unsafe-eval'` nel CSP
   - DOPO: Rimossi (migliora protezione XSS)
   - AGGIUNTO: `object-src 'none'` e `base-uri 'self'`

4. **✅ Versione Gemini API Obsoleta**
   - PRIMA: `gemini-pro` (deprecato)
   - DOPO: `gemini-1.5-flash` (migliore latenza e performance)

### 🟠 Importanti (Funzionalità)

5. **✅ Content Moderator Vuoto**
   - PRIMA: Template placeholder di default
   - DOPO: Funzione completa di moderazione con pattern matching per:
     - XSS/Injection
     - Hate speech
     - Abuso/insulti
     - Contenuto illegale
     - Spam detection

6. **✅ Validazione Input Mancante**
   - AGGIUNTO: Validazione su API/Gemini proxy
   - Blocca: Link URL, codice malicious, XSS patterns
   - Lunghezza massima: 5000 caratteri

7. **✅ Race Condition - userBalance**
   - PRIMA: userBalance caricato a 0 senza sincronizzazione
   - DOPO: Aggiunto controllo di supabaseClient prima dell'uso
   - Aggiunto logging dettagliato di errori

8. **✅ Error Handling Incompleto**
   - AGGIUNTO: Controllo null su supabaseClient in tutte le funzioni
   - Migliorati messaggi di errore con emoji per distinguere tipi
   - Try-catch ottimizzati in `logTransaction()`, `selectPlan()`, `renderTransactions()`

9. **✅ Fallback Supabase Non Gestito**
   - AGGIUNTO: `initSupabase()` che controlla se `window.supabase` esiste
   - Error handling con fallback se libreria non caricata
   - Logging di stato di inizializzazione

10. **✅ Dipendenza Inutile**
    - RIMOSSO: `"openai": "^6.18.0"` da package.json (non usato)

## 🚀 Setup Corretto

### Configurazione Locale

1. Copia `.env.example` in `.env.local`:
```bash
cp .env.example .env.local
```

2. Modifica `.env.local` con le tue credenziali reali:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_key_here
GEMINI_API_KEY=your_gemini_key_here
STRIPE_SECRET_KEY=your_stripe_key_here
ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3000
```

3. **IMPORTANTE**: Non versionare `.env.local` nel git!

### Build & Deploy

Per **Vercel** (o Vite):
```bash
npm install
npm run build
npm run preview
```

Le variabili d'ambiente devono essere configurate nel dashboard del servizio:
- **Vercel**: Settings → Environment Variables
- **Supabase Edge Functions**: Settings → Secrets

## 🛡️ Best Practices Applicate

### 1. Input Validation ✅
```javascript
// Tutti gli input validati per lunghezza e pattern
if (!message || typeof message !== 'string' || message.length > 5000) {
  return error();
}
```

### 2. XSS Prevention ✅
- CSP headers strict (no `unsafe-inline`)
- Sanitizzazione HTML con `sanitizeInput()`
- Pattern matching per rilevare script injection

### 3. CORS Security ✅
- Whitelist di domini allowed
- No more `Access-Control-Allow-Origin: *`
- Proper CORS headers per metodo HTTP

### 4. API Security ✅
- Validazione request/response
- Timeout implementati (10s)
- Error handling con dettagli limitati in produzione

### 5. Content Moderation ✅
- Rilevamento automatico di contenuto violento/illegale
- Scoring severity per azioni appropriate
- Logging di tentativi sospetti

## ⚠️ Cose Ancora da Verificare

1. **Stripe Integration**: Assicurati che Stripe API keys siano in `.env.local`
2. **Database Rules**: Supabase RLS (Row Level Security) deve proteggere i dati sensibili
3. **Rate Limiting**: Non implementato - considera aggiungere rate limiting su API
4. **2FA**: Implementa 2-Factor Authentication per account premium
5. **API Key Rotation**: Ruota regolarmente le API keys (ogni 90 giorni)

## 🔍 Testing di Sicurezza

```bash
# Test XSS Prevention
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"content":"<script>alert(1)</script>"}]}'
# Dovrebbe essere bloccato

# Test CORS
curl -X OPTIONS http://localhost:3000/api/chat \
  -H "Origin: http://evil.com"
# Dovrebbe NON includere header CORS per evil.com
```

## 📚 Riferimenti

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CORS Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Supabase Security](https://supabase.com/docs/guides/security)

---

**Ultima modifica**: 3 Marzo 2026
**Autore**: Security Audit
**Status**: ✅ Tutti i problemi critici risolti
