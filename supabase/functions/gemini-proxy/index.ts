import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { message, model } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    // 1. Controllo Chiave
    if (!apiKey) throw new Error("Chiave API mancante nei Secrets di Supabase")

    // 2. Controllo Modello (Se selezioni 2.5 che non esiste, forziamo 1.5)
    let aiModel = model;
    if (model === 'gemini-2.5-flash' || !model) {
        aiModel = 'gemini-1.5-flash'; 
    }

    // 3. Chiamata a Google
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    })

    const data = await response.json()
    
    // Se Google risponde con errore, lo mostriamo chiaramente
    if (data.error) {
        return new Response(JSON.stringify({ error: "Errore Google: " + data.error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
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