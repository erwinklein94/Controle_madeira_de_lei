/* =====================================================================
   REPORT DOS FISCAIS - painel somente de leitura.
   A fonte exclusiva é public.registros, alimentada pelo Excel Online.
   ===================================================================== */
(function () {
  "use strict";

  var root;
  var wired = false;
  var charts = {};
  var fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  var STAGES = [
    { key: "volFabricar", label: "A fabricar", color: "#15507B" },
    { key: "volPronto", label: "Fabricado", color: "#1F6FA5" },
    { key: "volInspecionado", label: "Inspecionado", color: "#32A6E6" },
    { key: "volLiberado", label: "Estoque p/ entrega", color: "#1E9F7F" },
    { key: "volTransportado", label: "Transportado", color: "#7FE06C" }
  ];

  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function key(value) {
    var source = String(value || "fiscal");
    var output = "";
    for (var index = 0; index < source.length; index += 1) output += source.charCodeAt(index).toString(36) + "-";
    return output.slice(0, -1);
  }
  function dateBr(value) {
    var parts = String(value || "").slice(0, 10).split("-");
    return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : "—";
  }
  function sum(records, field) {
    return records.reduce(function (total, record) { return total + num(record[field]); }, 0);
  }
  function uniqueCount(records, field) {
    var seen = {};
    records.forEach(function (record) {
      var value = String(record[field] || "").trim();
      if (value) seen[value] = true;
    });
    return Object.keys(seen).length;
  }
  function empty(message) {
    return '<div class="report-empty">' + esc(message) + "</div>";
  }

  function destroyCharts() {
    Object.keys(charts).forEach(function (id) {
      if (charts[id]) charts[id].destroy();
    });
    charts = {};
  }

  function kpi(label, value, detail) {
    return '<div class="report-kpi"><span>' + esc(label) + "</span><strong>" + esc(value) +
      "</strong><small>" + esc(detail || "Dados importados do Excel") + "</small></div>";
  }

  function fiscalCard(fiscal, records) {
    var fiscalKey = key(fiscal);
    var ordered = records.slice().sort(function (a, b) {
      return String(b.dataRef || b.createdAt || "").localeCompare(String(a.dataRef || a.createdAt || ""));
    });
    var lastDate = ordered.length ? dateBr(ordered[0].dataRef) : "—";
    return (
      '<article class="report-fiscal" data-fiscal-key="' + fiscalKey + '">' +
        '<header class="report-fiscal__head"><div><span class="report-fiscal__eyebrow">Fiscal/Inspetor</span><h2>' + esc(fiscal) +
        '</h2></div><span class="report-source-badge">Fonte: Excel Online</span></header>' +
        '<section class="report-dashboard">' +
          '<div class="report-kpis">' +
            kpi("Registros", fmt.format(records.length), "Último: " + lastDate) +
            kpi("Pedidos", fmt.format(uniqueCount(records, "pedido")), "Pedidos acompanhados") +
            kpi("Fabricado", fmt.format(sum(records, "volPronto")), "Volume acumulado") +
            kpi("Inspecionado", fmt.format(sum(records, "volInspecionado")), "Volume acumulado") +
            kpi("Transportado", fmt.format(sum(records, "volTransportado")), "Volume acumulado") +
          "</div>" +
          '<div class="report-dashboard-grid">' +
            '<section class="report-chart-card"><div class="report-chart-title"><strong>Progresso por etapa</strong><span>Totais deste fiscal</span></div><div class="report-chart"><canvas id="report-stage-' + fiscalKey + '"></canvas></div></section>' +
            '<section class="report-chart-card"><div class="report-chart-title"><strong>Evolução por data</strong><span>Últimas atividades</span></div><div class="report-chart"><canvas id="report-timeline-' + fiscalKey + '"></canvas></div></section>' +
          "</div>" +
        "</section>" +
        '<section class="report-activities"><div class="report-section-head"><div><h3>Registros de ' + esc(fiscal) +
          "</h3><p>Somente informações sincronizadas da planilha Excel Online.</p></div></div>" +
          drawTable(ordered) +
        "</section>" +
      "</article>"
    );
  }

  function drawTable(records) {
    if (!records.length) return empty("Nenhum registro importado para este fiscal.");
    var heads = ["ID", "Data", "Semana", "Fornecedor", "Local", "Pedido", "Vol. pedido", "A fabricar", "Fabricado", "Inspecionado", "Estoque p/ entrega", "Transportado"];
    var body = records.map(function (record) {
      return "<tr>" +
        '<td class="col-text">' + esc(record.excelId || "—") + "</td>" +
        "<td>" + dateBr(record.dataRef) + "</td>" +
        "<td>" + esc(record.semana || "—") + "</td>" +
        '<td class="col-text">' + esc(record.fornecedor) + "</td>" +
        '<td class="col-text">' + esc(record.local) + "</td>" +
        '<td class="col-text cell-pedido">' + esc(record.pedido) + "</td>" +
        ["volPedido", "volFabricar", "volPronto", "volInspecionado", "volLiberado", "volTransportado"].map(function (field) {
          return "<td>" + fmt.format(num(record[field])) + "</td>";
        }).join("") +
        "</tr>";
    }).join("");
    return '<div class="table-wrap"><table class="tabela report-table__table"><thead><tr>' +
      heads.map(function (head) { return "<th>" + head + "</th>"; }).join("") +
      "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function dailySeries(records) {
    var byDate = {};
    records.forEach(function (record) {
      var date = String(record.dataRef || "").slice(0, 10);
      if (!date) return;
      if (!byDate[date]) byDate[date] = { fabricado: 0, inspecionado: 0, transportado: 0 };
      byDate[date].fabricado += num(record.volPronto);
      byDate[date].inspecionado += num(record.volInspecionado);
      byDate[date].transportado += num(record.volTransportado);
    });
    var dates = Object.keys(byDate).sort().slice(-14);
    return {
      labels: dates.map(dateBr),
      fabricado: dates.map(function (date) { return byDate[date].fabricado; }),
      inspecionado: dates.map(function (date) { return byDate[date].inspecionado; }),
      transportado: dates.map(function (date) { return byDate[date].transportado; })
    };
  }

  function chartOptions() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: dark ? "#e6eff6" : "#425466", boxWidth: 12 } },
        datalabels: { display: false },
        tooltip: { callbacks: { label: function (context) { return context.dataset.label + ": " + fmt.format(num(context.raw)); } } }
      },
      scales: {
        x: { ticks: { color: dark ? "#c6d4df" : "#526778" }, grid: { color: dark ? "rgba(255,255,255,.08)" : "rgba(0,56,101,.08)" } },
        y: { beginAtZero: true, ticks: { color: dark ? "#c6d4df" : "#526778" }, grid: { color: dark ? "rgba(255,255,255,.08)" : "rgba(0,56,101,.08)" } }
      }
    };
  }

  function drawCharts(fiscal, records) {
    if (typeof window.Chart !== "function") return;
    var fiscalKey = key(fiscal);
    var stageCanvas = document.getElementById("report-stage-" + fiscalKey);
    var timelineCanvas = document.getElementById("report-timeline-" + fiscalKey);
    if (stageCanvas) {
      charts["stage-" + fiscalKey] = new Chart(stageCanvas, {
        type: "bar",
        data: {
          labels: STAGES.map(function (stage) { return stage.label; }),
          datasets: [{ label: "Volume", data: STAGES.map(function (stage) { return sum(records, stage.key); }), backgroundColor: STAGES.map(function (stage) { return stage.color; }), borderRadius: 4 }]
        },
        options: chartOptions()
      });
    }
    if (timelineCanvas) {
      var daily = dailySeries(records);
      charts["timeline-" + fiscalKey] = new Chart(timelineCanvas, {
        type: "line",
        data: {
          labels: daily.labels,
          datasets: [
            { label: "Fabricado", data: daily.fabricado, borderColor: "#1F6FA5", backgroundColor: "rgba(31,111,165,.12)", tension: 0.25 },
            { label: "Inspecionado", data: daily.inspecionado, borderColor: "#32A6E6", backgroundColor: "rgba(50,166,230,.12)", tension: 0.25 },
            { label: "Transportado", data: daily.transportado, borderColor: "#1E9F7F", backgroundColor: "rgba(30,159,127,.12)", tension: 0.25 }
          ]
        },
        options: chartOptions()
      });
    }
  }

  function draw(records) {
    destroyCharts();
    var grouped = {};
    records.forEach(function (record) {
      var fiscal = String(record.fiscal || "").trim();
      if (!fiscal) return;
      if (!grouped[fiscal]) grouped[fiscal] = [];
      grouped[fiscal].push(record);
    });
    var fiscals = Object.keys(grouped).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
    if (!fiscals.length) {
      root.innerHTML = empty("Nenhum fiscal foi encontrado nos registros importados.");
      return;
    }
    root.innerHTML = fiscals.map(function (fiscal) { return fiscalCard(fiscal, grouped[fiscal]); }).join("");
    fiscals.forEach(function (fiscal) { drawCharts(fiscal, grouped[fiscal]); });
  }

  function wire() {
    if (wired) return;
    var refresh = document.getElementById("report-refresh");
    if (refresh) refresh.addEventListener("click", render);
    wired = true;
  }

  function render() {
    root = root || document.getElementById("report-fiscais");
    if (!root) return;
    wire();
    root.innerHTML = empty("Atualizando dados importados do Excel…");
    if (!window.Store) {
      root.innerHTML = empty("A fonte de Registros não está disponível.");
      return;
    }
    Store.refresh().then(function () {
      draw(Store.getAll());
    }).catch(function (error) {
      root.innerHTML = empty("Não foi possível carregar os registros: " + (error.message || error));
    });
  }

  window.ReportSemanalUI = { render: render };
})();
