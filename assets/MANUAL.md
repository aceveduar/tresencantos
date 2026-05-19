# Manual de Usuario — Tres Encantos

Guía de uso del sistema de administración: Inventario, Caja, Reportes y Staging.

---

## Usuarios y permisos

| Acción | Eduardo | Dolores | Areli | Ofelia |
|---|:---:|:---:|:---:|:---:|
| Ver productos | ✓ | ✓ | ✓ | ✓ |
| Editar producto / precio | ✓ | ✓ | ✓ | ✗ |
| Agregar producto | ✓ | ✓ | ✓ | ✗ |
| Publicar en sitio web | ✓ | ✓ | ✗ | ✗ |
| Eliminar producto | ✓ | ✓ | ✗ | ✗ |
| Importar / Exportar JSON | ✓ | ✓ | ✗ | ✗ |
| Registrar venta (Caja) | ✓ | ✓ | ✓ | ✗ |
| Cancelar venta | ✓ | ✓ | ✗ | ✗ |
| Subir productos (Staging) | ✓ | ✓ | ✓ | ✗ |
| Ver Reportes | ✓ | ✓ | ✓ | ✓ |

> **Nota para Areli:** cuando agregas un producto queda en "Oculto" automáticamente. Eduardo o Dolores deben revisarlo y publicarlo en el sitio web.

---

## Módulos

El sistema tiene 4 módulos accesibles desde el menú superior:

| Módulo | Archivo | Descripción |
|---|---|---|
| **Inventario** | `admin.html` | Catálogo de productos, precios y stock |
| **Caja** | `pos.html` | Registrar ventas y apartados |
| **Reportes** | `stats.html` | Estadísticas e ingresos |
| **Staging** | `staging.html` | Subir productos nuevos en lote |

---

## Inventario

El Inventario es el módulo principal. Desde aquí se administran todos los productos.

### Acceder
Abrir `admin.html` e iniciar sesión con tu correo y contraseña.

### Ver productos
- La tabla muestra todos los productos con nombre, categoría, precio y stock.
- Usa la **barra de búsqueda** para filtrar por nombre.
- Usa el **selector de categoría** para filtrar por tipo de producto.
- Cambia entre vista **lista** (☰) y **tarjetas** (⊞) con el botón en la barra superior.

### Editar un producto
1. Haz doble clic (o doble tap en móvil) sobre cualquier fila del producto.
2. Se abre el formulario de edición.
3. Modifica los campos necesarios.
4. Pulsa **Guardar**.

### Agregar un producto
1. Pulsa el botón **+ Agregar** en la barra superior.
2. Llena el formulario: nombre, categoría, precio y una imagen.
3. Pulsa **Guardar**.
4. El producto queda en **"Oculto"** — no aparece en el sitio web hasta que un administrador lo publique.

### Cambiar stock
Toca el número de stock en cualquier fila — se convierte en un campo editable. Escribe la cantidad y confirma con ✓.

- Stock **0** = producto agotado (se oculta del sitio web automáticamente).
- Stock **1** = "Última pieza" (se muestra en el sitio con aviso de urgencia).
- Al marcar un producto como disponible con stock 0 → el sistema lo sube a 1 automáticamente.

### Publicar / ocultar del sitio web
El badge **🌐 Web** / **🙈 Oculto** en cada producto es un botón. Tócalo para alternar.

> Solo Eduardo y Dolores pueden hacer esto. Areli verá un mensaje de error si lo intenta.

### Precio de costo y margen
Si se llena el campo **Precio de costo** en el formulario, el sistema calcula el margen automáticamente:
- Verde = margen ≥ 30%
- Ámbar = margen ≥ 10%
- Rojo = margen < 10%

Este dato es interno — no se muestra en el sitio web ni en el ticket de venta.

### Duplicar un producto
En las acciones de cada fila hay un botón de duplicar. Crea una copia con los mismos datos. Útil para productos similares con variantes de precio o color.

> **Areli:** tendrás 7 segundos para deshacer la duplicación con el botón "Deshacer" que aparece. Es la única forma de borrar ese producto duplicado.

---

## Caja

La Caja es el punto de venta. Se usa para registrar cada venta o apartado.

### Registrar una venta
1. Busca los productos por nombre o escanea el código de barras.
2. Toca el producto para agregarlo al carrito (panel derecho).
3. Ajusta la cantidad con los botones + / − en el carrito.
4. Si aplica, ingresa un **descuento** (en % o en $).
5. Selecciona el método de pago: 💵 Efectivo o 📱 Transferencia.
6. Si es efectivo, ingresa el monto recibido — el sistema calcula el cambio.
7. Pulsa **Cobrar**.
8. Aparece el modal de confirmación con opción de enviar **ticket por WhatsApp**.

### Registrar un apartado
1. Agrega productos al carrito normalmente.
2. Activa la casilla **"Es apartado"**.
3. Ingresa el **nombre del cliente** (obligatorio).
4. Ingresa el **anticipo** recibido.
5. Selecciona una **fecha límite de pago** (por defecto 30 días).
6. Pulsa **Cobrar**.

Para ver los apartados pendientes, pulsa el botón **📌 Apartados** en la barra superior. Desde ahí puedes completar el pago cuando el cliente regrese.

### Corte de caja
Pulsa el botón **🧾 Corte** en la barra superior para ver el resumen del turno:
- Total en efectivo
- Total en transferencias
- Número de ventas y apartados

Puedes compartir el corte por WhatsApp.

### Historial de ventas
El botón **Historial** en la barra superior abre un panel con las últimas 50 ventas.

> **Cancelar una venta:** solo Eduardo y Dolores pueden hacerlo. Al cancelar, el stock de los productos se restaura automáticamente.

---

## Reportes

Los Reportes muestran estadísticas de ventas. Solo lectura — nadie puede modificar nada desde aquí.

### Períodos disponibles
- **Hoy**
- **7 días**
- **30 días**
- **Todo el tiempo**

### Qué incluye
- **KPIs principales:** ingresos totales, número de ventas, ticket promedio — con comparación vs el período anterior.
- **Gráfica de ingresos** por día.
- **Ventas por categoría** (donut).
- **Hora pico** — a qué hora se vende más.
- **Top productos** por ingresos.
- **Apartados pendientes** — siempre visible sin importar el período.
- **Por vendedor** — aparece cuando hay más de un vendedor en el período.
- **Rentabilidad** — productos con margen alto, medio o bajo (requiere que tengan precio de costo).

---

## Staging

El Staging es la zona de preparación para subir productos nuevos en lote, especialmente útil cuando llega mercancía nueva.

### Flujo completo
1. Pulsa **Staging** en el menú del Inventario.
2. Arrastra o selecciona **varias imágenes** a la vez.
3. Opcional: pulsa **🤖 IA** en cada producto o **"Analizar todas"** para que la inteligencia artificial rellene nombre, descripción y categoría automáticamente.
4. Revisa y ajusta los datos de cada producto.
5. Pulsa **"Publicar listas"** para crear los productos en el Inventario.
6. Los productos se crean con precio **$0** y estado **Oculto**.
7. Ve al Inventario para agregar el precio correcto a cada uno y publicarlos en el sitio web.

> La IA usa las imágenes para sugerir nombre y categoría. Siempre revisa antes de publicar — puede equivocarse.

---

## Sitio web (Tienda)

El sitio público `index.html` muestra el catálogo a los clientes. No requiere login.

Los clientes pueden:
- Explorar productos por categoría.
- Buscar por nombre.
- Ver detalle de cada producto.
- Pedir por WhatsApp (no hay checkout — el pedido se cierra por mensaje).

**Un producto aparece en la tienda solo si:**
- Tiene `is_published = true` (está publicado).
- Tiene `out_of_stock = false` (no está agotado).

Si un administrador está conectado, verá una barra fija en la parte superior con accesos rápidos a Inventario, Caja y Reportes.

---

## Preguntas frecuentes

**¿Por qué no aparece un producto en el sitio web?**
Dos razones posibles: está en estado "Oculto" (`🙈 Oculto` en el Inventario) o su stock llegó a 0 y se marcó como agotado. Revisa ambas cosas en el Inventario.

**¿Puedo editar el precio de un producto agotado?**
Sí. El estado de stock no bloquea la edición. Entra al formulario con doble clic y edita normalmente.

**Se cerró la sesión ¿qué hago?**
Vuelve a abrir el archivo (o recarga la página) e inicia sesión de nuevo con tu correo y contraseña.

**Areli agregó un producto pero no aparece en el sitio ¿es normal?**
Sí. Los productos creados por Areli quedan en "Oculto" automáticamente para que Eduardo o Dolores los revisen antes de publicarlos.

**¿Cómo sé si una transferencia fue recibida?**
El sistema no confirma transferencias automáticamente. El flujo es: cobrar → verificar en tu app bancaria → entregar el producto. El ticket de WhatsApp incluye un aviso al cliente de que la transferencia está pendiente de confirmar.

**¿Qué pasa si cancelo una venta?**
El registro se elimina de Reportes y el stock de los productos se devuelve. Solo superadmins pueden cancelar ventas.

---

## Contacto técnico

Para problemas con el sistema: **Eduardo** — eacevedo@sunname.com.mx
