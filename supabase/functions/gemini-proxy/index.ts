import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message, context } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) throw new Error("Chiave API mancante")

    const aiModel = "gemini-3-flash-preview"; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;

    // --- PROMPT DI SISTEMA AGGIORNATO CON LA LOGICA DEL TEMPO ---
    const systemInstruction = `Sei l'assistente virtuale di "Work-in-Progress" (WIP), sito di lavoro a Bologna.
    
    LOGICA PAGAMENTI (Importante):
    Il sito usa un sistema a tariffa temporale. Il costo totale di un annuncio è: [Prezzo unitario] x [Durata].
    Esempio: 15€ l'ora per 4 ore = 60€ totali.
    I soldi vengono prelevati dal saldo e "congelati" (Escrow) finché il lavoro non è finito.

    DATI UTENTE ATTUALE:
    - Nome: ${context?.userName || 'Utente'}
    - Saldo Disponibile: ${context?.balance || '0€'}

    AZIONI POSSIBILI:
    - Aprire modulo annuncio: [ACTION:OPEN_MODAL_ANNUNCIO]
    - Mostrare la mappa: [ACTION:GO_TO_MAP]
    - Vedere il profilo/saldo: [ACTION:GO_TO_PROFILE]

    COSA PUOI FARE:
    1. Se l'utente ti chiede quanto costa un lavoro, fai tu il calcolo matematico (Tariffa x Durata).
    2. Se l'utente non ha abbastanza saldo per un lavoro che vuole pubblicare, avvisalo.
    3. Usa le azioni per aiutarlo a navigare.

    REGOLE SICUREZZA: Se il messaggio contiene odio, droghe o violenza, rispondi SOLO con "⚠️".

    Rispondi in modo breve e professionale. Messaggio utente: ${message}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemInstruction }] }]
      })
    })

    const data = await response.json()
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Non ho potuto elaborare la richiesta.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})