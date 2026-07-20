/* =====================================================================
   REPORT DOS FISCAIS - unico ponto de entrada de dados do site.
   Cada fiscal lanca as informacoes dos pedidos e ve seu historico
   completo. Os fiscais vem da categoria "fiscal" em Padronizacao.
   ===================================================================== */
(function () {
  "use strict";

  var root;
  var wired = false;
  var state = {};
  var historyState = { start: "", end: "", supplier: "", entries: [], suppliers: [] };
  var HISTORY_PAGE_SIZE = 1000;
  var ENTRIES_PAGE_SIZE = 1000;
  var fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  function sb() { return window.sbClient; }
  function canCreateOrders() {
    var role = window.currentProfile && window.currentProfile.role;
    return !!(window.AccessControl && (window.AccessControl.isFull(role) || window.AccessControl.isFiscal(role)));
  }
  function canSendEntries() {
    return !!(window.AccessControl && window.AccessControl.isFull(window.currentProfile && window.currentProfile.role));
  }
  function canDeleteEntries() {
    var role = window.currentProfile && window.currentProfile.role;
    return !!(window.AccessControl && (window.AccessControl.isFull(role) || window.AccessControl.isFiscal(role)));
  }
  function canViewHistory() { return canSendEntries(); }
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
  function options(category, selected) {
    var values = window.Padroes ? window.Padroes.options(category) : [];
    var html = '<option value="">Selecione…</option>';
    values.forEach(function (value) {
      html += '<option value="' + attr(value) + '"' + (value === selected ? " selected" : "") + ">" + esc(value) + "</option>";
    });
    return html;
  }
  function orderOptions(selected) {
    var items = window.Padroes && window.Padroes.pedidos ? window.Padroes.pedidos("", true) : [];
    var html = '<option value="">Selecione um pedido…</option>';
    items.forEach(function (item) {
      html += '<option value="' + attr(item.numero) + '"' + (item.numero === selected ? " selected" : "") + ">Pedido " + esc(item.numero) + " · " + esc(item.fornecedor) + "</option>";
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
    var canAddOrder = canCreateOrders();
    return (
      '<article class="report-fiscal" data-fiscal="' + attr(fiscal) + '" data-fiscal-key="' + fiscalKey + '">' +
        '<header class="report-fiscal__head">' +
          '<div><span class="report-fiscal__eyebrow">Fiscal</span><h2>' + esc(fiscal) + "</h2></div>" +
        "</header>" +
        '<div class="report-fiscal-msg form-msg" role="status" aria-live="polite"></div>' +
        '<section class="report-activities">' +
          '<div class="report-section-head"><div><h3>Lançamentos</h3><p>Registre as informações trazidas das visitas. Todo o seu histórico fica na tabela abaixo.</p></div>' +
          '<div class="report-section-actions">' +
            (canAddOrder ? '<button class="btn btn--ghost btn--sm report-toggle-order" type="button">Cadastrar novo pedido</button>' : "") +
            '<button class="btn btn--success btn--sm report-toggle-entry" type="button">Novo lançamento</button>' +
          "</div></div>" +
          (canAddOrder ? '<form class="report-new-order-form" hidden>' +
            '<div class="report-new-order-intro"><span>Pedido novo</span><div><strong>Cadastre uma vez e use em todo o site.</strong><p>Informe os quatro dados abaixo. O pedido entrará automaticamente na Padronização e ficará selecionado no novo lançamento.</p></div></div>' +
            '<div class="report-form-grid report-form-grid--order">' +
              '<div class="field"><label>Número do pedido</label><input name="numero" type="text" inputmode="numeric" autocomplete="off" placeholder="Ex.: 4500123456" required><small>Use o número oficial, sem abreviações.</small></div>' +
              '<div class="field"><label>Fornecedor</label><select name="fornecedor" required>' + options("fornecedor") + "</select></div>" +
              '<div class="field"><label>Local</label><select name="local" required>' + options("local") + "</select></div>" +
              '<div class="field"><label>Quantidade total de dormentes</label><input name="quantidade" type="number" min="1" step="1" required><small>Quantidade total contratada no pedido.</small></div>' +
            "</div>" +
            '<div class="form-foot"><button class="btn btn--primary" type="submit">Cadastrar e usar no lançamento</button><button class="btn btn--ghost report-cancel-order" type="button">Cancelar</button><span class="form-msg" role="status" aria-live="polite"></span></div>' +
          "</form>" : "") +
          '<form class="report-entry-form" hidden>' +
            '<div class="report-form-grid">' +
              '<div class="field"><label>Data</label><input name="data_ref" type="date" required></div>' +
              '<div class="field"><label>Fiscal</label><input value="' + attr(fiscal) + '" disabled></div>' +
              '<div class="field field--wide"><label>Pedido padronizado</label><select name="pedido" required>' + orderOptions() + '</select><small class="pedido-auto-hint">Selecione o pedido para preencher os dados automaticamente.</small></div>' +
              '<div class="field field--autofill"><label>Fornecedor</label><input name="fornecedor" readonly required></div>' +
              '<div class="field field--autofill"><label>Local</label><input name="local" readonly required></div>' +
              '<div class="field field--autofill"><label>Volume do Pedido</label><input name="vol_pedido" type="number" readonly required></div>' +
              numberField("vol_fabricar", "Volume a ser Fabricado") +
              numberField("vol_pronto", "Volume Fabricado") +
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
    fiscals.forEach(function (fiscal) {
      if (!state[fiscal]) state[fiscal] = { entries: [] };
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
      .select("id, semana_inicio, data_ref, fiscal, fornecedor, local, pedido, vol_pedido, vol_fabricar, vol_pronto, vol_inspecionado, vol_liberado, vol_transportado, registro_id, enviado_em, created_at");
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
    var heads = ["Data", "Semana", "Fiscal", "Fornecedor", "Local", "Pedido", "Vol. pedido", "A fabricar", "Fabricado", "Inspecionado", "Estoque p/ entrega", "Transportado", "Situação"];
    var body = entries.map(function (r) {
      return "<tr>" +
        "<td>" + dateBr(r.data_ref) + "</td>" +
        "<td>" + dateBr(r.semana_inicio) + "</td>" +
        "<td>" + esc(r.fiscal) + "</td>" +
        "<td>" + esc(r.fornecedor) + "</td>" +
        "<td>" + esc(r.local) + "</td>" +
        '<td class="cell-pedido">' + esc(r.pedido) + "</td>" +
        ["vol_pedido", "vol_fabricar", "vol_pronto", "vol_inspecionado", "vol_liberado", "vol_transportado"].map(function (field) {
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

  /* Histórico completo do fiscal (todas as semanas), paginado. */
  function entriesQuery(fiscal, from, to) {
    return sb().from("report_semanal_registros")
      .select("id, semana_inicio, data_ref, fiscal, fornecedor, local, pedido, pedido_id, vol_pedido, vol_fabricar, vol_pronto, vol_inspecionado, vol_liberado, vol_transportado, registro_id, enviado_em, created_at, updated_at")
      .eq("fiscal", fiscal)
      .order("data_ref", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
  }

  function fetchEntries(fiscal, from, collected) {
    return entriesQuery(fiscal, from, from + ENTRIES_PAGE_SIZE - 1).then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      var all = collected.concat(rows);
      if (rows.length === ENTRIES_PAGE_SIZE) return fetchEntries(fiscal, from + ENTRIES_PAGE_SIZE, all);
      return all;
    });
  }

  function loadFiscal(fiscal) {
    return fetchEntries(fiscal, 0, []).then(function (entries) {
      state[fiscal].entries = entries;
      drawFiscal(fiscal);
    }).catch(function (err) {
      message(fiscal, "Não foi possível carregar os lançamentos: " + (err.message || err) + ".", true);
    });
  }

  function drawFiscal(fiscal) {
    var card = root.querySelector('[data-fiscal-key="' + key(fiscal) + '"]');
    if (!card) return;
    drawTable(card, fiscal);
  }

  function drawTable(card, fiscal) {
    var entries = state[fiscal].entries;
    var canSend = canSendEntries();
    var canDelete = canDeleteEntries();
    var target = card.querySelector(".report-table");
    if (!entries.length) { target.innerHTML = empty("Nenhuma atividade registrada nesta semana."); return; }
    var heads = ["Data", "Fiscal", "Fornecedor", "Local", "Pedido", "Vol. pedido", "A fabricar", "Fabricado", "Inspecionado", "Estoque p/ entrega", "Transportado", "Registros", "Ações"];
    var body = entries.map(function (r) {
      var sent = !!r.registro_id;
      return "<tr>" +
        "<td>" + dateBr(r.data_ref) + "</td><td>" + esc(r.fiscal) + "</td><td>" + esc(r.fornecedor) + "</td><td>" + esc(r.local) + "</td><td class=\"cell-pedido\">" + esc(r.pedido) + "</td>" +
        ["vol_pedido", "vol_fabricar", "vol_pronto", "vol_inspecionado", "vol_liberado", "vol_transportado"].map(function (field) { return "<td>" + fmt.format(num(r[field])) + "</td>"; }).join("") +
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

  function orderError(err) {
    var text = String((err && err.message) || err || "");
    if (/duplicate|unique|pedidos_numero_key/i.test(text)) return "Esse número de pedido já está cadastrado. Selecione-o na lista de lançamentos.";
    if (/row-level security|policy/i.test(text)) return "Seu perfil não possui permissão para cadastrar este pedido ou os dados não pertencem à Padronização.";
    return "Não foi possível cadastrar o pedido: " + text;
  }

  function selectCreatedOrder(fiscal, numero) {
    renderShell();
    getFiscals().forEach(drawFiscal);
    var card = root.querySelector('[data-fiscal-key="' + key(fiscal) + '"]');
    if (!card) return;
    var entryForm = card.querySelector(".report-entry-form");
    entryForm.hidden = false;
    entryForm.elements.data_ref.value = isoLocal(new Date());
    entryForm.elements.pedido.value = numero;
    applyPedidoDetails(entryForm);
    entryForm.elements.vol_fabricar.focus();
  }

  function createOrder(fiscal, form) {
    if (!canCreateOrders() || !window.Padroes || !window.Padroes.criarPedido) {
      return Promise.reject(new Error("Cadastro de pedidos indisponível para este perfil."));
    }
    var numero = form.elements.numero.value.trim();
    var quantidade = Number(form.elements.quantidade.value);
    var msg = form.querySelector(".form-msg");
    if (!numero || !form.elements.fornecedor.value || !form.elements.local.value || !Number.isInteger(quantidade) || quantidade <= 0) {
      msg.textContent = "Preencha o número, fornecedor, local e uma quantidade inteira maior que zero.";
      msg.className = "form-msg is-error";
      return Promise.resolve();
    }
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Cadastrando…";
    msg.textContent = "";
    msg.className = "form-msg";
    return window.Padroes.criarPedido({
      numero: numero,
      fornecedor: form.elements.fornecedor.value,
      local: form.elements.local.value,
      quantidade_dormentes: quantidade
    }).then(function (created) {
      form.reset();
      form.hidden = true;
      selectCreatedOrder(fiscal, created.numero);
      message(fiscal, "Pedido " + created.numero + " cadastrado e selecionado. Complete agora os volumes do lançamento.", false);
    }).catch(function (err) {
      button.disabled = false;
      button.textContent = "Cadastrar e usar no lançamento";
      msg.textContent = orderError(err);
      msg.className = "form-msg is-error";
    });
  }

  function saveEntry(fiscal, form) {
    var dataRef = form.elements.data_ref.value;
    var dia = parseIso(dataRef);
    if (isNaN(dia.getTime())) return Promise.reject(new Error("Informe a data do lançamento."));
    // A semana é derivada da data informada (segunda-feira correspondente).
    var row = { semana_inicio: isoLocal(mondayOf(dia)), fiscal: fiscal };
    ["data_ref", "fornecedor", "local", "pedido"].forEach(function (field) { row[field] = form.elements[field].value; });
    ["vol_pedido", "vol_fabricar", "vol_pronto", "vol_inspecionado", "vol_liberado", "vol_transportado"].forEach(function (field) { row[field] = num(form.elements[field].value); });
    return sb().from("report_semanal_registros").insert(row).then(function (res) {
      if (res.error) throw res.error;
      form.reset(); form.hidden = true;
      return Promise.all([loadFiscal(fiscal), loadHistory()]);
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
      message(fiscal, "Lançamento excluído do Report dos fiscais.", false);
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
      if (e.target.matches('.report-entry-form select[name="pedido"]')) {
        applyPedidoDetails(e.target.closest("form"));
      }
    });
    root.addEventListener("click", function (e) {
      var card = e.target.closest(".report-fiscal");
      if (!card) return;
      var fiscal = card.getAttribute("data-fiscal");
      if (canCreateOrders() && e.target.closest(".report-toggle-order")) {
        card.querySelector(".report-entry-form").hidden = true;
        card.querySelector(".report-new-order-form").hidden = false;
        card.querySelector('.report-new-order-form input[name="numero"]').focus();
      }
      if (canCreateOrders() && e.target.closest(".report-cancel-order")) card.querySelector(".report-new-order-form").hidden = true;
      if (e.target.closest(".report-toggle-entry")) {
        var form = card.querySelector(".report-entry-form");
        var orderForm = card.querySelector(".report-new-order-form");
        if (orderForm) orderForm.hidden = true;
        form.hidden = false;
        if (!form.elements.data_ref.value) form.elements.data_ref.value = isoLocal(new Date());
      }
      if (e.target.closest(".report-cancel-entry")) card.querySelector(".report-entry-form").hidden = true;
      var send = e.target.closest(".report-send");
      if (canSendEntries() && send) sendEntry(fiscal, send.getAttribute("data-id"), send).catch(function (err) { message(fiscal, "Erro ao enviar: " + (err.message || err), true); });
      var entryDelete = e.target.closest(".report-entry-delete");
      if (canDeleteEntries() && entryDelete) {
        var sentNotice = entryDelete.getAttribute("data-sent") === "true"
          ? " Este lançamento já foi enviado: o registro oficial na página Registros será preservado."
          : "";
        if (window.confirm("Excluir este lançamento do Report dos fiscais?" + sentNotice)) {
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
      if (e.target.matches(".report-new-order-form")) {
        e.preventDefault();
        createOrder(fiscal, e.target);
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
      root.innerHTML = empty("Não foi possível abrir o Report dos fiscais: " + (err.message || err));
    });
  }

  window.ReportSemanalUI = { render: render };
})();
