# Tickets — Tres Encantos

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

_Última actualización: 2026-05-15_

Iconografia
Analiza la iconografia actual y evalua si la iconografia actual esta bien o se debe implementar otra.
