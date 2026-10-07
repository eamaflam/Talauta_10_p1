/* ============================================================
 * Dashboard de desempeño – Simulacro Saber 11
 * ============================================================ */
const ITEM_MAP = {};
ITEMS.forEach(([n, area, resp, nivel, desc]) => (ITEM_MAP[n] = { n, area, resp, nivel, desc }));

const LEVEL_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
const AVATAR_COLORS = ["#6366f1", "#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#3b82f6", "#f97316"];

const state = { students: [], scored: [], quiz: "", klass: "", view: "grupo", current: null, area: "LC", charts: [], sort: "name" };

/* ---------------- Utilidades ---------------- */
const $ = (s) => document.querySelector(s);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
const initials = (st) => (st.first[0] || "") + (st.last[0] || "");
const avatarColor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];

function fixMojibake(s) {
  if (!/[ÃÂ]/.test(s)) return s;
  try { return decodeURIComponent(escape(s)); } catch { return s; }
}

function parseCSV(text) {
  const rows = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    rows.push(out.map((c) => c.trim()));
  }
  return rows;
}

/** Percentil (rango percentil) dentro del grupo */
function percentile(value, all) {
  const below = all.filter((v) => v < value).length;
  const equal = all.filter((v) => v === value).length;
  return Math.round(((below + 0.5 * equal) / all.length) * 100);
}

function levelFor(areaKey, score) {
  const lv = AREAS[areaKey].niveles;
  const s = Math.round(score);
  let idx = lv.findIndex((l) => s >= l.min && s <= l.max);
  if (idx < 0) idx = s > 100 ? lv.length - 1 : 0;
  return { idx, ...lv[idx] };
}

/* ---------------- Carga y cálculo ---------------- */
function loadData(csvText) {
  const rows = parseCSV(csvText);
  const header = rows[0];
  const itemCols = [];
  header.forEach((h, i) => {
    const m = h.match(/^#(\d+)\s*Points/i);
    if (m && ITEM_MAP[+m[1]]) itemCols.push({ col: i, n: +m[1] });
  });
  const scoredSet = new Set(itemCols.map((c) => c.n));
  state.scored = ITEMS.map((i) => i[0]).filter((n) => scoredSet.has(n));
  state.missing = ITEMS.map((i) => i[0]).filter((n) => !scoredSet.has(n));

  state.students = rows.slice(1).map((r, idx) => {
    const ans = {};
    itemCols.forEach(({ col, n }) => (ans[n] = parseFloat(r[col]) > 0 ? 1 : 0));
    return {
      id: idx, quiz: r[0], klass: r[1],
      first: fixMojibake(r[2] || ""), last: fixMojibake(r[3] || ""),
      earned: parseFloat(r[4]) || 0, ans,
    };
  });
  state.quiz = state.students[0]?.quiz || "";
  state.klass = state.students[0]?.klass || "";
  compute();
}

function compute() {
  const S = state.students;
  // Puntaje por área = % de aciertos
  S.forEach((st) => {
    st.areas = {};
    AREA_ORDER.forEach((a) => {
      const items = state.scored.filter((n) => ITEM_MAP[n].area === a);
      const ok = items.filter((n) => st.ans[n]).length;
      st.areas[a] = { ok, total: items.length, score: items.length ? (ok / items.length) * 100 : 0 };
    });
    const w = AREA_ORDER.reduce((s, a) => s + AREAS[a].peso, 0);
    st.global = Math.round((AREA_ORDER.reduce((s, a) => s + st.areas[a].score * AREAS[a].peso, 0) / w) * 5);
    st.totalOk = state.scored.filter((n) => st.ans[n]).length;
  });
  // Percentiles, niveles y ranking
  const globals = S.map((s) => s.global);
  S.forEach((st) => {
    st.pGlobal = percentile(st.global, globals);
    st.rank = globals.filter((g) => g > st.global).length + 1;
    AREA_ORDER.forEach((a) => {
      const all = S.map((s) => s.areas[a].score);
      st.areas[a].pct = percentile(st.areas[a].score, all);
      st.areas[a].level = levelFor(a, st.areas[a].score);
    });
  });
  // Estadísticas del grupo
  state.group = { global: avg(globals), areas: {}, items: {} };
  AREA_ORDER.forEach((a) => (state.group.areas[a] = avg(S.map((s) => s.areas[a].score))));
  state.scored.forEach((n) => (state.group.items[n] = avg(S.map((s) => s.ans[n])) * 100));
}

/* ---------------- Sidebar ---------------- */
function renderSidebar() {
  $("#quizName").textContent = `${state.quiz} · ${state.klass}`;
  const q = $("#search").value.trim().toLowerCase();
  let list = state.students.filter((s) => `${s.first} ${s.last}`.toLowerCase().includes(q));
  list = list.sort(state.sort === "score" ? (a, b) => b.global - a.global : (a, b) => a.last.localeCompare(b.last));
  $("#studentList").innerHTML = list.map((s) => `
    <li data-id="${s.id}" class="${state.view === "student" && state.current === s.id ? "active" : ""}">
      <div class="avatar" style="background:${avatarColor(s.id)}">${initials(s)}</div>
      <div><div class="st-name">${titleCase(s.first)}</div><div class="st-sub">${titleCase(s.last)}</div></div>
      <div class="st-score">${s.global}</div>
    </li>`).join("");
  $("#studentList").querySelectorAll("li").forEach((li) => (li.onclick = () => showStudent(+li.dataset.id)));
  $("#btnGrupo").classList.toggle("active", state.view === "grupo");
}

function destroyCharts() { state.charts.forEach((c) => c.destroy()); state.charts = []; }

/* ---------------- Vista: grupo ---------------- */
function showGroup() {
  state.view = "grupo"; state.current = null; destroyCharts(); renderSidebar();
  const S = state.students, G = state.group;
  const globals = S.map((s) => s.global);
  const best = S.reduce((a, b) => (b.global > a.global ? b : a));
  const sorted = [...S].sort((a, b) => b.global - a.global);

  $("#content").innerHTML = `
    <div class="page-head">
      <div><h1>Reporte general del grupo</h1><p>${state.quiz} · ${state.klass} · ${S.length} estudiantes · ${state.scored.length} ítems calificados</p></div>
      <button class="btn" onclick="window.print()">🖨 Imprimir</button>
    </div>
    <div class="grid g4">
      ${kpi("Promedio global", `${Math.round(G.global)}<small>/500</small>`, "Índice ponderado tipo Saber 11", "#6366f1")}
      ${kpi("Puntaje más alto", `${Math.max(...globals)}<small>/500</small>`, titleCase(`${best.first} ${best.last}`), "#22c55e")}
      ${kpi("Puntaje más bajo", `${Math.min(...globals)}<small>/500</small>`, `Rango: ${Math.max(...globals) - Math.min(...globals)} puntos`, "#ef4444")}
      ${kpi("Aciertos promedio", `${Math.round(avg(S.map((s) => s.totalOk)))}<small>/${state.scored.length}</small>`, `${round(avg(S.map((s) => s.totalOk)) / state.scored.length * 100, 1)}% de efectividad`, "#06b6d4")}
    </div>

    <div class="grid g2 mt">
      <div class="card"><h3>Promedio por área <small>(0–100)</small></h3><div class="chart-box"><canvas id="cAreas"></canvas></div></div>
      <div class="card"><h3>Distribución de niveles de desempeño <small>(% de estudiantes)</small></h3><div class="chart-box"><canvas id="cLevels"></canvas></div></div>
    </div>

    <div class="card mt">
      <h3>Ranking del grupo <small>Haz clic en un estudiante para ver su reporte</small></h3>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>#</th><th>Estudiante</th><th>Global</th><th>Percentil</th>
          ${AREA_ORDER.map((a) => `<th>${AREAS[a].corto}</th>`).join("")}</tr></thead>
        <tbody>${sorted.map((s) => `
          <tr data-id="${s.id}">
            <td><span class="rank ${s.rank <= 3 ? "top" : ""}">${s.rank}</span></td>
            <td><b>${titleCase(s.first)}</b> ${titleCase(s.last)}</td>
            <td class="num">${s.global}</td>
            <td class="num">P${s.pGlobal}</td>
            ${AREA_ORDER.map((a) => `<td><span class="num">${Math.round(s.areas[a].score)}</span> ${chip(a, s.areas[a].level)}</td>`).join("")}
          </tr>`).join("")}
        </tbody></table></div>
    </div>

    <div class="card mt">
      <h3>Mapa de dificultad por ítem <small>% del grupo que respondió correctamente</small></h3>
      ${AREA_ORDER.map((a) => `
        <div class="heat-area"><h4><span class="dot" style="width:10px;height:10px;border-radius:50%;background:${AREAS[a].color};display:inline-block"></span>${AREAS[a].nombre}</h4>
        <div class="heat">${ITEMS.filter((i) => i[1] === a).map(([n]) => {
          if (!(n in G.items)) return `<div class="h" style="background:#f1f5f9;color:#94a3b8" data-tip="Ítem ${n}: no incluido en los resultados">${n}</div>`;
          const p = G.items[n];
          return `<div class="h" style="background:${heatColor(p)}" data-tip="<b>Ítem ${n}</b> · ${nivelLabel(ITEM_MAP[n].nivel)}<br>${ITEM_MAP[n].desc}<br><b>${Math.round(p)}%</b> de aciertos">${n}</div>`;
        }).join("")}</div></div>`).join("")}
      <div class="legend"><span style="--c:#fca5a5">0–25%</span><span style="--c:#fdba74">25–50%</span><span style="--c:#fde68a">50–75%</span><span style="--c:#86efac">75–100%</span></div>
    </div>

    <div class="grid g2 mt">
      <div class="card"><h3>🔻 Ítems más difíciles del grupo</h3>${topItems(true)}</div>
      <div class="card"><h3>🔺 Ítems con mejor desempeño</h3>${topItems(false)}</div>
    </div>
    ${methodNote()}
  `;

  document.querySelectorAll("tbody tr[data-id]").forEach((tr) => (tr.onclick = () => showStudent(+tr.dataset.id)));
  bindTips();

  state.charts.push(new Chart($("#cAreas"), {
    type: "bar",
    data: { labels: AREA_ORDER.map((a) => AREAS[a].corto),
      datasets: [{ data: AREA_ORDER.map((a) => round(G.areas[a], 1)), backgroundColor: AREA_ORDER.map((a) => AREAS[a].color), borderRadius: 8 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } },
  }));
  state.charts.push(new Chart($("#cLevels"), {
    type: "bar",
    data: { labels: AREA_ORDER.map((a) => AREAS[a].corto),
      datasets: [0, 1, 2, 3].map((i) => ({
        label: `Nivel ${i + 1} / ${AREAS.ING.niveles[i].nombre}`,
        data: AREA_ORDER.map((a) => round(S.filter((s) => s.areas[a].level.idx === i).length / S.length * 100, 1)),
        backgroundColor: LEVEL_COLORS[i], borderRadius: 4 })) },
    options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, max: 100, ticks: { callback: (v) => v + "%" } } },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } } },
  }));
}

function topItems(hardest) {
  const arr = Object.entries(state.group.items).map(([n, p]) => ({ n: +n, p }))
    .sort((a, b) => (hardest ? a.p - b.p : b.p - a.p)).slice(0, 6);
  return `<div class="fail-list">${arr.map(({ n, p }) => `
    <div class="fail"><div class="num" style="color:${hardest ? "#991b1b" : "#166534"}">#${n}</div>
      <div><div class="d">${ITEM_MAP[n].desc}</div><div class="ans">${AREAS[ITEM_MAP[n].area].nombre} · ${nivelLabel(ITEM_MAP[n].nivel)}</div></div>
      <div class="gp"><b>${Math.round(p)}%</b><br>aciertos</div></div>`).join("")}</div>`;
}

/* ---------------- Vista: estudiante ---------------- */
function showStudent(id) {
  state.view = "student"; state.current = id; destroyCharts(); renderSidebar();
  const st = state.students[id], G = state.group, n = state.students.length;

  $("#content").innerHTML = `
    <div class="hero">
      <div class="avatar" style="background:${avatarColor(st.id)}">${initials(st)}</div>
      <div>
        <h1>${titleCase(st.first)} ${titleCase(st.last)}</h1>
        <div class="meta"><span>📘 ${st.quiz}</span><span>🏫 ${st.klass}</span><span>✅ ${st.totalOk}/${state.scored.length} aciertos</span></div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><div class="v">${st.global}<small>/500</small></div><div class="l">Puntaje global</div></div>
        <div class="hero-stat"><div class="v">P${st.pGlobal}</div><div class="l">Percentil en el grupo</div></div>
        <div class="hero-stat"><div class="v">${st.rank}<small>/${n}</small></div><div class="l">Puesto</div></div>
      </div>
    </div>

    <div class="page-head" style="margin-bottom:14px">
      <div><h1 style="font-size:20px">Reporte general</h1><p>Comparación con el promedio del grupo (${Math.round(G.global)}/500)</p></div>
      <button class="btn" onclick="window.print()">🖨 Imprimir reporte</button>
    </div>

    <div class="grid g32">
      <div class="card"><h3>Resumen por área</h3>
        <table><thead><tr><th>Área</th><th>Aciertos</th><th>Puntaje</th><th>Grupo</th><th>Percentil</th><th>Nivel</th></tr></thead>
        <tbody>${AREA_ORDER.map((a) => { const r = st.areas[a]; const d = r.score - G.areas[a]; return `
          <tr data-area="${a}"><td><b style="color:${AREAS[a].color}">●</b> ${AREAS[a].nombre}</td>
          <td class="num">${r.ok}/${r.total}</td>
          <td class="num">${Math.round(r.score)} <small style="color:${d >= 0 ? "#16a34a" : "#dc2626"}">${d >= 0 ? "▲" : "▼"}${Math.abs(Math.round(d))}</small></td>
          <td class="num" style="color:var(--muted)">${Math.round(G.areas[a])}</td>
          <td class="num">P${r.pct}</td><td>${chip(a, r.level)}</td></tr>`; }).join("")}
        </tbody></table>
      </div>
      <div class="card"><h3>Perfil vs. grupo</h3><div class="chart-box"><canvas id="cRadar"></canvas></div></div>
    </div>

    <h2 style="margin:30px 0 0;font-size:20px">Reporte por asignatura</h2>
    <div class="tabs">${AREA_ORDER.map((a) => `<button class="tab ${a === state.area ? "active" : ""}" data-area="${a}"><span class="dot" style="background:${AREAS[a].color}"></span>${AREAS[a].corto}</button>`).join("")}</div>
    ${AREA_ORDER.map((a) => areaPanel(st, a)).join("")}
    ${methodNote()}
  `;

  document.querySelectorAll(".tab, tr[data-area]").forEach((el) => (el.onclick = () => selectArea(el.dataset.area)));
  bindTips();

  state.charts.push(new Chart($("#cRadar"), {
    type: "radar",
    data: { labels: AREA_ORDER.map((a) => AREAS[a].corto), datasets: [
      { label: titleCase(st.first.split(" ")[0]), data: AREA_ORDER.map((a) => round(st.areas[a].score, 1)), borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,.2)", pointBackgroundColor: "#4f46e5" },
      { label: "Promedio grupo", data: AREA_ORDER.map((a) => round(G.areas[a], 1)), borderColor: "#94a3b8", backgroundColor: "rgba(148,163,184,.12)", borderDash: [4, 4], pointRadius: 2 },
    ] },
    options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, display: false } } }, plugins: { legend: { position: "bottom" } } },
  }));
}

function selectArea(a) {
  state.area = a;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.area === a));
  document.querySelectorAll(".area-panel").forEach((p) => (p.style.display = p.dataset.area === a ? "block" : "none"));
  document.querySelector(".tabs").scrollIntoView({ behavior: "smooth", block: "start" });
}

function areaPanel(st, a) {
  const A = AREAS[a], r = st.areas[a], lv = r.level, G = state.group;
  const next = A.niveles[lv.idx + 1];
  const items = ITEMS.filter((i) => i[1] === a).map((i) => i[0]);
  const failed = items.filter((n) => state.scored.includes(n) && !st.ans[n]);

  // Desempeño por nivel de complejidad de los ítems
  const itemLevels = [...new Set(items.map((n) => ITEM_MAP[n].nivel))]
    .sort((x, y) => A.niveles.findIndex((l) => l.id === x) - A.niveles.findIndex((l) => l.id === y));
  const lvlRows = itemLevels.map((L) => {
    const its = items.filter((n) => ITEM_MAP[n].nivel === L && state.scored.includes(n));
    const ok = its.filter((n) => st.ans[n]).length;
    const p = its.length ? (ok / its.length) * 100 : 0;
    const gp = avg(its.map((n) => G.items[n]));
    const ci = A.niveles.findIndex((l) => l.id === L);
    return `<div class="lvl-row"><div><b>${nivelLabel(L)}</b></div>
      <div class="track"><div class="fill" style="width:${p}%;background:${LEVEL_COLORS[ci]}"></div><div class="gmark" style="left:${gp}%" title="Grupo: ${Math.round(gp)}%"></div></div>
      <div class="n">${ok}/${its.length} · ${Math.round(p)}%</div></div>`;
  }).join("");

  // Escala de niveles
  const segs = A.niveles.map((l, i) => `<div class="scale-seg" style="width:${l.max - l.min + (i ? 1 : 0)}%;background:${LEVEL_COLORS[i]};opacity:${i === lv.idx ? 1 : 0.35}"></div>`).join("");
  const labels = A.niveles.map((l, i) => `<div style="width:${l.max - l.min + (i ? 1 : 0)}%">${l.nombre}<br>${l.min}–${l.max}</div>`).join("");

  const toNext = next ? next.min - Math.round(r.score) : 0;
  const itemsToNext = next ? Math.ceil((next.min / 100) * r.total) - r.ok : 0;

  return `
  <div class="area-panel" data-area="${a}" style="display:${a === state.area ? "block" : "none"}">
    <div class="card">
      <div class="area-head">
        <div class="area-title"><span class="bar" style="background:${A.color}"></span>${A.nombre} ${chip(a, lv)}</div>
        <div class="area-nums">
          <div><div class="v">${Math.round(r.score)}<small style="font-size:13px;color:var(--muted)">/100</small></div><div class="l">Puntaje</div></div>
          <div><div class="v">P${r.pct}</div><div class="l">Percentil</div></div>
          <div><div class="v">${r.ok}/${r.total}</div><div class="l">Aciertos</div></div>
          <div><div class="v" style="color:var(--muted)">${Math.round(G.areas[a])}</div><div class="l">Prom. grupo</div></div>
        </div>
      </div>
      <div class="scale" style="margin-top:44px">
        <div class="scale-marker" style="left:${Math.min(Math.max(r.score, 2), 98)}%"><div class="pin">${Math.round(r.score)}</div><div class="stem"></div></div>
        <div class="scale-track">${segs}</div>
        <div class="scale-group" style="left:${G.areas[a]}%" title="Promedio del grupo"></div>
        <div class="scale-labels">${labels}</div>
      </div>
      <p style="margin:0;color:var(--muted)">Está en el <b>percentil ${r.pct}</b> del grupo: su puntaje en ${A.nombre} es igual o superior al de aproximadamente el ${r.pct}% de sus compañeros.
      ${next ? ` Le faltan <b>${toNext} puntos</b> (≈ <b>${Math.max(itemsToNext, 1)} acierto${itemsToNext > 1 ? "s" : ""}</b> más) para alcanzar <b>${next.nombre}</b>.` : " Alcanzó el nivel más alto de la escala."}</p>
    </div>

    <div class="grid g2 mt">
      <div class="card"><h3>✅ Habilidades que refleja su nivel <small>${lv.nombre}</small></h3>
        <ul class="list ok">${lv.habilidades.map((h) => `<li><span class="b">✓</span><span>${h}</span></li>`).join("")}</ul>
      </div>
      <div class="card"><h3>🚀 ${next ? `Recomendaciones para pasar a ${next.nombre}` : "Recomendaciones para mantener el nivel"}</h3>
        <ul class="list up">${lv.recomendaciones.map((h, i) => `<li><span class="b">${i + 1}</span><span>${h}</span></li>`).join("")}</ul>
      </div>
    </div>

    <div class="grid g2 mt">
      <div class="card"><h3>Desempeño según complejidad del ítem <small>| = promedio grupo</small></h3>
        <div class="lvl-bars">${lvlRows}</div>
        <h3 class="mt">Mapa de respuestas</h3>
        <div class="items-map">${items.map((n) => {
          const it = ITEM_MAP[n];
          if (!state.scored.includes(n)) return `<div class="it na" data-tip="Ítem ${n}: no incluido en los resultados">${n}</div>`;
          const ok = st.ans[n];
          return `<div class="it ${ok ? "c" : "x"}" data-tip="<b>Ítem ${n}</b> · ${nivelLabel(it.nivel)} · ${ok ? "✔ Correcta" : "✘ Incorrecta"}<br>${it.desc}<br><i>Clave: ${it.resp}</i><br>Grupo: ${Math.round(G.items[n])}% aciertos">${n}<small>${shortLvl(it.nivel)}</small></div>`;
        }).join("")}</div>
        <div class="legend"><span style="--c:#86efac">Correcta</span><span style="--c:#fca5a5">Incorrecta</span><span style="--c:#e2e8f0">No calificado</span></div>
      </div>
      <div class="card"><h3>📌 Aprendizajes a reforzar <small>${failed.length} ítems incorrectos</small></h3>
        ${failed.length ? `<div class="fail-list">${failed
          .sort((x, y) => G.items[y] - G.items[x])
          .map((n) => `<div class="fail"><div class="num">#${n}</div>
            <div><div class="d">${ITEM_MAP[n].desc}</div><div class="ans">${nivelLabel(ITEM_MAP[n].nivel)} · Clave: ${ITEM_MAP[n].resp}</div></div>
            <div class="gp">${Math.round(G.items[n])}% del<br>grupo acertó</div></div>`).join("")}</div>
          <p class="note" style="margin-top:12px">Ordenados por prioridad: primero los ítems que la mayoría del grupo sí resolvió (brechas individuales).</p>`
          : `<p>¡Respondió correctamente todos los ítems del área!</p>`}
      </div>
    </div>
  </div>`;
}

/* ---------------- Componentes ---------------- */
function kpi(lbl, val, hint, color) {
  return `<div class="card kpi" style="--kc:${color}"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="hint">${hint}</div></div>`;
}
function chip(a, lv) { return `<span class="chip lv${lv.idx + 1}">${lv.nombre}</span>`; }
function nivelLabel(n) { return /^\d$/.test(n) ? `Nivel ${n}` : n; }
function shortLvl(n) { return /^\d$/.test(n) ? `N${n}` : n.replace("Pre ", "P"); }
function heatColor(p) { return p < 25 ? "#fca5a5" : p < 50 ? "#fdba74" : p < 75 ? "#fde68a" : "#86efac"; }

function methodNote() {
  const miss = state.missing.length ? ` El ítem ${state.missing.join(", ")} no aparece en el archivo de resultados y fue excluido del cálculo.` : "";
  return `<div class="note">ℹ️ <b>Metodología:</b> el puntaje por área (0–100) corresponde al porcentaje de aciertos. El puntaje global (0–500) replica la ponderación de Saber 11:
  Lectura Crítica, Matemáticas, Sociales y Ciencias ×3, Inglés ×1, dividido entre 13 y multiplicado por 5. Los niveles de desempeño usan los puntos de corte del ICFES
  (Mat 0–35/36–50/51–70/71–100 · LC 0–35/36–50/51–65/66–100 · Soc y CN 0–40/41–55/56–70/71–100 · Inglés Pre A1 0–47, A1 48–57, A2 58–70, B1 71–100).
  El percentil es relativo al grupo evaluado. Al ser un simulacro sin escalamiento TRI, los resultados son una estimación orientativa.${miss}</div>`;
}

function bindTips() {
  let tip = $("#tip");
  if (!tip) { tip = document.createElement("div"); tip.id = "tip"; document.body.appendChild(tip); }
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.onmouseenter = () => { tip.innerHTML = el.dataset.tip; tip.style.opacity = 1; };
    el.onmousemove = (e) => {
      const x = Math.min(e.clientX + 14, window.innerWidth - 340);
      const y = e.clientY + 14 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 14;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    };
    el.onmouseleave = () => (tip.style.opacity = 0);
  });
}

/* ---------------- Inicio ---------------- */
$("#btnGrupo").onclick = showGroup;
$("#search").oninput = renderSidebar;
$("#sortSel").onchange = (e) => { state.sort = e.target.value; renderSidebar(); };
$("#fileInput").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { loadData(rd.result); showGroup(); };
  rd.readAsText(f, "UTF-8");
};
Chart.defaults.font.family = "Inter, system-ui, sans-serif";
Chart.defaults.color = "#64748b";

loadData(DEFAULT_CSV);
showGroup();
