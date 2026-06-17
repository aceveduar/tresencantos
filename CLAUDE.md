# CLAUDE.md — Tres Encantos

Documentación técnica del proyecto. Última actualización: 2026-06-17 (rev 39).

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

Panel de administración + POS + estadísticas + carga masiva con IA + sitio e-commerce para **Tres Encantos**, boutique mexicana (bolsos, accesorios, maquillaje, Natura). Dueña: **Ofelia**, consultora Diamond de Natura. En la Tienda los pedidos se arman en un carrito y se cierran por WhatsApp — no hay checkout/pago en línea.

---

## Stack

- **Frontend:** HTML + CSS + Vanilla JS — sin framework, sin bundler, sin node_modules
- **Backend:** Supabase (PostgreSQL via REST API / PostgREST)
- **Auth:** Supabase Auth JWT — token en `localStorage` key `te_admin_session`
- **Hosting:** Archivos estáticos
- **Fuentes:** Inter + Playfair Display + Dancing Script (Google Fonts)

---

## Módulos y Archivos

### Nombres oficiales de los módulos
| Archivo | Nombre en UI | Uso |
|---|---|---|
| `index.html` + `app.js` | **Tienda** (o Website) | Sitio público |
| `admin.html` + `admin-*.js` | **Inventario** | CRUD productos |
| `pos.html` + `pos-*.js` | **Caja** | Punto de venta |
| `stats.html` + `stats.js` | **Reportes** | Estadísticas |
| `activity.html` + `activity.js` | **Actividad** | Log de auditoría (ventas, inventario, apartados) |
| `settings.html` + `settings.js` | **Configuración** | Ajustes globales — solo superadmin |

Usar siempre estos nombres en UI, botones, tickets y conversación. Nunca "Admin", "POS", "Stats".

```
tresencantos/
├── index.html           # Tienda: catálogo, filtros, modal, hero, Natura, about
├── app.js               # Lógica de la Tienda
├── style.css            # Estilos de la Tienda
│
├── admin.html           # Inventario (HTML puro, ~1000 líneas)
├── admin.css            # Estilos del Inventario
├── admin.js             # Core: constantes, auth, init, carga de productos (~934 líneas)
├── admin-render.js      # Renderizado: cards, tabla, drag&drop, inline edits
├── admin-images.js      # Config Supabase, upload Drive, IA análisis de imagen
├── admin-form.js        # Formulario CRUD, validación, save, kit editor, imágenes adicionales
├── admin-bulk.js        # Bulk actions, export/import JSON
├── admin-scanner.js     # Escáner, detección de duplicados, revisión, archivar
├── admin-categories.js  # Category manager UI + drag&drop de categorías
├── admin-utils.js       # Voz, toast, revista, nombres de usuario, flags
├── admin-recv.js        # Modo Recepción de inventario
├── admin-capture.js     # Captura rápida + swipe + modal similar
├── admin-qv.js          # Quick View con galería, gestos, inline edits
├── admin-kit-builder.js # Kit Builder overlay
├── admin-batch.js       # Carga masiva con IA + Compare modal
│
├── pos.html             # Caja (HTML puro, ~555 líneas)
├── pos.css              # Estilos de la Caja
├── pos-core.js          # Config, auth, estado, API, carga de productos/categorías
├── pos-cart.js          # Carrito, frecuentes, restock, corte de caja, gastos
├── pos-ui.js            # Gestos swipe + preview de producto
├── pos-apartados.js     # Descuento, pago, nota, apartados CRUD completo
├── pos-checkout.js      # Cobrar, ticket WA, escáner, toast, divisor, init
│
├── stats.html           # Reportes (HTML puro, ~320 líneas)
├── stats.css            # Estilos de Reportes
├── stats.js             # Lógica completa de Reportes
│
├── settings.html        # Configuración (HTML puro, ~347 líneas)
├── settings.css         # Estilos de Configuración
├── settings.js          # Lógica de Configuración
│
├── activity.html        # Actividad (HTML puro, ~91 líneas)
├── activity.css         # Estilos de Actividad
├── activity.js          # Lógica de Actividad
│
├── shared.css           # Estilos compartidos entre módulos admin
├── shared.js            # JS compartido entre módulos admin
├── manifest.json        # PWA manifest
├── sw.js                # Service Worker (PWA offline)
├── icono-192.png        # Icono PWA
├── icono-512.png        # Icono PWA
├── logo.png
├── ofelia.jpeg
├── CLAUDE.md
└── MANUAL.md            # Manual de usuario para Ofelia, Areli y Eduardo
```

### Navegación entre módulos
Todos los módulos admin comparten una **topbar unificada** con íconos para: Caja, Inventario, Reportes, Actividad, Configuración, Tienda y Cerrar sesión. No hay botón "atrás" — la navegación es siempre desde la topbar.

En mobile algunos módulos pueden ocultar ítems según rol. `settings.html` redirige a `admin.html` si el rol no es `superadmin`.

---

## Supabase

### Credenciales (hardcodeadas por archivo)
| Archivo | Key | Razón |
|---|---|---|
| `app.js` | Anon key | Solo SELECT público — seguro |
| `admin.js` (y todos los `admin-*.js`), `pos-core.js`, `stats.js`, `activity.js`, `settings.js` | Service role key | Bypasea RLS para escritura |

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
| `description` | text nullable | Opcional |
| `image` | text | URL Drive (formato `drive.google.com/thumbnail?id=FILE_ID&sz=w900`) |
| `badge` | text nullable | "Más vendido", "Nuevo", "🎁 Kit", etc. |
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
| `summary` | text | Descripción legible del evento (se muestra en Actividad) |
| `meta` | jsonb nullable | Datos del evento (producto, venta, montos, etc.) |
| `created_at` | timestamptz | Auto |

**Tipos de acción (`action`):**
`venta`, `venta_cancelada`, `apartado_nuevo`, `apartado_abono`, `apartado_editado`, `apartado_liquidado`, `apartado_cancelado`, `producto_creado`, `producto_editado`, `producto_eliminado`, `duplicado_descartado`

Cada tipo tiene su entrada en `ACTION_CFG` (`activity.js`) con `{type, badge, icon, label}` — un `action` sin entrada cae en un badge genérico "•" bajo el filtro "Inventario", por lo que cualquier `logActivity()` nuevo debe agregarse también a `ACTION_CFG`.

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
Guardadas en `config.id='categories'` como JSON. **40 categorías en total** organizadas en 8 raíces:

| Raíz | Subcategorías |
|---|---|
| Bolsos & Mochilas | Bolsos de dama, Mochilas, Mochilas dama, Mochilas personaje, Loncheras, Maletas |
| Cabello | Diademas, Donas & Ligas, Pinzas & Broches, Cepillos |
| Maquillaje | Ojos & Pestañas |
| Uñas | Uñas postizas, Limas, Herramientas, Decoración |
| Joyería | Aretes, Anillos, Pulseras, Collares & Cadenas, Bisutería surtida, Reloj |
| Natura | Perfumería, Cuerpo, Facial, Cabello Natura, Maquillaje Natura |
| Accesorios | Carteras & Monederos, Botellas & Termos, Tecnológicos, Sombreros & Gorras |
| Regalos | Bolsas de regalo |

Categoría especial: `por_revisar` — sin padre, solo para uso interno (0 productos normalmente).

Estructura de cada objeto:
```javascript
{ code: 'natura_perfumes', label: 'Perfumería', color: '#34d399', parent: 'natura' }
```
- `rootCats()` → categorías sin padre; `subCats(code)` → hijos de una raíz
- Los selects usan `<optgroup>` para agrupar visualmente
- El modal "Gestionar categorías" en Configuración permite agregar/editar/eliminar

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
- **Paginación / scroll infinito** — `renderTable()` solo monta en el DOM `getFilteredProducts().slice(0, _adminPage * ADMIN_PAGE_SIZE)` (`ADMIN_PAGE_SIZE = 50`, `admin.js`). Un sentinel al final de la lista/grid (`IntersectionObserver`) incrementa `_adminPage` y re-renderiza al acercarse al final — sin botón manual. `_adminPage` se resetea a 1 en cada cambio de búsqueda/filtro/orden. Bulk actions y "Seleccionar todos" operan sobre `getFilteredProducts()` completo, no solo lo renderizado — no afectados por la paginación.
- **Drag & drop** para reordenar (`position`) — desktop y Android Chrome. No funciona en iOS Safari. En tabletas Android (Samsung): `touch-action:none` + `user-select:none` + `-webkit-touch-callout:none` en thumbnails para evitar menú de contexto y doble-selección accidental
- **📌 Mover al inicio** — `moveToTop(id)` desde el Quick View, `bulkMoveToTop()` desde bulk bar. Mueve el/los productos al frente del array y guarda. Cambia sort a "Mi orden" automáticamente. Alternativa al drag en mobile.
- **Inline stock:** tap en chip de número → input editable. Android fix: `type="text"+inputMode="numeric"` + botón ✓ explícito. El chip aparece siempre (incluso en agotados con stock=0) para facilitar el restock.
- **Inline categoría:** tap en el label de categoría → select nativo. Guarda con `change`, cancela con `blur`/Escape.
- **Inline visibilidad web:** badge "🙈 Oculto" / "🌐 Web" es un botón — tap para alternar `is_published`. Aparece en todas las vistas (lista, grid, tabla desktop).
- **Toggle disponible/agotado:** stock=0 + marcar disponible → auto stock=1
- **Precio de costo:** campo interno — muestra margen en tiempo real (verde ≥30%, ámbar ≥10%, rojo <10%)
- **Reabastecimiento rápido:** bulk action "📦 Reabastecer" — selecciona productos, ingresa cantidad a agregar
- **Duplicar producto**
- **Búsqueda** + filtro por categoría (con subcategorías en `<optgroup>`) + ordenamiento
- **Escanear código de barras** en campo barcode, captura rápida, búsqueda, kit builder y recepción — split por dispositivo: Android/desktop usa Html5Qrcode (incluye QR), iOS usa Quagga2 (solo EAN-13/8, UPC-A/E, Code-128, sin QR)
- **Dictado por voz** (Web Speech API) — botón 🎤 junto a Nombre y Descripción. Reconstruye transcript desde `i=0` para evitar duplicados
- **Captura de imagen:** galería, drag & drop, URL, o cámara (`capture="environment"`)
- **IA en formulario de producto** — botón "✨ Completar con IA" aparece tras subir imagen; usa Groq para rellenar nombre, descripción y categoría automáticamente
- **Google Drive para imágenes** — ver sección abajo
- **Acciones bulk:** categoría, featured, oos, badge, exportar JSON, eliminar, reabastecer, 📌 al inicio
- **Import/Export JSON** — importar reemplaza catálogo con rollback local
- **Subcategorías** — modal "Gestionar categorías" en Configuración con soporte jerárquico
- **Carga masiva con IA** → overlay `admin-batch.js` (botón 📸 Masivo en topbar, solo superadmin)
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

**Kit Builder** — overlay `#kit-builder-overlay`, botón FAB 🎁 en Inventario:
- Mínimo 2 componentes requeridos
- `_kbSelectedCatCode` — variable global que almacena la categoría elegida (vía `openKitCatPicker()`)
- `_kbAutoSuggestCat()` — al tipear el nombre del kit sugiere automáticamente la categoría más probable por palabras clave; fallback a `natura` si no hay coincidencia. Solo actúa si aún no se eligió categoría manualmente.
- `_kbImageDataUrl` — imagen del kit (opcional)

**En el formulario de edición (checkbox):** sección "🎁 Kit / Bundle":
- El campo Stock se deshabilita visualmente (stock calculado desde componentes, siempre `stock=0` en BD)
- Aparece buscador de componentes con cantidad por componente
- Muestra stock disponible calculado en tiempo real

**En Caja:** los kits muestran `🎁 X kits` calculado desde componentes. Al cobrar:
- Se omite del loop normal de descuento de stock
- Se descuenta stock de cada componente × cantidad vendida × `comp.qty`
- Al cancelar una venta con kit: se restaura stock de componentes

**Globals en admin.js:** `_kitItemsEdit = []` — array temporal durante la edición del formulario

**Funciones clave:**
- `openKitBuilder()` / `closeKitBuilder()` / `_saveKit()` — flujo del builder
- `_kbAutoSuggestCat()` — auto-sugerencia de categoría por nombre
- `toggleKitMode()` — activa/desactiva UI de kit + bloquea campo stock
- `renderKitEditor()` — renderiza lista de componentes con qty controls
- `searchKitProducts(query)` — buscador de componentes
- `addKitComponent(id)` / `removeKitComponent(id)` / `changeKitQty(id, delta)`
- `getKitStock(p)` en `pos.html` — calcula disponibilidad desde componentes

### Fotos del producto — flujo unificado (2026-06-12)

Cada producto puede tener hasta 6 imágenes en total: la primera = principal (`products.image`), las demás = adicionales (`products.images`).

**Columnas:** `image TEXT` (principal) + `images JSONB` — `["url1","url2",...]` (adicionales, sin incluir la principal)

**En el formulario:** UNA sola sección "📸 Fotos del producto (la primera = principal · máx. 6)" con una sola zona de carga (`#img-upload-zone`):
- 📁 Galería (`#f-img-file`, `multiple` — permite seleccionar varias fotos de una vez)
- 📷 Tomar foto (`#f-img-camera`, `capture="environment"`)
- + URL → revela `#add-img-url-wrap` (input + botón "+ Agregar")
- Drag & drop sobre la zona (desktop)
- Ctrl+V para pegar desde el portapapeles (listener global, funciona con el formulario abierto)

Todas las rutas de carga llaman a `addImagesToForm(files)`, que itera y llama `_addImageFile(file)` por cada archivo — cada uno se agrega (`push`) a `_allImagesEdit` (tope 6, toast si se excede). El primer elemento (`index 0`) es siempre la imagen principal.

La tira `#additional-images-strip` (renderizada por `renderAdditionalImages()`) muestra TODAS las imágenes, incluyendo la principal con badge "⭐ Principal" + badge de almacenamiento (Drive/B64), botones ‹/› para reordenar y ✕ para quitar.

`#f-image` es ahora un `<input type="hidden">` — se sincroniza automáticamente con `_allImagesEdit[0]` vía `_syncMainFromStrip()` (llamada dentro de `renderAdditionalImages()`). La clase `.has-image` en `#img-upload-zone` (controlada por la misma función) reduce el padding y oculta el ícono/texto de "arrastrar" una vez que hay al menos 1 imagen.

Si se quitan todas las imágenes, la tira muestra "Sin imágenes — sube una arriba" y el botón "✨ Completar con IA" se oculta automáticamente (`hideAiFormBtn()`).

**En el modal del sitio:** si hay más de 1 imagen total, la zona de imagen se convierte en galería con scroll-snap horizontal nativo y dots de navegación dorados.

**En el Quick View del Inventario:** mismo comportamiento de galería con dots.

**Globals en admin.js/admin-form.js:** `_allImagesEdit = []` — array unificado temporal durante edición (`[0]` = principal, `[1..n]` = adicionales)

**Funciones clave:**
- `renderAdditionalImages()` — renderiza la tira completa de thumbnails (incluye la principal) y llama `_syncMainFromStrip()`
- `handleFileSelect(input)` / `addImagesToForm(files)` / `_addImageFile(file)` (`admin-images.js`) — flujo unificado de carga: resize a base64 → push a `_allImagesEdit` → intenta `uploadToDrive()` y sustituye la URL si tiene éxito
- `addAdditionalImageUrl()` — agrega desde URL
- `removeAdditionalImage(idx)`
- `_aiMove(idx, dir)` — reordena imagen en la tira (dir: -1/+1). Botones ‹/› en cada thumbnail (mobile y desktop). El drag HTML5 de thumbnails se mantiene solo para desktop
- `_fileToBase64Resized(file)` — helper: comprime imagen a 900px JPEG 0.82

**En app.js/pos.html:**
- `_updateGalleryDots(gallery)` / `_goToGalleryImg(idx)` — navegación de dots en modal sitio
- `_qvGalleryScroll(gallery)` / `_qvGoTo(idx)` — navegación de dots en QV admin

### Protección "cambios sin guardar" en formulario
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
- **Indicadores de drop más visibles** — tabla: `box-shadow 3px` en `<tr>` + fondo dorado sutil. Cards: borde superior/inferior.

### Funcionalidades añadidas (2026-06-01)
- **📌 Mover al inicio** — `moveToTop(id)`: mueve un producto al frente del array `products`, llama `save()`, cambia sort a "Mi orden". Botón dorado en Quick View (visible para roles con `can.editProduct`). `bulkMoveToTop()`: mueve todos los seleccionados al frente manteniendo su orden relativo entre sí. Botón en bulk bar. Solución para mobile donde drag & drop no funciona.
- **Kit Builder — fix categoría** — `_kbSelectedCatCode` reemplaza el uso de `select#kb-category.value` (el select está vacío, asignarle `.value` no tenía efecto). `_kbAutoSuggestCat()` sugiere categoría automáticamente al tipear el nombre.

### Funcionalidades añadidas (2026-06-06)
- **Multi-select estilo Snapseed** — long-press (300ms) sobre cualquier card activa modo selección con círculo checkmark dorado superpuesto en esquina superior izquierda (`appearance:none`, SVG incrustado). Card seleccionada baja brillo (`filter:brightness(.82)`). Checkbox `.ac-check` (cards mobile) y `.mpc-check-over` (tabla/grid desktop) con mismo estilo.
- **Ordenar por fecha de creación** — opciones "Más nuevos" (`created-new`) y "Más antiguos" (`created-old`) en el select de ordenamiento. Usa `createdAt` del producto con fallback a `id` desc/asc. Persiste en `localStorage` igual que los demás sorts.
- **Persistencia de sort en localStorage** — `currentSort` se inicializa con `localStorage.getItem('te_admin_sort') || 'recent'` en lugar de siempre 'recent'. Se guarda en cada cambio del select y al llamar `_forcePositionSort()`. Evita que al recargar la página el orden del drag regrese a "Recientes".
- **Drag sort al soltar, no al arrastrar** — `_forcePositionSort()` se llama en los handlers de `drop` (tabla y cards), no en `dragstart`. Antes el sort cambiaba visualmente en cuanto se iniciaba el drag, causando re-render y pérdida del producto arrastrado.
- **Imágenes adicionales — botones ‹/› para reordenar** — `_aiMove(idx, dir)` reordena en el array y re-renderiza. Reemplaza el drag exclusivo que no funcionaba en móvil. El drag HTML5 permanece para desktop.
- **Fix Samsung tablet — drag limpio** — thumbnails de imágenes adicionales tienen `touch-action:none`, `user-select:none`, `-webkit-touch-callout:none` y `ontouchstart="event.stopPropagation()"` para evitar menú de contexto y doble-selección. `_aiDragLeave` eliminado (usaba `e.currentTarget` nulo en handlers inline).
- **Fix QV toggle publicado** — `_qvTogglePublished(id)` ahora llama `_qvRefresh(id)` directamente tras `togglePublished()`. Antes el ícono del ojo no cambiaba visualmente porque había una comprobación redundante de `_qvCurrentId === id`.
- **Fix captura rápida → Drive** — `saveCaptureProduct()` sube la imagen a Drive (`uploadToDrive()`) antes de guardar en Supabase. Antes se guardaba el base64 directamente sin intentar el upload a Drive.
- **Historial y Corte en topbar de Caja (tablet/desktop)** — botones `#btn-history-pos` y `#btn-corte-pos` en `topbar-right` visibles en `≥641px`. En `≤640px` permanecen `display:none!important` (se acceden desde la tab bar mobile).
- **isIOS detection iPad iOS 13+** — `isIOS` ahora incluye `(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)` como fallback. iOS 13+ en iPad reporta `Macintosh` en userAgent, no `iPad`, rompiendo la detección del escáner Quagga2.

### Bugs resueltos relevantes
- `closeForm()` llama `setBtn(saveBtn, false)` → evita botón Guardar bloqueado en segunda edición
- Inline stock en Android: `type="text"` + `inputMode="numeric"` + botón ✓ sin depender de `blur`
- `uploadToDrive`: usaba variables `ep`/`secret` undefined tras refactor — corregido a `driveEp`/`driveSecret`
- Historial Caja mostraba nombre del producto al momento de la venta (snapshot) — ahora usa el nombre actual del catálogo con fallback al snapshot
- Kit con `out_of_stock=true` en BD aparecía como "Agotado" en Caja aunque los componentes tuvieran stock — corregido ignorando `out_of_stock` para kits
- `.ci-price` en carrito: `display:inline-block` no basta dentro de un flex-column — la línea punteada se estiraba al 100% del ancho. Fix: `align-self:flex-start`.
- `noteDotAC` / `noteDot` — variables eliminadas en refactor pero referenciadas en templates → `ReferenceError` que rompía todo el render. Corregido 2026-05-22.
- **SRP aparecía sin escanear** — el bfcache del browser restauraba el DOM con `display:block`. Fix: `window.addEventListener('pageshow', ...)` fuerza `display:none` en cada restauración de página.
- **Kit category en builder** — `select#kb-category` nunca tenía `<option>`s, `sel.value = cat.code` no tenía efecto y la validación siempre fallaba. Corregido con `_kbSelectedCatCode`. (2026-06-01)
- **Kits en tienda siempre "Agotado"** — `app.js` evaluaba `oos = stock === 0`, siempre true para kits. Corregido con `isOos(p)` y `kitStock(p)`. (2026-06-01)
- **QV icono publicado no actualizaba** — `_qvTogglePublished` tenía check redundante; `_qvRefresh(id)` no se llamaba. Corregido llamando `_qvRefresh(id)` directamente. (2026-06-06)
- **Captura rápida guardaba base64 en BD** — `saveCaptureProduct` no llamaba `uploadToDrive`. Corregido con await antes de construir el payload. (2026-06-06)
- **Drag en tableta Android: menú contextual y doble selección** — faltaba `user-select:none` y `touch-action:none` en thumbnails de imágenes adicionales. Corregido. (2026-06-06)
- **Drag cambiaba sort al iniciar** — `_forcePositionSort()` estaba en `dragstart`; movido a los handlers de `drop`. El cambio de sort intermedio causaba re-render y pérdida visual del elemento arrastrado. (2026-06-06)
- **Sort se reseteaba al recargar** — `currentSort` no se leía de `localStorage` al iniciar. Corregido con `localStorage.getItem('te_admin_sort') || 'recent'`. (2026-06-06)
- **iPad iOS 13+ no detectado como iOS** — `navigator.userAgent` reporta `Macintosh` en iPad con iOS 13+. Agregado fallback `navigator.maxTouchPoints > 1` en `isIOS`. (2026-06-06)
- **Caja no cargaba productos en catálogo** — `_esc is not defined` (helper no declarado en ningún archivo cargado por `pos.html`) lanzaba `ReferenceError` dentro de `renderPosProducts()`, llamado sincrónicamente tras `await Promise.all(...)` en `init()`. Esto detenía el resto de `init()` antes de poblar `#pos-results` (pero `#pos-frecuentes` sí renderizaba porque no usa `_esc`). Mismo patrón que el bug de `TE` no definido. Fix: `_esc` agregado a `pos-core.js` línea 7. (2026-06-08)
- **Patrón de debugging — `ReferenceError` silencioso en `init()`**: si una función llamada sincrónicamente dentro de `init()` (tras el `await Promise.all(...)` inicial) referencia un identificador global no declarado en ningún script cargado por la página, lanza `ReferenceError` y aborta el resto de `init()` sin mensaje visible — solo algunas secciones de la UI quedan sin poblar. Si algo se queda en su placeholder ("Cargando...") mientras otras secciones sí cargan, sospechar de esto primero y revisar la consola del navegador.
- **Modal de tienda no respetaba productos 📌 Apartado** — `cardHTML` calculaba `apt = p.isApartado && p.stock <= 1` para mostrar badge "Apartado" + botón "Consultar", pero `openModal` solo usaba `isOos(p)` (true para estos productos) y mostraba "Agotado" + "Avisarme cuando haya stock" — inconsistente con la tarjeta. Corregido replicando `apt` en `openModal`: badge "📌 Apartado" + botón "Consultar por WhatsApp" (`#92400E`, mismo `whatsapp(p.id)` sin pasar `this` para no romper el estilo inline tras el reset de 2.2s). (2026-06-10)
- **Cancelaciones en Caja sin rastro en Actividad** — `cancelApartado()` (pos-core.js) y `deleteSale()` (pos-ui.js) restauraban stock y borraban el registro de `sales`, pero nunca llamaban `logActivity()` — cancelar una venta o un apartado (acciones restringidas a superadmin/encargado/dueña) no dejaba evidencia en Actividad. Corregido agregando `logActivity('venta_cancelada', ...)` / `logActivity('apartado_cancelado', ...)` en ambos. Además, `apartado_editado` (ya emitido por `saveEditApt()`) no existía en `ACTION_CFG` de `activity.js` y se mostraba como "• apartado_editado" bajo el filtro "Inventario". Se agregaron las 3 entradas a `ACTION_CFG` (`venta_cancelada`, `apartado_editado`, `apartado_cancelado` — badge `eliminado`/`apartado` según corresponda). (2026-06-10)
- **Gap en sweep `_esc()` — Editar apartado** — `renderEditAptItems()` (`pos-apartados.js`) insertaba `item.name` directamente en `innerHTML` sin pasar por `_esc()`, el único punto de Caja que quedó fuera del sweep 2026-06-08/09. Corregido. (2026-06-10)
- **Gap en sweep `_esc()` — Gastos del turno** — `renderGastos()` (`pos-cart.js`) insertaba `g.desc` (texto libre de la cajera) directo en `innerHTML` sin `_esc()`. Corregido. (2026-06-11)
- **Escáner de Inventario nunca funcionó — `_onAdminScan` no estaba definido** — `admin-scanner.js` llamaba `_onAdminScan(code)` al detectar un código (rama Quagga y rama html5-qrcode), pero esa función no existía en ningún archivo del proyecto. Cada escaneo exitoso lanzaba un `ReferenceError` silencioso (mismo patrón que el bug de `_esc`/`TE` documentado arriba) — la cámara mostraba el código enmarcado correctamente pero no pasaba nada, en los 5 contextos de escaneo (`form`, `capture`, `search`, `kb`, `recv`). Bug preexistente desde antes del refactor de `admin.js` (confirmado en el monolito original). Corregido definiendo `_onAdminScan(code)` con despacho por `_scanCtx`: `form`/`capture` rellenan el campo de barcode (`#f-barcode`/`#cap-barcode`); `search` busca el producto y abre el Quick View (`showScanResult`); `kb` agrega el componente al Kit Builder (`_kbAddComponent`); `recv` delega a `recvSearch(code)` (agrega o muestra "no encontrado"). Sin coincidencia en `search`/`kb`: `_adminBarcodeNotFound(code)` deja la cámara abierta para reintentar (mismo patrón que Caja). (2026-06-11)
- **Escáner poco confiable en Android — cambio a Quagga2 universal** — el decodificador de 1D (EAN-13/UPC/Code-128) de html5-qrcode resultó poco confiable en cámaras Android incluso con el código bien encuadrado. Se eliminó la rama `isIOS`/html5-qrcode en `admin-scanner.js` y `pos-checkout.js` — ahora **todos** los dispositivos usan Quagga2 (ya probado y estable en iOS). Se quitó el `<script src=".../html5-qrcode...">` de `admin.html` y `pos.html`. Trade-off aceptado: Quagga2 no detecta códigos QR — confirmado con la usuaria que ~98% de los productos usan código de barras (EAN/UPC), no QR. (2026-06-11)
- **Restock rápido desde la Caja silenciosamente roto — `filterAndRender` no estaba definida** — `_confirmRestock()` (`pos-cart.js`) llamaba `filterAndRender()` tras el PATCH de stock, función inexistente en todo el proyecto (mismo patrón `ReferenceError` silencioso que `_esc`/`TE`/`_onAdminScan`). El stock se actualizaba correctamente en Supabase y el bottom sheet se cerraba, pero `addToCart(id)` y el toast de confirmación nunca se ejecutaban — el producto reabastecido no se agregaba al carrito. Corregido con `searchProducts(document.getElementById('pos-search')?.value || '')`, mismo patrón de re-render usado en `_handleRealtimeProduct()`. (2026-06-11)
- **Revertir apartado liquidado sin rastro en Actividad** — en `deleteSale()` (pos-ui.js), la rama "regresar como apartado pendiente" (al cancelar una venta que vino de un apartado liquidado) no llamaba `logActivity()`. Corregido con `logActivity('apartado_editado', 'Revirtió apartado liquidado de {nombre} a pendiente', ...)`. (2026-06-11)
- **Gap en sweep `_esc()` — Reportes / Ventas recientes** — `renderRecentSales()` (`stats.js`) insertaba la lista de nombres de productos (`prods`) sin `_esc()`, tanto en `title="..."` como en el contenido del div — el sweep 2026-06-08/09 no cubrió Reportes. Corregido. (2026-06-11)
- **Gap en `escH()` — Configuración / Gestionar categorías** — `moveOpts` (selector "↳ Mover a otra categoría" en `renderCatList()`, `settings.js`) insertaba `x.label` sin `escH()`, a diferencia de `parentOpts` (mismo patrón `<option>`, sí escapado). Corregido. Además `escH()` no escapaba `>` (a diferencia de `_esc()` del resto de módulos) — agregado `.replace(/>/g,'&gt;')`. (2026-06-11)
- **Gap en sweep `_esc()` — Tienda / Carrito "Mi pedido"** — `renderCartBody()` (`app.js`) insertaba `item.name` sin `_esc()` en `alt` y en el nombre visible del ítem — único punto de la Tienda pública fuera del sweep, y el de mayor exposición (lo ven todas las clientas). Corregido. (2026-06-11)
- **Gap en sweep `_esc()` — Inventario / Nota de "🚩 Marcar para revisión"** — `flagData.note` (texto libre del admin/operador) se insertaba sin `_esc()` en `title="..."` (`admin-render.js`, vistas cards y tabla/lista) y como contenido en el Quick View (`admin-qv.js`). Corregido en los 3 puntos. (2026-06-11)
- **Gap en sweep `_esc()` — Carga masiva con IA**: `admin-batch.js` insertaba `item.description` (texto generado por Groq) sin escapar dentro de `<textarea>...</textarea>` — una respuesta de IA con `</textarea>` rompería el HTML. `item.name` solo escapaba comillas dobles. Ambos corregidos con `_esc()`. (2026-06-11)
- **Gap en sweep `_esc()` — Tienda / filtro de categorías** — `renderCategoryFilters()` (`app.js:696`) insertaba `r.label` (nombre de categoría) sin `_esc()` en los botones de filtro de la Tienda pública. Corregido. El resto de sitios donde `category.label` se inserta sin escapar (`admin.js`, `admin-bulk.js`, `admin-batch.js`, `admin-form.js`, `pos-core.js`) queda documentado como pendiente — ver Deudas Técnicas. (2026-06-11)
- **Escáner de código de barras no detectaba en Android (Inventario y Caja)** — confirmado en prueba real en tienda física: la cámara abría correctamente pero nunca capturaba el código. Causa: `experimentalFeatures: { useBarCodeDetectorIfSupported: true }` en `Html5Qrcode` (`pos-checkout.js`, `admin-scanner.js`) hace que la librería use la API nativa `BarcodeDetector` de Chrome Android, que depende de un módulo de Google Play Services/ML Kit que en muchos dispositivos no está disponible o no soporta bien formatos 1D (EAN-13, Code128, UPC) — `detect()` nunca regresa coincidencias, sin error visible. Quitada la bandera en ambos archivos para forzar el decodificador JS interno (ZXing), consistente en Android. (2026-06-11)
- **Sweep `category.label` sin escapar — 5 archivos restantes** — completado el pendiente documentado en Deudas Técnicas: `admin.js` (selects de formulario/filtro de tabla, bottom sheet de categorías), `admin-bulk.js` (bottom sheet de categoría bulk), `admin-batch.js` (select de carga masiva), `admin-form.js` (chips de filtros activos), `pos-core.js` (chips de categoría y headers de grupo en Caja). Todos ahora usan `_esc()`. De paso se encontraron y corrigieron 2 gaps de mayor exposición en `admin-bulk.js` (`_bcpFilter`): el término de búsqueda del bottom sheet de categorías (`q`/`label`, texto libre del usuario) se insertaba sin escapar en 3 sitios ("Sin resultados para...", "Crear como categoría", "Crear como subcategoría de..."). (2026-06-11)
- **Tuning de Quagga2 (resolución/foco/consenso) probado y revertido** — tras el reporte "captura mal los números, tarda en enfocar" (config base de Quagga2 sin ajustes), se agregó a `admin-scanner.js`/`pos-checkout.js`: `inputStream.constraints` con `width`/`height` ideal 1280×720 + `advanced:[{focusMode:'continuous'}]`, filtro de error promedio de `decodedCodes[].error` > 0.15, y exigir 2 lecturas idénticas consecutivas antes de aceptar. **Prueba real en Android: peor que la config base** — el usuario reportó "me gustaba más como estaba antes, capturaba casi siempre correctamente y rápido". Revertido por completo (commit revert de `fad9db4`). **No reintentar este enfoque** sin poder probar en el dispositivo real — la config base de Quagga2 (sin constraints adicionales, sin filtro de error, sin consenso) es la que mejor funciona para esta usuaria. (2026-06-11)
- **Escáner Quagga2 — `locate:true` se quedaba "atascado" dibujando recuadros sin detectar** — tras revertir el tuning anterior, prueba real reveló otro problema: con `locate:true` (config original), Quagga busca patrones de barra en **toda la imagen** y dibuja en el canvas overlay un recuadro de "candidato" sobre cualquier región que parezca un código (incluso teclado, cables, etc. en el fondo); en escenas con fondo no liso esos recuadros aparecen y se quedan fijos sin que `onDetected` dispare nunca — "se queda atascado, nunca pasa nada". Corregido en `admin-scanner.js` y `pos-checkout.js` con el patrón estándar de Quagga2 para esto: `locate:false` + `inputStream.area:{top:'35%',right:'10%',left:'10%',bottom:'35%'}` — Quagga ya no busca en toda la imagen, decodifica directo el recorte central (más rápido, sin el recuadro "atascado"). Se agregó un marco visual `.scan-frame` (borde dorado + spotlight oscuro alrededor, `shared.css`) en `#scanner-reader`/`#pos-reader` que coincide con ese `area`, para que la usuaria sepa dónde alinear el código (mismo patrón que apps de escaneo tipo Square/Shopify POS). Pendiente confirmar en dispositivo real. (2026-06-11)
- **Escáner Quagga2 — barra negra debajo del video + marco `.scan-frame` desalineado** — tras el fix anterior (`locate:false`+`area`+`.scan-frame`), prueba real mostró un rectángulo negro grande debajo del video con el borde dorado del marco a caballo entre el video y esa zona negra. Causa: Quagga2 inserta en el DOM tanto `<video>` (la cámara) como un `<canvas>` (overlay de depuración/locator) dentro de `#scanner-reader`/`#pos-reader`; ambos elementos tenían `width:100%;height:auto`, así que el `<canvas>` (vacío/negro con `locate:false`) se apilaba como bloque debajo del `<video>`, inflando la altura total del contenedor — `.scan-frame`, posicionado con porcentajes relativos a esa altura combinada, terminaba fuera del área real del video. Corregido en `admin.css` y `pos.css`: `#scanner-reader canvas`/`#pos-reader canvas` → `display:none!important`; `video` queda como único elemento visible con `display:block`. El marco dorado ahora debe alinearse limpiamente sobre el video, sin barra negra. Pendiente confirmar en dispositivo real (incluyendo si la detección de código sigue funcionando bien con `locate:false`). (2026-06-11)
- **Escáner Quagga2 — diagnóstico erróneo de "recuadros atascados", revertido a `locate:true` sin recorte** — el fix anterior (`locate:false`+`area`) asumió que `locate:true` causaba los recuadros "candidato" atascados en pantalla. Diagnóstico incorrecto: esos recuadros los dibuja Quagga en el `<canvas>` de depuración — el mismo canvas que el fix de la barra negra (entrada anterior) ya oculta con `display:none!important`, **independientemente del valor de `locate`**. Es decir, ocultar el canvas ya resolvía por sí solo el problema visual de los recuadros atascados; el cambio a `locate:false`+`area` fue innecesario y nunca se probó en captura real. Como la config `locate:true` sin `area` (la de antes de ese fix) fue la que el usuario confirmó explícitamente como "capturaba casi siempre correctamente y rápido", se revierte `locate:false`→`true` y se quita `inputStream.area` en `admin-scanner.js` y `pos-checkout.js` — Quagga vuelve a buscar el patrón en toda la imagen (detección validada), mientras `.scan-frame` queda como guía visual puramente decorativa (no limita la decodificación) y el canvas permanece oculto (sin recuadros visibles, sin barra negra). CACHE_VERSION v27→v28. Pendiente confirmar en dispositivo real. (2026-06-11)
- **Escáner — revertido todo el experimento "Quagga2 universal" (entradas 489, 498, 500-503), de vuelta al split Html5Qrcode/Quagga2 validado** — prueba real tras CACHE_VERSION v28: la captura con Quagga2 en Android seguía siendo mala ("captura mal el código"), peor que antes de empezar la sesión de hoy. El usuario confirmó con una captura de pantalla previa que el split **Html5Qrcode (Android/desktop, con `useBarCodeDetectorIfSupported:true` y `qrbox:{width:260,height:100}`, su marco de esquinas dorado nativo) + Quagga2 (solo iOS, `locate:true`, sin `area`)** — el estado de antes de hoy (commit `a2e7f61`/`51f94f8`) — sí detectaba rápido y bien. Se restauró ese split en `admin-scanner.js`/`pos-checkout.js` (con `isIOS` inline de nuevo, como antes), se re-agregó `<script src=".../html5-qrcode@2.3.8...">` en `admin.html`/`pos.html`, y se revirtieron los estilos `#scanner-reader`/`#pos-reader` y `.scan-frame` (`shared.css`, eliminado) a como estaban antes del experimento. **Lo único que se conserva del experimento de hoy** (genuinamente nuevo, no existía antes): `_onAdminScan` (entrada 488, antes inexistente) y el patrón "código no encontrado → cooldown 1.5s sin cerrar cámara" (`_adminBarcodeNotFound`/`_posBarcodeNotFound`), ahora reconectados a ambos motores (Html5Qrcode y Quagga2) mediante una bandera `_scanCooldown`/`_posScanCooldown` compartida. CACHE_VERSION v28→v29. **No reintentar Quagga2 universal** sin poder probar en el dispositivo real de la usuaria — el split anterior es el validado. (2026-06-11)
- **Limpieza de código muerto (auditoría completa)** — tras una auditoría general del proyecto, se eliminó código sin uso y se conectó código existente pero huérfano:
  - **Eliminado — subsistema "SRP" (Scan Result Panel)**: funciones `_srpClickTimer`, `_srpGalleryScroll`, `_srpGoTo`, `_srpImgClick/DblClick`, `_srpHandleImgUpload`, `_srpOpenZoom`, `_srpToggleDesc`, `_srpRefresh`, `clearScanResult` (`admin-qv.js`/`admin-scanner.js`) y ~76 líneas de CSS asociado (`admin.css`) — no tenían ningún HTML (`#srp-overlay`, `#scan-result-panel`) en ningún archivo del proyecto; el panel real de resultado de escaneo (`showScanResult`) es otro sistema, ya activo.
  - **Eliminado — UI vieja de "duplicados" en topbar/banner**: botón `#dup-badge-btn` (topbar de Inventario) y banner `#dup-banner` (con `_dismissDupBanner()` que escribía `te_dup_dismiss` en localStorage, nunca leído) — el flujo activo de duplicados es `openDupReview()` (bottom sheet `.dup-sheet-pill`), que se mantiene intacto.
  - **Eliminado — `<select id="kb-category">` huérfano y `_kbPopulateCategories()`**: el select estaba oculto y nunca se poblaba (`_kbSelectedCatCode` ya era la fuente real de verdad desde el fix de 2026-06-01); se quitó el `<select>` de `admin.html` y la función + referencia `kbCatSel` en `admin-kit-builder.js`.
  - **Eliminado — modal "Ventas recientes" viejo en Reportes**: `renderRecentSales()`, `openSaleDetail()`, `closeSaleDetail()`, `_recentForDetail` (`stats.js`), `#sd-overlay` (`stats.html`) y CSS `.recent-*`/`.sd-*` (`stats.css`) — nunca se llamaba desde `renderAll()` y su contenedor `#recent-sales` ni existía en el HTML; quedó completamente superado por "Ventas del día" (`renderTodaySales()`/`dvToggle()`/`.dv-*`, ya activo).
  - **Rescatado — contador de duplicados en Configuración**: `settings.js` ya leía `te_dup_last_count` de localStorage para mostrar "X posibles" junto a "Revisión de duplicados", pero nada lo escribía. Se agregó `localStorage.setItem('te_dup_last_count', _findDuplicatePairs().length)` en el flujo de inicio de Inventario (`admin.js`, junto a `initRealtime()`).
  - CACHE_VERSION v29→v30. (2026-06-12)
- **Reversión de 2 rescates — no se usan**: tras probar lo anterior, la usuaria decidió que no usa "📦 Reabastecer"/"📤 Exportar selección" en la bulk bar de Inventario ni las pills "Mejor día / Top categoría / Prom. día" en Reportes. Se eliminó por completo (no solo el botón, también el código fuente): `bulkRestock()` y `bulkExport()` (`admin-bulk.js`), sus botones y el gateo `can.importJSON` (`admin.html`/`admin.js`); `renderInsights()`, su llamada en `renderAll()`, `#insights-row` y `.insight-pill`/`.insights-row` (`stats.js`/`stats.html`/`stats.css`). CACHE_VERSION v30→v31. (2026-06-12)
- **Limpieza de código muerto — ronda 2 (auditoría completa)** — segunda auditoría general del proyecto, misma metodología que la ronda anterior:
  - **Tienda**: eliminado `doLogout()` huérfano (`app.js` — sin botón que lo invoque, la barra admin de la Tienda no tiene salir) y CSS muerto `.btn-login`/`.btn-outline`/`.modal-btn-wa` (`style.css`).
  - **Inventario — bloque "Herramientas"**: eliminado de `admin.html` el bloque completo "Herramientas" (`display:none` desde que sus funciones migraron a Configuración) — Catálogo/Datos/Integraciones (toggle WA flotante, categorías, revista, JSON, nombres, Groq, Drive) — junto con sus 3 modales muertos (`#revista-overlay`, `#cat-overlay`, `#names-overlay`). Eliminadas las funciones correspondientes: en `admin-utils.js` el bloque Revista (`openRevista`/`closeRevista`/`saveRevista`/etc.) y Nombres (`nameMap`/`_loadNameMap`/`openNamesModal`/`saveNamesAdmin`); en `admin-images.js` `toggleWaFloat`, `saveGroqKey`, `saveDriveEndpoint`, `copyDriveSecret`, `clearDrive`, `testDriveEndpoint`, `loadDriveConfig`, `loadGroqKeyStatus` y la lectura muerta de `wa_float`. Eliminado `admin-categories.js` completo (237 líneas — `openCatManager`, `addCategory`, etc.; `settings.js` ya tiene su propio gestor de categorías independiente). Limpiado `admin.css`: bloque Category Manager (`.cat-mgr-*`, `.new-cat-grid*`) y bloque Herramientas (`.io-bar`, `.tools-*`) — `.io-bar` parecía "usado por settings.html" pero su única referencia real era el bloque recién eliminado de `admin.html`.
  - **Inventario — variables muertas**: `_qvDismissEditor` (`admin-qv.js`), `_recvFbPendingQty` (`admin-recv.js`).
  - **Caja — variables muertas**: `_posRealtimeChannel` (`pos-core.js`), `_posPrevId` (`pos-ui.js`).
  - **Caja — `loadTodayStats()` arreglada y activada**: dependía de `#today-stats` (pill de topbar desktop que nunca existió en `pos.html`) — la función siempre retornaba antes de llegar a `#daily-summary-mobile` (barra "Hoy" sobre la lista de productos, presente en el HTML desde antes pero nunca poblada). Quitada la dependencia de `#today-stats`; ahora puebla directamente `#daily-summary-mobile` con efectivo/transferencia/total del día. Agregada `@media(min-width:641px){#daily-summary-mobile{display:none!important}}` (solo mobile, como indica el comentario del HTML). Eliminado CSS muerto `.today-stats`/`#today-stats` (`pos.css`).
  - **Caja — fix `refreshPosProducts()`**: usaba `document.getElementById('btn-refresh-pos')`, pero el botón real es `#pos-refresh-btn` — el feedback visual (opacidad reducida durante la actualización) nunca se aplicaba. Corregido el id.
  - **Caja — CSS muerto adicional (`pos.css`)**: `.history-del-btn`, `.btn-outline-white`, `.btn-red`, `.title-long`/`.title-short`, `#btn-stats-pos`, `.change-display`/`.change-amount`, `.checkout-divider`, `.apartado-pending-lbl`, `.topbar-right > .btn-outline-white:last-of-type` — sin uso en ningún HTML/JS del módulo.
  - **Actividad**: eliminado sistema `toast()` completo — función + `_toastT` (`activity.js`), `#toast` (`activity.html`), `.toast`/`.toast.show`/`.toast.success` (`activity.css`) — cero llamadas en todo el módulo.
  - **Reportes/Configuración/Compartido**: eliminado CSS muerto `.btn-back` (×4, `stats.css`), `.user-display` (`stats.css`), `.scard-expand` (`settings.css`), `.topbar-title-group` y `.topbar-left h2` (duplicados en `admin.css`/`stats.css`/`shared.css`) — ningún `.topbar-left` del proyecto contiene `<h2>` ni un elemento con clase `topbar-title-group`.
  - **Eliminado `splash.js`** (14 líneas, `window.showSplash`) y su sección "Splash de Módulo" de este documento — el archivo nunca fue referenciado por ningún `<script src="splash.js">`; la pantalla de transición entre módulos no estaba activa.
  - CACHE_VERSION v31→v32. (2026-06-12)
- **Inventario — "Agregar producto" en mobile: campo "Nombre del producto" oculto e inalcanzable** — auditoría UX/UI confirmó por hit-testing (`getBoundingClientRect`/`elementFromPoint`) que en el formulario de producto nuevo (sin imágenes aún) las secciones vacías "📸 Fotos del producto" + "Galería de imágenes" empujan `#f-name` ~8px fuera del área visible de `.modal-body` (`clientHeight` 563px vs `scrollHeight` 2059px) — el input queda detrás de `.modal-foot` (sticky, 135px de alto por dos botones apilados con `flex-direction:column-reverse`) y los taps ahí caían en `#save-btn`. Corregido en `admin.css`: `.modal-foot` mobile pasa a una sola fila (Cancelar | Guardar — y Cancelar | Sí, eliminar en `#del-overlay`, mismo patrón), de 135px a 65px de alto, liberando 70px para `.modal-body`. `#f-name` ahora cae dentro del área visible (top:717 vs clientHeight 633) y el hit-test confirma que el tap llega a `#f-name`. CACHE_VERSION v32→v33. (2026-06-12)
- **Inventario — chips de filtro `.stats` en mobile sin indicador de scroll** — auditoría UX/UI: en mobile la fila de chips (`#stats`, hasta 10: Todos/Kits/Con stock/Sin stock/Última pieza/Sin publicar/Borradores/Por revisar/Sin código/Imagen base64) mide ~1334px de contenido en un contenedor de 390px — solo ~3 chips visibles, sin ninguna señal de que hay más (el `mask` de fade existente era casi imperceptible). Corregido envolviendo `#stats` en `.stats-wrap` (`admin.html`) con un indicador `›` fijo en el borde derecho sobre un degradado hacia `var(--cream)` (`admin.css`, mobile). Nueva función `_statsScroll()` (`admin-render.js`, llamada desde `renderStats()` y desde `onscroll` de `#stats`) oculta el `›` (clase `.at-end`) cuando ya no queda contenido a la derecha — tanto en la vista normal como en "Ver archivados". Sin cambios en desktop (`::after` solo existe dentro del media query mobile). CACHE_VERSION v33→v34. (2026-06-12)
- **Inventario — FABs flotantes (`.fab-add`/`.fab-kit`) y `#scroll-top-btn` tapaban la última tarjeta en mobile** — auditoría UX/UI: con `main{padding-bottom:14px}`, al llegar al final de la lista (scroll infinito, hasta 698 productos) la última tarjeta queda directamente debajo de los botones flotantes — el FAB dorado `+` (58px) y el FAB oscuro `🎁` (46px), ambos `bottom:24px`, y `#scroll-top-btn` (38px, `bottom:92px`) — hit-test confirmó que `elementFromPoint` sobre la miniatura/precio/acciones de la última tarjeta devolvía esos botones en vez del contenido de la tarjeta. Corregido aumentando el padding inferior de `main` en mobile a `calc(136px + env(safe-area-inset-bottom))` (cubre los 130px que ocupa `#scroll-top-btn`, el más alto de los tres, más margen) — la última tarjeta ahora despliega completamente por encima de los tres botones flotantes, confirmado por hit-test (`closestCard:true` en imagen, precio y botones editar/eliminar). Sin cambios en desktop (regla dentro de `@media(max-width:640px)`, padding-bottom desktop sigue en 24px). CACHE_VERSION v34→v35. (2026-06-12)
- **Inventario — `#sort-select` truncaba "Más nuevos"/"Más antiguos" en mobile** — auditoría UX/UI: la regla anti-zoom-iOS `select{font-size:16px!important}` (línea ~973) sobreescribe el `.80rem` pensado para `#sort-select` en mobile; con `#sort-select{width:105px}` y texto a 16px, "Más nuevos" y "Más antiguos" no entran y se cortan a "Más nu…"/"Más an…", con la flecha del select encima del texto. Corregido acortando las etiquetas a "Nuevos"/"Viejos" (`admin.html`) — mismo estilo terso que el resto de opciones del select (`A → Z`, `$ Mayor`, `Recientes`). Solo cambia el texto visible; los `value` (`created-new`/`created-old`) y la lógica de orden no cambian. Verificado: ambas etiquetas caben sin recorte en mobile (105px), sin cambios en desktop. CACHE_VERSION v35→v36. (2026-06-12)
- **Inventario — Quick View y Kit Builder no aprovechaban el ancho en desktop** — auditoría UX/UI: en pantallas ≥1280px, `.qv-panel` (460×680px) y el modal de Kit Builder (600×680px) seguían usando el layout de bottom-sheet mobile (una sola columna, imagen arriba/info abajo), dejando ~1000px de espacio horizontal sin usar en un monitor 1440px — por debajo del estándar de modales tipo Shopify Admin (paneles centrados, layout de 2 columnas en desktop). Corregido con `@media(min-width:901px)` en ambos:
  - **Quick View** (`admin.html`/`admin.css`): `.qv-info` y `.qv-actions` se envuelven en un nuevo `<div class="qv-right">` (`display:contents` por defecto — cero cambio visual en mobile/tablet). En desktop, `.qv-panel{flex-direction:row;max-width:880px;height:min(78vh,600px)}`, `.qv-img-zone{flex:0 0 380px}` (imagen a la izquierda, alto completo) y `.qv-right{display:flex;flex-direction:column;flex:1}` (info + acciones a la derecha, acciones siempre visibles sin scroll). `#qv-img-container{display:flex;flex-direction:column}` + `flex:1;min-height:0` en `img`/`.qv-gallery` hacen que tanto la imagen única como la galería con dots llenen los 380×600px sin deformarse (`object-fit:contain` se mantiene).
  - **Kit Builder** (`admin.html`/`admin.css`): nuevo wrapper `.kb-body` (antes `display:flex;flex-direction:column;gap:14px` inline) con `.kb-col-left`/`.kb-col-right` (`display:contents` por defecto). En desktop, `#kit-builder-overlay{align-items:center}` (modal centrado en vez de bottom-sheet), `.kb-modal{max-width:760px;border-radius:20px;max-height:85vh}`, `.kb-body{flex-direction:row;gap:24px}` — columna izquierda (280px: Foto/Nombre/Precio/Categoría) y columna derecha (Componentes: buscador, resultados, lista, stock preview).
  - Verificado en 1440×900 (QV: imagen 380×600 llena el alto tanto en single-image como galería con dots; Kit Builder: 760×519, búsqueda y agregar componente funcionan, hint de precio se actualiza), 768px tablet (ambos sin cambios, columna única, bottom-sheet) y 390×844 mobile (sin cambios, bottom-sheet). Cero errores de consola en los 3 viewports. CACHE_VERSION v36→v37. (2026-06-12)
- **Inventario — descripción del Quick View sin indicador de overflow en productos con texto largo** — auditoría UX/UI: `.qv-desc{max-height:80px}` ya tenía su propio fade + botón "Ver más ↓" (`.qv-desc::after`/`#qv-desc-toggle`), pero ambos viven dentro de `.qv-info{overflow-y:auto}`, cuyo `clientHeight` (239px en mobile) puede ser menor que su `scrollHeight` (335px) cuando hay muchos chips/badges antes de la descripción. Para el producto id=89 (descripción de 1140 caracteres), el fade y el botón "Ver más ↓" quedaban renderizados 45-59px por debajo del borde visible de `.qv-info` — invisibles sin hacer scroll dentro de esa zona, scroll que a su vez no tenía ninguna señal. El usuario veía el texto cortado abruptamente sin fade y sin botón. Corregido agregando un degradado de difuminado en el borde superior de `.qv-actions` (`::before`, `linear-gradient(transparent,#fff)`, 28px) que se solapa visualmente con los últimos px de `.qv-info` — visible siempre que `.qv-info` tenga contenido por debajo del fold (`scrollHeight > clientHeight`) y se oculta (`.qv-fade-hidden`) al llegar al final del scroll. Nueva función `_qvInfoScroll()` (`admin-qv.js`), llamada desde `_renderQV()` (render inicial), `onscroll` de `.qv-info` (`admin.html`) y `_qvToggleDesc()` (al expandir/contraer la descripción). Verificado con producto id=89 en mobile 390×844 (fade visible al abrir, desaparece al hacer scroll al fondo, reaparece tras expandir "Ver más" porque queda aún más contenido por ver), tablet 768px (fade visible, `.qv-info` 253×334) y desktop 1440×900 post-Fix#5 (sin overflow a 433×433, fade correctamente oculto) — y con un producto de descripción corta (sin overflow, fade oculto, botón "Ver más" no se muestra, comportamiento sin cambios). Cero errores de consola en los 4 casos. CACHE_VERSION v37→v38. (2026-06-12)
- **Inventario — QV galería de imágenes no llenaba la columna en desktop (regresión de Fix#5)** — tras el layout de 2 columnas de Fix#5, productos con una sola imagen llenaban correctamente los 380×600px, pero productos con galería (`images[]`) mostraban la primera imagen a 380×260px con un espacio vacío debajo y los dots pegados al fondo de la columna. Causa: la regla `.qv-img-zone img{height:260px}` (especificidad `0,1,1`, clase+elemento) le ganaba a la nueva `.qv-gallery-img{height:100%}` (especificidad `0,1,0`, solo clase) — `.qv-gallery{flex:1;min-height:0}` sí crecía a 584px, pero cada `<img class="qv-gallery-img">` dentro se quedaba fijo en 260px. Corregido subiendo la especificidad a `#qv-img-container .qv-gallery-img{height:100%}` (`1,1,0`, igual que la regla de `.qv-gallery` ya usada en el mismo bloque). Verificado en desktop 1440×900 con producto id=739 (galería de 3 imágenes, ahora 380×584 llenando la columna, dots en su posición) y producto id=715 (imagen única, sigue en 380×600), y mobile/tablet sin cambios (260px). Cero errores de consola. CACHE_VERSION v38→v39. (2026-06-12)
- **Inventario — eliminado "🤖 ¿Son el mismo producto?" del modal Comparar productos** — la usuaria reportó que las respuestas de la IA (Groq, free tier) eran poco confiables y no le servían para decidir cuál de dos productos duplicados conservar. Eliminado por completo (no solo ocultado): botón `#compare-ai-btn`, contenedor `#compare-ai-result` y `.cmp-ai-row` (`admin.html`); función `compareWithAI()` y su helper `_urlToBase64()` (`admin-batch.js` — duplicado del de `admin-form.js`, usado solo por esta función); CSS `.cmp-ai-row`/`#compare-ai-btn`/`#compare-ai-result` (`admin.css`). El modal "⚖️ Comparar productos" conserva su funcionalidad principal: comparación lado a lado, zoom de ambas imágenes, "✓ Quedarme con X / Eliminar el otro". Verificado mobile y desktop, cero errores de consola. CACHE_VERSION v40→v41. (2026-06-12)
- **Inventario — formulario de producto: flujo de subida de fotos unificado en un solo paso** — la usuaria pidió simplificar el formulario, que tenía DOS secciones separadas para imágenes ("imagen principal" con preview + URL, y "Galería de imágenes" abajo con su propio botón de galería/cámara), sin poder subir varias fotos a la vez. Unificado en una sola sección "📸 Fotos del producto (la primera = principal · máx. 6)" con una sola zona de carga (`#img-upload-zone`): 📁 Galería (`#f-img-file`, ahora con `multiple`), 📷 Tomar foto, + URL, drag&drop (desktop) y Ctrl+V — los 5 métodos de carga existentes se conservan intactos, ninguno se quitó. Todas las rutas convergen en `addImagesToForm(files)` → `_addImageFile(file)` (`admin-images.js`), que agrega cada archivo a un array unificado `_allImagesEdit` (índice 0 = principal) hasta el tope de 6. La tira de thumbnails (`renderAdditionalImages()`) ahora muestra también la imagen principal, con badge "⭐ Principal"; `#f-image` pasó a `<input type="hidden">` sincronizado vía `_syncMainFromStrip()`. Nuevo: el botón "✨ Completar con IA" se oculta automáticamente si se quitan todas las imágenes (`hideAiFormBtn()`). Eliminado código muerto: `#f-img-preview`, `#f-img-url-wrap`, `.upload-or`, `previewImg()`, `compressAndPreview()`, `handleAdditionalImageFile()`, `imageUploadController`. Verificado con Playwright en mobile 390×844 y desktop 1440×900: carga múltiple de 2 archivos en una sola selección (`_allImagesEdit.length` pasa de 0→2), +URL, reordenar con `_aiMove`, quitar todas las imágenes (oculta botón IA, restaura placeholder), y modo edición (popula `_allImagesEdit` desde `image`+`images[]` existentes). Cero errores de consola en ambos viewports. CACHE_VERSION v41→v42. (2026-06-12)
- **Caja — auditoría UX/UI completa (9 hallazgos)** — análisis mobile-first (360-430px) referenciando Shopify POS/Square POS/Clip, implementados todos:
  - **Chips de categoría sin indicador de scroll** — `#cat-chip-bar` envuelto en `.cat-chip-bar-wrap` con degradado + `›` al borde derecho (mismo patrón que `.stats-wrap`/`_statsScroll()` de Inventario). Nueva `_catChipScroll()` (`pos-core.js`), llamada desde `renderCategoryChips()`, oculta el `›` (`.at-end`) al llegar al final.
  - **Sin total visible al navegar a la pestaña Catálogo en mobile** — nueva barra `#pos-mini-cart-bar` (sticky, sobre la tab bar) muestra contador + total con CTA "Cobrar →"; tap navega a la pestaña Carrito (`switchPosTab('cart')`). Oculta si el carrito está vacío y en desktop (`@media(min-width:1025px)`). `_updateMiniCartBar()` (`pos-cart.js`), llamada desde `switchPosTab()` y `renderCart()`.
  - **Frecuentes ocultos en mobile** — la regla `@media(max-width:640px)` que ocultaba `.pos-freq-bar.visible` y `#pos-refresh-btn` fue reemplazada: Frecuentes ahora visible en mobile en versión compacta (imagen+precio, 42px, sin nombre).
  - **Botón de refrescar catálogo oculto en mobile** — quitada la regla que lo ocultaba; ahora visible y funcional en todos los viewports.
  - **Botones de Apartados pequeños y sin separación del botón destructivo** — `.apt-btns` (Abonar/Liquidar/Recordatorio WA) y `.btn-cancelar-apt` ahora 42px de alto (mínimo táctil), con `margin-left:6px` separando "Cancelar" del resto para evitar taps accidentales.
  - **Thumbnail de apartados inconsistente con Historial** — `.apt-item-thumb` cambiado de 44px `object-fit:contain` (con padding/fondo crema) a 32px `object-fit:cover` con borde, igual que `.hi-item-thumb`.
  - **Botón "+" del catálogo invisible sin hover en desktop** — el tratamiento "siempre visible, esquina inferior-derecha de la imagen, 36px" que ya existía solo para tablet (`@media(min-width:641px) and (max-width:1024px)`) se extrajo a un nuevo bloque `@media(min-width:641px)`, aplicando también a desktop (`≥1025px`). Se agregó feedback `:hover` (`scale(1.08)` + dorado oscuro) además del feedback `:active` existente.
  - **Nota y Cliente ocupaban dos filas separadas** — agrupados en `.note-cliente-row` (flex-wrap), mismo patrón de botón colapsable para ambos.
  - **Campo de descuento siempre visible aunque no se use** — convertido a patrón colapsable: botón "🏷️ Agregar descuento" (`toggleDiscountField()`) revela el input; botón ✕ (`clearDiscountField()`) lo quita y colapsa; `autoCollapseDiscount()` en `blur` si queda vacío/0. Reseteado en `cobrar()` y en `toggleApartadoMode()`.
  - Sin tocar el split validado de escáner (Html5Qrcode/Quagga2) ni los handlers de swipe (`stopPropagation`). CACHE_VERSION v43→v44. (2026-06-13)
- **Tienda — auditoría UX/UI completa (5 hallazgos)** — análisis mobile-first (360-430px) referenciando ZARA, H&M, Amazon, implementados todos:
  - **Filtros de categoría sin indicador de scroll** — `#products-filters` envuelto en `.products-filters-wrap` con `::after` `›` y fade a `var(--cream)` al borde derecho (mismo patrón que Caja/Inventario). Nueva `_filtersScroll()` (`app.js`), llamada desde `onscroll` de `#products-filters` y al final de `initFilters()`, oculta el `›` (`.at-end`) al llegar al final. `.products-filters-wrap{flex:1;min-width:0}` en estilos base para mantener el layout flex-row con `.sort-select`.
  - **Chip de filtro activo fuera del viewport tras `filterTo()`** — nueva `_scrollActiveFilter()` llama `activeBtn.scrollIntoView({block:'nearest',inline:'center'})` + `_filtersScroll()`. Se llama desde el `click` de cada filtro (en `initFilters()`) y desde `filterTo()` con 320ms de delay (espera a que `render()` + `scrollIntoView('#productos')` terminen). Los links del footer (`filterTo('bolsos')`, etc.) ahora centran el chip activo en la fila horizontal.
  - **Modal: imagen demasiado pequeña en mobile** — `.modal-img{aspect-ratio:1/1}` y `.modal-gallery{aspect-ratio:1/1}` (antes `4/3`). Para productos cuadrados (bolsos, mochilas), la imagen pasa de ~270×270px a ~360×360px en iPhone 12 — 33% más grande. `.modal-body` es `overflow-y:auto;flex:1` así que el CTA siempre queda visible aunque el body tenga menos espacio. Sin cambios en desktop (`.modal{max-width:460px}` → imagen 460×460px, sigue entrando con `max-height:90vh`).
  - **"Última pieza disponible" solo visible en modal, no en tarjeta** — `cardHTML()` calcula `lastPieceChip` cuando `!oos && !apt && isLastPiece(p)` → renderiza `<p class="card-last-piece">⚡ Última pieza</p>` encima del `.product-footer`. CSS `.card-last-piece{font-size:.68rem;font-weight:600;color:#92400E}` (mismo café-ámbar que el modal). Consistente con ZARA "Last items available" en tarjeta.
  - **`notifyRestock()` sin guard anti-doble-tap** — `if (btn.disabled) return` al inicio; `btn.disabled = true` antes de abrir WhatsApp. Evita que un doble tap rápido abra WhatsApp dos veces.
  - CACHE_VERSION v44→v45. (2026-06-17)
- **Reportes — auditoría UX/UI completa (5 hallazgos)** — análisis mobile-first (360-430px) referenciando Shopify Analytics/Square Dashboard, implementados todos:
  - **Botón "Resumen WA" huérfano en 3ª línea** — con `flex-wrap:wrap` en `.stats-nav`, el botón caía solo en la tercera línea flush-left a ~130px. Agregada clase `btn-wa-stats` en `stats.html` + regla `@media(max-width:640px)`: `width:100%;justify-content:center` con `!important` para sobreescribir los inline styles.
  - **"Ventas del día" max-height:400px excesivo en mobile** — en iPhone 390×844 creaba un scroll interno de ~70% del viewport conflictuando con el scroll de página. Override `#today-sales-list{max-height:240px!important}` en `@media(max-width:640px)`.
  - **"Productos más vendidos" a mitad del ancho en desktop** — `.bottom-row{grid-template-columns:1fr 1fr}` con una sola card dejaba 50% de espacio muerto. Cambiado a `grid-template-columns:1fr`.
  - **`.kpi-sub` podía wrappear desalineando las KPI cards** — el texto de delta sin overflow control podía romper a 2 líneas. Agregado `white-space:nowrap;overflow:hidden;text-overflow:ellipsis` a `.kpi-sub`.
  - **Calendar heatmap: `.cal-cell-amt` ilegible en mobile** — `.52rem` (~7px) invisible en celdas de ~47px. Oculto con `.cal-cell-amt{display:none}` en `@media(max-width:640px)` — el color del nivel comunica la información relevante.
  - CACHE_VERSION v45→v46. (2026-06-17)
- **Configuración — auditoría UX/UI completa (5 hallazgos)** — análisis mobile-first (360-430px) referenciando Shopify Admin, implementados todos:
  - **`btn-sm` tap targets ~30px — deben ser ≥44px** — `padding:7px 14px` producía ~30px de alto en los 7+ botones de acción (Gestionar, Editar, Exportar, Importar, Revisar, Guardar, etc.). Cambiado a `padding:11px 14px` en `@media(max-width:640px)`.
  - **Toggle `te-switch` de 24px — debajo del mínimo táctil** — aumentado a `height:28px` (thumb 20×20px, `top:4px;left:4px`, `translateX(16px)` al activar). Aplica en todos los viewports (cambio visual mínimo).
  - **"Respaldo de productos" — 2 botones en `.scard-action` dejaban solo 116px al texto** — agregado `id="scard-backup"` en `settings.html` + en `@media(max-width:640px)`: `flex-wrap:wrap` en la fila, `scard-action{width:100%}` para que los botones bajen a la 2ª línea y se dividan el ancho completo (`flex:1;justify-content:center`).
  - **`drive-secret-input` sin affordance de "tap para copiar"** — `border-style:dashed;color:var(--muted)` distingue el campo de solo lectura de los inputs editables; patrón estándar de Shopify para campos auto-generados.
  - **`btn-row` Drive con 3 botones apretados en mobile** — cuando Drive está configurado, "Guardar" + "Probar conexión" + "Desconectar" en ~280px disponibles. En `@media(max-width:640px)`: `flex-direction:column` + `width:100%;justify-content:center` en cada botón.
  - CACHE_VERSION v46→v47. (2026-06-17)
- **Actividad — auditoría UX/UI completa (5 hallazgos)** — análisis mobile-first (360-430px), implementados todos:
  - **`.chip-group` usaba máscara pasiva en vez de indicador `›`** — reemplazada por el patrón consistente del sistema: wrapper `div.chip-group-wrap#chip-group-wrap` + `::after` con `›` + degradado a `var(--cream)` + función `_chipsScroll()` que alterna `.at-end` en `onscroll` y al iniciar. Elimina la máscara `linear-gradient` anterior. (`activity.html` + `activity.css` + `activity.js`)
  - **Tap targets de selects y chips a ~30px** — `.filter-select` pasa a `padding:11px 28px 11px 12px;font-size:1rem` (≥44px, previene zoom iOS) y `.chip` a `padding:10px 14px;min-height:44px` en `@media(max-width:640px)`.
  - **`filter-select` no llenaba uniformemente la primera fila en mobile** — `flex:1;min-width:0` en `@media(max-width:640px)`: los dos selects se dividen el ancho igualitariamente.
  - **`.chip-group-wrap` sin `width:100%` en su segunda línea** — `width:100%` en `@media(max-width:640px)` garantiza que el wrapper llene la línea y el indicador `›` se posicione en el borde correcto.
  - **`.sum-sub` sin control de overflow** — "➕N ✏️N 🗑N" podía wrappear en cards de ~112px. Agregado `white-space:nowrap;overflow:hidden;text-overflow:ellipsis`.
  - CACHE_VERSION v47→v48. (2026-06-17)

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
- **Cliente (opcional en venta normal)** — botón colapsable "👤 Agregar cliente" (mismo patrón que Nota), junto a `#pos-customer`. En venta normal es opcional; al activar "Es apartado" se expande automáticamente y se vuelve obligatorio. El nombre se guarda en `sales.customer`, aparece como tag en Historial y personaliza el saludo del ticket WA ("¡Gracias por tu compra, {nombre}!")
- **Apartados/anticipos** — checkbox "Es apartado", requiere nombre de cliente + anticipo. Panel "📌 Apartados" muestra pendientes con botón "Completar"
- **Ticket por WhatsApp** — botón en modal post-venta. Al enviarlo el modal se cierra automáticamente (400ms delay) — sin tap extra. Incluye productos, total, método, cambio, nota y aviso de transferencia pendiente si aplica
- **Historial** — últimas 50 ventas en **offcanvas lateral**. Botón en topbar (`#btn-history-pos`, visible ≥641px) + tab bar mobile. Cancelar venta → borra `sales` → restaura stock. Solo superadmin puede cancelar (`CAN_CANCEL_SALE`)
- **Corte de caja** — botón 🧾 Corte (`#btn-corte-pos`, visible ≥641px) + tab bar mobile. Muestra totales del turno (efectivo, transferencia, ventas, apartados) con opción de compartir por WhatsApp. Turno se registra en `localStorage` keys `te_shift_start` / `te_shift_date` al abrir el POS cada día
- **Cierre de caja (reconciliación de efectivo)** — sección "💵 Cierre de caja" dentro de Corte: input "Fondo inicial" (efectivo con el que se abrió el día) → calcula "Efectivo esperado" = fondo + efectivo recibido − gastos del turno. Input "Conteo físico" (efectivo real contado al cerrar) → muestra "Diferencia" (✓ Cuadra / sobrante / faltante, verde-dorado-rojo). Ambos valores en `localStorage` keys `te_fondo_<fecha>` / `te_conteo_<fecha>` (mismo patrón que `te_gastos_<fecha>`), se resetean solos cada día. Incluido en el mensaje de WhatsApp del corte (`compartirCorteWA()`)
- **Apartados con fecha límite** — campo `📅 Fecha límite de pago` en el formulario de apartado (default 30 días). En la lista de apartados muestra el estado con color: rojo=vencido, ámbar=≤7 días, verde=ok
- **Banner apartados vencidos** — franja roja debajo del topbar (`#apt-venc-banner`), clickeable → abre pestaña Apartados. Se muestra/oculta al cargar apartados.
- **Modal post-venta protegido** — `onclick="void 0"` (no cierra al tocar fuera) + Escape bloqueado con `_escGuard`. Se limpia al cerrar con `closeSaleDone()`.
- **Modo Recepción** (`openRecvMode`) — overlay `#recv-overlay` para recibir inventario desde la Caja sin salir al Inventario. CSS en admin.html, JS en admin.js línea ~4164.
- **Productos OOS ocultos en Caja** — `getFilteredProducts()` filtra `outOfStock || stock === 0`. Aplica a lista, grid y búsqueda.
- **Restock desde Caja** — `_showRestockPrompt(id)` + `_confirmRestock()`. Aparece al tocar producto OOS o al superar stock en carrito (350ms delay tras shake). PATCH stock + auto-agrega al carrito.
- **Escáner — código no encontrado no cierra la cámara** (`pos-checkout.js`): al detectar un código sin coincidencia en el catálogo, `_posBarcodeNotFound(code)` muestra el error en `#pos-scan-status` (rojo) + toast, pero deja la cámara activa para escanear el siguiente artículo de inmediato (patrón Square POS/Clip). `_posScanCooldown` evita toasts repetidos del mismo código mientras sigue en cuadro (1.5s). El escáner solo se cierra al encontrar coincidencia.
- **Validación:** efectivo debe cubrir total; doble submit bloqueado con flag `_cobrandoAhora`
- **Mobile:** `pos-right` scrollable, cart-items con `max-height:120px` para que checkout siempre sea visible
- **seller_email** — se guarda en cada venta con el email del usuario autenticado
- **Realtime entre sesiones** — `initRealtime()` (`pos-core.js`) suscribe el canal `pos-products` a cambios de `products` vía Supabase Realtime. `_handleRealtimeProduct()` actualiza `stock`/`out_of_stock`/precio/etc. en el array local y re-renderiza el catálogo visible (`searchProducts()`), evitando sobreventa cuando dos cajeras venden al mismo tiempo desde dispositivos distintos. Mismo patrón que Inventario (`admin.js`).

### Restock rápido desde la Caja

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
- **Valor en venta por categoría (2026-06-12)** — card "💰 Valor en venta por categoría", justo después de "Estado del inventario": agrupa `price × stock` (productos con `price>0 && stock>0`) por categoría raíz, con barra + % del total. `_CAT_ROOT_MERGE = {avon:'natura'}` fusiona Natura y Avon en una sola fila "Natura y Avon" (para Ofelia son la misma mercancía) — incluye productos categorizados directo en la raíz o en cualquiera de sus subcategorías. Card oculta (`display:none`) si no hay productos con precio+stock.
- **"Ventas de hoy" reposicionado (2026-06-12)** — la card de ventas del período activo (título dinámico: "Ventas de hoy" en modo Día, "Ventas — {período}" en Semana/Mes) se movió de cerca del final de la página a justo después del grid de KPIs, por ser una métrica de consulta frecuente. Verificado mobile/tablet/desktop, cero errores de consola. CACHE_VERSION v39→v40.
- **Fix: "Capital invertido por categoría" → "Valor en venta por categoría" (2026-06-12)** — la card original calculaba `cost × stock`, pero `cost` solo estaba lleno en 30/698 productos (de un catálogo donde casi todo el precio de costo está vacío), dando un total de apenas $2,533 — no representativo. La usuaria aclaró que lo que necesita es "cuánto hay en productos... sácalo del precio del producto al consumidor", es decir el valor de la mercancía a precio de venta, no la inversión en costo. Cambiado `renderCapitalCategoria()` a `price × stock` (productos con `price>0 && stock>0` → 630/698), mismo `_CAT_ROOT_MERGE`. Renombrado el título (`stats.html`) y el texto "% del capital invertido" → "% del valor en venta" (`stats.js`), siguiendo la terminología ya existente "Valor en venta" de la card "Estado del inventario" (`price×stock`, distinta de "Capital invertido" = `cost×stock`, que sigue existiendo ahí sin cambios). Nuevo total: $205,114 — Natura y Avon $131,213 (64%), Joyería $22,310 (11%), Bolsos & Mochilas $10,714 (5%), Accesorios $10,398 (5%), Maquillaje $9,906 (5%), Cabello $8,494 (4%), Uñas $7,100 (3%), Regalos $4,979 (2%). Verificado mobile/desktop, cero errores de consola. CACHE_VERSION v42→v43.

---

## Carga Masiva con IA (`admin-batch.js`)

Overlay dentro del Inventario — botón 📸 Masivo en topbar (solo superadmin). Antes era un módulo separado `staging.html`; fue absorbido en el Inventario.

**Flujo:**
1. Subir imágenes (múltiples a la vez, drag & drop o selector de galería/cámara)
2. Opcional: botón 🤖 IA por imagen o "Analizar todas" en masa
3. Revisar/editar nombre, descripción y categoría en cada card
4. "Publicar listas" → crea productos en Supabase con `is_published=false` y `price=0`
5. En el Inventario: ajustar precio y activar "Publicar en sitio web" cuando estén listos

**IA con Groq (Llama 4 Scout Vision):**
- API Key leída de `config.id='groq_key'` en Supabase — compartida con admin
- Modelo: `meta-llama/llama-4-scout-17b-16e-instruct` vía `https://api.groq.com/openai/v1/chat/completions`
- Extrae nombre (<60 chars), descripción (<200 chars) y categoría
- 1.5s de pausa entre llamadas en análisis masivo (free tier: ~30 req/min)
- Free tier de Groq: sin restricción regional, sin tarjeta de crédito, ~1000 req/día

**Por qué Groq y no Gemini:** Gemini free tier tiene `limit: 0` en México (restricción regional). Groq no tiene esta restricción.

---

## Tienda — Sitio Público (`app.js` + `index.html`)

- Anon key — solo SELECT
- Carga: campos específicos (no `select=*`) para evitar exponer `cost`, `barcode`, `position` y reducir payload (~640KB, ~0.44s)
  ```
  GET /products?select=id,name,category,category_label,price,original_price,
      description,image,badge,badge_type,featured,out_of_stock,is_apartado,
      stock,images,kit_items&is_published=eq.true&category=neq.por_revisar
      &or=(out_of_stock.eq.false,is_apartado.eq.true)&order=position.asc
  ```
- **Hero mobile:** strip horizontal de productos destacados con scroll touch
- **Filtros** por categoría, búsqueda, ordenamiento; modal de detalle con carrito y WhatsApp
- **Barra admin:** si hay sesión activa (`te_admin_session` válida en localStorage), aparece barra fija en top con accesos a Inventario / Caja / Reportes. Invisible para clientes.

### Carrito de compra ("Mi pedido")
Sistema de carrito multi-producto que consolida el pedido en **un solo mensaje de WhatsApp** — vive desde 2026-05-17 (commit `c460400`).

- **Estado:** array `cart` en `localStorage` key `te_cart` — `[{id, name, price, qty, image}]`
- **Acceso:** ícono 🛒 en el header (`#nav-cart-btn`) con badge de cantidad (`#nav-cart-badge`); pulso dorado (`.cart-pulse`) cada vez que se agrega un producto
- **UI:** bottom sheet (`#cart-overlay` / `.cart-sheet`) — ítems con thumbnail, controles `[−] N [+]`, botón ✕ para quitar, total y botón "Pedir por WhatsApp"
- **Agregar al carrito:**
  - **Tarjeta del catálogo** — botón "🛒 Agregar" (`addToCartFromCard`): agrega 1 unidad, feedback "✓ Agregado" + pulso del ícono. Es el CTA primario de cada tarjeta (antes era "Pedir" → WhatsApp directo de un solo producto; cambiado para que el pedido se consolide en el carrito)
  - **Modal de producto** — stepper de cantidad + botón "🛒 Agregar al carrito" (`modalAddToCart`)
- **Tope de stock:** `addToCart(id, qty)` retorna `false` y no agrega si `(p.stock - cantidad ya en carrito) <= 0`. En ese caso el botón hace shake rojo (`.btn-at-max`, mismo patrón que en Caja)
- **`cartWhatsApp()`** — arma un solo mensaje con todos los productos, cantidades, subtotales y total, y abre WhatsApp
- **WhatsApp directo (alternativa):** dentro del modal de producto, ícono `waDirectBtn` (desktop) y botón "Pedir directo por WhatsApp" (mobile) permiten consultar/pedir **un solo producto** sin pasar por el carrito — para preguntar disponibilidad antes de decidir. Productos `📌 Apartado` (última pieza ya reservada) usan este flujo ("Consultar") en vez de agregarse al carrito

### Manejo de OOS en tienda (incluyendo kits)
```javascript
function kitStock(p)  // min(floor(comp.stock / comp.qty)) sobre componentes
function isOos(p)     // kits: kitStock===0 | productos: outOfStock || stock===0
```
Los kits siempre tienen `stock=0` en BD — `isOos()` evita marcarlos agotados incorrectamente.

### Catálogo — límite y "Ver más"
- Vista "Todo" sin búsqueda: muestra **12 productos** con botón "Ver X más"
- Al filtrar por categoría o buscar: **sin límite**, todos los resultados
- Al cambiar filtro/búsqueda/orden: resetea a los 12 iniciales

### Sección Natura
- Muestra los **primeros 8 productos** cuya categoría sea `natura` o empiece con `natura_`
- El orden depende de `position` — para controlar cuáles 8 aparecen, usar "📌 Al inicio" en el Inventario
- Desktop: carrusel con dots y auto-advance cada 4.2s. Mobile: grid 2×2 estático

### Ordenamiento en tienda
- Default: **"Nuestra selección"** → `position.asc` (orden manual curado por la tienda)
- Otras opciones: Más recientes, Precio menor, Precio mayor, Nombre A-Z

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
│ ⚡ Última pieza disp.│
├──────────────────────┤
│ $1,349 MXN   [⬡][📤]│  ← Zona 3: CTA (flex-shrink:0, siempre visible)
│      [−]  1  [+]     │     ⬡ = WhatsApp directo (consulta 1 producto)
│ [🛒 Agregar carrito] │     📤 = compartir (Web Share API, si disponible)
│  Pedir directo por WA│     última fila solo en mobile
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

### Mensaje "Última pieza disponible" (2026-06-10)
`isLastPiece(p)` en `app.js` → `p.stock === 1 && !p.isApartado`. Mismo mensaje en los 3 puntos donde el cliente decide:
- **Modal** (Zona 2, debajo de descripción/kit): `<p class="modal-urgency">⚡ Última pieza disponible</p>`
- **WhatsApp directo** (`whatsapp()`): agrega "⚡ Vi que es la última pieza disponible." antes de "¿Está disponible?"
- **Carrito → WhatsApp** (`cartWhatsApp()`): anota cada línea afectada con `(⚡ última pieza)`

**Por qué "Última pieza disponible" y no "Pieza única — no hay otra igual"** (descartado): "no hay otra igual" no es cierto para ningún producto del catálogo real de Ofelia:
- Bolsos/mochilas (1 pieza por modelo, comprados en CDMX, limitado por capital): el modelo podría seguir existiendo en el proveedor — es "no sé si conseguiré otra", no "no existe otra"
- Cabello/donas/peines (normalmente 5-10 por modelo): al llegar a 1 no se sabe si el siguiente lote será el mismo modelo u otro
- Natura/Avon (catálogo de marca, reabasto ~1 semana vía revista): claramente reordenable — "no hay otra igual" sería falso

Lo único cierto en los 3 casos es "ahora mismo, en esta tienda, queda 1" — sin distinción por categoría.

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
- **Categorías del catálogo** — modal para agregar/editar/eliminar
- **Revista Digital Natura** — URL o PDF base64

**Datos:**
- **Respaldo de productos** — Exportar / Importar JSON
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
- `.qv-actions` — botones: 📌 Al inicio, Más campos, Duplicar, Publicar/Ocultar, Eliminar, Revisar

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
| **Service role key expuesta en archivos JS estáticos** | `admin.js`, `admin-*.js`, `pos-core.js`, `stats.js`, `activity.js`, `settings.js` son assets públicos — cualquiera puede descargarlos sin login y obtener la key, que bypasea RLS por completo (lectura/escritura/borrado total). El JWT solo protege la UI, no estos archivos. **Mitigación correcta:** mover INSERT/UPDATE/DELETE a Supabase Edge Functions (valida JWT server-side) — implica agregar un "backend" serverless. **Alternativa:** políticas RLS basadas en el JWT del usuario en vez de service role key, replicando la matriz de roles de este documento. Ambas son cambios grandes y de alto impacto — abordar en sesión dedicada, con proyecto Supabase de prueba antes de tocar producción. |

---

## Notas de Desarrollo

- **Sin build step** — editar y abrir directamente en browser
- **PostgREST filtros:** `?id=eq.1` `?id=in.(1,2,3)` `?is_published=eq.true` `?order=position.asc`
- **Batch upsert:** body array JSON + header `Prefer: resolution=merge-duplicates`
- **PostgREST batch PATCH:** usar lotes de máx 10 IDs en `?id=in.(...)` — listas más largas pueden retornar 204 sin aplicar cambios
- **Librerías CDN:** @ericblade/quagga2 (escáner, carga dinámica desde unpkg sin pin de versión), Chart.js@4 (stats)
- **IA:** Groq Llama 4 Scout Vision — key en `config` Supabase (`groq_key`), compartida entre admin (`admin-images.js`) y carga masiva (`admin-batch.js`)
- **Google Drive:** Apps Script como proxy. Secreto en `config` Supabase (`drive_secret`), nunca en código fuente. Al cambiar el secreto → siempre desplegar nueva versión del Apps Script.
- `position` lo gestiona el admin — sitio público y POS ordenan por él
- **PWA:** `manifest.json` + `sw.js` + íconos `icono-192.png` / `icono-512.png`. En iOS Safari no hay prompt automático de instalación — el usuario debe ir a Compartir → Agregar a pantalla de inicio.
- **⚠️ `sw.js` cachea TODOS los archivos propios (stale-while-revalidate), no solo `STATIC`** — cualquier `.js`/`.html`/`.css` del proyecto (incluye `admin-scanner.js`, `pos-checkout.js`, etc.) se sirve desde caché en cada carga aunque ya exista una versión nueva en el servidor; la red solo actualiza el caché para la *siguiente* carga. Por eso, tras un `git push` con cambios de JS/HTML/CSS, **subir `CACHE_VERSION` en `sw.js`** (ej. `v24` → `v25`) — esto borra el caché viejo en `activate`. Aun así, por el ciclo de vida de Service Workers (`skipWaiting`+`clients.claim` activa el nuevo SW pero no reemplaza assets ya cargados en la pestaña actual), el usuario puede necesitar **recargar dos veces** (o cerrar y reabrir la pestaña/PWA) para ver el cambio reflejado. Sin este bump, los cambios de código pueden tardar varias cargas en aparecer — causa de confusión real durante pruebas en dispositivo (2026-06-11: 4 commits de fixes de escáner sin bump de `CACHE_VERSION`).
- **Documentación de usuario:** `MANUAL.md` en la raíz — guía para Ofelia, Areli y Eduardo, sin tecnicismos
- **Galería de imágenes:** CSS en `style.css` (modal tienda) y en `admin.html` `<style>` inline (QV). Clases: `.modal-gallery`, `.mgd` (tienda) / `.qv-gallery`, `.qv-gd` (admin)
- **Gestos táctiles:** nunca usar `stopPropagation` en handlers de swipe — rompe la detección de dirección. Siempre `{ passive: true }` salvo que se necesite `preventDefault` (en ese caso documentarlo)
- **Drag & drop en mobile:** la API HTML5 de drag & drop no funciona en iOS Safari. Usar "📌 Al inicio" como alternativa para reordenar desde móvil.
- **Escáner de código de barras — split por dispositivo (validado):** `admin-scanner.js`/`pos-checkout.js` detectan `isIOS` inline en `_launchScanner`/`openPosScanner` — iOS usa Quagga2 (`locate:true`, sin `area`), Android/desktop usa Html5Qrcode (`useBarCodeDetectorIfSupported:true`, `qrbox:{width:260,height:100}`, su propio marco de esquinas dorado). El experimento "Quagga2 universal" del 2026-06-11 (entradas 489, 498, 500-504 del historial de Inventario) fue probado y revertido — no reintentarlo sin poder probar en el dispositivo real de la usuaria.
- **Borrador:** un producto es borrador si `!p.kitItems?.length && !p.isPublished && (!p.price || p.price === 0)`. Los kits nunca son borradores aunque no tengan precio.
- **XSS — helper `_esc()`:** `const _esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')`. Cualquier string de BD/usuario (nombre de producto, cliente, nota, descripción, barcode, email) que se inserte vía `innerHTML` debe pasar por `_esc()`. Ya aplicado en todos los módulos (sweep completo 2026-06-08/09). Definido en `admin.js` (admin-*.js), `pos-core.js` (pos-*.js), `app.js`, `stats.js`; `activity.js` y `settings.js` (como `escH`) tienen su propia copia local por ser módulos aislados.
- **Patrón onclick con string dinámico:** para insertar un string en `onclick="fn('...')"`, usar `_esc(x).replace(/'/g,"\\'")` — primero escapa HTML (protege el atributo `"..."` de `<`,`>`,`&`,`"`), luego escapa comillas simples para el literal JS (el navegador decodifica entidades antes de parsear JS, así que la función receptora recibe el string original sin escapar).
