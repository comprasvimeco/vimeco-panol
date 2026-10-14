/* VIMECO S.A. — Pañol de obra
   Quién entra: el pañolero de cada obra y quienes estén anotados en ella (todos
   cargan), y 0000/admin (todo + obras, usuarios y permisos).
   Con una sola obra se entra directo; con varias, primero se elige. La obra
   abierta va en el hash (#o=clave) para que "atrás" del teléfono vuelva a la lista. */

const $ = id => document.getElementById(id);
const esc = escHtml;

Object.assign(ic, {
  in:      '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  out:     '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  swap:    '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  more:    '<circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="12" r="1.2"/>',
  list:    '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'
});

const UNIDADES = ['u', 'kg', 'm', 'm²', 'm³', 'l', 'bolsa', 'caja', 'rollo', 'barra', 'par', 'balde', 'pallet'];
const CATEGORIAS = ['Áridos', 'Cementos y cales', 'Hierros y mallas', 'Maderas', 'Caños y accesorios', 'Eléctricos', 'Pinturas',
  'Bulonería y fijaciones', 'Combustibles y lubricantes', 'EPP y ropa', 'Consumibles', 'Herramientas menores', 'Varios'];

const TIPOS = {
  ingreso:      { t: 'Ingreso',              ic: 'in',      tone: 't-in',  signo: 1 },
  salida:       { t: 'Salida',               ic: 'out',     tone: 't-out', signo: -1 },
  ajuste:       { t: 'Ajuste de inventario', ic: 'sliders', tone: 't-aj',  signo: 0 },
  traspaso_out: { t: 'Pasó a otra obra',     ic: 'swap',    tone: 't-tr',  signo: -1 },
  traspaso_in:  { t: 'Llegó de otra obra',   ic: 'swap',    tone: 't-tr',  signo: 1 }
};

// ─── Utilidades ─────────────────────────────────────
const fmtN = n => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 });
const fmtSig = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtN(Math.abs(n));
function parseN(s) {
  s = String(s ?? '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}
const pad = n => String(n).padStart(2, '0');
const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoyISO = () => isoDe(new Date());
const mesDe = iso => iso.slice(0, 7);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = m => { const [y, mo] = m.split('-'); const s = MESES[+mo - 1] + ' ' + y; return s[0].toUpperCase() + s.slice(1); };
const sumarMes = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const hoy = hoyISO(), ayer = isoDe(new Date(Date.now() - 864e5));
  if (iso === hoy) return 'Hoy';
  if (iso === ayer) return 'Ayer';
  const s = dt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s[0].toUpperCase() + s.slice(1);
}
const fechaCorta = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const hora = ts => ts ? new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
// Falta lo que se quedó sin stock (tenga mínimo o no) o está por debajo del mínimo.
const falta = a => a.activo && (a.stock <= 0 || ((a.minimo || 0) > 0 && a.stock < a.minimo));
const plural = (n, s, p) => `${fmtN(n)} ${n === 1 ? s : p}`;
const sinTitulo = n => String(n || '').split(/\s+/).filter(p => p && !p.endsWith('.')).join(' ') || String(n || '');

// ─── Sesión ─────────────────────────────────────────
const ses = (() => { try { return JSON.parse(localStorage.getItem('vimeco_session')); } catch (_) { return null; } })();
if (!ses || !ses.codigo) window.location.replace('index.html');
const yo = ses ? { codigo: ses.codigo, nombre: ses.nombre } : null;

// ─── Estado ─────────────────────────────────────────
let alc = null;          // alcancePanol()
let obra = null;         // { key, nombre, rol }
let arts = [], movs = [];
let personal = [];       // quienes retiraron en esta obra (para sugerir en "Retira")
let puede = false;       // carga movimientos
const vista = { tab: 'stock', q: '', modo: 'todos', cat: '', mes: mesDe(hoyISO()), fMov: 'todos' };

// ─── Arranque ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!yo) return;
  $('hdr-name').textContent = yo.nombre;
  $('nombre').textContent = sinTitulo(yo.nombre).split(' ')[0];
  const h = new Date().getHours();
  $('saludo').textContent = h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  $('btn-logout').addEventListener('click', () => { localStorage.removeItem('vimeco_session'); window.location.href = 'index.html'; });
  $('btn-back').addEventListener('click', () => { location.hash = ''; });
  $('hdr-brand').addEventListener('click', () => { if (alc && alc.obras.length > 1) location.hash = ''; });
  document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = icSvg(el.dataset.ic); });
  $('btn-exportar').innerHTML = icSvg('share') + '<span>Exportar</span>';
  $('btn-cfg').innerHTML = icSvg('building') + 'Obras y permisos';
  $('btn-usr').innerHTML = icSvg('users') + 'Usuarios';
  $('mes-prev').innerHTML = icSvg('chevL');
  $('mes-next').innerHTML = icSvg('chevR');
  document.querySelector('[data-tab="stock"]').innerHTML = icSvg('box') + 'Stock';
  document.querySelector('[data-tab="movs"]').innerHTML = icSvg('list') + 'Movimientos';
  enlazar();
  iniciar();
});

async function iniciar() {
  mostrar('cargando');
  $('cargando').textContent = 'Cargando…';
  try {
    alc = await alcancePanol(yo.codigo);
  } catch (err) {
    $('cargando').innerHTML = `No se pudo cargar. Revisá la conexión.<br><button type="button" class="foc-btn foc-btn--edit" style="margin-top:.8rem" id="reint">${icSvg('rotate')}Reintentar</button>`;
    $('reint').onclick = iniciar;
    return;
  }
  if (!alc.obras.length && !alc.admin) {
    $('cargando').innerHTML = `<div class="pn-vacio"><span class="pn-sq t-gr">${icSvg('lock')}</span>
      <b>Todavía no tenés ningún pañol asignado.</b><br>Pedile a quien administra que te anote como pañolero de una obra
      o para ver su stock.</div>`;
    return;
  }
  window.addEventListener('hashchange', rutear);
  rutear();
}

function mostrar(id) {
  ['cargando', 'vista-obras', 'vista-obra'].forEach(x => $(x).classList.toggle('hidden', x !== id));
}

function rutear() {
  const m = /o=([^&]+)/.exec(location.hash);
  const key = m && decodeURIComponent(m[1]);
  const unica = alc.obras.length === 1 && !alc.admin;
  if (unica) return abrirObra(alc.obras[0].key);
  if (key && alc.obras.some(o => o.key === key)) return abrirObra(key);
  pintarObras();
}

// ─── Selector de obras ──────────────────────────────
async function pintarObras() {
  obra = null;
  $('btn-back').classList.add('hidden');
  mostrar('vista-obras');
  $('cfg-link').classList.toggle('hidden', !alc.admin);
  const nombreDe = c => { const u = (alc.usuarios || []).find(x => x.codigo === c); return u ? u.nombre : null; };
  const pintar = res => {
    if (!alc.obras.length) {
      $('obras-grid').innerHTML = `<div class="pn-vacio" style="grid-column:1/-1"><span class="pn-sq">${icSvg('building')}</span>
        Todavía no hay obras.<br>Creá la primera desde <b>Obras y permisos</b>, y a la gente desde <b>Usuarios</b>.</div>`;
      return;
    }
    $('obras-grid').innerHTML = alc.obras.map(o => {
      const r = res && res[o.key];
      const sub = !res ? '…' : r && r.articulos ? plural(r.articulos, 'material', 'materiales') : 'Sin materiales cargados';
      const rol = o.rol === 'panolero' ? '<span class="pn-rol pn-rol--edit">Cargás vos</span>'
        : o.rol === 'ver' ? '<span class="pn-rol pn-rol--edit">Cargás vos</span>'
        : `<span class="pn-rol${o.panolero ? '' : ' pn-tag--falta'}">${o.panolero ? 'Pañolero: ' + esc(sinTitulo(nombreDe(o.panolero) || o.panolero)) : 'Sin pañolero'}</span>`;
      const badge = r && r.faltan ? `<span class="menu-card-badge">${r.faltan} ${r.faltan === 1 ? 'falta' : 'faltan'}</span>` : '';
      return `<a href="#o=${encodeURIComponent(o.key)}" class="menu-card">
        <div class="menu-card-icon">${icSvg('building')}${badge}</div>
        <div class="menu-card-title">${esc(o.nombre)}</div>
        <div class="menu-card-sub">${sub}</div>${rol}</a>`;
    }).join('');
  };
  pintar(null);
  if (alc.admin && !alc.usuarios) {
    try { alc.usuarios = await getAllUsuarios(); } catch (_) { alc.usuarios = []; }
  }
  try { pintar(await getResumenPanoles(alc.obras.map(o => o.key))); } catch (_) { pintar({}); }
}

// ─── Una obra ───────────────────────────────────────
async function abrirObra(key, silencioso) {
  const o = alc.obras.find(x => x.key === key);
  if (!o) return pintarObras();
  if (!obra || obra.key !== key) {
    vista.q = ''; vista.modo = 'todos'; vista.cat = ''; vista.tab = 'stock';
    $('buscar').value = '';
  }
  obra = o;
  puede = o.rol === 'panolero' || o.rol === 'ver' || o.rol === 'admin';
  $('btn-back').classList.toggle('hidden', alc.obras.length === 1 && !alc.admin);
  if (!silencioso) { mostrar('cargando'); $('cargando').textContent = 'Cargando el pañol de ' + o.nombre + '…'; }
  try {
    ({ articulos: arts, movimientos: movs, personal } = await getPanol(key));
  } catch (err) {
    mostrar('cargando');
    $('cargando').innerHTML = `No se pudo cargar el pañol. Revisá la conexión.<br><button type="button" class="foc-btn foc-btn--edit" style="margin-top:.8rem" id="reint">${icSvg('rotate')}Reintentar</button>`;
    $('reint').onclick = () => abrirObra(key);
    return;
  }
  mostrar('vista-obra');
  pintarObra();
}

const recargar = () => abrirObra(obra.key, true);

function pintarObra() {
  document.title = 'Pañol · ' + obra.nombre;
  $('obra-nombre').textContent = obra.nombre;
  const activos = arts.filter(a => a.activo);
  const nf = activos.filter(falta).length;
  $('cnt-arts').innerHTML = `<b>${activos.length}</b> ${activos.length === 1 ? 'material' : 'materiales'}`;
  $('cnt-falta').innerHTML = `<b>${nf}</b> ${nf === 1 ? 'falta' : 'faltan'}`;
  $('cnt-falta').classList.toggle('hidden', !nf);
  $('cnt-ro').innerHTML = icSvg('eye') + 'Solo lectura';
  $('cnt-ro').classList.toggle('hidden', puede);
  $('acciones').classList.toggle('hidden', !puede);
  document.querySelectorAll('.pn-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === vista.tab)));
  $('tab-stock').classList.toggle('hidden', vista.tab !== 'stock');
  $('tab-movs').classList.toggle('hidden', vista.tab !== 'movs');
  if (vista.tab === 'stock') pintarStock(); else pintarMovs();
}

// ─── Stock ──────────────────────────────────────────
function pintarStock() {
  document.querySelectorAll('#seg-stock button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === vista.modo)));
  const activos = arts.filter(a => a.activo);
  const cats = [...new Set(activos.map(a => a.categoria || 'Varios'))].sort((a, b) => a.localeCompare(b, 'es'));
  if (vista.cat && !cats.includes(vista.cat)) vista.cat = '';
  $('cats').innerHTML = cats.length > 1
    ? [['', 'Todas'], ...cats.map(c => [c, c])].map(([v, t]) => `<button type="button" data-cat="${esc(v)}" aria-pressed="${v === vista.cat}">${esc(t)}</button>`).join('')
    : '';

  const q = normTxt(vista.q);
  // Los dados de baja sólo aparecen buscándolos.
  let lista = arts.filter(a => q ? normTxt(a.nombre + ' ' + (a.categoria || '')).includes(q) : a.activo);
  if (vista.modo === 'falta') lista = lista.filter(falta);
  if (vista.cat) lista = lista.filter(a => (a.categoria || 'Varios') === vista.cat);

  const cont = $('lista-stock');
  if (!arts.length) {
    cont.innerHTML = `<div class="pn-vacio"><span class="pn-sq">${icSvg('box')}</span>
      Todavía no hay materiales en este pañol.${puede ? '<br>Cargá el primer <b>Ingreso</b> con lo que hay hoy en la obra.' : ''}
      ${puede ? `<br><button type="button" class="foc-btn foc-btn--gen" data-acc="ingreso">${icSvg('in')}Cargar ingreso</button>` : ''}</div>`;
    return;
  }
  if (!lista.length) {
    cont.innerHTML = `<div class="pn-vacio">${vista.modo === 'falta' && !q ? 'No falta nada: todo tiene stock y está por encima del mínimo.' : 'No hay materiales que coincidan.'}</div>`;
    return;
  }
  const grupos = {};
  lista.forEach(a => { (grupos[a.categoria || 'Varios'] = grupos[a.categoria || 'Varios'] || []).push(a); });
  cont.innerHTML = '<div class="pn-rows">' + Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'es')).map(c => {
    const items = grupos[c].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return `<div class="pn-cat-h">${esc(c)} <span class="n">${items.length}</span></div>` + items.map(filaArt).join('');
  }).join('') + '</div>';
}

function filaArt(a) {
  const f = falta(a);
  const tag = !a.activo ? '<span class="pn-tag pn-tag--baja">De baja</span>'
    : a.stock <= 0 ? '<span class="pn-tag pn-tag--cero">Sin stock</span>'
    : f ? '<span class="pn-tag pn-tag--falta">Bajo mínimo</span>' : '';
  const l2 = [a.minimo ? `Mín. ${fmtN(a.minimo)}` : '', tag].filter(Boolean).join(' · ') || '&nbsp;';
  return `<button type="button" class="pn-r${f ? ' falta' : ''}${a.activo ? '' : ' baja'}" data-art="${esc(a.id)}">
    <span class="pn-sq ${f ? 't-falta' : ''}">${icSvg('box')}</span>
    <span class="mid"><span class="nm">${esc(a.nombre)}</span><span class="l2">${l2}</span></span>
    <span class="qty"><b>${fmtN(a.stock)}</b><span>${esc(a.unidad || 'u')}</span></span></button>`;
}

// ─── Movimientos ────────────────────────────────────
function movsDelMes() {
  return movs.filter(m => (m.fecha || '').startsWith(vista.mes)).filter(m =>
    vista.fMov === 'todos' ? true
    : vista.fMov === 'ingreso' ? (m.tipo === 'ingreso' || m.tipo === 'traspaso_in')
    : vista.fMov === 'salida' ? (m.tipo === 'salida' || m.tipo === 'traspaso_out')
    : m.tipo === 'ajuste');
}

function tituloMov(m) {
  if (m.tipo === 'traspaso_out') return 'Pasó a ' + (m.otraObra ? m.otraObra.nombre : 'otra obra');
  if (m.tipo === 'traspaso_in') return 'Llegó de ' + (m.otraObra ? m.otraObra.nombre : 'otra obra');
  return TIPOS[m.tipo].t;
}

function metaMov(m) {
  const p = [];
  if (m.tipo === 'ingreso') { if (m.proveedor) p.push(m.proveedor); if (m.remito) p.push('Remito ' + m.remito); }
  if (m.tipo === 'salida') { if (m.retira) p.push('Retiró ' + m.retira); if (m.destino) p.push(m.destino); }
  if (m.por && m.por.nombre) p.push('cargó ' + sinTitulo(m.por.nombre));
  return p;
}

function itemsTxt(m, max = 4) {
  const its = m.items || [];
  const txt = its.slice(0, max).map(it => {
    const c = m.tipo === 'ajuste' ? fmtSig(it.cant) : fmtN(it.cant);
    return `<span>${esc(it.nombre)} <b>${c}</b> ${esc(it.unidad || '')}</span>`;
  }).join(' · ');
  return txt + (its.length > max ? ` · y ${its.length - max} más` : '');
}

function pintarMovs() {
  $('mes-lbl').textContent = nombreMes(vista.mes);
  $('mes-next').disabled = vista.mes >= mesDe(hoyISO());
  document.querySelectorAll('#seg-movs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === vista.fMov)));
  const lista = movsDelMes();
  const cont = $('lista-movs');
  if (!lista.length) {
    cont.innerHTML = `<div class="pn-vacio">No hay movimientos ${vista.fMov === 'todos' ? '' : 'de este tipo '}en ${nombreMes(vista.mes).toLowerCase()}.</div>`;
    return;
  }
  let dia = '', html = '';
  lista.forEach(m => {
    if (m.fecha !== dia) { dia = m.fecha; html += `<div class="pn-dia">${esc(fechaLarga(dia))}</div>`; }
    const T = TIPOS[m.tipo];
    html += `<button type="button" class="pn-mov${m.anulado ? ' anulado' : ''}" data-mov="${esc(m.id)}">
      <span class="pn-sq ${T.tone}">${icSvg(T.ic)}</span>
      <span class="mid">
        <span class="l1"><b>${esc(tituloMov(m))}</b>${m.anulado ? '<span class="pn-tag pn-tag--baja">Anulado</span>' : ''}<span class="hr">${hora(m.ts)}</span></span>
        <span class="its" style="display:block">${itemsTxt(m)}</span>
        <span class="meta" style="display:block">${esc(metaMov(m).join(' · '))}</span>
      </span></button>`;
  });
  cont.innerHTML = html;
}

// ─── Eventos de la página ───────────────────────────
function enlazar() {
  document.querySelector('.pn-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    vista.tab = b.dataset.tab;
    pintarObra();
  });
  $('buscar').addEventListener('input', e => { vista.q = e.target.value; pintarStock(); });
  $('seg-stock').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (b) { vista.modo = b.dataset.f; pintarStock(); }
  });
  $('cats').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (b) { vista.cat = b.dataset.cat; pintarStock(); }
  });
  $('cnt-falta').addEventListener('click', () => { vista.tab = 'stock'; vista.modo = 'falta'; pintarObra(); });
  $('seg-movs').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (b) { vista.fMov = b.dataset.f; pintarMovs(); }
  });
  $('mes-prev').addEventListener('click', () => { vista.mes = sumarMes(vista.mes, -1); pintarMovs(); });
  $('mes-next').addEventListener('click', () => { vista.mes = sumarMes(vista.mes, 1); pintarMovs(); });
  $('lista-stock').addEventListener('click', e => {
    const b = e.target.closest('[data-art]');
    if (b) fichaArticulo(arts.find(a => a.id === b.dataset.art));
  });
  $('lista-movs').addEventListener('click', e => {
    const b = e.target.closest('[data-mov]');
    if (b) fichaMovimiento(movs.find(m => m.id === b.dataset.mov));
  });
  document.querySelector('#vista-obra').addEventListener('click', e => {
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    const acc = b.dataset.acc;
    if (acc === 'mas') menuMas();
    else formMovimiento(acc);
  });
  $('btn-exportar').addEventListener('click', dlgExportar);
  $('btn-cfg').addEventListener('click', dlgConfig);
  $('btn-usr').addEventListener('click', dlgUsuarios);
  $('dlg-ov').addEventListener('mousedown', e => { if (e.target === $('dlg-ov') && !dlgEstado.fijo) cerrarDlg(); });
  // (Con una confirmación abierta encima, su propio Escape corta el evento antes de llegar acá.)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('dlg-ov').classList.contains('hidden')) cerrarDlg();
  });
}

// ─── Diálogo genérico ───────────────────────────────
const dlgEstado = { fijo: false };
function abrirDlg({ tono = '', icono = 'box', titulo, sub = '', cuerpo, fijo = false }) {
  dlgEstado.fijo = fijo;
  // Un elemento nuevo por diálogo: así no se acumulan los listeners del anterior.
  const viejo = $('dlg'), d = viejo.cloneNode(false);
  viejo.replaceWith(d);
  d.innerHTML = `<div class="eq-dlg-h"><span class="pn-sq ${tono}">${icSvg(icono)}</span>
      <div><h2 id="dlg-t">${esc(titulo)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <button type="button" class="modal-close" data-cerrar aria-label="Cerrar">${icSvg('x')}</button></div>${cuerpo}`;
  d.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) cerrarDlg(); });
  $('dlg-ov').classList.remove('hidden');
  d.scrollTop = 0;
  return d;
}
function cerrarDlg() {
  $('dlg-ov').classList.add('hidden');
  $('dlg').innerHTML = '';
}

// ─── Ficha de un material ───────────────────────────
function fichaArticulo(a) {
  if (!a) return;
  const f = falta(a);
  const hist = movs.filter(m => !m.anulado && (m.items || []).some(it => it.id === a.id)).slice(0, 15);
  const ult = t => { const m = movs.find(x => !x.anulado && t.includes(x.tipo) && x.items.some(it => it.id === a.id)); return m ? fechaLarga(m.fecha) : '—'; };
  // Quien carga corrige el stock acá mismo: se guarda como un Ajuste de inventario.
  const ajusta = puede && a.activo;
  const d = abrirDlg({
    tono: f ? 't-falta' : '', icono: 'box', titulo: a.nombre,
    sub: esc(a.categoria || 'Varios') + (a.activo ? '' : ' · <b>dado de baja</b>'),
    cuerpo: `
      ${ajusta ? `<div class="pn-aj">
        <label class="pn-aj-lbl" for="fa-real">Quedan</label>
        <div class="pn-aj-row">
          <label class="pn-big pn-big--in${f ? ' falta' : ''}"><input id="fa-real" inputmode="decimal" enterkeyhint="done" autocomplete="off"
            value="${String(a.stock).replace('.', ',')}"><span>${esc(a.unidad || 'u')}</span></label>
          <button type="button" class="foc-btn foc-btn--vio" id="fa-aj" disabled>${icSvg('checkSm')}Ajustar</button>
        </div>
        <div class="pn-aj-sub" id="fa-aj-sub">Sistema: ${fmtN(a.stock)} ${esc(a.unidad || 'u')}</div>
        <div class="pn-err hidden" id="fa-aj-err"></div>
      </div>` : `<div class="pn-big${f ? ' falta' : ''}"><b>${fmtN(a.stock)}</b><span>${esc(a.unidad || 'u')} en el pañol</span></div>`}
      <div class="pn-kv" style="margin-top:.6rem">
        <span>Mínimo</span><b>${a.minimo ? fmtN(a.minimo) + ' ' + esc(a.unidad || 'u') + (f ? ' · <span style="color:#b02a2a">faltan ' + fmtN(a.minimo - a.stock) + '</span>' : '') : 'Sin mínimo'}</b>
        <span>Último ingreso</span><b>${ult(['ingreso', 'traspaso_in'])}</b>
        <span>Última salida</span><b>${ult(['salida', 'traspaso_out'])}</b>
      </div>
      <div class="pn-sec-t">Últimos movimientos</div>
      <div class="pn-hist">${hist.length ? hist.map(m => {
        const it = m.items.find(x => x.id === a.id);
        const c = m.tipo === 'ajuste' ? it.cant : TIPOS[m.tipo].signo * it.cant;
        const det = [tituloMov(m), m.tipo === 'salida' ? m.retira || m.destino : m.tipo === 'ingreso' ? m.proveedor : ''].filter(Boolean).join(' · ');
        return `<div><span class="f">${fechaCorta(m.fecha)}</span><span class="d">${esc(det)}</span><span class="c ${c >= 0 ? 'mas' : 'menos'}">${fmtSig(c)}</span></div>`;
      }).join('') : '<div><span class="d">Sin movimientos.</span></div>'}</div>
      ${puede ? `<div class="eq-dlg-f">
        <button type="button" class="foc-btn foc-btn--clear" data-a="editar">${icSvg('edit')}Editar</button>
        ${a.activo ? `<button type="button" class="foc-btn foc-btn--gen" data-a="ingreso">${icSvg('in')}Ingreso</button>
        <button type="button" class="foc-btn foc-btn--warn" data-a="salida">${icSvg('out')}Salida</button>` : ''}
      </div>` : ''}`
  });
  d.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'editar') formArticulo(a);
    else formMovimiento(b.dataset.a, a);
  });
  if (!ajusta) return;

  const inp = $('fa-real'), btn = $('fa-aj');
  const unidad = esc(a.unidad || 'u');
  const leer = () => parseN(inp.value);
  inp.addEventListener('focus', () => inp.select());
  setTimeout(() => inp.focus(), 50);
  inp.addEventListener('input', () => {
    const n = leer(), dif = Math.round((n - a.stock) * 1000) / 1000;
    btn.disabled = !(n >= 0) || dif === 0;
    $('fa-aj-err').classList.add('hidden');
    $('fa-aj-sub').innerHTML = `Sistema: ${fmtN(a.stock)} ${unidad}` +
      (n >= 0 && dif ? ` · <b class="${dif > 0 ? 'mas' : 'menos'}">diferencia ${fmtSig(dif)}</b>` : '');
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) { e.preventDefault(); btn.click(); } });
  btn.onclick = async () => {
    const n = leer();
    if (!(n >= 0)) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Guardando…';
    try {
      await registrarMovimiento(obra.key, { tipo: 'ajuste', fecha: hoyISO(), por: yo, items: [{ id: a.id, contado: n }] });
      showToast(`${a.nombre}: ${fmtN(n)} ${a.unidad || 'u'}`, 'success');
      cerrarDlg();
      recargar();
    } catch (e) {
      const er = $('fa-aj-err');
      er.textContent = 'No se pudo guardar: ' + e.message + '. Revisá la conexión y probá de nuevo.';
      er.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = icSvg('checkSm') + 'Ajustar';
    }
  };
}

// ─── Alta / edición de un material ──────────────────
function datalist(id, valores) {
  return `<datalist id="${id}">${[...new Set(valores.filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
}
// Las de la lista fija primero, en su orden; después las que se escribieron a mano en otros materiales.
const unidadesConocidas = () => [...new Set([...UNIDADES, ...arts.map(a => a.unidad)].filter(Boolean))];
const catsConocidas = () => [...new Set([...arts.map(a => a.categoria), ...CATEGORIAS].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

/* Desplegable propio para un campo de texto con sugerencias. El <datalist> no sirve acá:
   con el campo ya cargado sólo muestra lo que coincide (o nada), y en varios celulares ni se abre.
   Al enfocar muestra todas; al escribir, filtra. Igual se puede escribir una nueva. */
function comboLista(input, valores) {
  const box = document.createElement('div');
  box.className = 'pn-pick-res hidden';
  input.insertAdjacentElement('afterend', box);
  let filtradas = [], sel = -1;
  function pintar(todas) {
    const q = todas ? '' : normTxt(input.value);
    filtradas = valores.filter(v => !q || normTxt(v).includes(q));
    if (!filtradas.length) { box.classList.add('hidden'); return; }
    box.innerHTML = filtradas.map((v, i) => `<button type="button" class="${i === sel ? 'on' : ''}" data-v="${i}"><b>${esc(v)}</b></button>`).join('');
    box.classList.remove('hidden');
    box.scrollIntoView({ block: 'nearest' });
  }
  const elegir = i => { if (filtradas[i] == null) return; input.value = filtradas[i]; box.classList.add('hidden'); sel = -1; };
  input.addEventListener('focus', () => { sel = -1; pintar(true); });
  input.addEventListener('click', () => { if (box.classList.contains('hidden')) pintar(true); });
  input.addEventListener('input', () => { sel = -1; pintar(false); });
  input.addEventListener('keydown', e => {
    if (box.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, filtradas.length - 1); pintar(!input.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); pintar(!input.value); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); elegir(sel); }
    else if (e.key === 'Escape') { e.stopPropagation(); box.classList.add('hidden'); }
  });
  box.addEventListener('mousedown', e => e.preventDefault());
  box.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) elegir(+b.dataset.v); });
  input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 120));
}

function formArticulo(a) {
  const nuevo = !a;
  const d = abrirDlg({
    icono: nuevo ? 'plus' : 'edit', titulo: nuevo ? 'Nuevo material' : 'Editar material',
    sub: nuevo ? 'Queda en 0: el stock se suma con un Ingreso.' : 'El stock no se toca acá: se corrige en la ficha, en "Quedan".',
    fijo: true,
    cuerpo: `
      <div class="form-group"><label for="fa-nombre">Nombre *</label>
        <input id="fa-nombre" class="form-control" value="${esc(a ? a.nombre : '')}" placeholder="Ej: Cemento Loma Negra 50 kg" autocomplete="off"></div>
      <div class="pn-row2">
        <div class="form-group"><label for="fa-unidad">Unidad</label>
          <input id="fa-unidad" class="form-control" value="${esc(a ? a.unidad : 'u')}" autocomplete="off"></div>
        <div class="form-group"><label for="fa-minimo">Stock mínimo</label>
          <input id="fa-minimo" class="form-control" inputmode="decimal" value="${a && a.minimo ? fmtN(a.minimo) : ''}" placeholder="0 = sin aviso"></div>
      </div>
      <div class="form-group"><label for="fa-cat">Categoría</label>
        <input id="fa-cat" class="form-control" value="${esc(a ? a.categoria || '' : '')}" placeholder="Elegí o escribí una" autocomplete="off"></div>
      <div class="pn-err hidden" id="fa-err"></div>
      <div class="eq-dlg-f">
        ${!nuevo ? `<button type="button" class="foc-btn ${a.activo ? 'foc-btn--del' : 'foc-btn--gen'}" id="fa-baja">${icSvg(a.activo ? 'slash' : 'undo')}${a.activo ? 'Dar de baja' : 'Reactivar'}</button>` : ''}
        <button type="button" class="foc-btn foc-btn--clear" data-cerrar>Cancelar</button>
        <button type="button" class="foc-btn foc-btn--edit" id="fa-ok">${icSvg('checkSm')}${nuevo ? 'Crear' : 'Guardar'}</button>
      </div>`
  });
  comboLista($('fa-unidad'), unidadesConocidas());
  comboLista($('fa-cat'), catsConocidas());
  setTimeout(() => $('fa-nombre').focus(), 50);
  const err = m => { $('fa-err').textContent = m; $('fa-err').classList.remove('hidden'); };
  $('fa-ok').onclick = async () => {
    const nombre = $('fa-nombre').value.trim().replace(/\s+/g, ' ');
    const minimo = $('fa-minimo').value.trim() ? parseN($('fa-minimo').value) : 0;
    if (!nombre) return err('Poné el nombre del material.');
    if (!(minimo >= 0)) return err('El mínimo tiene que ser un número.');
    const dup = arts.find(x => x.id !== (a && a.id) && normTxt(x.nombre) === normTxt(nombre));
    if (dup) return err(`Ya existe "${dup.nombre}"${dup.activo ? '' : ' (dado de baja: buscalo y reactivalo)'}.`);
    const datos = { nombre, unidad: $('fa-unidad').value.trim() || 'u', categoria: $('fa-cat').value.trim() || 'Varios', minimo };
    $('fa-ok').disabled = true;
    try {
      if (nuevo) await crearArticulo(obra.key, datos);
      else await patchArticulo(obra.key, a.id, datos);
      showToast(nuevo ? 'Material creado' : 'Cambios guardados', 'success');
      cerrarDlg();
      recargar();
    } catch (e) { err('No se pudo guardar: ' + e.message); $('fa-ok').disabled = false; }
  };
  if (!nuevo) $('fa-baja').onclick = async () => {
    if (a.activo && !await showConfirm('Dar de baja', `"${a.nombre}" deja de aparecer en la lista (se encuentra buscándolo).` +
      (a.stock ? `\nTodavía figura con ${fmtN(a.stock)} ${a.unidad}.` : ''), { boton: 'Dar de baja', tono: 'del', icono: 'slash' })) return;
    try {
      await patchArticulo(obra.key, a.id, { activo: !a.activo });
      showToast(a.activo ? 'Material dado de baja' : 'Material reactivado', 'success');
      cerrarDlg();
      recargar();
    } catch (e) { err('No se pudo guardar: ' + e.message); }
  };
}

// ─── Menú "Más" ─────────────────────────────────────
function menuMas() {
  const opt = (a, tono, icono, t, s) => `<button type="button" class="pn-opt" data-o="${a}"><span class="pn-sq ${tono}">${icSvg(icono)}</span><span><b>${t}</b><small>${s}</small></span>${icSvg('chevR')}</button>`;
  const d = abrirDlg({
    icono: 'more', titulo: 'Más acciones',
    cuerpo: `<div class="pn-opts">
      ${opt('ajuste', 't-aj', 'sliders', 'Ajuste de inventario', 'Contaste y no coincide con lo que dice el sistema')}
      ${opt('traspaso', 't-tr', 'swap', 'Pasar a otra obra', 'Sale de este pañol y entra en el de la otra obra')}
      ${opt('nuevo', '', 'plus', 'Nuevo material', 'Darlo de alta con su unidad y su mínimo, sin stock')}
    </div>`
  });
  d.addEventListener('click', e => {
    const b = e.target.closest('[data-o]');
    if (!b) return;
    if (b.dataset.o === 'nuevo') formArticulo(null);
    else formMovimiento(b.dataset.o);
  });
}

// ─── Cargar un movimiento ───────────────────────────
const FORM = {
  ingreso:  { t: 'Ingreso', sub: 'Material que llegó a la obra. Si es algo nuevo, se da de alta acá mismo.', boton: 'Guardar ingreso', btn: 'foc-btn--gen' },
  salida:   { t: 'Salida', sub: 'Material entregado o consumido.', boton: 'Guardar salida', btn: 'foc-btn--warn' },
  ajuste:   { t: 'Ajuste de inventario', sub: 'Poné lo que contaste: el sistema guarda la diferencia.', boton: 'Guardar ajuste', btn: 'foc-btn--vio' },
  traspaso: { t: 'Pasar a otra obra', sub: 'Sale de este pañol y entra en el de la obra que elijas.', boton: 'Pasar', btn: 'foc-btn--edit' }
};

async function formMovimiento(tipo, artInicial) {
  const F = FORM[tipo];
  const T = TIPOS[tipo === 'traspaso' ? 'traspaso_out' : tipo];
  const lineas = [];
  const usados = campo => movs.map(m => m[campo]).filter(Boolean);
  const otrasObras = (alc.todas || []).filter(o => o.activa && o.key !== obra.key);

  let extra = '';
  if (tipo === 'ingreso') extra = `<div class="pn-row2">
      <div class="form-group"><label for="fm-prov">Proveedor / de dónde viene</label><input id="fm-prov" class="form-control" list="dl-prov" autocomplete="off">${datalist('dl-prov', usados('proveedor'))}</div>
      <div class="form-group"><label for="fm-rem">Remito Nº</label><input id="fm-rem" class="form-control" autocomplete="off" placeholder="Opcional"></div></div>`;
  if (tipo === 'salida') extra = `<div class="pn-row2">
      <div class="form-group"><label for="fm-ret">Retira</label><input id="fm-ret" class="form-control" list="dl-ret" autocomplete="off" placeholder="Quién se lo lleva">${datalist('dl-ret', personal)}</div>
      <div class="form-group"><label for="fm-dest">Para qué / dónde</label><input id="fm-dest" class="form-control" list="dl-dest" autocomplete="off" placeholder="Ej: Frente norte, cordón cuneta">${datalist('dl-dest', usados('destino'))}</div></div>`;
  if (tipo === 'traspaso') extra = `<div class="form-group"><label for="fm-obra">Obra de destino *</label>
      <select id="fm-obra" class="form-control"><option value="">Elegí la obra</option>${otrasObras.map(o => `<option value="${esc(o.key)}">${esc(o.nombre)}</option>`).join('')}</select></div>`;

  abrirDlg({
    tono: T.tone, icono: T.ic, titulo: F.t, sub: F.sub, fijo: true,
    cuerpo: `
      <div class="form-group"><label for="fm-fecha">Fecha</label><input type="date" id="fm-fecha" class="form-control" value="${hoyISO()}" max="${hoyISO()}"></div>
      ${extra}
      <div class="form-group" style="margin-bottom:.4rem"><label>Materiales</label></div>
      <div class="pn-lines" id="fm-lines"></div>
      <div class="pn-nuevo hidden" id="fm-nuevo"></div>
      <div class="pn-pick">
        <div class="pn-srch" style="margin-bottom:.7rem">${icSvg('search')}<input type="search" id="fm-pick" placeholder="${tipo === 'ingreso' ? 'Buscar o crear material…' : 'Buscar material…'}" autocomplete="off" enterkeyhint="done"></div>
        <div class="pn-pick-res hidden" id="fm-res"></div>
      </div>
      <div class="form-group"><label for="fm-nota">${tipo === 'ajuste' ? 'Motivo' : 'Nota'}</label><input id="fm-nota" class="form-control" autocomplete="off" placeholder="Opcional"></div>
      <div class="pn-err hidden" id="fm-err"></div>
      <div class="eq-dlg-f">
        <button type="button" class="foc-btn foc-btn--clear" data-cerrar>Cancelar</button>
        <button type="button" class="foc-btn ${F.btn}" id="fm-ok">${icSvg('checkSm')}${F.boton}</button>
      </div>`
  });

  const err = m => { $('fm-err').textContent = m; $('fm-err').classList.toggle('hidden', !m); };
  const artDe = id => arts.find(a => a.id === id);

  // Renglón de ayuda debajo del nombre: cuánto hay, y si la salida deja negativo.
  function subDe(l) {
    if (l.nuevo) return `<span class="nuevo">Nuevo</span> · ${esc(l.nuevo.categoria)}`;
    const a = artDe(l.id), n = parseN(l.cant);
    const hay = `${fmtN(a.stock)} ${esc(a.unidad)}`;
    if (tipo === 'ajuste') return `Sistema: ${hay}` + (n >= 0 ? ` · diferencia ${fmtSig(n - a.stock)}` : '');
    if ((tipo === 'salida' || tipo === 'traspaso') && n > a.stock) return `<span class="sub warn">Hay ${hay}: queda en ${fmtN(a.stock - n)}</span>`;
    return `Hay ${hay}`;
  }
  function pintarLineas() {
    $('fm-lines').innerHTML = lineas.map((l, i) =>
      `<div class="pn-line"><div style="min-width:0"><div class="nm">${esc(l.nombre)}</div><div class="sub" data-sub="${i}">${subDe(l)}</div></div>
        <label class="pn-qty"><input inputmode="decimal" data-i="${i}" value="${esc(l.cant)}" placeholder="${tipo === 'ajuste' ? 'Contado' : '0'}" aria-label="Cantidad de ${esc(l.nombre)}"><span>${esc(l.unidad)}</span></label>
        <button type="button" class="pn-x" data-quitar="${i}" aria-label="Quitar">${icSvg('x')}</button></div>`).join('');
  }
  const enfocarLinea = i => setTimeout(() => { const el = $('fm-lines').querySelector(`input[data-i="${i}"]`); el && el.focus(); }, 30);

  function agregar(a) {
    const ya = lineas.findIndex(l => l.id === a.id);
    if (ya >= 0) return enfocarLinea(ya);
    lineas.push({ id: a.id, nombre: a.nombre, unidad: a.unidad || 'u', cant: '' });
    pintarLineas();
    enfocarLinea(lineas.length - 1);
  }

  $('fm-lines').addEventListener('input', e => {
    const inp = e.target.closest('input[data-i]');
    if (!inp) return;
    const i = +inp.dataset.i;
    lineas[i].cant = inp.value;
    // Sólo el renglón de ayuda: rehacer el campo cerraría el teclado del teléfono.
    $('fm-lines').querySelector(`[data-sub="${i}"]`).innerHTML = subDe(lineas[i]);
  });
  $('fm-lines').addEventListener('click', e => {
    const b = e.target.closest('[data-quitar]');
    if (!b) return;
    lineas.splice(+b.dataset.quitar, 1);
    pintarLineas();
  });

  // Buscador de materiales
  let res = [], sel = 0;
  const pick = $('fm-pick');
  function pintarRes() {
    const q = normTxt(pick.value);
    if (!q) { $('fm-res').classList.add('hidden'); res = []; return; }
    const base = arts.filter(a => a.activo && normTxt(a.nombre + ' ' + (a.categoria || '')).includes(q))
      .sort((a, b) => (normTxt(a.nombre).startsWith(q) ? 0 : 1) - (normTxt(b.nombre).startsWith(q) ? 0 : 1) || a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 8);
    res = base.map(a => ({ a }));
    const exacto = arts.some(a => normTxt(a.nombre) === q);
    if (tipo === 'ingreso' && !exacto) res.push({ crear: pick.value.trim().replace(/\s+/g, ' ') });
    if (!res.length) { $('fm-res').innerHTML = '<div class="pn-vacio" style="padding:.7rem">No hay materiales con ese nombre.</div>'; $('fm-res').classList.remove('hidden'); return; }
    sel = Math.min(sel, res.length - 1);
    $('fm-res').innerHTML = res.map((r, i) => r.crear
      ? `<button type="button" class="crear${i === sel ? ' on' : ''}" data-r="${i}">${icSvg('plus')}<b>Crear "${esc(r.crear)}"</b></button>`
      : `<button type="button" class="${i === sel ? 'on' : ''}" data-r="${i}">${icSvg('box')}<b>${esc(r.a.nombre)}</b><small>${fmtN(r.a.stock)} ${esc(r.a.unidad)}</small></button>`).join('');
    $('fm-res').classList.remove('hidden');
    $('fm-res').scrollIntoView({ block: 'nearest' });
  }
  function elegir(i) {
    const r = res[i];
    if (!r) return;
    pick.value = '';
    $('fm-res').classList.add('hidden');
    if (r.crear) return altaEnLinea(r.crear);
    agregar(r.a);
  }
  pick.addEventListener('input', () => { sel = 0; pintarRes(); });
  pick.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, res.length - 1); pintarRes(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); pintarRes(); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(sel); }
  });
  $('fm-res').addEventListener('mousedown', e => e.preventDefault());
  $('fm-res').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) elegir(+b.dataset.r); });
  pick.addEventListener('blur', () => setTimeout(() => $('fm-res')?.classList.add('hidden'), 120));

  // Material nuevo dentro de un ingreso
  function altaEnLinea(nombre) {
    const box = $('fm-nuevo');
    box.innerHTML = `<div class="pn-nuevo-t">Material nuevo</div>
      <div class="form-group"><input id="fn-nombre" class="form-control" value="${esc(nombre)}" aria-label="Nombre"></div>
      <div class="pn-row2">
        <div class="form-group"><label for="fn-unidad">Unidad</label><input id="fn-unidad" class="form-control" value="u" autocomplete="off"></div>
        <div class="form-group"><label for="fn-min">Stock mínimo</label><input id="fn-min" class="form-control" inputmode="decimal" placeholder="Opcional"></div>
      </div>
      <div class="form-group"><label for="fn-cat">Categoría</label><input id="fn-cat" class="form-control" autocomplete="off" placeholder="Elegí o escribí una"></div>
      <div class="eq-dlg-f" style="margin:.1rem 0 .5rem">
        <button type="button" class="foc-btn foc-btn--clear" id="fn-no">Cancelar</button>
        <button type="button" class="foc-btn foc-btn--gen" id="fn-ok">${icSvg('plus')}Agregar</button></div>`;
    box.classList.remove('hidden');
    comboLista($('fn-unidad'), unidadesConocidas());
    comboLista($('fn-cat'), catsConocidas());
    setTimeout(() => $('fn-unidad').select(), 30);
    $('fn-no').onclick = () => { box.classList.add('hidden'); box.innerHTML = ''; };
    $('fn-ok').onclick = () => {
      const n = $('fn-nombre').value.trim().replace(/\s+/g, ' ');
      if (!n) return;
      if (arts.some(a => normTxt(a.nombre) === normTxt(n)) || lineas.some(l => normTxt(l.nombre) === normTxt(n))) {
        err(`"${n}" ya existe: buscalo en la lista.`); return;
      }
      const min = parseN($('fn-min').value);
      lineas.push({ nuevo: { nombre: n, unidad: $('fn-unidad').value.trim() || 'u', categoria: $('fn-cat').value.trim() || 'Varios', minimo: min > 0 ? min : 0 },
                    nombre: n, unidad: $('fn-unidad').value.trim() || 'u', cant: '' });
      box.classList.add('hidden'); box.innerHTML = '';
      err('');
      pintarLineas();
      enfocarLinea(lineas.length - 1);
    };
  }

  if (artInicial) agregar(artInicial);
  else setTimeout(() => pick.focus(), 60);

  $('fm-ok').onclick = async () => {
    err('');
    if (!lineas.length) return err('Agregá al menos un material.');
    for (const l of lineas) {
      const n = parseN(l.cant);
      if (tipo === 'ajuste' ? !(n >= 0) : !(n > 0)) return err(`Revisá la cantidad de "${l.nombre}".`);
    }
    const fecha = $('fm-fecha').value || hoyISO();
    const nota = $('fm-nota').value.trim();
    let destino = null;
    if (tipo === 'traspaso') {
      const o = otrasObras.find(x => x.key === $('fm-obra').value);
      if (!o) return err('Elegí la obra de destino.');
      destino = { key: o.key, nombre: o.nombre };
    }
    if (tipo === 'salida' || tipo === 'traspaso') {
      const negativos = lineas.filter(l => parseN(l.cant) > artDe(l.id).stock);
      if (negativos.length && !await showConfirm('Va a quedar en negativo',
        negativos.map(l => `${l.nombre}: hay ${fmtN(artDe(l.id).stock)}, sale ${fmtN(parseN(l.cant))}`).join('\n') +
        '\n\nSi falta cargar un ingreso, cargalo después. ¿Guardo igual?', { boton: 'Guardar igual', tono: 'warn', icono: 'alert' })) return;
    }
    const items = lineas.map(l => {
      const n = parseN(l.cant);
      const it = l.id ? { id: l.id } : { nuevo: l.nuevo };
      if (tipo === 'ajuste') it.contado = n; else it.cant = n;
      return it;
    });
    if (tipo === 'ajuste' && items.every(it => artDe(it.id).stock === it.contado)) return err('Lo contado coincide con el sistema: no hay nada que ajustar.');

    const btn = $('fm-ok');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Guardando…';
    try {
      if (tipo === 'traspaso') {
        await registrarTraspaso({ key: obra.key, nombre: obra.nombre }, destino, { fecha, por: yo, nota, items });
      } else {
        const mov = { tipo, fecha, por: yo, items };
        if (nota) mov.nota = nota;
        if (tipo === 'ingreso') {
          const p = $('fm-prov').value.trim(), r = $('fm-rem').value.trim();
          if (p) mov.proveedor = p;
          if (r) mov.remito = r;
        }
        if (tipo === 'salida') {
          // Si ya retiró antes, se guarda como figura ("juan perez" → "Juan Pérez").
          let r = $('fm-ret').value.trim().replace(/\s+/g, ' ');
          const d = $('fm-dest').value.trim();
          r = personal.find(p => normTxt(p) === normTxt(r)) || r;
          if (r) mov.retira = r;
          if (d) mov.destino = d;
        }
        await registrarMovimiento(obra.key, mov);
      }
      showToast(tipo === 'traspaso' ? `Pasado a ${destino.nombre}` : `${F.t} guardado`, 'success');
      cerrarDlg();
      recargar();
    } catch (e) {
      err('No se pudo guardar: ' + e.message + '. Revisá la conexión y probá de nuevo.');
      btn.disabled = false;
      btn.innerHTML = icSvg('checkSm') + F.boton;
    }
  };
}

// ─── Ficha de un movimiento ─────────────────────────
function fichaMovimiento(m) {
  if (!m) return;
  const T = TIPOS[m.tipo];
  const kv = [['Fecha', fechaLarga(m.fecha) + (m.ts ? ' · cargado ' + new Date(m.ts).toLocaleDateString('es-AR') + ' ' + hora(m.ts) : '')]];
  if (m.proveedor) kv.push(['Proveedor', m.proveedor]);
  if (m.remito) kv.push(['Remito', m.remito]);
  if (m.retira) kv.push(['Retiró', m.retira]);
  if (m.destino) kv.push(['Para', m.destino]);
  if (m.otraObra) kv.push([m.tipo === 'traspaso_out' ? 'Hacia' : 'Desde', m.otraObra.nombre]);
  if (m.nota) kv.push([m.tipo === 'ajuste' ? 'Motivo' : 'Nota', m.nota]);
  if (m.por) kv.push(['Cargó', m.por.nombre]);
  if (m.anulado) kv.push(['Anulado', `por ${m.anulado.por ? m.anulado.por.nombre : '—'} el ${new Date(m.anulado.ts).toLocaleDateString('es-AR')}`]);
  const d = abrirDlg({
    tono: T.tone, icono: T.ic, titulo: tituloMov(m), sub: m.anulado ? '<b style="color:#b02a2a">Anulado: no cuenta en el stock</b>' : '',
    cuerpo: `<div class="pn-kv">${kv.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}</div>
      <div class="pn-sec-t">Materiales</div>
      <div class="pn-hist">${m.items.map(it => `<div><span class="d" style="color:var(--gray-700)">${esc(it.nombre)}${m.tipo === 'ajuste' ? ` <small style="color:var(--gray-500)">(había ${fmtN(it.antes)}, se contó ${fmtN(it.contado)})</small>` : ''}</span>
        <span class="c ${m.tipo === 'ajuste' ? (it.cant >= 0 ? 'mas' : 'menos') : T.signo > 0 ? 'mas' : 'menos'}">${m.tipo === 'ajuste' ? fmtSig(it.cant) : fmtSig(T.signo * it.cant)} ${esc(it.unidad || '')}</span></div>`).join('')}</div>
      ${puede && !m.anulado ? `<div class="eq-dlg-f"><button type="button" class="foc-btn foc-btn--del" id="fmv-anular">${icSvg('undo')}Anular movimiento</button></div>` : ''}`
  });
  const b = d.querySelector('#fmv-anular');
  if (b) b.onclick = async () => {
    const msg = m.otraObra ? `Se anula también en ${m.otraObra.nombre} y el stock vuelve como estaba en las dos obras.` : 'El stock vuelve a como estaba antes de este movimiento. Queda tachado en la lista.';
    if (!await showConfirm('Anular movimiento', msg, { boton: 'Anular', tono: 'del', icono: 'undo' })) return;
    b.disabled = true;
    try {
      await anularMovimiento(obra.key, m, yo);
      showToast('Movimiento anulado', 'success');
      cerrarDlg();
      recargar();
    } catch (e) { showToast('No se pudo anular: ' + e.message, 'error'); b.disabled = false; }
  };
}

// ─── Exportar (PDF / Excel, para mandar por WhatsApp) ─
function dlgExportar() {
  precargarExport();
  const nm = movs.filter(m => (m.fecha || '').startsWith(vista.mes)).length;
  const cats = [...new Set(arts.filter(a => a.activo).map(a => a.categoria || 'Varios'))].sort((a, b) => a.localeCompare(b, 'es'));
  // Arranca en la categoría que se está mirando: así "Pinturas → Exportar" sale directo.
  const sel = { que: 'stock', fmt: 'pdf', cat: cats.includes(vista.cat) ? vista.cat : '' };
  const opt = (grupo, v, icono, tono, t, s, dis) => `<button type="button" class="pn-opt" data-g="${grupo}" data-v="${v}" aria-pressed="${sel[grupo] === v}"${dis ? ' disabled style="opacity:.45"' : ''}>
    <span class="pn-sq ${tono}">${icSvg(icono)}</span><span><b>${t}</b><small>${s}</small></span><span class="rad"></span></button>`;
  // Las opciones de stock y faltantes cuentan sólo la categoría elegida.
  const opciones = () => {
    const act = arts.filter(a => a.activo && (!sel.cat || (a.categoria || 'Varios') === sel.cat));
    const nf = act.filter(falta).length;
    if (sel.que === 'falta' && !nf) sel.que = 'stock';
    const de = sel.cat ? ' de ' + sel.cat.toLowerCase() : '';
    return `${opt('que', 'stock', 'box', '', sel.cat ? 'Stock' + de : 'Stock completo', plural(act.length, 'material', 'materiales') + ' con su cantidad y mínimo')}
        ${opt('que', 'falta', 'alert', 't-falta', 'Lo que falta' + de, nf ? plural(nf, 'material bajo mínimo', 'materiales bajo mínimo') + ', con cuánto pedir' : 'No hay nada bajo mínimo', !nf)}
        ${opt('que', 'movs', 'list', 't-in', 'Movimientos de ' + nombreMes(vista.mes).toLowerCase(), nm ? plural(nm, 'movimiento', 'movimientos') + (sel.cat ? ' (de todas las categorías)' : '') : 'No hay movimientos ese mes', !nm)}`;
  };
  const chipsCat = () => [['', 'Todas'], ...cats.map(c => [c, c])]
    .map(([v, t]) => `<button type="button" data-xcat="${esc(v)}" aria-pressed="${v === sel.cat}">${esc(t)}</button>`).join('');
  const d = abrirDlg({
    tono: 't-gr', icono: 'share', titulo: 'Exportar', sub: 'Se genera el archivo y, en el celular, se abre para mandarlo por WhatsApp.',
    cuerpo: `${cats.length > 1 ? `<div class="pn-sec-t" style="margin-top:0">Categoría</div><div class="pn-cats pn-cats--wrap" id="ex-cat">${chipsCat()}</div>` : ''}
      <div class="pn-sec-t"${cats.length > 1 ? '' : ' style="margin-top:0"'}>Qué</div><div class="pn-opts" id="ex-que">${opciones()}</div>
      <div class="pn-sec-t">Formato</div>
      <div class="pn-seg" id="ex-fmt"><button type="button" data-f="pdf" aria-pressed="true">PDF</button><button type="button" data-f="xlsx" aria-pressed="false">Excel</button></div>
      <div class="eq-dlg-f">
        <button type="button" class="foc-btn foc-btn--clear" data-cerrar>Cancelar</button>
        <button type="button" class="foc-btn foc-btn--edit" id="ex-ok">${icSvg('share')}${puedeCompartir() ? 'Compartir' : 'Descargar'}</button>
      </div>`
  });
  d.addEventListener('click', e => {
    const c = e.target.closest('[data-xcat]');
    if (c) {
      sel.cat = c.dataset.xcat;
      $('ex-cat').innerHTML = chipsCat();
      $('ex-que').innerHTML = opciones();
      return;
    }
    const o = e.target.closest('[data-g]');
    if (o && !o.disabled) {
      sel[o.dataset.g] = o.dataset.v;
      d.querySelectorAll(`[data-g="${o.dataset.g}"]`).forEach(x => x.setAttribute('aria-pressed', String(x === o)));
    }
    const f = e.target.closest('#ex-fmt [data-f]');
    if (f) {
      sel.fmt = f.dataset.f;
      d.querySelectorAll('#ex-fmt [data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === f)));
    }
  });
  $('ex-ok').onclick = async () => {
    const b = $('ex-ok');
    b.disabled = true;
    b.innerHTML = '<span class="spinner"></span> Generando…';
    try {
      const datos = { que: sel.que, cat: sel.que === 'movs' ? '' : sel.cat, obra: obra.nombre, arts, movs: movs.filter(m => (m.fecha || '').startsWith(vista.mes)),
                      mes: vista.mes, mesNombre: nombreMes(vista.mes), por: yo.nombre };
      const file = sel.fmt === 'pdf' ? await panolPDF(datos) : await panolExcel(datos);
      await compartirOBajar(file, `Pañol ${obra.nombre}`);
      cerrarDlg();
    } catch (e) {
      showToast('No se pudo generar el archivo: ' + (e.message || e), 'error');
      b.disabled = false;
      b.innerHTML = icSvg('share') + (puedeCompartir() ? 'Compartir' : 'Descargar');
    }
  };
}

// ─── Obras y permisos (0000 / admin) ────────────────
// Después de tocar obras o usuarios: rehace el alcance y, si está a la vista, la lista de obras.
async function refrescarAlcance() {
  try { alc = await alcancePanol(yo.codigo); } catch (_) { return; }
  if (!obra) pintarObras();
}

async function dlgConfig() {
  const d = abrirDlg({ icono: 'building', titulo: 'Obras y permisos', sub: 'Cargando…', cuerpo: '' });
  let cfg, usuarios, obras;
  try {
    [cfg, usuarios, obras] = await Promise.all([getPanolConfig(), alc.usuarios && alc.usuarios.length ? alc.usuarios : getAllUsuarios(), getObras()]);
    alc.usuarios = usuarios;
  } catch (e) {
    d.querySelector('p').textContent = 'No se pudo cargar. Revisá la conexión.';
    return;
  }
  const activos = usuarios.filter(u => u.activo && u.codigo !== '0000').sort((a, b) => sinTitulo(a.nombre).localeCompare(sinTitulo(b.nombre), 'es'));
  const nombre = c => { const u = usuarios.find(x => x.codigo === c); return u ? sinTitulo(u.nombre) : c; };
  // Las activas primero; las cerradas quedan abajo, apagadas.
  obras.sort((a, b) => b.activa - a.activa);
  d.querySelector('p').textContent = obras.length
    ? 'Tocá una obra para cambiarle el nombre, elegir su pañolero y quiénes más pueden ver y cargar.'
    : 'Todavía no hay obras: creá la primera.';
  d.insertAdjacentHTML('beforeend', `<div class="pn-cfg-nuevo"><button type="button" class="foc-btn foc-btn--gen" id="cf-nueva">${icSvg('plus')}Nueva obra</button></div>` +
    (obras.length ? `<div class="pn-rows" style="box-shadow:none;border:1.5px solid var(--gray-200)">${obras.map(o => {
      const c = cfg[o.key] || {};
      const nv = Object.keys(c.visores || {}).length;
      return `<button type="button" class="pn-cfg-r${o.activa ? '' : ' off'}" data-o="${esc(o.key)}"><span class="pn-sq">${icSvg('building')}</span><span class="mid"><b>${esc(o.nombre)}${o.activa ? '' : '<span class="pn-tag pn-tag--baja">Cerrada</span>'}</b>
        <small class="${c.panolero || !o.activa ? '' : 'sin'}">${c.panolero ? 'Pañolero: ' + esc(nombre(c.panolero)) : 'Sin pañolero'}${nv ? ` · ${nv} más` : ''}</small></span>${icSvg('chevR')}</button>`;
    }).join('')}</div>` : ''));
  d.addEventListener('click', e => {
    if (e.target.closest('#cf-nueva')) return editarCfg(null, {}, activos, obras);
    const b = e.target.closest('[data-o]');
    if (b) editarCfg(obras.find(o => o.key === b.dataset.o), cfg[b.dataset.o] || {}, activos, obras);
  });
}

function editarCfg(o, c, activos, obras) {
  const nueva = !o;
  const visores = new Set(Object.keys(c.visores || {}));
  abrirDlg({
    icono: nueva ? 'plus' : 'building', titulo: nueva ? 'Nueva obra' : o.nombre, fijo: true,
    sub: nueva ? 'El pañolero y quiénes más cargan se pueden elegir ahora o después.' : '',
    cuerpo: `<div class="form-group"><label for="cf-nombre">Nombre de la obra *</label>
        <input id="cf-nombre" class="form-control" value="${esc(nueva ? '' : o.nombre)}" placeholder="Ej: Ruta 7 — Tramo II" autocomplete="off"></div>
      ${nueva ? '' : `<label class="pn-chk"><input type="checkbox" id="cf-activa"${o.activa ? ' checked' : ''}>Obra activa
        <small>Las cerradas no aparecen en la lista ni para pasar materiales.</small></label>`}
      <div class="form-group"><label for="cf-pan">Pañolero (carga ingresos y salidas)</label>
        <select id="cf-pan" class="form-control"><option value="">— Nadie —</option>
        ${activos.map(u => `<option value="${esc(u.codigo)}"${u.codigo === c.panolero ? ' selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select></div>
      <div class="form-group"><label>También pueden ver y cargar (jefes de obra, capataces, etc.)</label>
        <div class="pn-srch" style="margin-bottom:.4rem">${icSvg('search')}<input type="search" id="cf-q" placeholder="Buscar persona…" autocomplete="off"></div>
        <div class="pn-users" id="cf-users"></div>
        <span class="form-hint">Si alguien no aparece, crealo desde Usuarios.</span></div>
      <div class="pn-err hidden" id="cf-err"></div>
      <div class="eq-dlg-f">
        <button type="button" class="foc-btn foc-btn--clear" id="cf-volver">Volver</button>
        <button type="button" class="foc-btn foc-btn--edit" id="cf-ok">${icSvg('checkSm')}${nueva ? 'Crear obra' : 'Guardar'}</button></div>`
  });
  if (nueva) setTimeout(() => $('cf-nombre').focus(), 50);
  const pintar = () => {
    const q = normTxt($('cf-q').value);
    $('cf-users').innerHTML = activos.filter(u => !q || normTxt(u.nombre).includes(q)).map(u =>
      `<label><input type="checkbox" value="${esc(u.codigo)}"${visores.has(u.codigo) ? ' checked' : ''}>${esc(u.nombre)}</label>`
    ).join('') || `<div class="pn-vacio" style="padding:.8rem">${activos.length ? 'Nadie con ese nombre.' : 'Todavía no hay usuarios: crealos desde Usuarios.'}</div>`;
  };
  pintar();
  $('cf-q').addEventListener('input', pintar);
  $('cf-users').addEventListener('change', e => {
    const cb = e.target.closest('input[type=checkbox]');
    if (cb) cb.checked ? visores.add(cb.value) : visores.delete(cb.value);
  });
  $('cf-volver').onclick = dlgConfig;
  const err = m => { $('cf-err').textContent = m; $('cf-err').classList.remove('hidden'); };
  $('cf-ok').onclick = async () => {
    const nombreObra = $('cf-nombre').value.trim().replace(/\s+/g, ' ');
    if (!nombreObra) return err('Poné el nombre de la obra.');
    const dup = obras.find(x => x.key !== (o && o.key) && normTxt(x.nombre) === normTxt(nombreObra));
    if (dup) return err(`Ya existe la obra "${dup.nombre}"${dup.activa ? '' : ' (cerrada: abrila y reactivala)'}.`);
    const pan = $('cf-pan').value;
    const v = {};
    visores.forEach(x => { if (x !== pan) v[x] = true; });
    const nuevo = {};
    if (pan) nuevo.panolero = pan;
    if (Object.keys(v).length) nuevo.visores = v;
    $('cf-ok').disabled = true;
    try {
      let key;
      if (nueva) key = await crearObra(nombreObra);
      else {
        key = o.key;
        const activa = $('cf-activa').checked;
        if (nombreObra !== o.nombre || activa !== o.activa) await patchObra(key, { nombre: nombreObra, activa });
      }
      if (!nueva || Object.keys(nuevo).length) await savePanolConfigObra(key, Object.keys(nuevo).length ? nuevo : null);
      showToast(nueva ? 'Obra creada' : 'Guardado', 'success');
      await refrescarAlcance();
      dlgConfig();
    } catch (e) {
      err('No se pudo guardar: ' + e.message);
      $('cf-ok').disabled = false;
    }
  };
}

// ─── Usuarios (0000 / admin) ────────────────────────
async function dlgUsuarios() {
  const d = abrirDlg({ icono: 'users', titulo: 'Usuarios', sub: 'Cargando…', cuerpo: '' });
  let usuarios;
  try {
    usuarios = await getAllUsuarios();
    alc.usuarios = usuarios;
  } catch (e) {
    d.querySelector('p').textContent = 'No se pudo cargar. Revisá la conexión.';
    return;
  }
  const lista = [...usuarios].sort((a, b) => (b.activo ? 1 : 0) - (a.activo ? 1 : 0) || sinTitulo(a.nombre).localeCompare(sinTitulo(b.nombre), 'es'));
  d.querySelector('p').textContent = 'Tocá una persona para editarla o resetearle la contraseña. Qué obra carga o ve se elige en Obras y permisos.';
  d.insertAdjacentHTML('beforeend', `<div class="pn-cfg-nuevo"><button type="button" class="foc-btn foc-btn--gen" id="us-nuevo">${icSvg('plus')}Nuevo usuario</button></div>
    <div class="pn-srch">${icSvg('search')}<input type="search" id="us-q" placeholder="Buscar persona…" autocomplete="off"></div>
    <div class="pn-rows" style="box-shadow:none;border:1.5px solid var(--gray-200)" id="us-lista"></div>`);
  const pintar = () => {
    const q = normTxt($('us-q').value);
    const vis = lista.filter(u => !q || normTxt(u.nombre).includes(q) || u.codigo.includes(q));
    $('us-lista').innerHTML = vis.map(u => {
      const tags = (!u.activo ? '<span class="pn-tag pn-tag--baja">Desactivado</span>' : '') +
        (u.resetPedido ? '<span class="pn-tag pn-tag--falta">Pide contraseña nueva</span>' : '');
      const l2 = [u.codigo, u.admin || u.codigo === '0000' ? 'Admin' : '', u.passwordHash ? '' : 'Sin contraseña todavía'].filter(Boolean).join(' · ');
      return `<button type="button" class="pn-cfg-r${u.activo ? '' : ' off'}" data-u="${esc(u.codigo)}"><span class="pn-sq">${icSvg('user')}</span>
        <span class="mid"><b>${esc(u.nombre)}${tags}</b><small>${esc(l2)}</small></span>${icSvg('chevR')}</button>`;
    }).join('') || '<div class="pn-vacio" style="padding:.8rem">Nadie con ese nombre.</div>';
  };
  pintar();
  $('us-q').addEventListener('input', pintar);
  d.addEventListener('click', e => {
    if (e.target.closest('#us-nuevo')) return fichaUsuario(null, usuarios);
    const b = e.target.closest('[data-u]');
    if (b) fichaUsuario(usuarios.find(u => u.codigo === b.dataset.u), usuarios);
  });
}

function fichaUsuario(u, usuarios) {
  const nuevo = !u;
  const codigo = nuevo
    ? String(usuarios.map(x => parseInt(x.codigo, 10)).filter(n => !isNaN(n)).reduce((a, b) => Math.max(a, b), 0) + 1).padStart(4, '0')
    : u.codigo;
  const esSuper = codigo === '0000', soyYo = codigo === yo.codigo;
  const estado = nuevo ? 'Al entrar por primera vez elige su contraseña.'
    : u.resetPedido ? `<b style="color:#b02a2a">Pidió resetear la contraseña el ${new Date(u.resetPedido).toLocaleDateString('es-AR')}.</b>`
    : u.passwordHash ? 'Ya tiene contraseña.' : 'Todavía no entró: elige su contraseña la primera vez.';
  abrirDlg({
    icono: nuevo ? 'plus' : 'user', titulo: nuevo ? 'Nuevo usuario' : u.nombre, fijo: true,
    sub: `Código ${esc(codigo)} · ${estado}`,
    cuerpo: `<div class="form-group"><label for="us-nombre">Nombre y apellido *</label>
        <input id="us-nombre" class="form-control" value="${esc(nuevo ? '' : u.nombre)}" placeholder="Ej: Juan Pérez" autocomplete="off"></div>
      <label class="pn-chk"><input type="checkbox" id="us-admin"${esSuper || (u && u.admin) ? ' checked' : ''}${esSuper || soyYo ? ' disabled' : ''}>Admin
        <small>Ve y carga en todas las obras, y maneja obras y usuarios.</small></label>
      <div class="pn-err hidden" id="us-err"></div>
      <div class="eq-dlg-f">
        ${!nuevo && (u.passwordHash || u.resetPedido) ? `<button type="button" class="foc-btn foc-btn--warn" id="us-reset">${icSvg('key')}Resetear contraseña</button>` : ''}
        ${!nuevo && !esSuper && !soyYo ? `<button type="button" class="foc-btn ${u.activo ? 'foc-btn--del' : 'foc-btn--gen'}" id="us-activo">${icSvg(u.activo ? 'slash' : 'undo')}${u.activo ? 'Desactivar' : 'Reactivar'}</button>` : ''}
        <button type="button" class="foc-btn foc-btn--clear" id="us-volver">Volver</button>
        <button type="button" class="foc-btn foc-btn--edit" id="us-ok">${icSvg('checkSm')}${nuevo ? 'Crear' : 'Guardar'}</button></div>`
  });
  if (nuevo) setTimeout(() => $('us-nombre').focus(), 50);
  const err = m => { $('us-err').textContent = m; $('us-err').classList.remove('hidden'); };
  const listo = async msg => { showToast(msg, 'success'); await refrescarAlcance(); dlgUsuarios(); };
  $('us-volver').onclick = dlgUsuarios;

  $('us-ok').onclick = async () => {
    const nombre = $('us-nombre').value.trim().replace(/\s+/g, ' ');
    if (!nombre) return err('Poné el nombre.');
    const dup = usuarios.find(x => x.codigo !== codigo && normTxt(x.nombre) === normTxt(nombre));
    if (dup) return err(`Ya existe "${dup.nombre}" (código ${dup.codigo})${dup.activo ? '' : ', desactivado: reactivalo'}.`);
    const admin = esSuper || $('us-admin').checked;
    $('us-ok').disabled = true;
    try {
      if (nuevo) await crearUsuario(codigo, { nombre, activo: true, admin });
      else await patchUsuario(codigo, { nombre, admin });
      if (soyYo && nombre !== yo.nombre) {
        yo.nombre = nombre;
        try { localStorage.setItem('vimeco_session', JSON.stringify(yo)); } catch (_) {}
        $('hdr-name').textContent = nombre;
      }
      await listo(nuevo ? 'Usuario creado' : 'Cambios guardados');
    } catch (e) { err('No se pudo guardar: ' + e.message); $('us-ok').disabled = false; }
  };

  const bReset = $('us-reset');
  if (bReset) bReset.onclick = async () => {
    if (!await showConfirm('Resetear contraseña', `${u.nombre} va a tener que crear una contraseña nueva la próxima vez que entre.`,
      { boton: 'Resetear', tono: 'warn', icono: 'key' })) return;
    bReset.disabled = true;
    try {
      await patchUsuario(codigo, { passwordHash: null, resetPedido: null });
      await listo('Contraseña reseteada');
    } catch (e) { err('No se pudo resetear: ' + e.message); bReset.disabled = false; }
  };

  const bActivo = $('us-activo');
  if (bActivo) bActivo.onclick = async () => {
    if (u.activo && !await showConfirm('Desactivar usuario', `${u.nombre} no va a poder entrar más. Lo que cargó queda igual.`,
      { boton: 'Desactivar', tono: 'del', icono: 'slash' })) return;
    bActivo.disabled = true;
    try {
      await patchUsuario(codigo, { activo: !u.activo });
      await listo(u.activo ? 'Usuario desactivado' : 'Usuario reactivado');
    } catch (e) { err('No se pudo guardar: ' + e.message); bActivo.disabled = false; }
  };
}
