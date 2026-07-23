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

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function text(value) {
    var normalized = String(value == null ? "" : value).trim();
    return normalized && normalized !== "0" ? normalized : "";
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
    el.local = document.getElementById("programacao-local");
    el.limpar = document.getElementById("programacao-limpar");
    el.refresh = document.getElementById("programacao-refresh");
    el.status = document.getElementById("programacao-status");
    el.mural = document.getElementById("programacao-mural");
    el.tabela = document.getElementById("programacao-tabela");
    el.contador = document.getElementById("programacao-contador");
    el.kpiRegistros = document.getElementById("programacao-kpi-registros");
    el.kpiFiscais = document.getElementById("programacao-kpi-fiscais");
    el.kpiExpectativa = document.getElementById("programacao-kpi-expectativa");
    el.kpiLocais = document.getElementById("programacao-kpi-locais");
  }

  function setup() {
    if (wired) return;
    grab();
    [el.ano, el.semana, el.fiscal, el.fornecedor, el.local].forEach(function (select) {
      select.addEventListener("change", draw);
    });
    el.limpar.addEventListener("click", function () {
      [el.ano, el.semana, el.fiscal, el.fornecedor, el.local].forEach(function (select) {
        select.value = "";
      });
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
    fillSelect(el.local, distinct(all, "local"), "Todos");
    chooseDefaultPeriod();
  }

  function filtered() {
    return all.filter(function (row) {
      return (!el.ano.value || String(row.ano) === el.ano.value) &&
        (!el.semana.value || String(row.semana) === el.semana.value) &&
        (!el.fiscal.value || row.fiscal === el.fiscal.value) &&
        (!el.fornecedor.value || row.fornecedor === el.fornecedor.value) &&
        (!el.local.value || row.local === el.local.value);
    });
  }

  function expectation(rows) {
    return rows.reduce(function (sum, row) {
      return sum + (Number(row.expectativa_pecas) || 0);
    }, 0);
  }

  function assignmentCard(row) {
    var supplier = text(row.fornecedor);
    var note = text(row.observacoes);
    return '<article class="programacao-card">' +
      '<div class="programacao-card__top">' +
        '<div><div class="programacao-card__eyebrow">Fiscal</div>' +
        '<h3>' + esc(row.fiscal) + "</h3></div>" +
        '<div class="programacao-card__expectativa"><strong>' +
          intFmt.format(Number(row.expectativa_pecas) || 0) +
        '</strong><span>peças</span></div>' +
      "</div>" +
      '<dl class="programacao-card__details">' +
        '<div><dt>Local</dt><dd>' + esc(row.local) + "</dd></div>" +
        (supplier ? '<div><dt>Fornecedor</dt><dd>' + esc(supplier) + "</dd></div>" : "") +
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
      group.sort(function (a, b) { return a.fiscal.localeCompare(b.fiscal, "pt-BR"); });
      return '<section class="programacao-semana-card">' +
        '<header class="programacao-semana-card__head">' +
          '<div><div class="programacao-card__eyebrow">Planejamento</div>' +
          '<h2>Semana ' + esc(group[0].semana) + " · " + esc(group[0].ano) + "</h2></div>" +
          '<div class="programacao-semana-card__total">' +
            intFmt.format(expectation(group)) + " peças previstas</div>" +
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
      "<th>Ano</th><th>Semana</th><th>Fiscal</th><th>Fornecedor</th><th>Local</th>" +
      "<th>Expectativa de Peças</th><th>Observações</th>" +
      "</tr></thead><tbody>" +
      rows.map(function (row) {
        return "<tr><td>" + esc(row.ano) + "</td><td>" + esc(row.semana) +
          "</td><td>" + esc(row.fiscal) + "</td><td>" + esc(text(row.fornecedor) || "—") +
          "</td><td>" + esc(row.local) + '</td><td class="num">' +
          intFmt.format(Number(row.expectativa_pecas) || 0) + "</td><td>" +
          esc(text(row.observacoes) || "—") + "</td></tr>";
      }).join("") +
      "</tbody></table></div>";
  }

  function draw() {
    var rows = filtered();
    el.kpiRegistros.textContent = intFmt.format(rows.length);
    el.kpiFiscais.textContent = intFmt.format(distinct(rows, "fiscal").length);
    el.kpiExpectativa.textContent = intFmt.format(expectation(rows));
    el.kpiLocais.textContent = intFmt.format(distinct(rows, "local").length);
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
      .select("id, excel_id, ano, semana, fiscal, fornecedor, local, expectativa_pecas, observacoes, integrado_em")
      .order("ano", { ascending: false })
      .order("semana", { ascending: false })
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
