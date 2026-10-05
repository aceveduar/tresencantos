# CLAUDE.md — Tres Encantos

Documentación vigente del proyecto. Última reconciliación: 2026-10-02 · `sw.js` `CACHE_VERSION = 'v577'`.

> **Fuente de verdad:** para comportamiento ejecutable manda el código; para reglas de negocio y decisiones UX manda este documento.
> **Historial completo** (bitácora fecha por fecha, razonamiento detrás de cada decisión, bugs resueltos): [assets/HISTORIAL.md](assets/HISTORIAL.md). No se carga solo — consultarlo con grep cuando haga falta el "por qué" de algo. Este archivo solo describe el estado actual.
> **Regla para mantener este archivo corto:** los cambios nuevos se documentan aquí solo si cambian una regla, una convención o una lección de "no reintentar". El detalle narrativo va en el mensaje de commit (o, si es largo, al final de `assets/HISTORIAL.md`).

---

## Rol de Claude

Actuar como **experto en UX/UI para e-commerce, redactor y estratega de conversión**:
- **Mobile first** — toda decisión se valida primero en 360–430px.
- **Estándar e-commerce** (ZARA, Amazon, Shopify, H&M): CTA siempre visible sin scroll, imágenes sin recorte, jerarquía clara, navegación predecible. Señalar y corregir lo que no cumpla aunque no se pida.
- Proponer mejoras de diseño/copy/usabilidad proactivamente; dar la mejor recomendación aunque difiera de lo que pide el usuario.
- Priorizar a la usuaria final (Ofelia, Areli y sus clientas) sobre preferencias técnicas.

**Preferencias confirmadas de Eduardo:**
- **Minimalismo literal**: sin tintes/acentos de color para "jerarquía", sin emoji decorativos en UI (íconos SVG de línea, `stroke="currentColor"`, trazo 1.75). Emoji sí en mensajes de WhatsApp.
- **No sobrecargar la interfaz**: extender pantallas/menús existentes antes de crear nuevos.
- **Ofelia ve poco**: la letra nunca se achica; el espaciado sí se puede apretar.
- **Tamaño táctil mínimo 44px** (con *hit slop* `::after{inset:-7px}` si el botón visual debe ser chico).

| Módulo | Referencias |
|---|---|
| Caja | Shopify POS, Square POS, Clip |
| Inventario | Shopify Admin, WooCommerce, Airtable |
| Reportes | Shopify Analytics, Square Dashboard |
| Tienda | ZARA, H&M, Amazon |
| Navegación | Shopify Admin mobile |

Principios: lo visible en una tarjeta no se repite en su modal · thumbnails inline (24–32px) en listas de Caja · modales/cards de Reportes solo texto · acciones destructivas con `stopPropagation` y confirmación · búsqueda mobile con ✕ para limpiar.

---

## Descripción y stack

Panel de administración + POS + reportes + sitio e-commerce para **Tres Encantos**, boutique mexicana (bolsos, accesorios, maquillaje, Natura/Avon) en Maquixco, Teotihuacán. Dueña: **Ofelia** (consultora Diamond Natura). En la Tienda los pedidos se arman en carrito y se cierran por WhatsApp — sin pago en línea.

- **Frontend:** HTML + CSS + Vanilla JS, sin framework ni bundler.
- **Backend:** Supabase (PostgREST + RPC SECURITY DEFINER + RLS). Project URL `https://qxvrggmpaqhslgdmbhqw.supabase.co`.
- **Auth:** Supabase Auth JWT en `localStorage.te_admin_session` (`{access_token, refresh_token, expires_at}`; válida si `expires_at > now+60s`).
- **Hosting:** archivos estáticos. Eduardo prueba en GitHub Pages (`https://aceveduar.github.io/tresencantos/`) y producción es Netlify (`tresencantos.netlify.app`, con error/404 desde 2026-10-02: Eduardo decide si lo paga o lo arregla). Los enlaces generados (`SITE_URL`) son relativos al sitio donde se abre, así que funcionan en ambos; solo `og:*`/`canonical` de `index.html` y el fallback local de `app.js` fijan un dominio (hoy GitHub Pages: cambiarlos si Netlify vuelve). Rutas siempre relativas (en Pages el sitio vive en `/tresencantos/`). PWA (`manifest.json` + `sw.js`).
- **Fuentes:** Inter (UI) + Playfair Display (solo el número protagonista de una tarjeta y títulos) + Dancing Script.
- **IA:** Groq, modelo `qwen/qwen3.8-27b` (constante `GROQ_VISION_MODEL`, `admin-images.js`). Toda llamada pasa por la Edge Function `groq-proxy` (valida permisos de Inventario con el JWT y pone la clave en el servidor); `groq_key` no es legible desde el navegador (política de `config`), el cliente solo consulta `te_ai_configured()`. Desplegar con `supabase functions deploy groq-proxy --use-api`. Imágenes en Google Drive vía Apps Script proxy.

---

## Módulos y archivos

Usar siempre estos nombres en UI y conversación (nunca "Admin", "POS", "Stats"):

| Archivos | Nombre | Uso |
|---|---|---|
| `index.html` `app.js` `style.css` | **Tienda** | Sitio público (anon key) |
| `admin.html` `admin.css` `admin*.js` | **Inventario** | CRUD productos |
| `pos.html` `pos.css` `pos-*.js` | **Caja** | Punto de venta |
| `stats.html` `stats.css` `stats.js` | **Reportes** | Estadísticas |
| `activity.html` `activity.css` `activity.js` | **Actividad** | Log de auditoría |
| `settings.html` `settings.css` `settings.js` | **Configuración** | Ajustes globales |
| `shared.js` `shared.css` | — | Común a los 5 módulos admin (menú avatar, PIN, campana, offline, permisos de nav, tema) |

Inventario: `admin.js` (core, auth, carga) · `admin-render.js` (cards/tabla/inline edits) · `admin-form.js` (formulario, kits, fotos) · `admin-images.js` (Drive, Groq) · `admin-bulk.js` · `admin-scanner.js` (escáner, duplicados, archivar) · `admin-utils.js` · `admin-recv.js` (Recibir mercancía) · `admin-recv-ia.js` (Recepción con IA) · `admin-capture.js` (Captura rápida) · `admin-qv.js` (Quick View) · `admin-kit-builder.js`.
Caja: `pos-core.js` (config, auth, API, catálogo, turnos) · `pos-cart.js` (carrito, corte, gastos) · `pos-ui.js` (historial, detalle) · `pos-apartados.js` · `pos-checkout.js` (cobrar, escáner, init).
Otros: `supabase/migrations/` (SQL versionado) · `supabase/functions/create-user/` (Edge Function para crear usuarios) · `assets/MANUAL.md` (manual de usuario) · `assets/apps_script_actualizado.gs` (código del Apps Script de Drive) · `img/`.

**Navegación:** topbar con íconos de Caja, Inventario, Reportes, Tienda. Actividad, Configuración, "Mi PIN", "Modo oscuro", "Avisarme al vender" (solo superadmin) y Cerrar sesión viven en el menú del avatar. Sin botón "atrás". `_applyNavPermissions()` (`shared.js`) oculta íconos según permisos.

---

## Supabase

### Tablas
- **`products`** — `id` (lo asigna la BD con `products_id_seq`; **nunca calcularlo en el cliente** — crear con `Prefer: return=representation` y leer el id de la respuesta. Un trigger adelanta la secuencia si se inserta con id explícito, como Importar JSON o Deshacer eliminar), `name`, `category`/`category_label`, `price`, `original_price`, `cost` (interno), `description`, `image` (principal), `images` jsonb (adicionales, máx 5), `badge`/`badge_type` (`best|new|promo|natura`), `featured`, `out_of_stock`, `is_apartado`, `stock`, `barcode`, `supplier_code` (código del proveedor, enseña a Recepción con IA), `position`, `is_published`, `is_archived`, `kit_items` jsonb `[{id,name,qty}]`, `expiry_date`, `created_by`.
- **`sales`** — `id`, `items` jsonb (snapshot; `kit_items` histórico por item), `total`, `discount`, `payment_method`, `note`, `customer` (texto `"Nombre · 📱 Tel"` — ese separador es formato de dato, no tocar), `customer_id` → `customers`, `due_date`, `seller_email`, **`origin_type`** (`venta|apartado`, inmutable), **`status`** (`activo|liquidado|cancelado`), `paid_amount`, `created_at` (inmutable), `liquidated_at`, `last_payment_at`, `cancelled_at`, `updated_at`, `version` (optimista). `type` solo por compatibilidad — la lógica usa `origin_type`+`status`.
- **`sale_payments`** — libro monetario **append-only**: `sale_id`, `request_id`, `kind` (`payment|refund|adjustment`), `amount` (con signo), `method`, `paid_at`, `collected_by_email`, `source` (`rpc_direct_sale|rpc_apartado_initial|rpc_apartado_payment|rpc_apartado_liquidation|rpc_apartado_reactivation|…`), `meta`. **Todo el dinero se calcula desde aquí por `paid_at`.**
- **`customers`** — `name`, `phone` (único parcial, 10 dígitos), `notes`. Alta solo vía `te_find_or_create_customer`.
- **`cash_shifts`** — turnos de caja (`opened_at`, `closed_at`, `fondo_inicial`, `conteo_final`, `efectivo_neto`, `gastos_total`, `esperado`, `diferencia`, `status abierto|cerrado|cerrado_auto`). **`cash_shift_expenses`** — gastos del turno.
- **`config`** — `categories`, `revista_url`, `revista_cover`, `wa_float`, `groq_key`, `drive_ep`, `drive_secret`, `user_names`, `user_permissions`, toggles (`captura_rapida`, `show_creator`, `show_recv`, `show_recv_ia`, `show_restock`), etc.
- **`activity_log`** (`action`, `user_email`, `summary`, `meta`), **`pos_rpc_requests`** (idempotencia, privada), **`permission_overrides`** + **`user_pins`** (PIN de gerente), **`recently_edited`**, **`usage_log`**.

### Reglas de datos
- **Stock:** marcar disponible con stock=0 → stock=1. Vender hasta 0 → `out_of_stock=true`.
- **Kits:** `stock=0` y `out_of_stock=false` siempre en BD; disponibilidad = `min(floor(comp.stock/comp.qty))`. Vender/cancelar descuenta/restaura componentes.
- **Tienda muestra** `is_published=true AND category≠por_revisar AND (out_of_stock=false OR is_apartado=true)`.
- **Archivar** (`is_archived=true` + oculto + agotado) es el borrado reversible preferido; nunca borrado real masivo (un producto puede ser componente vivo de un kit).
- **No borrar un producto que esté en un apartado activo** (ni como componente de kit): lo exige `te_delete_products` en servidor (y `_productsInActiveApartados()` lo avisa antes en el cliente) — las RPC de editar/cancelar exigen que todos los productos existan.
- **Categorías** en `config.categories` (`{code,label,color,parent?}`, 7 raíces). Riesgo: renombrar/eliminar un código deja productos huérfanos invisibles en filtros. Si un producto "desaparece" del filtro pero aparece en búsqueda, comparar su `category` contra los códigos vigentes.

### Roles y permisos
3 roles. **El servidor toma el rol de `config.user_permissions[email].role`** (lo que se edita en Configuración → Usuarios y Permisos); si el mapa existe y la persona no está, es `operador`. `user_metadata.role` solo lo usa el cliente como respaldo visual mientras carga `get_my_permissions()` — y cada usuario puede editar su propio `user_metadata`, así que **nunca** usarlo para autorizar en servidor. `duena` = alias de `superadmin`.
- **superadmin** — Eduardo, Ofelia. Todo.
- **encargado** — Areli y Renata (2026-10-02). Confianza operativa total en Caja/Inventario, sin Reportes/Actividad/Configuración.
- **operador** — punto de partida para gente nueva; casi nada por default.

Permisos (`UP_PERMS`/`UP_ROLE_DEFAULTS`, `shared.js`): `canAddProduct canEditProduct canUseReceptionIA canReceiveStock canDeleteProduct canPublishProduct canBulkDelete canCancelSale canEditApartado canOverridePrice canApplyDiscount canCloseShiftUnsupervised canViewReports canViewActivity canManageSettings canManageCatalogSettings canImportExport`.
- Overrides por persona en `config.user_permissions`, editables en Configuración → Usuarios y Permisos (lista o matriz). Solo se escriben vía `te_save_user_permissions` (exige `canManageSettings`, registra el diff en Actividad). El resto de `config` vía `te_save_config_value` (valida el permiso según el `id`: Catálogo → `canManageCatalogSettings`, `user_names` → `canImportExport`, `flagged_products`/`dismissed_dups` → `canEditProduct`, lo demás → `canManageSettings`). **Nunca escribir `config` con POST directo**: solo funciona para superadmin y falla en silencio para los demás. En Inventario usar `_saveConfigValue()` (`admin.js`); en Configuración, su homónima en `settings.js`.
- **Fuente autoritativa:** RPC `get_my_permissions()`. `sessionStorage.te_user_can` es solo caché offline; los módulos restringidos siempre consultan al servidor.
- **Todo permiso nuevo debe agregarse en los dos lados**: `shared.js` y `_te_permission_for_email()`/`get_my_permissions()` en Postgres (ya pasó que solo existía en la UI y no tenía efecto real).
- **PIN de gerente:** quien no tiene un permiso puede hacer la acción si alguien que sí lo tiene teclea su propio PIN en ese dispositivo (`requestOverride()` en `shared.js` → ticket de un solo uso, 5 min). Botones siempre visibles; es la acción la que pide autorización. 5 intentos fallidos/10 min bloquean. Cubre precio, descuento, cancelar, editar/reembolsar apartado, cerrar turno con diferencia grande. No cubre Inventario.
- Sin `canPublishProduct`: crear producto → se guarda oculto, y pasar de oculto a publicado se rechaza (trigger `te_products_publish_guard` en servidor; ocultar sí se permite).
- Cambiar rol: Configuración → Usuarios y Permisos. Crear usuarios: desde Configuración (Edge Function `create-user`).

### Seguridad (estado verificado 2026-10-02)
- **Nunca** `service_role key` en el cliente. Cliente usa `SUPABASE_ANON_KEY` como `apikey` + JWT del usuario como Bearer.
- **anon** (Tienda) solo lee: `products` publicados y solo las columnas que usa `app.js` (sin `cost`/`barcode`/`supplier_code`) + `config` `categories,wa_float,revista_url,revista_cover,sales_counts`. Solo puede ejecutar la RPC `te_log_failed_login`.
- **`sales` no acepta INSERT/UPDATE/DELETE directo** de nadie: solo las RPC v2. Lectura abierta a autenticados.
- **`products` no acepta DELETE directo**: solo `te_delete_products` (permiso + registro + apartados activos) y `te_undo_duplicate_product`.
- **`activity_log`**: un trigger fija `user_email` y `created_at` desde el JWT en inserts directos (no se puede escribir a nombre de otra persona ni con fecha falsa).
- Auxiliares internas sin EXECUTE para `authenticated`: `te_refund_sale_balance`, `te_rpc_store`, `te_rpc_replay`, `te_snapshot_sale_items`, `te_consume_override`, `te_log_activity` (antes una cajera podía registrar devoluciones falsas llamando la primera directo).
- **`product_changes`** (caja negra): trigger que registra todo cambio manual de precio/costo/stock/agotado/publicado/archivado/nombre (quién, cuándo, antes→después). Excluye las RPC de venta (`rpc_v2`). Solo lectura superadmin. Se decidió esto en vez de bloquear precio/stock por permiso fino (los operadores tienen `canEditProduct` por defecto y precio/costo cambian desde 3 permisos distintos).
- Políticas RLS escritas `TO anon`/`TO authenticated` (no `auth.role() = …` en `TO public`) y `get_user_role()` dentro de `(select …)`.
- Toda función nueva nace sin EXECUTE para anon/PUBLIC (default privileges); dar `GRANT EXECUTE … TO authenticated` explícito. Helpers internos (llamados solo por otras SECURITY DEFINER) no se dan a `authenticated`.
- RLS combina políticas permisivas con **OR**: una política vieja `USING (true)` anula todas las demás. Al auditar, revisar `pg_policies` completo, no solo las políticas nuevas.
- Para auditar: `supabase db advisors --linked` y consultas con la anon key de `app.js`.

### RPC de Caja v2 (únicas que mutan dinero/stock de ventas)
`record_sale_atomic_v2`, `record_apartado_payment_atomic`, `edit_apartado_atomic`, `cancel_sale_atomic`, `refund_apartado_atomic`, `reactivate_apartado_atomic`, `te_open_cash_shift`, `te_close_cash_shift`, `te_add_shift_expense`, `te_cancel_shift_expense`. Todas idempotentes por `p_request_id` (el cliente reintenta con el mismo UUID vía `posRpc()`), con lock de inventario, versión optimista, snapshots de kits y registro en Actividad dentro de la misma transacción. Escriben con `SET LOCAL tresencantos.rpc_v2='on'`.
- **Nunca** modificar `created_at`; nunca borrar ni editar filas de `sale_payments` (las correcciones son filas nuevas).
- Cambiar la firma de una RPC: `DROP FUNCTION` de la firma vieja antes de crear la nueva — si no, quedan overloads y PostgREST/SQL dan "is not unique". Hoy no hay ninguna función duplicada (limpiado 2026-09-30).

### Respaldos
Supabase no tiene backups en este plan (sin PITR, lista vacía). `scripts/respaldo-supabase.ps1` exporta todas las tablas de `public` (JSON), el esquema (funciones, políticas, triggers, columnas, permisos) y `auth.users` sin contraseñas, a `Documents\TresEncantos-Respaldos\TresEncantos_<fecha>.zip` (conserva 30; bitácora en `respaldo.log`). Tarea programada de Windows "TresEncantos - Respaldo Supabase", diaria 21:30 (corre al encender si estaba apagada). Usa la sesión del CLI: si falla con error de sesión, `supabase login`. Cómo restaurar: `LEEME.txt` dentro de cada zip.

### Pruebas y errores
- **Pruebas automáticas:** `powershell -ExecutionPolicy Bypass -File scripts\pruebas.ps1` corre `scripts/pruebas/caja.sql` contra la base real dentro de `BEGIN … ROLLBACK` (venta, apartado + abono, cancelación, gastos/ingresos/retiros, cierre de turno, y los candados de seguridad). Correrlo antes de publicar cualquier cambio que toque dinero, stock, turnos o permisos; al agregar una regla de negocio nueva, agregarle su verificación ahí. Usa las cuentas `test@` (cajera) y `ofe@` (cancela).
- **Errores de la app:** `shared.js` manda los errores de JS no atrapados a `te_log_client_error` (tabla `client_errors`, deduplica 24 h, máx. 30/h por persona; ignora errores de red y de scripts ajenos). Se ven en Configuración → Datos → "Errores de la app" (solo superadmin). Revisarlo cuando alguien diga "no sirve".

### Migraciones
- Se ejecutan con `supabase db query --linked -f supabase/migrations/<archivo>.sql` (el CLI está enlazado) o pegándolas en el SQL Editor. El historial de migraciones de Supabase está vacío porque siempre se corrieron a mano; para saber si algo se aplicó, **consultar el estado real** (`pg_proc`, `pg_policies`, `information_schema`), no el historial.
- Probar cambios a RPC dentro de `BEGIN … ROLLBACK` simulando el JWT (`set_config('request.jwt.claims', …)` + `set_config('role','authenticated')`), llamando con argumentos nombrados.

---

## Inventario

- `products[]` global en cliente; Supabase primero, el array local solo cambia si el request fue exitoso. Catálogo cacheado en `localStorage.te_products_cache` para offline.
- Vistas Lista/Grid (mobile: lista = cards anchas, grid = 2 columnas compactas sin etiqueta de categoría) y tabla en desktop; scroll infinito de 50 (`ADMIN_PAGE_SIZE`). Bulk actions operan sobre todo `getFilteredProducts()`, no solo lo renderizado.
- **Búsqueda:** nombre, categoría, código de barras, precio y código de proveedor en un solo campo. Si no hay coincidencia exacta y hay 2+ palabras, cae a similitud por palabras (`_wordSim`, umbral 0.28) y lo avisa en el contador.
- **Chips de estado** (solo carencias accionables): Sin stock, Última pieza, Sin publicar, Por revisar, Sin código, Sin cód. proveedor, Sin precio, Por caducar (≤60 días, `_EXPIRY_SOON_DAYS`), Imagen base64, Kits, Archivados. Los kits aparecen en cualquier vista/búsqueda; sus filtros de stock usan `_kitInfo(p).stock`.
- **Inline edits:** stock y precio con popover (`.field-pop`, se reposiciona con scroll, no se cancela), categoría (select), visibilidad Web/Oculto (solo con `canPublishProduct`; si no, badge de solo lectura), estrella destacado.
- **Formulario:** fotos unificadas (`_allImagesEdit`, `[0]`=principal, máx 6; galería múltiple, cámara, URL, drag&drop, Ctrl+V). Las fotos se suben a Drive al elegirlas; `_sessionUploadedUrls` borra de Drive las de una sesión cancelada; al guardar se borran las URLs que salieron del set. "✨ Completar con IA" (Groq). "+ Otro" guarda y deja el formulario listo para el siguiente, recordando la última categoría (`_lastNewProductCategory`, compartida con Kit Builder). Protección de cambios sin guardar (`_formIsDirty`). Código de barras duplicado bloquea; código de proveedor duplicado solo avisa.
- **Quick View:** galería, swipe ←/→ (navegar), ↓ (cerrar), ↑ (editar), doble tap = zoom; muestra ID, código de barras, código de proveedor, creador (si `show_creator` y superadmin) y "Ver historial" del producto. Layout 2 columnas en desktop.
- **Kit Builder** (FAB 🎁): mínimo 2 componentes; sugiere categoría por nombre.
- **Recibir mercancía** (`admin-recv.js`): modo "Con factura" (default; edita costo/precio/cód. proveedor por renglón) o "Rápido" (solo suma stock). "No encontrado" ofrece buscar por nombre antes de crear; crear un producto regresa a la sesión (`_returnToRecv`). Deshacer restaura stock por diferencia y archiva productos creados en la sesión.
- **Recepción con IA** (`admin-recv-ia.js`): PDF o fotos de factura → Groq extrae renglones → revisión → aplicar. Modos "Mercancía nueva" (stock+costo+precio, crea productos) y "Actualizar" (solo costo/código, nunca stock/precio ni productos nuevos). **Nunca autovincula por similitud de nombre**: solo por `supplier_code` ya aprendido; el resto se vincula a mano (buscador ordenado por categoría adivinada, escáner por renglón) y ese vínculo enseña el código. Precio sugerido = precio de revista redondeado a pesos; costo exacto. Kits de promoción con componentes vinculables (costo repartido). Chequeo extraído vs. total del documento. Confirmación que señala precio < costo y kits sin vincular. Deshacer sin límite de tiempo (`te_ria_last_undo`). Borrador en localStorage.
- **Captura rápida:** foto + IA → producto.
- **Archivar/Restaurar** desde el Quick View; vista "📦 Archivados".
- **Auditoría de imágenes de Drive** (Configuración → Datos): lista archivos de Drive no usados por ningún producto (requiere `action:'list'` en el Apps Script); nunca borra sin confirmación.
- **Drive:** `drive_ep` + `drive_secret` en `config`. Al cambiar el secreto en el Apps Script hay que crear **nueva versión del despliegue** (Implementar → Administrar implementaciones → editar → Nueva versión) o sigue corriendo el viejo. Instrucciones paso a paso en Configuración → Integraciones. Si Drive falla, se guarda base64 (nunca bloquea).
- Drag & drop para ordenar (`position`) no funciona en iOS; alternativa "📌 Al inicio".

---

## Caja

- **Turno obligatorio:** no se vende sin abrir turno (`#open-shift-overlay`, fondo inicial sugerido del último cierre). Abrir con uno ya abierto lo cierra como `cerrado_auto`. Recordatorio no bloqueante a las ≥10 h o ≥21:00 CDMX; si el turno abrió en un día anterior, el aviso no se puede descartar. Cerrar sesión con turno abierto pide confirmación (no obliga a cerrarlo).
- **Corte:** consulta en vivo desde `opened_at`. **Movimientos del turno** (`cash_shift_expenses.kind`): `gasto` y `ingreso` afectan esperado y utilidad; `retiro` (dinero de la tienda que sale del cajón: la dueña se lleva la venta, depósito) solo resta del esperado, va a Actividad (`retiro_efectivo`) y se guarda aparte en `cash_shifts.retiros_total`. **Conteo a ciegas, en dos pasos** ("Mi turno"): paso 1 = fondo, conteo (con separador de miles al escribir; Enter compara) y movimientos, **sin ningún monto cobrado a la vista** (con fondo + efectivo visibles el esperado se saca de cabeza); paso 2, tras "Comparar": diferencia, esperado, resumen de cobros, "Cerrar turno" y "Compartir por WhatsApp" (el mensaje lleva el esperado, por eso también espera). Editar el conteo o un movimiento regresa al paso 1. Sin renglón de "Utilidad" (era cobros − gastos, sin costo: engañosa). "General — hoy" sigue mostrando el resumen directo. "🔒 Cerrar turno" calcula `esperado` en servidor; diferencia ≥ $100 exige `canCloseShiftUnsupervised` o PIN y se marca ⚠️ en Actividad. **El cajón es de quien tiene el turno:** lo que cobra otra cuenta no se espera ahí (en tienda hay una persona a la vez; Ofelia cobra en campo con su propio dinero). Hasta 2026-10-05 se preguntaba "¿ese efectivo está en tu cajón?" por cada cuenta — quitado por ruido; si Ofelia cobra en tienda y deja el efectivo, se registra como "+ Ingreso". El servidor conserva `p_include_cash_from` (el cliente manda null). "Ver cada cobro" (paso 2) lista cada pago del turno. "General — hoy" solo con `canViewReports`. Ubicación GPS opcional (no bloquea) anotada en Actividad si está a >150 m del local.
- **Catálogo:** orden por recién creado o con precio/stock tocado (`recently_edited`), paginado de 50; búsqueda con texto limitada a 40; OOS ocultos; Frecuentes compacto en mobile; Realtime sincroniza stock entre cajas. Tocar un producto agotado o exceder stock abre "Reabastecer" (suma stock y agrega al carrito).
- **Cobro:** formulario oculto con carrito vacío. Siempre visibles: método (Efectivo/Transferencia), efectivo rápido "el siguiente billete" (`_posQuickCashAmounts`: redondea el total a $50/$100/$500/$1,000 según su tamaño — $1,040 → 1,100 · 1,500 · 2,000), "Es apartado". En "Más opciones" (con contador): descuento, nota, cliente (nombre+teléfono; reconoce clientes conocidos), "Ya lo cobró Ofelia". Precio editable tocando el precio del carrito (con 1 pieza no se muestra "c/u": se toca el precio de la derecha). El botón dice el monto ("Cobrar $1,040"); con descuento, un solo total con el original tachado; el cambio es texto grande ("Faltan $X" si no alcanza); efectivo recibido con separador de miles.
- **"Ya lo cobró Ofelia":** atribuye el cobro (`p_collected_by_email`) a Ofelia para que no cuente en el efectivo del turno de quien captura. El servidor solo acepta atribuir a un superadmin. Activity conserva quién tecleó.
- **Escáner:** iOS → Quagga2 (`locate:true`, sin `area`); Android/desktop → Html5Qrcode (`useBarCodeDetectorIfSupported:true`, `qrbox 260×100`). La cámara se queda abierta tras acierto o fallo (cooldown); se cierra solo si va a mostrar un error/reabastecer que quedaría tapado. Contextos: carrito y "Editar apartado".
- **Apartados:** nombre obligatorio, anticipo puede ser 0, fecha límite (default 30 días). Activos/Liquidados/Cancelados con filtros Vencidos/Próximos 7 días/Sin fecha (con conteo; "Sin fecha" solo si hay). "Todos" va por urgencia (vencidos primero). Tarjetas: color solo cuando importa (fecha y "Falta" en rojo si venció, ámbar ≤7 días; lo demás neutro), sin teléfono, sin repetir "Liquidado/Cancelado" en su pestaña. Montos con `_fmtMx()` ($40,749.80). Nombres de clienta con mayúscula inicial al guardar (`_titleCaseName`). Abonar, liquidar, editar (productos, nombre, teléfono, fecha límite — nunca recalculada sola; total no puede quedar menor a lo pagado), cancelar, reembolsar. **Cancelar** (apartado o venta, desde la ficha o desde Historial) usa un solo modal: motivo obligatorio y, si hay dinero, casilla de "confirmo que devuelvo $X". **Reactivar** un apartado cancelado: solo superadmin, revierte la devolución con un `adjustment` en la misma fecha y a la misma cajera, rechaza si el stock ya no alcanza. Banner de vencidos descartable "por hoy" (mobile); chip en topbar (tablet/desktop). **Ronda de cobranza** ("Recordar a vencidas (N)" en Apartados): lista de vencidos, primero a quien no se le escribió hoy; cada recordatorio (también el de la ficha) se registra como `recordatorio_enviado` y `te_apartado_reminders()` da la última vez/quién/cuántas a cualquier cajera. Apartados activos se cargan paginados (sin tope de 100).
- **Comprobantes por WhatsApp:** tras abono, liquidación o apartado nuevo se ofrece enviar recibo (cerrar sin enviar pide confirmación; ambos se registran en Actividad). "Reenviar comprobante" en Historial y en el detalle del apartado reconstruye el recibo desde la BD con el saldo pendiente **de esa fecha**; si no hay teléfono, lo pide solo para ese envío.
- **Historial:** movimientos de `sale_payments` agrupados por fecha real; devoluciones multimétodo como una operación; ver historial de la transacción y reenviar en el pie de la tarjeta.
- **Ticket WA post-venta:** el modal no se cierra tocando fuera ni con Escape. En una venta ofrece **"Era apartado"**: cancela la venta (motivo "Era apartado", mismo permiso/PIN) y regresa los productos al carrito con "Es apartado" activo.
- Transferencia: oculta efectivo/cambio y avisa "pendiente confirmar recibo".

---

## Reportes

- Períodos Día/Semana/Mes navegables (el modo se recuerda en `te_stats_mode`; el desplazamiento siempre vuelve a 0). Zona `America/Mexico_City`.
- **Dinero:** Ingresos = suma de `sale_payments` por `paid_at` (devoluciones restan). Tres cubetas excluyentes que suman Ingresos: **Ventas** (venta directa + liquidación), **Abonos** (a apartados creados antes de ese día), **Apertura** (anticipo del día en que se abre el apartado, `_isSameDayOpeningPayment`). Si un cobro y su devolución caen en el mismo período, el cobro se excluye de Ventas/Abonos; si caen en períodos distintos, cada período conserva su cifra. Una reactivación compensa su devolución.
- Ventas/unidades cuentan al completarse (`created_at` directa, `liquidated_at` apartado). Un fallo de consulta muestra "No disponible", nunca 0.
- Montos sin centavos (`maximumFractionDigits:0`), **excepto Turnos de caja**, donde una diferencia de centavos es información real.
- Dos zonas: arriba la historia del período; abajo lo operativo, con lo que pide atención primero (Turnos de caja, Apartados pendientes, Por caducar, Estado del inventario) y luego consulta (Valor en venta, Clientes frecuentes, Rentabilidad). Turnos muestra esperado, retiros y efectivo de otras cuentas de cada cierre. Cards: Dinero de hoy (hero + barra de composición solo con ≥2 segmentos + sparklines ≥1300px), Otros indicadores (artículos, por cobrar con barra vencido/al corriente), Movimientos de hoy, gráficas (hora/día, categoría, día de semana, mapa del mes), Top productos, Apartados pendientes, Productos por caducar, Clientes frecuentes (perfil editable: nombre, teléfono, notas), Turnos de caja (acumulado por cajera, diferencias), Estado del inventario, Valor en venta por categoría (`price×stock`, Natura+Avon fusionados), Rentabilidad, Por vendedor.
- Chart.js lee colores con `_cssVar()` y se repinta al cambiar el tema (MutationObserver).

---

## Tienda

- Anon key; carga campos específicos (nunca `select=*`). Orden default `position.asc` ("Nuestra selección").
- "Todo" muestra 12 + "Ver más"; filtrando/buscando, sin límite. Filtro de categoría jerárquico (`catMatchesFilter`, usa `publicCategories`).
- **Carrito "Mi pedido"** (`localStorage.te_cart`): tope por stock, se reconcilia con el catálogo al abrir, un solo mensaje de WhatsApp. WhatsApp directo de un producto desde el modal; productos "📌 Apartado" solo "Consultar".
- **Modal 3 zonas:** imagen (`object-fit:contain`, galería con dots) / info con scroll / CTA fijo. Bottom sheet en mobile; swipe y teclas ←/→ navegan productos.
- "⚡ Última pieza disponible" cuando `stock===1 && !isApartado` (tarjeta, modal y mensajes WA). Nunca "pieza única".
- Badges: descuento % gana sobre badge `promo`; otros badges conviven con el %.
- Sección Natura: primeros 8 por `position`. Barra admin solo con sesión válida. Acceso staff: candado discreto en el header. WhatsApp flotante solo ≤768px.

---

## Actividad y Configuración

- **Actividad:** feed de `activity_log` (300), filtros período/usuario/tipo, búsqueda (incluye productos dentro de ventas vía RPC `te_search_activity_meta`), resumen KPIs, chip "🌙 Fuera de horario" (23:00–06:00, excluye superadmins). **Todo `logActivity()`/acción nueva necesita su entrada en `ACTION_CFG` (`activity.js`)**, o cae como badge genérico.
- **Configuración** (acceso según `canManageSettings`, o parcial con `canManageCatalogSettings` → solo Catálogo, o `canImportExport` → solo Datos):
  - Catálogo: toggles (WhatsApp flotante, Captura rápida, Ver creador, Reabastecimiento, Recibir mercancía, Recepción con IA), categorías, Revista Natura.
  - Usuarios y Permisos: crear usuario, rol, permisos (lista/matriz), copiar permisos de otra persona, revertir uno o todos.
  - Datos: catálogo JSON (exportar/importar; importar nunca publica sin `isPublished:true` explícito), apartados y pagos en CSV (con `canViewReports`), **Exportar todo** (incluye secretos; solo `canManageSettings`; no es restauración — la recuperación real es el backup de Supabase), nombres de usuarios, duplicados, auditoría de Drive, limpiar historial (solo superadmin).
  - Integraciones: Groq key, Google Drive.

---

## Convenciones de código

- **XSS:** todo string de BD/usuario que entre por `innerHTML` pasa por `_esc()` (`escH()` en settings.js). En `onclick="fn('…')"`: `_esc(x).replace(/'/g,"\\'")`.
- **Drive:** toda imagen mostrada pasa por `_driveSz(url, w)` con `w` ≈ tamaño renderizado (80 thumbs, 300 cards, 400 popups, 900 principal).
- **fetch con timeout:** todo `fetch` a Supabase/Apps Script usa `AbortController` (`_posFetchTimeout`, `_statsFetchTimeout`, etc.). Sin eso, una conexión colgada deja la UI en "Guardando…" para siempre.
- **ReferenceError silencioso:** una función global no definida dentro de `init()` aborta el resto sin mensaje — si una sección se queda en "Cargando…", revisar consola. `toast()` no existe en Reportes ni Actividad: desde `shared.js` usar `window.toast?.()`.
- **Service Worker:** cachea todos los archivos propios (stale-while-revalidate). **Tras cambiar JS/HTML/CSS, subir `CACHE_VERSION` en `sw.js`.** El usuario puede necesitar recargar dos veces.
- **Modo oscuro** (los 5 módulos admin): `data-theme-ready="1"` + script anti-flash en `<head>`; `:root[data-theme="dark"]` en cada CSS; tintes `--tint-{red,amber,green,blue,violet}-{bg,border,strong}`. Usar tokens (`--surface`, `--surface-soft`, `--charcoal`, `--muted`, `--border`), no hex. **Fondo oscuro fijo = `var(--ink)`, nunca `var(--charcoal)`** (este se invierte). Un `style=""` inline no responde al tema: mover a clase. Elementos sobre fotos (fondo blanco) usan colores fijos. Fotos de producto con `object-fit:contain` sobre `#fff`.
- **PostgREST:** batch PATCH con máx. 10 ids en `in.(…)`; no se puede castear columnas dentro de `or=(…)` (usar RPC); RPC por `POST /rest/v1/rpc/<nombre>` con argumentos nombrados.
- **Gestos:** handlers `{passive:true}`, sin `stopPropagation` en swipes; detectar dirección en `touchmove`.
- **Diálogos:** nunca `alert()`/`confirm()` nativos (salen como cuadro gris del navegador, sin tema ni tamaño de letra): usar `await teConfirm({title, message, confirmText, danger})` / `await teAlert(msg, title)` de `shared.js`; validaciones menores con `toast`. Caja ya migrada; Inventario/Configuración/Reportes aún tienen nativos.
- **Offline:** banner en `shared.js` (y copia en `app.js`); `cobrar()` bloquea sin conexión.
- Scripts CDN pesados (supabase-js, html5-qrcode, Quagga2) se cargan con `_loadScript()` al necesitarlos.

---

## No reintentar (probado y descartado)

- **Escáner:** Quagga2 para todos los dispositivos, o "afinar" Quagga (resolución/foco/consenso/`locate:false`+`area`) → peor en Android real. Quitar `useBarCodeDetectorIfSupported` tampoco ayudó. El split iOS/Android actual es el validado.
- **Groq:** `reasoning_effort` distinto de `'none'` rompe el modo JSON estricto ("Failed to validate JSON"). Groq retira modelos preview sin aviso (Llama 4 Scout → qwen3.6 → qwen3.8): si la IA falla con "model does not exist", revisar el modelo primero.
- **Similitud de nombres ponderada por rareza** (3 variantes) no resolvió casos reales; se quedó `_wordSim` simple. **Autovincular en Recepción con IA por score de nombre** elige mal productos de la misma línea.
- **IA "¿son el mismo producto?"** en duplicados: poco confiable, eliminada.
- **Carga masiva con IA**, **checador de entrada/salida**, **"Marcar como prueba" (`is_test`)**, botones de orden **AZ/Recientes** y carril **"Recién preparados"** en Caja: eliminados a propósito.
- **Tinte de color permanente en chips de estado** y **botón IA charcoal+dorado**: rechazados por minimalismo.
- **Auto-cerrar turnos por tiempo** (fabricaría un conteo falso) y **avisar en `beforeunload`** (poco confiable en móvil): descartados.
- Concepto "Borrador" y chip "Con stock": eliminados por redundantes.

---

## Pendientes

**Seguridad / datos**
- Rotar `groq_key` y `drive_secret`: estuvieron legibles públicamente hasta el 2026-09-30 (y un secreto de Drive viejo sigue en el historial de git, repo público). **El repo es público y GitHub Pages sirve todo `assets/`: nunca escribir secretos en archivos versionados** (la copia del Apps Script usa `PEGA_AQUI_EL_SECRETO`).
- Activar "Leaked password protection" (Dashboard → Auth).
- Supabase Auth → URL Configuration: el Site URL/Redirect probablemente sigue en Netlify (invitaciones por correo llevarían a un 404).

**Calidad / UX**
- Duplicar producto **no** copia `supplier_code` a propósito: el código enseña a Recepción con IA a qué producto vincular, duplicarlo lo volvería ambiguo.

**Visión:** Tres Encantos es el piloto de un producto multi-negocio. Decisiones simples "porque es una sola tienda" deben señalarse si limitan ese escalado.
