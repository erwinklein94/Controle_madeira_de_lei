/* =====================================================================
   EXPORTAÇÃO PDF - resumo compacto da página e até quatro gráficos/página.
   Disponível apenas para a equipe nas páginas que possuem gráficos.
   ===================================================================== */
(function () {
  "use strict";

  var button = document.getElementById("btn-export-pdf");
  var label = button ? button.querySelector(".pdf-export-label") : null;
  var main = document.querySelector(".main");
  var syncTimer = null;

  if (!button || !main) return;

  function clean(value) {
    return String(value || "")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\u00b7/g, " - ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function visible(element) {
    if (!element || element.hidden) return false;
    var style = getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 20 && rect.height > 20;
  }

  function activeView() {
    var views = main.querySelectorAll(".view");
    for (var i = 0; i < views.length; i++) {
      if (!views[i].hidden && getComputedStyle(views[i]).display !== "none") return views[i];
    }
    return null;
  }

  function isSupplier() {
    var role = window.currentProfile ? window.currentProfile.role : null;
    return !!(window.AccessControl && window.AccessControl.isFornecedor(role));
  }

  function chartCanvases(view) {
    if (!view) return [];
    return Array.prototype.filter.call(view.querySelectorAll("canvas"), visible);
  }

  function hasExportableCharts(view) {
    return !!(view && view.querySelector("canvas, .funnel-card, .report-order-chart, .report-chart"));
  }

  function syncButton() {
    var available = !isSupplier() && hasExportableCharts(activeView());
    button.hidden = !available;
    button.disabled = !available;
  }

  function pageTitle(view) {
    var title = view && view.querySelector(".page-head h1");
    return clean(title ? title.textContent : "Relatório operacional");
  }

  function collectFilters(view) {
    var values = [];
    var fields = view.querySelectorAll(".filters__field");
    Array.prototype.forEach.call(fields, function (field) {
      var labelEl = field.querySelector("label");
      var input = field.querySelector("select, input");
      if (!labelEl || !input || !input.value) return;
      var value = input.tagName === "SELECT" && input.options[input.selectedIndex]
        ? input.options[input.selectedIndex].text
        : input.value;
      if (!value || /^(todos|todas)$/i.test(clean(value))) return;
      values.push(clean(labelEl.textContent) + ": " + clean(value));
    });

    var weeks = view.querySelectorAll(".report-week-input");
    Array.prototype.forEach.call(weeks, function (input) {
      if (!input.value) return;
      var fiscal = input.closest(".report-fiscal");
      var name = fiscal ? fiscal.querySelector(".report-fiscal__head h2") : null;
      values.push((name ? clean(name.textContent) + " - " : "") + "Semana: " + input.value);
    });
    return values;
  }

  function collectKpis(view) {
    var list = [];
    var elements = view.querySelectorAll(".kpi, .report-kpi");
    Array.prototype.forEach.call(elements, function (item) {
      if (!visible(item)) return;
      var labelEl = item.querySelector(".kpi__label") || item.querySelector("span");
      var valueEl = item.querySelector(".kpi__value") || item.querySelector("strong");
      var footEl = item.querySelector(".kpi__foot") || item.querySelector("small");
      if (!labelEl || !valueEl) return;
      var prefix = "";
      var fiscal = item.closest(".report-fiscal");
      var fiscalName = fiscal ? fiscal.querySelector(".report-fiscal__head h2") : null;
      if (fiscalName) prefix = clean(fiscalName.textContent) + " - ";
      list.push({
        label: prefix + clean(labelEl.textContent),
        value: clean(valueEl.textContent),
        foot: clean(footEl ? footEl.textContent : "")
      });
    });
    return list;
  }

  function chartTitle(canvas, index) {
    var fiscal = canvas.closest(".report-fiscal");
    var fiscalTitle = fiscal ? fiscal.querySelector(".report-fiscal__head h2") : null;
    var section = canvas.closest(".report-order-progress, .report-dashboard, .card");
    var heading = section ? section.querySelector(".card__title, h3, h2") : null;
    var title = heading ? clean(heading.textContent) : "Gráfico " + (index + 1);
    return fiscalTitle ? clean(fiscalTitle.textContent) + " - " + title : title;
  }

  function canvasImage(canvas) {
    var sourceW = canvas.width || Math.round(canvas.getBoundingClientRect().width);
    var sourceH = canvas.height || Math.round(canvas.getBoundingClientRect().height);
    if (!sourceW || !sourceH) return null;

    var maxWidth = 1500;
    var scale = Math.min(1, maxWidth / sourceW);
    var copy = document.createElement("canvas");
    copy.width = Math.max(1, Math.round(sourceW * scale));
    copy.height = Math.max(1, Math.round(sourceH * scale));
    var context = copy.getContext("2d");
    var surface = canvas.closest(".card, .report-order-progress, .report-dashboard") || canvas.parentElement;
    var background = surface ? getComputedStyle(surface).backgroundColor : "#ffffff";
    if (!background || background === "rgba(0, 0, 0, 0)" || background === "transparent") background = "#ffffff";
    context.fillStyle = background;
    context.fillRect(0, 0, copy.width, copy.height);
    context.drawImage(canvas, 0, 0, copy.width, copy.height);
    return {
      data: copy.toDataURL("image/jpeg", 0.9),
      ratio: copy.width / copy.height
    };
  }

  function funnelData(view) {
    var funnel = view.querySelector(".funnel-card .funnel");
    if (!visible(funnel)) return null;
    var rows = [];
    Array.prototype.forEach.call(funnel.querySelectorAll(".funnel__row"), function (row) {
      var name = row.querySelector(".funnel__name");
      var value = row.querySelector(".funnel__value");
      var percent = value ? value.querySelector(".pct") : null;
      var track = row.querySelector(".funnel__track");
      var bar = row.querySelector(".funnel__bar");
      var ratio = 0;
      if (track && bar && track.getBoundingClientRect().width) {
        ratio = Math.min(1, bar.getBoundingClientRect().width / track.getBoundingClientRect().width);
      }
      var valueText = clean(value ? value.textContent : "");
      if (percent) {
        valueText = clean(valueText.replace(clean(percent.textContent), "")) + " (" + clean(percent.textContent) + ")";
      }
      rows.push({ name: clean(name ? name.childNodes[0].textContent : "Etapa"), value: valueText, ratio: ratio });
    });
    return rows.length ? rows : null;
  }

  function safeFileName(title) {
    return clean(title).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  function nextPaint() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  }

  async function create(options) {
    options = options || {};
    if (isSupplier()) throw new Error("Exportação em PDF não disponível para fornecedor.");
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("A biblioteca de PDF não carregou. Verifique a conexão e tente novamente.");

    var view = activeView();
    if (!view || !hasExportableCharts(view)) throw new Error("Esta página não possui gráficos para exportar.");
    await nextPaint();

    var JsPDF = window.jspdf.jsPDF;
    var doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    var width = doc.internal.pageSize.getWidth();
    var height = doc.internal.pageSize.getHeight();
    var margin = 10;
    var gap = 6;
    var blockColumns = 3;
    var columnWidth = (width - margin * 2 - gap * (blockColumns - 1)) / blockColumns;
    var blockHeight = 67;
    var title = pageTitle(view);
    var generatedAt = new Date();
    var page = 1;
    var y = 25;
    var column = 0;

    doc.setProperties({ title: title, subject: "Controle de Inspeção e Transporte", author: "Rumo" });

    function canvasBand(kind, pageNumber, totalPages) {
      var canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = kind === "header" ? 116 : 58;
      var context = canvas.getContext("2d");
      context.textBaseline = "middle";
      if (kind === "header") {
        context.fillStyle = "#003865";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#7fe06c";
        context.font = "700 34px Arial, sans-serif";
        context.fillText("rumo", 60, 60);
        context.fillStyle = "#ffffff";
        context.font = "700 27px Arial, sans-serif";
        context.fillText(title, 190, 60);
        context.font = "400 17px Arial, sans-serif";
        context.textAlign = "right";
        context.fillText(generatedAt.toLocaleString("pt-BR"), canvas.width - 60, 60);
      } else {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = "#d3dee4";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(60, 4);
        context.lineTo(canvas.width - 60, 4);
        context.stroke();
        context.fillStyle = "#647680";
        context.font = "400 15px Arial, sans-serif";
        context.textAlign = "left";
        context.fillText("Controle de Inspeção e Transporte", 60, 35);
        context.textAlign = "right";
        context.fillText("Página " + pageNumber + (totalPages ? " de " + totalPages : ""), canvas.width - 60, 35);
      }
      return canvas.toDataURL("image/png");
    }

    function addPageBands(pageNumber) {
      if (pageNumber !== 1) return;
      doc.addImage(canvasBand("header", pageNumber, null), "PNG", 0, 0, width, 19, "pdf-header-" + pageNumber, "FAST");
      doc.addImage(canvasBand("footer", pageNumber, null), "PNG", 0, height - 11, width, 11, "pdf-footer-" + pageNumber, "FAST");
    }

    function newPage() {
      doc.addPage("a4", "landscape");
      page += 1;
      y = 12;
      column = 0;
      addPageBands(page);
    }

    function ensureRow() {
      if (column === 0 && y + blockHeight > height - 13) newPage();
    }

    function finishBlock() {
      column += 1;
      if (column >= blockColumns) {
        column = 0;
        y += blockHeight + gap;
      }
    }

    function blockPosition() {
      ensureRow();
      return { x: margin + column * (columnWidth + gap), y: y };
    }

    function blockFrame(position, blockTitle) {
      doc.setFillColor(248, 250, 251);
      doc.setDrawColor(211, 222, 228);
      doc.roundedRect(position.x, position.y, columnWidth, blockHeight, 2, 2, "FD");
      doc.setFillColor(50, 166, 230);
      doc.rect(position.x, position.y, columnWidth, 2, "F");
      doc.setTextColor(0, 56, 101);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      var lines = doc.splitTextToSize(blockTitle, columnWidth - 8);
      doc.text(lines.slice(0, 2), position.x + 4, position.y + 7);
      return position.y + (lines.length > 1 ? 14 : 11);
    }

    function drawChart(canvas, index) {
      var image = canvasImage(canvas);
      if (!image) return;
      var position = blockPosition();
      var imageY = blockFrame(position, chartTitle(canvas, index));
      var availableW = columnWidth - 8;
      var availableH = position.y + blockHeight - imageY - 4;
      var imageW = availableW;
      var imageH = imageW / image.ratio;
      if (imageH > availableH) {
        imageH = availableH;
        imageW = imageH * image.ratio;
      }
      doc.addImage(image.data, "JPEG", position.x + (columnWidth - imageW) / 2, imageY, imageW, imageH, undefined, "FAST");
      finishBlock();
    }

    function drawFunnel(rows) {
      var position = blockPosition();
      var contentY = blockFrame(position, "Funil de volume");
      var labelWidth = 34;
      var barX = position.x + 39;
      var maxBarWidth = columnWidth - 47;
      var rowHeight = Math.min(7, (position.y + blockHeight - contentY - 3) / rows.length);
      rows.forEach(function (row, index) {
        var rowY = contentY + index * rowHeight;
        doc.setTextColor(55, 75, 88);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text(doc.splitTextToSize(row.name, labelWidth)[0], position.x + 4, rowY + 3.7);
        doc.setFillColor(227, 234, 238);
        doc.roundedRect(barX, rowY, maxBarWidth, 4.5, 1, 1, "F");
        doc.setFillColor(index < 4 ? 50 : 30, index < 4 ? 166 : 159, index < 4 ? 230 : 127);
        doc.roundedRect(barX, rowY, Math.max(2, maxBarWidth * row.ratio), 4.5, 1, 1, "F");
        doc.setTextColor(0, 56, 101);
        doc.setFont("helvetica", "bold");
        doc.text(row.value, position.x + columnWidth - 4, rowY + 3.7, { align: "right" });
      });
      finishBlock();
    }

    addPageBands(page);

    var filters = collectFilters(view);
    if (filters.length) {
      doc.setTextColor(75, 95, 107);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      var filterLines = doc.splitTextToSize("Filtros: " + filters.join(" | "), width - margin * 2);
      doc.text(filterLines.slice(0, 2), margin, y);
      y += Math.min(2, filterLines.length) * 4 + 2;
    }

    var kpis = collectKpis(view);
    if (kpis.length) {
      var shownKpis = kpis.slice(0, 18);
      var kpiColumns = 6;
      var kpiGap = 3;
      var kpiWidth = (width - margin * 2 - kpiGap * (kpiColumns - 1)) / kpiColumns;
      var kpiHeight = 15;
      shownKpis.forEach(function (kpi, index) {
        var col = index % kpiColumns;
        var row = Math.floor(index / kpiColumns);
        var x = margin + col * (kpiWidth + kpiGap);
        var top = y + row * (kpiHeight + kpiGap);
        doc.setFillColor(248, 250, 251);
        doc.setDrawColor(211, 222, 228);
        doc.roundedRect(x, top, kpiWidth, kpiHeight, 1.5, 1.5, "FD");
        doc.setTextColor(75, 95, 107);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.8);
        doc.text(doc.splitTextToSize(kpi.label, kpiWidth - 5)[0], x + 2.5, top + 4);
        doc.setTextColor(0, 56, 101);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(doc.splitTextToSize(kpi.value, kpiWidth - 5)[0], x + 2.5, top + 9.5);
        if (kpi.foot) {
          doc.setTextColor(100, 118, 128);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.2);
          doc.text(doc.splitTextToSize(kpi.foot, kpiWidth - 5)[0], x + 2.5, top + 13);
        }
      });
      y += Math.ceil(shownKpis.length / kpiColumns) * (kpiHeight + kpiGap) + 2;
    }

    var funnel = funnelData(view);
    if (funnel) drawFunnel(funnel);

    chartCanvases(view).forEach(drawChart);
    if (column !== 0) {
      column = 0;
      y += blockHeight + gap;
    }

    if (options.save !== false) {
      doc.save((safeFileName(title) || "relatorio") + "-" + generatedAt.toISOString().slice(0, 10) + ".pdf");
    }
    return doc;
  }

  function setLoading(loading) {
    button.disabled = loading;
    button.classList.toggle("is-loading", loading);
    if (label) label.textContent = loading ? "Gerando PDF..." : "Exportar PDF";
  }

  button.addEventListener("click", function () {
    setLoading(true);
    create().catch(function (error) {
      console.error("Falha ao exportar PDF:", error);
      window.alert(error && error.message ? error.message : "Não foi possível gerar o PDF.");
    }).finally(function () {
      setLoading(false);
      syncButton();
    });
  });

  function scheduleSync() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncButton, 60);
  }

  window.addEventListener("hashchange", scheduleSync);
  new MutationObserver(scheduleSync).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(scheduleSync).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  window.PDFExport = { create: create, sync: syncButton };
  syncButton();
})();
