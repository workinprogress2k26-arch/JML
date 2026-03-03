/**
 * Configuration file for Work-in-Progress
 * In production, these values should come from environment variables
 * For client-side apps, use .env.local and build tools (Vercel/Vite)
 */

const CONFIG = {
  SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://qtmfgmrigldgodxrecue.supabase.co',
  SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0bWZnbXJpZ2xkZ29keHJlY3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzMwMDYsImV4cCI6MjA4NTk0OTAwNn0.sHywE9mS6HU5-GOEt5_riL_9aywsNZE8iplVAQsGMf8',
  ALLOWED_ORIGINS: ['https://jml-gamma-v2.vercel.app', 'http://localhost:3000', 'http://localhost:5173'],
  API_TIMEOUT: 10000,
  MAX_RETRIES: 3
};

// Validate configuration
function validateConfig() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    console.warn('⚠️ Attenzione: Credenziali Supabase non configurate correttamente');
  }
}

validateConfig();

// Prevent exposure in console
Object.freeze(CONFIG);

export default CONFIG;
