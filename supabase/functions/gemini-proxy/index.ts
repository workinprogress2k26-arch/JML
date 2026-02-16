import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestione preflight CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message, context } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) throw new Error("Chiave API GEMINI_API_KEY non configurata nei Secrets di Supabase")

    // Istruzioni di sistema
    const systemInstruction = `Sei l'assistente di Worky. Utente: ${context?.userName || 'Utente'}. Saldo: ${context?.balance || '0'}. Rispondi brevemente. Messaggio: ${message}`;

    // Chiamata a Google Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemInstruction }] }]
      })
    })

    const data = await response.json()

    // DEBUG: Se c'è un errore da Google, lo restituiamo chiaramente
    if (data.error) {
      return new Response(JSON.stringify({ error: "Errore Google: " + data.error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // CONTROLLO DI SICUREZZA: Verifichiamo che la risposta contenga i dati attesi
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
      return new Response(JSON.stringify({ 
        error: "Risposta vuota da Google. Potrebbe essere stata bloccata dai filtri di sicurezza.",
        debug: data // Invia i dati grezzi per capire cosa è successo
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const reply = data.candidates[0].content.parts[0].text

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: "Errore interno funzione: " + err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})