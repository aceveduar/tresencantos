// Edge Function: create-user
//
// Da de alta una cuenta de Supabase Auth (rol + invitación por correo) sin
// que nadie tenga que entrar al Dashboard de Supabase. Reemplaza el flujo
// anterior de _upAddUser() (settings.js), donde Eduardo tenía que crear la
// cuenta a mano en Authentication → Users antes de poder asignarle rol y
// permisos aquí.
//
// La service_role key SOLO vive como secret de esta función (Dashboard →
// Edge Functions → create-user → Secrets), nunca en el código ni en el
// navegador -- mismo principio de "regla de oro" que el resto del proyecto.
//
// Seguridad: quien llama manda su propio JWT de sesión (te_admin_session);
// esta función lo usa para (1) confirmar quién es y (2) llamar
// get_my_permissions() con ESE jwt -- exactamente la misma verificación de
// permisos que ya usa el resto de la app -- antes de tocar nada con la
// service_role key. Nunca se confía en lo que el cliente diga sobre sí
// mismo.
//
// Despliegue: `supabase functions deploy create-user` (requiere el CLI de
// Supabase y estar logueado/linkeado al proyecto). Después, configurar el
// secret SERVICE_ROLE_KEY desde el Dashboard o con
// `supabase secrets set SERVICE_ROLE_KEY=...`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SERVICE_ROLE_KEY")!;

const VALID_ROLES = ["superadmin", "encargado", "operador"];

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

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Falta el token de sesión" }, 401);

  let body: { email?: string; role?: string };
  try { body = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }

  const email = (body?.email || "").trim().toLowerCase();
  const role  = body?.role || "";
  if (!email || !email.includes("@")) return json({ error: "Correo inválido" }, 400);
  if (!VALID_ROLES.includes(role)) return json({ error: "Rol inválido" }, 400);

  // Cliente con el JWT de quien llama -- para saber quién es y si de
  // verdad tiene el permiso, nunca confiar en el cliente sobre sí mismo.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });

  const { data: perms, error: permsErr } = await callerClient.rpc("get_my_permissions");
  if (permsErr || !perms?.canManageSettings) {
    return json({ error: "No tienes permiso para crear usuarios" }, 403);
  }

  const { data: { user: callerUser } } = await callerClient.auth.getUser();
  const callerEmail = callerUser?.email || "desconocido";

  // Cliente con service_role -- la única forma de crear cuentas de Auth.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { role },
  });
  if (inviteErr) {
    const msg = /already.*registered|already.*exists/i.test(inviteErr.message || "")
      ? "Ese correo ya tiene una cuenta"
      : (inviteErr.message || "No se pudo crear la cuenta");
    return json({ error: msg }, 400);
  }

  // Auditoría -- misma tabla/patrón que el resto del proyecto: toda acción
  // sensible queda registrada, sin excepción.
  await adminClient.from("activity_log").insert({
    action: "usuario_creado",
    user_email: callerEmail,
    summary: `Creó la cuenta de ${email} (${role}) y le envió invitación por correo`,
    meta: { email, role },
  });

  return json({ ok: true });
});
