module.exports = async (req, res) => {
    // Define allowed origins
    const ALLOWED_ORIGINS = ['https://jml-gamma-v2.vercel.app', 'http://localhost:3000', 'http://localhost:5173'];
    const origin = req.headers.origin;
    
    // CORS headers - only for allowed origins
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metodo non consentito' });
    }

    const { messages } = req.body;
    
    // Input validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messaggio non valido' });
    }

    // Validate for XSS/injection attempts
    const lastMessage = messages[messages.length - 1].content;
    if (typeof lastMessage !== 'string' || lastMessage.length > 5000) {
        return res.status(400).json({ error: 'Contenuto non valido' });
    }

    // Check for dangerous patterns
    const dangerousPatterns = /<script|<iframe|javascript:|onerror=|onclick=/gi;
    if (dangerousPatterns.test(lastMessage)) {
        return res.status(400).json({ error: 'Contenuto non consentito' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error('GEMINI_API_KEY non configurata');
        return res.status(500).json({ error: 'Configurazione server mancante' });
    }

    try {
        // Use Gemini Flash instead of Pro (better latency)
        const userMessage = lastMessage;

        const prompt = `Sei Worky-AI, un assistente esperto del mercato del lavoro a Bologna. Aiuti gli utenti a trovare lavoro, migliorare il profilo e capire come usare la piattaforma Worky.

Utente: ${userMessage}

Rispondi in modo professionale e conciso:`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                }),
                timeout: 10000
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`Gemini API error (${response.status}):`, errorData);
            return res.status(response.status).json({ 
                error: 'Errore API Gemini',
                details: errorData.error?.message || 'Sconosciuto'
            });
        }

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            return res.status(500).json({ error: 'Risposta API non valida' });
        }

        const text = data.candidates[0].content.parts[0].text;

        // Format compatible with frontend
        res.status(200).json({
            choices: [{
                message: {
                    role: 'assistant',
                    content: text
                }
            }]
        });
    } catch (error) {
        console.error('Errore Gemini API:', error.message);
        res.status(500).json({
            error: 'Errore durante la comunicazione con Gemini',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Errore interno'
        });
    }
};
