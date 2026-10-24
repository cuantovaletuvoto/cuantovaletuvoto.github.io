(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esperar = ms => new Promise(r => setTimeout(r, quieto ? 0 : ms));

  // 1.411 y no 1411: Intl no agrupa los números de 4 cifras en español
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pct = (n, d = 1) => n.toFixed(d).replace('.', ',');
  const color = c => `var(--${c})`;
  const PROVINCIAS = window.PROVINCIAS || [];
  const PERSONA = '<svg viewBox="0 0 18 26" aria-hidden="true"><circle cx="9" cy="5" r="4.2"/><path d="M2 25v-9a7 7 0 0 1 14 0v9z"/></svg>';

  const ICONO_SI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICONO_NO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  const ICONO_IGUAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

  /* ---------- Reparto D'Hondt (art. 163 de la Ley Electoral) ---------- */
  // Partidos como [{n, v}]. Barrera: 3 % de los votos válidos. Empate: gana quien tiene más votos.
  function dhondt(partidos, escanos, validos) {
    const umbral = validos ? validos * 0.03 : 0;
    const cocientes = [];
    for (const p of partidos) {
      if (p.v < umbral || p.v <= 0) continue;
      for (let d = 1; d <= escanos; d++) cocientes.push({ p, d, q: p.v / d });
    }
    cocientes.sort((a, b) => b.q - a.q || b.p.v - a.p.v);
    const ganan = cocientes.slice(0, escanos);
    const por = new Map(partidos.map(p => [p, 0]));
    ganan.forEach(c => por.set(c.p, por.get(c.p) + 1));
    return { ganan, fuera: cocientes[escanos], por, umbral };
  }
  // Misma regla para un objeto {sigla: votos}; devuelve {sigla: escaños}
  function repartir(votos, escanos, validos) {
    const ps = Object.entries(votos).map(([n, v]) => ({ n, v }));
    const out = {};
    dhondt(ps, escanos, validos).por.forEach((s, p) => { if (s) out[p.n] = s; });
    return out;
  }

  /* ---------- Piezas comunes ---------- */
  function pintarPuntos(el) {
    const n = +el.dataset.n || 0;
    const vacios = +el.dataset.vacios || 0;
    el.style.setProperty('--c', color(el.dataset.c || 'tinta'));
    let html = '';
    for (let i = 0; i < n + vacios; i++) html += `<i${i >= n ? ' class="vacio"' : ''} style="--i:${i}"></i>`;
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

  // Asientos de los simuladores: cada uno conserva su sitio y solo cambia el que pasa a otro partido
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
      if (antes[i] && antes[i] !== p) { c.classList.remove('cambia'); void c.offsetWidth; c.classList.add('cambia'); }
    });
  }
  // Recuadro grande con el resultado: «si» (verde), «no» (rojo) o neutro
  function veredicto(el, tipo, titulo, detalle) {
    const antes = el.dataset.tipo;
    el.className = 'veredicto' + (tipo ? ' ' + tipo : '');
    el.innerHTML = `<span class="veredicto-icono">${tipo === 'si' ? ICONO_SI : tipo === 'no' ? ICONO_NO : ICONO_IGUAL}</span><b>${titulo}</b><span>${detalle}</span>`;
    if (antes !== undefined && antes !== tipo) { void el.offsetWidth; el.classList.add('cambia'); }
    el.dataset.tipo = tipo;
  }

  // Mapa de casillas: una por provincia, colocada en su sitio aproximado
  function crearMapa(el, { pintar, alTocar }) {
    const botones = PROVINCIAS.map(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.gridColumn = p.x + 1;
      b.style.gridRow = p.y + 1;
      if (alTocar) b.addEventListener('click', () => alTocar(p));
      else b.tabIndex = -1;
      el.appendChild(b);
      return b;
    });
    let marcada = null;
    const api = {
      repintar() {
        PROVINCIAS.forEach((p, i) => {
          const b = botones[i];
          const r = pintar(p);
          const etiqueta = String(r.etiqueta ?? '');
          const cambia = b.textContent !== etiqueta;
          b.style.setProperty('--fondo-casilla', r.fondo || 'var(--mapa-0)');
          b.style.setProperty('--texto-casilla', r.texto || 'var(--tinta)');
          b.className = (r.clase || '') + (p === marcada ? ' sel' : '');
          if (cambia) {
            b.textContent = etiqueta;
            if (r.late) { void b.offsetWidth; b.classList.add('late'); }
          }
          b.setAttribute('aria-label', r.titulo || p.n);
          b.title = r.titulo || p.n;
        });
      },
      marcar(p) {
        marcada = p;
        botones.forEach((b, i) => b.classList.toggle('sel', PROVINCIAS[i] === p));
      },
    };
    api.repintar();
    return api;
  }

  /* ---------- Aparición al hacer scroll ---------- */
  const visor = 'IntersectionObserver' in window && !quieto
    ? new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visto'); visor.unobserve(e.target); }
      }), { threshold: 0.25 })
    : null;
  const observar = el => { if (visor) visor.observe(el); else el.classList.add('visto'); };
  $$('.revelar').forEach(observar);

  /* ---------- Barra, índice y progreso ---------- */
  const barra = $('#barra');
  const progreso = $('#progreso');
  const portada = $('.portada');
  const capitulos = $$('.capitulo');
  const indice = $('#indice');
  const enlaces = $$('a', indice);
  let activo = null;
  function alDesplazar() {
    const y = scrollY;
    barra.classList.toggle('solida', y > portada.offsetHeight - 130);
    const max = document.documentElement.scrollHeight - innerHeight;
    progreso.style.setProperty('--p', max > 0 ? Math.min(1, y / max) : 0);
    let actual = null;
    capitulos.forEach(c => { if (c.offsetTop <= y + 140) actual = c.id; });
    if (actual !== activo) {
      activo = actual;
      enlaces.forEach(a => {
        const on = a.hash === '#' + actual;
        a.classList.toggle('activo', on);
        // Centrar la pastilla sin scrollIntoView, que cortaría el desplazamiento de la página
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
      text: 'PACMA sacó 228.856 votos y 0 diputados. Teruel Existe, 19.761 y 1. Mira por qué:',
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

  /* ---------- Portada: la pregunta ---------- */
  (() => {
    const opciones = $('#reto-opciones');
    const res = $('#reto-res');
    const txt = $('#reto-veredicto');
    opciones.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const acierto = b.dataset.n === '0';
      $$('button', opciones).forEach(x => {
        x.disabled = true;
        if (x.dataset.n === '0') x.classList.add('bien');
        else if (x === b) x.classList.add('mal');
      });
      res.classList.remove('misterio');
      res.classList.add('cero');
      res.innerHTML = '<b>0</b><span>diputados</span>';
      txt.innerHTML = (acierto ? 'Exacto: ' : 'Pues no: ') + '<mark>ninguno</mark>. Y no es un error. Ahora verás por qué.';
    });
  })();

  /* ---------- 1. Mapa: cuánto vale tu voto ---------- */
  (() => {
    if (!PROVINCIAS.length) return;
    const hpd = p => p.pob / p.esc; // habitantes por diputado
    const madrid = PROVINCIAS.find(p => p.n === 'Madrid');
    const soria = PROVINCIAS.find(p => p.n === 'Soria');
    const valor = p => hpd(madrid) / hpd(p); // cuántos votos de Madrid vale uno de aquí
    const nivel = p => { const v = valor(p); return v < 1.4 ? 1 : v < 2 ? 2 : v < 3 ? 3 : 4; };
    const select = $('#mi-provincia');
    const ficha = $('#ficha');
    let sel = null;

    const orden = PROVINCIAS.slice().sort((a, b) => a.n.localeCompare(b.n, 'es'));
    select.innerHTML = '<option value="">Elige tu provincia</option>' +
      orden.map(p => `<option value="${p.n}">${p.n}</option>`).join('');

    const mapa = crearMapa($('#mapa-valor'), {
      pintar: p => ({
        fondo: `var(--mapa-${nivel(p)})`,
        texto: `var(--mapa-t-${nivel(p)})`,
        etiqueta: p.esc,
        titulo: `${p.n}: ${p.esc} diputados`,
      }),
      alTocar: p => elegir(p),
    });

    const CADA = 20000;
    function personas(n) {
      let h = '';
      const llenas = Math.floor(n / CADA);
      for (let i = 0; i < llenas; i++) h += `<span class="persona">${PERSONA}</span>`;
      const resto = (n % CADA) / CADA;
      if (resto > 0.08) h += `<span class="persona" style="width:${(18 * resto).toFixed(1)}px">${PERSONA}</span>`;
      return `<div class="personas">${h}</div>`;
    }
    const fila = (p, tuya) => `<div class="gente-fila${tuya ? ' tuya' : ''}"><span>${p.n}<small>${fmt(hpd(p))}</small></span>${personas(hpd(p))}</div>`;
    const veces = v => `${pct(v)} veces`;

    function pintarFicha() {
      const filas = [];
      let frase;
      if (!sel) {
        filas.push(fila(soria), fila(madrid));
        frase = `Un voto en Soria vale <mark>${veces(valor(soria))}</mark> uno de Madrid.`;
      } else {
        filas.push(fila(sel, true));
        if (sel !== soria) filas.push(fila(soria));
        if (sel !== madrid) filas.push(fila(madrid));
        if (sel === madrid) frase = `Aquí es donde menos vale. Uno de Soria vale <mark>${veces(valor(soria))}</mark> el tuyo.`;
        else if (sel === soria) frase = `Aquí es donde más vale: <mark>${veces(valor(soria))}</mark> uno de Madrid.`;
        else frase = `Tu voto vale <mark>${veces(valor(sel))}</mark> uno de Madrid.`;
      }
      ficha.innerHTML =
        `<p class="ficha-nom">${sel ? sel.n : 'Soria y Madrid'}${sel ? `<span>${sel.esc} diputados</span>` : ''}</p>` +
        `<p class="mini-tit" style="margin-top:0">Habitantes por cada diputado · 1 muñeco = ${fmt(CADA)}</p>` +
        `<div class="gente">${filas.join('')}</div>` +
        `<p class="ficha-frase">${frase}</p>` +
        (sel ? '' : '<p class="ficha-dato" style="margin:8px 0 0">Elige tu provincia arriba o en el mapa.</p>');
    }
    function elegir(p, guardar = true) {
      sel = p;
      select.value = p ? p.n : '';
      mapa.marcar(p);
      pintarFicha();
      if (guardar) { try { localStorage.setItem('provincia', p ? p.n : ''); } catch (e) { /* sin almacenamiento */ } }
    }
    select.addEventListener('change', () => elegir(PROVINCIAS.find(p => p.n === select.value) || null));
    let guardada = null;
    try { guardada = localStorage.getItem('provincia'); } catch (e) { /* sin almacenamiento */ }
    elegir(PROVINCIAS.find(p => p.n === guardada) || null, false);
  })();

  /* ---------- 1. Torres de D'Hondt: Albacete 2023 ---------- */
  (() => {
    const ESCANOS = 4;
    const partidos = [
      { n: 'PP', v: 88299, c: 'pp' },
      { n: 'PSOE', v: 76322, c: 'psoe' },
      { n: 'VOX', v: 36750, c: 'vox' },
      { n: 'Sumar', v: 15834, c: 'sumar' },
    ];
    const MAX = partidos[0].v;
    const caja = $('#torres');
    caja.innerHTML = partidos.map(p =>
      `<div class="torre" style="--c:${color(p.c)}"><div class="torre-sillas"></div>` +
      '<div class="torre-hueco"><div class="torre-col"><b></b></div></div>' +
      `<span class="torre-nom">${p.n}</span><span class="torre-div"></span></div>`).join('') +
      '<div class="torres-corte" id="corte"><span></span></div>';
    const torres = $$('.torre', caja);
    const corte = $('#corte');
    const btn = $('#turno-btn');
    const txt = $('#turno-txt');
    const msg = $('#turno-msg');
    let escanos, turno, ocupado = false;

    const cociente = i => partidos[i].v / (escanos[i] + 1);
    const PARTES = ['votos', 'la mitad', 'un tercio', 'un cuarto', 'un quinto'];
    function dibujar() {
      partidos.forEach((p, i) => {
        const t = torres[i];
        const q = cociente(i);
        t.querySelector('.torre-col').style.setProperty('--h', (q / MAX).toFixed(4));
        t.querySelector('.torre-col b').textContent = fmt(q);
        t.querySelector('.torre-div').textContent = PARTES[escanos[i]] || `÷ ${escanos[i] + 1}`;
      });
    }
    function empezar() {
      escanos = partidos.map(() => 0);
      turno = 0;
      torres.forEach(t => { t.classList.remove('alta', 'casi'); t.querySelector('.torre-sillas').innerHTML = ''; });
      corte.classList.remove('ver');
      txt.textContent = `Turno 1 de ${ESCANOS}`;
      btn.textContent = 'Repartir';
      msg.textContent = 'Toca «Repartir» para dar el primer diputado.';
      dibujar();
    }
    btn.addEventListener('click', async () => {
      if (ocupado) return;
      if (turno === ESCANOS) { empezar(); return; }
      ocupado = true;
      // La torre más alta; si empatan, la del partido con más votos
      let g = 0;
      partidos.forEach((p, i) => {
        if (cociente(i) > cociente(g) || (cociente(i) === cociente(g) && p.v > partidos[g].v)) g = i;
      });
      const p = partidos[g];
      const q = cociente(g);
      torres.forEach((t, i) => t.classList.toggle('alta', i === g));
      msg.textContent = `La torre más alta es la del ${p.n}: diputado para el ${p.n}.`;
      await esperar(650);
      torres[g].querySelector('.torre-sillas').insertAdjacentHTML('beforeend', '<i></i>');
      escanos[g]++;
      turno++;
      await esperar(350);
      dibujar();
      torres[g].classList.remove('alta');
      if (turno < ESCANOS) {
        msg.textContent = `Diputado para el ${p.n}. Ahora su torre se parte en ${escanos[g] + 1}.`;
        txt.textContent = `Turno ${turno + 1} de ${ESCANOS}`;
      } else {
        // Raya a la altura del último diputado repartido; el primero que se queda fuera, justo debajo
        const fuera = partidos.map((_, i) => i).filter(i => !escanos[i]).sort((a, b) => cociente(b) - cociente(a))[0];
        const hueco = torres[0].querySelector('.torre-hueco');
        corte.style.top = (hueco.offsetTop + hueco.offsetHeight * (1 - q / MAX)) + 'px';
        corte.querySelector('span').textContent = `último diputado: ${fmt(q)}`;
        corte.classList.add('ver');
        torres[fuera].classList.add('casi');
        const falta = Math.floor(q) + 1 - partidos[fuera].v;
        txt.textContent = 'Reparto terminado';
        btn.textContent = 'Otra vez';
        msg.innerHTML = `${partidos[fuera].n} se queda fuera por ${fmt(falta)} votos. Sus ${fmt(partidos[fuera].v)} votos <strong>no eligen a nadie</strong>.`;
      }
      ocupado = false;
    });
    empezar();
  })();

  /* ---------- 2. Mapa de VOX 2019 → 2023 ---------- */
  (() => {
    if (!PROVINCIAS.length) return;
    const ficha = $('#ficha-vox');
    const perdio = p => (p.vox19 && p.vox23 ? p.vox19[1] - p.vox23[1] : 0);
    const noSePresento = p => p.vox19 && !p.vox23;
    const plural = n => `${n} diputado${n === 1 ? '' : 's'}`;
    const mapa = crearMapa($('#mapa-vox'), {
      pintar: p => {
        if (noSePresento(p)) return { clase: 'rayas', etiqueta: '−' + p.vox19[1], titulo: `${p.n}: no se presentó` };
        const n = perdio(p);
        if (n > 0) return { fondo: 'var(--alerta)', texto: '#fff', etiqueta: '−' + n, titulo: `${p.n}: perdió ${n}` };
        return { titulo: p.n };
      },
      alTocar: p => mostrar(p),
    });
    function mostrar(p) {
      mapa.marcar(p);
      let h = `<p class="ficha-nom">${p.n}</p>`;
      if (noSePresento(p)) {
        h += '<p class="ficha-frase" style="margin-top:6px">En 2019 sacó 1 diputado. En 2023 VOX no presentó candidatura aquí, así que este no lo perdió por el reparto: <mark>no se presentó</mark>.</p>';
      } else if (p.vox19 && p.vox23) {
        const [a, b] = [p.vox19, p.vox23];
        h += '<div class="dos-cifras" style="margin-top:10px">' +
          `<div><b>${pct(a[0])} %</b><span>2019 · ${plural(a[1])}</span></div>` +
          `<div><b class="${b[1] < a[1] ? 'alerta' : ''}">${pct(b[0])} %</b><span>2023 · ${plural(b[1])}</span></div></div>`;
        if (b[1] < a[1] && b[1] === 0) h += `<p class="ficha-frase">Con el ${pct(b[0])} % de los votos, <mark>ni un diputado</mark>.</p>`;
        else if (b[1] < a[1]) h += `<p class="ficha-frase">Bajó ${pct(a[0] - b[0])} puntos y <mark>perdió ${a[1] - b[1]}</mark>.</p>`;
        else if (!a[1]) h += '<p class="ficha-frase">Aquí no tenía diputados, ni antes ni después.</p>';
        else h += `<p class="ficha-frase">Aquí conservó ${b[1] === 1 ? 'su diputado' : `sus ${b[1]}`}.</p>`;
      }
      ficha.innerHTML = h;
    }
    mostrar(PROVINCIAS.find(p => p.n === 'Albacete'));
  })();

  /* ---------- 3. Mayorías absolutas: cuadrículas de 100 ---------- */
  (() => {
    const datos = [
      { a: 1982, n: 'PSOE', v: 48.11, s: 202, c: 'psoe' },
      { a: 1986, n: 'PSOE', v: 44.06, s: 184, c: 'psoe' },
      { a: 2000, n: 'PP', v: 44.52, s: 183, c: 'pp' },
      { a: 2011, n: 'PP', v: 44.63, s: 186, c: 'pp' },
    ];
    const botones = $('#may-anyo');
    const gv = $('#gofre-v');
    const gd = $('#gofre-d');
    const ver = $('#may-veredicto');
    botones.innerHTML = datos.map((d, i) => `<button type="button" data-i="${i}">${d.a}<small>${d.n}</small></button>`).join('');
    const cien = '<i></i>'.repeat(100);
    gv.innerHTML = cien;
    gd.innerHTML = cien;
    $$('i', gv).concat($$('i', gd)).forEach((c, i) => c.style.setProperty('--i', i % 100));
    function pintar(i) {
      const d = datos[i];
      const v = Math.round(d.v);
      const dip = Math.round(d.s / 350 * 100);
      [[gv, v], [gd, dip]].forEach(([g, n]) => {
        g.style.setProperty('--c', color(d.c));
        $$('i', g).forEach((c, k) => c.classList.toggle('on', k < n));
      });
      $('#may-v').textContent = v;
      $('#may-d').textContent = dip;
      veredicto(ver, 'no', `${d.n} ${d.a}: mandó solo`, `Le votaron ${v} de cada 100, menos de la mitad. Pero tuvo ${d.s} de 350 diputados.`);
      $$('button', botones).forEach((b, k) => { b.classList.toggle('activo', k === i); b.setAttribute('aria-pressed', k === i); });
    }
    botones.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pintar(+b.dataset.i); });
    pintar(datos.length - 1);
  })();

  /* ---------- 4. La Coruña con SALF (inventado) ---------- */
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
    const caja = $('#sim-asientos');
    const leyenda = $('#sim-leyenda');
    const pelea = $('#sim-pelea');
    const ver = $('#sim-veredicto');
    const escenarios = $('#sim-escenarios');
    caja.innerHTML = '<i></i>'.repeat(ESCANOS);
    const circulos = $$('i', caja);
    let antes = new Array(ESCANOS).fill(null);
    let disputado = -1;

    // El rival de VOX: quien se lleva el último diputado si VOX no está
    const sinVox = dhondt(partidos.filter(p => p !== vox && p !== salf), ESCANOS, VALIDOS);
    const rival = sinVox.ganan[ESCANOS - 1];

    const ESCENARIOS = [[0, 'Sin SALF'], [0.01, 'SALF saca 1 %'], [0.015, 'SALF saca 1,5 %'], [0.03, 'SALF saca 3 %']];
    escenarios.innerHTML = ESCENARIOS.map(([f, t]) => `<button type="button" data-v="${Math.round(f * VALIDOS)}">${t}</button>`).join('');
    escenarios.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      rango.value = b.dataset.v;
      pintar();
    });

    function pintar() {
      const s = +rango.value;
      vox.v = VOX0 - s;
      salf.v = s;
      salida.textContent = fmt(s);
      rango.setAttribute('aria-valuetext', `${fmt(s)} votos`);
      $$('button', escenarios).forEach(b => b.classList.toggle('activo', +b.dataset.v === s));

      const r = dhondt(partidos, ESCANOS, VALIDOS);
      const voxGana = r.por.get(vox) > 0;
      const lista = recolocar(antes, r.por, partidos);
      if (disputado < 0) disputado = lista.indexOf(vox);
      pintarAsientos(circulos, lista, antes, disputado);
      antes = lista;

      leyenda.innerHTML = partidos.filter(p => p.v > 0).map(p => {
        const bajo = p.v < r.umbral ? ' · no llega al 3 %' : '';
        return `<span><i class="chapa" style="--c:${color(p.c)}"></i>${p.n} <b>${r.por.get(p)}</b>${bajo}</span>`;
      }).join('');

      pelea.innerHTML = [
        { t: 'VOX', v: vox.v, c: 'vox' },
        { t: `${rival.p.n}, su ${rival.d}.er diputado`, v: rival.q, c: rival.p.c },
      ].map(b => `<div class="pelea-fila"><div class="rotulo"><span>${b.t}</span><b>${fmt(b.v)}</b></div>` +
        `<div class="pista"><i style="--v:${(b.v / VOX0).toFixed(4)};--c:${color(b.c)}"></i></div></div>`).join('');

      if (voxGana) {
        veredicto(ver, 'si', s ? 'VOX aún gana el último diputado' : 'VOX gana el último diputado', `Por ${fmt(vox.v - rival.q)} votos.`);
      } else {
        veredicto(ver, 'no', `VOX lo pierde. Se lo lleva el ${rival.p.n}.`,
          `VOX y SALF suman ${fmt(VOX0)} votos, los mismos de antes.` + (r.por.get(salf) ? '' : ' Y SALF no saca nada.'));
      }
    }
    rango.addEventListener('input', pintar);
    pintar();
  })();

  /* ---------- 4. Votos reales de 2023 en toda España ---------- */
  (() => {
    if (!PROVINCIAS.length) return;
    const MODOS = {
      vox: { de: 'VOX', a: 'SALF', cDe: 'vox', cA: 'salf' },
      sumar: { de: 'Sumar', a: 'Podemos', cDe: 'sumar', cA: 'podemos' },
    };
    const COLORES = { PP: 'pp', PSOE: 'psoe', VOX: 'vox', Sumar: 'sumar', SALF: 'salf', Podemos: 'podemos', ERC: 'erc', PNV: 'pnv', BNG: 'bng', UPN: 'upn' };
    const base = PROVINCIAS.map(p => repartir(p.v, p.esc, p.val));
    const rango = $('#esp-rango');
    const salida = $('#esp-out');
    const pregunta = $('#esp-pregunta');
    const resultado = $('#esp-resultado');
    const extra = $('#esp-extra');
    const caja = $('#esp');
    const diez = $('#esp-diez');
    const pie = $('#esp-pie');
    diez.innerHTML = `<span>${PERSONA}</span>`.repeat(10);
    const figuras = $$('span', diez);
    const botones = $$('#esp-modo button');
    let modo = 'vox';
    let ahora = base;

    const mapa = crearMapa($('#mapa-esp'), {
      pintar: p => {
        const i = PROVINCIAS.indexOf(p);
        const m = MODOS[modo];
        const d = (ahora[i][m.de] || 0) - (base[i][m.de] || 0);
        const g = ahora[i][m.a] || 0;
        if (d < 0) return { fondo: 'var(--alerta)', texto: '#fff', etiqueta: '−' + -d, titulo: `${p.n}: ${m.de} pierde ${-d}`, late: true };
        if (g > 0) return { fondo: color(m.cA), texto: '#fff', etiqueta: '+' + g, titulo: `${p.n}: ${m.a} gana ${g}`, late: true };
        return { titulo: p.n };
      },
    });

    function sumar(r) {
      const t = {};
      r.forEach(x => Object.entries(x).forEach(([k, v]) => { t[k] = (t[k] || 0) + v; }));
      return t;
    }
    const totalBase = sumar(base);

    function pintar() {
      const m = MODOS[modo];
      const k = +rango.value;
      caja.style.setProperty('--c', color(m.cA));
      diez.style.setProperty('--cDe', color(m.cDe));
      diez.style.setProperty('--cA', color(m.cA));
      figuras.forEach((x, i) => x.classList.toggle('va', i < k));
      salida.textContent = k ? `${k} de cada 10` : 'ninguno';
      pregunta.textContent = `¿Cuántos votantes de ${m.de} se van a ${m.a}?`;
      pie.innerHTML = `<span><i style="background:var(--alerta)"></i>${m.de} pierde</span><span><i style="background:${color(m.cA)}"></i>${m.a} gana</span>`;
      ahora = PROVINCIAS.map(p => {
        const v = { ...p.v };
        if (v[m.de]) { const x = v[m.de] * k / 10; v[m.de] -= x; v[m.a] = x; }
        return repartir(v, p.esc, p.val);
      });
      const t = sumar(ahora);
      const antesDe = totalBase[m.de] || 0;
      const nuevoDe = t[m.de] || 0;
      const nuevoA = t[m.a] || 0;
      const menos = antesDe - nuevoDe;
      resultado.innerHTML =
        `<div><span><i class="chapa" style="--c:${color(m.cDe)}"></i>${m.de}</span><b>${nuevoDe}${menos ? `<small>−${menos}</small>` : ''}</b></div>` +
        `<div><span><i class="chapa" style="--c:${color(m.cA)}"></i>${m.a}</span><b>${nuevoA}</b></div>`;
      if (!k) extra.textContent = `Mueve la barra. Ahora ${m.de} tiene sus ${antesDe} diputados de 2023.`;
      else if (!menos) extra.textContent = `Con tan poco, ${m.de} aún no pierde ninguno.`;
      else {
        const ganan = Object.keys(t).filter(x => x !== m.a && t[x] > (totalBase[x] || 0));
        extra.innerHTML = `${m.de} pierde ${menos} y ${nuevoA ? `${m.a} solo saca ${nuevoA}` : `${m.a} no saca ninguno`}. Se los quedan:` +
          ganan.map(x => `<span class="pastilla"><i class="chapa" style="--c:${color(COLORES[x] || 'otros')}"></i>${x} +${t[x] - (totalBase[x] || 0)}</span>`).join('');
      }
      mapa.repintar();
    }
    botones.forEach(b => b.addEventListener('click', () => {
      modo = b.dataset.modo;
      botones.forEach(x => { x.classList.toggle('activo', x === b); x.setAttribute('aria-pressed', x === b); });
      pintar();
    }));
    rango.addEventListener('input', pintar);
    pintar();
  })();

  /* ---------- 5. Senado ---------- */
  (() => {
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
    const MAX = 60;
    const datos = [
      { n: 'PP', v: 34.54, s: 120, c: 'pp' },
      { n: 'PSOE', v: 32.24, s: 72, c: 'psoe' },
      { n: 'Sumar', v: 11.08, s: 0, c: 'sumar' },
      { n: 'VOX', v: 10.64, s: 0, c: 'vox' },
    ];
    $('#senado-graf').innerHTML = datos.map(d => {
      const ps = d.s / ELEGIDOS * 100;
      return `<div class="par"><div class="rotulo"><span class="chapa" style="--c:${color(d.c)}"></span>${d.n}</div>` +
        `<div class="linea"><div class="pista"><i style="--v:${d.v / MAX};--c:var(--gris)"></i></div><b>${pct(d.v)} %</b></div>` +
        `<div class="linea"><div class="pista"><i class="${d.s ? '' : 'nada'}" style="--v:${ps / MAX};--c:${color(d.c)}"></i></div>` +
        `<b class="${d.s ? '' : 'cero'}">${d.s ? pct(ps) : '0'} %</b></div></div>`;
    }).join('');
  })();

  /* ---------- 6. No votar: Albacete si parte del PSOE se queda en casa ---------- */
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
    const ver = $('#casa-veredicto');
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
        veredicto(ver, 'no', 'El PSOE pierde un diputado… y se lo lleva VOX', `Bastan ${fmt(critico)} votantes en casa. VOX no ha ganado ni un voto.`);
      } else if (!s) {
        veredicto(ver, '', 'Lo que pasó: 2 para el PP y 2 para el PSOE', 'Mueve la barra.');
      } else {
        veredicto(ver, '', 'El PSOE aún conserva sus 2 diputados', `Margen: ${fmt(critico - s)} votantes más.`);
      }
    }
    rango.addEventListener('input', pintar);
    pintar();
  })();

  /* ---------- 7. Listas cerradas: papeleta que se anula al tachar ---------- */
  (() => {
    const NOMBRES = ['Ana García', 'Luis Martín', 'Marta López', 'Javier Ruiz', 'Lucía Sánchez', 'Pablo Gómez', 'Elena Díaz', 'Carlos Moreno'];
    const ENTRAN = 3;
    const lista = $('#pap-lista');
    const papeleta = $('#papeleta');
    const msg = $('#pap-msg');
    const inicial = msg.textContent;
    lista.innerHTML = NOMBRES.map((n, i) =>
      `<li><button type="button" aria-pressed="false"><span>${n}</span>${i < ENTRAN ? '<em>entra</em>' : ''}</button></li>`).join('');
    lista.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const on = b.parentElement.classList.toggle('tachado');
      b.setAttribute('aria-pressed', on);
      const nulo = !!$('li.tachado', lista);
      papeleta.classList.toggle('nulo', nulo);
      msg.innerHTML = nulo ? 'Tu voto ya no cuenta: <mark>es nulo</mark>. Toca otra vez para deshacerlo.' : inicial;
    });
  })();

  /* ---------- 8. Carrusel de casos ---------- */
  (() => {
    const CASOS = [
      {
        anyo: 'Noviembre 2019', t: 'Casi el doble de votos… y menos diputados.',
        f: [{ n: 'Ciudadanos', v: 1650318, s: 10, c: 'cs' }, { n: 'ERC', v: 880734, s: 13, c: 'erc' }],
        r: 'ERC: <mark>3 más con la mitad de votos.</mark>',
      },
      {
        anyo: '2015', t: 'El triple de votos y un tercio de los diputados.',
        f: [{ n: 'IU', v: 926783, s: 2, c: 'iu' }, { n: 'PNV', v: 302316, s: 6, c: 'pnv' }],
        r: 'Cada diputado de IU costó 463.000 votos. <mark>Uno del PNV, 50.000.</mark>',
      },
      {
        anyo: '2023', t: 'Más del triple de votos y ninguno.',
        f: [{ n: 'PACMA', v: 169237, s: 0, c: 'pacma' }, { n: 'UPN', v: 52188, s: 1, c: 'upn' }],
        r: '<mark>169.237 votos</mark> que no eligieron a nadie.',
      },
      {
        anyo: '2019', t: 'De 57 a 10 diputados en seis meses.',
        f: [{ n: 'Cs · abril', v: 4155665, s: 57, c: 'cs' }, { n: 'Cs · noviembre', v: 1650318, s: 10, c: 'cs' }],
        r: 'Perdió el 60 % de los votos <mark>y el 82 % de los diputados.</mark>',
      },
      {
        anyo: 'Ceuta · 2023', t: 'Un solo diputado: el que gana se lo lleva todo.',
        f: [{ n: 'PP', v: 12918, s: 1, c: 'pp' }, { n: 'PSOE', v: 11332, s: 0, c: 'psoe' }, { n: 'VOX', v: 7752, s: 0, c: 'vox' }],
        r: '<mark>6 de cada 10 votos</mark> no eligieron a nadie. En Melilla, 5 de cada 10.',
      },
    ];
    const carrusel = $('#carrusel');
    const puntitos = $('#puntitos');
    carrusel.innerHTML = CASOS.map((k, i) => {
      const max = Math.max(...k.f.map(x => x.v));
      return `<article class="caso revelar" aria-label="Caso ${i + 1} de ${CASOS.length}"><p class="anyo">${k.anyo}</p><h3>${k.t}</h3>` +
        k.f.map(x => `<div class="grupo"><div class="cab"><b><span class="chapa" style="--c:${color(x.c)}"></span>${x.n}</b>` +
          `<span>${fmt(x.v)} votos</span></div>` +
          `<div class="pista"><i style="--v:${(x.v / max).toFixed(4)};--c:${color(x.c)}"></i></div>` +
          `<div class="esc"><strong class="${x.s ? '' : 'cero'}">${x.s}</strong>${x.s ? puntosHTML(x.s, x.c) : '<span class="ninguno">ningún diputado</span>'}</div></div>`
        ).join('') +
        `<p class="remate-caso">${k.r}</p></article>`;
    }).join('');
    const tarjetas = $$('.caso', carrusel);
    tarjetas.forEach(observar);
    puntitos.innerHTML = CASOS.map((_, i) => `<button type="button" aria-label="Ir al caso ${i + 1}"></button>`).join('');
    const pts = $$('button', puntitos);
    const actual = () => {
      const paso = tarjetas.length > 1 ? tarjetas[1].offsetLeft - tarjetas[0].offsetLeft : 1;
      return Math.max(0, Math.min(tarjetas.length - 1, Math.round(carrusel.scrollLeft / paso)));
    };
    const marcar = () => { const a = actual(); pts.forEach((b, i) => b.classList.toggle('activo', i === a)); };
    pts.forEach((b, i) => b.addEventListener('click', () =>
      carrusel.scrollTo({ left: tarjetas[i].offsetLeft - tarjetas[0].offsetLeft, behavior: quieto ? 'auto' : 'smooth' })));
    carrusel.addEventListener('scroll', marcar, { passive: true });
    marcar();
  })();

  /* ---------- 9. Hemiciclo: real frente a proporcional (2023) ---------- */
  (() => {
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

    // Filas concéntricas con asientos proporcionales al radio, ordenados por ángulo
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

    const real = [];
    PARTIDOS.forEach(p => { for (let i = 0; i < p.real; i++) real.push(p); });
    // Reparto proporcional sin mover a nadie: cada asiento perdido pasa al partido que lo gana,
    // eligiendo los asientos más cercanos a ese partido
    const igual = real.slice();
    const sobra = new Map(PARTIDOS.map(p => [p, Math.max(0, p.real - p.igual)]));
    const ganan = PARTIDOS.filter(p => p.igual > p.real).sort((a, b) => (a.igual - a.real) - (b.igual - b.real));
    for (const g of ganan) {
      const suyos = real.map((p, i) => (p === g ? i : -1)).filter(i => i >= 0);
      const hueco = PARTIDOS.slice(0, PARTIDOS.indexOf(g)).reduce((a, p) => a + p.real, 0);
      const ang = suyos.length ? suyos.reduce((a, i) => a + pts[i].a, 0) / suyos.length : pts[Math.min(hueco, TOTAL - 1)].a;
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
    const botones = $$('#hemi-modo button');
    let modo = 'real';
    let foco = null;

    function rotuloCentro() {
      const lista = modo === 'real' ? real : igual;
      centro.textContent = foco ? lista.filter(p => p.n === foco).length : TOTAL;
      sub.textContent = foco ? `diputados de ${foco}` : 'diputados · mayoría: 176';
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
      cambiosTxt.innerHTML = modo === 'igual' ? `<mark>${cambian} diputados</mark> cambiarían de partido` : 'Así quedó el Congreso en 2023';
      leyenda.innerHTML = GRUPOS.map(g => {
        const n = suma(modo, g.k);
        const d = n - suma('real', g.k);
        const dif = modo === 'igual' && d ? ` <em>(${d > 0 ? '+' : '−'}${Math.abs(d)})</em>` : '';
        return `<span><i class="chapa" style="--c:${color(g.k)}"></i>${g.n} <b>${n}</b>${dif}</span>`;
      }).join('');
      const filas = PARTIDOS.slice().sort((a, b) => b.real - a.real || b.igual - a.igual);
      tabla.innerHTML = '<thead><tr><th>Partido</th><th>Real</th><th>Voto igual</th><th>Diferencia</th></tr></thead><tbody>' +
        filas.map(d => {
          const dif = d.igual - d.real;
          const cls = dif > 0 ? 'mas' : dif < 0 ? 'menos' : 'igual';
          const txt = dif > 0 ? `+${dif}` : dif < 0 ? `−${-dif}` : '=';
          return `<tr><td><span class="chapa" style="--c:${color(d.g)};margin-right:6px"></span>${d.n}</td><td>${d.real}</td><td>${d.igual}</td><td class="${cls}">${txt}</td></tr>`;
        }).join('') + '</tbody>';
      botones.forEach(b => { const on = b.dataset.modo === modo; b.classList.toggle('activo', on); b.setAttribute('aria-pressed', on); });
      rotuloCentro();
    }
    function enfocar(p) {
      foco = p;
      circulos.forEach(c => { c.style.opacity = p ? (c.dataset.p === p ? 1 : 0.2) : ''; });
      rotuloCentro();
    }
    botones.forEach(b => b.addEventListener('click', () => { enfocar(null); pintar(b.dataset.modo); }));
    svg.addEventListener('pointerover', e => {
      const p = e.target.dataset ? e.target.dataset.p || null : null;
      if (p !== foco) enfocar(p);
    });
    svg.addEventListener('pointerleave', () => enfocar(null));
    pintar('real');
  })();
})();
