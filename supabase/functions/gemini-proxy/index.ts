import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { message, context } = body
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) throw new Error("Chiave API mancante nei Secrets")

    // Recupero dati in modo sicuro (se mancano usiamo valori di default)
    const name = context?.userName || "Utente";
    const balance = context?.balance || "Non disponibile";

    const systemInstruction = `Sei l'assistente di "Work-in-Progress". 
    Rispondi in modo breve. 
    UTENTE: ${name}, SALDO: ${balance}. 
    Se l'utente offende o chiede cose illegali usa "⚠️". 
    Messaggio: ${message}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemInstruction }] }]
      })
    })

    const data = await response.json()
    
    // Gestione errore Quota di Google
    if (data.error) {
        return new Response(JSON.stringify({ error: data.error.message }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Non ho capito, puoi ripetere?";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})