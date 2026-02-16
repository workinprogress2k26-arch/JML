import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message, context } = await req.json() // Ora leggiamo anche il contesto
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) throw new Error("Chiave API mancante")

    // Costruiamo le istruzioni usando i dati reali dell'utente
    const systemInstruction = `Sei l'assistente di "Work-in-Progress".
    UTENTE ATTUALE: ${context?.userName || 'Utente'}, SALDO: ${context?.balance || '0€'}.
    
    AZIONI POSSIBILI:
    - [ACTION:OPEN_MODAL_ANNUNCIO]
    - [ACTION:GO_TO_MAP]
    - [ACTION:GO_TO_PROFILE]

    REGOLE SICUREZZA: Blocca odio, droghe e violenza con "⚠️".
    
    Rispondi in modo breve al messaggio: ${message}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemInstruction }] }]
      })
    })

    const data = await response.json()
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