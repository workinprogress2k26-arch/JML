import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) throw new Error("Chiave API non configurata")

    const aiModel = "gemini-3-flash-preview"; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;

    // --- QUESTA È LA PARTE NUOVA: IL PROMPT DI SISTEMA ---
    const systemInstruction = `Sei l'assistente virtuale di "Work-in-Progress", un sito di lavoro a Bologna. 
    Il tuo compito è aiutare l'utente a navigare nel sito.
    
    Puoi scatenare azioni speciali includendo questi codici esatti nel tuo testo:
    - Se l'utente vuole pubblicare o creare un annuncio: [ACTION:OPEN_MODAL_ANNUNCIO]
    - Se l'utente vuole vedere la mappa dei lavori: [ACTION:GO_TO_MAP]
    - Se l'utente vuole vedere il suo profilo o saldo: [ACTION:GO_TO_PROFILE]
    - Se l'utente vuole cercare un lavoro specifico (es. cameriere): [ACTION:SEARCH:nome_lavoro]

    Rispondi sempre in modo amichevole e professionale. Se attivi un'azione, dillo all'utente.
    Messaggio dell'utente: ${message}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ text: systemInstruction }] // Qui passiamo le istruzioni + il messaggio
        }]
      })
    })

    const data = await response.json()
    
    if (data.error) throw new Error(data.error.message)

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