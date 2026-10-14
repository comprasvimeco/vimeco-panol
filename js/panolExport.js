/* VIMECO S.A. — Pañol: PDF y Excel para mandar por WhatsApp.
   Tres listados: stock completo (por categoría), lo que falta (con cuánto pedir)
   y los movimientos de un mes. El PDF sigue el formato de cajaPDF.js de VIMECO OC
   (franja azul con el logo, recuadros de resumen, tabla con cabecera, pie con CUIT).

   datos = { que: 'stock'|'falta'|'movs', cat, obra, arts, movs, mes, mesNombre, por }
   cat = '' (todas) o una categoría: stock y faltantes salen sólo de esa. */

/* global LOGO_BASE64, XLSX */

(function () {
  const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
  const _scripts = {};
  function cargarScript(src) {
    return _scripts[src] || (_scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { delete _scripts[src]; reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    }));
  }
  // Se llama al abrir "Exportar": así, al tocar Compartir, todo está listo y el
  // teléfono no pierde el permiso de compartir (dura unos segundos desde el toque).
  window.precargarExport = () => {
    cargarScript('js/jspdf.umd.min.js').catch(() => {});
    cargarScript('js/logoBase64.js').catch(() => {});
    cargarScript(XLSX_URL).catch(() => {});
  };

  const n3 = n => Math.round((Number(n) || 0) * 1000) / 1000;
  const num = n => n3(n).toLocaleString('es-AR', { maximumFractionDigits: 3 });
  const fecha = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const ahora = () => { const d = new Date(); return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const falta = a => a.activo && (a.stock <= 0 || ((a.minimo || 0) > 0 && a.stock < a.minimo));
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const TIPO = { ingreso: 'Ingreso', salida: 'Salida', ajuste: 'Ajuste', traspaso_out: 'Pasó a obra', traspaso_in: 'Llegó de obra' };
  const SIGNO = { ingreso: 1, traspaso_in: 1, salida: -1, traspaso_out: -1, ajuste: 1 };

  function detalleMov(m) {
    if (m.tipo === 'ingreso') return [m.proveedor, m.remito && 'Rto. ' + m.remito].filter(Boolean).join(' · ');
    if (m.tipo === 'salida') return [m.retira, m.destino].filter(Boolean).join(' · ');
    if (m.otraObra) return m.otraObra.nombre;
    return m.nota || '';
  }

  // Filas comunes a PDF y Excel.
  function tabla(d) {
    const activos = d.arts.filter(a => a.activo && (!d.cat || (a.categoria || 'Varios') === d.cat));
    const sub = (d.cat ? d.cat + ' · ' : '') + 'Al ' + ahora();
    if (d.que === 'stock') {
      const cats = {};
      activos.forEach(a => { (cats[a.categoria || 'Varios'] = cats[a.categoria || 'Varios'] || []).push(a); });
      const filas = [];
      Object.keys(cats).sort((a, b) => a.localeCompare(b, 'es')).forEach(c => {
        filas.push({ grupo: c });
        cats[c].sort(porNombre).forEach(a => filas.push({
          v: [a.nombre, a.unidad || 'u', n3(a.stock), a.minimo ? n3(a.minimo) : '', a.stock <= 0 ? 'Sin stock' : falta(a) ? 'Bajo mínimo' : 'OK'],
          rojo: falta(a) || a.stock <= 0
        }));
      });
      return {
        titulo: 'STOCK DEL PAÑOL', sub, hoja: d.cat || 'Stock',
        cols: [{ h: 'Material', w: 80 }, { h: 'Unidad', w: 18 }, { h: 'Stock', w: 26, n: 1 }, { h: 'Mínimo', w: 26, n: 1 }, { h: 'Estado', w: 36 }],
        kpis: [['Materiales', activos.length], ['Bajo mínimo', activos.filter(a => falta(a) && a.stock > 0).length, 1], ['Sin stock', activos.filter(a => a.stock <= 0).length, 1]],
        filas
      };
    }
    if (d.que === 'falta') {
      const lista = activos.filter(falta).sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'es') || porNombre(a, b));
      return {
        titulo: 'FALTANTES DEL PAÑOL', sub, hoja: d.cat ? 'Faltan ' + d.cat : 'Faltantes',
        cols: [{ h: 'Material', w: 62 }, { h: 'Categoría', w: 38 }, { h: 'Unidad', w: 16 }, { h: 'Stock', w: 22, n: 1 }, { h: 'Mínimo', w: 22, n: 1 }, { h: 'A pedir', w: 26, n: 1 }],
        kpis: [['Materiales a pedir', lista.length, 1], ['Sin stock', lista.filter(a => a.stock <= 0).length, 1]],
        filas: lista.map(a => ({ v: [a.nombre, a.categoria || 'Varios', a.unidad || 'u', n3(a.stock), a.minimo ? n3(a.minimo) : '', a.minimo ? n3(a.minimo - a.stock) : ''], fuerte: 5 }))
      };
    }
    const movs = d.movs.filter(m => !m.anulado)
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.ts || 0) - (b.ts || 0));
    const filas = [];
    movs.forEach(m => (m.items || []).forEach(it => filas.push({
      v: [fecha(m.fecha), TIPO[m.tipo], it.nombre, n3(SIGNO[m.tipo] * it.cant), it.unidad || '', detalleMov(m)],
      tono: m.tipo === 'ajuste' ? 'aj' : SIGNO[m.tipo] > 0 ? 'in' : 'out'
    })));
    const cuenta = t => movs.filter(m => t.includes(m.tipo)).length;
    return {
      titulo: 'MOVIMIENTOS DEL PAÑOL', sub: 'Período: ' + d.mesNombre, hoja: d.mesNombre,
      cols: [{ h: 'Fecha', w: 20 }, { h: 'Tipo', w: 22 }, { h: 'Material', w: 58 }, { h: 'Cant.', w: 20, n: 1 }, { h: 'Unid.', w: 14 }, { h: 'Detalle', w: 52 }],
      kpis: [['Ingresos', cuenta(['ingreso', 'traspaso_in'])], ['Salidas', cuenta(['salida', 'traspaso_out'])], ['Ajustes', cuenta(['ajuste'])]],
      filas
    };
  }

  const limpio = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
  const nombreArchivo = (d, ext) => {
    const obra = limpio(d.obra);
    const que = (d.que === 'stock' ? 'Stock' : d.que === 'falta' ? 'Faltantes' : 'Movimientos_' + d.mesNombre.replace(/\s+/g, '_'))
      + (d.cat ? '_' + limpio(d.cat) : '');
    const hoy = new Date().toISOString().slice(0, 10);
    return `Panol_${obra}_${que}${d.que === 'movs' ? '' : '_' + hoy}.${ext}`;
  };

  // ─── PDF ────────────────────────────────────────────
  const AZUL = [43, 57, 70], AZUL_MED = [61, 81, 102], GRIS = [242, 242, 242], BORDE = [170, 170, 170];
  const BLANCO = [255, 255, 255], NEGRO = [20, 20, 20], VERDE = [26, 127, 60], ROJO = [176, 42, 42], AMBAR = [138, 79, 13], VIOLETA = [107, 63, 160], TENUE = [120, 128, 138];
  const CUIT = '30-50424533-7';
  const P = { w: 210, h: 297, ml: 12, mt: 12, mb: 16, get cw() { return this.w - 2 * this.ml; }, get maxY() { return this.h - this.mb; } };
  const ROW_H = 6;

  window.panolPDF = async function (d) {
    await cargarScript('js/jspdf.umd.min.js');
    await cargarScript('js/logoBase64.js').catch(() => {});
    const J = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!J) throw new Error('jsPDF no está disponible');
    const doc = new J({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const t = tabla(d);
    // Ancho de columnas proporcional al ancho útil
    const tot = t.cols.reduce((s, c) => s + c.w, 0);
    const W = t.cols.map(c => c.w * P.cw / tot);
    const xs = [P.ml];
    W.slice(1).forEach((_, i) => xs.push(xs[i] + W[i]));
    const AL = t.cols.map(c => c.n ? 'right' : 'left');

    let y = header(doc, t, d);
    y = kpis(doc, t, y + 4);
    y += 7;
    y = cabecera(doc, t, xs, W, AL, y);
    if (!t.filas.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...TENUE);
      doc.text('No hay nada para listar.', P.ml + 1.5, y + 4.5);
    }
    let par = false;
    t.filas.forEach(f => {
      if (y + ROW_H > P.maxY) { doc.addPage(); y = cabecera(doc, t, xs, W, AL, P.mt); }
      if (f.grupo) {
        doc.setFillColor(...GRIS);
        doc.rect(P.ml, y, P.cw, ROW_H, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...AZUL);
        doc.text(f.grupo.toUpperCase(), P.ml + 1.5, y + 4.1);
        y += ROW_H; par = false;
        return;
      }
      if (par) { doc.setFillColor(248, 249, 251); doc.rect(P.ml, y, P.cw, ROW_H, 'F'); }
      par = !par;
      f.v.forEach((v, c) => {
        const esNum = typeof v === 'number';
        let txt = esNum ? num(v) : String(v ?? '');
        if (d.que === 'movs' && c === 3 && v > 0) txt = '+' + txt;
        doc.setFont('helvetica', (t.cols[c].n || c === 0 || f.fuerte === c) ? 'bold' : 'normal');
        doc.setFontSize(8);
        let color = NEGRO;
        if (f.rojo && (c === 2 || c === t.cols.length - 1)) color = ROJO;
        if (f.fuerte === c) color = ROJO;
        if (f.tono && (c === 1 || c === 3)) color = f.tono === 'in' ? VERDE : f.tono === 'out' ? AMBAR : VIOLETA;
        doc.setTextColor(...color);
        doc.text(fit(doc, txt, W[c] - 3), tx(xs[c], W[c], AL[c]), y + 4.1, { align: AL[c] });
      });
      doc.setDrawColor(225, 229, 234); doc.setLineWidth(0.2);
      doc.line(P.ml, y + ROW_H, P.ml + P.cw, y + ROW_H);
      y += ROW_H;
    });
    if (d.que === 'falta' && t.filas.length) {
      if (y + 30 > P.maxY) { doc.addPage(); y = P.mt + 10; }
      firmas(doc, d, y + 22);
    }
    pies(doc, t, d);
    const blob = doc.output('blob');
    return new File([blob], nombreArchivo(d, 'pdf'), { type: 'application/pdf' });
  };

  function header(doc, t, d) {
    const x0 = P.ml, y = P.mt, H = 24;
    doc.setFillColor(...AZUL);
    doc.rect(x0, y, P.cw, H, 'F');
    const logo = typeof LOGO_BASE64 !== 'undefined' ? LOGO_BASE64 : null;
    if (logo) {
      try {
        const lw = 40, lh = lw * 82 / 400;
        doc.setFillColor(...BLANCO);
        doc.rect(x0 + 3, y + 3, lw + 6, H - 6, 'F');
        doc.addImage(logo, logo.startsWith('data:image/png') ? 'PNG' : 'JPEG', x0 + 6, y + (H - lh) / 2, lw, lh);
      } catch (_) {}
    }
    const xt = x0 + 55;
    doc.setTextColor(...BLANCO);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(t.titulo, xt, y + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(fit(doc, 'Obra: ' + d.obra, P.cw - 60), xt, y + 15);
    doc.text(t.sub, xt, y + 20);
    return y + H;
  }

  function kpis(doc, t, y) {
    const n = t.kpis.length, gap = 3, w = (P.cw - gap * (n - 1)) / n, H = 15;
    t.kpis.forEach(([lbl, val, alerta], i) => {
      const x = P.ml + i * (w + gap);
      const color = alerta && val ? ROJO : AZUL;
      doc.setFillColor(...GRIS); doc.rect(x, y, w, H, 'F');
      doc.setFillColor(...color); doc.rect(x, y, 1.4, H, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...TENUE);
      doc.text(lbl.toUpperCase(), x + 4, y + 5.3);
      doc.setFontSize(13); doc.setTextColor(...color);
      doc.text(String(val), x + 4, y + 12);
    });
    return y + H;
  }

  function cabecera(doc, t, xs, W, AL, y) {
    doc.setFillColor(...AZUL_MED);
    doc.rect(P.ml, y, P.cw, 6.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BLANCO);
    t.cols.forEach((c, i) => doc.text(c.h.toUpperCase(), tx(xs[i], W[i], AL[i]), y + 4.3, { align: AL[i] }));
    return y + 6.5;
  }

  function firmas(doc, d, yl) {
    const w = 70;
    [['Pañolero', d.por], ['Recibió el pedido', '']].forEach(([t, n], i) => {
      const x = i ? P.ml + P.cw - w : P.ml;
      doc.setDrawColor(...NEGRO); doc.setLineWidth(0.3);
      doc.line(x, yl, x + w, yl);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NEGRO);
      doc.text(t, x + w / 2, yl + 4.5, { align: 'center' });
      if (n) { doc.setFont('helvetica', 'normal'); doc.setTextColor(...TENUE); doc.text(fit(doc, n, w), x + w / 2, yl + 8.5, { align: 'center' }); }
    });
  }

  function pies(doc, t, d) {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      const y = P.h - 9;
      doc.setDrawColor(...BORDE); doc.setLineWidth(0.3);
      doc.line(P.ml, y - 3, P.ml + P.cw, y - 3);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...TENUE);
      doc.text(fit(doc, `VIMECO S.A. · CUIT ${CUIT} · Pañol ${d.obra} · generado por ${d.por} el ${ahora()}`, 150), P.ml, y);
      doc.text(`Página ${p} de ${total}`, P.ml + P.cw, y, { align: 'right' });
    }
  }

  function fit(doc, txt, w) {
    const s = String(txt ?? '');
    if (!s || doc.getTextWidth(s) <= w) return s;
    let out = doc.splitTextToSize(s, w)[0] || s;
    while (out.length > 1 && doc.getTextWidth(out + '…') > w) out = out.slice(0, -1);
    return out + '…';
  }
  const tx = (x, w, align) => align === 'right' ? x + w - 1.5 : align === 'center' ? x + w / 2 : x + 1.5;

  // ─── Excel ──────────────────────────────────────────
  window.panolExcel = async function (d) {
    await cargarScript(XLSX_URL);
    const t = tabla(d);
    const nc = t.cols.length;
    const vacia = () => Array(nc).fill('');
    const fila = (txt) => { const r = vacia(); r[0] = txt; return r; };
    const rows = [
      fila(`VIMECO S.A. — ${t.titulo.charAt(0) + t.titulo.slice(1).toLowerCase()}`),
      fila('Obra: ' + d.obra),
      fila(t.sub),
      fila('Generado por ' + d.por + ' el ' + ahora()),
      vacia(),
      t.cols.map(c => c.h)
    ];
    const R_HDR = 5;
    const tipos = [];  // por fila de datos: 'grupo' | objeto fila
    t.filas.forEach(f => {
      if (f.grupo) { rows.push(fila(f.grupo.toUpperCase())); tipos.push('grupo'); }
      else { rows.push(f.v.map(v => v === '' ? '' : v)); tipos.push(f); }
    });
    if (!t.filas.length) { rows.push(fila('No hay nada para listar.')); tipos.push(null); }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = t.cols.map(c => ({ wch: Math.round(c.w / 2.2) + 4 }));
    ws['!merges'] = [0, 1, 2, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: nc - 1 } }));
    tipos.forEach((f, i) => { if (f === 'grupo') ws['!merges'].push({ s: { r: R_HDR + 1 + i, c: 0 }, e: { r: R_HDR + 1 + i, c: nc - 1 } }); });

    const a = h => 'FF' + h;
    const solid = rgb => ({ patternType: 'solid', fgColor: { rgb }, bgColor: { indexed: 64 } });
    const b = { style: 'thin', color: { rgb: a('B0BEC5') } };
    const thin = { top: b, bottom: b, left: b, right: b };
    const cs = (r, c, s) => { const ad = XLSX.utils.encode_cell({ r, c }); if (!ws[ad]) ws[ad] = { t: 's', v: '' }; ws[ad].s = s; };
    cs(0, 0, { font: { bold: true, sz: 14, color: { rgb: a('FFFFFF') } }, fill: solid(a('1A3A5C')), alignment: { horizontal: 'center' } });
    [1, 2, 3].forEach(r => cs(r, 0, { font: { sz: 10, color: { rgb: a('FFFFFF') } }, fill: solid(a('2D5F8A')) }));
    t.cols.forEach((c, i) => cs(R_HDR, i, { font: { bold: true, sz: 10, color: { rgb: a('FFFFFF') } }, fill: solid(a('3A78B5')), border: thin, alignment: { horizontal: c.n ? 'right' : 'left' } }));
    let par = false;
    tipos.forEach((f, i) => {
      const r = R_HDR + 1 + i;
      if (!f) return;
      if (f === 'grupo') { cs(r, 0, { font: { bold: true, sz: 10, color: { rgb: a('1A3A5C') } }, fill: solid(a('D6E4F0')), border: thin }); par = false; return; }
      const bg = par ? a('F5F7FA') : a('FFFFFF');
      par = !par;
      t.cols.forEach((c, k) => {
        let color = '333333';
        if ((f.rojo && (k === 2 || k === nc - 1)) || f.fuerte === k) color = 'B71C1C';
        if (f.tono && (k === 1 || k === 3)) color = f.tono === 'in' ? '1B5E20' : f.tono === 'out' ? '8A4F0D' : '6B3FA0';
        cs(r, k, { font: { sz: 10, bold: !!c.n || k === 0 || f.fuerte === k, color: { rgb: a(color) } }, fill: solid(bg), border: thin,
                   numFmt: c.n ? '#,##0.###' : undefined, alignment: { horizontal: c.n ? 'right' : 'left' } });
      });
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t.hoja.replace(/[\\/?*[\]:]/g, '').substring(0, 31));
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
    const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return new File([new Blob([out], { type })], nombreArchivo(d, 'xlsx'), { type });
  };

  // ─── Compartir o descargar ──────────────────────────
  window.puedeCompartir = () => (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && typeof navigator.canShare === 'function';

  window.compartirOBajar = async function (file, titulo) {
    if (puedeCompartir() && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: titulo, files: [file] });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;   // la persona cerró el menú de compartir
        // NotAllowedError (se venció el permiso del toque) u otro: se descarga
      }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast('Archivo descargado: ' + file.name, 'success');
  };
})();
