// Content Moderation Function for Work-in-Progress
// Moderates job listings, reviews, and chat messages for inappropriate content

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

interface ModerationRequest {
  content: string;
  type: 'listing' | 'review' | 'message';
  userId?: string;
}

interface ModerationResponse {
  approved: boolean;
  flags: string[];
  reason?: string;
  score: number;
}

// Dangerous patterns that should be blocked
const DANGEROUS_PATTERNS = {
  xss: /<script|<iframe|javascript:|onerror=|onclick=/gi,
  sqlInjection: /('|"|-{2}|\/\*|\*\/|;)/g,
  urls: /https?:\/\/|www\.|\.com|\.it|@/gi,
  hate: /odio|razzismo|discrimina/gi,
  abuse: /insulto|offesa|parolaccia/gi,
  illegal: /droga|arma|contrabbando|illegale/gi
};

// Severity levels
const SEVERITY = {
  CRITICAL: 3,  // XSS, SQL Injection, URLs in content
  HIGH: 2,      // Hate speech, abuse
  MEDIUM: 1,    // Warnings
  LOW: 0        // OK
};

function moderateContent(content: string, type: string): ModerationResponse {
  const flags: string[] = [];
  let severity = SEVERITY.LOW;

  if (!content || content.length === 0) {
    return {
      approved: false,
      flags: ['Contenuto vuoto'],
      reason: 'Il contenuto non può essere vuoto',
      score: SEVERITY.CRITICAL
    };
  }

  if (content.length > 5000) {
    return {
      approved: false,
      flags: ['Contenuto troppo lungo'],
      reason: 'Il contenuto non deve superare 5000 caratteri',
      score: SEVERITY.CRITICAL
    };
  }

  // Check for XSS
  if (DANGEROUS_PATTERNS.xss.test(content)) {
    flags.push('Rilevato tentativo di XSS/Injection');
    severity = SEVERITY.CRITICAL;
  }

  // Check for SQL Injection patterns (restrictive)
  const sqlPatterns = /('|"|-{2}|\/\*|\*\/);/g;
  if (sqlPatterns.test(content)) {
    flags.push('Pattern SQL rilevato');
    severity = SEVERITY.CRITICAL;
  }

  // Check for URLs (not allowed in listings and reviews)
  if ((type === 'listing' || type === 'review') && DANGEROUS_PATTERNS.urls.test(content)) {
    flags.push('Link non consentiti nel tipo di contenuto specificato');
    severity = SEVERITY.CRITICAL;
  }

  // Check for hate speech
  if (DANGEROUS_PATTERNS.hate.test(content.toLowerCase())) {
    flags.push('Linguaggio offensivo rilevato');
    severity = Math.max(severity, SEVERITY.HIGH);
  }

  // Check for abuse
  if (DANGEROUS_PATTERNS.abuse.test(content.toLowerCase())) {
    flags.push('Abuso/insulti rilevati');
    severity = Math.max(severity, SEVERITY.HIGH);
  }

  // Check for illegal content
  if (DANGEROUS_PATTERNS.illegal.test(content.toLowerCase())) {
    flags.push('Contenuto potenzialmente illegale');
    severity = Math.max(severity, SEVERITY.HIGH);
  }

  // Check for duplicate or spam (simple heuristic)
  if ((content.match(/./g) || []).length > 0) {
    const uniqueChars = new Set(content).size;
    const ratio = uniqueChars / content.length;
    if (ratio < 0.1) {
      flags.push('Possibile spam (basso fattore di varietà)');
      severity = Math.max(severity, SEVERITY.MEDIUM);
    }
  }

  const approved = severity < SEVERITY.CRITICAL;

  return {
    approved,
    flags: flags.length > 0 ? flags : ['Nessun problema rilevato'],
    reason: flags.length > 0 ? `Motivo: ${flags[0]}` : undefined,
    score: severity
  };
}

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://jml-gamma-v2.vercel.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Metodo non consentito' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body: ModerationRequest = await req.json();

    // Validate request
    if (!body.content || typeof body.content !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Contenuto mancante o non valido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['listing', 'review', 'message'].includes(body.type)) {
      return new Response(
        JSON.stringify({ error: 'Tipo di contenuto non valido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Moderate content
    const result = moderateContent(body.content, body.type);

    // Log moderation result (for monitoring)
    console.log({
      timestamp: new Date().toISOString(),
      userId: body.userId || 'unknown',
      type: body.type,
      approved: result.approved,
      flags: result.flags,
      score: result.score
    });

    return new Response(JSON.stringify(result), {
      status: result.approved ? 200 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Moderation error:', error);
    return new Response(
      JSON.stringify({
        error: 'Errore durante la moderazione',
        details: Deno.env.get('ENVIRONMENT') === 'development' ? error.message : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
