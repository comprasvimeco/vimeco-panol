/* global GEMINI_API_KEY */

/*
 * VIMECO S.A. — Pañol: lectura del remito con Gemini.
 *
 * El motor (`callGemini`) es el de VIMECO OC tal cual: la misma clave y la misma
 * cadena de modelos. El tier gratuito da cupo POR MODELO y por día, así que se
 * salta al siguiente cuando el de arriba está sin cupo (429), caído (5xx) o tarda
 * de más. Los 400 NO saltan: si el pedido está mal armado, en otro modelo va a
 * estar igual.
 *
 * El modelo agotado se recuerda en localStorage para no gastar un viaje de red
 * en cada lectura por el resto del día. OJO: la cuota se resetea a MEDIANOCHE
 * DEL PACÍFICO, no local — por eso la marca guarda el día en esa zona horaria.
 *
 * La clave la pone el deploy (build.js, desde el Secret GEMINI_API_KEY del repo).
 */
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// `cfg` se mergea sobre el generationConfig de cada pedido:
// - mediaResolution HIGH en los lite: sin eso pierden dígitos en fotos de celular.
// - thinkingLevel minimal en 3.6: por defecto piensa de más y tarda ~25s.
const G_LITE_35  = { id: 'gemini-3.5-flash-lite', cfg: { mediaResolution: 'MEDIA_RESOLUTION_HIGH' } };
const G_LITE_31  = { id: 'gemini-3.1-flash-lite', cfg: { mediaResolution: 'MEDIA_RESOLUTION_HIGH' } };
const G_FLASH_36 = { id: 'gemini-3.6-flash',      cfg: { thinkingConfig: { thinkingLevel: 'minimal' } } };
const G_FLASH_25 = { id: 'gemini-2.5-flash',      cfg: {} };

// Remitos: manuscritos y fotos torcidas. Arranca por el modelo grande y deja los
// lite como red para cuando se agote (igual que en VIMECO OC).
const CADENA_REMITO = [G_FLASH_36, G_LITE_35, G_LITE_31, G_FLASH_25];

const GEMINI_AGOTADOS_KEY = 'vimeco_gemini_agotados';
const modelosSinNombre    = new Set();   // 404: nombre que esta API todavía no sirve

// La cuota diaria de Gemini corta a medianoche del Pacífico.
function diaPacifico() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function agotadosHoy() {
  try {
    const guardado = JSON.parse(localStorage.getItem(GEMINI_AGOTADOS_KEY) || '{}');
    const hoy = diaPacifico();
    return Object.fromEntries(Object.entries(guardado).filter(([, dia]) => dia === hoy));
  } catch {
    return {};
  }
}

function marcarAgotado(modeloId) {
  try {
    const actual = agotadosHoy();
    actual[modeloId] = diaPacifico();
    localStorage.setItem(GEMINI_AGOTADOS_KEY, JSON.stringify(actual));
  } catch { /* sin localStorage la cascada sigue funcionando, sólo reintenta */ }
}

function geminiApiKey() {
  const key = typeof GEMINI_API_KEY !== 'undefined' ? GEMINI_API_KEY : null;
  if (!key || key.includes('%%')) throw new Error('La lectura con IA todavía no está configurada (falta la clave de Gemini).');
  return key;
}

async function callGemini(cadena, body, opts = {}) {
  const apiKey   = geminiApiKey();
  const timeout  = opts.timeout || 60000;
  const agotados = agotadosHoy();
  const saltar   = m => agotados[m.id] || modelosSinNombre.has(m.id);

  // Los descartados van al final en vez de excluirse: si la cadena entera está
  // marcada, más vale intentar igual que fallar sin haber pedido nada.
  const orden = [...cadena.filter(m => !saltar(m)), ...cadena.filter(saltar)];

  let ultimoError = null;

  for (const modelo of orden) {
    const payload = {
      ...body,
      generationConfig: { ...(body.generationConfig || {}), ...modelo.cfg }
    };

    let response;
    try {
      response = await fetch(`${GEMINI_BASE}/${modelo.id}:generateContent?key=${apiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(timeout)
      });
    } catch (err) {
      // Timeout o red: probamos el siguiente, que suele ser más rápido.
      ultimoError = (err.name === 'TimeoutError' || err.name === 'AbortError')
        ? new Error(opts.msgTimeout || 'La lectura tardó demasiado.')
        : err;
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      if (data.candidates?.length) {
        // Queda a mano para diagnosticar desde la consola con qué modelo se leyó.
        try { window.__geminiUltimoModelo = modelo.id; } catch { /* sin window, da igual */ }
        return { data, modelo: modelo.id };
      }
      ultimoError = new Error(opts.msgVacio || 'La IA no devolvió una respuesta utilizable.');
      continue;
    }

    const errData = await response.json().catch(() => ({}));
    ultimoError = new Error(`Error de Gemini: ${errData?.error?.message || `HTTP ${response.status}`}`);

    if (response.status === 429) { marcarAgotado(modelo.id);      continue; }
    if (response.status === 404) { modelosSinNombre.add(modelo.id); continue; }
    if (response.status >= 500)  { continue; }

    throw ultimoError;   // 400/403: el pedido o la key están mal para todos por igual
  }

  throw ultimoError || new Error('No se pudo contactar a Gemini.');
}

function textoGemini(data) {
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Los modelos a veces envuelven el JSON en ```json o le cuelgan una frase.
function jsonDeTexto(texto, msgError) {
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const ini = limpio.indexOf('{'), fin = limpio.lastIndexOf('}');
  if (ini === -1 || fin === -1) throw new Error(msgError || 'Respuesta inesperada de la IA.');
  try {
    return JSON.parse(limpio.slice(ini, fin + 1));
  } catch {
    throw new Error('La respuesta de la IA no se pudo leer. Probá de nuevo.');
  }
}

function trimOrNull(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' || s === 'null' ? null : s;
}

function parseFloatSafe(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    // Formato argentino "1.500,50" → 1500.50
    const n = parseFloat(val.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ─── Remito contra los materiales del pañol ─────────

// Como en Remitos de VIMECO OC: se le pasan los materiales del pañol numerados y
// cada renglón del remito vuelve atado a un número de esa lista (o a ninguno, si
// es algo que el pañol todavía no tiene: ese se da de alta a mano).
function remitoPanolPrompt(articulos) {
  const lista = articulos.length
    ? articulos.map((a, i) => `${i}. ${a.nombre} | unidad: ${a.unidad || 'u'}`).join('\n')
    : '(el pañol todavía no tiene materiales cargados)';

  return `Analizás la foto de un REMITO de entrega de materiales a una obra en Argentina. Puede estar torcida, con sombras o escrita a mano. Si hay varias fotos, son hojas o partes del mismo remito.

Estos son los materiales que ya tiene el pañol de la obra:
${lista}

Tu tarea:
1. Leer el proveedor (la empresa o comercio que emite el remito; VIMECO S.A. es el cliente que recibe, NUNCA el proveedor), el número de remito y la fecha.
2. Para cada renglón del remito, decidir a qué número de la lista corresponde. Las palabras no van a coincidir exactamente ("Cemento Loma Negra x 50kg" es "Cemento"), pero tiene que ser EL MISMO producto: mismo tipo y, si la lista lo dice, misma medida. Que sean de la misma familia no alcanza ("Tornillo p/depósito mochila" NO es "Tornillo autoperforante"; "Mecha SDS 20 mm" NO es "Mecha SDS 18 mm"). Ante la duda, "idx" va null: el pañolero lo elige a mano.
3. La cantidad va en la unidad del material de la lista. Convertí sólo si el renglón dice el contenido (ej: "10 bolsas x 25 kg" con material en kg → 250; "Enduido x 5 kg", 1 unidad, con material en kg → 5). Nunca supongas equivalencias que el remito no dice (unidades a pares, cajas, rollos): ahí dejá la cantidad del remito.

Devolvé ÚNICAMENTE un JSON válido, sin markdown ni texto adicional:

{
  "proveedor": "nombre o razón social de quien entrega, o null",
  "nro": "número de remito tal como figura (ej: 0001-00012345); si hay dos, el que está junto a 'Nº' o 'Número' en el encabezado, no el de pedido ni el de orden; o null",
  "fecha": "fecha del remito en formato YYYY-MM-DD, o null",
  "items": [
    {
      "idx": número_de_la_lista_o_null,
      "desc": "descripción del renglón tal como figura en el remito",
      "cant_remito": "cantidad y unidad tal como figuran en el remito (ej: '10 bolsas')",
      "cantidad": número_decimal_en_la_unidad_del_material,
      "unidad": "unidad de 'cantidad': la del material de la lista si hay idx; si no, la del remito (u, kg, m, m², m³, l, bolsa, etc.)"
    }
  ]
}

Reglas:
- "idx" debe ser uno de los números de la lista o null. Nunca inventes índices.
- Incluí TODOS los renglones del remito con material entregado. No incluyas totales, fletes ni leyendas.
- Si no podés leer un dato, devolvé null (no inventes un número de remito ni una fecha).
- FORMATO NUMÉRICO: en documentos argentinos el punto es separador de miles y la coma es decimal.
  Ejemplos: "1.250,50" → 1250.5 · "12,5" → 12.5 · "1.000" → 1000`;
}

// fotos: data URLs JPEG (las del formulario, ya achicadas). articulos: [{ id, nombre, unidad }].
// Devuelve { proveedor, nro, fecha, items: [{ id | null, desc, leido, cantidad, unidad }] }.
async function leerRemito(fotos, articulos) {
  const partes = fotos.map(f => ({ inline_data: { mime_type: 'image/jpeg', data: f.split(',')[1] } }));

  const { data } = await callGemini(CADENA_REMITO, {
    contents: [{ parts: [{ text: remitoPanolPrompt(articulos) }, ...partes] }],
    // JSON forzado: sin esto, a veces vuelve texto que no se puede leer.
    generationConfig: { temperature: 0.05, maxOutputTokens: 8192, responseMimeType: 'application/json' }
  }, {
    timeout:    60000,
    msgTimeout: 'La lectura tardó demasiado. Cargá el remito a mano.'
  });

  const parsed = jsonDeTexto(textoGemini(data));

  const items = (parsed.items || []).map(it => {
    const idx = it.idx === null || it.idx === undefined || it.idx === '' ? NaN : Number(it.idx);
    const a   = Number.isInteger(idx) && idx >= 0 && idx < articulos.length ? articulos[idx] : null;
    return {
      id:       a ? a.id : null,   // un índice inventado queda como material sin reconocer
      desc:     String(it.desc || '').trim(),
      leido:    trimOrNull(it.cant_remito),
      cantidad: parseFloatSafe(it.cantidad),
      unidad:   a ? (a.unidad || 'u') : (trimOrNull(it.unidad) || 'u')
    };
  }).filter(it => it.id || it.desc);

  const fecha = trimOrNull(parsed.fecha);
  const proveedor = trimOrNull(parsed.proveedor);
  return {
    proveedor: proveedor && !/vimeco/i.test(proveedor) ? proveedor : null,   // a veces toma al cliente
    nro:       trimOrNull(parsed.nro),
    fecha:     /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : null,
    items
  };
}
