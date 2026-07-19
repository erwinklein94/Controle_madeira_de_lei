/* =====================================================================
   TEMA — alterna claro/escuro (padrão claro). A escolha fica salva no
   navegador (preferência de exibição por dispositivo). O tema já é
   aplicado no <head> para não piscar; aqui apenas sincronizamos o botão
   e avisamos os gráficos.
   ===================================================================== */
(function () {
  "use strict";

  var STORAGE = "rumo-tema";
  var btn = document.getElementById("btn-tema");
  var ico = document.getElementById("tema-ico");
  var txt = document.getElementById("tema-txt");

  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }

  function syncBtn() {
    var dark = isDark();
    var iconUse = ico ? ico.querySelector("use") : null;
    if (iconUse) iconUse.setAttribute("href", "assets/img/rumo-icons.svg#" + (dark ? "icon-moon" : "icon-sun"));
    // Mostra o tema atual (não o alvo).
    if (txt) txt.textContent = dark ? "Tema escuro" : "Tema claro";
    if (btn) btn.setAttribute("aria-pressed", String(dark));
  }

  function apply(dark) {
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem(STORAGE, dark ? "dark" : "light"); } catch (e) {}
    syncBtn();
    // Redesenha os gráficos com as cores do tema.
    if (window.DashboardUI && window.DashboardUI.onThemeChange) window.DashboardUI.onThemeChange();
  }

  if (btn) {
    btn.addEventListener("click", function () { apply(!isDark()); });
  }
  syncBtn();
})();
