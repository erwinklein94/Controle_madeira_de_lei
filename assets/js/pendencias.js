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
    listPendencias: function (somenteEnviadas) {
      var q = sb.from("pendencias")
        .select("id, fornecedor, pedido, data_ref, valor_fabricar, vol_fabricado, vol_estoque, vol_transportado, status, created_at")
        .order("created_at", { ascending: false });
      return somenteEnviadas ? q.eq("status", "enviada") : q;
    },
    addPendencia: function (rec) { return sb.from("pendencias").insert(rec); },
    updatePendencia: function (id, patch) { return sb.from("pendencias").update(patch).eq("id", id); },
    removePendencia: function (id) { return sb.from("pendencias").delete().eq("id", id); },

    listSolicitacoesPendentes: function () {
      return sb.from("solicitacoes")
        .select("id, pendencia_id, fornecedor, pedido, valor_fabricar_novo, vol_fabricado_novo, vol_estoque_novo, vol_transportado_novo, mensagem, created_at")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
    },
    addSolicitacao: function (rec) { return sb.from("solicitacoes").insert(rec); },
    setStatusSolicitacao: function (id, status) { return sb.from("solicitacoes").update({ status: status }).eq("id", id); }
  };

  /* ---------- UI do FORNECEDOR ---------- */
  /* data_ref vem como "aaaa-mm-dd"; exibe como dd/mm/aaaa sem fuso. */
  function fmtData(d) {
    if (!d) return "—";
    var p = String(d).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : d;
  }

  var FornecedorUI = (function () {
    var form, msg, tabela, count, wired = false;
    var dataEl, pedidoEl, valorFabEl, fabricadoEl, estoqueEl, transpEl;
    var linhas = [];        // pendências atuais
    var solicitados = {};   // pendencia_id -> true (já tem pedido pendente)

    function grab() {
      form = document.getElementById("forn-form");
      msg = document.getElementById("forn-msg");
      tabela = document.getElementById("forn-tabela");
      count = document.getElementById("forn-count");
      dataEl = document.getElementById("forn-data");
      pedidoEl = document.getElementById("forn-pedido");
      valorFabEl = document.getElementById("forn-valorfab");
      fabricadoEl = document.getElementById("forn-fabricado");
      estoqueEl = document.getElementById("forn-estoque");
      transpEl = document.getElementById("forn-transportado");
    }

    function hoje() {
      var d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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
          '<th class="col-text">Data</th><th class="col-text">Pedido</th>' +
          "<th>Valor a ser Fabricado</th><th>Volume Fabricado</th><th>Volume em estoque</th><th>Volume Transportado</th>" +
          "<th>Status</th><th>Ações</th></tr></thead>";
        var rows = linhas.map(function (r) {
          var st = r.status || "enviada";
          var tag = st === "aceita"
            ? '<span class="tag-ok">Aceita</span>'
            : st === "recusada"
              ? '<span class="tag-no">Recusada</span>'
              : '<span class="tag-wait">Aguardando</span>';
          var acao = "—";
          if (st === "enviada" || st === "aceita") {
            acao = solicitados[r.id]
              ? '<span class="tag-pend">Alteração solicitada</span>'
              : '<button class="btn btn--ghost btn--sm row-request" data-id="' + r.id + '" type="button">Solicitar alteração</button>';
          }
          return "<tr>" +
            '<td class="col-text">' + fmtData(r.data_ref) + "</td>" +
            '<td class="col-text cell-pedido">' + esc(r.pedido) + "</td>" +
            "<td>" + fmt.format(num(r.valor_fabricar)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_fabricado)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_estoque)) + "</td>" +
            "<td>" + fmt.format(num(r.vol_transportado)) + "</td>" +
            "<td>" + tag + "</td>" +
            '<td><div class="row-actions">' + acao + "</div></td>" +
            "</tr>";
        }).join("");
        tabela.innerHTML = '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
      });
    }

    function pedirAlteracao(r) {
      var nvf = window.prompt("Novo Valor a ser Fabricado para o pedido " + r.pedido + " (atual: " + num(r.valor_fabricar) + "):", r.valor_fabricar);
      if (nvf === null) return;
      var nfb = window.prompt("Novo Volume Fabricado (atual: " + num(r.vol_fabricado) + "):", r.vol_fabricado);
      if (nfb === null) return;
      var nes = window.prompt("Novo Volume em estoque para entrega (atual: " + num(r.vol_estoque) + "):", r.vol_estoque);
      if (nes === null) return;
      var nt = window.prompt("Novo Volume Transportado (atual: " + num(r.vol_transportado) + "):", r.vol_transportado);
      if (nt === null) return;
      var obs = window.prompt("Observação para o administrador (opcional):", "");

      var rec = {
        pendencia_id: r.id,
        fornecedor: r.fornecedor,
        pedido: r.pedido,
        valor_fabricar_novo: num(nvf),
        vol_fabricado_novo: num(nfb),
        vol_estoque_novo: num(nes),
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
      if (dataEl && !dataEl.value) dataEl.value = hoje();

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var prof = window.currentProfile;
        if (!prof || !prof.fornecedor) { showMsg("Perfil de fornecedor incompleto. Fale com o administrador.", false); return; }
        var pedido = pedidoEl.value.trim();
        if (!pedido) { showMsg("Informe o pedido.", false); return; }
        if (!dataEl.value) { showMsg("Informe a data.", false); return; }

        var rec = {
          fornecedor: prof.fornecedor,
          pedido: pedido,
          data_ref: dataEl.value,
          valor_fabricar: num(valorFabEl.value),
          vol_fabricado: num(fabricadoEl.value),
          vol_estoque: num(estoqueEl.value),
          vol_transportado: num(transpEl.value)
        };
        var btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        Data.addPendencia(rec).then(function (res) {
          btn.disabled = false;
          if (res.error) { showMsg("Erro ao enviar: " + res.error.message, false); return; }
          form.reset();
          dataEl.value = hoje();
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
          "<th>Valor a ser Fabricado</th><th>Volume Fabricado</th><th>Volume em estoque</th><th>Volume Transportado</th>" +
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
          "<th>Valor a ser Fabricado</th><th>Volume Fabricado</th><th>Volume em estoque</th><th>Volume Transportado</th>" +
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
      // Vira registro oficial (tabela de Registros -> dashboard) e sai das pendências.
      if (!window.Store) { window.alert("Não foi possível acessar os registros. Recarregue a página."); return; }
      window.Store.add({
        fiscal: "",
        fornecedor: r.fornecedor,
        local: "",
        pedido: r.pedido,
        volPedido: num(r.valor_fabricar),
        volPronto: num(r.vol_fabricado),
        volInspecionado: 0,
        volLiberado: num(r.vol_estoque),
        volTransportado: num(r.vol_transportado)
      }).then(function () {
        return Data.updatePendencia(r.id, { status: "aceita" }).then(function (res) {
          if (res.error) { window.alert("Registro criado, mas erro ao atualizar o status: " + res.error.message); }
          render();
          if (window.RegistrosUI) window.RegistrosUI.render();
        });
      }).catch(function (err) {
        window.alert("Erro ao criar o registro: " + (err.message || err));
      });
    }

    function recusarPendencia(r) {
      Data.updatePendencia(r.id, { status: "recusada" }).then(function (res) {
        if (res.error) { window.alert("Erro ao recusar: " + res.error.message); return; }
        render();
      });
    }

    function aprovar(s) {
      // Aplica os valores propostos na pendência e marca a solicitação como aprovada.
      Data.updatePendencia(s.pendencia_id, {
        valor_fabricar: num(s.valor_fabricar_novo),
        vol_fabricado: num(s.vol_fabricado_novo),
        vol_estoque: num(s.vol_estoque_novo),
        vol_transportado: num(s.vol_transportado_novo)
      }).then(function (res) {
        if (res.error) { window.alert("Erro ao aplicar alteração: " + res.error.message); return; }
        sincronizaRegistro(s);
        Data.setStatusSolicitacao(s.id, "aprovada").then(function (r2) {
          if (r2.error) { window.alert("Alteração aplicada, mas erro ao fechar a solicitação: " + r2.error.message); }
          render();
        });
      });
    }

    /* Se o envio já tinha sido aceito (existe como registro oficial),
       aplica os novos valores também no registro para refletir no dashboard. */
    function sincronizaRegistro(s) {
      if (!window.Store) return;
      window.Store.refresh().then(function () {
        var alvo = window.Store.getAll().filter(function (r) {
          return r.fornecedor === s.fornecedor && String(r.pedido) === String(s.pedido);
        })[0];
        if (!alvo) return;
        return window.Store.update(alvo.id, {
          volPedido: num(s.valor_fabricar_novo),
          volPronto: num(s.vol_fabricado_novo),
          volLiberado: num(s.vol_estoque_novo),
          volTransportado: num(s.vol_transportado_novo)
        }).then(function () {
          if (window.RegistrosUI) window.RegistrosUI.render();
        });
      }).catch(function (err) {
        window.alert("Solicitação aprovada, mas não foi possível sincronizar o registro: " + (err.message || err));
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
