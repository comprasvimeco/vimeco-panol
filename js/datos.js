/* global FIREBASE_CONFIG */
/* VIMECO S.A. — Pañol: acceso a Firebase RTDB por REST (sin SDK), igual que VIMECO OC.

   Compartido con VIMECO OC (sólo se lee, salvo la contraseña al ingresar):
     /usuarios/{codigo}            nombre, activo, admin, passwordHash…
     /obras/{key}                  nombre, activa, jefes {codigo:true}
     /personal/{id}                apellido, nombre, obras {obraKey:true}

   Propio del pañol:
     /panol_config/obras/{obraKey} panolero: codigo, visores: {codigo:true}
     /panol/{obraKey}/articulos/{id}
         nombre, unidad, categoria, minimo, stock, activo, creadoEn
     /panol/{obraKey}/movimientos/{id}
         tipo: ingreso | salida | ajuste | traspaso_out | traspaso_in
         fecha 'YYYY-MM-DD', ts, por {codigo, nombre}
         items [{ id, nombre, unidad, cant }]   (cant > 0; en ajuste: antes, contado y cant = diferencia)
         proveedor, remito (ingreso) · retira, destino (salida) · otraObra {key, nombre}, ref (traspaso)
         nota, anulado {por, ts}

   El stock de cada artículo se guarda en el artículo y se mueve en la misma
   escritura que el movimiento (PATCH multi-ruta: o se graba todo o nada). */

(function () {
  const base = () => FIREBASE_CONFIG.databaseURL;

  async function _req(path, opts) {
    const resp = await _fetchConTope(base() + path, opts);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${body.substring(0, 120)}`.trim());
    }
    return resp.json();
  }
  const _get   = path => _req(path);
  const _patch = (path, data) => _req(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const _put   = (path, data) => _req(path, { method: 'PUT',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

  // Un cuelgue de red se vuelve error (ver la misma función en VIMECO OC).
  window._fetchConTope = function (url, opts, ms = 20000) {
    const ctrl = new AbortController();
    const to   = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...(opts || {}), signal: ctrl.signal })
      .catch(err => {
        if (err && err.name === 'AbortError') throw new Error(`Sin respuesta tras ${Math.round(ms / 1000)}s`);
        throw err;
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

  // ─── Obras y personal ───────────────────────────────
  window.getObras = async function () {
    const data = await _get('/obras.json');
    return Object.entries(data || {})
      .filter(([, o]) => o && o.nombre)
      .map(([key, o]) => ({ key, nombre: o.nombre, activa: !!o.activa, jefes: o.jefes || {} }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  };

  window.getPersonalDeObra = async function (obraKey) {
    const data = await _get('/personal.json');
    return Object.values(data || {})
      .filter(p => p && p.apellido && p.obras && p.obras[obraKey] && p.activo !== false)
      .map(p => `${p.apellido} ${p.nombre || ''}`.trim())
      .sort((a, b) => a.localeCompare(b, 'es'));
  };

  // ─── Quién ve y quién carga cada pañol ──────────────
  window.getPanolConfig = async function () {
    return (await _get('/panol_config/obras.json')) || {};
  };
  window.savePanolConfigObra = (obraKey, cfg) => _put('/panol_config/obras/' + obraKey + '.json', cfg);

  /* Alcance de una persona:
       0000 o admin → todas las obras activas, con permiso de carga
       pañolero de la obra → carga
       jefe de la obra (en VIMECO OC) o anotado para ver → sólo mira */
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
      else if (o.jefes[codigo] || (c.visores && c.visores[codigo])) rol = 'ver';
      if (rol) lista.push({ key: o.key, nombre: o.nombre, rol, panolero: c.panolero || null });
    });
    return { admin, activo: !!(u && (u.activo || codigo === '0000')), obras: lista, todas: obras, cfg };
  };

  // ─── Pañol de una obra ──────────────────────────────
  window.getPanol = async function (obraKey) {
    const data = (await _get('/panol/' + obraKey + '.json')) || {};
    const articulos = Object.entries(data.articulos || {})
      .filter(([, a]) => a && a.nombre)
      .map(([id, a]) => ({ id, ...a, stock: r3(a.stock), minimo: r3(a.minimo), activo: a.activo !== false }));
    const movimientos = Object.entries(data.movimientos || {})
      .filter(([, m]) => m && m.tipo)
      .map(([id, m]) => ({ id, ...m, items: Array.isArray(m.items) ? m.items : Object.values(m.items || {}) }))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.ts || 0) - (a.ts || 0));
    return { articulos, movimientos };
  };

  // Resumen de cada obra para el selector: artículos y faltantes (sólo baja los artículos).
  window.getResumenPanoles = async function (keys) {
    const out = {};
    await Promise.all(keys.map(async k => {
      try {
        const arts = Object.values((await _get(`/panol/${k}/articulos.json`)) || {}).filter(a => a && a.nombre && a.activo !== false);
        out[k] = { articulos: arts.length, faltan: arts.filter(a => (a.minimo || 0) > 0 && (a.stock || 0) < a.minimo).length };
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
        id = nuevaClave();
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

  // Ingreso, salida o ajuste en una obra.
  window.registrarMovimiento = async function (obraKey, mov) {
    const arts = (await _get(`/panol/${obraKey}/articulos.json`)) || {};
    const updates = {};
    const id = nuevaClave();
    const items = _aplicar(updates, obraKey, arts, mov.tipo, mov.items);
    updates[`${obraKey}/movimientos/${id}`] = { ...mov, items, ts: Date.now() };
    await _patch('/panol.json', updates);
    return id;
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
