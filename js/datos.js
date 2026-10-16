/* global FIREBASE_CONFIG */
/* VIMECO S.A. — Pañol: acceso a Firebase RTDB por REST (sin SDK). Base propia,
   separada de VIMECO OC.

     /usuarios/{codigo}            nombre, activo, admin, passwordHash, resetPedido
     /obras/{key}                  nombre, activa, creadaEn
     /panol_config/obras/{obraKey} panolero: codigo, visores: {codigo:true}
     /panol/{obraKey}/articulos/{id}
         nombre, unidad, categoria, minimo, stock, activo, creadoEn, fotos (cuántas fotos del stock tiene)
     /panol/{obraKey}/personal/{clave}   nombre, ts   (quienes retiraron: se aprende de las salidas)
     /panol/{obraKey}/movimientos/{id}
         tipo: ingreso | salida | ajuste | traspaso_out | traspaso_in
         fecha 'YYYY-MM-DD', ts, por {codigo, nombre}
         items [{ id, nombre, unidad, cant }]   (cant > 0; en ajuste: antes, contado y cant = diferencia)
         proveedor, remito (ingreso) · retira, destino (salida) · otraObra {key, nombre}, ref (traspaso)
         nota, anulado {por, ts}, fotos (cuántas fotos del remito tiene)
     /panol_fotos/{obraKey}/{movId}/{n}  foto JPEG como data URL (aparte: no se baja al abrir la obra)
     /panol_fotos_stock/{obraKey}/{artId}/{clave}  foto, ts, por {codigo, nombre}
         fotos de cómo está el material en la obra (el acopio de áridos, los caños que quedan)

   El stock de cada artículo se guarda en el artículo y se mueve en la misma
   escritura que el movimiento (PATCH multi-ruta: o se graba todo o nada). */

(function () {
  const base = () => FIREBASE_CONFIG.databaseURL;

  async function _req(path, opts, ms) {
    const resp = await _fetchConTope(base() + path, opts, ms);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${body.substring(0, 120)}`.trim());
    }
    return resp.json();
  }
  const _get   = (path, ms) => _req(path, undefined, ms);
  const _patch = (path, data, ms) => _req(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }, ms);
  const _put   = (path, data, ms) => _req(path, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }, ms);
  const _del   = path => _req(path, { method: 'DELETE' });

  // Un cuelgue de red se vuelve error. Los errores de red (no los del servidor) llevan
  // `sinRed`: con esos, lo que se estaba grabando queda en la cola (offline.js).
  window._fetchConTope = function (url, opts, ms = 20000) {
    const ctrl = new AbortController();
    const to   = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...(opts || {}), signal: ctrl.signal })
      .catch(err => {
        const e = err && err.name === 'AbortError' ? new Error(`Sin respuesta tras ${Math.round(ms / 1000)}s`)
          : err instanceof Error ? err : new Error(String(err));
        e.sinRed = true;
        throw e;
      })
      .finally(() => clearTimeout(to));
  };

  // Claves que se ordenan por fecha de creación.
  window.nuevaClave = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const r3 = n => Math.round((Number(n) || 0) * 1000) / 1000;
  window.normTxt = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

  // ─── Usuarios (para el ingreso) ─────────────────────
  window.getAllUsuarios = async function () {
    const data = await _get('/usuarios.json');
    return Object.entries(data || {})
      .filter(([, u]) => u && u.nombre)
      .map(([codigo, u]) => ({ codigo, ...u }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  };
  window.getUsuario   = codigo => _get('/usuarios/' + codigo + '.json');
  window.patchUsuario = (codigo, fields) => _patch('/usuarios/' + codigo + '.json', fields);
  window.crearUsuario = (codigo, u) => _put('/usuarios/' + codigo + '.json', u);

  // Base recién creada: sin ningún usuario, se arma el 0000 (admin) para poder entrar
  // y crear al resto. Quien entre primero le pone la contraseña.
  window.prepararBaseVacia = async function () {
    if (await _get('/usuarios.json?shallow=true')) return false;
    await crearUsuario('0000', { nombre: 'Administrador', activo: true, admin: true });
    return true;
  };

  // ─── Obras ──────────────────────────────────────────
  window.getObras = async function () {
    const data = await _get('/obras.json');
    return Object.entries(data || {})
      .filter(([, o]) => o && o.nombre)
      .map(([key, o]) => ({ key, nombre: o.nombre, activa: !!o.activa }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  };
  window.crearObra = async function (nombre) {
    const key = nuevaClave();
    await _put('/obras/' + key + '.json', { nombre, activa: true, creadaEn: Date.now() });
    return key;
  };
  window.patchObra = (key, fields) => _patch('/obras/' + key + '.json', fields);

  // ─── Quién ve y quién carga cada pañol ──────────────
  window.getPanolConfig = async function () {
    return (await _get('/panol_config/obras.json')) || {};
  };
  window.savePanolConfigObra = (obraKey, cfg) => _put('/panol_config/obras/' + obraKey + '.json', cfg);

  /* Alcance de una persona:
       0000 o admin → todas las obras activas, con permiso de carga
       pañolero de la obra → carga
       anotado en la obra (visores) → también carga */
  window.alcancePanol = async function (codigo) {
    const [u, obras, cfg] = await Promise.all([
      codigo === '0000' ? Promise.resolve({ admin: true }) : getUsuario(codigo),
      getObras(),
      getPanolConfig()
    ]);
    const admin = codigo === '0000' || !!(u && u.admin);
    const lista = [];
    obras.filter(o => o.activa).forEach(o => {
      const c = cfg[o.key] || {};
      let rol = null;
      if (admin) rol = 'admin';
      else if (c.panolero === codigo) rol = 'panolero';
      else if (c.visores && c.visores[codigo]) rol = 'ver';
      if (rol) lista.push({ key: o.key, nombre: o.nombre, rol, panolero: c.panolero || null });
    });
    return { admin, activo: !!(u && (u.activo || codigo === '0000')), obras: lista, todas: obras, cfg };
  };

  // ─── Pañol de una obra ──────────────────────────────
  window.getPanol = async function (obraKey) {
    return _armarPanol((await _get('/panol/' + obraKey + '.json')) || {});
  };

  const _masNuevoPrimero = (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.ts || 0) - (a.ts || 0);

  function _armarPanol(data) {
    const articulos = Object.entries(data.articulos || {})
      .filter(([, a]) => a && a.nombre)
      .map(([id, a]) => ({ id, ...a, stock: r3(a.stock), minimo: r3(a.minimo), activo: a.activo !== false }));
    const movimientos = Object.entries(data.movimientos || {})
      .filter(([, m]) => m && m.tipo)
      .map(([id, m]) => ({ id, ...m, items: Array.isArray(m.items) ? m.items : Object.values(m.items || {}) }))
      .sort(_masNuevoPrimero);
    // Quienes retiraron alguna vez, el más reciente primero.
    const personal = Object.values(data.personal || {})
      .filter(p => p && p.nombre)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .map(p => p.nombre);
    return { articulos, movimientos, personal };
  }

  /* En vivo: escucha /panol/{obraKey} con el streaming de RTDB por REST (EventSource)
     y llama a alCambiar({articulos, movimientos, personal}) cada vez que alguien
     graba algo; alEstado(true/false) cuando llegan datos o se corta. Devuelve la
     función para dejar de escuchar. Si se corta, EventSource reconecta solo y el
     servidor vuelve a mandar todo. */
  window.escucharPanol = function (obraKey, alCambiar, alEstado = () => {}) {
    let raw = {}, timer = null;
    const es = new EventSource(base() + '/panol/' + obraKey + '.json');
    const poner = (path, val) => {
      const partes = path.split('/').filter(Boolean);
      if (!partes.length) { raw = (val && typeof val === 'object') ? val : {}; return; }
      let o = raw;
      for (const p of partes.slice(0, -1)) {
        if (!o[p] || typeof o[p] !== 'object') { if (val === null) return; o[p] = {}; }
        o = o[p];
      }
      const k = partes[partes.length - 1];
      if (val === null) delete o[k]; else o[k] = val;
    };
    // Un PATCH multi-ruta puede llegar en varios eventos: se repinta una sola vez.
    const avisar = () => { clearTimeout(timer); timer = setTimeout(() => alCambiar(_armarPanol(raw)), 150); };
    const leer = ev => { try { return JSON.parse(ev.data); } catch (_) { return null; } };
    es.addEventListener('put', ev => {
      const d = leer(ev); if (!d) return;
      poner(d.path, d.data); avisar(); alEstado(true);
    });
    es.addEventListener('patch', ev => {
      const d = leer(ev); if (!d || !d.data) return;
      Object.entries(d.data).forEach(([k, v]) => poner(d.path.replace(/\/$/, '') + '/' + k, v));
      avisar(); alEstado(true);
    });
    es.addEventListener('error', () => alEstado(false));
    return () => { clearTimeout(timer); es.close(); };
  };

  // Clave de RTDB a partir de un nombre: "Juan Pérez" y "juan perez" son la misma persona.
  const claveDe = s => normTxt(s).replace(/[.#$[\]/]/g, '_');

  // Resumen de cada obra para el selector: artículos y faltantes (sólo baja los artículos).
  window.getResumenPanoles = async function (keys) {
    const out = {};
    await Promise.all(keys.map(async k => {
      try {
        const arts = Object.values((await _get(`/panol/${k}/articulos.json`)) || {}).filter(a => a && a.nombre && a.activo !== false);
        out[k] = { articulos: arts.length, faltan: arts.filter(a => (a.stock || 0) <= 0 || ((a.minimo || 0) > 0 && a.stock < a.minimo)).length };
      } catch (_) {}
    }));
    return out;
  };

  window.patchArticulo = (obraKey, id, fields) => _patch(`/panol/${obraKey}/articulos/${id}.json`, fields);

  window.crearArticulo = async function (obraKey, a) {
    const id = nuevaClave();
    await _put(`/panol/${obraKey}/articulos/${id}.json`, {
      nombre: a.nombre.trim(), unidad: a.unidad || 'u', categoria: a.categoria || 'Varios',
      minimo: r3(a.minimo), stock: 0, activo: true, creadoEn: Date.now()
    });
    return id;
  };

  const DELTA = { ingreso: 1, traspaso_in: 1, salida: -1, traspaso_out: -1 };

  /* Arma las rutas que mueven el stock de una obra. `items` trae `id` de un
     artículo existente o `nuevo` {nombre, unidad, categoria} para darlo de alta.
     Devuelve los ítems como quedan guardados en el movimiento. */
  function _aplicar(updates, obraKey, arts, tipo, items) {
    const pref = obraKey + '/articulos/';
    const stock = {};
    Object.entries(arts || {}).forEach(([id, a]) => { stock[id] = r3(a && a.stock); });
    return items.map(it => {
      let id = it.id;
      if (!id || !arts[id]) {
        const n = it.nuevo || it;
        if (!n.nombre) throw new Error('Falta un material que se cargó sin señal');
        // Un material nuevo cargado sin señal ya trae su clave: así lo encuentran los movimientos de después.
        id = id || nuevaClave();
        arts[id] = { nombre: n.nombre, unidad: n.unidad || 'u', categoria: n.categoria || 'Varios' };
        updates[pref + id] = { nombre: n.nombre.trim(), unidad: n.unidad || 'u', categoria: n.categoria || 'Varios',
                               minimo: r3(n.minimo), stock: 0, activo: true, creadoEn: Date.now() };
        stock[id] = 0;
      }
      const a = arts[id];
      const out = { id, nombre: a.nombre, unidad: a.unidad || 'u' };
      if (tipo === 'ajuste') {
        out.antes = stock[id];
        out.contado = r3(it.contado);
        out.cant = r3(out.contado - out.antes);
        stock[id] = out.contado;
      } else {
        out.cant = r3(it.cant);
        stock[id] = r3(stock[id] + DELTA[tipo] * out.cant);
      }
      if (updates[pref + id]) updates[pref + id].stock = stock[id];
      else updates[pref + id + '/stock'] = stock[id];
      return out;
    });
  }

  /* Ingreso, salida o ajuste en una obra. `op` (opcional): id y ts ya elegidos, fotos
     [dataURL] del remito y `reintento` cuando se sube desde la cola: si el movimiento
     ya está (se grabó y se cortó antes de la respuesta) no se graba dos veces. */
  window.registrarMovimiento = async function (obraKey, mov, op = {}) {
    const id = op.id || nuevaClave();
    if (op.reintento && (await _get(`/panol/${obraKey}/movimientos/${id}.json?shallow=true`)) !== null) return id;
    // Las fotos van antes: si después falla el movimiento, al reintentar se pisan con las mismas.
    if (op.fotos && op.fotos.length) {
      await _put(`/panol_fotos/${obraKey}/${id}.json`, op.fotos, 90000);
      mov = { ...mov, fotos: op.fotos.length };
    }
    const arts = (await _get(`/panol/${obraKey}/articulos.json`)) || {};
    const updates = {};
    const items = _aplicar(updates, obraKey, arts, mov.tipo, mov.items);
    const ts = op.ts || Date.now();
    updates[`${obraKey}/movimientos/${id}`] = { ...mov, items, ts };
    if (mov.retira) updates[`${obraKey}/personal/${claveDe(mov.retira)}`] = { nombre: mov.retira, ts };
    await _patch('/panol.json', updates);
    return id;
  };

  // Fotos del remito de un movimiento.
  window.getFotos = async function (obraKey, movId) {
    const d = await _get(`/panol_fotos/${obraKey}/${movId}.json`, 60000);
    return (Array.isArray(d) ? d : Object.values(d || {})).filter(Boolean);
  };
  window.agregarFotos = async function (obraKey, movId, previas, nuevas) {
    const upd = {};
    nuevas.forEach((f, i) => { upd[previas + i] = f; });
    await _patch(`/panol_fotos/${obraKey}/${movId}.json`, upd, 90000);
    await _patch(`/panol/${obraKey}/movimientos/${movId}.json`, { fotos: previas + nuevas.length });
  };

  // Fotos del stock de un material, la más nueva primero.
  window.getFotosStock = async function (obraKey, artId) {
    const d = await _get(`/panol_fotos_stock/${obraKey}/${artId}.json`, 60000);
    return Object.entries(d || {}).filter(([, f]) => f && f.foto)
      .map(([id, f]) => ({ id, ...f })).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  };
  // `quedan`: cuántas fotos tiene el material después del cambio (va en el artículo para la lista).
  window.agregarFotoStock = async function (obraKey, artId, foto, por, quedan) {
    const f = { id: nuevaClave(), foto, ts: Date.now(), por };
    await _put(`/panol_fotos_stock/${obraKey}/${artId}/${f.id}.json`, { foto, ts: f.ts, por }, 90000);
    await patchArticulo(obraKey, artId, { fotos: quedan });
    return f;
  };
  window.quitarFotoStock = async function (obraKey, artId, fotoId, quedan) {
    await _del(`/panol_fotos_stock/${obraKey}/${artId}/${fotoId}.json`);
    await patchArticulo(obraKey, artId, { fotos: quedan || null });
  };

  /* Lo cargado sin señal (la cola de offline.js) aplicado sobre lo último que mandó el
     servidor: el stock ya lo cuenta y esos movimientos quedan marcados `pendiente`.
     Los que el servidor ya tiene se saltean. */
  window.aplicarPendientes = function (p, cola) {
    const ya = new Set(p.movimientos.map(m => m.id));
    cola = cola.filter(q => !ya.has(q.id));
    if (!cola.length) return p;
    const raw = {};
    p.articulos.forEach(a => { raw[a.id] = { ...a }; });
    const nuevos = [], personal = [...p.personal];
    cola.forEach(q => {
      const upd = {};
      let items;
      try { items = _aplicar(upd, '', raw, q.mov.tipo, q.mov.items); } catch (_) { return; }
      Object.entries(upd).forEach(([k, v]) => {
        const [, , id, campo] = k.split('/');          // '/articulos/{id}' o '/articulos/{id}/stock'
        if (campo) raw[id].stock = v; else raw[id] = { id, ...v, sinSubir: true };
      });
      nuevos.push({ ...q.mov, id: q.id, ts: q.ts, items, fotos: (q.fotos || []).length || undefined,
                    pendiente: q.error ? 'error' : true });
      if (q.mov.retira && !personal.some(n => normTxt(n) === normTxt(q.mov.retira))) personal.unshift(q.mov.retira);
    });
    return { articulos: Object.values(raw), movimientos: [...nuevos, ...p.movimientos].sort(_masNuevoPrimero), personal };
  };

  // Pasar materiales de una obra a otra: salida acá, ingreso allá, en una sola escritura.
  // En la obra de destino el artículo se busca por nombre; si no está, se crea.
  window.registrarTraspaso = async function (origen, destino, mov) {
    const [artsO, artsD] = await Promise.all([
      _get(`/panol/${origen.key}/articulos.json`).then(x => x || {}),
      _get(`/panol/${destino.key}/articulos.json`).then(x => x || {})
    ]);
    const updates = {};
    const idO = nuevaClave(), idD = nuevaClave();
    const itemsO = _aplicar(updates, origen.key, artsO, 'traspaso_out', mov.items);
    const porNombre = {};
    Object.entries(artsD).forEach(([id, a]) => { if (a && a.nombre) porNombre[normTxt(a.nombre)] = id; });
    const itemsD = _aplicar(updates, destino.key, artsD, 'traspaso_in', itemsO.map(it => {
      const o = artsO[it.id];
      return { id: porNombre[normTxt(it.nombre)], cant: it.cant,
               nuevo: { nombre: it.nombre, unidad: it.unidad, categoria: o && o.categoria, minimo: 0 } };
    }));
    const ts = Date.now();
    const comun = { fecha: mov.fecha, por: mov.por, nota: mov.nota || '', ts };
    updates[`${origen.key}/movimientos/${idO}`]  = { ...comun, tipo: 'traspaso_out', items: itemsO, otraObra: destino, ref: idD };
    updates[`${destino.key}/movimientos/${idD}`] = { ...comun, tipo: 'traspaso_in',  items: itemsD, otraObra: origen,  ref: idO };
    await _patch('/panol.json', updates);
  };

  /* Anular: devuelve el stock como estaba y deja el movimiento tachado.
     Un traspaso se anula de los dos lados. */
  window.anularMovimiento = async function (obraKey, mov, por) {
    const lados = [[obraKey, mov]];
    if (mov.otraObra && mov.ref) lados.push([mov.otraObra.key, { ...mov, id: mov.ref, tipo: mov.tipo === 'traspaso_out' ? 'traspaso_in' : 'traspaso_out', items: null }]);
    const updates = {};
    const marca = { por, ts: Date.now() };
    for (const [k, m] of lados) {
      const [arts, guardado] = await Promise.all([
        _get(`/panol/${k}/articulos.json`).then(x => x || {}),
        m.items ? Promise.resolve(m) : _get(`/panol/${k}/movimientos/${m.id}.json`)
      ]);
      if (!guardado || guardado.anulado) continue;
      const items = Array.isArray(guardado.items) ? guardado.items : Object.values(guardado.items || {});
      items.forEach(it => {
        if (!arts[it.id]) return;   // el artículo ya no existe: no hay stock que devolver
        const signo = guardado.tipo === 'ajuste' ? 1 : DELTA[guardado.tipo];
        const actual = updates[`${k}/articulos/${it.id}/stock`] ?? r3(arts[it.id].stock);
        updates[`${k}/articulos/${it.id}/stock`] = r3(actual - signo * it.cant);
      });
      updates[`${k}/movimientos/${m.id}/anulado`] = marca;
    }
    await _patch('/panol.json', updates);
  };
})();
