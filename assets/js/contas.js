/* =====================================================================
   CONTAS - gerenciamento dos perfis com acesso ao site.
   Fiscais/Inspetores trabalham somente na planilha Excel Online.
   A pagina e as Edge Functions sao restritas a acesso completo.
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
  function label(role) { return window.AccessControl ? AccessControl.label(role) : role; }

  var ContasUI = (function () {
    var equipeTabela, equipeCount, fornTabela, fornCount, orfSection, orfTabela, refreshBtn, wired = false;
    var form, formTitle, formMsg, submitBtn, cancelBtn, papelEl, nomeEl, fornEl, fornField, emailEl, senhaEl;
    var contas = [];
    var editingId = null;

    function grab() {
      equipeTabela = document.getElementById("contas-equipe-tabela");
      equipeCount = document.getElementById("contas-equipe-count");
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
    function fnError(res, prefixo) {
      var ctx = res.error.context;
      if (ctx && typeof ctx.json === "function") {
        ctx.json().then(function (body) { showFormMsg(prefixo + (body && body.error ? body.error : res.error.message), false); })
          .catch(function () { showFormMsg(prefixo + res.error.message, false); });
      } else showFormMsg(prefixo + res.error.message, false);
    }
    function vazio(texto) { return '<div class="empty"><div class="empty__title">' + texto + "</div></div>"; }
    function countText(list) { return list.length === 1 ? "1 conta." : list.length + " contas."; }

    function tabelaContas(list, linkedField) {
      var linkedTitle = linkedField === "fornecedor" ? "Fornecedor" : linkedField === "fiscal" ? "Fiscal/Inspetor" : null;
      var head = "<thead><tr>" +
        '<th class="col-text">Nome</th><th class="col-text">Perfil</th>' +
        (linkedTitle ? '<th class="col-text">' + linkedTitle + "</th>" : "") +
        '<th class="col-text">E-mail</th><th>Criada em</th><th>Último acesso</th><th>Ações</th></tr></thead>';
      var rows = list.map(function (c) {
        return "<tr>" +
          '<td class="col-text cell-pedido">' + esc(c.nome || "—") + "</td>" +
          '<td class="col-text"><span class="account-role account-role--' + esc(c.role || "orfao") + '">' + esc(label(c.role)) + "</span></td>" +
          (linkedTitle ? '<td class="col-text">' + esc(c[linkedField] || "—") + "</td>" : "") +
          '<td class="col-text">' + esc(c.email) + "</td><td>" + dt(c.created_at) + "</td><td>" + dt(c.last_sign_in_at) + "</td>" +
          '<td><div class="row-actions"><button class="btn btn--ghost btn--sm conta-edit" data-id="' + c.id + '" type="button">Editar</button>' +
          '<button class="btn btn--danger btn--sm conta-del" data-id="' + c.id + '" type="button">Excluir</button></div></td></tr>';
      }).join("");
      return '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
    }

    function render() {
      if (!equipeTabela) grab();
      if (!equipeTabela) return;
      if (!sb) { equipeTabela.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>'; return; }
      if (!window.AccessControl || !AccessControl.isFull(window.currentProfile && window.currentProfile.role)) return;

      if (window.Padroes) {
        window.Padroes.load().then(function () {
          window.Padroes.fill(fornEl, "fornecedor");
        }).catch(function () {});
      }

      sb.rpc("list_accounts").then(function (res) {
        if (res.error) {
          equipeTabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + "). Execute supabase/auditoria-perfis.sql.</p>";
          fornTabela.innerHTML = "";
          return;
        }
        contas = res.data || [];
        var equipe = contas.filter(function (c) { return AccessControl.isFull(c.role); });
        var forns = contas.filter(function (c) { return AccessControl.isFornecedor(c.role); });
        var orfas = contas.filter(function (c) { return !c.role; });

        equipeCount.textContent = countText(equipe); fornCount.textContent = countText(forns);
        equipeTabela.innerHTML = equipe.length ? tabelaContas(equipe, null) : vazio("Nenhuma conta com acesso completo");
        fornTabela.innerHTML = forns.length ? tabelaContas(forns, "fornecedor") : vazio("Nenhuma conta de fornecedor");
        orfSection.hidden = !orfas.length;
        if (orfas.length) orfTabela.innerHTML = tabelaContas(orfas, null);
      });
    }

    function startEdit(c) {
      editingId = c.id;
      papelEl.value = c.role === "admin" ? "editor" : (c.role || "fornecedor");
      nomeEl.value = c.nome || "";
      if (window.Padroes) {
        window.Padroes.fill(fornEl, "fornecedor", c.fornecedor || "");
      }
      emailEl.value = c.email || ""; senhaEl.value = "";
      syncLinkedFields();
      formTitle.textContent = "Editar conta"; submitBtn.textContent = "Salvar alterações"; cancelBtn.hidden = false;
      showFormMsg("Editando " + c.email + ". Deixe a senha em branco para manter a atual.");
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function cancelEdit() {
      editingId = null; form.reset(); syncLinkedFields();
      formTitle.textContent = "Nova conta"; submitBtn.textContent = "Criar conta"; cancelBtn.hidden = true; showFormMsg("");
    }
    function bodyFromForm() {
      var role = papelEl.value;
      return {
        email: emailEl.value.trim(), password: senhaEl.value, role: role, nome: nomeEl.value.trim(),
        fornecedor: role === "fornecedor" ? fornEl.value.trim() : null,
        fiscal: null
      };
    }
    function validate(body, creating) {
      if (body.role === "fornecedor" && !body.fornecedor) return "Informe o nome do fornecedor.";
      if (creating && (!body.email || !body.password)) return "Informe e-mail e senha.";
      if (body.password && body.password.length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
      return null;
    }
    function submeter() {
      var body = bodyFromForm();
      var validation = validate(body, !editingId);
      if (validation) { showFormMsg(validation, false); return; }
      submitBtn.disabled = true;
      if (editingId) {
        var patch = { action: "update", id: editingId, role: body.role, nome: body.nome, fornecedor: body.fornecedor, fiscal: body.fiscal };
        if (body.email) patch.email = body.email;
        if (body.password) patch.password = body.password;
        showFormMsg("Salvando…");
        sb.functions.invoke("manage-account", { body: patch }).then(function (res) {
          submitBtn.disabled = false;
          if (res.error) { fnError(res, "Erro ao salvar: "); return; }
          cancelEdit(); showFormMsg("Conta atualizada!", true); render();
        });
        return;
      }
      showFormMsg("Criando…");
      sb.functions.invoke("create-account", { body: body }).then(function (res) {
        submitBtn.disabled = false;
        if (res.error) { fnError(res, "Erro: "); return; }
        form.reset(); syncLinkedFields(); showFormMsg("Conta criada!", true); render();
      });
    }
    function excluir(c) {
      sb.auth.getUser().then(function (res) {
        var me = res.data ? res.data.user : null;
        if (me && me.id === c.id) { window.alert("Você não pode excluir a própria conta."); return; }
        if (!window.confirm("Excluir a conta " + c.email + "? O login deixa de funcionar e os históricos serão preservados.")) return;
        sb.functions.invoke("manage-account", { body: { action: "delete", id: c.id } }).then(function (out) {
          if (out.error) { fnError(out, "Erro ao excluir: "); return; }
          if (editingId === c.id) cancelEdit(); showFormMsg("Conta excluída.", true); render();
        });
      });
    }
    function onTabelaClick(e) {
      var edit = e.target.closest(".conta-edit"), del = e.target.closest(".conta-del");
      if (!edit && !del) return;
      var id = (edit || del).getAttribute("data-id");
      var account = contas.filter(function (item) { return item.id === id; })[0];
      if (!account) return;
      if (edit) startEdit(account); else excluir(account);
    }
    function syncLinkedFields() {
      if (fornField) fornField.hidden = papelEl.value !== "fornecedor";
    }
    function wire() {
      if (wired) return;
      grab();
      if (refreshBtn) refreshBtn.addEventListener("click", render);
      if (form) {
        form.addEventListener("submit", function (e) { e.preventDefault(); submeter(); });
        papelEl.addEventListener("change", syncLinkedFields); cancelBtn.addEventListener("click", cancelEdit); syncLinkedFields();
      }
      [equipeTabela, fornTabela, orfTabela].forEach(function (table) { if (table) table.addEventListener("click", onTabelaClick); });
      wired = true;
    }
    return { render: function () { wire(); render(); } };
  })();

  window.ContasUI = ContasUI;
})();
