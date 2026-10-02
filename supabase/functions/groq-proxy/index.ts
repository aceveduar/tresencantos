// Edge Function: groq-proxy (2026-10-02)
//
// Antes, Inventario leía config.groq_key y llamaba a Groq directo desde el
// navegador: cualquier persona con sesión podía leer la clave (pendiente de
// seguridad de CLAUDE.md). Ahora la clave solo se lee aquí, con la
// service_role key, y el navegador manda únicamente el contenido a analizar.
//
// Seguridad: quien llama manda su JWT; se verifica con get_my_permissions()
// (la misma fuente de permisos que el resto de la app) que tenga alguno de
// los permisos de Inventario que usan IA (Completar con IA, Captura rápida,
// Recepción con IA). Nunca se confía en lo que el cliente diga de sí mismo.
//
// El modelo lo sigue fijando el cliente (GROQ_VISION_MODEL en
// admin-images.js) para que cambiarlo no requiera redesplegar esto; aquí
// solo se valida que sea un nombre razonable.
//
// Despliegue: supabase functions deploy groq-proxy --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const AI_PERMISSIONS = ["canAddProduct", "canEditProduct", "canUseReceptionIA", "canReceiveStock"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Falta el token de sesión" }, 401);

  let body: { model?: string; content?: unknown; max_completion_tokens?: number; reasoning_effort?: string };
  try { body = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }

  const model = String(body?.model || "");
  if (!/^[\w.\-\/:]{3,100}$/.test(model)) return json({ error: "Modelo inválido" }, 400);
  if (!body?.content || (typeof body.content !== "string" && !Array.isArray(body.content))) {
    return json({ error: "Falta el contenido a analizar" }, 400);
  }
  const maxTokens = Math.min(Math.max(Number(body.max_completion_tokens) || 700, 50), 8000);

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: perms, error: permsErr } = await callerClient.rpc("get_my_permissions");
  if (permsErr || !perms || !AI_PERMISSIONS.some((p) => perms[p] === true)) {
    return json({ error: "No tienes permiso para usar la IA" }, 403);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: cfg } = await adminClient.from("config").select("value").eq("id", "groq_key").maybeSingle();
  const groqKey = (cfg?.value || "").trim();
  if (!groqKey) return json({ error: "Configura la IA en Configuración", code: "no_key" }, 412);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  let groqResp: Response;
  try {
    groqResp = await fetch(GROQ_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: body.content }],
        response_format: { type: "json_object" },
        reasoning_effort: body.reasoning_effort || "none",
        temperature: 0.3,
        max_completion_tokens: maxTokens,
        stream: false,
      }),
    });
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return json({ error: aborted ? "La IA tardó demasiado; intenta de nuevo" : "No se pudo conectar con Groq" }, aborted ? 504 : 502);
  } finally {
    clearTimeout(timeoutId);
  }

  // Se reenvía tal cual el status y el cuerpo de Groq: el cliente ya sabe
  // interpretar sus errores (_groqErrorMessage en admin-images.js).
  const text = await groqResp.text();
  return new Response(text, {
    status: groqResp.status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
