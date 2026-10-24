(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1.411 y no 1411: Intl no agrupa los números de 4 cifras en español
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pct = (n, d = 1) => n.toFixed(d).replace('.', ',');
  const color = c => `var(--${c})`;

  /* ---------- Reparto D'Hondt (art. 163 LOREG) ---------- */
  // Empates: gana el partido con más votos totales.
  function dhondt(partidos, escanos, validos) {
    const umbral = validos ? validos * 0.03 : 0;
    const cocientes = [];
    for (const p of partidos) {
      if (p.v < umbral) continue;
      for (let d = 1; d <= escanos; d++) cocientes.push({ p, d, q: p.v / d });
    }
    cocientes.sort((a, b) => b.q - a.q || b.p.v - a.p.v);
    const ganan = cocientes.slice(0, escanos);
    const por = new Map(partidos.map(p => [p, 0]));
    ganan.forEach(c => por.set(c.p, por.get(c.p) + 1));
    return { ganan, fuera: cocientes[escanos], por, umbral };
  }

  /* ---------- Puntos de escaños ---------- */
  function pintarPuntos(el) {
    const n = +el.dataset.n || 0;
    const vacios = +el.dataset.vacios || 0;
    el.style.setProperty('--c', color(el.dataset.c || 'tinta'));
    let html = '';
    for (let i = 0; i < n + vacios; i++) {
      html += `<i${i >= n ? ' class="vacio"' : ''} style="--i:${i}"></i>`;
    }
    el.innerHTML = html;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${n} diputados` + (vacios ? `, ${vacios} perdidos` : ''));
  }
  $$('.puntos[data-n]').forEach(pintarPuntos);

  function puntosHTML(n, c) {
    let h = '';
    for (let i = 0; i < n; i++) h += `<i style="--i:${i}"></i>`;
    return `<span class="puntos" style="--c:${color(c)}">${h}</span>`;
  }

  /* ---------- Asientos de los simuladores ---------- */
  // Cada asiento conserva su sitio; solo cambia el que pasa a otro partido
  function recolocar(antes, por, partidos) {
    const quedan = new Map(por);
    const lista = antes.map(p => {
      if (p && quedan.get(p) > 0) { quedan.set(p, quedan.get(p) - 1); return p; }
      return null;
    });
    const extra = [];
    partidos.forEach(p => { for (let i = 0; i < quedan.get(p); i++) extra.push(p); });
    return lista.map(p => p || extra.shift());
  }
  function pintarAsientos(circulos, lista, antes, marcado) {
    circulos.forEach((c, i) => {
      const p = lista[i];
      c.style.setProperty('--c', color(p.c));
      c.classList.toggle('ultimo', i === marcado);
      if (antes[i] && antes[i] !== p) {
        c.classList.remove('cambia'); void c.offsetWidth; c.classList.add('cambia');
      }
    });
  }

  /* ---------- Aparición al hacer scroll ---------- */
  const visor = 'IntersectionObserver' in window && !quieto
    ? new IntersectionObserver(entradas => {
        entradas.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('visto'); visor.unobserve(e.target); }
        });
      }, { threshold: 0.25 })
    : null;
  function observar(el) {
    if (visor) visor.observe(el); else el.classList.add('visto');
  }
  $$('.revelar').forEach(observar);

  /* ---------- Contadores de la portada ---------- */
  if (!quieto) {
    $$('[data-contar]').forEach(el => {
      const fin = +el.dataset.contar;
      const t0 = performance.now();
      const dur = 1100;
      const paso = t => {
        const x = Math.min(1, (t - t0) / dur);
        el.textContent = fmt(fin * (1 - Math.pow(1 - x, 3)));
        if (x < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
  }

  /* ---------- Barra superior y progreso ---------- */
  const barra = $('#barra');
  const progreso = $('#progreso');
  const portada = $('.portada');
  const capitulos = $$('.capitulo');
  const indice = $('#indice');
  const enlaces = $$('a', indice);
  let activo = null;
  function alDesplazar() {
    const y = scrollY;
    barra.classList.toggle('solida', y > portada.offsetHeight - 100);
    const max = document.documentElement.scrollHeight - innerHeight;
    progreso.style.setProperty('--p', max > 0 ? Math.min(1, y / max) : 0);
    // Apartado en pantalla: el último cuyo inicio ya ha pasado bajo la barra
    let actual = null;
    capitulos.forEach(c => { if (c.offsetTop <= y + 140) actual = c.id; });
    if (actual !== activo) {
      activo = actual;
      enlaces.forEach(a => {
        const on = a.hash === '#' + actual;
        a.classList.toggle('activo', on);
        // Centrar la pastilla sin usar scrollIntoView, que cortaría el desplazamiento suave de la página
        if (on) indice.scrollTo({ left: a.offsetLeft - (indice.clientWidth - a.offsetWidth) / 2, behavior: quieto ? 'auto' : 'smooth' });
      });
    }
  }
  addEventListener('scroll', alDesplazar, { passive: true });
  alDesplazar();

  /* ---------- Compartir ---------- */
  const aviso = $('#aviso');
  function avisar(txt) {
    aviso.textContent = txt;
    aviso.classList.add('ver');
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => aviso.classList.remove('ver'), 2200);
  }
  $$('[data-compartir]').forEach(b => b.addEventListener('click', async () => {
    const datos = {
      title: '¿Cuánto vale tu voto?',
      text: 'En España no todos los votos valen lo mismo. Te lo explican paso a paso:',
      url: location.href.split('#')[0],
    };
    try {
      if (navigator.share) { await navigator.share(datos); return; }
      await navigator.clipboard.writeText(datos.url);
      avisar('Enlace copiado');
    } catch (e) {
      if (e && e.name !== 'AbortError') avisar('No se pudo compartir');
    }
  }));

  /* ---------- Paso 3: D'Hondt en Albacete 2023 ---------- */
  (() => {
    const partidos = [
      { n: 'PP', v: 88299, c: 'pp' },
      { n: 'PSOE', v: 76322, c: 'psoe' },
      { n: 'VOX', v: 36750, c: 'vox' },
      { n: 'Sumar', v: 15834, c: 'sumar' },
    ];
    const VALIDOS = 221191;
    const SIN_ESCANO = 36750 + 15834 + 1261 + 381 + 325 + 185; // partidos que no sacaron nada
    const ESCANOS = 4;
    const DIVISORES = 3;
    const { ganan, fuera } = dhondt(partidos, ESCANOS);

    const tabla = $('#dh-tabla');
    let h = '<thead><tr><th>Partido</th>';
    for (let d = 1; d <= DIVISORES; d++) h += `<th>÷ ${d}</th>`;
    h += '</tr></thead><tbody>';
    for (const p of partidos) {
      h += `<tr><td class="partido"><span class="chapa" style="--c:${color(p.c)}"></span>${p.n}</td>`;
      for (let d = 1; d <= DIVISORES; d++) {
        h += `<td data-p="${p.n}" data-d="${d}" style="--c:${color(p.c)}">${fmt(p.v / d)}</td>`;
      }
      h += '</tr>';
    }
    tabla.innerHTML = h + '</tbody>';

    const celda = c => $(`td[data-p="${c.p.n}"][data-d="${c.d}"]`, tabla);
    const boton = $('#dh-paso');
    const msg = $('#dh-msg');
    const ordinal = ['1.er', '2.º', '3.er', '4.º'];
    let hechos = 0;

    boton.addEventListener('click', () => {
      if (hechos === ESCANOS) {
        hechos = 0;
        $$('td.gana, td.casi', tabla).forEach(td => { td.classList.remove('gana', 'casi'); delete td.dataset.orden; });
        boton.textContent = `Repartir el ${ordinal[0]} diputado`;
        msg.textContent = 'Pulsa para repartir los 4 diputados, uno a uno.';
        return;
      }
      const c = ganan[hechos];
      const td = celda(c);
      td.dataset.orden = hechos + 1;
      td.classList.add('gana');
      hechos++;
      if (hechos < ESCANOS) {
        msg.textContent = `El número más alto que queda es ${fmt(c.q)}: diputado para el ${c.p.n}.`;
        boton.textContent = `Repartir el ${ordinal[hechos]} diputado`;
      } else {
        celda(fuera).classList.add('casi');
        // Con empate gana quien tiene más votos en total (el PSOE), así que hace falta superar el cociente
        const falta = Math.floor(c.q) + 1 - fuera.p.v;
        msg.innerHTML = `VOX: ${fmt(fuera.p.v)} votos (${pct(fuera.p.v / VALIDOS * 100)} %) y <strong>0 diputados</strong>. ` +
          `Le faltaron ${fmt(falta)} votos. En total, ${fmt(SIN_ESCANO)} votos de Albacete (1 de cada 4) no eligieron a nadie.`;
        boton.textContent = 'Volver a empezar';
      }
    });
  })();

  /* ---------- Simulador: A Coruña con SALF ---------- */
  (() => {
    const VALIDOS = 680000;
    const ESCANOS = 8;
    const VOX0 = 70000;
    const partidos = [
      { n: 'PP', v: 265000, c: 'pp' },
      { n: 'PSOE', v: 180000, c: 'psoe' },
      { n: 'BNG', v: 85000, c: 'bng' },
      { n: 'Sumar', v: 55000, c: 'sumar' },
      { n: 'VOX', v: VOX0, c: 'vox' },
      { n: 'SALF', v: 0, c: 'salf' },
    ];
    const vox = partidos[4];
    const salf = partidos[5];
    const rango = $('#salf');
    const salida = $('#salf-out');
    const asientos = $('#sim-asientos');
    const leyenda = $('#sim-leyenda');
    const pelea = $('#sim-pelea');
    const msg = $('#sim-msg');

    asientos.innerHTML = '<i></i>'.repeat(ESCANOS);
    const circulos = $$('i', asientos);
    let antes = new Array(ESCANOS).fill(null);
    let idxDisputado = -1;

    // El rival de VOX: el cociente que le gana o al que gana por el último puesto
    const sinVox = dhondt(partidos.filter(p => p !== vox && p !== salf), ESCANOS, VALIDOS);
    const rival = sinVox.ganan[ESCANOS - 1];
    // Mínimo de votos de SALF que deja a VOX sin diputado (búsqueda binaria)
    const pierde = s => { vox.v = VOX0 - s; salf.v = s; return dhondt(partidos, ESCANOS, VALIDOS).por.get(vox) === 0; };
    let lo = 0, hi = VOX0;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pierde(m)) hi = m; else lo = m + 1; }
    const critico = lo;

    function pintar() {
      const s = +rango.value;
      vox.v = VOX0 - s;
      salf.v = s;
      salida.textContent = fmt(s);
      rango.setAttribute('aria-valuetext', `${fmt(s)} votos`);

      const r = dhondt(partidos, ESCANOS, VALIDOS);
      const voxGana = r.por.get(vox) > 0;
      const lista = recolocar(antes, r.por, partidos);
      if (idxDisputado < 0) idxDisputado = lista.indexOf(vox);
      pintarAsientos(circulos, lista, antes, idxDisputado);
      antes = lista;

      leyenda.innerHTML = partidos
        .filter(p => p.v > 0)
        .map(p => {
          const n = r.por.get(p);
          const bajo = p.v < r.umbral ? ' · no llega al 3 %' : '';
          return `<span><i class="chapa" style="--c:${color(p.c)}"></i>${p.n} <b>${n}</b>${bajo}</span>`;
        }).join('');

      const max = VOX0;
      pelea.innerHTML = [
        { t: 'VOX', v: vox.v, c: 'vox' },
        { t: `${rival.p.n}, ${rival.d}.er diputado (${fmt(rival.p.v)} ÷ ${rival.d})`, v: rival.q, c: rival.p.c },
      ].map(b => `<div class="barra-fila ancha"><div class="rotulo"><span>${b.t}</span><b>${fmt(b.v)}</b></div>` +
        `<div class="pista"><i style="--v:${(b.v / max).toFixed(4)};--c:${color(b.c)}"></i></div></div>`).join('');

      if (s === 0) {
        msg.textContent = `Sin SALF, VOX se lleva el último diputado por ${fmt(vox.v - rival.q)} votos.`;
      } else if (voxGana) {
        msg.textContent = `VOX aún entra, pero ya solo por ${fmt(vox.v - rival.q)} votos.`;
      } else {
        msg.innerHTML = `VOX y SALF suman ${fmt(VOX0)} votos, los mismos de antes, y ahora tienen <strong>0 diputados</strong>. ` +
          `El escaño es para el ${rival.p.n}. Bastaba con que SALF sacara ${fmt(critico)} votos (${pct(critico / VALIDOS * 100)} %).`;
      }
    }
    rango.addEventListener('input', pintar);
    pintar();
  })();

  /* ---------- Senado: ejemplo y resultados de 2023 ---------- */
  (() => {
    // Ejemplo: A gana por 300 votos; los 4 candidatos más votados son senadores
    const CANDIDATOS = [
      { p: 'A', v: 100300 }, { p: 'A', v: 100200 }, { p: 'A', v: 100100 },
      { p: 'B', v: 100000 }, { p: 'B', v: 99900 }, { p: 'B', v: 99800 },
      { p: 'C', v: 46000 },
    ];
    const COLOR = { A: 'pa', B: 'pb', C: 'pc' };
    const orden = {};
    $('#ranking').innerHTML = CANDIDATOS.map((c, i) => {
      orden[c.p] = (orden[c.p] || 0) + 1;
      const sale = i < 4;
      return `<li class="${sale ? 'elegido' : ''}"><span class="quien-sen"><span class="letra" style="--c:${color(COLOR[c.p])}">${c.p}</span>` +
        `Candidato ${orden[c.p]}${sale ? ' <span class="marca-sen">· Senador</span>' : ''}</span>` +
        `<span class="votos-sen">${fmt(c.v)}</span></li>`;
    }).join('');

    const ELEGIDOS = 208;
    const datos = [
      { n: 'PP', v: 34.54, s: 120, c: 'pp' },
      { n: 'PSOE', v: 32.24, s: 72, c: 'psoe' },
      { n: 'Sumar', v: 11.08, s: 0, c: 'sumar' },
      { n: 'VOX', v: 10.64, s: 0, c: 'vox' },
    ];
    const MAX = 60;
    $('#senado-graf').innerHTML = datos.map(d => {
      const ps = d.s / ELEGIDOS * 100;
      return `<div class="par"><div class="rotulo"><span class="chapa" style="--c:${color(d.c)}"></span>${d.n}</div>` +
        `<div class="linea"><div class="pista"><i style="--v:${d.v / MAX};--c:var(--gris)"></i></div><b>${pct(d.v)} %</b></div>` +
        `<div class="linea"><div class="pista"><i class="${d.s ? '' : 'nada'}" style="--v:${ps / MAX};--c:${color(d.c)}"></i></div>` +
        `<b class="${d.s ? '' : 'cero'}">${d.s ? pct(ps) : '0'} %</b></div></div>`;
    }).join('');
  })();

  /* ---------- No votar: Albacete si parte del PSOE se queda en casa ---------- */
  (() => {
    const ESCANOS = 4;
    const PSOE0 = 76322;
    const VALIDOS = 221191;
    const partidos = [
      { n: 'PP', v: 88299, c: 'pp' },
      { n: 'PSOE', v: PSOE0, c: 'psoe' },
      { n: 'VOX', v: 36750, c: 'vox' },
      { n: 'Sumar', v: 15834, c: 'sumar' },
    ];
    const [, psoe, vox] = partidos;
    const rango = $('#abst');
    const salida = $('#abst-out');
    const caja = $('#casa-asientos');
    const leyenda = $('#casa-leyenda');
    const msg = $('#casa-msg');
    caja.innerHTML = '<i></i>'.repeat(ESCANOS);
    const circulos = $$('i', caja);
    let antes = new Array(ESCANOS).fill(null);
    let disputado = -1;

    const reparto = s => { psoe.v = PSOE0 - s; return dhondt(partidos, ESCANOS, VALIDOS - s); };
    let lo = 0, hi = PSOE0;
    while (lo < hi) { const m = (lo + hi) >> 1; if (reparto(m).por.get(vox) > 0) hi = m; else lo = m + 1; }
    const critico = lo;

    function pintar() {
      const s = +rango.value;
      salida.textContent = fmt(s);
      rango.setAttribute('aria-valuetext', `${fmt(s)} votantes`);
      const r = reparto(s);
      const lista = recolocar(antes, r.por, partidos);
      if (disputado < 0) disputado = lista.lastIndexOf(psoe);
      pintarAsientos(circulos, lista, antes, disputado);
      antes = lista;
      leyenda.innerHTML = partidos.map(p =>
        `<span><i class="chapa" style="--c:${color(p.c)}"></i>${p.n} <b>${r.por.get(p)}</b></span>`).join('');
      if (r.por.get(vox) > 0) {
        msg.innerHTML = `Con solo ${fmt(critico)} votantes del PSOE en casa, su diputado pasa a <b>VOX</b>. ` +
          `Y VOX no ha ganado ni un voto: sigue con ${fmt(vox.v)}.`;
      } else if (s === 0) {
        msg.textContent = 'Con los votos reales: 2 diputados para el PP y 2 para el PSOE.';
      } else {
        msg.textContent = `El PSOE aún conserva su segundo diputado, pero cada vez por menos.`;
      }
    }
    rango.addEventListener('input', pintar);
    pintar();
  })();

  /* ---------- Más ejemplos ---------- */
  (() => {
    const CASOS = [
      {
        anyo: 'Noviembre 2019', t: 'Casi el doble de votos y menos diputados.',
        f: [{ n: 'Ciudadanos', v: 1650318, s: 10, c: 'cs' }, { n: 'ERC', v: 880734, s: 13, c: 'erc' }],
      },
      {
        anyo: '2015', t: 'El triple de votos y un tercio de los diputados.',
        f: [{ n: 'IU', v: 926783, s: 2, c: 'iu' }, { n: 'PNV', v: 302316, s: 6, c: 'pnv' }],
      },
      {
        anyo: '2023', t: 'Más del triple de votos y ningún diputado.',
        f: [{ n: 'PACMA', v: 169237, s: 0, c: 'pacma' }, { n: 'UPN', v: 52188, s: 1, c: 'upn' }],
      },
      {
        anyo: '2019', t: 'De 57 a 10 diputados en seis meses.',
        f: [{ n: 'Cs · abril', v: 4155665, s: 57, c: 'cs' }, { n: 'Cs · noviembre', v: 1650318, s: 10, c: 'cs' }],
        veredicto: [['−60 %', 'de votos', false], ['−82 %', 'de diputados', true]],
      },
    ];
    $('#casos-lista').innerHTML = CASOS.map(k => {
      const max = Math.max(...k.f.map(x => x.v));
      return `<article class="caso revelar"><p class="anyo">${k.anyo}</p><h3>${k.t}</h3>` +
        k.f.map(x => `<div class="grupo"><div class="cab"><b><span class="chapa" style="--c:${color(x.c)}"></span>${x.n}</b>` +
          `<span>${fmt(x.v)} votos</span></div>` +
          `<div class="pista"><i style="--v:${(x.v / max).toFixed(4)};--c:${color(x.c)}"></i></div>` +
          `<div class="esc"><strong class="${x.s ? '' : 'cero'}">${x.s}</strong>${x.s ? puntosHTML(x.s, x.c) : '<span class="ninguno">ningún diputado</span>'}</div></div>`
        ).join('') +
        (k.veredicto ? '<div class="veredicto">' + k.veredicto.map(([b, t, a]) =>
          `<div><b class="${a ? 'alerta' : ''}">${b}</b><span>${t}</span></div>`).join('') + '</div>' : '') +
        '</article>';
    }).join('');
    $$('#casos-lista .caso').forEach(observar);
  })();

  /* ---------- Hemiciclo: real frente a proporcional (2023) ---------- */
  (() => {
    // De izquierda a derecha en el hemiciclo; «g» es el color del bloque
    const PARTIDOS = [
      { n: 'Sumar', g: 'sumar', real: 31, igual: 45 },
      { n: 'PSOE', g: 'psoe', real: 121, igual: 115 },
      { n: 'ERC', g: 'otros', real: 7, igual: 6 },
      { n: 'EH Bildu', g: 'otros', real: 6, igual: 4 },
      { n: 'BNG', g: 'otros', real: 1, igual: 2 },
      { n: 'CUP', g: 'otros', real: 0, igual: 1 },
      { n: 'PACMA', g: 'otros', real: 0, igual: 2 },
      { n: 'PNV', g: 'otros', real: 5, igual: 4 },
      { n: 'Junts', g: 'otros', real: 7, igual: 5 },
      { n: 'CC', g: 'otros', real: 1, igual: 1 },
      { n: 'UPN', g: 'otros', real: 1, igual: 0 },
      { n: 'PP', g: 'pp', real: 137, igual: 120 },
      { n: 'VOX', g: 'vox', real: 33, igual: 45 },
    ];
    const GRUPOS = [
      { k: 'sumar', n: 'Sumar' }, { k: 'psoe', n: 'PSOE' }, { k: 'otros', n: 'Otros' },
      { k: 'pp', n: 'PP' }, { k: 'vox', n: 'VOX' },
    ];
    const TOTAL = 350;
    const suma = (modo, g) => PARTIDOS.filter(p => p.g === g).reduce((a, p) => a + p[modo], 0);

    // Posiciones: filas concéntricas con asientos proporcionales al radio, ordenadas por ángulo
    const svg = $('#hemiciclo');
    const CX = 200, CY = 200, R1 = 192, R0 = 78, FILAS = 12;
    const radios = Array.from({ length: FILAS }, (_, i) => R0 + (R1 - R0) * i / (FILAS - 1));
    const sr = radios.reduce((a, b) => a + b, 0);
    const cuenta = radios.map(r => Math.round(TOTAL * r / sr));
    cuenta[FILAS - 1] += TOTAL - cuenta.reduce((a, b) => a + b, 0);
    const pts = [];
    radios.forEach((r, i) => {
      const k = cuenta[i];
      for (let j = 0; j < k; j++) {
        const a = Math.PI * (1 - j / (k - 1));
        pts.push({ x: CX + r * Math.cos(a), y: CY - r * Math.sin(a), a, r });
      }
    });
    pts.sort((p, q) => q.a - p.a || p.r - q.r);
    const radio = ((R1 - R0) / (FILAS - 1)) * 0.42;
    const NS = 'http://www.w3.org/2000/svg';
    const circulos = pts.map(p => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', p.x.toFixed(2));
      c.setAttribute('cy', p.y.toFixed(2));
      c.setAttribute('r', radio.toFixed(2));
      svg.appendChild(c);
      return c;
    });
    const centro = document.createElementNS(NS, 'text');
    centro.setAttribute('x', CX); centro.setAttribute('y', CY - 8);
    const sub = document.createElementNS(NS, 'text');
    sub.setAttribute('x', CX); sub.setAttribute('y', CY + 10);
    sub.setAttribute('class', 'sub');
    svg.append(centro, sub);

    // Reparto real: cuñas consecutivas
    const real = [];
    PARTIDOS.forEach(p => { for (let i = 0; i < p.real; i++) real.push(p); });

    // Reparto proporcional sin mover a nadie de sitio: cada asiento que un partido pierde
    // pasa al que lo gana, eligiendo los asientos más cercanos a ese partido.
    const igual = real.slice();
    const sobra = new Map(PARTIDOS.map(p => [p, Math.max(0, p.real - p.igual)]));
    const ganan = PARTIDOS.filter(p => p.igual > p.real).sort((a, b) => (a.igual - a.real) - (b.igual - b.real));
    for (const g of ganan) {
      const suyos = real.map((p, i) => (p === g ? i : -1)).filter(i => i >= 0);
      const hueco = PARTIDOS.slice(0, PARTIDOS.indexOf(g)).reduce((a, p) => a + p.real, 0);
      const ang = suyos.length
        ? suyos.reduce((a, i) => a + pts[i].a, 0) / suyos.length
        : pts[Math.min(hueco, TOTAL - 1)].a;
      const libres = real.map((_, i) => i).sort((i, j) => Math.abs(pts[i].a - ang) - Math.abs(pts[j].a - ang));
      let falta = g.igual - g.real;
      for (const i of libres) {
        if (!falta) break;
        const p = igual[i];
        if (p === real[i] && sobra.get(p) > 0) { sobra.set(p, sobra.get(p) - 1); igual[i] = g; falta--; }
      }
    }
    const cambian = igual.reduce((a, p, i) => a + (p !== real[i]), 0);

    const leyenda = $('#hemi-leyenda');
    const tabla = $('#hemi-tabla');
    const cambiosTxt = $('#hemi-cambios');
    const botones = $$('.segmentos button');
    let modo = 'real';
    let foco = null;

    function rotuloCentro() {
      const lista = modo === 'real' ? real : igual;
      if (foco) {
        centro.textContent = lista.filter(p => p.n === foco).length;
        sub.textContent = `diputados de ${foco}`;
      } else {
        centro.textContent = TOTAL;
        sub.textContent = 'diputados · mayoría: 176';
      }
    }

    function pintar(nuevo) {
      modo = nuevo;
      const lista = modo === 'real' ? real : igual;
      let orden = 0;
      circulos.forEach((c, i) => {
        const p = lista[i];
        c.style.fill = color(p.g);
        c.dataset.p = p.n;
        const cambia = modo === 'igual' && p !== real[i];
        c.classList.toggle('cambia', cambia);
        if (cambia) c.style.setProperty('--i', orden++);
      });
      svg.classList.toggle('atenua', modo === 'igual');
      cambiosTxt.innerHTML = modo === 'igual'
        ? `<mark>${cambian} diputados</mark> cambiarían de partido`
        : 'Así quedó el Congreso en 2023';

      leyenda.innerHTML = GRUPOS.map(g => {
        const n = suma(modo, g.k);
        const d = n - suma('real', g.k);
        const dif = modo === 'igual' && d ? ` <em>(${d > 0 ? '+' : '−'}${Math.abs(d)})</em>` : '';
        return `<span><i class="chapa" style="--c:${color(g.k)}"></i>${g.n} <b>${n}</b>${dif}</span>`;
      }).join('');

      const filas = PARTIDOS.slice().sort((a, b) => b.real - a.real || b.igual - a.igual);
      tabla.innerHTML = '<thead><tr><th>Partido</th><th>Real</th><th>Si cada voto<br>valiera igual</th><th>Diferencia</th></tr></thead><tbody>' +
        filas.map(d => {
          const dif = d.igual - d.real;
          const cls = dif > 0 ? 'mas' : dif < 0 ? 'menos' : 'igual';
          const txt = dif > 0 ? `+${dif}` : dif < 0 ? `−${-dif}` : '=';
          return `<tr><td><span class="chapa" style="--c:${color(d.g)}"></span>${d.n}</td>` +
            `<td>${d.real}</td><td>${d.igual}</td><td class="${cls}">${txt}</td></tr>`;
        }).join('') + '</tbody>';

      botones.forEach(b => {
        const on = b.dataset.modo === modo;
        b.classList.toggle('activo', on);
        b.setAttribute('aria-pressed', on);
      });
      rotuloCentro();
    }
    botones.forEach(b => b.addEventListener('click', () => { foco = null; enfocar(null); pintar(b.dataset.modo); }));

    // Al pasar por encima (o tocar) un asiento: se resalta su partido y el centro muestra sus diputados
    function enfocar(p) {
      foco = p;
      circulos.forEach(c => { c.style.opacity = p ? (c.dataset.p === p ? 1 : 0.2) : ''; });
      rotuloCentro();
    }
    svg.addEventListener('pointerover', e => {
      const p = e.target.dataset ? e.target.dataset.p || null : null;
      if (p !== foco) enfocar(p);
    });
    svg.addEventListener('pointerleave', () => enfocar(null));

    pintar('real');
  })();
})();
