/* =====================================================================
   AUTENTICACAO - Equipe/Fiscal e Fornecedor usando Supabase Auth.
   O primeiro card aceita Editor, Coordenador, Analista e Fiscal/Inspetor.
   ===================================================================== */
(function () {
  "use strict";

  var sb = window.sbClient;
  var access = window.AccessControl;
  var body = document.body;
  var userChip = document.getElementById("user-chip");
  var forms = document.querySelectorAll(".auth__card form");

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
    body.classList.remove("authed", "role-admin", "role-editor", "role-coordenador", "role-analista", "role-fiscal", "role-fornecedor", "auth-loading");
    window.currentProfile = null;
  }

  function showApp(profile) {
    window.currentProfile = profile;
    body.classList.remove("auth-loading");
    body.classList.add("authed");
    ["admin", "editor", "coordenador", "analista", "fiscal", "fornecedor"].forEach(function (role) {
      body.classList.toggle("role-" + role, profile.role === role);
    });

    var papel = access ? access.label(profile.role) : profile.role;
    var nome = profile.nome || profile.fiscal || profile.fornecedor || "";
    if (userChip) userChip.textContent = nome ? nome + " · " + papel : papel;

    var fornNome = document.getElementById("forn-nome");
    if (fornNome) fornNome.textContent = profile.fornecedor || profile.nome || "";

    if (access && access.isFornecedor(profile.role)) {
      if (window.FornecedorUI) window.FornecedorUI.render();
      if (window.FornComentariosUI) window.FornComentariosUI.render();
      return;
    }

    if (window.RouterShow) window.RouterShow((location.hash || "#registros").slice(1));
  }

  function matchesCard(profileRole, expectedAccess) {
    if (!expectedAccess) return true;
    if (expectedAccess === "fornecedor") return access ? access.isFornecedor(profileRole) : profileRole === "fornecedor";
    return access ? access.isTeam(profileRole) : profileRole !== "fornecedor";
  }

  /* Resolve a sessao atual. Quando vem de um card, valida se a conta pode
     entrar por aquele tipo de acesso. */
  function resolveSession(expectedAccess, msgEl) {
    sb.auth.getUser().then(function (res) {
      var user = res.data ? res.data.user : null;
      if (!user) { showLogin(); return; }
      sb.from("profiles")
        .select("role, nome, fornecedor, fiscal")
        .eq("id", user.id)
        .maybeSingle()
        .then(function (p) {
          if (p.error) {
            console.error("Erro ao carregar perfil:", p.error, "| user id:", user.id);
            showMsg(msgEl, "Erro ao carregar perfil (" + (p.error.code || "?") + "): " + p.error.message, true);
            return;
          }
          if (!p.data) {
            showMsg(msgEl, "Perfil não encontrado. Fale com um Editor, Coordenador ou Analista.", true);
            return;
          }
          if (!matchesCard(p.data.role, expectedAccess)) {
            showMsg(msgEl, "Esta conta é de " + (access ? access.label(p.data.role) : p.data.role) + ". Use o acesso correto.", true);
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
      var expectedAccess = form.getAttribute("data-access");
      var email = form.querySelector('input[type="email"]').value.trim();
      var passEl = form.querySelector('input[type="password"]');
      var btn = form.querySelector('button[type="submit"]');
      clearMsgs();
      btn.disabled = true;
      sb.auth.signInWithPassword({ email: email, password: passEl.value }).then(function (res) {
        btn.disabled = false;
        if (res.error) { showMsg(msgEl, "E-mail ou senha inválidos.", true); return; }
        passEl.value = "";
        resolveSession(expectedAccess, msgEl);
      });
    });
  }

  var logoutBtns = document.querySelectorAll("[data-logout]");
  for (var j = 0; j < logoutBtns.length; j++) {
    logoutBtns[j].addEventListener("click", function () { sb.auth.signOut().then(showLogin); });
  }

  resolveSession(null, null);
})();
