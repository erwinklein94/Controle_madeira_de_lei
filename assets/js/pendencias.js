/* =====================================================================
   INFORMAÇÕES PENDENTES — fluxo fornecedor -> administrador (Supabase).
   O fornecedor envia (Pedido, Volume do pedido, Transportado) e vê os
   próprios envios. Ele NÃO altera o histórico direto: pede alteração
   (propondo novos valores) e o administrador aprova ou recusa.
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
  function guardSb(el) {
    if (sb) return true;
    if (el) el.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>';
    return false;
  }

  /* ---------- camada de dados (RLS filtra fornecedor x admin) ---------- */
  var Data = {
    listPendencias: function () {
      return sb.from("pendencias")
        .select("id, fornecedor, pedido, vol_pedido, vol_transportado, created_at")
        .order("created_at", { ascending: false });
    },
    addPendencia: function (rec) { return sb.from("pendencias").insert(rec); },
    updatePendencia: function (id, patch) { return sb.from("pendencias").update(patch).eq("id", id); },

    listSolicitacoesPendentes: function () {
      return sb.from("solicitacoes")
        .select("id, pendencia_id, fornecedor, pedido, vol_pedido_novo, vol_transportado_novo, mensagem, created_at")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
    },
    addSolicitacao: function (rec) { return sb.from("solicitacoes").insert(rec); },
    setStatusSolicitacao: function (id, status) { return sb.from("solicitacoes").update({ status: status }).eq("id", id); }
  };

  /* ---------- UI do FORNECEDOR ---------- */
  var FornecedorUI = (function () {
    var form, msg, tabela, count, pedidoEl, volEl, transpEl, wired = false;
    var linhas = [];        // pendências atuais
    var solicitados = {};   // pendencia_id -> true (já tem pedido pendente)

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
      Promise.all([Data.listPendencias(), Data.listSolicitacoesPendentes()]).then(function (out) {
        var pend = out[0], sol = out[1];
        if (pend.error) {
          tabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(pend.error.message) + ").</p>";
          return;
        }
        linhas = pend.data || [];
        solicitados = {};
        (sol.data || []).forEach(function (s) { if (s.pendencia_id) solicitados[s.pendencia_id] = true; });

        count.textContent = linhas.length ? (linhas.length === 1 ? "1 envio." : linhas.length + " envios.") : "Nenhum envio ainda.";
        if (!linhas.length) {
          tabela.innerHTML =
            '<div class="empty"><div class="empty__title">Nenhuma informação enviada</div>' +
            '<div class="empty__txt">Preencha o formulário acima e clique em Enviar.</div></div>';
          return;
        }
        var head = "<thead><tr>" +
          '<th class="col-text">Pedido</th><th>Volume do pedido</th><th>Transportado</th><th>Ações</th>' +
          "</tr></thead>";
        var rows = linhas.map(function (r) {
          var acao = solicitados[r.id]
            ? '<span class="tag-pend">Alteração solicitada</span>'
            : '<button class="btn btn--ghost btn--sm row-request" data-id="' + r.id + '" type="button">Solicitar alteração</button>';
          return "<tr>" +
            '<td class="col-text cell-pedido">' + esc(r.pedido) + "</td>" +
            "<td>" + fmt.format(num(r.vol_pedido)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_transportado)) + "</td>" +
            '<td><div class="row-actions">' + acao + "</div></td>" +
            "</tr>";
        }).join("");
        tabela.innerHTML = '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
      });
    }

    function pedirAlteracao(r) {
      var nv = window.prompt("Novo Volume do pedido para o pedido " + r.pedido + " (atual: " + num(r.vol_pedido) + "):", r.vol_pedido);
      if (nv === null) return;
      var nt = window.prompt("Novo Transportado (atual: " + num(r.vol_transportado) + "):", r.vol_transportado);
      if (nt === null) return;
      var obs = window.prompt("Observação para o administrador (opcional):", "");

      var rec = {
        pendencia_id: r.id,
        fornecedor: r.fornecedor,
        pedido: r.pedido,
        vol_pedido_novo: num(nv),
        vol_transportado_novo: num(nt),
        mensagem: obs ? obs : null
      };
      Data.addSolicitacao(rec).then(function (res) {
        if (res.error) { showMsg("Erro ao solicitar: " + res.error.message, false); return; }
        showMsg("Solicitação enviada ao administrador.", true);
        render();
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
        Data.addPendencia(rec).then(function (res) {
          btn.disabled = false;
          if (res.error) { showMsg("Erro ao enviar: " + res.error.message, false); return; }
          form.reset();
          showMsg("Enviado!", true);
          render();
        });
      });

      tabela.addEventListener("click", function (e) {
        var reqBtn = e.target.closest(".row-request");
        if (!reqBtn) return;
        var id = reqBtn.getAttribute("data-id");
        var r = linhas.filter(function (x) { return x.id === id; })[0];
        if (r) pedirAlteracao(r);
      });

      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  /* ---------- UI do ADMIN: Informações pendentes + solicitações ---------- */
  var PendentesUI = (function () {
    var tabela, count, refreshBtn, solicTabela, solicCount, wired = false;
    var solicitacoes = [];

    function grab() {
      tabela = document.getElementById("pendentes-tabela");
      count = document.getElementById("pendentes-count");
      refreshBtn = document.getElementById("pendentes-refresh");
      solicTabela = document.getElementById("solic-tabela");
      solicCount = document.getElementById("solic-count");
    }

    function renderPendencias() {
      Data.listPendencias().then(function (res) {
        if (res.error) {
          tabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + ").</p>";
          return;
        }
        var list = res.data || [];
        count.textContent = list.length ? (list.length === 1 ? "1 informação." : list.length + " informações.") : "Nada recebido.";
        if (!list.length) {
          tabela.innerHTML =
            '<div class="empty"><div class="empty__title">Nada recebido</div>' +
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

    function renderSolicitacoes() {
      Data.listSolicitacoesPendentes().then(function (res) {
        if (res.error) {
          solicTabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + ").</p>";
          return;
        }
        solicitacoes = res.data || [];
        solicCount.textContent = solicitacoes.length
          ? (solicitacoes.length === 1 ? "1 solicitação." : solicitacoes.length + " solicitações.")
          : "Nenhuma solicitação.";
        if (!solicitacoes.length) {
          solicTabela.innerHTML =
            '<div class="empty"><div class="empty__title">Nenhuma solicitação</div>' +
            '<div class="empty__txt">Pedidos de alteração dos fornecedores aparecem aqui para aprovação.</div></div>';
          return;
        }
        var head = "<thead><tr>" +
          '<th class="col-text">Fornecedor</th><th class="col-text">Pedido</th>' +
          "<th>Volume solicitado</th><th>Transportado solicitado</th>" +
          '<th class="col-text">Observação</th><th>Ações</th></tr></thead>";
        var rows = solicitacoes.map(function (s) {
          return "<tr>" +
            '<td class="col-text">' + esc(s.fornecedor) + "</td>" +
            '<td class="col-text cell-pedido">' + esc(s.pedido) + "</td>" +
            "<td>" + fmt.format(num(s.vol_pedido_novo)) + "</td>" +
            "<td>" + fmt.format(num(s.vol_transportado_novo)) + "</td>" +
            '<td class="col-text">' + esc(s.mensagem || "—") + "</td>" +
            '<td><div class="row-actions">' +
              '<button class="btn btn--success btn--sm solic-ok" data-id="' + s.id + '" type="button">Aprovar</button>' +
              '<button class="btn btn--danger btn--sm solic-no" data-id="' + s.id + '" type="button">Recusar</button>' +
            "</div></td>" +
            "</tr>";
        }).join("");
        solicTabela.innerHTML = '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
      });
    }

    function render() {
      if (!tabela) grab();
      if (!tabela || !guardSb(tabela)) return;
      renderPendencias();
      renderSolicitacoes();
    }

    function aprovar(s) {
      // Aplica os valores propostos na pendência e marca a solicitação como aprovada.
      Data.updatePendencia(s.pendencia_id, {
        vol_pedido: num(s.vol_pedido_novo),
        vol_transportado: num(s.vol_transportado_novo)
      }).then(function (res) {
        if (res.error) { window.alert("Erro ao aplicar alteração: " + res.error.message); return; }
        Data.setStatusSolicitacao(s.id, "aprovada").then(function (r2) {
          if (r2.error) { window.alert("Alteração aplicada, mas erro ao fechar a solicitação: " + r2.error.message); }
          render();
        });
      });
    }

    function recusar(s) {
      Data.setStatusSolicitacao(s.id, "recusada").then(function (res) {
        if (res.error) { window.alert("Erro ao recusar: " + res.error.message); return; }
        render();
      });
    }

    function wire() {
      if (wired) return;
      grab();
      if (refreshBtn) refreshBtn.addEventListener("click", render);
      if (solicTabela) {
        solicTabela.addEventListener("click", function (e) {
          var ok = e.target.closest(".solic-ok");
          var no = e.target.closest(".solic-no");
          if (!ok && !no) return;
          var id = (ok || no).getAttribute("data-id");
          var s = solicitacoes.filter(function (x) { return x.id === id; })[0];
          if (!s) return;
          if (ok) { if (window.confirm("Aprovar e aplicar os valores solicitados ao pedido " + s.pedido + "?")) aprovar(s); }
          else { if (window.confirm("Recusar a solicitação do pedido " + s.pedido + "?")) recusar(s); }
        });
      }
      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  window.FornecedorUI = FornecedorUI;
  window.PendentesUI = PendentesUI;
})();
