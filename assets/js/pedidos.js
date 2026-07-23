/* =====================================================================
   PEDIDOS - consolidação dos registros importados do Excel Online.
   Cada número de pedido aparece uma única vez nos gráficos e na tabela.
   ===================================================================== */
(function (global) {
  "use strict";

  var root;
  var wired = false;
  var allRecords = [];
  var currentOrders = [];
  var charts = {};
  var fields = {};
  var fmt = new Intl.NumberFormat("pt-BR");
  var fmtCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? Math.max(parsed, 0) : 0;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function pct(value) {
    return (Math.round(num(value) * 10) / 10).toString().replace(".", ",") + "%";
  }

  function dateBr(value) {
    var parts = String(value || "").slice(0, 10).split("-");
    return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : "—";
  }

  function addDistinct(target, value) {
    var normalized = String(value == null ? "" : value).trim();
    if (normalized) target[normalized] = true;
  }

  function distinctList(target) {
    return Object.keys(target).sort(function (a, b) {
      return a.localeCompare(b, "pt-BR", { numeric: true });
    });
  }

  function aggregateOrders(records) {
    var grouped = {};
    records.forEach(function (record) {
      var pedido = String(record && record.pedido != null ? record.pedido : "").trim();
      if (!pedido) return;
      if (!grouped[pedido]) {
        grouped[pedido] = {
          pedido: pedido,
          volumePedido: 0,
          transportado: 0,
          fornecedoresMap: {},
          fiscaisMap: {},
          locaisMap: {},
          semanasMap: {},
          registros: 0,
          ultimaData: ""
        };
      }
      var item = grouped[pedido];
      item.volumePedido = Math.max(item.volumePedido, num(record.volPedido));
      item.transportado = Math.max(item.transportado, num(record.volTransportado));
      item.registros += 1;
      addDistinct(item.fornecedoresMap, record.fornecedor);
      addDistinct(item.fiscaisMap, record.fiscal);
      addDistinct(item.locaisMap, record.local);
      addDistinct(item.semanasMap, record.semana);
      var date = String(record.dataRef || "").slice(0, 10);
      if (date > item.ultimaData) item.ultimaData = date;
    });

    return Object.keys(grouped).map(function (pedido) {
      var item = grouped[pedido];
      item.fornecedores = distinctList(item.fornecedoresMap);
      item.fiscais = distinctList(item.fiscaisMap);
      item.locais = distinctList(item.locaisMap);
      item.semanas = distinctList(item.semanasMap);
      item.conclusao = item.volumePedido > 0
        ? Math.min(100, (item.transportado / item.volumePedido) * 100)
        : 0;
      item.concluido = item.volumePedido > 0 && item.transportado >= item.volumePedido;
      delete item.fornecedoresMap;
      delete item.fiscaisMap;
      delete item.locaisMap;
      delete item.semanasMap;
      return item;
    }).sort(function (a, b) {
      return a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true });
    });
  }

  function grab() {
    root = document.getElementById("view-pedidos");
    fields.fornecedor = document.getElementById("pedidos-f-fornecedor");
    fields.fiscal = document.getElementById("pedidos-f-fiscal");
    fields.semana = document.getElementById("pedidos-f-semana");
    fields.pedido = document.getElementById("pedidos-f-pedido");
    fields.local = document.getElementById("pedidos-f-local");
    fields.count = document.getElementById("pedidos-filter-count");
    fields.table = document.getElementById("pedidos-table");
    fields.tableCount = document.getElementById("pedidos-table-count");
    fields.ordersWrap = document.getElementById("pedidos-orders-chart-wrap");
    fields.ordersCanvas = document.getElementById("pedidos-orders-chart");
    fields.completionCanvas = document.getElementById("pedidos-completion-chart");
    fields.completionPct = document.getElementById("pedidos-completion-pct");
    fields.completionDetail = document.getElementById("pedidos-completion-detail");
  }

  function recordWeek(record) {
    var value = Number(record.semana);
    if (isFinite(value) && value >= 1 && value <= 53) return String(Math.round(value));
    return global.Store ? String(Store.isoWeekNumber(record.dataRef)) : "";
  }

  function uniqueValues(records, getter) {
    var values = {};
    records.forEach(function (record) {
      var value = String(getter(record) || "").trim();
      if (value) values[value] = true;
    });
    return Object.keys(values).sort(function (a, b) {
      return a.localeCompare(b, "pt-BR", { numeric: true });
    });
  }

  function fillSelect(select, values, emptyLabel, formatter) {
    if (!select) return;
    var previous = select.value;
    select.innerHTML = '<option value="">' + emptyLabel + "</option>";
    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = formatter ? formatter(value) : value;
      select.appendChild(option);
    });
    if (values.indexOf(previous) >= 0) select.value = previous;
  }

  function fillFilters() {
    fillSelect(fields.fornecedor, uniqueValues(allRecords, function (r) { return r.fornecedor; }), "Todos");
    fillSelect(fields.fiscal, uniqueValues(allRecords, function (r) { return r.fiscal; }), "Todos");
    fillSelect(fields.semana, uniqueValues(allRecords, recordWeek), "Todas", function (value) { return "Semana " + value; });
    fillSelect(fields.pedido, uniqueValues(allRecords, function (r) { return r.pedido; }), "Todos");
    fillSelect(fields.local, uniqueValues(allRecords, function (r) { return r.local; }), "Todos");
  }

  function filteredRecords() {
    return allRecords.filter(function (record) {
      if (fields.fornecedor.value && record.fornecedor !== fields.fornecedor.value) return false;
      if (fields.fiscal.value && record.fiscal !== fields.fiscal.value) return false;
      if (fields.semana.value && recordWeek(record) !== fields.semana.value) return false;
      if (fields.pedido.value && String(record.pedido) !== fields.pedido.value) return false;
      if (fields.local.value && record.local !== fields.local.value) return false;
      return true;
    });
  }

  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function ink() {
    return isDark() ? "#e6eff6" : "#003865";
  }

  function softInk() {
    return isDark() ? "#c6d4df" : "#526778";
  }

  function gridColor() {
    return isDark() ? "rgba(50,166,230,0.18)" : "rgba(0,56,101,0.10)";
  }

  function destroyCharts() {
    Object.keys(charts).forEach(function (key) {
      if (charts[key]) charts[key].destroy();
    });
    charts = {};
  }

  function showChartFallback(container, message) {
    if (!container) return;
    var existing = container.querySelector(".pedidos-chart-fallback");
    if (!existing) {
      existing = document.createElement("p");
      existing.className = "card__hint pedidos-chart-fallback";
      container.appendChild(existing);
    }
    existing.textContent = message;
  }

  function clearChartFallback(container) {
    if (!container) return;
    var fallback = container.querySelector(".pedidos-chart-fallback");
    if (fallback) fallback.remove();
  }

  function ordersChart(orders) {
    if (!fields.ordersCanvas || typeof global.Chart !== "function") {
      showChartFallback(fields.ordersWrap, "A biblioteca de gráficos não carregou.");
      return;
    }
    clearChartFallback(fields.ordersWrap);
    var max = orders.reduce(function (largest, order) {
      return Math.max(largest, order.volumePedido, order.transportado);
    }, 0);
    fields.ordersWrap.style.height = Math.max(360, orders.length * 54 + 70) + "px";

    charts.orders = new Chart(fields.ordersCanvas, {
      type: "bar",
      data: {
        labels: orders.map(function (order) { return order.pedido; }),
        datasets: [
          {
            label: "Volume do pedido",
            data: orders.map(function (order) { return order.volumePedido; }),
            backgroundColor: "#15507B",
            borderRadius: 4
          },
          {
            label: "Transportado",
            data: orders.map(function (order) { return order.transportado; }),
            backgroundColor: "#1E9F7F",
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 125, top: 8, bottom: 4, left: 4 } },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: max > 0 ? Math.ceil(max * 1.42) : 10,
            grid: { color: gridColor() },
            ticks: { color: softInk(), callback: function (value) { return fmtCompact.format(value); } }
          },
          y: {
            grid: { display: false },
            ticks: { color: ink(), autoSkip: false, font: { size: 11, weight: "600" } }
          }
        },
        plugins: {
          legend: { position: "top", labels: { color: ink(), boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            callbacks: {
              label: function (context) {
                var order = orders[context.dataIndex];
                var value = context.datasetIndex === 0 ? order.volumePedido : order.transportado;
                return " " + context.dataset.label + ": " + fmt.format(value);
              },
              afterBody: function (items) {
                return "Conclusão: " + pct(orders[items[0].dataIndex].conclusao);
              }
            }
          },
          datalabels: {
            display: true,
            anchor: "end",
            align: "right",
            offset: 4,
            clamp: true,
            clip: false,
            color: ink(),
            font: { size: 10, weight: "700" },
            formatter: function (value, context) {
              var text = fmt.format(num(value));
              return context.datasetIndex === 1
                ? text + " · " + pct(orders[context.dataIndex].conclusao)
                : text;
            }
          }
        }
      },
      plugins: global.ChartDataLabels ? [global.ChartDataLabels] : []
    });
  }

  function completionChart(orders) {
    var total = orders.length;
    var completed = orders.filter(function (order) { return order.concluido; }).length;
    var completion = total ? (completed / total) * 100 : 0;
    if (fields.completionPct) fields.completionPct.textContent = pct(completion);
    if (fields.completionDetail) fields.completionDetail.textContent = completed + " de " + total + " pedidos";
    if (!fields.completionCanvas || typeof global.Chart !== "function") return;

    charts.completion = new Chart(fields.completionCanvas, {
      type: "doughnut",
      data: {
        labels: ["Concluídos", "Em andamento"],
        datasets: [{
          data: [completed, Math.max(total - completed, 0)],
          backgroundColor: ["#1E9F7F", isDark() ? "#34546b" : "#dce5ea"],
          borderColor: isDark() ? "#003865" : "#ffffff",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { position: "bottom", labels: { color: ink(), boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            callbacks: {
              label: function (context) {
                return " " + context.label + ": " + context.raw + " pedidos";
              }
            }
          },
          datalabels: {
            display: function (context) { return Number(context.raw) > 0; },
            color: ink(),
            font: { size: 11, weight: "700" },
            formatter: function (value) { return value + " pedidos"; }
          }
        }
      },
      plugins: global.ChartDataLabels ? [global.ChartDataLabels] : []
    });
  }

  function drawCharts(orders) {
    destroyCharts();
    if (!orders.length) {
      if (fields.ordersWrap) {
        fields.ordersWrap.style.height = "240px";
        showChartFallback(fields.ordersWrap, "Nenhum pedido para os filtros selecionados.");
      }
      completionChart(orders);
      return;
    }
    ordersChart(orders);
    completionChart(orders);
  }

  function joined(values) {
    return values.length ? values.join(" · ") : "—";
  }

  function drawTable(orders, recordCount) {
    if (fields.tableCount) {
      fields.tableCount.textContent = orders.length
        ? "Mostrando " + orders.length + " pedidos únicos de " + recordCount + " registros filtrados."
        : "Nenhum pedido para os filtros selecionados.";
    }
    if (!fields.table) return;
    if (!orders.length) {
      fields.table.innerHTML = '<p class="card__hint">Nenhum pedido encontrado.</p>';
      return;
    }
    var head = [
      "Pedido", "Fornecedor", "Fiscal", "Local", "Semana", "Último registro",
      "Volume do pedido", "Transportado", "Conclusão", "Status", "Registros"
    ];
    var rows = orders.map(function (order) {
      return "<tr>" +
        '<td class="cell-pedido">' + esc(order.pedido) + "</td>" +
        '<td class="col-text">' + esc(joined(order.fornecedores)) + "</td>" +
        '<td class="col-text">' + esc(joined(order.fiscais)) + "</td>" +
        '<td class="col-text">' + esc(joined(order.locais)) + "</td>" +
        "<td>" + esc(joined(order.semanas)) + "</td>" +
        "<td>" + dateBr(order.ultimaData) + "</td>" +
        "<td>" + fmt.format(order.volumePedido) + "</td>" +
        "<td>" + fmt.format(order.transportado) + "</td>" +
        "<td><strong>" + pct(order.conclusao) + "</strong></td>" +
        '<td><span class="pedido-status ' + (order.concluido ? "pedido-status--done" : "pedido-status--progress") + '">' +
          (order.concluido ? "Concluído" : "Em andamento") + "</span></td>" +
        "<td>" + fmt.format(order.registros) + "</td>" +
      "</tr>";
    }).join("");
    fields.table.innerHTML = '<div class="table-wrap"><table class="tabela pedidos-table"><thead><tr>' +
      head.map(function (label) { return "<th>" + label + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function draw() {
    if (!root) return;
    var records = filteredRecords();
    currentOrders = aggregateOrders(records);
    if (fields.count) {
      fields.count.innerHTML = "<strong>" + currentOrders.length + "</strong> pedidos · " +
        records.length + " registros";
    }
    drawCharts(currentOrders);
    drawTable(currentOrders, records.length);
    if (global.PresentationMode && global.PresentationMode.sync) global.PresentationMode.sync();
    if (global.PDFExport && global.PDFExport.sync) global.PDFExport.sync();
  }

  function clearFilters() {
    ["fornecedor", "fiscal", "semana", "pedido", "local"].forEach(function (key) {
      if (fields[key]) fields[key].value = "";
    });
    draw();
  }

  function wire() {
    if (wired) return;
    ["fornecedor", "fiscal", "semana", "pedido", "local"].forEach(function (key) {
      if (fields[key]) fields[key].addEventListener("change", draw);
    });
    var clear = document.getElementById("pedidos-f-limpar");
    var refresh = document.getElementById("pedidos-refresh");
    if (clear) clear.addEventListener("click", clearFilters);
    if (refresh) refresh.addEventListener("click", render);
    wired = true;
  }

  function render() {
    grab();
    if (!root || !global.Store) return;
    wire();
    if (fields.table) fields.table.innerHTML = '<p class="card__hint">Atualizando pedidos…</p>';
    Store.refresh().then(function () {
      allRecords = Store.getAll();
      fillFilters();
      draw();
    }).catch(function (error) {
      if (fields.table) {
        fields.table.innerHTML = '<p class="card__hint">Não foi possível carregar os pedidos (' +
          esc(error && error.message ? error.message : error) + ").</p>";
      }
    });
  }

  function redraw() {
    if (!root || root.hidden) return;
    drawCharts(currentOrders);
  }

  global.PedidosUI = {
    render: render,
    redraw: redraw,
    aggregateOrders: aggregateOrders
  };
})(window);
