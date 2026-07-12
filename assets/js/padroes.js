/* =====================================================================
   PADRONIZAÇÃO — listas de opções (tabela padroes no Supabase) que
   alimentam os formulários do admin, evitando erros de digitação.
   window.Padroes: dados/preenchimento de selects.
   window.PadronizacaoUI: página de gerenciamento (admin).
   ===================================================================== */
(function () {
  "use strict";

  var CATEGORIAS = [
    { key: "fiscal", titulo: "Fiscais", singular: "fiscal" },
    { key: "fornecedor", titulo: "Fornecedores", singular: "fornecedor" },
    { key: "local", titulo: "Locais", singular: "local" },
    { key: "pedido", titulo: "Pedidos", singular: "pedido" }
  ];

  function sb() { return window.sbClient; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- dados ---------- */
  var cache = { fiscal: [], fornecedor: [], local: [], pedido: [] };

  function load() {
    if (!sb()) return Promise.resolve(cache);
    return sb().from("padroes").select("id, categoria, valor").order("valor").then(function (res) {
      if (res.error) throw res.error;
      var novo = { fiscal: [], fornecedor: [], local: [], pedido: [] };
      (res.data || []).forEach(function (r) {
        if (novo[r.categoria]) novo[r.categoria].push({ id: r.id, valor: r.valor });
      });
      cache = novo;
      return cache;
    });
  }

  function options(categoria) {
    return (cache[categoria] || []).map(function (o) { return o.valor; });
  }

  /* Preenche um <select> com as opções da categoria, preservando (ou
     incluindo) o valor atual mesmo que ele não esteja padronizado. */
  function fill(sel, categoria, current) {
    if (!sel) return;
    var atual = current !== undefined ? current : sel.value;
    var vals = options(categoria);
    sel.innerHTML = '<option value="">Selecione…</option>';
    vals.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    if (atual && vals.indexOf(atual) < 0) {
      var extra = document.createElement("option");
      extra.value = atual; extra.textContent = atual + " (fora do padrão)";
      sel.appendChild(extra);
    }
    if (atual) sel.value = atual;
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

  window.Padroes = { load: load, options: options, fill: fill };

  /* ---------- página Padronização (admin) ---------- */
  var PadronizacaoUI = (function () {
    var root, wired = false;

    function grab() { root = document.getElementById("padroes-cards"); }

    function cardHtml(cat) {
      var itens = cache[cat.key] || [];
      var chips = itens.length
        ? itens.map(function (o) {
            return '<span class="padrao-chip">' + esc(o.valor) +
              '<button class="padrao-del" data-id="' + o.id + '" type="button" aria-label="Remover ' + esc(o.valor) + '">✕</button></span>';
          }).join("")
        : '<p class="card__hint">Nenhuma opção cadastrada.</p>';
      return (
        '<section class="card">' +
          '<div class="card__head"><h2 class="card__title">' + cat.titulo + "</h2>" +
          '<p class="card__hint">' + itens.length + (itens.length === 1 ? " opção." : " opções.") + "</p></div>" +
          '<div class="card__body">' +
            '<div class="padrao-list">' + chips + "</div>" +
            '<form class="padrao-form" data-cat="' + cat.key + '">' +
              '<input type="text" placeholder="Novo ' + cat.singular + '…" aria-label="Novo ' + cat.singular + '" />' +
              '<button class="btn btn--primary btn--sm" type="submit">Adicionar</button>' +
              '<span class="form-msg" role="status" aria-live="polite"></span>' +
            "</form>" +
          "</div>" +
        "</section>"
      );
    }

    function draw() {
      if (!root) return;
      root.innerHTML = CATEGORIAS.map(cardHtml).join("");
    }

    function render() {
      if (!root) grab();
      if (!root) return;
      if (!sb()) { root.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>'; return; }
      load().then(draw).catch(function (err) {
        root.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(err.message || err) + "). Confira se o SQL supabase/padroes.sql foi executado.</p>";
      });
    }

    function wire() {
      if (wired) return;
      grab();
      if (!root) return;

      root.addEventListener("submit", function (e) {
        var form = e.target.closest(".padrao-form");
        if (!form) return;
        e.preventDefault();
        var input = form.querySelector("input");
        var msg = form.querySelector(".form-msg");
        var valor = input.value.trim();
        if (!valor) return;
        add(form.getAttribute("data-cat"), valor).then(function () {
          render();
        }).catch(function (err) {
          msg.textContent = /duplicate|unique/i.test(String(err.message))
            ? "Essa opção já existe."
            : "Erro: " + (err.message || err);
          msg.className = "form-msg is-error";
        });
      });

      root.addEventListener("click", function (e) {
        var del = e.target.closest(".padrao-del");
        if (!del) return;
        if (!window.confirm("Remover esta opção da padronização? Os registros já criados com ela não mudam.")) return;
        remove(del.getAttribute("data-id")).then(render).catch(function (err) {
          window.alert("Erro ao remover: " + (err.message || err));
        });
      });

      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  window.PadronizacaoUI = PadronizacaoUI;
})();
