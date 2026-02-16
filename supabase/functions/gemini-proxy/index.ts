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

    if (!apiKey) throw new Error("Chiave API mancante nei Secrets")

    // --- CONFIGURAZIONE MODELLO 2026 ---
    // Usiamo il nuovo modello Flash 3 come indicato nelle note di rilascio
    const aiModel = "gemini-3-flash-preview"; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;

    const systemInstruction = `Sei l'assistente di "Work-in-Progress".
    DATI UTENTE: Nome ${context?.userName || 'Utente'}, Saldo ${context?.balance || '0€'}.
    
    AZIONI POSSIBILI:
    - [ACTION:OPEN_MODAL_ANNUNCIO]
    - [ACTION:GO_TO_MAP]
    - [ACTION:GO_TO_PROFILE]

    REGOLE SICUREZZA: Se l'utente chiede droghe, armi, o usa odio, rispondi SOLO con "⚠️".
    
    Rispondi in modo breve. Messaggio utente: ${message}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemInstruction }] }]
      })
    })

    const data = await response.json()

    // Gestione errore Quota o Modello non trovato
    if (data.error) {
      return new Response(JSON.stringify({ error: "Errore Google: " + data.error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Estrazione risposta
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("Nessuna risposta generata dal modello Gemini 3");
    }

    const reply = data.candidates[0].content.parts[0].text

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