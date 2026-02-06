module.exports = async (req, res) => {
    // Abilita CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metodo non consentito' });
    }

    const { messages } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Configurazione API Key mancante sul server' });
    }

    try {
        // Usa REST API direttamente senza SDK
        const userMessage = messages[messages.length - 1].content;

        const prompt = `Sei Worky-AI, un assistente esperto del mercato del lavoro a Bologna. Aiuti gli utenti a trovare lavoro, migliorare il profilo e capire come usare la piattaforma Worky.

Utente: ${userMessage}

Rispondi in modo professionale e conciso:`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`,
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
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Gemini API error: ${errorData}`);
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;

        // Formato compatibile con il frontend
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
            details: error.message
        });
    }
};
