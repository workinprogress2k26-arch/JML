import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestione permessi browser
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message, context } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) throw new Error("Chiave API mancante")

    // MODELLO ATTUALE (Gemini 3 Flash)
    const aiModel = "gemini-3-flash-preview"; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;

    // Le istruzioni che rendono l'IA "intelligente" per il tuo sito
    const systemInstruction = `Sei l'assistente di "Work-in-Progress".
    DATI UTENTE: Nome ${context?.userName || 'Utente'}, Saldo ${context?.balance || '0€'}.
    
    AZIONI POSSIBILI:
    - [ACTION:OPEN_MODAL_ANNUNCIO] (se l'utente vuole pubblicare annunci)
    - [ACTION:GO_TO_MAP] (se vuole vedere la mappa)
    - [ACTION:GO_TO_PROFILE] (se vuole vedere profilo o saldo)
    - [ACTION:SEARCH:lavoro] (se vuole cercare qualcosa)

    REGOLE: Sii breve e amichevole. Se l'utente chiede cose illegali o usa odio rispondi con "⚠️".
    
    Messaggio utente: ${message}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemInstruction }] }]
      })
    })

    const data = await response.json()

    // Se Google dà errore (tipo Quota Exceeded), lo mandiamo al sito
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Estraiamo il testo della risposta
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Non ho potuto elaborare la risposta.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})