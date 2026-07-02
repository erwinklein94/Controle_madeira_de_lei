/* =====================================================================
   Controle de Inspeção e Transporte (Rumo)
   Ordem: (1) Store [dados]  (2) Registros [tela 1]
          (3) Dashboard [tela 2]  (4) Roteador [troca de telas]
   ===================================================================== */

/* =====================================================================
   (1) STORE — camada de dados (schema, localStorage e agregações)
   Não toca no DOM. Exposto como window.Store.
   ===================================================================== */
(function (global) {
  "use strict";

  var STORAGE_KEY = "rumo-inspecao:registros:v2";
  var UNIT = ""; // unidade exibida ao lado dos volumes; vazio para não mostrar letra após os números

  var STAGES = [
    { key: "volPedido",       label: "Volume do pedido",        short: "Pedido",        color: "#003865" },
    { key: "volPronto",       label: "Pronto p/ inspeção",      short: "Pronto",        color: "#1F6FA5" },
    { key: "volInspecionado", label: "Inspecionado",            short: "Inspecionado",  color: "#32A6E6" },
    { key: "volLiberado",     label: "Liberado p/ transporte",  short: "Liberado",      color: "#1E9F7F" },
    { key: "volTransportado", label: "Transportado",            short: "Transportado",  color: "#7FE06C" }
  ];

  var DEFAULT_RECORDS = [
    {
      id: "registro-ivan-pandolfi-4502028992",
      fiscal: "Ivan Souza",
      fornecedor: "Pandolfi",
      local: "Enéias Marques",
      pedido: "4502028992",
      volPedido: 12000,
      volPronto: 0,
      volInspecionado: 672,
      volLiberado: 430,
      volTransportado: 8652,
      createdAt: "2026-07-02T12:00:00.000Z"
    }
  ];

  function cloneDefaultRecords() {
    return DEFAULT_RECORDS.map(function (r) { return Object.assign({}, r); });
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return cloneDefaultRecords();
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : cloneDefaultRecords();
    } catch (e) {
      return cloneDefaultRecords();
    }
  }

  function persist(list) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function uid() {
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function getAll() { return load(); }

  function add(record) {
    var list = load();
    record.id = record.id || uid();
    record.createdAt = record.createdAt || new Date().toISOString();
    list.push(record);
    persist(list);
    return record;
  }

  function update(id, patch) {
    var updated = null;
    var list = load().map(function (r) {
      if (r.id !== id) return r;
      updated = Object.assign({}, r, patch, { id: r.id, createdAt: r.createdAt || new Date().toISOString() });
      return updated;
    });
    persist(list);
    return updated;
  }

  function remove(id) {
    var list = load().filter(function (r) { return r.id !== id; });
    persist(list);
    return list;
  }

  function clear() { persist([]); }
  function count() { return load().length; }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function sumStage(list, key) {
    return list.reduce(function (acc, r) { return acc + num(r[key]); }, 0);
  }

  function funnelTotals(list) {
    return STAGES.map(function (st) {
      return { key: st.key, label: st.label, short: st.short, color: st.color, total: sumStage(list, st.key) };
    });
  }

  function groupSum(list, field, stageKey) {
    var map = {};
    list.forEach(function (r) {
      var k = r[field] || "—";
      map[k] = (map[k] || 0) + num(r[stageKey]);
    });
    return Object.keys(map)
      .map(function (k) { return { label: k, value: map[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  function pedidoVsTransportado(list, field) {
    var map = {};
    list.forEach(function (r) {
      var k = r[field] || "—";
      if (!map[k]) map[k] = { pedido: 0, transportado: 0 };
      map[k].pedido += num(r.volPedido);
      map[k].transportado += num(r.volTransportado);
    });
    return Object.keys(map)
      .map(function (k) {
        var saldo = Math.max(map[k].pedido - map[k].transportado, 0);
        return { label: k, pedido: map[k].pedido, transportado: map[k].transportado, saldo: saldo };
      })
      .sort(function (a, b) { return b.pedido - a.pedido; });
  }

  function trendByOrder(list) {
    var points = list
      .slice()
      .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); })
      .map(function (r) {
        var pct = num(r.volPedido) > 0 ? (num(r.volTransportado) / num(r.volPedido)) * 100 : 0;
        return { pedido: r.pedido, date: r.createdAt, pct: Math.round(pct * 10) / 10 };
      });

    var trend = linearTrend(points.map(function (p) { return p.pct; }));
    return { points: points, trendLine: trend.line, slope: trend.slope, direction: trend.direction, delta: trend.delta };
  }

  function cumulativeTransported(list) {
    var sorted = list.slice().sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    var acc = 0;
    return sorted.map(function (r) {
      acc += num(r.volTransportado);
      return { date: r.createdAt, total: acc, label: r.pedido };
    });
  }

  function linearTrend(y) {
    var n = y.length;
    if (n < 2) return { line: y.slice(), slope: 0, direction: "estavel", delta: 0 };
    var sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; }
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    var intercept = (sy - slope * sx) / n;
    var line = y.map(function (_, i) { return Math.round((slope * i + intercept) * 10) / 10; });
    var delta = Math.round((line[n - 1] - line[0]) * 10) / 10;
    var direction = slope > 0.05 ? "subida" : slope < -0.05 ? "descida" : "estavel";
    return { line: line, slope: slope, direction: direction, delta: delta };
  }

  function kpis(list) {
    var totals = funnelTotals(list);
    var pedido = totals[0].total;
    var transportado = totals[totals.length - 1].total;
    var conclusao = pedido > 0 ? (transportado / pedido) * 100 : 0;

    var gargalo = { label: "—", drop: 0 };
    for (var i = 1; i < totals.length; i++) {
      var prev = totals[i - 1].total;
      var drop = prev > 0 ? (1 - totals[i].total / prev) * 100 : 0;
      if (drop > gargalo.drop) gargalo = { label: totals[i].label, drop: drop };
    }

    return {
      totalPedido: pedido,
      totalTransportado: transportado,
      emAndamento: pedido - transportado,
      conclusao: conclusao,
      gargalo: gargalo,
      registros: list.length,
      fornecedores: distinct(list, "fornecedor").length,
      fiscais: distinct(list, "fiscal").length,
      locais: distinct(list, "local").length
    };
  }

  function distinct(list, field) {
    var seen = {};
    list.forEach(function (r) { if (r[field]) seen[r[field]] = true; });
    return Object.keys(seen);
  }

  global.Store = {
    STAGES: STAGES,
    UNIT: UNIT,
    getAll: getAll,
    add: add,
    update: update,
    remove: remove,
    clear: clear,
    count: count,
    funnelTotals: funnelTotals,
    groupSum: groupSum,
    pedidoVsTransportado: pedidoVsTransportado,
    trendByOrder: trendByOrder,
    cumulativeTransported: cumulativeTransported,
    kpis: kpis,
    distinct: distinct
  };
})(window);

/* =====================================================================
   (2) REGISTROS — controlador da tela de Registros
   ===================================================================== */
(function () {
  "use strict";

  var fmt = new Intl.NumberFormat("pt-BR");
  var STAGES = Store.STAGES;
  var editingId = null;

  var form = document.getElementById("form-registro");
  var msg = document.getElementById("form-msg");
  var tabelaArea = document.getElementById("tabela-area");
  var contador = document.getElementById("contador");
  var formTitle = document.getElementById("form-title");
  var btnSubmit = document.getElementById("btn-submit");
  var btnCancelEdit = document.getElementById("btn-cancelar-edicao");

  function render() {
    var list = Store.getAll();
    contador.textContent = list.length
      ? list.length + (list.length === 1 ? " registro." : " registros.")
      : "Nenhum registro.";

    if (!list.length) {
      tabelaArea.innerHTML =
        '<div class="empty">' +
          '<div class="empty__title">Nenhum registro ainda</div>' +
          '<div class="empty__txt">Adicione um registro no formulário acima para alimentar o dashboard.</div>' +
        "</div>";
      return;
    }

    var head =
      "<thead><tr>" +
      '<th class="col-text">Fiscal</th>' +
      '<th class="col-text">Fornecedor</th>' +
      '<th class="col-text">Local</th>' +
      '<th class="col-text">Pedido</th>' +
      STAGES.map(function (s) { return "<th>" + s.label + "</th>"; }).join("") +
      '<th>Ações</th>' +
      "</tr></thead>";

    var rows = list.map(function (r) {
      var cells = STAGES.map(function (s) {
        return "<td>" + fmt.format(Number(r[s.key]) || 0) + "</td>";
      }).join("");
      return (
        '<tr class="' + (r.id === editingId ? "is-editing" : "") + '">' +
        '<td class="col-text">' + esc(r.fiscal) + "</td>" +
        '<td class="col-text">' + esc(r.fornecedor) + "</td>" +
        '<td class="col-text">' + esc(r.local) + "</td>" +
        '<td class="col-text cell-pedido">' + esc(r.pedido) + "</td>" +
        cells +
        '<td><div class="row-actions">' +
          '<button class="row-edit" data-id="' + r.id + '" type="button" title="Editar" aria-label="Editar registro">Editar</button>' +
          '<button class="row-del" data-id="' + r.id + '" type="button" title="Excluir" aria-label="Excluir registro">✕</button>' +
        '</div></td>' +
        "</tr>"
      );
    }).join("");

    var foot =
      "<tfoot><tr>" +
      '<td class="col-text">Total</td><td></td><td></td><td></td>' +
      STAGES.map(function (s) {
        var t = list.reduce(function (a, r) { return a + (Number(r[s.key]) || 0); }, 0);
        return "<td>" + fmt.format(t) + "</td>";
      }).join("") +
      "<td></td></tr></tfoot>";

    tabelaArea.innerHTML =
      '<div class="table-wrap"><table class="tabela">' + head + "<tbody>" + rows + "</tbody>" + foot + "</table></div>";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearMsg();

    var data = collectFormData();
    if (!data) return;

    if (editingId) {
      Store.update(editingId, data);
      showMsg("Registro atualizado.", true);
      stopEditing(true);
    } else {
      Store.add(data);
      form.reset();
      showMsg("Registro adicionado.", true);
      document.getElementById("fiscal").focus();
    }

    render();
  });

  document.getElementById("btn-limpar").addEventListener("click", function () {
    if (!Store.count()) return;
    if (!confirm("Remover todos os registros? Esta ação não pode ser desfeita.")) return;
    Store.clear();
    stopEditing(true);
    render();
    showMsg("Todos os registros foram removidos.", true);
  });

  btnCancelEdit.addEventListener("click", function () {
    stopEditing(true);
    render();
    showMsg("Edição cancelada.", true);
  });

  tabelaArea.addEventListener("click", function (e) {
    var edit = e.target.closest(".row-edit");
    var del = e.target.closest(".row-del");

    if (edit) {
      startEditing(edit.getAttribute("data-id"));
      render();
      return;
    }

    if (del) {
      var id = del.getAttribute("data-id");
      if (editingId === id) stopEditing(true);
      Store.remove(id);
      render();
    }
  });

  function collectFormData() {
    var data = {
      fiscal: val("fiscal"),
      fornecedor: val("fornecedor"),
      local: val("local"),
      pedido: val("pedido")
    };

    if (!data.fiscal || !data.fornecedor || !data.local || !data.pedido) {
      showMsg("Preencha Fiscal, Fornecedor, Local e Pedido.", false);
      return null;
    }

    var nums = ["volPedido", "volPronto", "volInspecionado", "volLiberado", "volTransportado"];
    for (var i = 0; i < nums.length; i++) {
      var el = document.getElementById(nums[i]);
      var n = parseFloat(el.value);
      if (el.value === "" || isNaN(n) || n < 0) {
        showMsg("Os volumes precisam ser números maiores ou iguais a zero.", false);
        return null;
      }
      data[nums[i]] = n;
    }
    return data;
  }

  function startEditing(id) {
    var rec = Store.getAll().filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    editingId = id;
    setVal("fiscal", rec.fiscal);
    setVal("fornecedor", rec.fornecedor);
    setVal("local", rec.local);
    setVal("pedido", rec.pedido);
    STAGES.forEach(function (s) { setVal(s.key, rec[s.key]); });
    formTitle.textContent = "Editar registro";
    btnSubmit.textContent = "Salvar alterações";
    btnCancelEdit.hidden = false;
    clearMsg();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("fiscal").focus();
  }

  function stopEditing(resetForm) {
    editingId = null;
    formTitle.textContent = "Novo registro";
    btnSubmit.textContent = "Adicionar registro";
    btnCancelEdit.hidden = true;
    if (resetForm) form.reset();
  }

  function val(id) { return document.getElementById(id).value.trim(); }
  function setVal(id, value) { document.getElementById(id).value = value == null ? "" : value; }
  function showMsg(text, ok) {
    msg.textContent = text;
    msg.className = "form-msg " + (ok ? "is-ok" : "is-error");
  }
  function clearMsg() { msg.textContent = ""; msg.className = "form-msg"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  window.RegistrosUI = { render: render };
  render();
})();

/* =====================================================================
   (3) DASHBOARD — controlador da tela de Dashboard
   Renderização preguiçosa: só desenha quando a aba é aberta (refresh()).
   ===================================================================== */
(function () {
  "use strict";

  var C = {
    azul: "#003865", azulClaro: "#32A6E6", verde: "#1E9F7F", verdeClaro: "#7FE06C",
    azul2: "#1F6FA5", laranja: "#F78344", amarelo: "#FBD300", cinza: "#BDCCD4",
    texto: "#4D626F", grid: "rgba(0,56,101,0.08)"
  };
  var DOUGHNUT = [C.azul, C.azulClaro, C.verde, C.verdeClaro, C.azul2, C.laranja, C.cinza, C.amarelo];

  var fmt = new Intl.NumberFormat("pt-BR");
  var fmtC = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  var fmtDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  var UNIT = Store.UNIT;

  var FUNNEL_TEXT = {
    volPedido: "#fff", volPronto: "#fff", volInspecionado: "#0c2c3f",
    volLiberado: "#fff", volTransportado: "#0c2c3f"
  };
  var CHART_IDS = ["chart-fornecedor", "chart-local", "chart-fiscal", "chart-tendencia", "chart-historico"];

  var charts = {};
  var modalChart = null;
  var wired = false;
  var defaultsSet = false;
  var els = {};
  var modal = {};

  function grab() {
    els = {
      empty: document.getElementById("empty-state"),
      content: document.getElementById("dash-content"),
      kpi: document.getElementById("kpi-grid"),
      funnel: document.getElementById("funnel"),
      trendBadge: document.getElementById("trend-badge"),
      count: document.getElementById("filtro-count"),
      fFiscal: document.getElementById("f-fiscal"),
      fForn: document.getElementById("f-fornecedor"),
      fLocal: document.getElementById("f-local"),
      fBusca: document.getElementById("f-busca"),
      fLimpar: document.getElementById("f-limpar")
    };

    modal = {
      root: document.getElementById("chart-modal"),
      title: document.getElementById("chart-modal-title"),
      hint: document.getElementById("chart-modal-hint"),
      canvas: document.getElementById("chart-modal-canvas"),
      canvasWrap: document.getElementById("chart-modal-canvas-wrap"),
      funnel: document.getElementById("chart-modal-funnel")
    };
  }

  function setup() {
    if (wired) return;
    grab();
    [els.fFiscal, els.fForn, els.fLocal].forEach(function (s) { s.addEventListener("change", render); });
    els.fBusca.addEventListener("input", render);
    els.fLimpar.addEventListener("click", function () {
      els.fFiscal.value = ""; els.fForn.value = ""; els.fLocal.value = ""; els.fBusca.value = "";
      render();
    });
    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        requestAnimationFrame(function () {
          placeFunnelLabels();
          if (modal.root && !modal.root.hidden && modal.funnel && !modal.funnel.hidden) placeFunnelLabelsIn(modal.funnel);
        });
      }, 120);
    });

    setupChartModal();
    wired = true;
  }

  function setupChartModal() {
    if (!modal.root) return;

    var cards = document.querySelectorAll("#view-dashboard .chart-card[data-modal-chart]");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("title", "Clique para ampliar este gráfico");
      card.setAttribute("aria-label", "Ampliar gráfico " + getChartInfo(card.getAttribute("data-modal-chart")).title);
      card.addEventListener("click", function () { openChartModal(this.getAttribute("data-modal-chart")); });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openChartModal(this.getAttribute("data-modal-chart"));
        }
      });
    }

    modal.root.addEventListener("click", function (e) {
      if (e.target.closest("[data-modal-close]")) closeChartModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.root && !modal.root.hidden) closeChartModal();
    });
  }

  function getChartInfo(kind) {
    var map = {
      funnel: { title: "Funil de volume", hint: "Do pedido ao transporte, com retenção por etapa." },
      fornecedor: { title: "Volume por fornecedor", hint: "Pedido x transportado, com saldo a transportar." },
      local: { title: "Distribuição por local", hint: "Participação no volume do pedido." },
      fiscal: { title: "Carga por fiscal", hint: "Volume inspecionado por fiscal." },
      tendencia: { title: "Tendência de conclusão", hint: "% concluído por pedido + tendência." },
      historico: { title: "Transportado acumulado", hint: "Evolução do total entregue." }
    };
    return map[kind] || { title: "Gráfico", hint: "Visualização expandida." };
  }

  function openChartModal(kind) {
    if (!modal.root) return;

    var info = getChartInfo(kind);
    var list = getFiltered();

    modal.title.textContent = info.title;
    modal.hint.textContent = info.hint + " Os filtros atuais do dashboard foram mantidos.";
    modal.root.hidden = false;
    modal.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (modalChart) {
      modalChart.destroy();
      modalChart = null;
    }

    if (kind === "funnel") {
      modal.canvasWrap.hidden = true;
      modal.funnel.hidden = false;
      renderFunnelInto(modal.funnel, list);
      requestAnimationFrame(function () { placeFunnelLabelsIn(modal.funnel); });
    } else {
      modal.funnel.hidden = true;
      modal.canvasWrap.hidden = false;

      if (!chartsAvailable()) {
        modal.canvasWrap.innerHTML = '<p class="card__hint chart-modal__fallback">A biblioteca de gráficos não carregou. Verifique a conexão e recarregue a página.</p>';
        return;
      }

      if (!modal.canvasWrap.querySelector("canvas")) {
        modal.canvasWrap.innerHTML = '<canvas id="chart-modal-canvas"></canvas>';
        modal.canvas = document.getElementById("chart-modal-canvas");
      }

      ensureDefaults();
      modalChart = new Chart(modal.canvas, buildChartConfig(kind, list, true));
    }

    var closeBtn = modal.root.querySelector(".chart-modal__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeChartModal() {
    if (!modal.root) return;
    if (modalChart) {
      modalChart.destroy();
      modalChart = null;
    }
    modal.root.hidden = true;
    modal.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function resetSelect(sel, values) {
    var previous = sel.value;
    sel.innerHTML = '<option value="">Todos</option>';
    values.slice().sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }).forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    if (values.indexOf(previous) >= 0) sel.value = previous;
  }

  /* Chamado toda vez que a aba Dashboard é aberta. */
  function refresh() {
    setup();
    var all = Store.getAll();
    if (!all.length) {
      els.empty.hidden = false;
      els.content.hidden = true;
      return;
    }
    els.empty.hidden = true;
    els.content.hidden = false;
    resetSelect(els.fFiscal, Store.distinct(all, "fiscal"));
    resetSelect(els.fForn, Store.distinct(all, "fornecedor"));
    resetSelect(els.fLocal, Store.distinct(all, "local"));
    render();
  }

  function getFiltered() {
    var all = Store.getAll();
    var fis = els.fFiscal.value, forn = els.fForn.value, loc = els.fLocal.value;
    var q = els.fBusca.value.trim().toLowerCase();
    return all.filter(function (r) {
      if (fis && r.fiscal !== fis) return false;
      if (forn && r.fornecedor !== forn) return false;
      if (loc && r.local !== loc) return false;
      if (q && String(r.pedido).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function render() {
    var all = Store.getAll();
    var list = getFiltered();
    els.count.innerHTML = "Mostrando <strong>" + list.length + "</strong> de " + all.length + " registros";
    renderKpis(list);
    renderFunnel(list);
    renderTrendBadge(list);
    renderCharts(list);
  }

  function renderKpis(list) {
    var k = Store.kpis(list);
    var trend = Store.trendByOrder(list);
    var concClass = k.conclusao >= 70 ? "kpi--ok" : k.conclusao < 40 ? "kpi--warn" : "";

    var cards = [
      kpiCard("Volume do pedido", val(k.totalPedido), "", k.registros + " registros"),
      kpiCard("Transportado", val(k.totalTransportado), "", pct(k.conclusao) + " do pedido", "kpi--ok"),
      kpiCard("Taxa de conclusão", pct(k.conclusao), "", trendBadgeHtml(trend), concClass),
      kpiCard("Em andamento", val(k.emAndamento), "", "ainda não transportado"),
      kpiCard("Maior gargalo", k.gargalo.drop > 0 ? "−" + pct(k.gargalo.drop) : "—", "", k.gargalo.label, "kpi--warn"),
      kpiCard("Cobertura", String(k.fornecedores), "", k.locais + " locais · " + k.fiscais + " fiscais")
    ];
    els.kpi.innerHTML = cards.join("");
  }

  function kpiCard(label, value, unit, foot, extra) {
    return (
      '<div class="kpi ' + (extra || "") + '">' +
        '<div class="kpi__label">' + label + "</div>" +
        '<div class="kpi__value">' + value + (unit ? '<span class="kpi__unit">' + unit + "</span>" : "") + "</div>" +
        '<div class="kpi__foot">' + foot + "</div>" +
      "</div>"
    );
  }

  function renderFunnel(list) {
    renderFunnelInto(els.funnel, list);
    requestAnimationFrame(placeFunnelLabels);
  }

  function renderFunnelInto(container, list) {
    var totals = Store.funnelTotals(list);
    var base = totals[0].total || 0;

    if (!container) return;

    if (!list.length || base === 0) {
      container.innerHTML = '<p class="card__hint">Nenhum registro para os filtros atuais.</p>';
      return;
    }

    var rows = totals.map(function (st) {
      var w = base > 0 ? (st.total / base) * 100 : 0;
      var pofp = base > 0 ? (st.total / base) * 100 : 0;
      var txt = FUNNEL_TEXT[st.key] || "#fff";
      var shadow = txt === "#fff" ? "text-shadow:0 1px 2px rgba(0,0,0,.28);" : "";
      return (
        '<div class="funnel__row">' +
          '<div class="funnel__name">' + st.short + "<small>" + st.label + "</small></div>" +
          '<div class="funnel__track">' +
            '<div class="funnel__bar" data-w="' + Math.max(w, 6).toFixed(1) + '" style="width:' + Math.max(w, 6).toFixed(1) + "% ;background:" + st.color + ";color:" + txt + ";" + shadow + '">' +
              '<span class="funnel__value">' +
                withUnit(st.total) +
                '<span class="pct">' + Math.round(pofp) + "%</span>" +
              "</span>" +
            "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    var k = Store.kpis(list);
    var note =
      '<div class="funnel__note">' +
      "Maior perda entre estágios: <strong>" + k.gargalo.label + "</strong> " +
      '<b>(−' + pct(k.gargalo.drop) + ")</b></div>";

    container.innerHTML = rows + note;
  }

  /* Mantém o rótulo (valor + %) dentro da barra quando há espaço; quando a
     barra é estreita demais e o número seria cortado, move o rótulo para fora,
     logo à direita da barra, em cor escura (legível sobre o trilho cinza). */
  function placeFunnelLabels() {
    placeFunnelLabelsIn(els.funnel);
  }

  function placeFunnelLabelsIn(container) {
    if (!container) return;
    var rows = container.querySelectorAll(".funnel__row");
    var i, row, track, bar, value;

    // 1) Reseta todos os rótulos para "dentro da barra" antes de medir.
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      bar = row.querySelector(".funnel__bar");
      value = row.querySelector(".funnel__value");
      if (!bar || !value) continue;
      if (value.parentNode !== bar) bar.appendChild(value);
      value.classList.remove("funnel__value--out");
      value.style.left = "";
    }

    // 2) Mede cada linha e move o rótulo para fora quando não couber.
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      track = row.querySelector(".funnel__track");
      bar = row.querySelector(".funnel__bar");
      value = row.querySelector(".funnel__value");
      if (!track || !bar || !value) continue;

      var trackW = track.clientWidth;
      if (!trackW) continue; // aba oculta ou ainda sem layout

      // Largura final da barra (não depende da animação de width em curso).
      var frac = (parseFloat(bar.getAttribute("data-w")) || 0) / 100;
      var minBar = container.classList.contains("chart-modal__funnel") ? 92 : 64;
      var barW = Math.max(trackW * frac, minBar);
      var innerW = barW - 24;
      var need = value.getBoundingClientRect().width;

      if (need > innerW) {
        var left = barW + 8; // 8px de respiro depois da barra
        if (left + need <= trackW) { // só move se realmente couber à direita
          value.classList.add("funnel__value--out");
          value.style.left = left + "px";
          track.appendChild(value);
        }
      }
    }
  }

  function renderTrendBadge(list) {
    els.trendBadge.innerHTML = trendBadgeHtml(Store.trendByOrder(list));
  }

  function trendBadgeHtml(trend) {
    if (!trend.points.length) return "";
    var d = trend.direction;
    var cls = d === "subida" ? "trend-badge--up" : d === "descida" ? "trend-badge--down" : "trend-badge--flat";
    var arrow = d === "subida" ? "↑" : d === "descida" ? "↓" : "→";
    var label = d === "subida" ? "Em alta" : d === "descida" ? "Em queda" : "Estável";
    var delta = (trend.delta > 0 ? "+" : "") + fmt.format(trend.delta) + " p.p.";
    return '<span class="trend-badge ' + cls + '">' + arrow + " " + label + " · " + delta + "</span>";
  }

  /* ---- Gráficos (Chart.js) ---- */
  function ensureDefaults() {
    if (defaultsSet || typeof Chart === "undefined") return;
    Chart.defaults.font.family = '"Cera Pro", Verdana, Geneva, Tahoma, sans-serif';
    Chart.defaults.font.size = 10;
    Chart.defaults.color = C.texto;
    defaultsSet = true;
  }

  function chartsAvailable() {
    return (typeof Chart !== "undefined" && typeof ChartDataLabels !== "undefined");
  }

  function showChartFallback() {
    CHART_IDS.forEach(function (id) {
      var cv = document.getElementById(id);
      if (!cv) return;
      var box = cv.closest(".chart-box");
      if (!box) return;
      cv.style.display = "none";
      if (!box.querySelector(".chart-fallback")) {
        var p = document.createElement("p");
        p.className = "card__hint chart-fallback";
        p.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:18px;margin:0;";
        p.textContent = "A biblioteca de gráficos não carregou (sem conexão?). Os indicadores e o funil acima continuam válidos.";
        box.appendChild(p);
      }
    });
  }

  function clearChartFallback() {
    var ps = document.querySelectorAll(".chart-fallback");
    for (var i = 0; i < ps.length; i++) ps[i].parentNode.removeChild(ps[i]);
    CHART_IDS.forEach(function (id) {
      var cv = document.getElementById(id);
      if (cv) cv.style.display = "";
    });
  }

  function renderCharts(list) {
    if (!chartsAvailable()) { showChartFallback(); return; }
    clearChartFallback();
    ensureDefaults();
    chartFornecedor(list);
    chartLocal(list);
    chartFiscal(list);
    chartTendencia(list);
    chartHistorico(list);
  }

  function mount(id, config) {
    var cv = document.getElementById(id);
    if (!cv) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(cv, config);
  }

  function baseScales(expanded) {
    var tickSize = expanded ? 12 : 10;
    return {
      x: { grid: { color: C.grid }, ticks: { color: C.texto, font: { size: tickSize } } },
      y: { grid: { color: C.grid }, ticks: { color: C.texto, font: { size: tickSize } }, beginAtZero: true }
    };
  }

  function paddedMax(values, factor) {
    var max = values.reduce(function (m, v) { return Math.max(m, Number(v) || 0); }, 0);
    return max > 0 ? Math.ceil(max * (factor || 1.18)) : 10;
  }

  function chartFornecedor(list) { mount("chart-fornecedor", buildChartConfig("fornecedor", list, false)); }
  function chartLocal(list) { mount("chart-local", buildChartConfig("local", list, false)); }
  function chartFiscal(list) { mount("chart-fiscal", buildChartConfig("fiscal", list, false)); }
  function chartTendencia(list) { mount("chart-tendencia", buildChartConfig("tendencia", list, false)); }
  function chartHistorico(list) { mount("chart-historico", buildChartConfig("historico", list, false)); }

  function buildChartConfig(kind, list, expanded) {
    if (kind === "fornecedor") return fornecedorConfig(list, expanded);
    if (kind === "local") return localConfig(list, expanded);
    if (kind === "fiscal") return fiscalConfig(list, expanded);
    if (kind === "tendencia") return tendenciaConfig(list, expanded);
    if (kind === "historico") return historicoConfig(list, expanded);
    return fornecedorConfig(list, expanded);
  }

  function fornecedorConfig(list, expanded) {
    var d = Store.pedidoVsTransportado(list, "fornecedor");
    var max = paddedMax(d.reduce(function (arr, x) { arr.push(x.pedido, x.transportado, x.saldo); return arr; }, []), expanded ? 1.26 : 1.18);
    var scales = baseScales(expanded);
    scales.x.suggestedMax = max;
    scales.y.ticks.autoSkip = false;

    return {
      type: "bar",
      data: {
        labels: d.map(function (x) { return x.label; }),
        datasets: [
          { label: "Pedido", data: d.map(function (x) { return x.pedido; }), backgroundColor: C.azul, borderRadius: expanded ? 7 : 4 },
          { label: "Transportado", data: d.map(function (x) { return x.transportado; }), backgroundColor: C.verde, borderRadius: expanded ? 7 : 4 },
          { label: "Saldo a transportar", data: d.map(function (x) { return x.saldo; }), backgroundColor: C.laranja, borderRadius: expanded ? 7 : 4 }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: expanded ? 86 : 38, top: expanded ? 12 : 2, bottom: expanded ? 10 : 2, left: expanded ? 8 : 0 } },
        scales: scales,
        plugins: {
          legend: legendConfig(expanded),
          tooltip: { callbacks: { label: tipVal } },
          datalabels: barEndLabelsExact(expanded)
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  function localConfig(list, expanded) {
    var d = Store.groupSum(list, "local", "volPedido");
    var max = paddedMax(d.map(function (x) { return x.value; }), expanded ? 1.28 : 1.22);
    var scales = baseScales(expanded);
    scales.x.suggestedMax = max;
    scales.y.ticks.autoSkip = false;

    return {
      type: "bar",
      data: {
        labels: d.map(function (x) { return x.label; }),
        datasets: [{ label: "Volume do pedido", data: d.map(function (x) { return x.value; }), backgroundColor: C.azulClaro, borderRadius: expanded ? 7 : 4 }]
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: expanded ? 70 : 38, top: expanded ? 12 : 2, bottom: expanded ? 10 : 2 } },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: tipVal } },
          datalabels: barEndLabels(expanded)
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  function fiscalConfig(list, expanded) {
    var d = Store.groupSum(list, "fiscal", "volInspecionado");
    var scales = baseScales(expanded);
    scales.y.suggestedMax = paddedMax(d.map(function (x) { return x.value; }), expanded ? 1.35 : 1.2);

    return {
      type: "bar",
      data: {
        labels: d.map(function (x) { return x.label; }),
        datasets: [{ label: "Inspecionado", data: d.map(function (x) { return x.value; }), backgroundColor: C.azulClaro, borderRadius: expanded ? 7 : 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: expanded ? 34 : 18, right: expanded ? 24 : 10, left: expanded ? 10 : 0, bottom: expanded ? 8 : 0 } },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: tipVal } },
          datalabels: {
            anchor: "end", align: "top", offset: expanded ? 8 : 5, clamp: true, clip: false,
            color: C.azul, backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 4, padding: expanded ? 5 : 3,
            font: { size: expanded ? 12 : 9, weight: "700" },
            formatter: function (v) { return v > 0 ? fmtC.format(v) : ""; }
          }
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  function tendenciaConfig(list, expanded) {
    var t = Store.trendByOrder(list);
    return {
      type: "line",
      data: {
        labels: t.points.map(function (p) { return p.pedido; }),
        datasets: [
          {
            label: "% concluído", data: t.points.map(function (p) { return p.pct; }),
            borderColor: C.azulClaro, backgroundColor: "rgba(50,166,230,0.12)",
            fill: true, tension: 0.3, pointRadius: expanded ? 5 : 3, pointBackgroundColor: C.azul, borderWidth: expanded ? 3 : 2
          },
          {
            label: "Tendência", data: t.trendLine,
            borderColor: C.laranja, borderDash: [6, 5], borderWidth: expanded ? 3 : 2,
            pointRadius: 0, fill: false, tension: 0
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: expanded ? 34 : 18, right: expanded ? 28 : 12, left: expanded ? 8 : 2, bottom: expanded ? 10 : 0 } },
        scales: {
          x: { grid: { color: C.grid }, ticks: { color: C.texto, font: { size: expanded ? 12 : 10 }, maxRotation: expanded ? 25 : 35, minRotation: 0, autoSkip: true, maxTicksLimit: expanded ? 12 : 7 } },
          y: { grid: { color: C.grid }, ticks: { color: C.texto, font: { size: expanded ? 12 : 10 }, callback: function (v) { return v + "%"; } }, min: 0, max: 110 }
        },
        plugins: {
          legend: legendConfig(expanded),
          tooltip: { callbacks: { label: function (c) { return " " + c.dataset.label + ": " + fmt.format(c.parsed.y) + "%"; } } },
          datalabels: linePointLabels(function (v) { return fmt.format(v) + "%"; }, expanded)
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  function historicoConfig(list, expanded) {
    var d = Store.cumulativeTransported(list);
    var scales = baseScales(expanded);
    scales.y.suggestedMax = paddedMax(d.map(function (x) { return x.total; }), expanded ? 1.25 : 1.16);

    return {
      type: "line",
      data: {
        labels: d.map(function (x) { return fmtDate.format(new Date(x.date)); }),
        datasets: [{
          label: "Transportado acumulado", data: d.map(function (x) { return x.total; }),
          borderColor: C.verde, backgroundColor: "rgba(30,159,127,0.14)",
          fill: true, tension: 0.3, pointRadius: expanded ? 5 : 2, pointBackgroundColor: C.verde, borderWidth: expanded ? 3 : 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: expanded ? 34 : 18, right: expanded ? 32 : 16, left: expanded ? 8 : 2, bottom: expanded ? 10 : 0 } },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return d[items[0].dataIndex].label + " · " + items[0].label; },
              label: function (c) { return " Acumulado: " + withUnit(c.parsed.y); }
            }
          },
          datalabels: linePointLabels(function (v) { return fmtC.format(v); }, expanded)
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  function legendConfig(expanded) {
    return {
      position: "top",
      labels: { boxWidth: expanded ? 13 : 9, boxHeight: expanded ? 13 : 9, font: { size: expanded ? 13 : 10 } }
    };
  }

  function barEndLabels(expanded) {
    return {
      anchor: "end", align: "right", clamp: true, clip: false, offset: expanded ? 8 : 4,
      color: C.texto, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 4, padding: expanded ? 5 : 3,
      font: { size: expanded ? 12 : 9, weight: "700" },
      formatter: function (v) { return v > 0 ? fmtC.format(v) : ""; }
    };
  }

  function barEndLabelsExact(expanded) {
    return {
      anchor: "end", align: "right", clamp: true, clip: false, offset: expanded ? 8 : 4,
      color: C.texto, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 4, padding: expanded ? 5 : 3,
      font: { size: expanded ? 12 : 9, weight: "700" },
      formatter: function (v, ctx) {
        if (v <= 0) return "";
        return ctx.dataset && ctx.dataset.label === "Saldo a transportar" ? "Saldo: " + withUnit(v) : withUnit(v);
      }
    };
  }

  function linePointLabels(formatter, expanded) {
    return {
      display: function (ctx) {
        if (ctx.datasetIndex !== 0) return false;
        var total = ctx.dataset && ctx.dataset.data ? ctx.dataset.data.length : 0;
        if (total <= 6) return true;
        var step = Math.ceil(total / 5);
        return ctx.dataIndex === 0 || ctx.dataIndex === total - 1 || ctx.dataIndex % step === 0;
      },
      anchor: "end", align: "top", offset: expanded ? 7 : 4, clamp: true, clip: false,
      color: C.texto, backgroundColor: "rgba(255,255,255,0.86)", borderRadius: 4, padding: expanded ? 4 : 2,
      font: { size: expanded ? 11 : 9, weight: "700" },
      formatter: formatter
    };
  }

  function val(n) { return fmt.format(Math.round(n)); }
  function pct(n) { return (Math.round(n * 10) / 10).toString().replace(".", ",") + "%"; }
  function withUnit(n) { return fmt.format(Math.round(Number(n) || 0)) + (UNIT ? " " + UNIT : ""); }
  function tipVal(c) { return " " + c.dataset.label + ": " + withUnit(c.parsed.x != null ? c.parsed.x : c.parsed.y); }

  window.DashboardUI = { refresh: refresh };
})();

/* =====================================================================
   MENU RETRÁTIL
   ===================================================================== */
(function () {
  "use strict";

  var btn = document.getElementById("btn-menu");
  if (!btn) return;

  function sync() {
    var open = !document.body.classList.contains("sidebar-collapsed");
    btn.setAttribute("aria-expanded", String(open));
  }

  btn.addEventListener("click", function () {
    document.body.classList.toggle("sidebar-collapsed");
    sync();
  });

  sync();
})();

/* =====================================================================
   (4) ROTEADOR — alterna entre as telas (via hash #registros / #dashboard)
   ===================================================================== */
(function () {
  "use strict";

  var views = {
    registros: document.getElementById("view-registros"),
    dashboard: document.getElementById("view-dashboard")
  };

  function show(view) {
    if (!views[view]) view = "registros";

    Object.keys(views).forEach(function (k) {
      views[k].hidden = (k !== view);
    });

    var items = document.querySelectorAll(".nav__item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("is-active", items[i].getAttribute("data-view") === view);
    }

    document.body.classList.toggle("dashboard-mode", view === "dashboard");

    if (view === "dashboard" && window.DashboardUI) window.DashboardUI.refresh();
    if (view === "registros" && window.RegistrosUI) window.RegistrosUI.render();

    window.scrollTo(0, 0);
  }

  // Cliques em qualquer elemento com data-view (sidebar, botões, empty-state)
  document.addEventListener("click", function (e) {
    var link = e.target.closest("[data-view]");
    if (!link) return;
    e.preventDefault();

    // Ao clicar em qualquer opção do menu lateral, o menu fecha sozinho.
    if (link.closest(".sidebar")) {
      document.body.classList.add("sidebar-collapsed");
      var menuButton = document.getElementById("btn-menu");
      if (menuButton) menuButton.setAttribute("aria-expanded", "false");
    }

    var v = link.getAttribute("data-view");
    if (location.hash !== "#" + v) {
      location.hash = "#" + v; // dispara hashchange -> show
    } else {
      show(v);
    }
  });

  window.addEventListener("hashchange", function () {
    show((location.hash || "#registros").slice(1));
  });

  // Estado inicial (respeita o hash da URL, se houver)
  show((location.hash || "#registros").slice(1));
})();