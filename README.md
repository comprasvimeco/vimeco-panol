# VIMECO Pañol

Stock y movimientos del pañol de cada obra de VIMECO S.A. PWA estática (HTML/CSS/JS), publicada en GitHub Pages.

- **Ingreso / Salida / Ajuste / Pasar a otra obra**, con anulación que devuelve el stock.
- **Faltantes**: cada material tiene un mínimo; lo que está por debajo se marca en rojo.
- **Exportar** stock, faltantes o movimientos del mes en PDF o Excel (en el celular se comparte por WhatsApp).

## Datos y permisos

Base Firebase propia (proyecto `vimeco-panol`), separada de VIMECO OC: `/usuarios`, `/obras`,
`/panol/{obra}` (materiales, movimientos y personal que retira) y `/panol_config/obras/{obra}`.

- **0000 / admin**: ven todas las obras y cargan. Crean obras y eligen pañolero y quién ve
  desde "Obras y permisos"; crean usuarios y resetean contraseñas desde "Usuarios".
- **Pañolero** (uno por obra): carga movimientos.
- **Quienes se anoten en la obra** (jefes de obra, capataces): ven y cargan igual que el pañolero.

Con la base vacía, el primer ingreso crea el usuario 0000 (Administrador): quien entra primero le pone la contraseña.

"Retira" en las salidas es texto libre: cada nombre nuevo queda guardado en esa obra y se sugiere las próximas veces.
