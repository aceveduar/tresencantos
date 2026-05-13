# CLAUDE.md — Tres Encantos Admin Panel

Documentación técnica del proyecto para asistencia con IA. Última actualización: 2026-05-12.

---

## Descripción del Proyecto

Panel de administración + sitio e-commerce/catálogo para **Tres Encantos**, una boutique mexicana que vende bolsos, accesorios, maquillaje y productos Natura. La dueña es **Ofelia**, consultora Diamond de Natura.

El sitio no tiene checkout ni carrito — los pedidos se cierran por **WhatsApp**. El admin permite gestionar el catálogo que se muestra en el sitio público.

---

## Stack y Arquitectura

- **Frontend:** HTML + CSS + Vanilla JS (sin framework, sin bundler)
- **Base de datos / Backend:** Supabase (PostgreSQL via REST API)
- **Autenticación:** Custom — tabla `users` con email/password plano (no usa Supabase Auth)
- **Hosting:** Archivos estáticos (sin servidor propio)
- **Fuentes:** Google Fonts — Inter + Playfair Display

**No hay `package.json`, no hay build step, no hay node_modules.** Todo corre directo en el browser.

---

## Estructura de Archivos

```
tresencantos/
├── index.html          # Sitio público (catálogo + hero + Natura + about + WhatsApp)
├── admin.html          # Panel de administración (auth + CRUD productos + revista)
├── admin.js            # Toda la lógica del admin (~950 líneas)
├── app.js              # Lógica del sitio público (carga productos, filtros, modal, WhatsApp)
├── style.css           # Estilos del sitio público
├── sync-supabase.html  # Utilidad standalone para seed inicial de productos
├── logo.png            # Logo de Tres Encantos
├── ofelia.jpeg         # Foto de la dueña (sección Natura)
└── bugs.txt            # Log de bugs conocidos (histórico)
```

---

## Supabase

### Credenciales
Las credenciales se guardan en `localStorage` del browser (keys: `te_supabase_url`, `te_supabase_anon_key`).  
Las credenciales de producción están en Supabase dashboard del proyecto — **no hardcodear en código**.

- **Project URL:** `https://qxvrggmpaqhslgdmbhqw.supabase.co`
- **Anon Key:** ver localStorage o Supabase Settings → API
- **Service Role Key:** solo usar para operaciones que requieran bypass de RLS (seed, reset masivo)
- **Admin app user:** `admin@tresencantos.com` / password en tabla `users`

### Tablas

#### `products`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | int8, PK | ID numérico manual (no serial) |
| `name` | text | Nombre del producto |
| `category` | text | Código: `bolsos`, `accesorios`, `maquillaje`, `natura` |
| `category_label` | text | Etiqueta visible: "Bolsos & Mochilas", etc. |
| `price` | numeric | Precio actual en MXN |
| `original_price` | numeric, nullable | Precio tachado (si está en oferta) |
| `description` | text | Descripción larga |
| `image` | text | URL o base64 JPEG (max ~900px, comprimido al subir) |
| `badge` | text, nullable | Texto de insignia: "Más vendido", "Nuevo", etc. |
| `badge_type` | text, nullable | Enum visual: `best`, `new`, `promo`, `natura` |
| `featured` | bool | Mostrar en sección destacada |
| `out_of_stock` | bool | Agotado — oculta botón WhatsApp en el sitio |
| `position` | int4 | Orden en la tabla (drag & drop actualiza esto) |

#### `users`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | int8, PK | |
| `email` | text | Email del admin |
| `password` | text | **Plano, sin hash** (deuda de seguridad conocida) |

#### `config`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | text, PK | Key de configuración |
| `value` | text | Valor (puede ser URL o base64 de PDF) |

Registro relevante: `id = 'revista_url'` → URL o base64 del PDF de la revista Natura.

### RLS (Row Level Security)
Si RLS está activado en `products`, el anon key necesita policies para `SELECT`, `INSERT`, `UPDATE`, `DELETE`. Sin ellas las operaciones del admin fallan con 403.

```sql
-- Solución rápida: permitir todo al anon (solo si el admin es la única app)
CREATE POLICY "admin_all" ON products FOR ALL USING (true) WITH CHECK (true);

-- Mejor práctica: usar service role key en el admin
```

---

## Arquitectura del Admin (`admin.js`)

### Patrón de datos
- Array global `products = []` como única fuente de verdad en el cliente
- Cargado desde Supabase al iniciar (`loadProductsFromSupabase`)
- Cada operación actualiza Supabase **primero**, luego actualiza el array local si tiene éxito (no Optimistic UI, excepto drag & drop)

### `supabaseApi(path, opts)` — helper central
Wrapper de `fetch` que añade headers `apikey` y `Authorization`. Lee URL y key desde localStorage en cada llamada (lazy — soporta reconfiguración sin reload).

### Flujo de operaciones CRUD

| Operación | Endpoint Supabase | Notas |
|---|---|---|
| Cargar productos | `GET /products?select=*&order=position.asc` | Al iniciar app |
| Crear producto | `POST /products` con `Prefer: resolution=merge-duplicates` | ID manual = max(ids) + 1 |
| Editar producto | `PATCH /products?id=eq.{id}` | Solo los campos cambiados |
| Eliminar 1 | `DELETE /products?id=eq.{id}` | Primero DB, luego array local |
| Eliminar N (bulk) | `DELETE /products?id=in.(1,2,3)` | Filtro `in` de PostgREST |
| Toggle featured | `PATCH /products?id=eq.{id}` `{featured: bool}` | 1 campo, 1 request |
| Toggle out_of_stock | `PATCH /products?id=eq.{id}` `{out_of_stock: bool}` | 1 campo, 1 request |
| Reordenar (drag) | `POST /products` batch con `resolution=merge-duplicates` | Actualiza campo `position` de todos |
| Bulk PATCH | `PATCH /products?id=in.(ids)` | Categoría, featured, oos, badge |
| Importar JSON | `DELETE /products?id=gt.0` + `POST /products` batch | Limpia tabla y reinserla — con rollback si falla |

### Selección múltiple
- Estado: `selectedIds = new Set()` (IDs numéricos)
- `toggleRowSelect(id, checked)` — toggle individual
- `toggleSelectAll()` — selecciona/deselecciona los filtrados visibles
- `updateBulkBar()` — muestra/oculta la barra de acciones masivas
- Las acciones bulk leen `selectedIds` directamente

### Imágenes
- Subida local: canvas resize a max 900px → `toDataURL('image/jpeg', 0.82)` → base64
- Almacenado en el campo `image` de Supabase (base64 o URL externa)
- No se usa Supabase Storage

---

## Sitio Público (`app.js` + `index.html`)

- Carga productos desde `GET /products?select=*&order=position.asc`
- Fallback a array `DEFAULT_PRODUCTS` si Supabase no responde
- Filtros por categoría (`bolsos`, `accesorios`, `maquillaje`, `natura`)
- Modal de detalle de producto
- Botón WhatsApp con mensaje pre-armado (número hardcodeado en `app.js`)
- Hero visual con productos IDs 1, 3, 4 fijos — si se borran, el hero queda vacío
- Sección Natura: primeros 4 productos con `category = 'natura'`

---

## Funcionalidades del Admin

### Autenticación
- Login con email + password contra tabla `users`
- Sesión en `localStorage` key `te_admin_session = "1"`
- Sin expiración (hasta `doLogout()`)

### Gestión de productos
- CRUD completo con modal de formulario
- Drag & drop para reordenar (actualiza campo `position`)
- Toggle featured / agotado inline
- Duplicar producto
- Búsqueda + filtro por categoría en tiempo real

### Acciones masivas (Bulk)
Aparece la barra inferior cuando hay ≥1 producto seleccionado:
- Cambiar categoría (prompt con opciones)
- Toggle destacado (smart: si todos=true→false, si no→true)
- Toggle agotado (misma lógica)
- Cambiar insignia + tipo (prompt)
- Exportar selección a JSON
- Eliminar selección

### Import / Export
- **Exportar JSON:** descarga todos los productos como archivo JSON (camelCase, formato del array local `products`)
- **Importar JSON:** reemplaza catálogo completo — llama `clearSupabaseProducts()` + `save()` en secuencia, con rollback del estado local si Supabase falla

### Revista Digital Natura
- Sube URL externa o PDF como base64
- Se guarda en tabla `config` con `id = 'revista_url'`
- Se muestra en `index.html` como enlace

---

## Variables CSS (colores del sistema de diseño)

```css
--cream: #FAF5EE      /* fondo principal */
--gold: #C9A462       /* acento dorado (botones primarios, borders activos) */
--gold-dark: #A67C3A  /* hover del gold */
--charcoal: #1C1817   /* texto principal, fondo topbar */
--wa: #25D366         /* verde WhatsApp */
--red: #E85D5D        /* peligro, errores, eliminar */
--green: #2D6A4F      /* natura, disponible */
--border: #E8DDD0     /* bordes sutiles */
```

---

## Deudas Técnicas Conocidas

| Problema | Impacto | Solución sugerida |
|---|---|---|
| Passwords en texto plano en tabla `users` | Seguridad crítica | Migrar a Supabase Auth o bcrypt |
| Sin Realtime — cambios no se propagan entre sesiones | UX | Añadir Supabase JS client + `channel().on('postgres_changes')` |
| Hero fijo en IDs 1, 3, 4 | Si se borran esos productos, el hero queda roto | Usar productos `featured = true` dinámicamente |
| `clearSupabaseProducts` usa `id=gt.0` | Si hay IDs negativos no borra | Cambiar a `id=not.is.null` |
| Sin paginación en la tabla admin | Con 500+ productos será lento | Añadir limit/offset o virtualización |
| Imágenes base64 en DB | Filas muy pesadas, lento para cargar | Migrar a Supabase Storage |

---

## Flujo de Sesión (admin)

```
GET admin.html
  ↓
localStorage tiene SESSION_KEY="1" + URL + key?
  ├─ Sí → showApp() → loadProductsFromSupabase() → renderStats() + renderTable()
  └─ No → showAuthScreen()
            ↓
         doLoginEmail() → query tabla users → match password
            ↓
         localStorage.set(SESSION_KEY, "1") → showApp()
```

---

## Notas para Desarrollo Futuro

- **No hay build step** — editar archivos directamente y abrir en browser
- **Para testear cambios en admin:** abrir `admin.html` directamente (file:// o servidor local)
- **Para testear el sitio público:** `index.html`
- **Para seed inicial de datos:** abrir `sync-supabase.html` e ingresar credenciales
- **PostgREST (Supabase REST):** los filtros son query params (`?id=eq.1`, `?category=eq.bolsos`, `?id=in.(1,2,3)`)
- **Batch upsert:** enviar array JSON en el body con `Prefer: resolution=merge-duplicates`
- El campo `position` lo gestiona el admin automáticamente — el sitio público ordena por él
