# CLAUDE.md — Tres Encantos

Documentación técnica del proyecto. Última actualización: 2026-05-15.

## Rol de Claude en este proyecto

Actuar siempre como **experto en diseño UX/UI para e-commerce, redactor y estratega de conversión**:
- **Mobile first** — toda decisión de diseño se valida primero en 360–430px
- Mencionar proactivamente oportunidades de mejora en diseño, copy o usabilidad
- Priorizar la experiencia de la usuaria final (Ofelia y sus clientes) sobre preferencias técnicas
- Ser honesto: dar la mejor recomendación aunque difiera de lo que el usuario sugiere

---

## Descripción

Panel de administración + POS + estadísticas + staging + sitio e-commerce para **Tres Encantos**, boutique mexicana (bolsos, accesorios, maquillaje, Natura). Dueña: **Ofelia**, consultora Diamond de Natura. Los pedidos del sitio público se cierran por WhatsApp — no hay checkout.

---

## Stack

- **Frontend:** HTML + CSS + Vanilla JS — sin framework, sin bundler, sin node_modules
- **Backend:** Supabase (PostgreSQL via REST API / PostgREST)
- **Auth:** Supabase Auth JWT — token en `localStorage` key `te_admin_session`
- **Hosting:** Archivos estáticos
- **Fuentes:** Inter + Playfair Display (Google Fonts)

---

## Módulos y Archivos

```
tresencantos/
├── index.html    # Sitio público: catálogo, filtros, modal, hero, Natura, about
├── app.js        # Lógica del sitio público
├── style.css     # Estilos del sitio público
├── admin.html    # Admin: CRUD productos, estilos inline
├── admin.js      # Lógica del admin (~2100 líneas)
├── pos.html      # Punto de Venta: carrito, cobro, apartados, historial offcanvas
├── stats.html    # Dashboard de estadísticas (Chart.js CDN)
├── staging.html  # Zona de preparación: subida masiva + IA Groq
├── logo.png
├── ofelia.jpeg
└── CLAUDE.md
```

### Navegación entre módulos
```
admin.html ──[🗂 Staging]─► staging.html
admin.html ──[📊 Stats]──► stats.html
admin.html ──[🖥 POS]───► pos.html
pos.html   ──[← Admin]──► admin.html
pos.html   ──[📊]───────► stats.html  (solo desktop)
stats.html ──[← Admin]──► admin.html
```
En mobile admin oculta Staging y Stats; muestra solo POS.

---

## SQL — Migraciones Pendientes

Ejecutar en **Supabase → SQL Editor** si no se han aplicado aún:

```sql
-- T7: Control de visibilidad en sitio web
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true;

-- T10: Precio de costo para margen interno
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost numeric;

-- T9: Datos extendidos de ventas (POS mejorado)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount      numeric   DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method text     DEFAULT 'efectivo';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS note          text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS type          text      DEFAULT 'venta';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS paid_amount   numeric;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer      text;
```

---

## Supabase

### Credenciales (hardcodeadas por archivo)
| Archivo | Key | Razón |
|---|---|---|
| `app.js` | Anon key | Solo SELECT público — seguro |
| `admin.js`, `pos.html`, `stats.html`, `staging.html` | Service role key | Bypasea RLS para escritura |

- **Project URL:** `https://qxvrggmpaqhslgdmbhqw.supabase.co`
- **Regla de oro:** nunca poner service role key en `app.js`

### Tablas

#### `products`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | int8 PK | Manual — max(ids)+1 al crear |
| `name` | text | |
| `category` | text | Código de subcategoría (ej: `natura_perfumes`) |
| `category_label` | text | Etiqueta visible |
| `price` | numeric | MXN |
| `original_price` | numeric nullable | Precio tachado si hay oferta |
| `description` | text nullable | Opcional desde T6 |
| `image` | text | URL Drive o base64 JPEG (max 900px, calidad 0.82) |
| `badge` | text nullable | "Más vendido", "Nuevo", etc. |
| `badge_type` | text nullable | `best`, `new`, `promo`, `natura` |
| `featured` | bool | Sección destacada + hero mobile |
| `out_of_stock` | bool | Bloquea venta POS; oculta del sitio web |
| `stock` | int4 | 0=agotado, 1=última pieza, >1=ok |
| `barcode` | text nullable | EAN-13 / QR / Code-128 |
| `position` | int4 | Orden drag & drop |
| `cost` | numeric nullable | Precio de costo (solo interno, calcula margen) |
| `is_published` | bool DEFAULT true | Si false: solo en inventario/POS, no aparece en web |

**Regla de stock:** al marcar disponible con stock=0 → auto stock=1. Al vender en POS con stock resultante=0 → auto `out_of_stock=true`.

**Visibilidad sitio web:** el sitio filtra `is_published=true AND out_of_stock=false`. Productos agotados desaparecen automáticamente.

#### `sales`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial PK | |
| `total` | numeric | Total cobrado (con descuento) |
| `created_at` | timestamptz | Auto |
| `items` | jsonb | `[{id, name, price, qty, subtotal}]` |
| `discount` | numeric nullable | Monto descontado |
| `payment_method` | text | `'efectivo'` o `'transferencia'` |
| `note` | text nullable | Nota libre de la venta |
| `type` | text | `'venta'` o `'apartado'` |
| `paid_amount` | numeric nullable | Monto recibido (anticipo para apartados) |
| `customer` | text nullable | Nombre del cliente (obligatorio en apartados) |

#### `config`
| `id` | Contenido |
|---|---|
| `revista_url` | URL o base64 del PDF de la revista Natura |
| `categories` | JSON array de categorías: `[{code, label, color, parent?}]` |
| `groq_key` | API key de Groq para IA (plain text) |
| `drive_ep` | URL del Google Apps Script proxy de Drive |
| `drive_secret` | Secreto de autenticación Drive ↔ Apps Script |

**Importante:** `groq_key`, `drive_ep` y `drive_secret` ya no están en `localStorage` — viven en esta tabla para ser compartidos entre todos los dispositivos y usuarios admin.

#### `users` (legacy)
Email + password plano. Ya no se usa para auth real (Supabase Auth JWT).

### Auth JWT
```javascript
// localStorage key "te_admin_session":
{ access_token, refresh_token, expires_at }
// Válida si: access_token existe Y expires_at > now/1000 + 60s
```

### Categorías dinámicas
Guardadas en `config.id='categories'` como JSON. Estructura con soporte de subcategorías:
```javascript
[
  {code:'bolsos',          label:'Bolsos & Mochilas', color:'#C9A462'},
  {code:'natura',          label:'Natura',             color:'#34d399'},
  {code:'natura_perfumes', label:'Perfumes',           color:'#a78bfa', parent:'natura'},
  {code:'natura_cremas',   label:'Cremas',             color:'#34d399', parent:'natura'}
]
```
- `rootCats()` → categorías sin padre; `subCats(code)` → hijos de una raíz
- Los selects usan `<optgroup>` para agrupar visualmente
- El modal "Gestionar categorías" en Herramientas permite agregar/editar/eliminar

---

## Admin (`admin.html` + `admin.js`)

### Patrón de datos
- `products = []` — array global, fuente de verdad en cliente
- `categories = []` — cargado desde `config` al iniciar, antes que los productos
- `groqApiKey`, `driveEp`, `driveSecret` — globals cargados desde `config` en Supabase al iniciar
- Supabase primero; array local solo si el request es exitoso

### Carga de config al iniciar (`loadAppConfig`)
Se ejecuta en `showApp()` antes de cargar productos. Hace una sola query:
```
GET config?id=in.(groq_key,drive_ep,drive_secret)&select=id,value
```
Incluye **migración automática**: si los valores no están en Supabase pero sí en `localStorage` (instalaciones antiguas), los copia a Supabase silenciosamente en el primer arranque.

### Funcionalidades
- **CRUD** con modal — doble clic/tap en fila para editar
- **Vista lista / tarjetas** — toggle ☰/⊞ en toolbar, guardado en localStorage. En mobile: "Lista" = cards anchas, "Grid" = 2 columnas compactas
- **Drag & drop** para reordenar (`position`)
- **Inline stock:** tap en chip de número → input editable. Android fix: `type="text"+inputMode="numeric"` + botón ✓ explícito. El chip aparece siempre (incluso en agotados con stock=0) para facilitar el restock.
- **Inline categoría:** tap en el label de categoría → select nativo. Guarda con `change`, cancela con `blur`/Escape.
- **Inline visibilidad web:** badge "🙈 Oculto" / "🌐 Web" es un botón — tap para alternar `is_published`. Aparece en todas las vistas (lista, grid, tabla desktop).
- **Toggle disponible/agotado:** stock=0 + marcar disponible → auto stock=1
- **Precio de costo:** campo interno — muestra margen en tiempo real (verde ≥30%, ámbar ≥10%, rojo <10%)
- **Reabastecimiento rápido:** bulk action "📦 Reabastecer" — selecciona productos, ingresa cantidad a agregar
- **Duplicar producto**
- **Búsqueda** + filtro por categoría (con subcategorías en `<optgroup>`) + ordenamiento
- **Escanear código de barras** (html5-qrcode) en campo barcode y búsqueda
- **Dictado por voz** (Web Speech API) — botón 🎤 junto a Nombre y Descripción. Reconstruye transcript desde `i=0` para evitar duplicados
- **Captura de imagen:** galería, drag & drop, URL, o cámara (`capture="environment"`)
- **IA en formulario de producto** — botón "✨ Completar con IA" aparece tras subir imagen; usa Groq para rellenar nombre, descripción y categoría automáticamente
- **Google Drive para imágenes** — ver sección abajo
- **Acciones bulk:** categoría, featured, oos, badge, exportar JSON, eliminar, reabastecer
- **Import/Export JSON** — importar reemplaza catálogo con rollback local
- **Subcategorías** — modal "Gestionar categorías" en Herramientas con soporte jerárquico
- **Staging area** → `staging.html` (botón 🗂 en topbar)
- **Revista Natura** — URL o PDF base64 en `config`

### IA en formulario de producto
Aparece el botón **"✨ Completar con IA"** al subir una imagen (galería, cámara o drag & drop):
- Usa `groqApiKey` global (cargado de Supabase)
- Modelo: `meta-llama/llama-4-scout-17b-16e-instruct` vía `https://api.groq.com/openai/v1/chat/completions`
- Rellena: nombre, descripción, categoría con animación de destello dorado
- Si no hay key configurada: muestra mini input inline para pegarla (se guarda en Supabase al confirmar)
- `currentFormImageDataUrl` guarda el base64 de la imagen actual para el análisis

### Google Drive para imágenes
**Arquitectura:** `Admin → POST base64 → Google Apps Script → Drive → URL thumbnail`

**Config (guardada en `config` de Supabase):**
| Campo Supabase | Contenido |
|---|---|
| `drive_ep` | URL del Apps Script (`/macros/s/.../exec`) |
| `drive_secret` | Secreto único generado al configurar |

- Carpeta Drive ID: `1KRy8Aj5bd7bz4f0TpkIKMURthWBCS7om`
- URL resultante: `https://drive.google.com/thumbnail?id=FILE_ID&sz=w900`
- Globals en admin.js: `driveEp`, `driveSecret` — se usan en `uploadToDrive()`

**Apps Script actual (`scrip_imagenes`):**
```javascript
const FOLDER_ID = '1KRy8Aj5bd7bz4f0TpkIKMURthWBCS7om';
const SECRET    = 'te_ifth9j1y0gbmp67g8i6'; // debe coincidir con drive_secret en Supabase
```

**⚠️ Regla crítica — despliegue:** Cada vez que cambia el `SECRET` en el código del Apps Script, se debe crear una **nueva versión del despliegue**:
> Apps Script → Implementar → Administrar implementaciones → ✏️ editar → Nueva versión → Implementar

Si no se hace esto, el Apps Script sigue ejecutando la versión antigua con el secreto viejo → error "no autorizado" en uploads.

**Reconfigurar:** Admin → Herramientas → Google Drive → pegar URL → Guardar → copiar secreto del campo gris → pegarlo en Apps Script (`const SECRET = '...'`) → Nueva versión → Implementar → Probar conexión.

**Fallback:** si Drive falla, guarda base64. Nunca bloquea. Muestra toast de error específico.

### Bugs resueltos relevantes
- `closeForm()` llama `setBtn(saveBtn, false)` → evita botón Guardar bloqueado en segunda edición
- Inline stock en Android: `type="text"` + `inputMode="numeric"` + botón ✓ sin depender de `blur`
- `uploadToDrive`: usaba variables `ep`/`secret` undefined tras refactor — corregido a `driveEp`/`driveSecret`

---

## POS (`pos.html`)

- Auth: mismo JWT check
- Service role key para leer/escribir
- Productos cargados en memoria; búsqueda filtra en cliente
- **Vista lista / tarjetas** — toggle ☰/⊞ en barra de búsqueda
- **Filtro por categoría** — chips horizontales sobre la lista
- **Divisor arrastrable** — barra de 5px entre paneles, ajusta proporción, guardada en `localStorage` key `te_pos_split` (oculto en mobile)
- **Descuento** — campo % o $ antes del cobro, clampado 0-100% en modo %
- **Método de pago** — 💵 Efectivo / 📱 Transferencia. Transferencia oculta campos de cambio
- **Nota de venta** — texto libre que aparece en ticket WA
- **Apartados/anticipos** — checkbox "Es apartado", requiere nombre de cliente + anticipo. Panel "📌 Apartados" muestra pendientes con botón "Completar"
- **Ticket por WhatsApp** — botón en modal post-venta. Incluye productos, total, método, cambio, nota y aviso de transferencia pendiente si aplica
- **Historial** — últimas 30 ventas (sin filtro fecha) en **offcanvas lateral** (botón 🕐 Historial en topbar). Cancelar venta → borra `sales` → restaura stock
- **Validación:** efectivo debe cubrir total; doble submit bloqueado con flag `_cobrandoAhora`
- **Mobile:** `pos-right` scrollable, cart-items con `max-height:120px` para que checkout siempre sea visible

### Flujo de transferencia
1. Seleccionar 📱 Transferencia → campos de efectivo/cambio se ocultan
2. Cobrar → se registra en `sales` con `payment_method:'transferencia'`
3. Modal post-venta muestra alerta amarilla "Pendiente confirmar recibo"
4. Ticket WA incluye método + "⚠️ Pendiente confirmar recibo de transferencia"
5. Confirmar recibo en app bancaria → entregar producto

---

## Stats (`stats.html`)

- Auth: mismo JWT check; service role key
- Períodos: Hoy / 7 días / 30 días / Todo
- **KPIs con comparación:** Ingresos, ventas y ticket promedio muestran delta % vs período anterior equivalente
- **Gráficas (Chart.js CDN):** ingresos por día (barra), ventas por categoría (donut), hora pico por hora del día (barra, dorado = hora más rentable)
- **Top productos** por ingresos con barra de progreso relativa
- **Ventas recientes** — últimas 10 del período
- **Inventario:** agotados/última unidad/con existencias

---

## Staging Area (`staging.html`)

Zona de preparación de productos antes de publicar al inventario.

**Flujo:**
1. Subir imágenes (múltiples a la vez, drag & drop o selector)
2. Opcional: botón 🤖 IA por imagen o "Analizar todas" en masa
3. Revisar/editar nombre, descripción y categoría en cada card
4. "Publicar listas" → crea productos en Supabase con `is_published=false` y `price=0`
5. En el admin: ajustar precio y activar "Publicar en sitio web" cuando estén listos

**IA con Groq (Llama 4 Scout Vision):**
- API Key leída de `config.id='groq_key'` en Supabase — compartida con admin, sin configurar por dispositivo
- Modelo: `meta-llama/llama-4-scout-17b-16e-instruct` vía `https://api.groq.com/openai/v1/chat/completions`
- Extrae nombre (<60 chars), descripción (<200 chars) y categoría
- 1.5s de pausa entre llamadas en análisis masivo (free tier: ~30 req/min)
- El prompt incluye las categorías disponibles para que la IA asigne correctamente
- Free tier de Groq: sin restricción regional, sin tarjeta de crédito, ~1000 req/día

**Por qué Groq y no Gemini:** Gemini free tier tiene `limit: 0` en México (restricción regional). Groq no tiene esta restricción.

---

## Sitio Público (`app.js` + `index.html`)

- Anon key — solo SELECT
- Carga: `GET /products?is_published=eq.true&out_of_stock=eq.false&order=position.asc`
  - Solo productos publicados y con stock
- **Hero mobile:** auto-scroll 0.5px/frame, loop seamless (items duplicados), pausa 3s al tocar
- **Filtros** por categoría, búsqueda, ordenamiento; modal de detalle con botón WhatsApp
- Sin botón flotante de WhatsApp (eliminado)

### Lógica de badges en cards
Regla: descuento % y badge "OFERTA/promo" son redundantes — el % gana siempre.

| Situación | Resultado |
|---|---|
| Descuento + badge `promo` (OFERTA) | Solo `-X%` (badge omitido) |
| Descuento + badge `best`/`new`/`natura` | Badge izquierda + `-X%` derecha (info complementaria) |
| Solo descuento | Solo `-X%` |
| Solo badge | Solo el badge |

### Descripción de productos — line-clamp
- **Desktop:** 3 líneas (`-webkit-line-clamp: 3`)
- **Tablet 3col (601–1000px):** 2 líneas
- **Mobile (<480px):** 2 líneas
- **Título:** 2 líneas en todos los breakpoints
- `flex: 1` en `.product-desc` empuja el precio siempre al fondo, independiente del largo del texto

---

## Design System (admin)

Variables en `admin.html` `<style>` inline:
```css
--cream:#F7F2EB  --gold:#C9A462       --gold-dark:#A67C3A
--gold-light:#FFF8EE  --charcoal:#1C1817  --charcoal-soft:#2E2825
--red:#E85D5D   --green:#2D6A4F      --border:#EAE0D4
--muted:#8A7564  --muted-light:#B5A696
```

Colores de categoría: **dinámicos desde `categories[]`**, campo `color` de cada objeto. La paleta por defecto (`CAT_PALETTE`) se asigna automáticamente a categorías nuevas.

---

## Deudas Técnicas

| Problema | Impacto |
|---|---|
| `users` table con password plano (legacy) | Seguridad — ya no se usa para auth pero existe |
| Imágenes base64 en productos viejos | Filas pesadas — reeditar producto para subir a Drive |
| Sin Realtime entre sesiones | Cambios no visibles en otras pestañas |
| `clearSupabaseProducts` filtra `id=gt.0` | No borra IDs negativos — cambiar a `id=not.is.null` |
| Sin paginación en tabla admin | Lento con 500+ productos |
| Staging publica con `price=0` | Requiere edición manual de precio en admin antes de publicar |

---

## Notas de Desarrollo

- **Sin build step** — editar y abrir directamente en browser
- **PostgREST filtros:** `?id=eq.1` `?id=in.(1,2,3)` `?is_published=eq.true` `?order=position.asc`
- **Batch upsert:** body array JSON + header `Prefer: resolution=merge-duplicates`
- **Librerías CDN:** html5-qrcode@2.3.8 (escáner), Chart.js@4 (stats)
- **IA:** Groq Llama 4 Scout Vision — key en `config` Supabase (`groq_key`), compartida entre admin y staging
- **Google Drive:** Apps Script como proxy. Secreto en `config` Supabase (`drive_secret`), nunca en código fuente. Al cambiar el secreto → siempre desplegar nueva versión del Apps Script.
- `position` lo gestiona el admin — sitio público y POS ordenan por él
- **SQL pendiente** para sesiones nuevas: ver sección "SQL — Migraciones Pendientes" arriba
