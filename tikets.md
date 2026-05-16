# Tickets — Tres Encantos

---

## T-01 · Barra de acceso rápido para administrador en el sitio web
**Módulo:** `index.html` + `app.js`
**Prioridad:** Media

### Descripción
Cuando Ofelia (u otro admin) está autenticada y visita el sitio público, mostrar una barra fija discreta con acceso directo a Admin, POS y Estadísticas. Si el visitante no está autenticado, la barra no debe aparecer bajo ninguna circunstancia.

### Criterios de aceptación
- [ ] Detectar sesión activa en `localStorage` key `te_admin_session` al cargar el sitio
- [ ] Si sesión válida: mostrar barra fija (top o bottom) con botones → Admin / POS / Stats
- [ ] Si no hay sesión: no renderizar nada (invisible para clientes)
- [ ] La barra no debe interferir con el layout ni los CTAs del sitio

---

## T-02 · Limitar productos mostrados por defecto en el catálogo
**Módulo:** `app.js` · función `render()`
**Prioridad:** Alta

### Descripción
Actualmente se muestran todos los productos al cargar el catálogo, lo que obliga a hacer scroll excesivo antes de llegar a la sección Natura y las siguientes. Evaluar la mejor estrategia: mostrar X productos por defecto con botón "Ver más", o priorizar por relevancia/destacados/recientes.

### Criterios de aceptación
- [ ] Definir número inicial de productos visibles (sugerido: 8-12)
- [ ] Agregar botón "Ver más productos" que carga el resto
- [ ] El filtro por categoría muestra todos los productos de esa categoría (sin límite)
- [ ] La búsqueda no tiene límite de resultados
- [ ] Evaluar si "Relevancia" como orden por defecto prioriza destacados y recientes

---

## T-03 · Fallback de categoría en website cuando no hay subcategoría asignada
**Módulo:** `app.js`
**Prioridad:** Media

### Descripción
Si un producto tiene asignada una categoría raíz (ej: `bolsos`) en lugar de una subcategoría (ej: `bolsos_dama`), el sitio web actualmente lo muestra como categoría correctamente. Confirmar y garantizar que el filtro por categoría raíz siempre incluya productos asignados directamente a esa raíz, sin requerir subcategoría obligatoria.

### Criterios de aceptación
- [ ] Producto con `category = 'bolsos'` aparece al filtrar por Bolsos ✓ (ya funciona con `startsWith`)
- [ ] El `category_label` muestra la etiqueta correcta aunque sea categoría raíz
- [ ] La IA en staging y admin asigna subcategoría cuando puede, raíz cuando no encuentra coincidencia exacta

---

## T-04 · Imágenes del hero strip ligeramente cortadas en mobile
**Módulo:** `style.css` · clases `.hms-card`, `.hms-card img`
**Prioridad:** Baja

### Descripción
En mobile, las imágenes del strip "✦ Más Buscados" en el hero se cortan ligeramente en los bordes. Ajuste fino de `object-fit`, `aspect-ratio` o `border-radius` para que las imágenes se vean completas o con un recorte más intencionado.

### Criterios de aceptación
- [ ] Imágenes no se ven cortadas de manera accidental en iPhone ni Android
- [ ] El recorte, si existe, es simétrico y se ve intencional
- [ ] No afecta el tamaño ni posición de las cards

---

## T-05 · Revisar y optimizar configuración de Web App (PWA)
**Módulo:** `sw.js` · `manifest.json` (si existe)
**Prioridad:** Media

### Descripción
Revisar el estado actual del Service Worker y el manifest de la PWA. Verificar que la app se pueda instalar correctamente en Android e iOS, que el ícono y nombre sean correctos, y que el caché offline funcione para los assets principales.

### Criterios de aceptación
- [ ] `manifest.json` con nombre, colores y íconos correctos de Tres Encantos
- [ ] Service Worker activo y sin errores en consola
- [ ] La app se puede instalar desde Chrome (Android) y Safari (iOS)
- [ ] Assets principales cacheados para carga rápida en revisitas

---

## T-06 · Mejorar respuestas y presentación de la IA
**Módulo:** `admin.js` · `staging.html`
**Prioridad:** Media

### Descripción
Mejorar el prompt enviado a Groq para que los nombres y descripciones generados sean más atractivos, comerciales y con el tono de voz de Tres Encantos. Evaluar si el modelo actual (`llama-4-scout`) da mejores resultados con un prompt más específico del contexto de boutique mexicana.

### Criterios de aceptación
- [ ] El nombre generado es corto, atractivo y sin códigos de inventario
- [ ] La descripción tiene tono emocional y comercial (no técnico)
- [ ] La categoría se asigna correctamente usando las 5 nuevas raíces
- [ ] Evaluar ajuste de `temperature` para resultados más creativos

---

## T-07 · Evaluar integración con Nanobabana para edición de imagen
**Módulo:** `admin.js` · flujo de subida de imagen
**Prioridad:** Baja · Investigación

### Descripción
Investigar si Nanobabana ofrece API o SDK para edición de imágenes de productos (recorte, fondo blanco, ajuste de brillo/contraste) que pueda integrarse en el flujo de subida de imágenes del admin, antes o después del paso a Google Drive.

### Criterios de aceptación
- [ ] Documentar qué ofrece Nanobabana y si tiene API pública
- [ ] Evaluar costo y viabilidad técnica para una integración simple
- [ ] Si es factible: proponer dónde en el flujo insertar la edición (antes de Drive, antes de guardar en Supabase)
- [ ] Si no es factible: documentar alternativas (remove.bg, Cloudinary, etc.)

---

*Última actualización: 2026-05-15*
