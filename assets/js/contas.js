/* =====================================================================
   CONTAS — página do administrador com todas as contas do site,
   separadas em Administradores e Fornecedores. Os dados vêm da função
   admin_list_accounts() no Supabase (só retorna linhas para admins).
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
    var form, formMsg, papelEl, nomeEl, fornEl, fornField, emailEl, senhaEl;

    function grab() {
      admTabela = document.getElementById("contas-admin-tabela");
      admCount = document.getElementById("contas-admin-count");
      fornTabela = document.getElementById("contas-forn-tabela");
      fornCount = document.getElementById("contas-forn-count");
      orfSection = document.getElementById("contas-orfas");
      orfTabela = document.getElementById("contas-orfas-tabela");
      refreshBtn = document.getElementById("contas-refresh");
      form = document.getElementById("conta-form");
      formMsg = document.getElementById("conta-msg");
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

    function vazio(texto) {
      return '<div class="empty"><div class="empty__title">' + texto + "</div></div>";
    }

    function tabelaContas(list, comFornecedor) {
      var head = "<thead><tr>" +
        '<th class="col-text">Nome</th>' +
        (comFornecedor ? '<th class="col-text">Fornecedor</th>' : "") +
        '<th class="col-text">E-mail</th>' +
        "<th>Criada em</th><th>Último acesso</th></tr></thead>";
      var rows = list.map(function (c) {
        return "<tr>" +
          '<td class="col-text cell-pedido">' + esc(c.nome || "—") + "</td>" +
          (comFornecedor ? '<td class="col-text">' + esc(c.fornecedor || "—") + "</td>" : "") +
          '<td class="col-text">' + esc(c.email) + "</td>" +
          "<td>" + dt(c.created_at) + "</td>" +
          "<td>" + dt(c.last_sign_in_at) + "</td>" +
          "</tr>";
      }).join("");
      return '<div class="table-wrap"><table class="tabela tabela--slim">' + head + "<tbody>" + rows + "</tbody></table></div>";
    }

    function render() {
      if (!admTabela) grab();
      if (!admTabela) return;
      if (!sb) { admTabela.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>'; return; }

      sb.rpc("admin_list_accounts").then(function (res) {
        if (res.error) {
          admTabela.innerHTML = '<p class="card__hint">Não foi possível carregar (' + esc(res.error.message) + "). Confira se o SQL supabase/contas.sql foi executado.</p>";
          fornTabela.innerHTML = "";
          return;
        }
        var todos = res.data || [];
        var admins = todos.filter(function (c) { return c.role === "admin"; });
        var forns = todos.filter(function (c) { return c.role === "fornecedor"; });
        var orfas = todos.filter(function (c) { return !c.role; });

        admCount.textContent = admins.length === 1 ? "1 conta." : admins.length + " contas.";
        fornCount.textContent = forns.length === 1 ? "1 conta." : forns.length + " contas.";

        admTabela.innerHTML = admins.length ? tabelaContas(admins, false) : vazio("Nenhuma conta de administrador");
        fornTabela.innerHTML = forns.length ? tabelaContas(forns, true) : vazio("Nenhuma conta de fornecedor");

        orfSection.hidden = !orfas.length;
        if (orfas.length) orfTabela.innerHTML = tabelaContas(orfas, false);
      });
    }

    function criarConta() {
      var role = papelEl.value;
      var body = {
        email: emailEl.value.trim(),
        password: senhaEl.value,
        role: role,
        nome: nomeEl.value.trim(),
        fornecedor: role === "fornecedor" ? fornEl.value.trim() : null
      };
      if (!body.email || !body.password) { showFormMsg("Informe e-mail e senha.", false); return; }
      if (body.password.length < 6) { showFormMsg("A senha precisa ter pelo menos 6 caracteres.", false); return; }
      if (role === "fornecedor" && !body.fornecedor) { showFormMsg("Informe o nome do fornecedor.", false); return; }

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      showFormMsg("Criando conta…");
      sb.functions.invoke("create-account", { body: body }).then(function (res) {
        btn.disabled = false;
        if (res.error) {
          // Tenta ler a mensagem detalhada devolvida pela função.
          var ctx = res.error.context;
          if (ctx && typeof ctx.json === "function") {
            ctx.json().then(function (b) {
              showFormMsg("Erro: " + (b && b.error ? b.error : res.error.message), false);
            }).catch(function () { showFormMsg("Erro: " + res.error.message, false); });
          } else {
            showFormMsg("Erro: " + res.error.message, false);
          }
          return;
        }
        form.reset();
        syncFornField();
        showFormMsg("Conta criada!", true);
        render();
      });
    }

    function syncFornField() {
      if (fornField) fornField.hidden = papelEl.value !== "fornecedor";
    }

    function wire() {
      if (wired) return;
      grab();
      if (refreshBtn) refreshBtn.addEventListener("click", render);
      if (form) {
        form.addEventListener("submit", function (e) { e.preventDefault(); criarConta(); });
        papelEl.addEventListener("change", syncFornField);
        syncFornField();
      }
      wired = true;
    }

    return { render: function () { wire(); render(); } };
  })();

  window.ContasUI = ContasUI;
})();
