/* =====================================================================
   AUTENTICAÇÃO — porta de entrada do site (Supabase Auth + perfis).
   Deslogado: mostra o login. Ao entrar, resolve o papel na tabela
   profiles (admin ou fornecedor) e libera a tela correspondente.
   ===================================================================== */
(function () {
  "use strict";

  var sb = window.sbClient;
  var body = document.body;
  var form = document.getElementById("auth-form");
  var emailEl = document.getElementById("auth-email");
  var passEl = document.getElementById("auth-pass");
  var msg = document.getElementById("auth-msg");
  var submitBtn = document.getElementById("auth-submit");
  var userChip = document.getElementById("user-chip");

  function showMsg(text, isError) {
    msg.textContent = text || "";
    msg.classList.toggle("is-error", !!isError);
  }

  if (!sb) {
    body.classList.remove("auth-loading");
    showMsg("Não foi possível conectar ao servidor. Recarregue a página.", true);
    return;
  }

  function showLogin() {
    body.classList.remove("authed", "role-admin", "role-fornecedor", "auth-loading");
  }

  function showApp(profile) {
    body.classList.remove("auth-loading");
    body.classList.add("authed");
    body.classList.toggle("role-admin", profile.role === "admin");
    body.classList.toggle("role-fornecedor", profile.role === "fornecedor");

    var papel = profile.role === "admin" ? "Administrador" : "Fornecedor";
    var nome = profile.nome || profile.fornecedor || "";
    if (userChip) userChip.textContent = nome ? nome + " · " + papel : papel;

    var fornNome = document.getElementById("forn-nome");
    if (fornNome) fornNome.textContent = profile.fornecedor || profile.nome || "";
  }

  /* Verifica a sessão atual e entra, ou volta para o login. */
  function enter() {
    sb.auth.getUser().then(function (res) {
      var user = res.data ? res.data.user : null;
      if (!user) { showLogin(); return; }
      sb.from("profiles")
        .select("role, nome, fornecedor")
        .eq("id", user.id)
        .single()
        .then(function (p) {
          if (p.error || !p.data) {
            showMsg("Seu usuário não tem um perfil configurado. Fale com o administrador.", true);
            sb.auth.signOut().then(showLogin);
            return;
          }
          showApp(p.data);
        });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showMsg("");
    submitBtn.disabled = true;
    sb.auth
      .signInWithPassword({ email: emailEl.value.trim(), password: passEl.value })
      .then(function (res) {
        submitBtn.disabled = false;
        if (res.error) { showMsg("E-mail ou senha inválidos.", true); return; }
        passEl.value = "";
        enter();
      });
  });

  var logoutBtns = document.querySelectorAll("[data-logout]");
  for (var i = 0; i < logoutBtns.length; i++) {
    logoutBtns[i].addEventListener("click", function () {
      sb.auth.signOut().then(showLogin);
    });
  }

  enter();
})();
