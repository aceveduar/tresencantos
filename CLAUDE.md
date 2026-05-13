# CLAUDE.md — Tres Encantos

Documentación técnica del proyecto. Última actualización: 2026-05-14.

---

## Descripción

Panel de administración + POS + estadísticas + sitio e-commerce para **Tres Encantos**, boutique mexicana (bolsos, accesorios, maquillaje, Natura). Dueña: **Ofelia**, consultora Diamond de Natura. Los pedidos del sitio público se cierran por WhatsApp — no hay checkout.

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
├── index.html   # Sitio público: catálogo, filtros, modal, hero, Natura, about
├── app.js       # Lógica del sitio público
├── style.css    # Estilos del sitio público
├── admin.html   # Admin: CRUD productos, estilos inline, todo el CSS del admin
├── admin.js     # Lógica del admin (~1740 líneas)
├── pos.html     # Punto de Venta: carrito, cobro, historial de ventas
├── stats.html   # Dashboard de estadísticas (Chart.js desde CDN)
├── logo.png
├── ofelia.jpeg
└── CLAUDE.md
```

### Navegación entre módulos
```
admin.html ──[📊 Stats]──► stats.html
admin.html ──[🖥 POS]───► pos.html
pos.html   ──[← Admin]──► admin.html
pos.html   ──[📊]───────► stats.html  (solo desktop)
stats.html ──[← Admin]──► admin.html
```
En mobile el admin oculta Stats y "← Ver sitio"; muestra POS.

---

## Supabase

### Credenciales (hardcodeadas por archivo)
| Archivo | Key | Razón |
|---|---|---|
| `app.js` | Anon key | Solo SELECT público — seguro |
| `admin.js`, `pos.html`, `stats.html` | Service role key | Bypasea RLS para operaciones de escritura |

- **Project URL:** `https://qxvrggmpaqhslgdmbhqw.supabase.co`
- **Regla de oro:** nunca poner service role key en `app.js`

### Tablas

#### `products`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | int8 PK | Manual (no serial) — max(ids)+1 al crear |
| `name` | text | |
| `category` | text | `bolsos`, `accesorios`, `maquillaje`, `natura`, `perfumes`, `loncheras` |
| `category_label` | text | Etiqueta visible |
| `price` | numeric | MXN |
| `original_price` | numeric nullable | Precio tachado si hay oferta |
| `description` | text | |
| `image` | text | URL o base64 JPEG (max 900px, calidad 0.82) |
| `badge` | text nullable | "Más vendido", "Nuevo", etc. |
| `badge_type` | text nullable | `best`, `new`, `promo`, `natura` |
| `featured` | bool | Sección destacada + hero mobile |
| `out_of_stock` | bool | Oculta botón WhatsApp en sitio, bloquea venta en POS |
| `stock` | int4 | Unidades físicas. 0=agotado, 1=última pieza, >1=ok |
| `barcode` | text nullable | EAN-13 / QR / Code-128 para escáner |
| `position` | int4 | Orden drag & drop |

**Regla de stock:** `out_of_stock` y `stock` se sincronizan: al marcar disponible con stock=0 → auto-asigna stock=1. Al vender en POS con stock resultante=0 → auto-marca out_of_stock=true.

#### `sales`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial PK | |
| `total` | numeric | Suma de la venta |
| `created_at` | timestamptz | Auto (Supabase default) |
| `items` | jsonb | `[{id, name, price, qty, subtotal}]` |

#### `config`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | Key de configuración |
| `value` | text | URL o base64 del PDF de la revista |

`id = 'revista_url'` → PDF de la revista Natura.

#### `users` (legacy)
Email + password plano. Solo existe para compatibilidad; la auth real usa Supabase Auth JWT.

### Auth JWT
```javascript
// Sesión en localStorage key "te_admin_session":
{ access_token, refresh_token, expires_at }
// Válida si: access_token existe Y expires_at > now/1000 + 60s
// Se refresca automáticamente con refresh_token
```

---

## Admin (`admin.html` + `admin.js`)

### Patrón de datos
- `products = []` — array global, fuente de verdad en cliente
- Cargado al iniciar con `loadProductsFromSupabase()`
- Supabase se actualiza primero; el array local se actualiza solo si el request es exitoso

### Funcionalidades
- **CRUD** con modal de formulario — doble clic/tap en fila para abrir edición
- **Drag & drop** para reordenar (`position`)
- **Inline stock:** tap en el número de stock → input editable (fix iOS: focus con rAF + blur diferido 300ms, font-size 16px)
- **Toggle disponible/agotado:** si stock=0 al marcar disponible → auto-stock=1
- **Duplicar producto**
- **Búsqueda** por nombre/descripción + filtro por categoría + ordenamiento
- **Escanear código de barras** (html5-qrcode) en el campo barcode y en búsqueda
- **Dictado por voz** (Web Speech API nativa) — botón 🎤 junto a Nombre y Descripción. `continuous:true`, reconstruye transcript desde `i=0` en cada evento para evitar duplicados. Funciona en Chrome y Safari. Sin librerías externas.
- **Captura de imagen:** galería, drag & drop, URL, o cámara directa (`capture="environment"`)
- **Google Drive para imágenes** — ver sección abajo
- **Acciones bulk:** cambiar categoría, toggle featured/oos (con auto-stock), cambiar badge, exportar JSON, eliminar
- **Import/Export JSON** — importar reemplaza catálogo completo con rollback local
- **Revista Natura** — URL externa o PDF como base64 en tabla `config`

### Google Drive para imágenes

Imágenes de productos se pueden subir a una carpeta de Google Drive en lugar de guardarse como base64 en Supabase.

**Arquitectura:**
```
Admin (browser) → POST base64 → Google Apps Script → Drive folder → devuelve URL thumbnail
```

**Configuración (ya hecha, solo documentar):**
- Apps Script URL: guardada en `localStorage` key `te_drive_ep`
- Secreto único: generado al guardar, en `localStorage` key `te_drive_secret`. **No está en el código fuente.**
- Carpeta Drive ID: `1KRy8Aj5bd7bz4f0TpkIKMURthWBCS7om`
- URL de imagen resultante: `https://drive.google.com/thumbnail?id=FILE_ID&sz=w900`

**Si hay que reconfigurar** (nuevo dispositivo, borró localStorage):
1. Admin → Herramientas → Google Drive → pegar URL del script → Guardar
2. El campo gris muestra el secreto — copiarlo (toque = copia al portapapeles)
3. En Apps Script: `const SECRET = 'el_secreto_copiado'` → Nueva versión → Implementar

**Código del Apps Script** (`const FOLDER_ID` y `const SECRET` al inicio, resto no tocar):
```javascript
const FOLDER_ID = '1KRy8Aj5bd7bz4f0TpkIKMURthWBCS7om';
const SECRET    = '...'; // viene del localStorage del admin
```

**Fallback:** si Drive falla o no está configurado, `compressAndPreview()` guarda base64. Nunca bloquea el flujo.

**En `admin.js`:** funciones `uploadToDrive()`, `saveDriveEndpoint()`, `loadDriveConfig()`, `copyDriveSecret()`, `clearDrive()`, `testDriveEndpoint()`.

---

### Bug resuelto: botón Guardar bloqueado en segunda edición
`closeForm()` siempre llama `setBtn(saveBtn, false)` para limpiar el estado `data-loading` residual del guardado anterior.

### Stats cards (admin)
```javascript
sinStock   = products.filter(p => p.stock === 0 || p.outOfStock)
disponibles = products.filter(p => p.stock > 0 && !p.outOfStock)
```

---

## POS (`pos.html`)

- Auth: mismo JWT check que admin
- Usa **service role key** para leer y escribir
- Productos cargados en memoria al abrir; búsqueda filtra en el cliente
- **Validación de efectivo:** si el campo efectivo tiene valor, debe ser ≥ total antes de procesar
- **Cobro:** registra en `sales` → reduce `stock` → auto-marca `out_of_stock=true` si stock=0
- **Historial:** últimas 30 ventas (sin filtro de fecha) — abierto por defecto en desktop, cerrado en mobile
- **Cancelar venta:** ✕ Cancelar en historial → borra registro en `sales` → restaura stock + `out_of_stock=false`
- **Escáner de código de barras** para agregar al carrito

---

## Stats (`stats.html`)

- Auth: mismo JWT check
- Usa **service role key**
- Períodos: Hoy / 7 días / 30 días / Todo (filtra `sales` por `created_at`)
- **KPIs:** Ingresos, ventas, ticket promedio, productos en stock
- **Gráficas (Chart.js CDN):** ingresos por día (barra), ventas por categoría (donut)
- **Top productos:** agrega `items` de todas las ventas del período
- **Ventas recientes:** últimas 10 del período
- **Inventario:** agotados, última unidad, con existencias — lista de productos críticos

---

## Sitio Público (`app.js` + `index.html`)

- Usa **anon key** — solo hace SELECT
- Carga `GET /products?select=*&order=position.asc`
- **Hero mobile:** strip horizontal con productos `featured=true`, auto-scroll a 0.5px/frame (loop seamless con items duplicados). Pausa 3s al tocar.
- **Filtros** por categoría, búsqueda en tiempo real, ordenamiento
- **Modal** de detalle con botón "Pedir por WhatsApp"
- **No hay botón flotante de WhatsApp** (eliminado)
- `overflow-x:hidden` solo en `html` y `body`, NO en secciones individuales (causaba scroll separado por sección)

---

## Design System (admin)

Variables en `admin.html` `<style>` inline:
```css
--cream: #F7F2EB      --gold: #C9A462       --gold-dark: #A67C3A
--gold-light: #FFF8EE --charcoal: #1C1817   --charcoal-soft: #2E2825
--red: #E85D5D        --green: #2D6A4F      --border: #EAE0D4
--muted: #8A7564      --muted-light: #B5A696
```

Colores de categoría (JS, inline):
```javascript
bolsos:'#C9A462'  accesorios:'#60a5fa'  maquillaje:'#f472b6'
natura:'#34d399'  perfumes:'#a78bfa'    loncheras:'#fb923c'
```

---

## Deudas Técnicas

| Problema | Impacto |
|---|---|
| Tabla `users` con password plano (legacy) | Seguridad — ya no se usa para auth real pero existe |
| Imágenes base64 en DB (productos viejos) | Los productos creados antes de Drive aún tienen base64 — se pueden reeditar para actualizar |
| Sin Realtime entre sesiones | Cambios no visibles en otras pestañas abiertas |
| Hero mobile usa `featured=true` — correcto | (resuelto: ya no usa IDs fijos) |
| `clearSupabaseProducts` filtra `id=gt.0` | No borra IDs negativos — cambiar a `id=not.is.null` |
| Sin paginación en tabla admin | Lento con 500+ productos |
| Tesseract.js OCR descarga ~8MB primera vez | Normal para la funcionalidad, pero lento en 3G |

---

## Notas de Desarrollo

- **Sin build step** — editar y abrir directamente en browser
- **PostgREST filtros:** `?id=eq.1` `?id=in.(1,2,3)` `?category=eq.bolsos` `?order=position.asc`
- **Batch upsert:** body JSON array + header `Prefer: resolution=merge-duplicates`
- **Librerías CDN:** html5-qrcode@2.3.8 (escáner), Chart.js@4 (stats). Tesseract.js fue eliminado — reemplazado por Web Speech API nativa.
- **Google Drive:** integración vía Apps Script. Secreto en localStorage, nunca en código fuente.
- `position` lo gestiona el admin — el sitio público y POS ordenan por él
