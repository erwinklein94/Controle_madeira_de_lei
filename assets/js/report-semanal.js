/* =====================================================================
   REPORT SEMANAL - planejamento e atividades diarias por fiscal.
   Os fiscais sao dinamicos e vem da categoria "fiscal" em Padronizacao.
   ===================================================================== */
(function () {
  "use strict";

  var root;
  var wired = false;
  var charts = {};
  var orderCharts = {};
  var state = {};
  var historyState = { start: "", end: "", supplier: "", entries: [], suppliers: [] };
  var HISTORY_PAGE_SIZE = 1000;
  var ORDER_PROGRESS_PAGE_SIZE = 1000;
  var fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  var DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  function sb() { return window.sbClient; }
  function canManagePlans() {
    return !!(window.AccessControl && window.AccessControl.isFull(window.currentProfile && window.currentProfile.role));
  }
  function canSendEntries() { return canManagePlans(); }
  function canDeleteEntries() {
    var role = window.currentProfile && window.currentProfile.role;
    return !!(window.AccessControl && (window.AccessControl.isFull(role) || window.AccessControl.isFiscal(role)));
  }
  function canViewHistory() { return canManagePlans(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function attr(s) { return esc(s); }
  function key(fiscal) {
    var out = "";
    for (var i = 0; i < fiscal.length; i++) out += fiscal.charCodeAt(i).toString(36) + "-";
    return out.slice(0, -1);
  }
  function isoLocal(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function parseIso(s) {
    var p = String(s || "").slice(0, 10).split("-");
    return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(NaN);
  }
  function mondayOf(d) {
    var copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = copy.getDay();
    copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
    return copy;
  }
  function weekValueToMonday(value) {
    var match = /^(\d{4})-W(\d{2})$/.exec(value || "");
    if (!match) return isoLocal(mondayOf(new Date()));
    var year = +match[1], week = +match[2];
    var jan4 = new Date(year, 0, 4);
    var firstMonday = mondayOf(jan4);
    firstMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
    return isoLocal(firstMonday);
  }
  function mondayToWeekValue(iso) {
    var d = parseIso(iso);
    var thursday = new Date(d);
    thursday.setDate(d.getDate() + 3);
    var year = thursday.getFullYear();
    var jan4 = new Date(year, 0, 4);
    var firstThursday = new Date(mondayOf(jan4));
    firstThursday.setDate(firstThursday.getDate() + 3);
    var week = 1 + Math.round((thursday - firstThursday) / 604800000);
    return year + "-W" + String(week).padStart(2, "0");
  }
  function weekEnd(weekStart) {
    var d = parseIso(weekStart);
    d.setDate(d.getDate() + 6);
    return isoLocal(d);
  }
  function dateBr(s) {
    var p = String(s || "").slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—";
  }
  function dateTimeBr(s) {
    var d = new Date(s);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
  }
  function sum(list, field) {
    return list.reduce(function (total, item) { return total + num(item[field]); }, 0);
  }
  function pct(done, expected) {
    if (!expected) return done > 0 ? 100 : 0;
    return Math.min(100, (done / expected) * 100);
  }
  function pctText(value) { return (Math.round(value * 10) / 10).toString().replace(".", ",") + "%"; }
  function options(category, selected) {
    var values = window.Padroes ? window.Padroes.options(category) : [];
    var html = '<option value="">Selecione…</option>';
    values.forEach(function (value) {
      html += '<option value="' + attr(value) + '"' + (value === selected ? " selected" : "") + ">" + esc(value) + "</option>";
    });
    return html;
  }
  function empty(message) {
    return '<div class="report-empty">' + esc(message) + "</div>";
  }
  function message(fiscal, text, error) {
    var card = root.querySelector('[data-fiscal-key="' + key(fiscal) + '"]');
    var el = card ? card.querySelector(".report-fiscal-msg") : null;
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!error);
  }

  function fiscalCard(fiscal) {
    var fiscalKey = key(fiscal);
    var week = state[fiscal].week;
    var editablePlans = canManagePlans();
    return (
      '<article class="report-fiscal" data-fiscal="' + attr(fiscal) + '" data-fiscal-key="' + fiscalKey + '">' +
        '<header class="report-fiscal__head">' +
          '<div><span class="report-fiscal__eyebrow">Fiscal</span><h2>' + esc(fiscal) + "</h2></div>" +
          '<label class="report-week">Semana<input class="report-week-input" type="week" value="' + mondayToWeekValue(week) + '" aria-label="Semana de ' + attr(fiscal) + '"></label>' +
        "</header>" +
        '<div class="report-fiscal-msg form-msg" role="status" aria-live="polite"></div>' +
        '<section class="report-planning">' +
          '<div class="report-section-head"><div><h3>Roteiro e expectativa da semana</h3><p>Onde o fiscal estará e o volume previsto para inspeção e entrega.</p></div>' +
          (editablePlans ? '<button class="btn btn--ghost btn--sm report-toggle-plan" type="button">Adicionar destino</button>' : '<span class="report-readonly-badge">Somente leitura</span>') + '</div>' +
          (editablePlans ? '<form class="report-plan-form" hidden>' +
            '<div class="report-form-grid report-form-grid--plan">' +
              '<div class="field"><label>Fornecedor</label><select name="fornecedor" required>' + options("fornecedor") + "</select></div>" +
              '<div class="field"><label>Local</label><select name="local" required>' + options("local") + "</select></div>" +
              '<div class="field"><label>Pedido</label><select name="pedido">' + options("pedido") + '</select><small class="pedido-auto-hint">Preenchimento automático ao selecionar.</small></div>' +
              '<div class="field"><label>Expectativa a inspecionar</label><input name="expectativa_inspecionado" type="number" min="0" step="any" required></div>' +
              '<div class="field"><label>Expectativa a entregar</label><input name="expectativa_entregue" type="number" min="0" step="any" required></div>' +
              '<div class="field field--wide"><label>Observações</label><input name="observacoes" type="text" maxlength="500" placeholder="Orientações ou contexto da semana"></div>' +
            "</div>" +
            '<div class="form-foot"><button class="btn btn--primary btn--sm" type="submit">Salvar destino</button><button class="btn btn--ghost btn--sm report-cancel-plan" type="button">Cancelar</button></div>' +
          "</form>" : "") +
          '<div class="report-plan-list"></div>' +
        "</section>" +
        '<section class="report-order-progress">' +
          '<div class="report-section-head"><div><h3>Progresso total dos pedidos</h3><p>Acumulado de todas as semanas, comparado ao total cadastrado para cada pedido.</p></div><span class="report-total-badge">Todas as semanas</span></div>' +
          '<div class="report-order-summary"></div>' +
          '<div class="report-order-layout">' +
            '<div class="report-order-chart"><canvas id="report-order-chart-' + fiscalKey + '"></canvas></div>' +
            '<div class="report-order-list"></div>' +
          "</div>" +
        "</section>" +
        '<section class="report-dashboard">' +
          '<div class="report-section-head"><div><h3>Evolução da semana</h3><p>Realizado comparado à expectativa cadastrada.</p></div></div>' +
          '<div class="report-kpis"></div>' +
          '<div class="report-dashboard-grid">' +
            '<div class="report-chart"><canvas id="report-chart-' + fiscalKey + '"></canvas></div>' +
            '<div class="report-progress"></div>' +
          "</div>" +
        "</section>" +
        '<section class="report-activities">' +
          '<div class="report-section-head"><div><h3>Atividades diárias</h3><p>Os lançamentos permanecem aqui depois de enviados para Registros.</p></div>' +
          '<button class="btn btn--success btn--sm report-toggle-entry" type="button">Novo lançamento</button></div>' +
          '<form class="report-entry-form" hidden>' +
            '<div class="report-form-grid">' +
              '<div class="field"><label>Data</label><input name="data_ref" type="date" min="' + week + '" max="' + weekEnd(week) + '" required></div>' +
              '<div class="field"><label>Fiscal</label><input value="' + attr(fiscal) + '" disabled></div>' +
              '<div class="field"><label>Fornecedor</label><select name="fornecedor" required>' + options("fornecedor") + "</select></div>" +
              '<div class="field"><label>Local</label><select name="local" required>' + options("local") + "</select></div>" +
              '<div class="field"><label>Pedido</label><select name="pedido" required>' + options("pedido") + '</select><small class="pedido-auto-hint">Preenchimento automático ao selecionar.</small></div>' +
              numberField("vol_pedido", "Volume do Pedido") +
              numberField("vol_fabricar", "Volume a ser Fabricado") +
              numberField("vol_pronto", "Volume Fabricado") +
              numberField("vol_pronto_insp", "Volume pronto a ser Inspecionado") +
              numberField("vol_inspecionado", "Volume Inspecionado") +
              numberField("vol_liberado", "Volume em Estoque p/ Entrega") +
              numberField("vol_transportado", "Volume Transportado") +
            "</div>" +
            '<div class="form-foot"><button class="btn btn--success" type="submit">Salvar no report</button><button class="btn btn--ghost report-cancel-entry" type="button">Cancelar</button></div>' +
          "</form>" +
          '<div class="report-table"></div>' +
        "</section>" +
      "</article>"
    );
  }

  function numberField(name, label) {
    return '<div class="field"><label>' + label + '</label><input name="' + name + '" type="number" min="0" step="any" value="0" required></div>';
  }

  function applyPedidoDetails(form) {
    if (!form || !window.Padroes) return;
    var details = window.Padroes.pedido(form.elements.pedido.value);
    var hint = form.querySelector(".pedido-auto-hint");
    if (!details) {
      form.elements.fornecedor.value = "";
      form.elements.local.value = "";
      if (form.elements.vol_pedido) form.elements.vol_pedido.value = 0;
      if (hint) {
        hint.textContent = form.elements.pedido.value ? "Detalhes pendentes na Padronização." : "Preenchimento automático ao selecionar.";
        hint.classList.remove("is-filled");
      }
      return;
    }
    form.elements.fornecedor.value = details.fornecedor;
    form.elements.local.value = details.local;
    if (form.elements.vol_pedido) form.elements.vol_pedido.value = details.quantidade;
    if (hint) {
      hint.textContent = details.fornecedor + " · " + details.local + " · " + fmt.format(details.quantidade) + " dormentes";
      hint.classList.add("is-filled");
    }
  }

  function renderShell() {
    var fiscals = getFiscals();
    if (!fiscals.length) {
      root.innerHTML = empty("Cadastre pelo menos um fiscal em Padronização.");
      return;
    }
    var currentMonday = isoLocal(mondayOf(new Date()));
    fiscals.forEach(function (fiscal) {
      if (!state[fiscal]) state[fiscal] = { week: currentMonday, plans: [], entries: [], orderEntries: [] };
    });
    root.innerHTML = fiscals.map(fiscalCard).join("");
  }

  function getFiscals() {
    var profile = window.currentProfile || {};
    if (window.AccessControl && window.AccessControl.isFiscal(profile.role)) {
      return profile.fiscal ? [profile.fiscal] : [];
    }
    var values = window.Padroes ? window.Padroes.options("fiscal") : [];
    if (!values.length) values = ["Walter", "Ivan Souza"];
    return values.slice().sort(function (a, b) {
      var preferred = { "Walter": 0, "Ivan Souza": 1 };
      var ai = preferred[a] !== undefined ? preferred[a] : 99;
      var bi = preferred[b] !== undefined ? preferred[b] : 99;
      return ai === bi ? a.localeCompare(b, "pt-BR") : ai - bi;
    });
  }

  function historyEl(id) { return document.getElementById(id); }

  function historyMessage(text, error) {
    var el = historyEl("report-history-msg");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!error);
  }

  function historySupplierOptions() {
    var selected = historyState.supplier;
    var standardValues = window.Padroes ? window.Padroes.options("fornecedor") : [];
    var values = standardValues.concat(historyState.suppliers);
    var unique = [];
    values.forEach(function (value) {
      value = String(value || "").trim();
      if (value && unique.indexOf(value) === -1) unique.push(value);
    });
    unique.sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
    var select = historyEl("report-history-supplier");
    if (!select) return;
    select.innerHTML = '<option value="">Todos os fornecedores</option>' + unique.map(function (value) {
      return '<option value="' + attr(value) + '"' + (value === selected ? " selected" : "") + ">" + esc(value) + "</option>";
    }).join("");
  }

  function historyQuery(from, to) {
    var query = sb().from("report_semanal_registros")
      .select("id, semana_inicio, data_ref, fiscal, fornecedor, local, pedido, vol_pedido, vol_fabricar, vol_pronto, vol_pronto_insp, vol_inspecionado, vol_liberado, vol_transportado, registro_id, enviado_em, created_at");
    if (historyState.start) query = query.gte("data_ref", historyState.start);
    if (historyState.end) query = query.lte("data_ref", historyState.end);
    if (historyState.supplier) query = query.eq("fornecedor", historyState.supplier);
    return query.order("data_ref", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
  }

  function fetchHistoryPage(from, collected) {
    return historyQuery(from, from + HISTORY_PAGE_SIZE - 1).then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      var all = collected.concat(rows);
      if (rows.length === HISTORY_PAGE_SIZE) return fetchHistoryPage(from + HISTORY_PAGE_SIZE, all);
      return all;
    });
  }

  function drawHistorySummary() {
    var target = historyEl("report-history-summary");
    if (!target) return;
    var entries = historyState.entries;
    target.innerHTML =
      '<div class="report-history-kpi"><span>Lançamentos encontrados</span><strong>' + fmt.format(entries.length) + "</strong></div>" +
      '<div class="report-history-kpi"><span>Volume inspecionado</span><strong>' + fmt.format(sum(entries, "vol_inspecionado")) + "</strong></div>" +
      '<div class="report-history-kpi"><span>Estoque para entrega</span><strong>' + fmt.format(sum(entries, "vol_liberado")) + "</strong></div>" +
      '<div class="report-history-kpi"><span>Volume transportado</span><strong>' + fmt.format(sum(entries, "vol_transportado")) + "</strong></div>";
  }

  function drawHistoryTable() {
    var target = historyEl("report-history-table");
    if (!target) return;
    var entries = historyState.entries;
    if (!entries.length) {
      target.innerHTML = empty("Nenhum lançamento encontrado para os filtros informados.");
      return;
    }
    var heads = ["Data", "Semana", "Fiscal", "Fornecedor", "Local", "Pedido", "Vol. pedido", "A fabricar", "Fabricado", "Pronto p/ inspeção", "Inspecionado", "Estoque p/ entrega", "Transportado", "Situação"];
    var body = entries.map(function (r) {
      return "<tr>" +
        "<td>" + dateBr(r.data_ref) + "</td>" +
        "<td>" + dateBr(r.semana_inicio) + "</td>" +
        "<td>" + esc(r.fiscal) + "</td>" +
        "<td>" + esc(r.fornecedor) + "</td>" +
        "<td>" + esc(r.local) + "</td>" +
        '<td class="cell-pedido">' + esc(r.pedido) + "</td>" +
        ["vol_pedido", "vol_fabricar", "vol_pronto", "vol_pronto_insp", "vol_inspecionado", "vol_liberado", "vol_transportado"].map(function (field) {
          return "<td>" + fmt.format(num(r[field])) + "</td>";
        }).join("") +
        '<td class="report-send-cell">' + (r.registro_id
          ? '<span class="report-sent" title="Enviado em ' + attr(dateTimeBr(r.enviado_em)) + '">Enviado</span>'
          : '<span class="report-pending">No report</span>') + "</td></tr>";
    }).join("");
    target.innerHTML = '<div class="table-wrap"><table class="tabela report-history-table__table"><thead><tr>' + heads.map(function (head) {
      return "<th>" + head + "</th>";
    }).join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function loadHistory() {
    if (!canViewHistory()) return Promise.resolve();
    var target = historyEl("report-history-table");
    if (!target) return Promise.resolve();
    target.innerHTML = empty("Carregando histórico…");
    historyMessage("", false);
    return fetchHistoryPage(0, []).then(function (entries) {
      historyState.entries = entries;
      entries.forEach(function (entry) {
        if (entry.fornecedor && historyState.suppliers.indexOf(entry.fornecedor) === -1) historyState.suppliers.push(entry.fornecedor);
      });
      historySupplierOptions();
      drawHistorySummary();
      drawHistoryTable();
      var filterText = [];
      if (historyState.start) filterText.push("a partir de " + dateBr(historyState.start));
      if (historyState.end) filterText.push("até " + dateBr(historyState.end));
      if (historyState.supplier) filterText.push("fornecedor " + historyState.supplier);
      historyMessage(entries.length + (entries.length === 1 ? " lançamento exibido" : " lançamentos exibidos") + (filterText.length ? " · " + filterText.join(" · ") : " · todas as semanas"), false);
    }).catch(function (err) {
      historyState.entries = [];
      drawHistorySummary();
      target.innerHTML = empty("Não foi possível carregar o histórico.");
      historyMessage("Erro ao consultar: " + (err.message || err), true);
    });
  }

  function applyHistoryFilters(form) {
    var start = form.elements.start.value;
    var end = form.elements.end.value;
    if (start && end && start > end) {
      historyMessage("A data inicial não pode ser posterior à data final.", true);
      return Promise.resolve();
    }
    historyState.start = start;
    historyState.end = end;
    historyState.supplier = form.elements.supplier.value;
    return loadHistory();
  }

  function clearHistoryFilters(form) {
    form.reset();
    historyState.start = "";
    historyState.end = "";
    historyState.supplier = "";
    historySupplierOptions();
    return loadHistory();
  }

  function orderProgressQuery(fiscal, from, to) {
    return sb().from("report_semanal_registros")
      .select("pedido, vol_pronto, vol_inspecionado, vol_transportado, created_at")
      .eq("fiscal", fiscal)
      .not("pedido", "is", null)
      .neq("pedido", "")
      .order("created_at", { ascending: true })
      .range(from, to);
  }

  function fetchOrderProgress(fiscal, from, collected) {
    return orderProgressQuery(fiscal, from, from + ORDER_PROGRESS_PAGE_SIZE - 1).then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      var all = collected.concat(rows);
      if (rows.length === ORDER_PROGRESS_PAGE_SIZE) return fetchOrderProgress(fiscal, from + ORDER_PROGRESS_PAGE_SIZE, all);
      return all;
    });
  }

  function loadFiscal(fiscal) {
    var week = state[fiscal].week;
    var plans = sb().from("report_semanal_planejamentos")
      .select("id, semana_inicio, fiscal, fornecedor, local, pedido, pedido_id, expectativa_inspecionado, expectativa_entregue, observacoes, created_at, updated_at")
      .eq("fiscal", fiscal).eq("semana_inicio", week).order("created_at", { ascending: true });
    var entries = sb().from("report_semanal_registros")
      .select("id, semana_inicio, data_ref, fiscal, fornecedor, local, pedido, pedido_id, vol_pedido, vol_fabricar, vol_pronto, vol_pronto_insp, vol_inspecionado, vol_liberado, vol_transportado, registro_id, enviado_em, created_at, updated_at")
      .eq("fiscal", fiscal).eq("semana_inicio", week).order("data_ref", { ascending: true }).order("created_at", { ascending: true });
    return Promise.all([plans, entries, fetchOrderProgress(fiscal, 0, [])]).then(function (results) {
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;
      state[fiscal].plans = results[0].data || [];
      state[fiscal].entries = results[1].data || [];
      state[fiscal].orderEntries = results[2] || [];
      drawFiscal(fiscal);
    }).catch(function (err) {
      message(fiscal, "Não foi possível carregar: " + (err.message || err) + ". Execute supabase/report-semanal.sql.", true);
    });
  }

  function drawFiscal(fiscal) {
    var card = root.querySelector('[data-fiscal-key="' + key(fiscal) + '"]');
    if (!card) return;
    drawPlans(card, fiscal);
    drawOrderProgress(card, fiscal);
    drawDashboard(card, fiscal);
    drawTable(card, fiscal);
  }

  function drawPlans(card, fiscal) {
    var plans = state[fiscal].plans;
    var editablePlans = canManagePlans();
    var target = card.querySelector(".report-plan-list");
    if (!plans.length) {
      target.innerHTML = empty("Nenhum destino e nenhuma expectativa cadastrados para esta semana.");
      return;
    }
    target.innerHTML = '<div class="report-destinations">' + plans.map(function (p) {
      return (
        '<article class="report-destination">' +
          '<div class="report-destination__route"><strong>' + esc(p.fornecedor) + '</strong><span>' + esc(p.local) + (p.pedido ? " · Pedido " + esc(p.pedido) : "") + "</span></div>" +
          '<div><small>Inspecionar</small><strong>' + fmt.format(num(p.expectativa_inspecionado)) + "</strong></div>" +
          '<div><small>Entregar</small><strong>' + fmt.format(num(p.expectativa_entregue)) + "</strong></div>" +
          (p.observacoes ? '<p class="report-destination__note">' + esc(p.observacoes) + "</p>" : "") +
          (editablePlans ? '<button class="report-plan-delete" data-id="' + p.id + '" type="button" aria-label="Excluir destino">×</button>' : "") +
        "</article>"
      );
    }).join("") + "</div>";
  }

  function pedidoStandard(numero) {
    if (!window.Padroes || !window.Padroes.pedidos) return null;
    var items = window.Padroes.pedidos("", false);
    return items.filter(function (item) { return String(item.numero) === String(numero); })[0] || null;
  }

  function groupedOrders(fiscal) {
    var map = {};
    (state[fiscal].orderEntries || []).forEach(function (entry) {
      var numero = String(entry.pedido || "").trim();
      if (!numero) return;
      if (!map[numero]) map[numero] = { pedido: numero, fabricated: 0, inspected: 0, transported: 0 };
      map[numero].fabricated += num(entry.vol_pronto);
      map[numero].inspected += num(entry.vol_inspecionado);
      map[numero].transported += num(entry.vol_transportado);
    });
    return Object.keys(map).sort(function (a, b) { return a.localeCompare(b, "pt-BR", { numeric: true }); }).map(function (numero) {
      var group = map[numero];
      var standard = pedidoStandard(numero);
      group.fornecedor = standard && standard.fornecedor ? standard.fornecedor : "";
      group.local = standard && standard.local ? standard.local : "";
      group.total = standard && num(standard.quantidade) > 0 ? num(standard.quantidade) : null;
      group.remainingInspection = group.total === null ? null : Math.max(group.total - group.inspected, 0);
      group.excessInspection = group.total === null ? 0 : Math.max(group.inspected - group.total, 0);
      return group;
    });
  }

  function drawOrderProgress(card, fiscal) {
    var groups = groupedOrders(fiscal);
    var summary = card.querySelector(".report-order-summary");
    var list = card.querySelector(".report-order-list");
    var complete = groups.filter(function (group) { return group.total !== null; });
    var missing = groups.length - complete.length;
    var totalRegistered = complete.reduce(function (total, group) { return total + group.total; }, 0);
    var totalFabricated = groups.reduce(function (total, group) { return total + group.fabricated; }, 0);
    var totalInspected = groups.reduce(function (total, group) { return total + group.inspected; }, 0);
    var totalRemaining = complete.reduce(function (total, group) { return total + group.remainingInspection; }, 0);

    summary.innerHTML =
      kpi("Pedidos acompanhados", fmt.format(groups.length), "Com lançamentos no Report Semanal", null, "") +
      kpi("Total cadastrado", fmt.format(totalRegistered), complete.length + (complete.length === 1 ? " pedido completo" : " pedidos completos"), null, "") +
      kpi("Fabricado acumulado", fmt.format(totalFabricated), "Somado em todas as semanas", null, "") +
      kpi("Inspecionado acumulado", fmt.format(totalInspected), missing ? "Inclui " + missing + (missing === 1 ? " pedido sem total cadastrado" : " pedidos sem total cadastrado") : "Somado em todas as semanas", null, "") +
      kpi("Falta inspecionar", fmt.format(totalRemaining), "Saldo dos pedidos com total cadastrado", null, "");

    if (!groups.length) {
      list.innerHTML = empty("Nenhum pedido foi registrado por este fiscal até o momento.");
      drawOrderChart(fiscal, []);
      return;
    }
    list.innerHTML = (missing ? '<div class="report-order-warning">' + missing + (missing === 1 ? " pedido precisa" : " pedidos precisam") + " da quantidade total na Padronização.</div>" : "") +
      groups.map(orderProgressCard).join("");
    drawOrderChart(fiscal, groups);
  }

  function orderProgressCard(group) {
    var route = group.fornecedor || group.local
      ? [group.fornecedor, group.local].filter(Boolean).join(" · ")
      : "Fornecedor e local pendentes na Padronização";
    var total = group.total === null ? "—" : fmt.format(group.total);
    var remaining = group.remainingInspection === null ? "—" : fmt.format(group.remainingInspection);
    var fiscalization = group.total === null
      ? '<div class="report-order-unavailable">Cadastre a quantidade total do pedido para calcular o percentual e o saldo restante.</div>'
      : progressBar("Fiscalização do pedido", group.inspected, group.total);
    var excess = group.excessInspection > 0
      ? '<div class="report-order-excess">O volume inspecionado supera o total cadastrado em ' + fmt.format(group.excessInspection) + ".</div>"
      : "";
    return '<article class="report-order-card">' +
      '<header><div><span>Pedido</span><strong>' + esc(group.pedido) + '</strong></div><small>' + esc(route) + "</small></header>" +
      '<div class="report-order-metrics">' +
        orderMetric("Total do pedido", total) +
        orderMetric("Fabricado", fmt.format(group.fabricated)) +
        orderMetric("Inspecionado", fmt.format(group.inspected)) +
        orderMetric("Falta inspecionar", remaining) +
        orderMetric("Transportado", fmt.format(group.transported)) +
      "</div>" + fiscalization + excess + "</article>";
  }

  function orderMetric(label, value) {
    return '<div><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function drawOrderChart(fiscal, groups) {
    var canvas = document.getElementById("report-order-chart-" + key(fiscal));
    if (!canvas || !window.Chart) return;
    if (orderCharts[fiscal]) orderCharts[fiscal].destroy();
    if (!groups.length) {
      canvas.parentElement.hidden = true;
      orderCharts[fiscal] = null;
      return;
    }
    canvas.parentElement.hidden = false;
    canvas.parentElement.style.height = Math.max(280, groups.length * 66 + 110) + "px";
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    orderCharts[fiscal] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: groups.map(function (group) { return "Pedido " + group.pedido; }),
        datasets: [
          { label: "Total do pedido", data: groups.map(function (group) { return group.total || 0; }), backgroundColor: dark ? "rgba(164,184,198,.45)" : "rgba(111,131,142,.38)", borderRadius: 4 },
          { label: "Fabricado", data: groups.map(function (group) { return group.fabricated; }), backgroundColor: "rgba(50,166,230,.78)", borderRadius: 4 },
          { label: "Inspecionado", data: groups.map(function (group) { return group.inspected; }), backgroundColor: "rgba(30,159,127,.82)", borderRadius: 4 },
          { label: "Transportado", data: groups.map(function (group) { return group.transported; }), backgroundColor: "rgba(242,142,43,.82)", borderRadius: 4 }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { color: dark ? "#dbe8f1" : "#4D626F", boxWidth: 12, usePointStyle: true } },
          datalabels: { display: false },
          tooltip: { callbacks: { label: function (context) { return context.dataset.label + ": " + fmt.format(num(context.raw)); } } }
        },
        scales: {
          x: { beginAtZero: true, ticks: { color: dark ? "#a4b8c6" : "#6F838E" }, grid: { color: dark ? "rgba(255,255,255,.07)" : "rgba(0,56,101,.08)" } },
          y: { ticks: { color: dark ? "#dbe8f1" : "#4D626F" }, grid: { display: false } }
        }
      }
    });
  }

  function grouped(fiscal) {
    var map = {};
    state[fiscal].plans.forEach(function (p) {
      var k = p.fornecedor || "—";
      if (!map[k]) map[k] = { fornecedor: k, expectedInspection: 0, expectedDelivery: 0, inspection: 0, delivery: 0 };
      map[k].expectedInspection += num(p.expectativa_inspecionado);
      map[k].expectedDelivery += num(p.expectativa_entregue);
    });
    state[fiscal].entries.forEach(function (r) {
      var k = r.fornecedor || "—";
      if (!map[k]) map[k] = { fornecedor: k, expectedInspection: 0, expectedDelivery: 0, inspection: 0, delivery: 0 };
      map[k].inspection += num(r.vol_inspecionado);
      map[k].delivery += num(r.vol_transportado);
    });
    return Object.keys(map).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }).map(function (k) { return map[k]; });
  }

  function drawDashboard(card, fiscal) {
    var plans = state[fiscal].plans;
    var entries = state[fiscal].entries;
    var expInspection = sum(plans, "expectativa_inspecionado");
    var expDelivery = sum(plans, "expectativa_entregue");
    var inspection = sum(entries, "vol_inspecionado");
    var delivery = sum(entries, "vol_transportado");
    var pendingInspection = Math.max(expInspection - inspection, 0);
    var pendingDelivery = Math.max(expDelivery - delivery, 0);
    card.querySelector(".report-kpis").innerHTML =
      kpi("Fiscalização concluída", pctText(pct(inspection, expInspection)), fmt.format(inspection) + " de " + fmt.format(expInspection), pendingInspection, "a inspecionar") +
      kpi("Entrega concluída", pctText(pct(delivery, expDelivery)), fmt.format(delivery) + " de " + fmt.format(expDelivery), pendingDelivery, "a entregar") +
      kpi("Produção na semana", fmt.format(sum(entries, "vol_pronto")), entries.length + (entries.length === 1 ? " lançamento" : " lançamentos"), null, "") +
      kpi("Em estoque p/ entrega", fmt.format(sum(entries, "vol_liberado")), "Acumulado nos lançamentos", null, "");

    var groups = grouped(fiscal);
    var progress = card.querySelector(".report-progress");
    progress.innerHTML = groups.length ? groups.map(progressRow).join("") : empty("Cadastre o roteiro e os lançamentos para acompanhar por fornecedor.");
    drawChart(fiscal);
  }

  function kpi(label, value, detail, pending, pendingLabel) {
    return '<div class="report-kpi"><span>' + label + "</span><strong>" + value + "</strong><small>" + detail + "</small>" +
      (pending !== null ? '<em>' + fmt.format(pending) + " " + pendingLabel + "</em>" : "") + "</div>";
  }

  function progressRow(g) {
    return '<article class="report-progress-row"><h4>' + esc(g.fornecedor) + "</h4>" +
      progressBar("Inspeção", g.inspection, g.expectedInspection) +
      progressBar("Entrega", g.delivery, g.expectedDelivery) +
      "</article>";
  }

  function progressBar(label, done, expected) {
    var value = pct(done, expected);
    var pending = Math.max(expected - done, 0);
    return '<div class="report-bar"><div><span>' + label + '</span><strong>' + pctText(value) + ' · faltam ' + fmt.format(pending) + "</strong></div>" +
      '<div class="report-bar__track"><i style="width:' + value + '%"></i></div><small>' + fmt.format(done) + " de " + fmt.format(expected) + "</small></div>";
  }

  function drawChart(fiscal) {
    var canvas = document.getElementById("report-chart-" + key(fiscal));
    if (!canvas || !window.Chart) return;
    if (charts[fiscal]) charts[fiscal].destroy();
    var week = state[fiscal].week;
    var start = parseIso(week);
    var labels = [], inspection = [], delivery = [];
    var inspAcc = 0, deliveryAcc = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var iso = isoLocal(d);
      state[fiscal].entries.filter(function (r) { return r.data_ref === iso; }).forEach(function (r) {
        inspAcc += num(r.vol_inspecionado);
        deliveryAcc += num(r.vol_transportado);
      });
      labels.push(DAYS[d.getDay()] + " " + String(d.getDate()).padStart(2, "0"));
      inspection.push(inspAcc); delivery.push(deliveryAcc);
    }
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    charts[fiscal] = new Chart(canvas, {
      type: "line",
      data: { labels: labels, datasets: [
        { label: "Inspecionado acumulado", data: inspection, borderColor: "#32A6E6", backgroundColor: "rgba(50,166,230,.12)", fill: true, tension: 0.28 },
        { label: "Transportado acumulado", data: delivery, borderColor: "#1E9F7F", backgroundColor: "rgba(30,159,127,.10)", fill: true, tension: 0.28 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { color: dark ? "#dbe8f1" : "#4D626F", boxWidth: 12, usePointStyle: true } }, datalabels: { display: false } },
        scales: { x: { ticks: { color: dark ? "#a4b8c6" : "#6F838E" }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: dark ? "#a4b8c6" : "#6F838E" }, grid: { color: dark ? "rgba(255,255,255,.07)" : "rgba(0,56,101,.08)" } } }
      }
    });
  }

  function drawTable(card, fiscal) {
    var entries = state[fiscal].entries;
    var canSend = canSendEntries();
    var canDelete = canDeleteEntries();
    var target = card.querySelector(".report-table");
    if (!entries.length) { target.innerHTML = empty("Nenhuma atividade registrada nesta semana."); return; }
    var heads = ["Data", "Fiscal", "Fornecedor", "Local", "Pedido", "Vol. pedido", "A fabricar", "Fabricado", "Pronto p/ inspeção", "Inspecionado", "Estoque p/ entrega", "Transportado", "Registros", "Ações"];
    var body = entries.map(function (r) {
      var sent = !!r.registro_id;
      return "<tr>" +
        "<td>" + dateBr(r.data_ref) + "</td><td>" + esc(r.fiscal) + "</td><td>" + esc(r.fornecedor) + "</td><td>" + esc(r.local) + "</td><td class=\"cell-pedido\">" + esc(r.pedido) + "</td>" +
        ["vol_pedido", "vol_fabricar", "vol_pronto", "vol_pronto_insp", "vol_inspecionado", "vol_liberado", "vol_transportado"].map(function (field) { return "<td>" + fmt.format(num(r[field])) + "</td>"; }).join("") +
        '<td class="report-send-cell">' + (sent
          ? '<span class="report-sent" title="Enviado em ' + attr(dateTimeBr(r.enviado_em)) + '">Enviado</span>'
          : canSend
            ? '<button class="btn btn--primary btn--sm report-send" data-id="' + r.id + '" type="button">Enviar</button>'
            : '<span class="report-pending">Pendente</span>') + "</td>" +
        '<td class="report-action-cell">' + (canDelete
          ? '<button class="btn btn--danger btn--sm report-entry-delete" data-id="' + r.id + '" data-sent="' + (sent ? "true" : "false") + '" type="button">Excluir</button>'
          : "—") + "</td></tr>";
    }).join("");
    target.innerHTML = '<div class="table-wrap"><table class="tabela report-table__table"><thead><tr>' + heads.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function savePlan(fiscal, form) {
    var row = {
      semana_inicio: state[fiscal].week,
      fiscal: fiscal,
      fornecedor: form.elements.fornecedor.value,
      local: form.elements.local.value,
      pedido: form.elements.pedido.value || null,
      expectativa_inspecionado: num(form.elements.expectativa_inspecionado.value),
      expectativa_entregue: num(form.elements.expectativa_entregue.value),
      observacoes: form.elements.observacoes.value.trim() || null
    };
    return sb().from("report_semanal_planejamentos").insert(row).then(function (res) {
      if (res.error) throw res.error;
      form.reset(); form.hidden = true;
      return loadFiscal(fiscal);
    });
  }

  function saveEntry(fiscal, form) {
    var row = { semana_inicio: state[fiscal].week, fiscal: fiscal };
    ["data_ref", "fornecedor", "local", "pedido"].forEach(function (field) { row[field] = form.elements[field].value; });
    ["vol_pedido", "vol_fabricar", "vol_pronto", "vol_pronto_insp", "vol_inspecionado", "vol_liberado", "vol_transportado"].forEach(function (field) { row[field] = num(form.elements[field].value); });
    return sb().from("report_semanal_registros").insert(row).then(function (res) {
      if (res.error) throw res.error;
      form.reset(); form.hidden = true;
      return Promise.all([loadFiscal(fiscal), loadHistory()]);
    });
  }

  function deletePlan(fiscal, id) {
    var current = state[fiscal].plans.filter(function (item) { return item.id === id; })[0];
    if (!current) return Promise.reject(new Error("Destino desatualizado. Recarregue a página."));
    return sb().from("report_semanal_planejamentos").delete().eq("id", id)
      .eq("updated_at", current.updated_at).select("id").then(function (res) {
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) throw new Error("Este destino foi alterado por outro usuário e não foi excluído.");
      return loadFiscal(fiscal);
    });
  }

  function deleteEntry(fiscal, id) {
    if (!canDeleteEntries()) return Promise.reject(new Error("Seu perfil não possui permissão para excluir lançamentos."));
    var current = state[fiscal].entries.filter(function (item) { return item.id === id; })[0];
    if (!current) return Promise.reject(new Error("Lançamento desatualizado. Recarregue a página."));
    return sb().from("report_semanal_registros").delete().eq("id", id)
      .eq("updated_at", current.updated_at).select("id").then(function (res) {
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) throw new Error("O lançamento não foi encontrado ou seu perfil não possui permissão para excluí-lo.");
      return Promise.all([loadFiscal(fiscal), loadHistory()]);
    }).then(function () {
      message(fiscal, "Lançamento excluído do Report Semanal.", false);
    });
  }

  function sendEntry(fiscal, id, button) {
    if (!canSendEntries()) return Promise.reject(new Error("Seu perfil não possui permissão para enviar lançamentos a Registros."));
    button.disabled = true; button.textContent = "Enviando…";
    return sb().rpc("enviar_report_semanal_para_registros", { p_report_id: id }).then(function (res) {
      if (res.error) throw res.error;
      return Promise.all([loadFiscal(fiscal), loadHistory(), window.Store ? Store.refresh() : Promise.resolve()]);
    }).then(function () {
      message(fiscal, "Lançamento enviado para Registros. O histórico semanal foi preservado.", false);
    }).catch(function (err) {
      button.disabled = false; button.textContent = "Enviar";
      throw err;
    });
  }

  function wire() {
    if (wired || !root) return;
    var historyForm = historyEl("report-history-filters");
    var historyClear = historyEl("report-history-clear");
    if (historyForm) historyForm.addEventListener("submit", function (e) {
      e.preventDefault();
      applyHistoryFilters(historyForm);
    });
    if (historyClear && historyForm) historyClear.addEventListener("click", function () {
      clearHistoryFilters(historyForm);
    });
    root.addEventListener("change", function (e) {
      if (e.target.matches('.report-plan-form select[name="pedido"], .report-entry-form select[name="pedido"]')) {
        applyPedidoDetails(e.target.closest("form"));
        return;
      }
      if (!e.target.matches(".report-week-input")) return;
      var card = e.target.closest(".report-fiscal");
      var fiscal = card.getAttribute("data-fiscal");
      state[fiscal].week = weekValueToMonday(e.target.value);
      renderShell();
      loadFiscal(fiscal);
      getFiscals().filter(function (f) { return f !== fiscal; }).forEach(drawFiscal);
    });
    root.addEventListener("click", function (e) {
      var card = e.target.closest(".report-fiscal");
      if (!card) return;
      var fiscal = card.getAttribute("data-fiscal");
      if (canManagePlans() && e.target.closest(".report-toggle-plan")) card.querySelector(".report-plan-form").hidden = false;
      if (canManagePlans() && e.target.closest(".report-cancel-plan")) card.querySelector(".report-plan-form").hidden = true;
      if (e.target.closest(".report-toggle-entry")) {
        var form = card.querySelector(".report-entry-form");
        form.hidden = false;
        form.elements.data_ref.value = state[fiscal].week;
      }
      if (e.target.closest(".report-cancel-entry")) card.querySelector(".report-entry-form").hidden = true;
      var del = e.target.closest(".report-plan-delete");
      if (canManagePlans() && del && window.confirm("Excluir este destino e suas expectativas da semana?")) {
        deletePlan(fiscal, del.getAttribute("data-id")).catch(function (err) { message(fiscal, "Erro ao excluir: " + (err.message || err), true); });
      }
      var send = e.target.closest(".report-send");
      if (canSendEntries() && send) sendEntry(fiscal, send.getAttribute("data-id"), send).catch(function (err) { message(fiscal, "Erro ao enviar: " + (err.message || err), true); });
      var entryDelete = e.target.closest(".report-entry-delete");
      if (canDeleteEntries() && entryDelete) {
        var sentNotice = entryDelete.getAttribute("data-sent") === "true"
          ? " Este lançamento já foi enviado: o registro oficial na página Registros será preservado."
          : "";
        if (window.confirm("Excluir este lançamento do Report Semanal?" + sentNotice)) {
          entryDelete.disabled = true;
          deleteEntry(fiscal, entryDelete.getAttribute("data-id")).catch(function (err) {
            entryDelete.disabled = false;
            message(fiscal, "Erro ao excluir lançamento: " + (err.message || err), true);
          });
        }
      }
    });
    root.addEventListener("submit", function (e) {
      var card = e.target.closest(".report-fiscal");
      if (!card) return;
      var fiscal = card.getAttribute("data-fiscal");
      if (e.target.matches(".report-plan-form")) {
        e.preventDefault();
        if (!canManagePlans()) return;
        savePlan(fiscal, e.target).catch(function (err) { message(fiscal, "Erro ao salvar destino: " + (err.message || err), true); });
      }
      if (e.target.matches(".report-entry-form")) {
        e.preventDefault();
        saveEntry(fiscal, e.target).catch(function (err) { message(fiscal, "Erro ao salvar lançamento: " + (err.message || err), true); });
      }
    });
    wired = true;
  }

  function render() {
    root = root || document.getElementById("report-fiscais");
    if (!root) return;
    if (!sb()) { root.innerHTML = empty("Sem conexão com o servidor."); return; }
    var standards = window.Padroes ? window.Padroes.load() : Promise.resolve();
    standards.then(function () {
      renderShell(); wire();
      var loads = getFiscals().map(loadFiscal);
      if (canViewHistory()) {
        historySupplierOptions();
        loads.push(loadHistory());
      }
      return Promise.all(loads);
    }).catch(function (err) {
      root.innerHTML = empty("Não foi possível abrir o Report Semanal: " + (err.message || err));
    });
  }

  window.ReportSemanalUI = { render: render };
})();
