/* =====================================================================
   INFORMAÇÕES PENDENTES — fluxo fornecedor -> equipe responsável (Supabase).
   O fornecedor envia (Pedido, Volume do pedido, Transportado) e vê os
   próprios envios. Ele NÃO altera o histórico direto: pede alteração
   (propondo novos valores) e a equipe com acesso completo aprova ou recusa.
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

  /* ---------- camada de dados (RLS filtra fornecedor x equipe) ---------- */
  var Data = {
    listPendencias: function (somenteEnviadas) {
      var q = sb.from("pendencias")
        .select("id, fornecedor, pedido, data_ref, valor_fabricar, vol_fabricado, vol_estoque, vol_transportado, status, created_at")
        .order("created_at", { ascending: false });
      return somenteEnviadas ? q.eq("status", "enviada") : q;
    },
    updatePendencia: function (id, patch) { return sb.from("pendencias").update(patch).eq("id", id); },
    removePendencia: function (id) { return sb.from("pendencias").delete().eq("id", id); },

    listSolicitacoesPendentes: function () {
      return sb.from("solicitacoes")
        .select("id, pendencia_id, fornecedor, pedido, valor_fabricar_novo, vol_fabricado_novo, vol_estoque_novo, vol_transportado_novo, mensagem, created_at")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
    },
    setStatusSolicitacao: function (id, status) { return sb.from("solicitacoes").update({ status: status }).eq("id", id); },
    aceitarPendencia: function (id) { return sb.rpc("aceitar_pendencia", { p_pendencia_id: id }); },
    aprovarSolicitacao: function (id) { return sb.rpc("aprovar_solicitacao", { p_solicitacao_id: id }); }
  };

  /* ---------- UI do FORNECEDOR ---------- */
  /* data_ref vem como "aaaa-mm-dd"; exibe como dd/mm/aaaa sem fuso. */
  function fmtData(d) {
    if (!d) return "—";
    var p = String(d).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : d;
  }

  /* Somente leitura: a entrada de dados acontece no Report dos fiscais. */
  var FornecedorUI = (function () {
    var tabela, count;

    function grab() {
      tabela = document.getElementById("forn-tabela");
      count = document.getElementById("forn-count");
    }

    function render() {
      if (!tabela) grab();
      if (!tabela || !guardSb(tabela)) return;
      Data.listPendencias().then(function (pend) {
        if (pend.error) {
          tabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(pend.error.message) + ").</p>";
          return;
        }
        var linhas = pend.data || [];
        count.textContent = linhas.length ? (linhas.length === 1 ? "1 envio." : linhas.length + " envios.") : "Nenhum envio.";
        if (!linhas.length) {
          tabela.innerHTML =
            '<div class="empty"><div class="empty__title">Nenhuma informação registrada</div>' +
            '<div class="empty__txt">Os envios feitos anteriormente aparecem aqui para consulta.</div></div>';
          return;
        }
        var head = "<thead><tr>" +
          '<th class="col-text">Data</th><th class="col-text">Pedido</th>' +
          "<th>Volume a ser Fabricado</th><th>Volume Fabricado</th><th>Volume em estoque</th><th>Volume Transportado</th>" +
          "<th>Status</th></tr></thead>";
        var rows = linhas.map(function (r) {
          var st = r.status || "enviada";
          var tag = st === "aceita"
            ? '<span class="tag-ok">Aceita</span>'
            : st === "recusada"
              ? '<span class="tag-no">Recusada</span>'
              : '<span class="tag-wait">Aguardando</span>';
          return "<tr>" +
            '<td class="col-text">' + fmtData(r.data_ref) + "</td>" +
            '<td class="col-text cell-pedido">' + esc(r.pedido) + "</td>" +
            "<td>" + fmt.format(num(r.valor_fabricar)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_fabricado)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_estoque)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_transportado)) + "</td>" +
            "<td>" + tag + "</td>" +
            "</tr>";
        }).join("");
        tabela.innerHTML = '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
      });
    }

    return { render: render };
  })();

  /* ---------- UI DA EQUIPE: Informações pendentes + solicitações ---------- */
  var PendentesUI = (function () {
    var tabela, count, refreshBtn, solicTabela, solicCount, wired = false;
    var solicitacoes = [];
    var pendencias = [];

    function grab() {
      tabela = document.getElementById("pendentes-tabela");
      count = document.getElementById("pendentes-count");
      refreshBtn = document.getElementById("pendentes-refresh");
      solicTabela = document.getElementById("solic-tabela");
      solicCount = document.getElementById("solic-count");
    }

    function renderPendencias() {
      Data.listPendencias(true).then(function (res) {
        if (res.error) {
          tabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + ").</p>";
          return;
        }
        pendencias = res.data || [];
        var list = pendencias;
        count.textContent = list.length ? (list.length === 1 ? "1 informação." : list.length + " informações.") : "Nada recebido.";
        if (!list.length) {
          tabela.innerHTML =
            '<div class="empty"><div class="empty__title">Nada recebido</div>' +
            '<div class="empty__txt">Quando um fornecedor enviar dados, eles aparecem aqui.</div></div>';
          return;
        }
        var head = "<thead><tr>" +
          '<th class="col-text">Fornecedor</th><th class="col-text">Data</th><th class="col-text">Pedido</th>' +
          "<th>Volume a ser Fabricado</th><th>Volume Fabricado</th><th>Volume em estoque</th><th>Volume Transportado</th>" +
          "<th>Ações</th></tr></thead>";
        var rows = list.map(function (r) {
          return "<tr>" +
            '<td class="col-text">' + esc(r.fornecedor) + "</td>" +
            '<td class="col-text">' + fmtData(r.data_ref) + "</td>" +
            '<td class="col-text cell-pedido">' + esc(r.pedido) + "</td>" +
            "<td>" + fmt.format(num(r.valor_fabricar)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_fabricado)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_estoque)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_transportado)) + "</td>" +
            '<td><div class="row-actions">' +
              '<button class="btn btn--success btn--sm pend-ok" data-id="' + r.id + '" type="button">Aceitar</button>' +
              '<button class="btn btn--danger btn--sm pend-no" data-id="' + r.id + '" type="button">Recusar</button>' +
            "</div></td>" +
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
          "<th>Volume a ser Fabricado</th><th>Volume Fabricado</th><th>Volume em estoque</th><th>Volume Transportado</th>" +
          '<th class="col-text">Observação</th><th>Ações</th></tr></thead>';
        var rows = solicitacoes.map(function (s) {
          return "<tr>" +
            '<td class="col-text">' + esc(s.fornecedor) + "</td>" +
            '<td class="col-text cell-pedido">' + esc(s.pedido) + "</td>" +
            "<td>" + fmt.format(num(s.valor_fabricar_novo)) + "</td>" +
            "<td>" + fmt.format(num(s.vol_fabricado_novo)) + "</td>" +
            "<td>" + fmt.format(num(s.vol_estoque_novo)) + "</td>" +
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

    function aceitarPendencia(r) {
      Data.aceitarPendencia(r.id).then(function (res) {
        if (res.error) throw res.error;
        render();
        if (window.RegistrosUI) window.RegistrosUI.render();
      }).catch(function (err) {
        window.alert("Erro ao aceitar a pendência: " + (err.message || err));
      });
    }

    function recusarPendencia(r) {
      Data.updatePendencia(r.id, { status: "recusada" }).then(function (res) {
        if (res.error) { window.alert("Erro ao recusar: " + res.error.message); return; }
        render();
      });
    }

    function aprovar(s) {
      Data.aprovarSolicitacao(s.id).then(function (res) {
        if (res.error) throw res.error;
        render();
        if (window.RegistrosUI) window.RegistrosUI.render();
      }).catch(function (err) {
        window.alert("Erro ao aprovar a solicitação: " + (err.message || err));
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
      if (tabela) {
        tabela.addEventListener("click", function (e) {
          var ok = e.target.closest(".pend-ok");
          var no = e.target.closest(".pend-no");
          if (!ok && !no) return;
          var id = (ok || no).getAttribute("data-id");
          var r = pendencias.filter(function (x) { return x.id === id; })[0];
          if (!r) return;
          if (ok) { if (window.confirm("Aceitar o pedido " + r.pedido + " de " + r.fornecedor + "? Ele vira um registro oficial e fica como Aceita no histórico do fornecedor.")) aceitarPendencia(r); }
          else { if (window.confirm("Recusar o envio do pedido " + r.pedido + "? Ele fica como Recusada no histórico do fornecedor.")) recusarPendencia(r); }
        });
      }
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
