/* VIMECO S.A. — Pañol sin señal.

   Guarda en el teléfono (IndexedDB) lo último que se vio de cada obra y la cola de
   movimientos cargados sin señal. La cola se sube sola cuando vuelve la conexión, en
   el orden en que se cargó; registrarMovimiento (datos.js) se fija si un movimiento ya
   había llegado para no grabarlo dos veces.

     leerLocal(clave) / guardarLocal(clave, valor)
     encolar({ id, ts, obraKey, obraNombre, mov, fotos })   cola[i].error: por qué no subió
     colaPendiente(obraKey?) · descartarPendiente(id) · sincronizar() · alCambiarCola(fn)

   Sólo ingresos, salidas y ajustes: pasar a otra obra, anular y lo de configuración
   necesitan señal. */

(function () {
  let _db = null;
  function db() {
    return _db || (_db = new Promise((ok, mal) => {
      const r = indexedDB.open('vimeco_panol', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    }));
  }
  const tx = (modo, fn) => db().then(d => new Promise((ok, mal) => {
    const t = d.transaction('kv', modo);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => ok(req.result);
    t.onerror = t.onabort = () => mal(t.error || new Error('No se pudo guardar en el teléfono'));
  }));

  window.leerLocal = k => tx('readonly', s => s.get(k)).catch(() => undefined);
  window.guardarLocal = (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {});

  // ─── Cola ───────────────────────────────────────────
  let cola = [];
  const lista = leerLocal('cola').then(c => { cola = Array.isArray(c) ? c : []; });
  const avisos = [];
  const avisar = () => avisos.forEach(fn => { try { fn(); } catch (_) {} });
  // La cola sí tiene que quedar guardada: si falla, quien la llama se entera.
  const persistir = () => tx('readwrite', s => s.put(cola, 'cola'));

  window.colaLista = lista;
  window.alCambiarCola = fn => avisos.push(fn);
  window.colaPendiente = obraKey => cola.filter(q => !obraKey || q.obraKey === obraKey);

  window.encolar = async function (q) {
    await lista;
    cola.push(q);
    try { await persistir(); } catch (e) { cola.pop(); throw e; }
    avisar();
    setTimeout(sincronizar, 3000);
  };

  window.descartarPendiente = async function (id) {
    await lista;
    cola = cola.filter(q => q.id !== id);
    await persistir();
    avisar();
  };

  let subiendo = null;
  window.sincronizar = function () {
    if (subiendo) return subiendo;
    subiendo = (async () => {
      await lista;
      let subidos = 0;
      for (const q of [...cola]) {
        try {
          await registrarMovimiento(q.obraKey, q.mov, { id: q.id, ts: q.ts, fotos: q.fotos, reintento: true });
          cola = cola.filter(x => x.id !== q.id);
          subidos++;
        } catch (e) {
          if (e && e.sinRed) break;          // sigue sin señal: se prueba más tarde
          q.error = e.message;               // el servidor lo rechazó: queda a la vista para descartarlo
        }
        await persistir().catch(() => {});
        avisar();
      }
      return subidos;
    })().finally(() => { subiendo = null; });
    return subiendo;
  };

  window.addEventListener('online', () => sincronizar());
  setInterval(() => { if (cola.length && navigator.onLine) sincronizar(); }, 30000);
  lista.then(() => { if (cola.length) sincronizar(); });
})();
