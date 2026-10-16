# VIMECO Pañol — Instrucciones para Claude Code

Stock y movimientos del pañol de cada obra de VIMECO S.A. Qué hace y quién ve qué: `README.md`.

## Stack y deploy

PWA estática (HTML/CSS/JS), sin dependencias. Un push a `main` es un deploy: GitHub Actions
(`.github/workflows/deploy.yml`) corre `build.js`, que sólo pone la clave de Gemini en `js/config.js`
(Secret `GEMINI_API_KEY`, la misma de VIMECO OC), y publica la raíz en Pages
(https://comprasvimeco.github.io/vimeco-panol/). En el repo `config.js` queda con el marcador
`%%GEMINI_API_KEY%%`: no commitear la clave. No hay número de versión ni hook de commits.

- Los `<script>` no llevan `?v=`: Pages cachea ~10 min, así que un cambio puede tardar en verse.
- `sw.js` (service worker) guarda la app para abrir sin señal; prueba la red primero, así que no
  frena los deploys. **Un archivo nuevo de la app se suma a `ARCHIVOS` en `sw.js`** (si falta uno, no
  se instala).
- Antes de commitear, chequear sintaxis: `node --check js/panol.js` (y el archivo que se haya tocado).
- Mensajes de commit en castellano, cortos, describiendo lo que cambia para el usuario.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` + `js/auth.js` | Ingreso: elegir usuario y contraseña (la crea la primera vez). Sesión en `localStorage.vimeco_session`. |
| `panol.html` + `js/panol.js` | Toda la app: selector de obras, stock, movimientos, diálogos, obras/permisos y usuarios. |
| `js/datos.js` | Acceso a Firebase RTDB **por REST, sin SDK**. El esquema de la base está documentado arriba de todo. |
| `js/offline.js` | Sin señal: copia local de cada obra (IndexedDB) y cola de movimientos que se suben solos al volver la señal. |
| `sw.js` | Service worker: la app abre sin señal. |
| `js/gemini.js` | Leer el remito con IA: motor `callGemini` copiado de VIMECO OC (cadena de modelos, salta al agotado) + `leerRemito(fotos, articulos)`. Sólo llena el formulario de ingreso; no graba. |
| `js/scanner.js` + `js/vendor/opencv.js` | Escáner de VIMECO OC (`openScanner(file)`): recorte de perspectiva y filtro de cada foto del remito antes de achicarla. Sus estilos (`scan-*`) ya estaban en `styles.css`. OpenCV se baja recién al abrirlo. |
| `js/panolExport.js` | PDF (jsPDF) y Excel (`xlsx-js-style`, se baja de jsDelivr al exportar). |
| `js/config.js` | Config de Firebase, proyecto **`vimeco-panol`** (base propia, separada de VIMECO OC). |
| `css/styles.css` | Copia de la hoja de VIMECO OC (tokens, header, botones `foc-btn`, `eq-dlg`, toasts). Mucho no se usa acá. |
| `js/ui.js`, `js/icons.js`, `js/install.js`, `js/logoBase64.js`, `js/jspdf.umd.min.js` | Copias de VIMECO OC. |
| `design/` | Referencia visual del design system de VIMECO OC (tokens, botones, cards, header, tablas/modales, badges/toasts). Abrir en el navegador para ver cómo se ve cada componente. |

`styles.css` y los JS compartidos se copiaron de VIMECO OC y ya no se sincronizan: si se arregla algo
en uno, no llega solo al otro.

## Convenciones del código

- **Lo propio del pañol va en el `<style>` de `panol.html`** (clases `pn-*`), no en `styles.css`.
- Helpers globales: `escHtml` (alias `esc`), `icSvg(nombre)` / `ic` (se extiende con `Object.assign(ic, …)`
  en `panol.js`), `showToast`, `showConfirm(titulo, msg, {boton, tono, icono})`, `normTxt` (búsquedas sin tildes).
- Diálogos: `abrirDlg({ icono, titulo, sub, cuerpo, fijo })` / `cerrarDlg()`. `fijo: true` = no se cierra
  tocando afuera (formularios). El diálogo (`.eq-dlg`) tiene `overflow-y: auto`: **nada absoluto adentro**,
  porque se corta en el borde de la tarjeta. Listas de resultados van en el flujo (`.pn-pick-res`).
- Campos con sugerencias: `comboLista(input, valores)`, **no `<datalist>`** (con el campo cargado no
  muestra opciones y en muchos celulares no abre).
- Números: `parseN` acepta coma decimal; `fmtN` formatea es-AR con hasta 3 decimales.
- Fechas como `'YYYY-MM-DD'` local (`hoyISO()`), nunca `toISOString()` (corre el día por UTC).
- Mobile-first: se usa casi todo desde el celular. Inputs a 16px (si no, iOS hace zoom), no rehacer
  el `innerHTML` de un input mientras se escribe (cierra el teclado).
- Textos de la interfaz y comentarios en castellano rioplatense, con voseo ("Elegí", "Poné").

## Datos

- El stock vive en cada artículo y se mueve **en la misma escritura** que el movimiento (PATCH
  multi-ruta en `datos.js`): o se graba todo o nada. No actualizar el stock por separado.
- Anular un movimiento devuelve el stock; los movimientos no se borran.
- Un traspaso escribe `traspaso_out` en la obra de origen y `traspaso_in` en la de destino, ligados por `ref`.
- En vivo: con una obra abierta se escucha `/panol/{obra}` (`escucharPanol`, EventSource).
- Sin señal: ingresos, salidas y ajustes pasan por `guardarMovimiento` (panol.js), que si falla la red
  los encola. Lo que se muestra es lo del servidor + la cola (`aplicarPendientes`). Traspasos, anular
  y configuración necesitan señal.
- Fotos del remito: JPEG achicado en el teléfono, en `/panol_fotos/{obra}/{mov}` (aparte de `/panol`
  para que no se bajen al abrir la obra). Firebase Storage no se usa: pide plan pago.
- Fotos del stock de un material (sin escáner): `/panol_fotos_stock/{obra}/{art}/{clave}`; el artículo
  guarda sólo cuántas tiene (`fotos`). Agregar o quitar necesita señal.
