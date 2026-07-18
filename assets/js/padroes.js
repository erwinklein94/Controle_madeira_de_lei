/* =====================================================================
   PADRONIZAÇÃO — listas de opções e cadastro estruturado dos pedidos.
   ===================================================================== */
(function () {
  "use strict";

  var CATEGORIAS = [
    { key: "fiscal", titulo: "Fiscais", singular: "fiscal" },
    { key: "fornecedor", titulo: "Fornecedores", singular: "fornecedor" },
    { key: "local", titulo: "Locais", singular: "local" }
  ];

  function sb() { return window.sbClient; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function attr(s) { return esc(s); }
  function canManage() {
    return !!(window.AccessControl && window.AccessControl.isFull(window.currentProfile && window.currentProfile.role));
  }
  function isCompletePedido(item) {
    return !!(item && item.fornecedor && item.local && Number(item.quantidade_dormentes) > 0);
  }

  var cache = { fiscal: [], fornecedor: [], local: [], pedido: [] };

  function load() {
    if (!sb()) return Promise.resolve(cache);
    return sb().from("padroes")
      .select("id, categoria, valor, fornecedor, local, quantidade_dormentes, created_at, updated_at")
      .order("valor")
      .then(function (res) {
        if (res.error) throw res.error;
        var novo = { fiscal: [], fornecedor: [], local: [], pedido: [] };
        (res.data || []).forEach(function (row) {
          if (novo[row.categoria]) novo[row.categoria].push(row);
        });
        cache = novo;
        return cache;
      });
  }

  function options(categoria) {
    return (cache[categoria] || []).map(function (item) { return item.valor; });
  }

  function pedidoDetails(numero) {
    var item = (cache.pedido || []).filter(function (row) { return String(row.valor) === String(numero || ""); })[0];
    return isCompletePedido(item) ? {
      id: item.id,
      numero: item.valor,
      fornecedor: item.fornecedor,
      local: item.local,
      quantidade: Number(item.quantidade_dormentes)
    } : null;
  }

  function pedidos(fornecedor, onlyComplete) {
    return (cache.pedido || []).filter(function (item) {
      if (fornecedor && item.fornecedor !== fornecedor) return false;
      return !onlyComplete || isCompletePedido(item);
    }).map(function (item) {
      return {
        id: item.id,
        numero: item.valor,
        fornecedor: item.fornecedor,
        local: item.local,
        quantidade: item.quantidade_dormentes == null ? null : Number(item.quantidade_dormentes),
        completo: isCompletePedido(item)
      };
    });
  }

  function fill(sel, categoria, current) {
    if (!sel) return;
    var atual = current !== undefined ? current : sel.value;
    var items = cache[categoria] || [];
    sel.innerHTML = '<option value="">Selecione…</option>';
    items.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.valor;
      option.textContent = item.valor + (categoria === "pedido" && !isCompletePedido(item) ? " — detalhes pendentes" : "");
      sel.appendChild(option);
    });
    var values = items.map(function (item) { return item.valor; });
    if (atual && values.indexOf(atual) < 0) {
      var extra = document.createElement("option");
      extra.value = atual;
      extra.textContent = atual + " (fora do padrão)";
      sel.appendChild(extra);
    }
    if (atual) sel.value = atual;
  }

  function fillPedidos(sel, current, fornecedor, onlyComplete) {
    if (!sel) return;
    var atual = current !== undefined ? current : sel.value;
    var items = pedidos(fornecedor, !!onlyComplete);
    sel.innerHTML = '<option value="">Selecione…</option>';
    items.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.numero;
      option.textContent = item.numero + (item.completo ? "" : " — detalhes pendentes");
      sel.appendChild(option);
    });
    if (atual && items.some(function (item) { return item.numero === atual; })) sel.value = atual;
  }

  function add(categoria, valor) {
    return sb().from("padroes").insert({ categoria: categoria, valor: valor }).then(function (res) {
      if (res.error) throw res.error;
    });
  }
  function remove(id) {
    return sb().from("padroes").delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
    });
  }
  function savePedido(id, data) {
    var query = id
      ? sb().from("padroes").update(data).eq("id", id)
      : sb().from("padroes").insert(Object.assign({ categoria: "pedido" }, data));
    return query.then(function (res) { if (res.error) throw res.error; });
  }

  window.Padroes = {
    load: load,
    options: options,
    fill: fill,
    fillPedidos: fillPedidos,
    pedido: pedidoDetails,
    pedidos: pedidos
  };

  var PadronizacaoUI = (function () {
    var root, wired = false, editingPedidoId = null;
    var numberFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

    function grab() { root = document.getElementById("padroes-cards"); }
    function manageError(err) {
      return /duplicate|unique/i.test(String(err && err.message))
        ? "Esse valor já está cadastrado."
        : "Erro: " + ((err && err.message) || err);
    }

    function cardHtml(cat) {
      var items = cache[cat.key] || [];
      var editable = canManage();
      var chips = items.length ? items.map(function (item) {
        return '<span class="padrao-chip">' + esc(item.valor) + (editable
          ? '<button class="padrao-del" data-id="' + item.id + '" type="button" aria-label="Remover ' + attr(item.valor) + '">✕</button>'
          : "") + "</span>";
      }).join("") : '<p class="card__hint">Nenhuma opção cadastrada.</p>';
      return '<section class="card">' +
        '<div class="card__head"><h2 class="card__title">' + cat.titulo + "</h2>" +
        '<p class="card__hint">' + items.length + (items.length === 1 ? " opção." : " opções.") + "</p></div>" +
        '<div class="card__body"><div class="padrao-list">' + chips + "</div>" +
        (editable ? '<form class="padrao-form" data-cat="' + cat.key + '">' +
          '<input type="text" placeholder="Novo ' + cat.singular + '…" aria-label="Novo ' + cat.singular + '" />' +
          '<button class="btn btn--primary btn--sm" type="submit">Adicionar</button>' +
          '<span class="form-msg" role="status" aria-live="polite"></span></form>' : "") +
        "</div></section>";
    }

    function selectOptions(category, selected) {
      return '<option value="">Selecione…</option>' + (cache[category] || []).map(function (item) {
        return '<option value="' + attr(item.valor) + '"' + (item.valor === selected ? " selected" : "") + ">" + esc(item.valor) + "</option>";
      }).join("");
    }

    function pedidoCardHtml() {
      var items = cache.pedido || [];
      var editable = canManage();
      var editing = items.filter(function (item) { return item.id === editingPedidoId; })[0] || null;
      var form = editable ? '<form class="pedido-detalhe-form" data-id="' + (editing ? editing.id : "") + '">' +
        '<div class="pedido-detalhe-grid">' +
          '<div class="field"><label>Número do pedido</label><input name="numero" type="text" inputmode="numeric" value="' + attr(editing ? editing.valor : "") + '" required></div>' +
          '<div class="field"><label>Fornecedor</label><select name="fornecedor" required>' + selectOptions("fornecedor", editing && editing.fornecedor) + "</select></div>" +
          '<div class="field"><label>Local</label><select name="local" required>' + selectOptions("local", editing && editing.local) + "</select></div>" +
          '<div class="field"><label>Quantidade de dormentes</label><input name="quantidade" type="number" min="1" step="1" value="' + attr(editing && editing.quantidade_dormentes != null ? editing.quantidade_dormentes : "") + '" required></div>' +
        "</div>" +
        '<div class="form-foot"><button class="btn btn--primary" type="submit">' + (editing ? "Salvar alterações" : "Cadastrar pedido") + "</button>" +
        (editing ? '<button class="btn btn--ghost pedido-cancel" type="button">Cancelar</button>' : "") +
        '<span class="form-msg" role="status" aria-live="polite"></span></div></form>' : "";

      var rows = items.length ? items.map(function (item) {
        var complete = isCompletePedido(item);
        return "<tr>" +
          '<td class="cell-pedido"><strong>' + esc(item.valor) + "</strong></td>" +
          "<td>" + esc(item.fornecedor || "—") + "</td>" +
          "<td>" + esc(item.local || "—") + "</td>" +
          "<td>" + (item.quantidade_dormentes == null ? "—" : numberFmt.format(Number(item.quantidade_dormentes))) + "</td>" +
          '<td><span class="pedido-status ' + (complete ? "pedido-status--ok" : "pedido-status--pending") + '">' + (complete ? "Completo" : "Detalhes pendentes") + "</span></td>" +
          (editable ? '<td><div class="row-actions"><button class="row-edit pedido-edit" data-id="' + item.id + '" type="button">Editar</button>' +
            '<button class="row-del pedido-del" data-id="' + item.id + '" type="button" aria-label="Excluir pedido ' + attr(item.valor) + '">✕</button></div></td>' : "") +
          "</tr>";
      }).join("") : '<tr><td colspan="' + (editable ? "6" : "5") + '"><p class="card__hint">Nenhum pedido cadastrado.</p></td></tr>';

      return '<section class="card pedido-cadastro-card">' +
        '<div class="card__head pedido-cadastro-head"><div><div class="page-head__eyebrow">Integração automática</div>' +
        '<h2 class="card__title">Detalhes dos pedidos</h2><p class="card__hint">Fornecedor, local e quantidade serão preenchidos automaticamente ao selecionar o pedido nos formulários.</p></div>' +
        '<span class="pedido-count">' + items.length + (items.length === 1 ? " pedido" : " pedidos") + "</span></div>" +
        '<div class="card__body">' + form + '<div class="table-wrap pedido-detalhe-table"><table class="tabela tabela--slim"><thead><tr>' +
        "<th>Pedido</th><th>Fornecedor</th><th>Local</th><th>Quantidade de dormentes</th><th>Situação</th>" + (editable ? "<th>Ações</th>" : "") +
        "</tr></thead><tbody>" + rows + "</tbody></table></div></div></section>";
    }

    function draw() {
      if (!root) return;
      root.innerHTML = pedidoCardHtml() + '<div class="padroes-grid padroes-grid--listas">' + CATEGORIAS.map(cardHtml).join("") + "</div>";
    }
    function render() {
      if (!root) grab();
      if (!root) return;
      if (!sb()) { root.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>'; return; }
      load().then(draw).catch(function (err) {
        root.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(err.message || err) + "). Execute supabase/pedidos-detalhes.sql.</p>";
      });
    }

    function wire() {
      if (wired) return;
      grab();
      if (!root) return;
      root.addEventListener("submit", function (event) {
        var genericForm = event.target.closest(".padrao-form");
        var pedidoForm = event.target.closest(".pedido-detalhe-form");
        if (!genericForm && !pedidoForm) return;
        event.preventDefault();
        if (!canManage()) return;
        if (genericForm) {
          var input = genericForm.querySelector("input");
          var genericMsg = genericForm.querySelector(".form-msg");
          var value = input.value.trim();
          if (!value) return;
          add(genericForm.getAttribute("data-cat"), value).then(render).catch(function (err) {
            genericMsg.textContent = manageError(err);
            genericMsg.className = "form-msg is-error";
          });
          return;
        }
        var msg = pedidoForm.querySelector(".form-msg");
        var numero = pedidoForm.elements.numero.value.trim();
        var quantidade = Number(pedidoForm.elements.quantidade.value);
        if (!numero || !pedidoForm.elements.fornecedor.value || !pedidoForm.elements.local.value || !Number.isInteger(quantidade) || quantidade <= 0) {
          msg.textContent = "Informe pedido, fornecedor, local e uma quantidade inteira maior que zero.";
          msg.className = "form-msg is-error";
          return;
        }
        var button = pedidoForm.querySelector('button[type="submit"]');
        button.disabled = true;
        savePedido(pedidoForm.getAttribute("data-id") || null, {
          valor: numero,
          fornecedor: pedidoForm.elements.fornecedor.value,
          local: pedidoForm.elements.local.value,
          quantidade_dormentes: quantidade
        }).then(function () {
          editingPedidoId = null;
          render();
        }).catch(function (err) {
          button.disabled = false;
          msg.textContent = manageError(err);
          msg.className = "form-msg is-error";
        });
      });

      root.addEventListener("click", function (event) {
        var genericDelete = event.target.closest(".padrao-del");
        var pedidoEdit = event.target.closest(".pedido-edit");
        var pedidoDelete = event.target.closest(".pedido-del");
        var pedidoCancel = event.target.closest(".pedido-cancel");
        if (!canManage()) return;
        if (pedidoCancel) { editingPedidoId = null; draw(); return; }
        if (pedidoEdit) { editingPedidoId = pedidoEdit.getAttribute("data-id"); draw(); return; }
        if (genericDelete || pedidoDelete) {
          var button = pedidoDelete || genericDelete;
          var question = pedidoDelete
            ? "Excluir este pedido da padronização? Os registros históricos não serão alterados."
            : "Remover esta opção da padronização? Os registros já criados não mudam.";
          if (!window.confirm(question)) return;
          remove(button.getAttribute("data-id")).then(function () {
            if (pedidoDelete) editingPedidoId = null;
            render();
          }).catch(function (err) { window.alert("Erro ao remover: " + (err.message || err)); });
        }
      });
      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  window.PadronizacaoUI = PadronizacaoUI;
})();
