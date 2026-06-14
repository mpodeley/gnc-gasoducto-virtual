/* Simulador de Flota — Gasoducto Virtual (GNC)
   Sitio estático, sin dependencias. Cuatro regiones:
   1) COMPUTE (puro, sin DOM)  2) STATE  3) RENDER  4) ANIMATION
*/
(function () {
  "use strict";

  /* =======================================================================
     1) COMPUTE — función pura, única fuente de verdad
     ======================================================================= */

  // Definición de parámetros editables (orden = orden en pantalla)
  const PARAMS = [
    { key: "demandaDiaria",  label: "Demanda diaria",      unit: "m³/d",  min: 80000,  max: 300000, step: 5000, def: 140000, dec: 0 },
    { key: "distanciaKm",    label: "Distancia (una vía)", unit: "km",    min: 20,     max: 250,    step: 5,    def: 70,     dec: 0 },
    { key: "capacidadJumbo", label: "Capacidad por jumbo", unit: "m³",    min: 5500,   max: 7000,   step: 100,  def: 6000,   dec: 0 },
    { key: "nameplate",      label: "Nameplate estación",  unit: "m³/h",  min: 6000,   max: 24000,  step: 500,  def: 12000,  dec: 0 },
    { key: "surtidores",     label: "Surtidores",          unit: "",      min: 2,      max: 4,      step: 1,    def: 3,      dec: 0 },
    { key: "tasaDescarga",   label: "Tasa de descarga",    unit: "m³/h",  min: 2000,   max: 6000,   step: 250,  def: 4000,   dec: 0 },
    { key: "velocidadMedia", label: "Velocidad media",     unit: "km/h",  min: 40,     max: 70,     step: 1,    def: 50,     dec: 0 },
    { key: "horasOperacion", label: "Horas de operación",  unit: "h/d",   min: 12,     max: 24,     step: 1,    def: 24,     dec: 0 },
    { key: "tiempoManiobra", label: "Maniobra / enganche", unit: "h",     min: 0.15,   max: 0.5,    step: 0.05, def: 0.25,   dec: 2 },
    { key: "staging",        label: "Jumbos en staging",   unit: "",      min: 1,      max: 3,      step: 1,    def: 2,      dec: 0 },
    { key: "spare",          label: "Spare de flota",      unit: "",      min: 0,      max: 2,      step: 1,    def: 0,      dec: 0 },
  ];

  // computeFleet: params -> resultados. 'desenganche' true = drop-and-hook.
  function computeFleet(p) {
    const H = p.horasOperacion;
    const n = p.demandaDiaria / p.capacidadJumbo;          // viajes/día (continuo)
    const tasaCarga = p.nameplate / p.surtidores;          // m³/h por surtidor
    const tL = p.capacidadJumbo / tasaCarga;               // h de carga por jumbo
    const tU = p.capacidadJumbo / p.tasaDescarga;          // h de descarga en el set
    const tTr = p.distanciaKm / p.velocidadMedia;          // h de viaje (una vía)
    const m = p.tiempoManiobra;

    // Inventario en flujo (ley de Little por etapa)
    const Ist = (n * tL) / H;
    const Iset = (n * tU) / H;
    const Itr = (n * 2 * tTr) / H;
    const Iman = (n * 2 * m) / H;
    const Iflow = Ist + Iset + Itr + Iman;

    let nJumbos, nTractores, cicloHoras;
    if (p.desenganche) {
      // El tractor no espera carga/descarga: solo lanza jumbos.
      nJumbos = Math.ceil(Iflow + p.staging) + p.spare;
      cicloHoras = 2 * tTr + 2 * m;                        // ciclo del tractor (shuttle)
      nTractores = Math.ceil((n * cicloHoras) / H) + p.spare;
    } else {
      // Tractor + jumbo = unidad fija; el tractor espera carga y descarga.
      cicloHoras = tL + tU + 2 * tTr + 2 * m;              // ciclo del rig completo
      nJumbos = Math.ceil((n * cicloHoras) / H) + p.spare;
      nTractores = nJumbos;
    }

    const utilizacionEstacion = (n * tL) / (p.surtidores * H);
    const nameplateDiario = p.nameplate * H;
    const usoNameplate = p.demandaDiaria / nameplateDiario;

    return {
      desenganche: !!p.desenganche, distanciaKm: p.distanciaKm,
      n, tasaCarga, tL, tU, tTr, m,
      Iflow, nJumbos, nTractores, cicloHoras,
      utilizacionEstacion, nameplateDiario, usoNameplate,
      surtidores: p.surtidores, staging: p.staging,
    };
  }

  // Computa los 4 escenarios (2 políticas × {activa, 70, 170})
  function computeAll(state) {
    const mk = (deseng, dist) => computeFleet(Object.assign({}, state, { desenganche: deseng, distanciaKm: dist }));
    return {
      A: { active: mk(true, state.distanciaKm),  d70: mk(true, 70),  d170: mk(true, 170) },
      B: { active: mk(false, state.distanciaKm), d70: mk(false, 70), d170: mk(false, 170) },
    };
  }

  /* =======================================================================
     2) STATE
     ======================================================================= */

  const defaults = {};
  PARAMS.forEach((p) => (defaults[p.key] = p.def));

  const state = Object.assign({}, defaults);
  let animPolicy = "A"; // política mostrada en animación + gráfico
  let current = null;   // último computeAll()

  // Formato es-AR
  const fmtInt = (x) => Math.round(x).toLocaleString("es-AR");
  const fmt1 = (x) => x.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtPct = (x) => (x * 100).toLocaleString("es-AR", { maximumFractionDigits: 0 }) + "%";

  /* =======================================================================
     3) RENDER
     ======================================================================= */

  const el = (id) => document.getElementById(id);

  function buildParamControls() {
    const grid = el("paramGrid");
    grid.innerHTML = "";
    PARAMS.forEach((p) => {
      const wrap = document.createElement("div");
      wrap.className = "param";
      wrap.innerHTML =
        '<div class="param-top">' +
          '<span class="param-label">' + p.label + "</span>" +
          '<span class="param-valwrap">' +
            '<input class="param-input" type="number" id="num-' + p.key + '" ' +
              'min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" />' +
            '<span class="param-unit">' + p.unit + "</span>" +
          "</span>" +
        "</div>" +
        '<input type="range" id="rng-' + p.key + '" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" />';
      grid.appendChild(wrap);

      const rng = el("rng-" + p.key);
      const num = el("num-" + p.key);
      const onChange = (raw) => {
        let v = parseFloat(raw);
        if (isNaN(v)) return;
        v = Math.min(p.max, Math.max(p.min, v));
        state[p.key] = v;
        syncControl(p);
        recompute();
      };
      rng.addEventListener("input", (e) => onChange(e.target.value));
      num.addEventListener("change", (e) => onChange(e.target.value));
    });
  }

  function syncControl(p) {
    const rng = el("rng-" + p.key);
    const num = el("num-" + p.key);
    const v = state[p.key];
    rng.value = v;
    num.value = p.dec ? v.toFixed(p.dec) : v;
  }

  function syncAllControls() {
    PARAMS.forEach(syncControl);
    // chips de distancia rápida
    document.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("is-active", Number(c.dataset.dist) === state.distanciaKm);
    });
  }

  function renderScenarioCard(prefix, r) {
    el(prefix + "-jumbos").textContent = fmtInt(r.nJumbos);
    el(prefix + "-tractores").textContent = fmtInt(r.nTractores);
    el(prefix + "-util").textContent = fmtPct(r.utilizacionEstacion);
    el(prefix + "-ciclo").textContent = fmt1(r.cicloHoras);
    el(prefix + "-viajes").textContent = fmtInt(Math.ceil(r.n));
  }

  function renderNotes(a, b) {
    el("A-note").textContent =
      "Pocos tractores siempre en ruta (" + fmtInt(a.nTractores) +
      "); jumbos extra cargan/descargan en paralelo (" + fmtInt(a.nJumbos) + " en juego).";
    el("B-note").textContent =
      "Cada tractor queda inmovilizado durante carga y descarga: rig fijo de " +
      fmtInt(b.nTractores) + " tractores = " + fmtInt(b.nJumbos) + " jumbos.";
  }

  // Gráfico de barras agrupadas (SVG), política activa: Jumbos {70,170}, Tractores {70,170}
  function renderChart(r70, r170) {
    const svg = el("chart");
    const W = 520, Hh = 300, padL = 44, padR = 16, padT = 24, padB = 56;
    const plotW = W - padL - padR, plotH = Hh - padT - padB;
    const groups = [
      { name: "Jumbos", a: r70.nJumbos, b: r170.nJumbos },
      { name: "Tractores", a: r70.nTractores, b: r170.nTractores },
    ];
    const maxV = Math.max(1, ...groups.map((g) => Math.max(g.a, g.b)));
    const niceMax = Math.ceil(maxV / 2) * 2;
    const y = (v) => padT + plotH - (v / niceMax) * plotH;

    let s = "";
    // ejes y grilla
    for (let i = 0; i <= niceMax; i += Math.max(1, Math.round(niceMax / 5))) {
      const yy = y(i);
      s += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#e3eaef" />';
      s += '<text x="' + (padL - 8) + '" y="' + (yy + 4) + '" font-size="11" fill="#465561" text-anchor="end">' + i + "</text>";
    }
    const gw = plotW / groups.length;
    const bw = gw * 0.26;
    groups.forEach((g, gi) => {
      const cx = padL + gw * gi + gw / 2;
      const x70 = cx - bw - 4, x170 = cx + 4;
      [["a", x70, "#0D7B9E", "70 km"], ["b", x170, "#0A3A50", "170 km"]].forEach((d) => {
        const v = g[d[0]], yy = y(v);
        s += '<rect x="' + d[1] + '" y="' + yy + '" width="' + bw + '" height="' + (padT + plotH - yy) + '" rx="3" fill="' + d[2] + '" />';
        s += '<text x="' + (d[1] + bw / 2) + '" y="' + (yy - 5) + '" font-size="12" font-weight="bold" fill="#1F2A33" text-anchor="middle">' + fmtInt(v) + "</text>";
      });
      s += '<text x="' + cx + '" y="' + (padT + plotH + 18) + '" font-size="12" fill="#1F2A33" text-anchor="middle" font-weight="bold">' + g.name + "</text>";
    });
    // leyenda
    s += '<rect x="' + padL + '" y="' + (Hh - 18) + '" width="11" height="11" rx="2" fill="#0D7B9E" />';
    s += '<text x="' + (padL + 16) + '" y="' + (Hh - 9) + '" font-size="11" fill="#465561">70 km</text>';
    s += '<rect x="' + (padL + 70) + '" y="' + (Hh - 18) + '" width="11" height="11" rx="2" fill="#0A3A50" />';
    s += '<text x="' + (padL + 86) + '" y="' + (Hh - 9) + '" font-size="11" fill="#465561">170 km</text>';
    svg.innerHTML = s;
  }

  function renderTable(r70, r170) {
    const tbody = document.querySelector("#tablaSens tbody");
    const delta = (a, b) => (a === 0 ? "—" : "+" + Math.round(((b - a) / a) * 100) + "%");
    const rows = [
      ["Jumbos", fmtInt(r70.nJumbos), fmtInt(r170.nJumbos), delta(r70.nJumbos, r170.nJumbos)],
      ["Tractores", fmtInt(r70.nTractores), fmtInt(r170.nTractores), delta(r70.nTractores, r170.nTractores)],
      ["Ciclo (h)", fmt1(r70.cicloHoras), fmt1(r170.cicloHoras), delta(r70.cicloHoras, r170.cicloHoras)],
    ];
    tbody.innerHTML = rows
      .map((r) => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td></tr>")
      .join("");
    el("sensCheck").textContent =
      "Estación: usa " + fmtPct(r70.usoNameplate) + " del nameplate diario (" +
      fmtInt(r70.nameplateDiario) + " m³/d). Carga simultánea máx.: " + r70.surtidores + " jumbos.";
  }

  function render() {
    if (!current) return; // aún sin datos (p. ej. setPolicy durante init)
    renderScenarioCard("A", current.A.active);
    renderScenarioCard("B", current.B.active);
    renderNotes(current.A.active, current.B.active);

    const pol = current[animPolicy];
    renderChart(pol.d70, pol.d170);
    renderTable(pol.d70, pol.d170);

    el("activeDistLabel").textContent = fmtInt(state.distanciaKm);
    el("sensPolicyLabel").textContent =
      "— " + (animPolicy === "A" ? "con desenganche" : "sin desenganche");

    // alimentar animación
    Anim.setData(pol.active, animPolicy);
  }

  function recompute() {
    current = computeAll(state);
    render();
  }

  /* =======================================================================
     4) ANIMATION (canvas + requestAnimationFrame)
     ======================================================================= */

  const Anim = (function () {
    const SPH = 1.6;          // segundos de pantalla por hora real
    const MAX_CABS = 6;       // tope de tractores dibujados
    const MAX_YARD = 5;       // tope de jumbos extra en patio (política A)

    let canvas, ctx, W = 0, Hc = 0, dpr = 1;
    let clock = 0, last = 0, speed = 1, running = true, rafId = null;
    let data = null, policy = "A";
    let reduced = false;

    function init() {
      canvas = el("scene");
      ctx = canvas.getContext("2d");
      reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      resize();
      window.addEventListener("resize", resize);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else if (running) startLoop();
      });
      if (reduced) { running = false; el("btnPlay").textContent = "Reproducir"; }
      startLoop();
    }

    function resize() {
      const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 900;
      const cssH = Math.max(220, Math.round(cssW * 0.40));
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = cssW; Hc = cssH;
      draw();
    }

    function setData(r, pol) {
      data = r; policy = pol;
      // caption
      el("animCaption").textContent =
        fmtInt(r.nTractores) + " tractores · " + fmtInt(r.nJumbos) + " jumbos · " +
        "viaje " + fmt1(r.tTr) + " h · ciclo " + fmt1(r.cicloHoras) + " h" +
        (policy === "A" ? " · tractores siempre en ruta" : " · tractores esperan carga/descarga");
      if (!running) draw(); // refrescar frame estático
    }

    function startLoop() {
      if (rafId) return;
      last = 0;
      rafId = requestAnimationFrame(frame);
    }
    function stop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

    function frame(ts) {
      if (!last) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      if (running) clock += dt * speed;
      draw();
      rafId = requestAnimationFrame(frame);
    }

    // ---- geometría ----
    function layout() {
      return {
        stationX: W * 0.13,
        setX: W * 0.87,
        yTop: Hc * 0.40,     // carril ida
        yBottom: Hc * 0.62,  // carril vuelta
        yMid: Hc * 0.51,
        yard: { x: W * 0.235, y0: Hc * 0.30, dy: Hc * 0.13 },
      };
    }

    function phaseAt(segs, t) {
      let total = 0;
      for (const s of segs) total += s.dur;
      if (total <= 0) return { key: segs[0].key, p: 0 };
      let tm = ((t % total) + total) % total;
      for (const s of segs) { if (tm < s.dur) return { key: s.key, p: s.dur ? tm / s.dur : 0 }; tm -= s.dur; }
      return { key: segs[segs.length - 1].key, p: 1 };
    }
    const lerp = (a, b, p) => a + (b - a) * p;

    // ---- dibujo de piezas ----
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawTrailer(cx, cy, fill) {
      const tw = 50, th = 20;
      const x = cx - tw / 2, y = cy - th / 2;
      // cuerpo
      ctx.fillStyle = "#ffffff";
      roundRect(x, y, tw, th, 4); ctx.fill();
      // gas cargado (de izquierda a derecha)
      if (fill > 0) {
        ctx.fillStyle = "rgba(176,104,15,0.85)";
        roundRect(x + 1.5, y + 1.5, (tw - 3) * Math.max(0, Math.min(1, fill)), th - 3, 3); ctx.fill();
      }
      // borde + tubos
      ctx.strokeStyle = "#0D7B9E"; ctx.lineWidth = 2;
      roundRect(x, y, tw, th, 4); ctx.stroke();
      ctx.strokeStyle = "rgba(13,123,158,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 3, cy); ctx.lineTo(x + tw - 3, cy);
      ctx.stroke();
      // ruedas
      ctx.fillStyle = "#2b3942";
      ctx.beginPath(); ctx.arc(x + 10, y + th, 3, 0, 7); ctx.arc(x + tw - 8, y + th, 3, 0, 7); ctx.fill();
    }

    function drawCab(cx, cy, dir) {
      const cw = 18, ch = 18;
      const x = cx - cw / 2, y = cy - ch / 2;
      ctx.fillStyle = "#0A3A50";
      roundRect(x, y, cw, ch, 4); ctx.fill();
      // ventana mirando hacia la dirección
      ctx.fillStyle = "#bfe0ee";
      const wx = dir > 0 ? x + cw - 6 : x + 2;
      roundRect(wx, y + 3, 4, 6, 1); ctx.fill();
      ctx.fillStyle = "#2b3942";
      ctx.beginPath(); ctx.arc(x + 5, y + ch, 3, 0, 7); ctx.arc(x + cw - 5, y + ch, 3, 0, 7); ctx.fill();
    }

    // rig = jumbo + tractor (tractor lidera según dir)
    function drawRig(cx, cy, dir, fill) {
      drawTrailer(cx, cy, fill);
      drawCab(cx + dir * (50 / 2 + 18 / 2 - 2), cy, dir);
    }

    function drawStation(L) {
      const x = L.stationX, w = 92, h = 64;
      const bx = x - w / 2, by = Hc * 0.13;
      ctx.fillStyle = "#0A3A50";
      roundRect(bx, by, w, h, 8); ctx.fill();
      ctx.fillStyle = "#cfe1ea";
      ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
      ctx.fillText("Estación", x, by + 16);
      ctx.fillText("de carga", x, by + 30);
      // surtidores
      const nd = data ? data.surtidores : 3;
      ctx.fillStyle = "#0D7B9E";
      const startX = x - ((nd - 1) * 10) / 2;
      for (let i = 0; i < nd; i++) {
        roundRect(startX + i * 10 - 3, by + h - 14, 6, 10, 2); ctx.fill();
      }
    }

    function drawSet(L) {
      const x = L.setX, w = 96, h = 64;
      const bx = x - w / 2, by = Hc * 0.13;
      ctx.fillStyle = "#B0680F";
      roundRect(bx, by, w, h, 8); ctx.fill();
      ctx.fillStyle = "#ffe9cf";
      ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
      ctx.fillText("Set de", x, by + 16);
      ctx.fillText("fractura", x, by + 30);
      // indicador de consumo
      ctx.fillStyle = "#2E8B57";
      ctx.fillText("⛽ consumo", x, by + h - 8);
    }

    function drawRoad(L) {
      ctx.strokeStyle = "#c6d2da"; ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(L.stationX, L.yTop); ctx.lineTo(L.setX, L.yTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L.stationX, L.yBottom); ctx.lineTo(L.setX, L.yBottom); ctx.stroke();
      ctx.setLineDash([]);
      // etiqueta de distancia
      ctx.fillStyle = "#465561"; ctx.font = "11px Arial"; ctx.textAlign = "center";
      ctx.fillText(fmtInt(data ? data.distanciaKm : 70) + " km", (L.stationX + L.setX) / 2, L.yMid + 4);
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, Hc);
      const L = layout();
      drawRoad(L);
      drawStation(L);
      drawSet(L);
      if (!data) return;

      const tL = data.tL, tU = data.tU, tTr = data.tTr, m = data.m;
      const nShown = Math.max(1, Math.min(MAX_CABS, data.nTractores));

      if (policy === "B") {
        // Rig fijo: load (parado) -> out -> unload (parado) -> ret
        const segs = [
          { key: "load", dur: tL * SPH },
          { key: "out", dur: tTr * SPH },
          { key: "unload", dur: tU * SPH },
          { key: "ret", dur: tTr * SPH },
        ];
        const cycle = segs.reduce((a, s) => a + s.dur, 0);
        for (let i = 0; i < nShown; i++) {
          const ph = phaseAt(segs, clock + (i / nShown) * cycle);
          let x, y, dir, fill;
          if (ph.key === "load") { x = L.stationX; y = L.yTop; dir = 1; fill = ph.p; }
          else if (ph.key === "out") { x = lerp(L.stationX, L.setX, ph.p); y = L.yTop; dir = 1; fill = 1; }
          else if (ph.key === "unload") { x = L.setX; y = L.yBottom; dir = -1; fill = 1 - ph.p; }
          else { x = lerp(L.setX, L.stationX, ph.p); y = L.yBottom; dir = -1; fill = 0; }
          drawRig(x, y, dir, fill);
        }
      } else {
        // Política A: cabs siempre en ruta + patio de jumbos cargando en paralelo
        // patio (jumbos extra)
        const extras = Math.max(0, Math.min(MAX_YARD, data.nJumbos - data.nTractores));
        const yardSegs = [{ key: "fill", dur: tL * SPH }, { key: "hold", dur: 0.6 * SPH }];
        const yardCycle = yardSegs.reduce((a, s) => a + s.dur, 0);
        for (let i = 0; i < extras; i++) {
          const ph = phaseAt(yardSegs, clock + (i / Math.max(1, extras)) * yardCycle);
          const fill = ph.key === "fill" ? ph.p : 1;
          drawTrailer(L.yard.x, L.yard.y0 + i * L.yard.dy, fill);
        }
        // cabs shuttle: swapS -> out(full) -> swapE -> ret(empty)
        const segs = [
          { key: "swapS", dur: m * SPH },
          { key: "out", dur: tTr * SPH },
          { key: "swapE", dur: m * SPH },
          { key: "ret", dur: tTr * SPH },
        ];
        const cycle = segs.reduce((a, s) => a + s.dur, 0);
        for (let i = 0; i < nShown; i++) {
          const ph = phaseAt(segs, clock + (i / nShown) * cycle);
          let x, y, dir, fill;
          if (ph.key === "swapS") { x = L.stationX; y = L.yTop; dir = 1; fill = ph.p; }
          else if (ph.key === "out") { x = lerp(L.stationX, L.setX, ph.p); y = L.yTop; dir = 1; fill = 1; }
          else if (ph.key === "swapE") { x = L.setX; y = L.yBottom; dir = -1; fill = 1 - ph.p; }
          else { x = lerp(L.setX, L.stationX, ph.p); y = L.yBottom; dir = -1; fill = 0; }
          drawRig(x, y, dir, fill);
        }
      }
    }

    function togglePlay() {
      running = !running;
      el("btnPlay").textContent = running ? "Pausar" : "Reproducir";
      if (running) { last = 0; }
    }
    function cycleSpeed() {
      speed = speed === 1 ? 2 : 1;
      el("btnSpeed").textContent = speed + "×";
    }

    return { init, setData, togglePlay, cycleSpeed };
  })();

  /* =======================================================================
     URL deep-link
     ======================================================================= */

  function loadFromURL() {
    const q = new URLSearchParams(window.location.search);
    PARAMS.forEach((p) => {
      if (q.has(p.key)) {
        const v = parseFloat(q.get(p.key));
        if (!isNaN(v)) state[p.key] = Math.min(p.max, Math.max(p.min, v));
      }
    });
    if (q.get("pol") === "B") animPolicy = "B";
  }

  function buildShareLink() {
    const q = new URLSearchParams();
    PARAMS.forEach((p) => q.set(p.key, state[p.key]));
    q.set("pol", animPolicy);
    return window.location.origin + window.location.pathname + "?" + q.toString();
  }

  /* =======================================================================
     Wiring
     ======================================================================= */

  function setPolicy(pol) {
    animPolicy = pol;
    document.querySelectorAll("#policyToggle .seg-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.policy === pol);
    });
    render();
  }

  function init() {
    buildParamControls();
    loadFromURL();
    syncAllControls();

    // chips de distancia
    document.querySelectorAll(".chip").forEach((c) => {
      c.addEventListener("click", () => {
        state.distanciaKm = Number(c.dataset.dist);
        syncControl(PARAMS.find((p) => p.key === "distanciaKm"));
        syncAllControls();
        recompute();
      });
    });

    // toggle política
    document.querySelectorAll("#policyToggle .seg-btn").forEach((b) => {
      b.addEventListener("click", () => setPolicy(b.dataset.policy));
    });
    setPolicy(animPolicy);

    // botones
    el("btnReset").addEventListener("click", () => {
      Object.assign(state, defaults);
      animPolicy = "A";
      syncAllControls();
      setPolicy("A");
    });
    el("btnPrint").addEventListener("click", () => window.print());
    el("btnPlay").addEventListener("click", () => Anim.togglePlay());
    el("btnSpeed").addEventListener("click", () => Anim.cycleSpeed());
    el("btnLink").addEventListener("click", () => {
      const link = buildShareLink();
      const done = () => (el("btnLink").textContent = "¡Enlace copiado!");
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => prompt("Copiá el enlace:", link));
      else prompt("Copiá el enlace:", link);
      setTimeout(() => (el("btnLink").textContent = "Copiar enlace de este escenario"), 2500);
    });

    Anim.init();
    recompute();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  // exponer para pruebas en consola / Node
  if (typeof window !== "undefined") window.computeFleet = computeFleet;
  if (typeof module !== "undefined" && module.exports) module.exports = { computeFleet, PARAMS };
})();
