// Edge Function: drive-proxy (2026-10-07)
//
// Antes, Inventario y Configuración leían config.drive_secret y llamaban al
// Apps Script directo desde el navegador: cualquier persona con sesión podía
// leer el secreto y listar/borrar fotos de Drive por su cuenta. Ahora el
// secreto solo se lee aquí, con la service_role key (mismo modelo que
// groq-proxy).
//
// Acciones:
//   upload {image, name}  → canAddProduct | canEditProduct | canReceiveStock | canUseReceptionIA
//   delete {fileId}       → mismos permisos (el formulario borra las fotos que se quitan)
//   list                  → canManageSettings | canImportExport (auditoría en Configuración → Datos)
//
// Despliegue: supabase functions deploy drive-proxy --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const INVENTORY_PERMISSIONS = ["canAddProduct", "canEditProduct", "canReceiveStock", "canUseReceptionIA"];
const LIST_PERMISSIONS = ["canManageSettings", "canImportExport"];

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
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ ok: false, error: "Falta el token de sesión" }, 401);

  let body: { action?: string; image?: string; name?: string; fileId?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Cuerpo inválido" }, 400); }

  const action = body?.action || "upload";
  let forward: Record<string, unknown>;
  let needed: string[];
  if (action === "upload") {
    const image = String(body?.image || "");
    if (!/^data:image\/[\w.+-]+;base64,/.test(image)) return json({ ok: false, error: "Imagen inválida" }, 400);
    const name = String(body?.name || `producto_${Date.now()}.jpg`).replace(/[^\w.\-]/g, "_").slice(0, 80);
    forward = { image, name };
    needed = INVENTORY_PERMISSIONS;
  } else if (action === "delete") {
    const fileId = String(body?.fileId || "");
    if (!/^[\w-]{10,100}$/.test(fileId)) return json({ ok: false, error: "fileId inválido" }, 400);
    forward = { action: "delete", fileId };
    needed = INVENTORY_PERMISSIONS;
  } else if (action === "list") {
    forward = { action: "list" };
    needed = LIST_PERMISSIONS;
  } else {
    return json({ ok: false, error: "Acción inválida" }, 400);
  }

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: perms, error: permsErr } = await callerClient.rpc("get_my_permissions");
  if (permsErr) return json({ ok: false, error: "Sesión inválida" }, 401);
  if (!perms || !needed.some((p) => perms[p] === true)) {
    return json({ ok: false, error: "No tienes permiso para esta acción de Drive" }, 403);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: rows } = await adminClient.from("config").select("id,value").in("id", ["drive_ep", "drive_secret"]);
  const cfg = Object.fromEntries((rows || []).map((r: { id: string; value: string }) => [r.id, (r.value || "").trim()]));
  if (!cfg.drive_ep || !cfg.drive_secret) {
    return json({ ok: false, error: "Google Drive no está configurado", code: "no_drive" }, 412);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), action === "list" ? 110000 : 50000);
  try {
    // Apps Script responde con un redirect a googleusercontent; fetch lo sigue.
    const resp = await fetch(cfg.drive_ep, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ secret: cfg.drive_secret, ...forward }),
    });
    const text = await resp.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { return json({ ok: false, error: "Drive respondió algo inesperado" }, 502); }
    return json(data);
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    return json({ ok: false, error: aborted ? "Drive tardó demasiado" : "No se pudo conectar con Drive" }, aborted ? 504 : 502);
  } finally {
    clearTimeout(timeoutId);
  }
});
