const { GoogleGenerativeAI } = require('@google/generative-ai');

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
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        // Estrai il messaggio dell'utente
        const userMessage = messages[messages.length - 1].content;

        // Prompt di sistema + messaggio utente
        const prompt = `Sei Worky-AI, un assistente esperto del mercato del lavoro a Bologna. Aiuti gli utenti a trovare lavoro, migliorare il profilo e capire come usare la piattaforma Worky.

Utente: ${userMessage}

Rispondi in modo professionale e conciso:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Formato compatibile con il frontend (simile a OpenAI/DeepSeek)
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
