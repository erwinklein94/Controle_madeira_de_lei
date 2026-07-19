/* =====================================================================
   MODO APRESENTAÇÃO — tela cheia nativa com fallback imersivo para iPhone.
   Disponível somente quando a página ativa contém gráficos.
   ===================================================================== */
(function () {
  "use strict";

  var button = document.getElementById("btn-presentation");
  var label = button ? button.querySelector(".presentation-label") : null;
  var main = document.querySelector(".main");
  var active = false;
  var wakeLock = null;
  var syncTimer = null;

  if (!button || !main) return;

  function activeView() {
    var views = main.querySelectorAll(".view");
    for (var i = 0; i < views.length; i++) {
      if (!views[i].hidden && getComputedStyle(views[i]).display !== "none") return views[i];
    }
    return null;
  }

  function hasCharts(view) {
    return !!(view && view.querySelector("canvas, .funnel-card, .report-order-chart, .report-chart"));
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function updateButton() {
    var available = hasCharts(activeView());
    button.disabled = !available && !active;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("is-active", active);
    if (label) label.textContent = active ? "Sair da apresentação" : "Modo Apresentação";
    button.title = active
      ? "Sair do modo de apresentação"
      : available
        ? "Exibir os gráficos em tela cheia"
        : "Disponível nas páginas que possuem gráficos";
  }

  function redrawCharts() {
    window.setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
      if (window.DashboardUI && window.DashboardUI.onThemeChange) window.DashboardUI.onThemeChange();
    }, 180);
  }

  function requestWakeLock() {
    if (!active || !navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request("screen").then(function (lock) {
      wakeLock = lock;
      lock.addEventListener("release", function () { if (wakeLock === lock) wakeLock = null; });
    }).catch(function () {});
  }

  function releaseWakeLock() {
    if (!wakeLock || !wakeLock.release) return;
    wakeLock.release().catch(function () {});
    wakeLock = null;
  }

  function setActive(value) {
    active = !!value;
    document.body.classList.toggle("presentation-mode", active);
    updateButton();
    if (active) {
      window.scrollTo(0, 0);
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    redrawCharts();
  }

  function enter() {
    if (!hasCharts(activeView())) return;
    setActive(true);
    var root = document.documentElement;
    var request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) return; // iPhone: o CSS imersivo permanece como fallback.
    try {
      var result = request.call(root);
      if (result && result.catch) result.catch(function () {});
    } catch (e) {}
  }

  function leave(requestNativeExit) {
    setActive(false);
    if (!requestNativeExit || !fullscreenElement()) return;
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) return;
    try {
      var result = exit.call(document);
      if (result && result.catch) result.catch(function () {});
    } catch (e) {}
  }

  function scheduleSync() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(updateButton, 40);
  }

  button.addEventListener("click", function () {
    if (active) leave(true);
    else enter();
  });

  document.addEventListener("fullscreenchange", function () {
    if (active && !fullscreenElement()) setActive(false);
  });
  document.addEventListener("webkitfullscreenchange", function () {
    if (active && !fullscreenElement()) setActive(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && active && !fullscreenElement()) leave(false);
  });
  document.addEventListener("visibilitychange", function () {
    if (active && document.visibilityState === "visible" && !wakeLock) requestWakeLock();
  });
  window.addEventListener("hashchange", function () {
    if (active) leave(true);
    window.setTimeout(updateButton, 60);
  });

  new MutationObserver(scheduleSync).observe(main, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"]
  });
  new MutationObserver(scheduleSync).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"]
  });

  window.PresentationMode = {
    enter: enter,
    exit: function () { leave(true); },
    sync: updateButton,
    isActive: function () { return active; }
  };
  updateButton();
})();
