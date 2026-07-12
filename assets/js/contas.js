/* =====================================================================
   CONTAS — página do administrador com todas as contas do site,
   separadas em Administradores e Fornecedores. Os dados vêm da função
   admin_list_accounts() no Supabase (só retorna linhas para admins).
   Criar usa a Edge Function create-account; alterar/excluir usa a
   Edge Function manage-account.
   ===================================================================== */
(function () {
  "use strict";

  var sb = window.sbClient;
  var fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dt(v) { return v ? fmtData.format(new Date(v)) : "—"; }

  var ContasUI = (function () {
    var admTabela, admCount, fornTabela, fornCount, orfSection, orfTabela, refreshBtn, wired = false;
    var form, formTitle, formMsg, submitBtn, cancelBtn, papelEl, nomeEl, fornEl, fornField, emailEl, senhaEl;
    var contas = [];
    var editingId = null;

    function grab() {
      admTabela = document.getElementById("contas-admin-tabela");
      admCount = document.getElementById("contas-admin-count");
      fornTabela = document.getElementById("contas-forn-tabela");
      fornCount = document.getElementById("contas-forn-count");
      orfSection = document.getElementById("contas-orfas");
      orfTabela = document.getElementById("contas-orfas-tabela");
      refreshBtn = document.getElementById("contas-refresh");
      form = document.getElementById("conta-form");
      formTitle = document.getElementById("conta-form-title");
      formMsg = document.getElementById("conta-msg");
      submitBtn = document.getElementById("conta-submit");
      cancelBtn = document.getElementById("conta-cancelar");
      papelEl = document.getElementById("conta-papel");
      nomeEl = document.getElementById("conta-nome");
      fornEl = document.getElementById("conta-fornecedor");
      fornField = document.getElementById("conta-fornecedor-field");
      emailEl = document.getElementById("conta-email");
      senhaEl = document.getElementById("conta-senha");
    }

    function showFormMsg(text, ok) {
      if (!formMsg) return;
      formMsg.textContent = text || "";
      formMsg.classList.toggle("is-ok", ok === true);
      formMsg.classList.toggle("is-error", ok === false);
    }

    /* Extrai a mensagem detalhada devolvida pela Edge Function. */
    function fnError(res, prefixo) {
      var ctx = res.error.context;
      if (ctx && typeof ctx.json === "function") {
        ctx.json().then(function (b) {
          showFormMsg(prefixo + (b && b.error ? b.error : res.error.message), false);
        }).catch(function () { showFormMsg(prefixo + res.error.message, false); });
      } else {
        showFormMsg(prefixo + res.error.message, false);
      }
    }

    function vazio(texto) {
      return '<div class="empty"><div class="empty__title">' + texto + "</div></div>";
    }

    function tabelaContas(list, comFornecedor) {
      var head = "<thead><tr>" +
        '<th class="col-text">Nome</th>' +
        (comFornecedor ? '<th class="col-text">Fornecedor</th>' : "") +
        '<th class="col-text">E-mail</th>' +
        "<th>Criada em</th><th>Último acesso</th><th>Ações</th></tr></thead>";
      var rows = list.map(function (c) {
        return "<tr>" +
          '<td class="col-text cell-pedido">' + esc(c.nome || "—") + "</td>" +
          (comFornecedor ? '<td class="col-text">' + esc(c.fornecedor || "—") + "</td>" : "") +
          '<td class="col-text">' + esc(c.email) + "</td>" +
          "<td>" + dt(c.created_at) + "</td>" +
          "<td>" + dt(c.last_sign_in_at) + "</td>" +
          '<td><div class="row-actions">' +
            '<button class="btn btn--ghost btn--sm conta-edit" data-id="' + c.id + '" type="button">Editar</button>' +
            '<button class="btn btn--danger btn--sm conta-del" data-id="' + c.id + '" type="button">Excluir</button>' +
          "</div></td>" +
          "</tr>";
      }).join("");
      return '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
    }

    function render() {
      if (!admTabela) grab();
      if (!admTabela) return;
      if (!sb) { admTabela.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>'; return; }

      if (window.Padroes) {
        window.Padroes.load().then(function () {
          window.Padroes.fill(fornEl, "fornecedor");
        }).catch(function () { /* lista fica como está */ });
      }

      sb.rpc("admin_list_accounts").then(function (res) {
        if (res.error) {
          admTabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + "). Confira se o SQL supabase/contas.sql foi executado.</p>";
          fornTabela.innerHTML = "";
          return;
        }
        contas = res.data || [];
        var admins = contas.filter(function (c) { return c.role === "admin"; });
        var forns = contas.filter(function (c) { return c.role === "fornecedor"; });
        var orfas = contas.filter(function (c) { return !c.role; });

        admCount.textContent = admins.length === 1 ? "1 conta." : admins.length + " contas.";
        fornCount.textContent = forns.length === 1 ? "1 conta." : forns.length + " contas.";

        admTabela.innerHTML = admins.length ? tabelaContas(admins, false) : vazio("Nenhuma conta de administrador");
        fornTabela.innerHTML = forns.length ? tabelaContas(forns, true) : vazio("Nenhuma conta de fornecedor");

        orfSection.hidden = !orfas.length;
        if (orfas.length) orfTabela.innerHTML = tabelaContas(orfas, false);
      });
    }

    /* ---------- modo edição ---------- */
    function startEdit(c) {
      editingId = c.id;
      papelEl.value = c.role || "fornecedor";
      nomeEl.value = c.nome || "";
      if (window.Padroes) window.Padroes.fill(fornEl, "fornecedor", c.fornecedor || "");
      else fornEl.value = c.fornecedor || "";
      emailEl.value = c.email || "";
      senhaEl.value = "";
      syncFornField();
      formTitle.textContent = "Editar conta";
      submitBtn.textContent = "Salvar alterações";
      cancelBtn.hidden = false;
      showFormMsg("Editando " + c.email + ". Deixe a senha em branco para manter a atual.");
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function cancelEdit() {
      editingId = null;
      form.reset();
      syncFornField();
      formTitle.textContent = "Nova conta";
      submitBtn.textContent = "Criar conta";
      cancelBtn.hidden = true;
      showFormMsg("");
    }

    /* ---------- criar / salvar ---------- */
    function submeter() {
      var role = papelEl.value;
      var body = {
        email: emailEl.value.trim(),
        password: senhaEl.value,
        role: role,
        nome: nomeEl.value.trim(),
        fornecedor: role === "fornecedor" ? fornEl.value.trim() : null
      };
      if (role === "fornecedor" && !body.fornecedor) { showFormMsg("Informe o nome do fornecedor.", false); return; }

      if (editingId) {
        if (body.password && body.password.length < 6) { showFormMsg("A senha precisa ter pelo menos 6 caracteres.", false); return; }
        var patch = { action: "update", id: editingId, role: body.role, nome: body.nome, fornecedor: body.fornecedor };
        if (body.email) patch.email = body.email;
        if (body.password) patch.password = body.password;
        submitBtn.disabled = true;
        showFormMsg("Salvando…");
        sb.functions.invoke("manage-account", { body: patch }).then(function (res) {
          submitBtn.disabled = false;
          if (res.error) { fnError(res, "Erro ao salvar: "); return; }
          cancelEdit();
          showFormMsg("Conta atualizada!", true);
          render();
        });
        return;
      }

      if (!body.email || !body.password) { showFormMsg("Informe e-mail e senha.", false); return; }
      if (body.password.length < 6) { showFormMsg("A senha precisa ter pelo menos 6 caracteres.", false); return; }
      submitBtn.disabled = true;
      showFormMsg("Criando conta…");
      sb.functions.invoke("create-account", { body: body }).then(function (res) {
        submitBtn.disabled = false;
        if (res.error) { fnError(res, "Erro: "); return; }
        form.reset();
        syncFornField();
        showFormMsg("Conta criada!", true);
        render();
      });
    }

    /* ---------- excluir ---------- */
    function excluir(c) {
      sb.auth.getUser().then(function (res) {
        var me = res.data ? res.data.user : null;
        if (me && me.id === c.id) {
          window.alert("Você não pode excluir a própria conta.");
          return;
        }
        if (!window.confirm("Excluir a conta " + c.email + "? O login deixa de funcionar. Os envios e registros já feitos são preservados.")) return;
        sb.functions.invoke("manage-account", { body: { action: "delete", id: c.id } }).then(function (r2) {
          if (r2.error) { fnError(r2, "Erro ao excluir: "); return; }
          if (editingId === c.id) cancelEdit();
          showFormMsg("Conta excluída.", true);
          render();
        });
      });
    }

    function onTabelaClick(e) {
      var edit = e.target.closest(".conta-edit");
      var del = e.target.closest(".conta-del");
      if (!edit && !del) return;
      var id = (edit || del).getAttribute("data-id");
      var c = contas.filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      if (edit) startEdit(c); else excluir(c);
    }

    function syncFornField() {
      if (fornField) fornField.hidden = papelEl.value !== "fornecedor";
    }

    function wire() {
      if (wired) return;
      grab();
      if (refreshBtn) refreshBtn.addEventListener("click", render);
      if (form) {
        form.addEventListener("submit", function (e) { e.preventDefault(); submeter(); });
        papelEl.addEventListener("change", syncFornField);
        cancelBtn.addEventListener("click", cancelEdit);
        syncFornField();
      }
      [admTabela, fornTabela, orfTabela].forEach(function (t) {
        if (t) t.addEventListener("click", onTabelaClick);
      });
      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  window.ContasUI = ContasUI;
})();
