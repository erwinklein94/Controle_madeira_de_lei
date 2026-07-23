/* =====================================================================
   INFORMACOES DOS FORNECEDORES — envio, edicao e historico no Supabase.
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
  function fmtData(d) {
    if (!d) return "—";
    var p = String(d).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : d;
  }
  function fmtMomento(d) {
    if (!d) return "—";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
  }

  /* A RLS limita a leitura ao fornecedor da conta e reserva as decisões à equipe. */
  var Data = {
    listPendencias: function () {
      return sb.from("pendencias")
        .select("id, fornecedor, pedido, pedido_id, data_ref, vol_pedido, vol_fabricado, vol_estoque, vol_transportado, status, acao_fornecedor, created_by, created_at, updated_at")
        .order("updated_at", { ascending: false });
    },
    addPendencia: function (rec) { return sb.from("pendencias").insert(rec); },
    updateOwnPendencia: function (row, patch) {
      return sb.from("pendencias").update(patch)
        .eq("id", row.id).eq("updated_at", row.updated_at)
        .select("id, updated_at").maybeSingle();
    },
    updatePendencia: function (id, patch) { return sb.from("pendencias").update(patch).eq("id", id); },
    aceitarPendencia: function (id) { return sb.rpc("aceitar_pendencia", { p_pendencia_id: id }); }
  };

  /* ---------- UI DO FORNECEDOR ---------- */
  var FornecedorUI = (function () {
    var form, msg, tabela, count, title, submitBtn, cancelBtn, wired = false;
    var dataEl, pedidoEl, listaPedidosEl, volPedidoEl, fabricadoEl, estoqueEl, transpEl;
    var linhas = [];
    var editing = null;

    function grab() {
      form = document.getElementById("forn-form");
      msg = document.getElementById("forn-msg");
      tabela = document.getElementById("forn-tabela");
      count = document.getElementById("forn-count");
      title = document.getElementById("forn-form-title");
      submitBtn = document.getElementById("forn-submit");
      cancelBtn = document.getElementById("forn-cancel");
      dataEl = document.getElementById("forn-data");
      pedidoEl = document.getElementById("forn-pedido");
      listaPedidosEl = document.getElementById("forn-pedidos-list");
      volPedidoEl = document.getElementById("forn-volpedido");
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
    function pedidoDigitado() { return String(pedidoEl && pedidoEl.value || "").trim(); }

    function fillPedidoOptions(registros, pendencias) {
      if (!listaPedidosEl) return;
      var seen = {};
      (registros || []).concat(pendencias || []).forEach(function (item) {
        var numero = String(item && item.pedido || "").trim();
        if (numero) seen[numero] = true;
      });
      listaPedidosEl.innerHTML = "";
      Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }).forEach(function (numero) {
        var option = document.createElement("option");
        option.value = numero;
        listaPedidosEl.appendChild(option);
      });
    }

    function resetForm() {
      editing = null;
      form.reset();
      dataEl.value = hoje();
      title.textContent = "Enviar informação";
      submitBtn.textContent = "Enviar";
      cancelBtn.hidden = true;
      showMsg("");
    }

    function startEdit(row) {
      editing = row;
      dataEl.value = String(row.data_ref || "").slice(0, 10);
      pedidoEl.value = row.pedido || "";
      volPedidoEl.value = num(row.vol_pedido);
      fabricadoEl.value = num(row.vol_fabricado);
      estoqueEl.value = num(row.vol_estoque);
      transpEl.value = num(row.vol_transportado);
      title.textContent = "Alterar informação enviada";
      submitBtn.textContent = "Salvar alteração";
      cancelBtn.hidden = false;
      showMsg("Altere os campos necessários e salve.");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function statusTag(row) {
      if (row.status === "aceita") return '<span class="tag-ok">Aceita</span>';
      if (row.status === "recusada") return '<span class="tag-no">Recusada</span>';
      if (row.status === "excluida") return '<span class="tag-no">Excluída</span>';
      if (row.acao_fornecedor === "alterada") return '<span class="tag-wait">Alterada · aguardando</span>';
      return '<span class="tag-wait">Aguardando</span>';
    }

    function render() {
      if (!tabela) grab();
      if (!tabela || !guardSb(tabela)) return;
      Promise.all([
        Data.listPendencias(),
        sb.from("registros").select("pedido")
      ]).then(function (out) {
        var pend = out[0];
        fillPedidoOptions(out[1].data || [], pend.data || []);
        if (pend.error) {
          tabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(pend.error.message) + ").</p>";
          return;
        }
        linhas = pend.data || [];
        count.textContent = linhas.length ? (linhas.length === 1 ? "1 envio." : linhas.length + " envios.") : "Nenhum envio ainda.";
        if (!linhas.length) {
          tabela.innerHTML = '<div class="empty"><div class="empty__title">Nenhuma informação enviada</div><div class="empty__txt">Preencha o formulário acima e clique em Enviar.</div></div>';
          return;
        }
        var currentId = String((window.currentProfile || {}).id || "");
        var head = '<thead><tr><th class="col-text">Data</th><th class="col-text">Pedido</th><th>Volume do Pedido</th><th>Volume Fabricado</th><th>Volume em Estoque</th><th>Volume Transportado</th><th>Status</th><th>Ações</th></tr></thead>';
        var rows = linhas.map(function (r) {
          var canChange = r.status === "enviada" && currentId && String(r.created_by || "") === currentId;
          var actions = canChange
            ? '<div class="row-actions"><button class="btn btn--ghost btn--sm forn-edit" data-id="' + esc(r.id) + '" type="button">Alterar</button><button class="btn btn--danger btn--sm forn-delete" data-id="' + esc(r.id) + '" type="button">Excluir</button></div>'
            : "—";
          return '<tr><td class="col-text">' + fmtData(r.data_ref) + '</td><td class="col-text cell-pedido">' + esc(r.pedido) + "</td><td>" + fmt.format(num(r.vol_pedido)) + "</td><td>" + fmt.format(num(r.vol_fabricado)) + "</td><td>" + fmt.format(num(r.vol_estoque)) + "</td><td>" + fmt.format(num(r.vol_transportado)) + "</td><td>" + statusTag(r) + "</td><td>" + actions + "</td></tr>";
        }).join("");
        tabela.innerHTML = '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
      });
    }

    function payload(prof) {
      return {
        fornecedor: prof.fornecedor,
        pedido: pedidoDigitado(),
        pedido_id: null,
        data_ref: dataEl.value,
        vol_pedido: num(volPedidoEl.value),
        vol_fabricado: num(fabricadoEl.value),
        vol_estoque: num(estoqueEl.value),
        vol_transportado: num(transpEl.value)
      };
    }

    function wire() {
      if (wired) return;
      grab();
      if (!form) return;
      if (dataEl && !dataEl.value) dataEl.value = hoje();
      cancelBtn.addEventListener("click", resetForm);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var prof = window.currentProfile;
        if (!prof || !prof.fornecedor) { showMsg("Perfil de fornecedor incompleto. Fale com a equipe Rumo.", false); return; }
        if (!dataEl.value) { showMsg("Informe a data.", false); return; }
        if (!pedidoDigitado()) { showMsg("Digite o número do pedido.", false); return; }
        if ([volPedidoEl, fabricadoEl, estoqueEl, transpEl].some(function (el) { return el.value === "" || num(el.value) < 0; })) {
          showMsg("Preencha todos os volumes com valores iguais ou maiores que zero.", false); return;
        }
        var rec = payload(prof);
        var op;
        if (editing) {
          rec.acao_fornecedor = "alterada";
          op = Data.updateOwnPendencia(editing, rec);
        } else {
          rec.acao_fornecedor = "enviada";
          op = Data.addPendencia(rec);
        }
        submitBtn.disabled = true;
        op.then(function (res) {
          submitBtn.disabled = false;
          if (res.error) { showMsg("Erro ao salvar: " + res.error.message, false); return; }
          if (editing && !res.data) { showMsg("Este envio foi modificado em outra sessão. Atualize a lista e tente novamente.", false); return; }
          var changed = !!editing;
          resetForm();
          showMsg(changed ? "Alteração salva e informada à equipe Rumo." : "Enviado! A equipe Rumo verá em Informações dos Fornecedores.", true);
          render();
        });
      });

      tabela.addEventListener("click", function (e) {
        var edit = e.target.closest(".forn-edit");
        var del = e.target.closest(".forn-delete");
        if (!edit && !del) return;
        var id = (edit || del).getAttribute("data-id");
        var row = linhas.filter(function (item) { return item.id === id; })[0];
        if (!row) return;
        if (edit) { startEdit(row); return; }
        if (!window.confirm("Excluir o envio do pedido " + row.pedido + "? A exclusão ficará registrada para a equipe Rumo.")) return;
        Data.updateOwnPendencia(row, { status: "excluida", acao_fornecedor: "excluida" }).then(function (res) {
          if (res.error) { window.alert("Erro ao excluir: " + res.error.message); return; }
          if (!res.data) { window.alert("Este envio foi modificado em outra sessão. Atualize a lista e tente novamente."); return; }
          if (editing && editing.id === row.id) resetForm();
          showMsg("Envio excluído. A exclusão foi registrada para a equipe Rumo.", true);
          render();
        });
      });
      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  /* ---------- UI DA EQUIPE: histórico completo dos fornecedores ---------- */
  var PendentesUI = (function () {
    var tabela, count, refreshBtn, wired = false;
    var pendencias = [];

    function grab() {
      tabela = document.getElementById("pendentes-tabela");
      count = document.getElementById("pendentes-count");
      refreshBtn = document.getElementById("pendentes-refresh");
    }
    function movement(row) {
      if (row.acao_fornecedor === "alterada") return '<span class="tag-wait">Alterado pelo fornecedor</span>';
      if (row.acao_fornecedor === "excluida" || row.status === "excluida") return '<span class="tag-no">Excluído pelo fornecedor</span>';
      return '<span class="tag-ok">Enviado pelo fornecedor</span>';
    }
    function situation(row) {
      if (row.status === "aceita") return "Analisada";
      if (row.status === "recusada") return "Recusada";
      if (row.status === "excluida") return "Excluída";
      return "Aguardando decisão";
    }
    function render() {
      if (!tabela) grab();
      if (!tabela || !guardSb(tabela)) return;
      Data.listPendencias().then(function (res) {
        if (res.error) {
          tabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + ").</p>";
          return;
        }
        pendencias = res.data || [];
        count.textContent = pendencias.length ? (pendencias.length === 1 ? "1 informação no histórico." : pendencias.length + " informações no histórico.") : "Nada recebido.";
        if (!pendencias.length) {
          tabela.innerHTML = '<div class="empty"><div class="empty__title">Nada recebido</div><div class="empty__txt">Envios, alterações e exclusões dos fornecedores aparecerão aqui.</div></div>';
          return;
        }
        var head = '<thead><tr><th class="col-text">Fornecedor</th><th class="col-text">Data</th><th class="col-text">Pedido</th><th>Volume do Pedido</th><th>Volume Fabricado</th><th>Volume em Estoque</th><th>Volume Transportado</th><th>Modificação</th><th class="col-text">Atualizado em</th><th>Situação</th><th>Ações</th></tr></thead>';
        var rows = pendencias.map(function (r) {
          var actions = r.status === "enviada"
            ? '<div class="row-actions"><button class="btn btn--success btn--sm pend-ok" data-id="' + esc(r.id) + '" type="button">Marcar como analisada</button><button class="btn btn--danger btn--sm pend-no" data-id="' + esc(r.id) + '" type="button">Descartar</button></div>'
            : "—";
          return '<tr><td class="col-text">' + esc(r.fornecedor) + '</td><td class="col-text">' + fmtData(r.data_ref) + '</td><td class="col-text cell-pedido">' + esc(r.pedido) + "</td><td>" + fmt.format(num(r.vol_pedido)) + "</td><td>" + fmt.format(num(r.vol_fabricado)) + "</td><td>" + fmt.format(num(r.vol_estoque)) + "</td><td>" + fmt.format(num(r.vol_transportado)) + "</td><td>" + movement(r) + '</td><td class="col-text">' + fmtMomento(r.updated_at) + "</td><td>" + situation(r) + "</td><td>" + actions + "</td></tr>";
        }).join("");
        tabela.innerHTML = '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
      });
    }
    function aceitar(row) {
      Data.aceitarPendencia(row.id).then(function (res) {
        if (res.error) throw res.error;
        render();
        if (window.RegistrosUI) window.RegistrosUI.render();
      }).catch(function (err) {
        window.alert("Erro ao aceitar: " + (err.message || err));
      });
    }
    function recusar(row) {
      Data.updatePendencia(row.id, { status: "recusada" }).then(function (res) {
        if (res.error) { window.alert("Erro ao recusar: " + res.error.message); return; }
        render();
      });
    }
    function wire() {
      if (wired) return;
      grab();
      if (refreshBtn) refreshBtn.addEventListener("click", render);
      if (tabela) tabela.addEventListener("click", function (e) {
        var ok = e.target.closest(".pend-ok");
        var no = e.target.closest(".pend-no");
        if (!ok && !no) return;
        var id = (ok || no).getAttribute("data-id");
        var row = pendencias.filter(function (item) { return item.id === id; })[0];
        if (!row) return;
        if (ok && window.confirm("Marcar como analisado o aviso do pedido " + row.pedido + " de " + row.fornecedor + "? Os registros do site continuam sendo atualizados somente pelo Excel.")) aceitar(row);
        if (no && window.confirm("Descartar o aviso do pedido " + row.pedido + "?")) recusar(row);
      });
      wired = true;
    }
    return { render: function () { wire(); render(); } };
  })();

  window.FornecedorUI = FornecedorUI;
  window.PendentesUI = PendentesUI;
})();
