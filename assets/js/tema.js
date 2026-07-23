/* =====================================================================
   TEMA — alterna claro/escuro (padrão claro). A escolha fica salva no
   navegador (preferência de exibição por dispositivo). O tema já é
   aplicado no <head> para não piscar; aqui apenas sincronizamos o botão
   e avisamos os gráficos.
   ===================================================================== */
(function () {
  "use strict";

  var STORAGE = "rumo-tema";
  var controls = [
    {
      btn: document.getElementById("btn-tema"),
      ico: document.getElementById("tema-ico"),
      txt: document.getElementById("tema-txt")
    },
    {
      btn: document.getElementById("btn-presentation-theme"),
      ico: document.getElementById("presentation-tema-ico"),
      txt: document.getElementById("presentation-tema-txt")
    }
  ];

  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }

  function syncBtn() {
    var dark = isDark();
    controls.forEach(function (control) {
      var iconUse = control.ico ? control.ico.querySelector("use") : null;
      if (iconUse) iconUse.setAttribute("href", "assets/img/rumo-icons.svg#" + (dark ? "icon-moon" : "icon-sun"));
      // Mostra o tema atual (não o alvo).
      if (control.txt) control.txt.textContent = dark ? "Tema escuro" : "Tema claro";
      if (control.btn) control.btn.setAttribute("aria-pressed", String(dark));
    });
  }

  function apply(dark) {
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem(STORAGE, dark ? "dark" : "light"); } catch (e) {}
    syncBtn();
    // Redesenha os gráficos com as cores do tema.
    if (window.DashboardUI && window.DashboardUI.onThemeChange) window.DashboardUI.onThemeChange();
    if (window.PedidosUI && window.PedidosUI.redraw) window.PedidosUI.redraw();
  }

  controls.forEach(function (control) {
    if (control.btn) control.btn.addEventListener("click", function () { apply(!isDark()); });
  });
  syncBtn();
})();
