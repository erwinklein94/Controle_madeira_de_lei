/* =====================================================================
   HISTÓRICO DE ATUALIZAÇÕES
   Explica o que cada sincronização Excel/Power Automate entregou ao site.
   ===================================================================== */
(function (global) {
  "use strict";

  var root;
  var listEl;
  var countEl;
  var kpisEl;
  var wired = false;
  var dateTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short"
  });
  var timeOnly = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  });
  var number = new Intl.NumberFormat("pt-BR");

  var ACTIONS = {
    created: { label: "Novo registro", tone: "success" },
    updated: { label: "Registro alterado", tone: "info" },
    unchanged: { label: "Sem alteração", tone: "neutral" },
    skipped: { label: "Linha ignorada", tone: "warning" },
    error: { label: "Erro", tone: "danger" }
  };

  var DATA_FIELDS = [
    ["data_ref", "Data"],
    ["semana", "Semana"],
    ["fiscal", "Fiscal"],
    ["fornecedor", "Fornecedor"],
    ["local", "Local"],
    ["pedido", "Pedido"],
    ["vol_pedido", "Volume do pedido", true],
    ["vol_fabricar", "Volume a ser fabricado", true],
    ["vol_pronto", "Volume fabricado", true],
    ["vol_inspecionado", "Volume inspecionado", true],
    ["vol_liberado", "Volume em estoque para entrega", true],
    ["vol_transportado", "Volume transportado", true]
  ];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function date(value) {
    if (!value) return "—";
    var parsed = new Date(value);
    return isNaN(parsed.getTime()) ? "—" : dateTime.format(parsed);
  }

  function hour(value) {
    if (!value) return "—";
    var parsed = new Date(value);
    return isNaN(parsed.getTime()) ? "—" : timeOnly.format(parsed);
  }

  function valueText(value, numeric, label) {
    if (value === null || value === undefined || value === "") return "—";
    if (label === "Data" && /^\d{4}-\d{2}-\d{2}/.test(String(value))) {
      var parts = String(value).slice(0, 10).split("-");
      return parts[2] + "/" + parts[1] + "/" + parts[0];
    }
    return numeric ? number.format(num(value)) : String(value);
  }

  function actionMeta(action) {
    return ACTIONS[action] || { label: action || "Recebido", tone: "neutral" };
  }

  function changeDescription(item) {
    if (item.acao === "updated") {
      var changes = item.campos_alterados || {};
      var parts = Object.keys(changes).map(function (key) {
        var change = changes[key] || {};
        var numeric = key.indexOf("vol_") === 0 || key === "semana";
        return "<li><strong>" + esc(change.label || key) + ":</strong> " +
          esc(valueText(change.before, numeric, change.label)) +
          ' <span aria-hidden="true">→</span> ' +
          esc(valueText(change.after, numeric, change.label)) + "</li>";
      });
      return parts.length
        ? '<ul class="historico-mudancas">' + parts.join("") + "</ul>"
        : "Alteração recebida.";
    }

    if (item.acao === "created") {
      var facts = DATA_FIELDS.map(function (field) {
        var value = item.dados ? item.dados[field[0]] : null;
        if (value === null || value === undefined || value === "") return "";
        return "<li><strong>" + esc(field[1]) + ":</strong> " +
          esc(valueText(value, field[2], field[1])) + "</li>";
      }).filter(Boolean);
      return facts.length
        ? '<ul class="historico-mudancas">' + facts.join("") + "</ul>"
        : "Novo registro entregue ao site.";
    }

    if (item.acao === "unchanged") {
      return "A linha chegou novamente e confirmou que os dados do site já estavam iguais à planilha.";
    }
    return esc(item.mensagem || (item.acao === "skipped"
      ? "A linha não possuía fornecedor ou pedido e não entrou nos registros."
      : "Não foi possível entregar esta linha ao site."));
  }

  function itemRows(items) {
    if (!items.length) {
      return '<p class="card__hint">Nenhum detalhe foi registrado nesta atualização.</p>';
    }
    var rows = items.map(function (item) {
      var meta = actionMeta(item.acao);
      return "<tr>" +
        "<td>" + esc(hour(item.recebido_em)) + "</td>" +
        '<td><span class="historico-action historico-action--' + meta.tone + '">' +
          esc(meta.label) + "</span></td>" +
        '<td class="col-text">' + esc(item.excel_id || "—") + "</td>" +
        '<td class="col-text">' + esc(item.pedido || "—") + "</td>" +
        '<td class="col-text">' + esc(item.fornecedor || "—") + "</td>" +
        '<td class="col-text">' + esc(item.fiscal || "—") + "</td>" +
        '<td class="historico-detail-cell">' + changeDescription(item) + "</td>" +
      "</tr>";
    }).join("");
    return '<div class="table-wrap"><table class="tabela historico-table">' +
      "<thead><tr><th>Hora</th><th>Resultado</th><th>ID Excel</th><th>Pedido</th>" +
      "<th>Fornecedor</th><th>Fiscal</th><th>Informação entregue</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function batchSummary(batch) {
    var parts = [];
    if (batch.novos) parts.push(batch.novos + (batch.novos === 1 ? " novo registro" : " novos registros"));
    if (batch.alterados) parts.push(batch.alterados + (batch.alterados === 1 ? " alteração" : " alterações"));
    if (batch.sem_alteracao) parts.push(batch.sem_alteracao + " sem mudança");
    if (batch.ignorados) parts.push(batch.ignorados + (batch.ignorados === 1 ? " linha ignorada" : " linhas ignoradas"));
    if (batch.erros) parts.push(batch.erros + (batch.erros === 1 ? " erro" : " erros"));
    return parts.length ? parts.join(" · ") : "Nenhuma linha registrada";
  }

  function isReceiving(batch) {
    var last = new Date(batch.finalizada_em).getTime();
    return isFinite(last) && Date.now() - last < 5 * 60 * 1000;
  }

  function drawBatches(batches, itemsByBatch) {
    if (!batches.length) {
      countEl.textContent = "Nenhuma atualização registrada.";
      listEl.innerHTML =
        '<div class="historico-empty"><strong>O histórico começa a partir desta implantação.</strong>' +
        "<p>Aguarde a próxima execução automática do Power Automate. Assim que as linhas chegarem, esta página mostrará exatamente o que foi entregue.</p></div>";
      return;
    }

    countEl.textContent = "Mostrando as " + batches.length + " atualizações mais recentes.";
    listEl.innerHTML = batches.map(function (batch, index) {
      var receiving = isReceiving(batch);
      var statusClass = batch.erros ? "warning" : (receiving ? "receiving" : "success");
      var statusText = batch.erros
        ? "Concluída com erro"
        : (receiving ? "Recebendo dados" : "Concluída");
      var duration = date(batch.iniciada_em);
      if (hour(batch.iniciada_em) !== hour(batch.finalizada_em)) {
        duration += " até " + hour(batch.finalizada_em);
      }
      return '<details class="historico-batch historico-batch--' + statusClass + '"' +
        (index === 0 ? " open" : "") + ">" +
        '<summary class="historico-batch__summary">' +
          '<span class="historico-batch__marker" aria-hidden="true"></span>' +
          '<span class="historico-batch__title">' +
            "<strong>Atualização de " + esc(duration) + "</strong>" +
            "<small>" + esc(batchSummary(batch)) + "</small>" +
          "</span>" +
          '<span class="historico-batch__received">' + number.format(num(batch.recebidos)) +
            "<small>linhas recebidas</small></span>" +
          '<span class="historico-batch__status">' + esc(statusText) + "</span>" +
        "</summary>" +
        '<div class="historico-batch__body">' +
          '<div class="historico-batch__counts">' +
            '<span><strong>' + number.format(num(batch.novos)) + "</strong> novos</span>" +
            '<span><strong>' + number.format(num(batch.alterados)) + "</strong> alterados</span>" +
            '<span><strong>' + number.format(num(batch.sem_alteracao)) + "</strong> sem mudança</span>" +
            '<span><strong>' + number.format(num(batch.ignorados)) + "</strong> ignorados</span>" +
            '<span><strong>' + number.format(num(batch.erros)) + "</strong> erros</span>" +
          "</div>" +
          itemRows(itemsByBatch[batch.id] || []) +
        "</div>" +
      "</details>";
    }).join("");
  }

  function drawKpis(batches) {
    var batch = batches[0];
    if (!batch) {
      kpisEl.innerHTML =
        '<section class="kpi"><span class="kpi__label">Última atualização</span><strong class="kpi__value">—</strong></section>' +
        '<section class="kpi"><span class="kpi__label">Linhas recebidas</span><strong class="kpi__value">0</strong></section>' +
        '<section class="kpi"><span class="kpi__label">Novos registros</span><strong class="kpi__value">0</strong></section>' +
        '<section class="kpi"><span class="kpi__label">Registros alterados</span><strong class="kpi__value">0</strong></section>' +
        '<section class="kpi"><span class="kpi__label">Erros</span><strong class="kpi__value">0</strong></section>';
      return;
    }
    var values = [
      ["Última atualização", date(batch.finalizada_em), isReceiving(batch) ? "recebendo agora" : "sincronização concluída"],
      ["Linhas recebidas", number.format(num(batch.recebidos)), "na atualização mais recente"],
      ["Novos registros", number.format(num(batch.novos)), "incluídos no site"],
      ["Registros alterados", number.format(num(batch.alterados)), batch.sem_alteracao + " confirmados sem mudança"],
      ["Erros", number.format(num(batch.erros)), batch.erros ? "verifique os detalhes" : "nenhum erro na atualização"]
    ];
    kpisEl.innerHTML = values.map(function (item) {
      return '<section class="kpi"><span class="kpi__label">' + esc(item[0]) + "</span>" +
        '<strong class="kpi__value">' + esc(item[1]) + "</strong>" +
        '<small class="kpi__hint">' + esc(item[2]) + "</small></section>";
    }).join("");
  }

  function load() {
    if (!global.sbClient) return Promise.reject(new Error("Conexão com o banco indisponível."));
    return global.sbClient.from("integracao_atualizacoes")
      .select("id, chave_execucao, janela_inicio, iniciada_em, finalizada_em, recebidos, novos, alterados, sem_alteracao, ignorados, erros")
      .order("janela_inicio", { ascending: false })
      .limit(72)
      .then(function (result) {
        if (result.error) throw result.error;
        var batches = result.data || [];
        if (!batches.length) return { batches: [], items: [] };
        return global.sbClient.from("integracao_atualizacoes_itens")
          .select("id, atualizacao_id, recebido_em, excel_id, registro_id, pedido, fornecedor, fiscal, acao, campos_alterados, dados, mensagem")
          .in("atualizacao_id", batches.map(function (batch) { return batch.id; }))
          .order("recebido_em", { ascending: true })
          .then(function (itemsResult) {
            if (itemsResult.error) throw itemsResult.error;
            return { batches: batches, items: itemsResult.data || [] };
          });
      });
  }

  function render() {
    root = document.getElementById("view-historico-atualizacoes");
    listEl = document.getElementById("historico-lista");
    countEl = document.getElementById("historico-count");
    kpisEl = document.getElementById("historico-kpis");
    if (!root || !listEl || !countEl || !kpisEl) return;
    if (!wired) {
      var refresh = document.getElementById("historico-refresh");
      if (refresh) refresh.addEventListener("click", render);
      wired = true;
    }
    countEl.textContent = "Atualizando histórico…";
    listEl.innerHTML = '<p class="card__hint">Carregando atualizações…</p>';
    load().then(function (result) {
      var itemsByBatch = {};
      result.items.forEach(function (item) {
        if (!itemsByBatch[item.atualizacao_id]) itemsByBatch[item.atualizacao_id] = [];
        itemsByBatch[item.atualizacao_id].push(item);
      });
      drawKpis(result.batches);
      drawBatches(result.batches, itemsByBatch);
      if (global.PDFExport && global.PDFExport.sync) global.PDFExport.sync();
    }).catch(function (error) {
      console.error("Falha ao carregar histórico de atualizações:", error);
      countEl.textContent = "Não foi possível carregar o histórico.";
      listEl.innerHTML =
        '<div class="historico-empty historico-empty--error"><strong>Histórico temporariamente indisponível.</strong>' +
        "<p>Recarregue a página. Se o problema continuar, confirme se a atualização do banco foi publicada.</p></div>";
    });
  }

  global.HistoricoAtualizacoesUI = { render: render };
})(window);
