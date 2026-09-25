


🔴 Bugs reales que confirmé (afectan uso diario)



Inventario — Importar JSON puede publicar productos nuevos sin las reglas normales. admin-bulk.js:457-552 no manda is_published para productos nuevos del archivo — toma el default (true), saltándose la regla de "nunca publicar sin revisar".

Configuración — el campo de contraseña al crear un usuario se ve en texto plano. settings.html:64 usa type="text" en vez de type="password". Arreglo de una línea.

Tienda — self-XSS en el buscador. Si una clienta teclea algo tipo <img src=x onerror=...> y no hay resultados, ese texto se inserta sin escapar en el mensaje "No encontramos..." (app.js:517). Solo se ejecuta en su propio navegador (no es explotable contra otra persona), pero rompe el estándar de escape que ya aplica en el resto del proyecto.

Reportes — sin timeout en las llamadas de red (stats.js:47), mismo bug que ya se encontró y arregló en Caja el 2026-09-04 (ahí causaba que "Guardar" se quedara colgado para siempre sin error). Aquí, cambiar de período con una conexión inestable puede dejar los KPIs en "…" para siempre.

🟡 Para revisar tú mismo (no puedo verificarlo desde aquí)
Posible hueco de permisos real: varias escrituras a config (drive_secret, groq_key, categorías) y el borrado de Actividad (clearActivityLog()) van directo a la tabla sin pasar por una RPC que valide el permiso en el servidor — solo se oculta el botón en la pantalla. Ya existe un caso idéntico que sí se corrigió (permisos de usuario, vía te_save_user_permissions), pero estos otros puntos no. No puedo confirmar si las políticas RLS de Supabase ya tapan esto por otro lado — valdría la pena que lo revisaras directo en el SQL Editor.
🟢 Código muerto verificado con grep (bajo riesgo quitar)
Caja: .ci-remove, .history-oc-btn, .topbar-sep-user/.user-display, .pos-prod-stock, .apartado-field-row (pos.css) — todas sin ningún caller.
Inventario: ~20 clases CSS de diseños viejos de tarjeta/sheet de categorías/flag (.mpc-bar, .cat-sheet-item, .qv-flag-form, etc.)
Tienda: .soc-link.ig/.dark, .btn-ghost-white, initAutoScroll() (stub vacío que se sigue llamando), rama case 'popular' inalcanzable en el ordenamiento (sin opción en el selector, pero sigue trayendo datos de ventas en cada carga).
Reportes: .user-name-label, .dv-total-of, llave all en PERIOD_LABELS.
Compartido: _pollNewSalesLegacy() en shared.js — usa columnas del esquema pre-Caja-v2 que ya no existen.
🔵 Bajo valor / redundante
Reportes: dos tarjetas distintas ("Ventas del día" y "Productos más vendidos") calculan "el más vendido" con criterios diferentes (una por ingreso, otra por cantidad) — pueden nombrar productos distintos en la misma pantalla. La tarjeta "Google Analytics" es un atajo personal tuyo, nadie más la usa.
Inventario: "Asignar etiqueta" masiva sigue usando prompt() nativo del navegador, el único control bulk que no se migró al bottom sheet como el resto.
Tienda: el carrusel de Natura usa nombres de categoría hardcodeados en vez del campo real — si renombras una subcategoría desde Configuración, el carrusel se queda con el nombre viejo.
¿Por dónde quieres que empiece? Yo priorizaría el punto 1 (Caja, es el más usado a diario) y el 2 (pérdida de datos al deshacer en Inventario).