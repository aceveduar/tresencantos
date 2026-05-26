# CLAUDE.md — Tres Encantos

Documentación técnica del proyecto. Última actualización: 2026-05-26 (rev 10).

## Rol de Claude en este proyecto

Actuar siempre como **experto en diseño UX/UI para e-commerce, redactor y estratega de conversión**:
- **Mobile first** — toda decisión de diseño se valida primero en 360–430px
- Mencionar proactivamente oportunidades de mejora en diseño, copy o usabilidad
- Priorizar la experiencia de la usuaria final (Ofelia y sus clientes) sobre preferencias técnicas
- Ser honesto: dar la mejor recomendación aunque difiera de lo que el usuario sugiere
- **Estándar e-commerce** — cada decisión de UX/UI debe estar a la altura de cualquier app de e-commerce seria (ZARA, Amazon, Shopify, H&M): CTA siempre visible sin scroll, imágenes sin recorte, jerarquía de información clara, navegación predecible. Si algo no cumpliría ese estándar, señalarlo y corregirlo aunque no se haya pedido explícitamente.

### Referencias de software profesional por módulo

Antes de diseñar o modificar cualquier funcionalidad, tomar como referencia los patrones que usan estas apps en producción:

| Módulo | Referencias |
|---|---|
| **Caja (POS)** | Shopify POS, Square POS, Clip — thumbnail inline en historial, carrito lateral, cobro en un paso |
| **Inventario** | Shopify Admin, WooCommerce, Airtable — tabla/grid toggle, inline edit, bulk actions, drag & drop |
| **Reportes** | Shopify Analytics, Square Dashboard — KPIs con delta %, gráficas de barras/donut, top productos |
| **Tienda (sitio)** | ZARA, H&M, Amazon — bottom sheet en mobile, CTA siempre visible, object-fit:contain en imágenes |
| **Staging / carga masiva** | Shopify Bulk Import, Canva — drag & drop, vista previa antes de confirmar |
| **Navegación** | Shopify Admin mobile — topbar con íconos, sin texto en mobile, módulo activo resaltado |

**Principios concretos extraídos de estas referencias:**
- Información que ya es visible en una tarjeta **no se repite** en un modal — el modal revela lo que está oculto
- Imágenes en listas de POS: **thumbnail inline** (24–32px), no modal aparte
- Modales de análisis/reportes: **solo texto**, sin imágenes — velocidad de lectura primero
- Botones de acción destructiva (cancelar, eliminar): `stopPropagation` — nunca activados por tap accidental
- Búsqueda en mobile: siempre con botón ✕ para limpiar y soporte de voz

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

### Nombres oficiales de los módulos
| Archivo | Nombre en UI | Uso |
|---|---|---|
| `index.html` + `app.js` | **Tienda** (o Website) | Sitio público |
| `admin.html` + `admin.js` | **Inventario** | CRUD productos |
| `pos.html` | **Caja** | Punto de venta |
| `stats.html` | **Reportes** | Estadísticas |
| `staging.html` | **Staging** | Preparación de productos |
| `activity.html` | **Actividad** | Log de auditoría (ventas, inventario, apartados) |
| `settings.html` | **Configuración** | Ajustes globales — solo superadmin |

Usar siempre estos nombres en UI, botones, tickets y conversación. Nunca "Admin", "POS", "Stats".

```
tresencantos/
├── index.html      # Tienda: catálogo, filtros, modal, hero, Natura, about
├── app.js          # Lógica de la Tienda
├── style.css       # Estilos de la Tienda
├── admin.html      # Inventario: CRUD productos, estilos inline
├── admin.js        # Lógica del Inventario (~4600 líneas)
├── pos.html        # Caja: carrito, cobro, apartados, historial offcanvas
├── stats.html      # Reportes: dashboard estadísticas (Chart.js CDN)
├── staging.html    # Staging: subida masiva + IA Groq
├── activity.html   # Actividad: feed de auditoría (tabla activity_log)
├── settings.html   # Configuración: ajustes globales, solo superadmin
├── splash.js       # Transición de entrada compartida por todos los módulos admin
├── manifest.json   # PWA manifest
├── sw.js           # Service Worker (PWA offline)
├── icono-192.png   # Icono PWA
├── icono-512.png   # Icono PWA
├── logo.png
├── ofelia.jpeg
├── CLAUDE.md
└── MANUAL.md       # Manual de usuario para Ofelia, Areli y Eduardo
```

### Navegación entre módulos
Todos los módulos admin comparten una **topbar unificada** con íconos para: Caja, Inventario, Reportes, Actividad, Configuración, Tienda y Cerrar sesión. No hay botón "atrás" — la navegación es siempre desde la topbar.

En mobile algunos módulos pueden ocultar ítems según rol. `settings.html` redirige a `admin.html` si el rol no es `superadmin`.

---

## SQL — Migraciones Pendientes

```sql
-- Kits / Bundles
ALTER TABLE products ADD COLUMN IF NOT EXISTS kit_items JSONB DEFAULT NULL;

-- Imágenes adicionales por producto
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT NULL;
```

---

## Supabase

### Credenciales (hardcodeadas por archivo)
| Archivo | Key | Razón |
|---|---|---|
| `app.js` | Anon key | Solo SELECT público — seguro |
| `admin.js`, `pos.html`, `stats.html`, `staging.html`, `activity.html`, `settings.html` | Service role key | Bypasea RLS para escritura |

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
| `kit_items` | jsonb nullable | `[{id, name, qty}]` — componentes del kit. Si presente, stock se calcula desde componentes |
| `images` | jsonb nullable | `["url1","url2",...]` — imágenes adicionales (máx 5). La imagen principal sigue en `image` |

**Regla de stock:** al marcar disponible con stock=0 → auto stock=1. Al vender en POS con stock resultante=0 → auto `out_of_stock=true`.

**Regla de stock para kits:** `out_of_stock` se ignora — disponibilidad = `min(floor(comp.stock / comp.qty))` sobre todos los componentes. Al guardar un kit se fuerza `out_of_stock=false` y `stock=0`.

**Visibilidad sitio web:** el sitio filtra `is_published=true AND out_of_stock=false`. Productos agotados desaparecen automáticamente. Los kits desaparecen cuando algún componente se agota.

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
| `due_date` | date nullable | Fecha límite de pago (solo apartados) |
| `seller_email` | text nullable | Email del usuario que registró la venta |

#### `config`
| `id` | Contenido |
|---|---|
| `revista_url` | URL o base64 del PDF de la revista Natura |
| `categories` | JSON array de categorías: `[{code, label, color, parent?}]` |
| `groq_key` | API key de Groq para IA (plain text) |
| `drive_ep` | URL del Google Apps Script proxy de Drive |
| `drive_secret` | Secreto de autenticación Drive ↔ Apps Script |
| `user_names` | JSON `{"email": "Nombre visible"}` — mapeo para mostrar nombres en Actividad |

**Importante:** `groq_key`, `drive_ep` y `drive_secret` ya no están en `localStorage` — viven en esta tabla para ser compartidos entre todos los dispositivos y usuarios admin.

#### `activity_log`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | serial PK | |
| `action` | text | Tipo de evento (ver abajo) |
| `user_email` | text | Email del usuario que realizó la acción |
| `payload` | jsonb | Datos del evento (producto, venta, etc.) |
| `created_at` | timestamptz | Auto |

**Tipos de acción (`action`):**
`venta`, `apartado_nuevo`, `apartado_abono`, `apartado_liquidado`, `producto_creado`, `producto_editado`, `producto_eliminado`, `duplicado_descartado`

#### `users` (legacy)
Email + password plano. Ya no se usa para auth real (Supabase Auth JWT).

### Auth JWT
```javascript
// localStorage key "te_admin_session":
{ access_token, refresh_token, expires_at }
// Válida si: access_token existe Y expires_at > now/1000 + 60s
```

### Roles y permisos (implementado 2026-05-16)

El rol se lee de `user_metadata.role` en el JWT. Sin rol definido → `'operador'` (nunca escala permisos).

**Asignar o cambiar rol — SQL Editor en Supabase:**
```sql
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role":"superadmin"}'
WHERE email = 'email@ejemplo.com';
```
El cambio aplica en el **próximo login** — la sesión activa usa el JWT viejo.

**Usuarios actuales:**
| Email | Rol |
|---|---|
| eacevedo@sunname.com.mx | superadmin |
| ma.dolores.mtz.mtz@gmail.com | superadmin |
| areli@tresencantos.com | operador |
| ofe@tresencantos.com | duena |

**Permisos por rol:**
| Acción | superadmin | operador | duena |
|---|---|---|---|
| Ver productos | ✓ | ✓ | ✓ |
| Editar producto / precio | ✓ | ✓ | ✓ |
| Agregar producto | ✓ | ✓ | ✓ |
| Publicar en sitio web | ✓ | ✗ | ✓ |
| Eliminar producto | ✓ | ✗ | ✓ |
| Importar/Exportar JSON | ✓ | ✗ | ✗ |
| Cancelar venta (Caja) | ✓ | ✗ | ✗ |
| Bulk delete | ✓ | ✗ | ✗ |
| Ver Reportes | ✓ | ✗ | ✓ |
| Ver Actividad | ✓ | ✗ | ✓ |
| Configuración | ✓ | ✗ | ✗ |

**Comportamiento operador al crear productos:** `is_published` se fuerza a `false` — requiere que un superadmin revise y publique. El campo precio sí puede editarlo (transcribe de etiqueta física).

**Chip de rol:** eliminado de la topbar — ocupaba demasiado espacio en mobile. El rol no se muestra visualmente; los permisos siguen aplicándose en código.

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

### Roles en Inventario
- `ROLE` + objeto `can{}` se calculan al cargar desde `user_metadata.role` del JWT
- `_applyRoleUI()` oculta botones según rol (eliminar, publicar, importar JSON, agregar)
- Alerta amarilla visible solo para superadmin cuando hay productos con `price=0` — clic ordena tabla por precio asc
- Toggle `🌐 Web` / `🙈 Oculto` bloqueado para no-superadmin (toast de error si intenta)
- Operador que duplica: toast "Deshacer" 7 segundos en lugar del toast normal (única forma de borrar)

### Funcionalidades
- **CRUD** con modal — doble clic/tap en fila para editar
- **Kits / Bundles** — ver sección abajo
- **Imágenes adicionales** — ver sección abajo
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

### Kits / Bundles

Productos compuestos por otros productos del catálogo. Al vender un kit en Caja se descuenta stock de cada componente automáticamente.

**Columna:** `kit_items JSONB` — `[{id, name, qty}]`

**En el formulario:** sección "🎁 Kit / Bundle" con checkbox "Este producto es un kit". Al activarse:
- El campo Stock se deshabilita visualmente (stock calculado desde componentes, siempre `stock=0` en BD)
- Aparece buscador de componentes con cantidad por componente
- Muestra stock disponible calculado en tiempo real

**En Caja:** los kits muestran `🎁 X kits` calculado desde componentes. Al cobrar:
- Se omite del loop normal de descuento de stock
- Se descuenta stock de cada componente × cantidad vendida × `comp.qty`
- Al cancelar una venta con kit: se restaura stock de componentes

**Globals en admin.js:** `_kitItemsEdit = []` — array temporal durante la edición del formulario

**Funciones clave:**
- `toggleKitMode()` — activa/desactiva UI de kit + bloquea campo stock
- `renderKitEditor()` — renderiza lista de componentes con qty controls
- `searchKitProducts(query)` — buscador de componentes
- `addKitComponent(id)` / `removeKitComponent(id)` / `changeKitQty(id, delta)`
- `getKitStock(p)` en `pos.html` — calcula disponibilidad desde componentes

### Imágenes adicionales

Cada producto puede tener hasta 5 imágenes adicionales además de la imagen principal.

**Columna:** `images JSONB` — `["url1","url2",...]` (sin incluir `image` principal)

**En el formulario:** sección "🖼 Imágenes adicionales" — thumbnails editables, upload desde galería o URL, botón ✕ por imagen.

**En el modal del sitio:** si hay más de 1 imagen total, la zona de imagen se convierte en galería con scroll-snap horizontal nativo y dots de navegación dorados.

**En el Quick View del Inventario:** mismo comportamiento de galería con dots.

**Globals en admin.js:** `_additionalImagesEdit = []` — array temporal durante edición

**Funciones clave:**
- `renderAdditionalImages()` — renderiza la tira de thumbnails
- `addAdditionalImageUrl()` — agrega desde URL
- `handleAdditionalImageFile(input)` — sube desde galería (comprime + Drive o base64)
- `removeAdditionalImage(idx)`
- `_fileToBase64Resized(file)` — helper: comprime imagen a 900px JPEG 0.82

**En app.js/pos.html:**
- `_updateGalleryDots(gallery)` / `_goToGalleryImg(idx)` — navegación de dots en modal sitio
- `_qvGalleryScroll(gallery)` / `_qvGoTo(idx)` — navegación de dots en QV admin

### Protección "cambios sin guardar" en formulario (2026-05-22)
`_formSnapshot` / `_takeFormSnapshot()` / `_formIsDirty()` — al abrir el formulario se toma un snapshot de todos los campos 150ms después del focus. Al cerrar sin guardar, si hay diferencias aparece `confirm()`. Se limpia en `saveProduct()` y `closeForm()`.

### Funcionalidades añadidas (2026-05-22/23)
- **Drag & drop en cards** — `_cardDragStart/End/Over/Drop()` con borde dorado izquierda/derecha. Misma función `save()` que tabla.
- **Seleccionar todos los visibles** — `selectAllVisible()` usa `getFilteredProducts()`. Botón "Todos" en bulk bar + clic en contador de productos.
- **Deseleccionar** — botón ✕ en bulk bar llama `clearBulkSelection()`.
- **Bulk categoría: bottom sheet** — `bulkSetCategory()` abre `#bulk-cat-overlay` con chips tappables agrupados por padre y buscador. Reemplaza `prompt()`.
- **Gestionar categorías UX** — raíces como encabezados editables con `[+ Sub]` inline (sin prompt), subcategorías agrupadas, auto-código desde nombre. Sin mostrar códigos técnicos.
- **QV imagen: 1 clic = zoom, doble clic = cambiar imagen** — `_qvImgClick/DblClick()` + `_qvHandleImgUpload()`. Sube a Drive o base64, PATCH, refresca QV.
- **Layout wide iMac** — `≥1280px`: max-width 1440px, 7+ columnas, imagen 4:3. `≥1600px`: max-width 1800px, 9+ columnas. Botones de acción como overlay deslizante en hover (no compiten con footer).
- **Recientes centralizado** — tabla `recently_edited` en Supabase. `loadRecentlyEdited()` al iniciar, `_trackEdit()` hace upsert + cache local instantáneo.
- **TE tracking** — objeto `TE` en admin.js con batch 5s hacia tabla `usage_log`. Sección "🔧 Uso de funciones" en Reportes con top 10 acciones del período.
- **Scan result panel mejorado** — imagen 180px, stock hero tappeable con editor inline dedicado `_srpEditStock()` (blur = guardar, sin reemplazar el elemento del DOM), "Escanear otro" al final.

### Funcionalidades añadidas (2026-05-26)
- **Drag & drop mejorado** — auto-scroll al acercarse al borde de la ventana (`_dragAutoScroll`, zona 80px, velocidad proporcional al borde). Re-render **optimista**: el producto se mueve visualmente al instante antes de que Supabase confirme. Al iniciar el drag (`dragstart`) se cambia automáticamente el sort a "Mi orden" en lugar de esperar al drop.
- **Multi-select drag** — si el producto arrastrado está en `selectedIds` y hay 2+ seleccionados, se mueven todos juntos manteniendo su orden relativo. `_startMultiDrag(e)` crea ghost image "N productos" con `setDragImage`. `_doMultiDrop(targetId, insertBefore)` reemplaza el array `products` construyendo `rest + group` en el punto de inserción. Soltar sobre un producto seleccionado es no-op. Arrastrar un producto no seleccionado ignora la selección y mueve solo ese.
- **Indicadores de drop más visibles** — tabla: `box-shadow 3px` en `<tr>` + fondo dorado sutil (antes era `inset 2px` en `<td>`, casi invisible). Cards: borde superior/inferior (antes lateral — confuso en grid vertical).

### Bugs resueltos relevantes
- `closeForm()` llama `setBtn(saveBtn, false)` → evita botón Guardar bloqueado en segunda edición
- Inline stock en Android: `type="text"` + `inputMode="numeric"` + botón ✓ sin depender de `blur`
- `uploadToDrive`: usaba variables `ep`/`secret` undefined tras refactor — corregido a `driveEp`/`driveSecret`
- Historial Caja mostraba nombre del producto al momento de la venta (snapshot) — ahora usa el nombre actual del catálogo con fallback al snapshot
- Kit con `out_of_stock=true` en BD aparecía como "Agotado" en Caja aunque los componentes tuvieran stock — corregido ignorando `out_of_stock` para kits
- `.ci-price` en carrito: `display:inline-block` no basta dentro de un flex-column — la línea punteada se estiraba al 100% del ancho. Fix: `align-self:flex-start`.
- `noteDotAC` / `noteDot` — variables eliminadas en refactor pero referenciadas en templates de `adminCard()` y `mobileCard()` → `ReferenceError` que rompía todo el render del Inventario. Corregido 2026-05-22.
- **SRP aparecía sin escanear** — el bfcache del browser restauraba el DOM con `display:block` en el inline style. Fix: `window.addEventListener('pageshow', ...)` fuerza `display:none` en cada restauración de página.

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
- **Ticket por WhatsApp** — botón en modal post-venta. Al enviarlo el modal se cierra automáticamente (400ms delay) — sin tap extra. Incluye productos, total, método, cambio, nota y aviso de transferencia pendiente si aplica
- **Historial** — últimas 50 ventas en **offcanvas lateral** (botón Historial en topbar). Cancelar venta → borra `sales` → restaura stock. Solo superadmin puede cancelar (`CAN_CANCEL_SALE`)
- **Corte de caja** — botón 🧾 Corte en topbar. Muestra totales del turno (efectivo, transferencia, ventas, apartados) con opción de compartir por WhatsApp. Turno se registra en `localStorage` keys `te_shift_start` / `te_shift_date` al abrir el POS cada día
- **Apartados con fecha límite** — campo `📅 Fecha límite de pago` en el formulario de apartado (default 30 días). En la lista de apartados muestra el estado con color: rojo=vencido, ámbar=≤7 días, verde=ok
- **Banner apartados vencidos** — franja roja debajo del topbar (`#apt-venc-banner`), clickeable → abre pestaña Apartados. Se muestra/oculta al cargar apartados.
- **Modal post-venta protegido** — `onclick="void 0"` (no cierra al tocar fuera) + Escape bloqueado con `_escGuard`. Se limpia al cerrar con `closeSaleDone()`.
- **Modo Recepción** (`openRecvMode`) — overlay `#recv-overlay` para recibir inventario desde la Caja sin salir al Inventario. CSS en admin.html, JS en admin.js línea ~4164.
- **Productos OOS ocultos en Caja** — `getFilteredProducts()` filtra `outOfStock || stock === 0`. Aplica a lista, grid y búsqueda.
- **Restock desde Caja** — `_showRestockPrompt(id)` + `_confirmRestock()`. Aparece al tocar producto OOS o al superar stock en carrito (350ms delay tras shake). PATCH stock + auto-agrega al carrito.
- **Validación:** efectivo debe cubrir total; doble submit bloqueado con flag `_cobrandoAhora`
- **Mobile:** `pos-right` scrollable, cart-items con `max-height:120px` para que checkout siempre sea visible
- **seller_email** — se guarda en cada venta con el email del usuario autenticado

### Restock rápido desde la Caja (2026-05-22)

Bottom sheet `#restock-prompt` que aparece en dos situaciones:
1. **Producto OOS** (stock=0 / outOfStock=true) — tocar la fila, la imagen o el botón `+` abre el prompt directamente
2. **Stock límite en carrito** — al intentar agregar más unidades de las que hay en stock, primero sacude en rojo (350ms) y luego abre el prompt

**Flujo:** elegir cantidad con `[−] N [+]` → "Reabastecer y agregar al carrito →" → PATCH a Supabase (`stock += N, out_of_stock = false`) → actualiza array local → llama `filterAndRender()` → llama `addToCart(id)` → toast confirmación.

**Funciones:** `_showRestockPrompt(id)`, `_restockChangeQty(delta)`, `_confirmRestock()`, `_closeRestockPrompt()`
**Globals:** `_restockProductId`, `_restockQty`

**Nota CSS:** `.pos-prod-add.btn-stock-oos` — estilo gris para botón `+` de productos OOS (reemplaza `disabled`). La imagen de un producto OOS tiene `cursor:pointer` y llama `_showRestockPrompt` en vez de `openPosPreview`.

### Kits en Caja
- `getKitStock(p)` — stock efectivo: `min(floor(comp.stock / comp.qty))` sobre todos los componentes
- Tarjeta de kit muestra `🎁 X kits` y la lista de componentes en texto pequeño
- En el carrito, el kit muestra "🎁 Incluye: comp1, comp2…" como subtexto
- `changeQty()` usa `getKitStock` como tope máximo para kits

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
- **Apartados pendientes** — sección siempre visible (no filtrada por período): lista todos los apartados activos con barra de progreso, monto pendiente y estado de vencimiento
- **Por vendedor** — sección visible solo cuando hay 2+ vendedores distintos en el período; agrupa por `seller_email` con barra de progreso relativa
- **Rentabilidad** — productos con margen alto/medio/bajo según `cost`
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

## Tienda — Sitio Público (`app.js` + `index.html`)

- Anon key — solo SELECT
- Carga: `GET /products?is_published=eq.true&out_of_stock=eq.false&order=position.asc`
  - Solo productos publicados y con stock
- **Hero mobile:** strip horizontal de productos destacados con scroll touch
- **Filtros** por categoría, búsqueda, ordenamiento; modal de detalle con botón WhatsApp
- **Barra admin:** si hay sesión activa (`te_admin_session` válida en localStorage), aparece barra fija en top con accesos a Inventario / Caja / Reportes. Invisible para clientes.

### Catálogo — límite y "Ver más"
- Vista "Todo" sin búsqueda: muestra **12 productos** con botón "Ver X más"
- Al filtrar por categoría o buscar: **sin límite**, todos los resultados
- Al cambiar filtro/búsqueda/orden: resetea a los 12 iniciales

### Filtro por categoría — matching jerárquico
`catMatchesFilter(productCat, filterCat)` en `app.js` — tres niveles:
1. Exacto: `cabello === cabello`
2. Prefijo: `accesorios_cabello`.startsWith(`accesorios_`)
3. **Parentesco real** (via `publicCategories`): `cabello.parent === 'accesorios'` ✓

`publicCategories` se carga desde `config?id=eq.categories` con anon key al iniciar (en paralelo con productos). Si falla, los niveles 1 y 2 siguen funcionando.

### Modal de producto — arquitectura 3 zonas
```
┌──────────────────────┐
│  [badge]         [✕] │  ← Zona 1: imagen (flex-shrink:0, no scroll)
│   imagen / galería   │     Si hay imágenes adicionales: scroll-snap + dots
├──────────────────────┤
│ CATEGORÍA · PADRE    │  ← Zona 2: info (flex:1, overflow-y:auto)
│ Nombre del producto  │
│ Descripción...       │
│ ⚡ Últimas X unidades│
├──────────────────────┤
│ $1,349 MXN    [⬡]   │  ← Zona 3: CTA (flex-shrink:0, siempre visible)
│ [  Pedir por WA   ]  │
└──────────────────────┘
```
- En mobile: **bottom sheet** (slide desde abajo, pill de arrastre, border-radius top)
- Imagen: `object-fit:contain` + fondo `#fff` — sin recorte
- **Galería:** si el producto tiene `images[]`, Zona 1 muestra scroll-snap horizontal con dots dorados. CSS classes: `.modal-gallery`, `.modal-gallery-img`, `.mgd`, `.mgd-active`
- Categoría con contexto del padre si es subcategoría (ej: "Bolsos · Cuerpo")
- Descripción null/vacía: no renderiza `<p>` vacío
- Urgencia de stock como texto en Zona 2, no solo badge en imagen
- **Swipe ← →:** navega entre productos del catálogo con animación slide (`_modalNavigate`, `_initModalSwipeNav`)
- **Teclas ← → Esc:** misma navegación en desktop

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

## Actividad (`activity.html`)

Feed de auditoría de todo lo que pasa en el sistema. Accesible para todos los roles autenticados.

- Lee de la tabla `activity_log` — ordenada por `created_at desc`, límite 300 registros
- **Filtros:** período (Hoy / 7 días / 30 días / Todo) + usuario + tipo (Ventas / Inventario / Apartados)
- **Resumen KPIs** en la parte superior: ventas, apartados, cambios de inventario en el período
- Avatares con color fijo por usuario conocido; colores dinámicos para usuarios nuevos
- Los nombres visibles se cargan desde `config.id='user_names'` — editable en Configuración
- **Limpiar historial:** disponible en Configuración (solo superadmin)

---

## Configuración (`settings.html`)

Panel de ajustes globales. **Solo superadmin** — redirige a `admin.html` para otros roles.

### Secciones
**Catálogo:**
- Toggle **WhatsApp flotante** en Tienda (botón verde visible al hacer scroll)
- Toggle **Captura rápida** en Inventario (botón de foto + IA)
- **Categorías del catálogo** — modal para agregar/editar/eliminar (mismo que antes estaba en Inventario → Herramientas)
- **Revista Digital Natura** — URL o PDF base64

**Datos:**
- **Respaldo de productos** — Exportar / Importar JSON (movido de Inventario a aquí)
- **Nombres de usuarios** — asigna nombre visible a cada email (se guarda en `config.id='user_names'`)
- **Revisión de duplicados** — detecta productos similares
- **Limpiar historial de actividad** — borra todos los registros de `activity_log`

**Integraciones:**
- **Groq API key** — guardar/actualizar key para IA (guardada en `config.id='groq_key'`)
- **Google Drive** — configurar/probar/desconectar el Apps Script proxy

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

## Splash de Módulo (`splash.js`)

Archivo compartido por todos los módulos admin. Muestra una pantalla de entrada al navegar entre módulos.

**Uso:** cada HTML admin carga el script y llama `showSplash(icon, name, tagline)`:
```html
<script src="splash.js"></script>
<script>showSplash('🛍️','Caja','Punto de venta')</script>
```

**Módulos configurados:**
| Módulo | Ícono | Tagline |
|---|---|---|
| Caja | 🛍️ | Punto de venta |
| Inventario | 📦 | Gestión de productos |
| Reportes | 📊 | Estadísticas de ventas |
| Actividad | 📋 | Registro de operaciones |
| Configuración | ⚙️ | Ajustes del sistema |

**Animación:** el contenido aparece con scale + fade, se mantiene ~1s y el overlay sube como telón (`@keyframes ms-curtain`). Usa `height:100dvh` para centrado correcto en mobile con barras del browser.

---

## Sistema de Gestos Táctiles

Mapa completo de gestos implementados en todos los módulos:

| Módulo | Gesto | Acción | Implementación |
|---|---|---|---|
| **Inventario QV** | ← → swipe | Producto anterior / siguiente | `qvNavigate()`, `_initQVSwipe()` en overlay |
| **Inventario QV** | ↓ swipe | Cerrar con animación de bajada | `_qvCloseWithAnim('down')` |
| **Inventario QV** | ↑ swipe | Abrir formulario de edición directamente | `_qvCloseWithAnim('up')` + `openForm()` |
| **Inventario QV** | Doble tap imagen | Zoom a pantalla completa (`#qv-zoom`) | `_qvImgDoubleTap()`, `_qvOpenZoom()` |
| **Inventario QV** | ← → teclado | Navegar productos | `keydown` listener |
| **Inventario QV** | Esc teclado | Cerrar QV | `keydown` listener |
| **Formulario admin** | ↓ swipe desde header | ~~Cerrar formulario~~ — **eliminado**, interfería con el scroll del formulario |
| **Modal Tienda** | ← → swipe | Producto anterior / siguiente | `_initModalSwipeNav()`, `_modalNavigate()` |
| **Modal Tienda** | ↓ swipe | Cerrar (sigue el dedo) | `_swipeDown()` — ya existía |
| **Modal Tienda** | ← → teclado | Navegar productos | `keydown` en `initModal()` |
| **Lightbox Caja** | ↓ swipe | Cerrar (imagen sigue el dedo) | `_initLightboxSwipe()` |
| **Carrito Caja** | ← swipe en ítem | Eliminar del carrito | `applySwipeRemove()` — ya existía |
| **Historial Caja** | → swipe | Cerrar offcanvas | `initSwipeToClose()` — ya existía |

**Reglas de implementación:**
- Detectar dirección en `touchmove` (`_qvSwipeDir`, `swDir`) antes de actuar en `touchend` — evita conflictos entre swipes verticales y horizontales
- Los handlers de swipe en galería de imágenes siempre se ignoran para navegación de productos (`e.target.closest('.qv-gallery')`)
- Todos los handlers usan `{ passive: true }` — no bloquean el scroll del navegador
- El QV adjunta el swipe al `#qv-overlay` (no al panel) para evitar conflictos con scroll de `.qv-desc`

---

## Quick View del Inventario

El QV (`#qv-overlay`) es el modal de vista rápida del producto en el Inventario. Accesible por tap/clic en la imagen de cualquier producto.

**Estructura:**
- `.qv-img-zone` (260px) — imagen única o galería con dots si hay `images[]`
- `.qv-info` — categoría, nombre, precio, chips de estado, descripción scrolleable (`max-height:120px`)
- `.qv-actions` — botones Editar, Duplicar, Publicar/Ocultar, Eliminar, Revisar

**Navegación:**
- Flechas `‹ ›` sobre la imagen (hover en desktop) — `qvNavigate(-1/1)`
- Contador `N / total` junto a la categoría
- `_qvCurrentId` — ID del producto actualmente visible
- La lista de navegación es siempre `getFilteredProducts()` — respeta búsqueda y filtros activos

**Zoom fullscreen:** `#qv-zoom` — overlay oscuro creado dinámicamente, animación scale-in, se cierra tocando el fondo o el botón ✕.

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
- **PWA:** `manifest.json` + `sw.js` + íconos `icono-192.png` / `icono-512.png`. El sitio se puede instalar como app en móvil.
- **SQL pendiente** para sesiones nuevas: ver sección "SQL — Migraciones Pendientes" arriba
- **Documentación de usuario:** `MANUAL.md` en la raíz — guía para Ofelia, Areli y Eduardo, sin tecnicismos
- **Splash compartido:** `splash.js` debe estar en la raíz — todos los módulos admin lo referencian con `src="splash.js"`
- **Galería de imágenes:** CSS en `style.css` (modal tienda) y en `admin.html` `<style>` inline (QV). Clases: `.modal-gallery`, `.mgd` (tienda) / `.qv-gallery`, `.qv-gd` (admin)
- **Gestos táctiles:** nunca usar `stopPropagation` en handlers de swipe — rompe la detección de dirección. Siempre `{ passive: true }` salvo que se necesite `preventDefault` (en ese caso documentarlo)
