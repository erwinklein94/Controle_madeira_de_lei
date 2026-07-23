/* =====================================================================
   PROGRAMAÇÃO SEMANAL — mural somente leitura sincronizado do Excel.
   ===================================================================== */
(function (global) {
  "use strict";

  var all = [];
  var wired = false;
  var defaultsApplied = false;
  var el = {};
  var intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  var dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function text(value) {
    var normalized = String(value == null ? "" : value).trim();
    return normalized && normalized !== "0" ? normalized : "";
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(String(value).slice(0, 10) + "T00:00:00Z");
    return Number.isNaN(date.getTime()) ? "—" : dateFmt.format(date);
  }

  function formatPeriod(row) {
    var start = formatDate(row.data_inicio);
    var end = formatDate(row.data_fim);
    return start === end ? start : start + " a " + end;
  }

  function distinct(rows, field) {
    var seen = {};
    rows.forEach(function (row) {
      var value = text(row[field]);
      if (value) seen[value] = true;
    });
    return Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b, "pt-BR", { numeric: true });
    });
  }

  function grab() {
    el.ano = document.getElementById("programacao-ano");
    el.semana = document.getElementById("programacao-semana");
    el.fiscal = document.getElementById("programacao-fiscal");
    el.fornecedor = document.getElementById("programacao-fornecedor");
    el.pedido = document.getElementById("programacao-pedido");
    el.statusFiltro = document.getElementById("programacao-status-filtro");
    el.limpar = document.getElementById("programacao-limpar");
    el.refresh = document.getElementById("programacao-refresh");
    el.status = document.getElementById("programacao-status");
    el.mural = document.getElementById("programacao-mural");
    el.tabela = document.getElementById("programacao-tabela");
    el.contador = document.getElementById("programacao-contador");
    el.kpiRegistros = document.getElementById("programacao-kpi-registros");
    el.kpiFiscais = document.getElementById("programacao-kpi-fiscais");
    el.kpiPecas = document.getElementById("programacao-kpi-pecas");
    el.kpiFornecedores = document.getElementById("programacao-kpi-fornecedores");
  }

  function filters() {
    return [el.ano, el.semana, el.fiscal, el.fornecedor, el.pedido, el.statusFiltro];
  }

  function setup() {
    if (wired) return;
    grab();
    filters().forEach(function (select) {
      select.addEventListener("change", draw);
    });
    el.limpar.addEventListener("click", function () {
      filters().forEach(function (select) { select.value = ""; });
      draw();
    });
    el.refresh.addEventListener("click", function () { load(true); });
    wired = true;
  }

  function fillSelect(select, values, allLabel) {
    var previous = select.value;
    select.innerHTML = '<option value="">' + allLabel + "</option>";
    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if (values.indexOf(previous) >= 0) select.value = previous;
  }

  function isoWeekNow() {
    var date = new Date();
    var utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    return {
      ano: utc.getUTCFullYear(),
      semana: Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)
    };
  }

  function chooseDefaultPeriod() {
    if (defaultsApplied || !all.length) return;
    defaultsApplied = true;
    var current = isoWeekNow();
    var periods = {};
    all.forEach(function (row) {
      periods[(Number(row.ano) * 100) + Number(row.semana)] = {
        ano: Number(row.ano),
        semana: Number(row.semana)
      };
    });
    var keys = Object.keys(periods).map(Number).sort(function (a, b) { return a - b; });
    var currentKey = current.ano * 100 + current.semana;
    var chosenKey = keys.find(function (key) { return key >= currentKey; }) || keys[keys.length - 1];
    var chosen = periods[chosenKey];
    if (chosen) {
      el.ano.value = String(chosen.ano);
      el.semana.value = String(chosen.semana);
    }
  }

  function fillFilters() {
    fillSelect(el.ano, distinct(all, "ano"), "Todos");
    fillSelect(el.semana, distinct(all, "semana"), "Todas");
    fillSelect(el.fiscal, distinct(all, "fiscal"), "Todos");
    fillSelect(el.fornecedor, distinct(all, "fornecedor"), "Todos");
    fillSelect(el.pedido, distinct(all, "pedido"), "Todos");
    fillSelect(el.statusFiltro, distinct(all, "status"), "Todos");
    chooseDefaultPeriod();
  }

  function filtered() {
    return all.filter(function (row) {
      return (!el.ano.value || String(row.ano) === el.ano.value) &&
        (!el.semana.value || String(row.semana) === el.semana.value) &&
        (!el.fiscal.value || row.fiscal === el.fiscal.value) &&
        (!el.fornecedor.value || row.fornecedor === el.fornecedor.value) &&
        (!el.pedido.value || row.pedido === el.pedido.value) &&
        (!el.statusFiltro.value || row.status === el.statusFiltro.value);
    });
  }

  function pieces(rows) {
    return rows.reduce(function (sum, row) {
      return sum + (Number(row.qtde_pecas) || 0);
    }, 0);
  }

  function assignmentCard(row) {
    var note = text(row.observacoes);
    return '<article class="programacao-card">' +
      '<div class="programacao-card__top">' +
        '<div><div class="programacao-card__eyebrow">Fiscal</div>' +
        '<h3>' + esc(row.fiscal) + "</h3></div>" +
        '<div class="programacao-card__expectativa"><strong>' +
          intFmt.format(Number(row.qtde_pecas) || 0) +
        '</strong><span>peças</span></div>' +
      "</div>" +
      '<dl class="programacao-card__details">' +
        '<div><dt>Fornecedor</dt><dd>' + esc(row.fornecedor) + "</dd></div>" +
        '<div><dt>Pedido</dt><dd>' + esc(row.pedido) + "</dd></div>" +
        '<div><dt>Período</dt><dd>' + esc(formatPeriod(row)) + "</dd></div>" +
        '<div><dt>Status</dt><dd><span class="programacao-card__status">' +
          esc(row.status) + "</span></dd></div>" +
      "</dl>" +
      (note ? '<p class="programacao-card__note">' + esc(note) + "</p>" : "") +
    "</article>";
  }

  function drawMural(rows) {
    if (!rows.length) {
      el.mural.innerHTML =
        '<div class="empty"><div class="empty__title">Nenhuma programação encontrada</div>' +
        '<div class="empty__txt">Ajuste os filtros ou aguarde a próxima sincronização do Excel Online.</div></div>';
      return;
    }
    var groups = {};
    rows.forEach(function (row) {
      var key = row.ano + "-" + String(row.semana).padStart(2, "0");
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    var keys = Object.keys(groups).sort().reverse();
    el.mural.innerHTML = keys.map(function (key) {
      var group = groups[key];
      group.sort(function (a, b) {
        return a.fiscal.localeCompare(b.fiscal, "pt-BR") ||
          a.data_inicio.localeCompare(b.data_inicio);
      });
      return '<section class="programacao-semana-card">' +
        '<header class="programacao-semana-card__head">' +
          '<div><div class="programacao-card__eyebrow">Planejamento</div>' +
          '<h2>Semana ' + esc(group[0].semana) + " · " + esc(group[0].ano) + "</h2></div>" +
          '<div class="programacao-semana-card__total">' +
            intFmt.format(pieces(group)) + " peças programadas</div>" +
        "</header>" +
        '<div class="programacao-grid">' + group.map(assignmentCard).join("") + "</div>" +
      "</section>";
    }).join("");
  }

  function drawTable(rows) {
    el.contador.textContent = rows.length
      ? rows.length + (rows.length === 1 ? " programação." : " programações.")
      : "Nenhuma programação.";
    if (!rows.length) {
      el.tabela.innerHTML = "";
      return;
    }
    el.tabela.innerHTML =
      '<div class="table-scroll"><table><thead><tr>' +
      "<th>ID</th><th>Fornecedor</th><th>Pedido</th><th>Fiscal</th>" +
      "<th>Data Início</th><th>Data Fim</th><th>Qtde Peças</th><th>Status</th><th>Observações</th>" +
      "</tr></thead><tbody>" +
      rows.map(function (row) {
        return "<tr><td>" + esc(row.excel_id) + "</td><td>" + esc(row.fornecedor) +
          "</td><td>" + esc(row.pedido) + "</td><td>" + esc(row.fiscal) +
          "</td><td>" + esc(formatDate(row.data_inicio)) + "</td><td>" +
          esc(formatDate(row.data_fim)) + '</td><td class="num">' +
          intFmt.format(Number(row.qtde_pecas) || 0) + "</td><td>" +
          esc(row.status) + "</td><td>" + esc(text(row.observacoes) || "—") +
          "</td></tr>";
      }).join("") +
      "</tbody></table></div>";
  }

  function draw() {
    var rows = filtered();
    el.kpiRegistros.textContent = intFmt.format(rows.length);
    el.kpiFiscais.textContent = intFmt.format(distinct(rows, "fiscal").length);
    el.kpiPecas.textContent = intFmt.format(pieces(rows));
    el.kpiFornecedores.textContent = intFmt.format(distinct(rows, "fornecedor").length);
    el.status.textContent = rows.length
      ? "Mostrando a programação sincronizada para os filtros selecionados."
      : "";
    drawMural(rows);
    drawTable(rows);
  }

  function load(force) {
    setup();
    if (!global.sbClient) {
      el.status.textContent = "Sem conexão com o banco de dados.";
      drawMural([]);
      return Promise.resolve();
    }
    el.refresh.disabled = true;
    el.status.textContent = force ? "Atualizando programação…" : "Carregando programação…";
    return global.sbClient.from("programacao_semanal")
      .select("id, excel_id, ano, semana, fornecedor, pedido, fiscal, data_inicio, data_fim, qtde_pecas, status, observacoes, integrado_em")
      .order("ano", { ascending: false })
      .order("semana", { ascending: false })
      .order("data_inicio", { ascending: true })
      .order("fiscal", { ascending: true })
      .then(function (result) {
        el.refresh.disabled = false;
        if (result.error) {
          el.status.textContent = "Não foi possível carregar a programação: " + result.error.message;
          el.mural.innerHTML = "";
          el.tabela.innerHTML = "";
          return;
        }
        all = result.data || [];
        fillFilters();
        draw();
      });
  }

  global.ProgramacaoSemanalUI = { render: function () { return load(false); } };
})(window);
