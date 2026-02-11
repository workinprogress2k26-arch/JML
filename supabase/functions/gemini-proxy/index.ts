async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const body = document.getElementById('ai-chat-body');
    const modelSelect = document.getElementById('ai-model-select');
    const userMsg = input.value.trim();

    if (!userMsg) return;

    appendMessage('user', userMsg, body);
    input.value = '';

    const thinking = document.createElement('div');
    thinking.className = 'message ai glass thinking';
    thinking.textContent = `Worky-AI sta elaborando...`;
    body.appendChild(thinking);

    try {
        // CHIAMATA SICURA: Non passiamo nessuna chiave qui!
        const { data, error } = await supabaseClient.functions.invoke('gemini-proxy', {
            body: { 
                message: userMsg, 
                model: modelSelect.value 
            }
        });

        if (body.contains(thinking)) body.removeChild(thinking);

        if (error) throw error; // Se Supabase risponde con errore (es. 404 o 500)

        // Se tutto è ok, data.reply contiene la risposta dell'IA
        appendMessage('ai', data.reply, body);

    } catch (e) {
        if (body.contains(thinking)) body.removeChild(thinking);
        console.error("Errore:", e);
        appendMessage('ai', "Errore: La funzione non risponde. Controlla i log su Supabase.", body);
    }
}