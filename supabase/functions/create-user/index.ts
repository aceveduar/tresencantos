// Edge Function: create-user
//
// Da de alta una cuenta de Supabase Auth (rol + acceso) sin que nadie tenga
// que entrar al Dashboard de Supabase. Reemplaza el flujo anterior de
// _upAddUser() (settings.js), donde Eduardo tenía que crear la cuenta a
// mano en Authentication → Users antes de poder asignarle rol y permisos
// aquí.
//
// Dos modos (decidido 2026-09-12, Eduardo quiso ambos en vez de uno solo):
// - Con `password`: crea la cuenta ya activa con esa contraseña
//   (email_confirm:true, sin paso de verificación) -- quien la crea se la
//   comparte a la persona por el canal que prefiera (WhatsApp, de palabra).
// - Sin `password`: manda una invitación por correo (inviteUserByEmail) --
//   la persona fija su propia contraseña desde el enlace que le llega.
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

  let body: { email?: string; role?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "Cuerpo inválido" }, 400); }

  const email    = (body?.email || "").trim().toLowerCase();
  const role     = body?.role || "";
  const password = body?.password || ""; // vacío = mandar invitación por correo
  if (!email || !email.includes("@")) return json({ error: "Correo inválido" }, 400);
  if (!VALID_ROLES.includes(role)) return json({ error: "Rol inválido" }, 400);
  if (password && password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);

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

  const viaPassword = password.length > 0;
  const { error: createErr } = viaPassword
    ? await adminClient.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { role },
      })
    : await adminClient.auth.admin.inviteUserByEmail(email, { data: { role } });

  if (createErr) {
    const msg = /already.*registered|already.*exists/i.test(createErr.message || "")
      ? "Ese correo ya tiene una cuenta"
      : (createErr.message || "No se pudo crear la cuenta");
    return json({ error: msg }, 400);
  }

  // Auditoría -- misma tabla/patrón que el resto del proyecto: toda acción
  // sensible queda registrada, sin excepción. Nunca se guarda la contraseña.
  await adminClient.from("activity_log").insert({
    action: "usuario_creado",
    user_email: callerEmail,
    summary: `Creó la cuenta de ${email} (${role})${viaPassword ? '' : ' y le envió invitación por correo'}`,
    meta: { email, role, via: viaPassword ? 'password' : 'invite' },
  });

  return json({ ok: true });
});
