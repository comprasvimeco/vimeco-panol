# VIMECO Pañol

Stock y movimientos del pañol de cada obra de VIMECO S.A. PWA estática (HTML/CSS/JS), publicada en GitHub Pages.

- **Ingreso / Salida / Ajuste / Pasar a otra obra**, con anulación que devuelve el stock.
- **Faltantes**: cada material tiene un mínimo; lo que está por debajo se marca en rojo.
- **Exportar** stock, faltantes o movimientos del mes en PDF o Excel (en el celular se comparte por WhatsApp).

## Datos y permisos

Usa la misma base Firebase que VIMECO OC: los usuarios (con sus contraseñas) y las obras se comparten.
Lo propio del pañol vive en `/panol/{obra}` y `/panol_config/obras/{obra}`.

- **0000 / admin**: ven todas las obras, cargan y asignan pañoleros desde "Pañoleros y quién ve cada obra".
- **Pañolero** (uno por obra): carga movimientos.
- **Jefe de obra** (el asignado en VIMECO OC) y quienes se anoten para ver: sólo lectura.

Los usuarios nuevos se crean en VIMECO OC (Administración → Usuarios).
