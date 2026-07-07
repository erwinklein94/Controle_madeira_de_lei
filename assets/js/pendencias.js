/* =====================================================================
   INFORMAÇÕES PENDENTES — fluxo fornecedor -> administrador (Supabase).
   O fornecedor envia (Pedido, Volume do pedido, Transportado) na página
   dele; o administrador vê tudo em "Informações pendentes". O RLS garante
   que o fornecedor só enxerga os próprios envios.
   ===================================================================== */
(function () {
  "use strict";

  var sb = window.sbClient;
  var fmt = new Intl.NumberFormat("pt-BR");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /* ---------- camada de dados (mesma query serve aos dois: RLS filtra) ---------- */
  var Data = {
    list: function () {
      return sb.from("pendencias")
        .select("id, fornecedor, pedido, vol_pedido, vol_transportado, created_at")
        .order("created_at", { ascending: false });
    },
    add: function (rec) { return sb.from("pendencias").insert(rec); },
    remove: function (id) { return sb.from("pendencias").delete().eq("id", id); }
  };

  function guardSb(el) {
    if (sb) return true;
    if (el) el.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>';
    return false;
  }

  /* ---------- UI do FORNECEDOR ---------- */
  var FornecedorUI = (function () {
    var form, msg, tabela, count, pedidoEl, volEl, transpEl, wired = false;

    function grab() {
      form = document.getElementById("forn-form");
      msg = document.getElementById("forn-msg");
      tabela = document.getElementById("forn-tabela");
      count = document.getElementById("forn-count");
      pedidoEl = document.getElementById("forn-pedido");
      volEl = document.getElementById("forn-volpedido");
      transpEl = document.getElementById("forn-transportado");
    }

    function showMsg(text, ok) {
      if (!msg) return;
      msg.textContent = text || "";
      msg.classList.toggle("is-ok", ok === true);
      msg.classList.toggle("is-error", ok === false);
    }

    function render() {
      if (!tabela) grab();
      if (!tabela || !guardSb(tabela)) return;
      Data.list().then(function (res) {
        if (res.error) {
          tabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + ").</p>";
          return;
        }
        var list = res.data || [];
        count.textContent = list.length ? (list.length === 1 ? "1 envio." : list.length + " envios.") : "Nenhum envio ainda.";
        if (!list.length) {
          tabela.innerHTML =
            '<div class="empty"><div class="empty__title">Nenhuma informação enviada</div>' +
            '<div class="empty__txt">Preencha o formulário acima e clique em Enviar.</div></div>';
          return;
        }
        var head = "<thead><tr>" +
          '<th class="col-text">Pedido</th><th>Volume do pedido</th><th>Transportado</th><th>Ações</th>' +
          "</tr></thead>";
        var rows = list.map(function (r) {
          return "<tr>" +
            '<td class="col-text cell-pedido">' + esc(r.pedido) + "</td>" +
            "<td>" + fmt.format(num(r.vol_pedido)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_transportado)) + "</td>" +
            '<td><div class="row-actions"><button class="row-del" data-id="' + r.id + '" type="button" aria-label="Excluir envio">✕</button></div></td>' +
            "</tr>";
        }).join("");
        tabela.innerHTML = '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
      });
    }

    function wire() {
      if (wired) return;
      grab();
      if (!form) return;

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var prof = window.currentProfile;
        if (!prof || !prof.fornecedor) { showMsg("Perfil de fornecedor incompleto. Fale com o administrador.", false); return; }
        var pedido = pedidoEl.value.trim();
        if (!pedido) { showMsg("Informe o pedido.", false); return; }

        var rec = {
          fornecedor: prof.fornecedor,
          pedido: pedido,
          vol_pedido: num(volEl.value),
          vol_transportado: num(transpEl.value)
        };
        var btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        Data.add(rec).then(function (res) {
          btn.disabled = false;
          if (res.error) { showMsg("Erro ao enviar: " + res.error.message, false); return; }
          form.reset();
          showMsg("Enviado!", true);
          render();
        });
      });

      tabela.addEventListener("click", function (e) {
        var del = e.target.closest(".row-del");
        if (!del) return;
        if (!window.confirm("Remover este envio?")) return;
        Data.remove(del.getAttribute("data-id")).then(function (res) {
          if (res.error) { showMsg("Erro ao remover: " + res.error.message, false); return; }
          render();
        });
      });

      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  /* ---------- UI do ADMIN: Informações pendentes ---------- */
  var PendentesUI = (function () {
    var tabela, count, refreshBtn, wired = false;

    function grab() {
      tabela = document.getElementById("pendentes-tabela");
      count = document.getElementById("pendentes-count");
      refreshBtn = document.getElementById("pendentes-refresh");
    }

    function render() {
      if (!tabela) grab();
      if (!tabela || !guardSb(tabela)) return;
      Data.list().then(function (res) {
        if (res.error) {
          tabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + ").</p>";
          return;
        }
        var list = res.data || [];
        count.textContent = list.length ? (list.length === 1 ? "1 informação." : list.length + " informações.") : "Nada pendente.";
        if (!list.length) {
          tabela.innerHTML =
            '<div class="empty"><div class="empty__title">Nada pendente</div>' +
            '<div class="empty__txt">Quando um fornecedor enviar dados, eles aparecem aqui.</div></div>';
          return;
        }
        var head = "<thead><tr>" +
          '<th class="col-text">Fornecedor</th><th class="col-text">Pedido</th>' +
          "<th>Volume do pedido</th><th>Transportado</th></tr></thead>";
        var rows = list.map(function (r) {
          return "<tr>" +
            '<td class="col-text">' + esc(r.fornecedor) + "</td>" +
            '<td class="col-text cell-pedido">' + esc(r.pedido) + "</td>" +
            "<td>" + fmt.format(num(r.vol_pedido)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_transportado)) + "</td>" +
            "</tr>";
        }).join("");
        tabela.innerHTML = '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
      });
    }

    function wire() {
      if (wired) return;
      grab();
      if (refreshBtn) refreshBtn.addEventListener("click", render);
      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  window.FornecedorUI = FornecedorUI;
  window.PendentesUI = PendentesUI;
})();
