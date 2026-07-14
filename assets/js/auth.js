/* =====================================================================
   AUTENTICAÇÃO — porta de entrada do site (Supabase Auth + perfis).
   Dois cards (Administrador e Fornecedor) na mesma tela. Cada card só
   deixa entrar quem tem o perfil correspondente na tabela profiles.
   ===================================================================== */
(function () {
  "use strict";

  var sb = window.sbClient;
  var body = document.body;
  var userChip = document.getElementById("user-chip");
  var forms = document.querySelectorAll(".auth__card form");

  var LABEL = { admin: "administrador", fornecedor: "fornecedor" };

  function showMsg(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }
  function clearMsgs() {
    var all = document.querySelectorAll(".auth__msg");
    for (var i = 0; i < all.length; i++) {
      all[i].textContent = "";
      all[i].classList.remove("is-error");
    }
  }

  if (!sb) {
    body.classList.remove("auth-loading");
    showMsg(document.querySelector(".auth__msg"), "Não foi possível conectar ao servidor. Recarregue a página.", true);
    return;
  }

  function showLogin() {
    body.classList.remove("authed", "role-admin", "role-fornecedor", "auth-loading");
  }

  function showApp(profile) {
    window.currentProfile = profile;
    body.classList.remove("auth-loading");
    body.classList.add("authed");
    body.classList.toggle("role-admin", profile.role === "admin");
    body.classList.toggle("role-fornecedor", profile.role === "fornecedor");

    var papel = profile.role === "admin" ? "Administrador" : "Fornecedor";
    var nome = profile.nome || profile.fornecedor || "";
    if (userChip) userChip.textContent = nome ? nome + " · " + papel : papel;

    var fornNome = document.getElementById("forn-nome");
    if (fornNome) fornNome.textContent = profile.fornecedor || profile.nome || "";

    if (profile.role === "fornecedor" && window.FornecedorUI) window.FornecedorUI.render();
    if (profile.role === "fornecedor" && window.FornComentariosUI) window.FornComentariosUI.render();

    // Recarrega a tela atual: os registros vêm do banco e dependem da sessão.
    if (profile.role === "admin" && window.RouterShow) {
      window.RouterShow((location.hash || "#registros").slice(1));
    }
  }

  /* Resolve a sessão atual. Quando vem de um card (expectedRole/msgEl),
     valida se a conta bate com o card usado. */
  function resolveSession(expectedRole, msgEl) {
    sb.auth.getUser().then(function (res) {
      var user = res.data ? res.data.user : null;
      if (!user) { showLogin(); return; }
      sb.from("profiles")
        .select("role, nome, fornecedor")
        .eq("id", user.id)
        .maybeSingle()
        .then(function (p) {
          if (p.error) {
            console.error("Erro ao carregar perfil:", p.error, "| user id:", user.id);
            showMsg(msgEl, "Erro ao carregar perfil (" + (p.error.code || "?") + "): " + p.error.message, true);
            return;
          }
          if (!p.data) {
            showMsg(msgEl, "Perfil não encontrado (id " + user.id + "). Fale com o administrador.", true);
            return;
          }
          if (expectedRole && p.data.role !== expectedRole) {
            showMsg(msgEl, "Esta conta é de " + LABEL[p.data.role] + ". Use o acesso de " + LABEL[p.data.role] + ".", true);
            sb.auth.signOut();
            return;
          }
          showApp(p.data);
        });
    });
  }

  for (var i = 0; i < forms.length; i++) {
    forms[i].addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.currentTarget;
      var msgEl = form.querySelector(".auth__msg");
      var role = form.getAttribute("data-role");
      var email = form.querySelector('input[type="email"]').value.trim();
      var passEl = form.querySelector('input[type="password"]');
      var btn = form.querySelector('button[type="submit"]');
      clearMsgs();
      btn.disabled = true;
      sb.auth.signInWithPassword({ email: email, password: passEl.value }).then(function (res) {
        btn.disabled = false;
        if (res.error) { showMsg(msgEl, "E-mail ou senha inválidos.", true); return; }
        passEl.value = "";
        resolveSession(role, msgEl);
      });
    });
  }

  var logoutBtns = document.querySelectorAll("[data-logout]");
  for (var j = 0; j < logoutBtns.length; j++) {
    logoutBtns[j].addEventListener("click", function () {
      sb.auth.signOut().then(showLogin);
    });
  }

  // Auto-retoma uma sessão existente (sem card específico).
  resolveSession(null, null);
})();
