/* =====================================================================
   Controle de Inspeção e Transporte (Rumo)
   Ordem: (1) Store [dados]  (2) Registros [tela 1]
          (3) Dashboard [tela 2]  (4) Roteador [troca de telas]
   ===================================================================== */

/* =====================================================================
   (1) STORE — camada de dados (schema, localStorage e agregações)
   Não toca no DOM. Exposto como window.Store.
   ===================================================================== */
(function (global) {
  "use strict";

  // Chaves antigas do localStorage: os dados que ainda estiverem nelas são
  // importados para o Supabase uma única vez e as chaves são apagadas.
  var LEGACY_KEYS = ["rumo-inspecao:registros:v3", "rumo-inspecao:registros:v2"];
  var UNIT = ""; // unidade exibida ao lado dos volumes; vazio para não mostrar letra após os números

  var STAGES = [
    { key: "volPedido",       label: "Volume do pedido",        short: "Pedido",        color: "#003865" },
    { key: "volPronto",       label: "Pronto p/ inspeção",      short: "Pronto",        color: "#1F6FA5" },
    { key: "volInspecionado", label: "Inspecionado",            short: "Inspecionado",  color: "#32A6E6" },
    { key: "volLiberado",     label: "Liberado p/ transporte",  short: "Liberado",      color: "#1E9F7F" },
    { key: "volTransportado", label: "Transportado",            short: "Transportado",  color: "#7FE06C" }
  ];

  /* Os registros vivem na tabela "registros" do Supabase. O cache em memória
     mantém a leitura síncrona (getAll) para tabela e gráficos; as escritas
     vão ao banco e devolvem Promises. */
  var cache = [];

  function sb() { return global.sbClient; }

  function fromDb(r) {
    return {
      id: r.id,
      fiscal: r.fiscal || "",
      fornecedor: r.fornecedor || "",
      local: r.local || "",
      pedido: r.pedido || "",
      volPedido: num(r.vol_pedido),
      volPronto: num(r.vol_pronto),
      volInspecionado: num(r.vol_inspecionado),
      volLiberado: num(r.vol_liberado),
      volTransportado: num(r.vol_transportado),
      createdAt: r.created_at
    };
  }

  function toDb(rec) {
    var row = {
      fiscal: rec.fiscal || null,
      fornecedor: rec.fornecedor,
      local: rec.local || null,
      pedido: String(rec.pedido == null ? "" : rec.pedido),
      vol_pedido: num(rec.volPedido),
      vol_pronto: num(rec.volPronto),
      vol_inspecionado: num(rec.volInspecionado),
      vol_liberado: num(rec.volLiberado),
      vol_transportado: num(rec.volTransportado)
    };
    if (rec.createdAt) row.created_at = rec.createdAt;
    return row;
  }

  var PATCH_MAP = {
    fiscal: "fiscal", fornecedor: "fornecedor", local: "local", pedido: "pedido",
    volPedido: "vol_pedido", volPronto: "vol_pronto", volInspecionado: "vol_inspecionado",
    volLiberado: "vol_liberado", volTransportado: "vol_transportado"
  };

  function patchToDb(patch) {
    var row = {};
    Object.keys(PATCH_MAP).forEach(function (k) {
      if (patch[k] !== undefined) row[PATCH_MAP[k]] = k.indexOf("vol") === 0 ? num(patch[k]) : patch[k];
    });
    return row;
  }

  /* Recarrega o cache a partir do banco (e importa o legado do navegador
     uma única vez, quando o banco ainda está vazio). */
  function refresh() {
    if (!sb()) return Promise.resolve(cache);
    return sb().from("registros")
      .select("id, fiscal, fornecedor, local, pedido, vol_pedido, vol_pronto, vol_inspecionado, vol_liberado, vol_transportado, created_at")
      .order("created_at", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        cache = (res.data || []).map(fromDb);
        return migrateLegacy().then(function () { return cache; });
      });
  }

  function migrateLegacy() {
    // Só o admin importa (o fornecedor enxerga o banco parcialmente pelo RLS
    // e poderia concluir errado que ele está vazio).
    var prof = global.currentProfile;
    if (!prof || prof.role !== "admin") return Promise.resolve();

    var locais = [];
    LEGACY_KEYS.forEach(function (key) {
      try {
        var raw = global.localStorage.getItem(key);
        if (raw) {
          var arr = JSON.parse(raw);
          if (Array.isArray(arr)) locais = locais.concat(arr);
        }
      } catch (e) { /* dado corrompido: ignora */ }
    });
    if (!locais.length) return Promise.resolve();

    if (cache.length) {
      // O banco já tem dados: não importa de novo, apenas desativa o legado.
      LEGACY_KEYS.forEach(function (k) { global.localStorage.removeItem(k); });
      return Promise.resolve();
    }

    return sb().from("registros").insert(locais.map(toDb)).select("*").then(function (res) {
      if (res.error) {
        console.error("Falha ao importar registros locais para o Supabase:", res.error.message);
        return;
      }
      cache = (res.data || []).map(fromDb);
      LEGACY_KEYS.forEach(function (k) { global.localStorage.removeItem(k); });
    });
  }

  function getAll() { return cache.slice(); }

  function add(record) {
    return sb().from("registros").insert(toDb(record)).select("*").single().then(function (res) {
      if (res.error) throw res.error;
      var rec = fromDb(res.data);
      cache.push(rec);
      return rec;
    });
  }

  function update(id, patch) {
    return sb().from("registros").update(patchToDb(patch)).eq("id", id).select("*").single().then(function (res) {
      if (res.error) throw res.error;
      var rec = fromDb(res.data);
      cache = cache.map(function (r) { return r.id === id ? rec : r; });
      return rec;
    });
  }

  function remove(id) {
    return sb().from("registros").delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
      cache = cache.filter(function (r) { return r.id !== id; });
      return cache;
    });
  }

  function clear() {
    return sb().from("registros").delete().not("id", "is", null).then(function (res) {
      if (res.error) throw res.error;
      cache = [];
    });
  }

  function count() { return cache.length; }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function sumStage(list, key) {
    return list.reduce(function (acc, r) { return acc + num(r[key]); }, 0);
  }

  function funnelTotals(list) {
    return STAGES.map(function (st) {
      return { key: st.key, label: st.label, short: st.short, color: st.color, total: sumStage(list, st.key) };
    });
  }

  function groupSum(list, field, stageKey) {
    var map = {};
    list.forEach(function (r) {
      var k = r[field] || "—";
      map[k] = (map[k] || 0) + num(r[stageKey]);
    });
    return Object.keys(map)
      .map(function (k) { return { label: k, value: map[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  function pedidoVsTransportado(list, field) {
    var map = {};
    list.forEach(function (r) {
      var k = r[field] || "—";
      if (!map[k]) map[k] = { pedido: 0, transportado: 0 };
      map[k].pedido += num(r.volPedido);
      map[k].transportado += num(r.volTransportado);
    });
    return Object.keys(map)
      .map(function (k) {
        var saldo = Math.max(map[k].pedido - map[k].transportado, 0);
        return { label: k, pedido: map[k].pedido, transportado: map[k].transportado, saldo: saldo };
      })
      .sort(function (a, b) { return b.pedido - a.pedido; });
  }

  function trendByOrder(list) {
    var points = list
      .slice()
      .sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); })
      .map(function (r) {
        var pct = num(r.volPedido) > 0 ? (num(r.volTransportado) / num(r.volPedido)) * 100 : 0;
        return { pedido: r.pedido, date: r.createdAt, pct: Math.round(pct * 10) / 10 };
      });

    var trend = linearTrend(points.map(function (p) { return p.pct; }));
    return { points: points, trendLine: trend.line, slope: trend.slope, direction: trend.direction, delta: trend.delta };
  }

  function cumulativeTransported(list) {
    var sorted = list.slice().sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    var acc = 0;
    return sorted.map(function (r) {
      acc += num(r.volTransportado);
      return { date: r.createdAt, total: acc, label: r.pedido };
    });
  }

  function linearTrend(y) {
    var n = y.length;
    if (n < 2) return { line: y.slice(), slope: 0, direction: "estavel", delta: 0 };
    var sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; }
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    var intercept = (sy - slope * sx) / n;
    var line = y.map(function (_, i) { return Math.round((slope * i + intercept) * 10) / 10; });
    var delta = Math.round((line[n - 1] - line[0]) * 10) / 10;
    var direction = slope > 0.05 ? "subida" : slope < -0.05 ? "descida" : "estavel";
    return { line: line, slope: slope, direction: direction, delta: delta };
  }

  function kpis(list) {
    var totals = funnelTotals(list);
    var pedido = totals[0].total;
    var transportado = totals[totals.length - 1].total;
    var conclusao = pedido > 0 ? (transportado / pedido) * 100 : 0;

    var gargalo = { label: "—", drop: 0 };
    for (var i = 1; i < totals.length; i++) {
      var prev = totals[i - 1].total;
      var drop = prev > 0 ? (1 - totals[i].total / prev) * 100 : 0;
      if (drop > gargalo.drop) gargalo = { label: totals[i].label, drop: drop };
    }

    return {
      totalPedido: pedido,
      totalTransportado: transportado,
      emAndamento: pedido - transportado,
      conclusao: conclusao,
      gargalo: gargalo,
      registros: list.length,
      fornecedores: distinct(list, "fornecedor").length,
      fiscais: distinct(list, "fiscal").length,
      locais: distinct(list, "local").length
    };
  }

  function distinct(list, field) {
    var seen = {};
    list.forEach(function (r) { if (r[field]) seen[r[field]] = true; });
    return Object.keys(seen);
  }

  global.Store = {
    STAGES: STAGES,
    UNIT: UNIT,
    refresh: refresh,
    getAll: getAll,
    add: add,
    update: update,
    remove: remove,
    clear: clear,
    count: count,
    funnelTotals: funnelTotals,
    groupSum: groupSum,
    pedidoVsTransportado: pedidoVsTransportado,
    trendByOrder: trendByOrder,
    cumulativeTransported: cumulativeTransported,
    kpis: kpis,
    distinct: distinct
  };
})(window);

/* =====================================================================
   (2) REGISTROS — controlador da tela de Registros
   ===================================================================== */
(function () {
  "use strict";

  var fmt = new Intl.NumberFormat("pt-BR");
  var STAGES = Store.STAGES;
  var editingId = null;

  var form = document.getElementById("form-registro");
  var msg = document.getElementById("form-msg");
  var tabelaArea = document.getElementById("tabela-area");
  var contador = document.getElementById("contador");
  var formTitle = document.getElementById("form-title");
  var btnSubmit = document.getElementById("btn-submit");
  var btnCancelEdit = document.getElementById("btn-cancelar-edicao");
  var rfFiscal = document.getElementById("rf-fiscal");
  var rfForn = document.getElementById("rf-fornecedor");
  var rfLocal = document.getElementById("rf-local");
  var rfPedido = document.getElementById("rf-pedido");

  /* ---------- filtros da tabela ---------- */
  function getFiltered() {
    var f1 = rfFiscal.value, f2 = rfForn.value, f3 = rfLocal.value, f4 = rfPedido.value;
    return Store.getAll().filter(function (r) {
      if (f1 && r.fiscal !== f1) return false;
      if (f2 && r.fornecedor !== f2) return false;
      if (f3 && r.local !== f3) return false;
      if (f4 && String(r.pedido) !== f4) return false;
      return true;
    });
  }

  function fillFilter(sel, values) {
    var prev = sel.value;
    sel.innerHTML = '<option value="">Todos</option>';
    values.slice().sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }).forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    if (values.indexOf(prev) >= 0) sel.value = prev;
  }

  [rfFiscal, rfForn, rfLocal, rfPedido].forEach(function (s) { s.addEventListener("change", draw); });
  document.getElementById("rf-limpar").addEventListener("click", function () {
    rfFiscal.value = ""; rfForn.value = ""; rfLocal.value = ""; rfPedido.value = "";
    draw();
  });

  /* ---------- exportação (CSV compatível com Excel pt-BR) ---------- */
  document.getElementById("btn-exportar").addEventListener("click", function () {
    var list = getFiltered();
    if (!list.length) { showMsg("Nada para exportar com os filtros atuais.", false); return; }

    function cel(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    function numBr(v) { return String(Number(v) || 0).replace(".", ","); }

    var header = ["Fiscal", "Fornecedor", "Local", "Pedido"]
      .concat(STAGES.map(function (s) { return s.label; }))
      .concat(["Data de cadastro"]);

    var linhas = list.map(function (r) {
      return [cel(r.fiscal), cel(r.fornecedor), cel(r.local), cel(r.pedido)]
        .concat(STAGES.map(function (s) { return numBr(r[s.key]); }))
        .concat([cel(r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "")])
        .join(";");
    });

    var csv = String.fromCharCode(0xFEFF) + header.map(cel).join(";") + "\r\n" + linhas.join("\r\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "registros-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showMsg(list.length + (list.length === 1 ? " registro exportado." : " registros exportados."), true);
  });

  /* Busca no banco (registros + padronização) e redesenha. */
  function render() {
    var padroes = window.Padroes ? window.Padroes.load().catch(function () { return null; }) : Promise.resolve();
    Promise.all([Store.refresh(), padroes]).then(function () {
      fillFormSelects();
      draw();
    }).catch(function (err) {
      contador.textContent = "";
      tabelaArea.innerHTML = '<p class="card__hint">Não foi possível carregar os registros (' + esc(err.message || err) + ").</p>";
    });
  }

  /* Preenche as listas padronizadas do formulário, preservando a seleção atual. */
  function fillFormSelects() {
    if (!window.Padroes) return;
    ["fiscal", "fornecedor", "local", "pedido"].forEach(function (id) {
      window.Padroes.fill(document.getElementById(id), id);
    });
  }

  /* Redesenha a partir do cache, sem ir ao banco. */
  function draw() {
    var all = Store.getAll();
    fillFilter(rfFiscal, Store.distinct(all, "fiscal"));
    fillFilter(rfForn, Store.distinct(all, "fornecedor"));
    fillFilter(rfLocal, Store.distinct(all, "local"));
    fillFilter(rfPedido, Store.distinct(all, "pedido"));

    var list = getFiltered();
    contador.textContent = all.length
      ? "Mostrando " + list.length + " de " + all.length + (all.length === 1 ? " registro." : " registros.")
      : "Nenhum registro.";

    if (!list.length) {
      tabelaArea.innerHTML = all.length
        ? '<div class="empty"><div class="empty__title">Nenhum registro para os filtros atuais</div>' +
          '<div class="empty__txt">Ajuste ou limpe os filtros acima.</div></div>'
        : '<div class="empty">' +
          '<div class="empty__title">Nenhum registro ainda</div>' +
          '<div class="empty__txt">Adicione um registro no formulário acima para alimentar o dashboard.</div>' +
          "</div>";
      return;
    }

    var head =
      "<thead><tr>" +
      '<th class="col-text">Fiscal</th>' +
      '<th class="col-text">Fornecedor</th>' +
      '<th class="col-text">Local</th>' +
      '<th class="col-text">Pedido</th>' +
      STAGES.map(function (s) { return "<th>" + s.label + "</th>"; }).join("") +
      '<th>Ações</th>' +
      "</tr></thead>";

    var rows = list.map(function (r) {
      var cells = STAGES.map(function (s) {
        return "<td>" + fmt.format(Number(r[s.key]) || 0) + "</td>";
      }).join("");
      return (
        '<tr class="' + (r.id === editingId ? "is-editing" : "") + '">' +
        '<td class="col-text">' + esc(r.fiscal) + "</td>" +
        '<td class="col-text">' + esc(r.fornecedor) + "</td>" +
        '<td class="col-text">' + esc(r.local) + "</td>" +
        '<td class="col-text cell-pedido">' + esc(r.pedido) + "</td>" +
        cells +
        '<td><div class="row-actions">' +
          '<button class="row-edit" data-id="' + r.id + '" type="button" title="Editar" aria-label="Editar registro">Editar</button>' +
          '<button class="row-del" data-id="' + r.id + '" type="button" title="Excluir" aria-label="Excluir registro">✕</button>' +
        '</div></td>' +
        "</tr>"
      );
    }).join("");

    var foot =
      "<tfoot><tr>" +
      '<td class="col-text">Total</td><td></td><td></td><td></td>' +
      STAGES.map(function (s) {
        var t = list.reduce(function (a, r) { return a + (Number(r[s.key]) || 0); }, 0);
        return "<td>" + fmt.format(t) + "</td>";
      }).join("") +
      "<td></td></tr></tfoot>";

    tabelaArea.innerHTML =
      '<div class="table-wrap"><table class="tabela">' + head + "<tbody>" + rows + "</tbody>" + foot + "</table></div>";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearMsg();

    var data = collectFormData();
    if (!data) return;

    btnSubmit.disabled = true;
    if (editingId) {
      Store.update(editingId, data).then(function () {
        btnSubmit.disabled = false;
        showMsg("Registro atualizado.", true);
        stopEditing(true);
        draw();
      }).catch(function (err) {
        btnSubmit.disabled = false;
        showMsg("Erro ao salvar: " + (err.message || err), false);
      });
    } else {
      Store.add(data).then(function () {
        btnSubmit.disabled = false;
        form.reset();
        showMsg("Registro adicionado.", true);
        document.getElementById("fiscal").focus();
        draw();
      }).catch(function (err) {
        btnSubmit.disabled = false;
        showMsg("Erro ao adicionar: " + (err.message || err), false);
      });
    }
  });

  document.getElementById("btn-limpar").addEventListener("click", function () {
    if (!Store.count()) return;
    if (!confirm("Remover todos os registros? Esta ação não pode ser desfeita.")) return;
    Store.clear().then(function () {
      stopEditing(true);
      draw();
      showMsg("Todos os registros foram removidos.", true);
    }).catch(function (err) {
      showMsg("Erro ao remover: " + (err.message || err), false);
    });
  });

  btnCancelEdit.addEventListener("click", function () {
    stopEditing(true);
    draw();
    showMsg("Edição cancelada.", true);
  });

  tabelaArea.addEventListener("click", function (e) {
    var edit = e.target.closest(".row-edit");
    var del = e.target.closest(".row-del");

    if (edit) {
      startEditing(edit.getAttribute("data-id"));
      draw();
      return;
    }

    if (del) {
      var id = del.getAttribute("data-id");
      if (!confirm("Excluir este registro?")) return;
      if (editingId === id) stopEditing(true);
      Store.remove(id).then(draw).catch(function (err) {
        showMsg("Erro ao excluir: " + (err.message || err), false);
      });
    }
  });

  function collectFormData() {
    var data = {
      fiscal: val("fiscal"),
      fornecedor: val("fornecedor"),
      local: val("local"),
      pedido: val("pedido")
    };

    if (!data.fiscal || !data.fornecedor || !data.local || !data.pedido) {
      showMsg("Preencha Fiscal, Fornecedor, Local e Pedido.", false);
      return null;
    }

    var nums = ["volPedido", "volPronto", "volInspecionado", "volLiberado", "volTransportado"];
    for (var i = 0; i < nums.length; i++) {
      var el = document.getElementById(nums[i]);
      var n = parseFloat(el.value);
      if (el.value === "" || isNaN(n) || n < 0) {
        showMsg("Os volumes precisam ser números maiores ou iguais a zero.", false);
        return null;
      }
      data[nums[i]] = n;
    }
    return data;
  }

  function startEditing(id) {
    var rec = Store.getAll().filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    editingId = id;
    // Selects padronizados: garante que o valor do registro apareça mesmo fora do padrão.
    ["fiscal", "fornecedor", "local", "pedido"].forEach(function (campo) {
      var el = document.getElementById(campo);
      if (window.Padroes) window.Padroes.fill(el, campo, rec[campo] || "");
      else el.value = rec[campo] || "";
    });
    STAGES.forEach(function (s) { setVal(s.key, rec[s.key]); });
    formTitle.textContent = "Editar registro";
    btnSubmit.textContent = "Salvar alterações";
    btnCancelEdit.hidden = false;
    clearMsg();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("fiscal").focus();
  }

  function stopEditing(resetForm) {
    editingId = null;
    formTitle.textContent = "Novo registro";
    btnSubmit.textContent = "Adicionar registro";
    btnCancelEdit.hidden = true;
    if (resetForm) form.reset();
  }

  function val(id) { return document.getElementById(id).value.trim(); }
  function setVal(id, value) { document.getElementById(id).value = value == null ? "" : value; }
  function showMsg(text, ok) {
    msg.textContent = text;
    msg.className = "form-msg " + (ok ? "is-ok" : "is-error");
  }
  function clearMsg() { msg.textContent = ""; msg.className = "form-msg"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  window.RegistrosUI = { render: render };
  render();
})();

/* =====================================================================
   (3) DASHBOARD — controlador da tela de Dashboard
   Renderização preguiçosa: só desenha quando a aba é aberta (refresh()).
   ===================================================================== */
(function () {
  "use strict";

  var C = {
    azul: "#003865", azulClaro: "#32A6E6", verde: "#1E9F7F", verdeClaro: "#7FE06C",
    azul2: "#1F6FA5", laranja: "#F78344", amarelo: "#FBD300", cinza: "#BDCCD4",
    texto: "#4D626F", grid: "rgba(0,56,101,0.08)"
  };

  // Cores de eixo/grade/legenda que acompanham o tema (datalabels ficam em
  // pílulas brancas, então mantêm C.texto escuro sempre).
  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function tickColor() { return isDark() ? "#a9bece" : C.texto; }
  function gridColor() { return isDark() ? "rgba(255,255,255,0.10)" : C.grid; }
  function legendInk() { return isDark() ? "#cdddea" : C.texto; }
  var DOUGHNUT = [C.azul, C.azulClaro, C.verde, C.verdeClaro, C.azul2, C.laranja, C.cinza, C.amarelo];

  var fmt = new Intl.NumberFormat("pt-BR");
  var fmtC = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  var fmtDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  var UNIT = Store.UNIT;

  var FUNNEL_TEXT = {
    volPedido: "#fff", volPronto: "#fff", volInspecionado: "#0c2c3f",
    volLiberado: "#fff", volTransportado: "#0c2c3f"
  };
  var CHART_IDS = ["chart-fornecedor", "chart-local", "chart-tendencia", "chart-historico", "chart-ritmo", "chart-conclforn", "chart-entregasped", "chart-entregasforn"];

  var charts = {};
  var modalChart = null;
  var wired = false;
  var defaultsSet = false;
  var els = {};
  var modal = {};

  function grab() {
    els = {
      empty: document.getElementById("empty-state"),
      content: document.getElementById("dash-content"),
      kpi: document.getElementById("kpi-grid"),
      funnel: document.getElementById("funnel"),
      count: document.getElementById("filtro-count"),
      fFiscal: document.getElementById("f-fiscal"),
      fForn: document.getElementById("f-fornecedor"),
      fLocal: document.getElementById("f-local"),
      fPedido: document.getElementById("f-pedido"),
      fLimpar: document.getElementById("f-limpar")
    };

    modal = {
      root: document.getElementById("chart-modal"),
      title: document.getElementById("chart-modal-title"),
      hint: document.getElementById("chart-modal-hint"),
      canvas: document.getElementById("chart-modal-canvas"),
      canvasWrap: document.getElementById("chart-modal-canvas-wrap"),
      funnel: document.getElementById("chart-modal-funnel")
    };
  }

  function setup() {
    if (wired) return;
    grab();
    [els.fFiscal, els.fForn, els.fLocal, els.fPedido].forEach(function (s) { s.addEventListener("change", render); });
    els.fLimpar.addEventListener("click", function () {
      els.fFiscal.value = ""; els.fForn.value = ""; els.fLocal.value = ""; els.fPedido.value = "";
      render();
    });
    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        requestAnimationFrame(function () {
          placeFunnelLabels();
          if (modal.root && !modal.root.hidden && modal.funnel && !modal.funnel.hidden) placeFunnelLabelsIn(modal.funnel);
        });
      }, 120);
    });

    setupChartModal();
    wired = true;
  }

  function setupChartModal() {
    if (!modal.root) return;

    var dashboard = document.getElementById("view-dashboard");
    if (!dashboard) return;

    // Delega o clique ao dashboard inteiro. Isso é mais robusto do que prender
    // o evento em cada card uma única vez e evita falhas quando o layout recarrega.
    dashboard.addEventListener("click", function (e) {
      var card = e.target.closest(".chart-card[data-modal-chart]");
      if (!card || !dashboard.contains(card)) return;
      e.preventDefault();
      openChartModal(card.getAttribute("data-modal-chart"));
    });

    dashboard.addEventListener("keydown", function (e) {
      var card = e.target.closest(".chart-card[data-modal-chart]");
      if (!card || !dashboard.contains(card)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openChartModal(card.getAttribute("data-modal-chart"));
      }
    });

    refreshModalTriggers();

    modal.root.addEventListener("click", function (e) {
      if (e.target.closest("[data-modal-close]")) closeChartModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.root && !modal.root.hidden) closeChartModal();
    });
  }

  function refreshModalTriggers() {
    var cards = document.querySelectorAll("#view-dashboard .chart-card[data-modal-chart]");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var info = getChartInfo(card.getAttribute("data-modal-chart"));
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("title", "Clique para ampliar este gráfico");
      card.setAttribute("aria-label", "Ampliar gráfico " + info.title);
    }
  }

  function getChartInfo(kind) {
    var map = {
      funnel: { title: "Funil de volume", hint: "Do pedido ao transporte, com retenção por etapa." },
      fornecedor: { title: "Volume por fornecedor", hint: "Pedido x transportado, com saldo a transportar." },
      local: { title: "Distribuição por local", hint: "Participação no volume do pedido." },
      tendencia: { title: "Conclusão por Pedido", hint: "Volume, saldo a concluir e % de conclusão por pedido." },
      historico: { title: "Transportado acumulado", hint: "Evolução do total entregue + projeção no ritmo atual." },
      ritmo: { title: "Ritmo de transporte", hint: "Volume transportado por semana." },
      conclforn: { title: "Conclusão por fornecedor", hint: "% do pedido já transportado." },
      entregasped: { title: "Entregas semanais por pedido", hint: "Dormentes entregues por semana, por pedido." },
      entregasforn: { title: "Entregas semanais por fornecedor", hint: "Dormentes entregues por semana, por fornecedor." }
    };
    return map[kind] || { title: "Gráfico", hint: "Visualização expandida." };
  }

  function openChartModal(kind) {
    if (!modal.root) return;

    var info = getChartInfo(kind);
    var list = getFiltered();

    modal.title.textContent = info.title;
    modal.hint.textContent = info.hint + " Os filtros atuais do dashboard foram mantidos.";
    modal.root.hidden = false;
    modal.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (modalChart) {
      modalChart.destroy();
      modalChart = null;
    }

    if (kind === "funnel") {
      modal.canvasWrap.hidden = true;
      modal.funnel.hidden = false;
      renderFunnelInto(modal.funnel, list);
      requestAnimationFrame(function () { placeFunnelLabelsIn(modal.funnel); });
    } else {
      modal.funnel.hidden = true;
      modal.canvasWrap.hidden = false;

      if (!chartsAvailable()) {
        modal.canvasWrap.innerHTML = '<p class="card__hint chart-modal__fallback">A biblioteca de gráficos não carregou. Verifique a conexão e recarregue a página.</p>';
        return;
      }

      if (!modal.canvasWrap.querySelector("canvas")) {
        modal.canvasWrap.innerHTML = '<canvas id="chart-modal-canvas"></canvas>';
        modal.canvas = document.getElementById("chart-modal-canvas");
      }

      ensureDefaults();
      modalChart = new Chart(modal.canvas, buildChartConfig(kind, list, true));
    }

    var closeBtn = modal.root.querySelector(".chart-modal__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeChartModal() {
    if (!modal.root) return;
    if (modalChart) {
      modalChart.destroy();
      modalChart = null;
    }
    modal.root.hidden = true;
    modal.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function resetSelect(sel, values) {
    var previous = sel.value;
    sel.innerHTML = '<option value="">Todos</option>';
    values.slice().sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }).forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    if (values.indexOf(previous) >= 0) sel.value = previous;
  }

  /* Chamado toda vez que a aba Dashboard é aberta. Busca no banco antes. */
  function refresh() {
    setup();
    Store.refresh().catch(function () { return null; }).then(function () {
      var all = Store.getAll();
      if (!all.length) {
        els.empty.hidden = false;
        els.content.hidden = true;
        return;
      }
      els.empty.hidden = true;
      els.content.hidden = false;
      refreshModalTriggers();
      resetSelect(els.fFiscal, Store.distinct(all, "fiscal"));
      resetSelect(els.fForn, Store.distinct(all, "fornecedor"));
      resetSelect(els.fLocal, Store.distinct(all, "local"));
      resetSelect(els.fPedido, Store.distinct(all, "pedido"));
      render();
    });
  }

  function getFiltered() {
    var all = Store.getAll();
    var fis = els.fFiscal.value, forn = els.fForn.value, loc = els.fLocal.value;
    var ped = els.fPedido.value;
    return all.filter(function (r) {
      if (fis && r.fiscal !== fis) return false;
      if (forn && r.fornecedor !== forn) return false;
      if (loc && r.local !== loc) return false;
      if (ped && String(r.pedido) !== ped) return false;
      return true;
    });
  }

  function render() {
    var all = Store.getAll();
    var list = getFiltered();
    els.count.innerHTML = "Mostrando <strong>" + list.length + "</strong> de " + all.length + " registros";
    renderKpis(list);
    renderFunnel(list);
    renderCharts(list);
  }

  function renderKpis(list) {
    var k = Store.kpis(list);
    var concClass = k.conclusao >= 70 ? "kpi--ok" : k.conclusao < 40 ? "kpi--warn" : "";

    var cards = [
      kpiCard("Volume do pedido", val(k.totalPedido), "", k.registros + " registros"),
      kpiCard("Transportado", val(k.totalTransportado), "", pct(k.conclusao) + " do pedido", "kpi--ok"),
      kpiCard("Taxa de conclusão", pct(k.conclusao), "", "do volume do pedido", concClass),
      kpiCard("Em andamento", val(k.emAndamento), "", "ainda não transportado"),
      kpiCard("Cobertura", String(k.fornecedores), "", k.locais + " locais · " + k.fiscais + " fiscais")
    ];
    els.kpi.innerHTML = cards.join("");
  }

  function kpiCard(label, value, unit, foot, extra) {
    return (
      '<div class="kpi ' + (extra || "") + '">' +
        '<div class="kpi__label">' + label + "</div>" +
        '<div class="kpi__value">' + value + (unit ? '<span class="kpi__unit">' + unit + "</span>" : "") + "</div>" +
        '<div class="kpi__foot">' + foot + "</div>" +
      "</div>"
    );
  }

  function renderFunnel(list) {
    renderFunnelInto(els.funnel, list);
    requestAnimationFrame(placeFunnelLabels);
  }

  function renderFunnelInto(container, list) {
    var totals = Store.funnelTotals(list);
    var base = totals[0].total || 0;

    if (!container) return;

    if (!list.length || base === 0) {
      container.innerHTML = '<p class="card__hint">Nenhum registro para os filtros atuais.</p>';
      return;
    }

    var rows = totals.map(function (st) {
      var w = base > 0 ? (st.total / base) * 100 : 0;
      var pofp = base > 0 ? (st.total / base) * 100 : 0;
      var txt = FUNNEL_TEXT[st.key] || "#fff";
      var shadow = txt === "#fff" ? "text-shadow:0 1px 2px rgba(0,0,0,.28);" : "";
      return (
        '<div class="funnel__row">' +
          '<div class="funnel__name">' + st.short + "<small>" + st.label + "</small></div>" +
          '<div class="funnel__track">' +
            '<div class="funnel__bar" data-w="' + Math.max(w, 6).toFixed(1) + '" style="width:' + Math.max(w, 6).toFixed(1) + "% ;background:" + st.color + ";color:" + txt + ";" + shadow + '">' +
              '<span class="funnel__value">' +
                withUnit(st.total) +
                '<span class="pct">' + Math.round(pofp) + "%</span>" +
              "</span>" +
            "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    var k = Store.kpis(list);
    var note =
      '<div class="funnel__note">' +
      "Maior perda entre estágios: <strong>" + k.gargalo.label + "</strong> " +
      '<b>(−' + pct(k.gargalo.drop) + ")</b></div>";

    container.innerHTML = rows + note;
  }

  /* Mantém o rótulo (valor + %) dentro da barra quando há espaço; quando a
     barra é estreita demais e o número seria cortado, move o rótulo para fora,
     logo à direita da barra, em cor escura (legível sobre o trilho cinza). */
  function placeFunnelLabels() {
    placeFunnelLabelsIn(els.funnel);
  }

  function placeFunnelLabelsIn(container) {
    if (!container) return;
    var rows = container.querySelectorAll(".funnel__row");
    var i, row, track, bar, value;

    // 1) Reseta todos os rótulos para "dentro da barra" antes de medir.
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      bar = row.querySelector(".funnel__bar");
      value = row.querySelector(".funnel__value");
      if (!bar || !value) continue;
      if (value.parentNode !== bar) bar.appendChild(value);
      value.classList.remove("funnel__value--out");
      value.style.left = "";
    }

    // 2) Mede cada linha e move o rótulo para fora quando não couber.
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      track = row.querySelector(".funnel__track");
      bar = row.querySelector(".funnel__bar");
      value = row.querySelector(".funnel__value");
      if (!track || !bar || !value) continue;

      var trackW = track.clientWidth;
      if (!trackW) continue; // aba oculta ou ainda sem layout

      // Largura final da barra (não depende da animação de width em curso).
      var frac = (parseFloat(bar.getAttribute("data-w")) || 0) / 100;
      var minBar = container.classList.contains("chart-modal__funnel") ? 92 : 64;
      var barW = Math.max(trackW * frac, minBar);
      var innerW = barW - 24;
      var need = value.getBoundingClientRect().width;

      if (need > innerW) {
        var left = barW + 8; // 8px de respiro depois da barra
        if (left + need <= trackW) { // só move se realmente couber à direita
          value.classList.add("funnel__value--out");
          value.style.left = left + "px";
          track.appendChild(value);
        }
      }
    }
  }

  /* ---- Gráficos (Chart.js) ---- */
  function ensureDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = legendInk(); // segue o tema mesmo após o 1º ajuste
    if (defaultsSet) return;
    Chart.defaults.font.family = '"Cera Pro", Verdana, Geneva, Tahoma, sans-serif';
    Chart.defaults.font.size = 10;
    Chart.defaults.resizeDelay = 200; // amortece redimensionamentos em cascata
    Chart.defaults.animation = false; // 10 gráficos animando juntos travavam a renderização
    defaultsSet = true;
  }

  function chartsAvailable() {
    return (typeof Chart !== "undefined" && typeof ChartDataLabels !== "undefined");
  }

  function showChartFallback() {
    CHART_IDS.forEach(function (id) {
      var cv = document.getElementById(id);
      if (!cv) return;
      var box = cv.closest(".chart-box");
      if (!box) return;
      cv.style.display = "none";
      if (!box.querySelector(".chart-fallback")) {
        var p = document.createElement("p");
        p.className = "card__hint chart-fallback";
        p.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:18px;margin:0;";
        p.textContent = "A biblioteca de gráficos não carregou (sem conexão?). Os indicadores e o funil acima continuam válidos.";
        box.appendChild(p);
      }
    });
  }

  function clearChartFallback() {
    var ps = document.querySelectorAll(".chart-fallback");
    for (var i = 0; i < ps.length; i++) ps[i].parentNode.removeChild(ps[i]);
    CHART_IDS.forEach(function (id) {
      var cv = document.getElementById(id);
      if (cv) cv.style.display = "";
    });
  }

  function renderCharts(list) {
    if (!chartsAvailable()) { showChartFallback(); return; }
    clearChartFallback();
    ensureDefaults();
    chartFornecedor(list);
    chartLocal(list);
    chartTendencia(list);
    chartHistorico(list);
    mount("chart-ritmo", buildChartConfig("ritmo", list, false));
    mount("chart-conclforn", buildChartConfig("conclforn", list, false));
    mount("chart-entregasped", buildChartConfig("entregasped", list, false));
    mount("chart-entregasforn", buildChartConfig("entregasforn", list, false));
  }

  function mount(id, config) {
    var cv = document.getElementById(id);
    if (!cv) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(cv, config);
  }

  function baseScales(expanded) {
    var tickSize = expanded ? 12 : 10;
    return {
      x: { grid: { color: gridColor() }, ticks: { color: tickColor(), font: { size: tickSize } } },
      y: { grid: { color: gridColor() }, ticks: { color: tickColor(), font: { size: tickSize } }, beginAtZero: true }
    };
  }

  function paddedMax(values, factor) {
    var max = values.reduce(function (m, v) { return Math.max(m, Number(v) || 0); }, 0);
    return max > 0 ? Math.ceil(max * (factor || 1.18)) : 10;
  }

  function chartFornecedor(list) { mount("chart-fornecedor", buildChartConfig("fornecedor", list, false)); }
  function chartLocal(list) { mount("chart-local", buildChartConfig("local", list, false)); }
  function chartTendencia(list) { mount("chart-tendencia", buildChartConfig("tendencia", list, false)); }
  function chartHistorico(list) { mount("chart-historico", buildChartConfig("historico", list, false)); }

  function buildChartConfig(kind, list, expanded) {
    if (kind === "fornecedor") return fornecedorConfig(list, expanded);
    if (kind === "local") return localConfig(list, expanded);
    if (kind === "tendencia") return tendenciaConfig(list, expanded);
    if (kind === "historico") return historicoConfig(list, expanded);
    if (kind === "ritmo") return ritmoConfig(list, expanded);
    if (kind === "conclforn") return conclFornConfig(list, expanded);
    if (kind === "entregasped") return entregasSemanaisConfig(list, "pedido", expanded);
    if (kind === "entregasforn") return entregasSemanaisConfig(list, "fornecedor", expanded);
    return fornecedorConfig(list, expanded);
  }

  function fornecedorConfig(list, expanded) {
    var d = Store.pedidoVsTransportado(list, "fornecedor");
    var max = paddedMax(d.reduce(function (arr, x) { arr.push(x.pedido, x.transportado, x.saldo); return arr; }, []), expanded ? 1.26 : 1.18);
    var scales = baseScales(expanded);
    scales.x.suggestedMax = max;
    scales.y.ticks.autoSkip = false;

    return {
      type: "bar",
      data: {
        labels: d.map(function (x) { return x.label; }),
        datasets: [
          { label: "Pedido", data: d.map(function (x) { return x.pedido; }), backgroundColor: C.azul, borderRadius: expanded ? 7 : 4 },
          { label: "Transportado", data: d.map(function (x) { return x.transportado; }), backgroundColor: C.verde, borderRadius: expanded ? 7 : 4 },
          { label: "Saldo a transportar", data: d.map(function (x) { return x.saldo; }), backgroundColor: C.laranja, borderRadius: expanded ? 7 : 4 }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: expanded ? 86 : 38, top: expanded ? 12 : 2, bottom: expanded ? 10 : 2, left: expanded ? 8 : 0 } },
        scales: scales,
        plugins: {
          legend: legendConfig(expanded),
          tooltip: { callbacks: { label: tipVal } },
          datalabels: barEndLabelsExact(expanded)
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  function localConfig(list, expanded) {
    var d = Store.groupSum(list, "local", "volPedido");
    var max = paddedMax(d.map(function (x) { return x.value; }), expanded ? 1.28 : 1.22);
    var scales = baseScales(expanded);
    scales.x.suggestedMax = max;
    scales.y.ticks.autoSkip = false;

    return {
      type: "bar",
      data: {
        labels: d.map(function (x) { return x.label; }),
        datasets: [{ label: "Volume do pedido", data: d.map(function (x) { return x.value; }), backgroundColor: C.azulClaro, borderRadius: expanded ? 7 : 4 }]
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: expanded ? 70 : 38, top: expanded ? 12 : 2, bottom: expanded ? 10 : 2 } },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: tipVal } },
          datalabels: barEndLabels(expanded)
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  function tendenciaConfig(list, expanded) {
    var d = Store.pedidoVsTransportado(list, "pedido");
    var pcts = d.map(function (x) { return x.pedido > 0 ? (x.transportado / x.pedido) * 100 : 0; });
    var max = paddedMax(d.map(function (x) { return x.pedido; }), expanded ? 1.24 : 1.18);

    return {
      type: "bar",
      data: {
        labels: d.map(function (x) { return x.label; }),
        datasets: [
          { label: "Concluído", data: d.map(function (x) { return x.transportado; }), backgroundColor: C.verde, borderRadius: expanded ? 6 : 3, stack: "vol" },
          { label: "Falta concluir", data: d.map(function (x) { return x.saldo; }), backgroundColor: C.laranja, borderRadius: expanded ? 6 : 3, stack: "vol" }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: expanded ? 36 : 22, right: expanded ? 16 : 6, left: expanded ? 8 : 2, bottom: expanded ? 10 : 0 } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: tickColor(), font: { size: expanded ? 12 : 10 }, maxRotation: expanded ? 25 : 40, minRotation: 0, autoSkip: true, maxTicksLimit: expanded ? 14 : 8 } },
          y: { stacked: true, beginAtZero: true, suggestedMax: max, grid: { color: gridColor() }, ticks: { color: tickColor(), font: { size: expanded ? 12 : 10 }, callback: function (v) { return fmtC.format(v); } } }
        },
        plugins: {
          legend: legendConfig(expanded),
          tooltip: {
            callbacks: {
              label: function (c) { return " " + c.dataset.label + ": " + withUnit(c.parsed.y); },
              afterBody: function (items) { return "Conclusão: " + pct(pcts[items[0].dataIndex]); }
            }
          },
          datalabels: pedidoPctLabels(d, pcts, expanded)
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  /* Rótulo com o % de conclusão no topo de cada coluna (segmento mais alto da pilha). */
  function pedidoPctLabels(d, pcts, expanded) {
    return {
      display: function (ctx) {
        var saldo = d[ctx.dataIndex].saldo;
        return ctx.dataset.label === "Falta concluir" ? saldo > 0 : saldo <= 0;
      },
      anchor: "end", align: "top", offset: expanded ? 6 : 3, clamp: true, clip: false,
      color: C.azul, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 4, padding: expanded ? 5 : 3,
      font: { size: expanded ? 12 : 9, weight: "700" },
      formatter: function (v, ctx) { return pct(pcts[ctx.dataIndex]); }
    };
  }

  function historicoConfig(list, expanded) {
    var d = Store.cumulativeTransported(list);
    var eta = etaInfo(list);
    var labels = d.map(function (x) { return fmtDate.format(new Date(x.date)); });
    var real = d.map(function (x) { return x.total; });

    var datasets = [{
      label: "Transportado acumulado", data: real,
      borderColor: C.verde, backgroundColor: "rgba(30,159,127,0.14)",
      fill: true, tension: 0.3, pointRadius: expanded ? 5 : 2, pointBackgroundColor: C.verde, borderWidth: expanded ? 3 : 2
    }];

    // Projeção: liga o último ponto real à meta (volume total do pedido) na data prevista.
    var comProjecao = eta.dias > 0 && d.length > 0;
    if (comProjecao) {
      labels = labels.concat([fmtDate.format(eta.data)]);
      var proj = labels.map(function () { return null; });
      proj[d.length - 1] = real[real.length - 1];
      proj[labels.length - 1] = eta.alvo;
      datasets.push({
        label: "Projeção (ritmo atual)", data: proj,
        borderColor: C.laranja, borderDash: [6, 5], borderWidth: expanded ? 3 : 2,
        pointRadius: expanded ? 5 : 3, pointStyle: "rectRot", pointBackgroundColor: C.laranja,
        fill: false, tension: 0
      });
    }

    var maxVals = real.concat(comProjecao ? [eta.alvo] : []);
    var scales = baseScales(expanded);
    scales.y.suggestedMax = paddedMax(maxVals, expanded ? 1.25 : 1.16);

    return {
      type: "line",
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: expanded ? 34 : 18, right: expanded ? 32 : 16, left: expanded ? 8 : 2, bottom: expanded ? 10 : 0 } },
        scales: scales,
        plugins: {
          legend: comProjecao ? legendConfig(expanded) : { display: false },
          tooltip: {
            callbacks: {
              title: function (items) {
                var i = items[0].dataIndex;
                return (d[i] ? d[i].label + " · " : "Previsão · ") + items[0].label;
              },
              label: function (c) {
                return " " + (c.datasetIndex === 0 ? "Acumulado: " : "Meta: ") + withUnit(c.parsed.y);
              }
            }
          },
          datalabels: linePointLabels(function (v) { return fmtC.format(v); }, expanded)
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  /* Previsão de término: ritmo médio desde o primeiro registro. */
  function etaInfo(list) {
    var totalPedido = 0, totalTransp = 0, minData = null;
    list.forEach(function (r) {
      totalPedido += Number(r.volPedido) || 0;
      totalTransp += Number(r.volTransportado) || 0;
      var t = new Date(r.createdAt).getTime();
      if (!isNaN(t) && (minData === null || t < minData)) minData = t;
    });
    var restante = totalPedido - totalTransp;
    if (restante <= 0 && totalPedido > 0) return { restante: 0, dias: 0, alvo: totalPedido };
    if (totalTransp <= 0 || minData === null) return { restante: restante, dias: null, alvo: totalPedido };
    var diasCorridos = Math.max(1, (Date.now() - minData) / 86400000);
    var taxa = totalTransp / diasCorridos;
    var dias = Math.ceil(restante / taxa);
    return { restante: restante, dias: dias, data: new Date(Date.now() + dias * 86400000), alvo: totalPedido };
  }

  /* Ritmo semanal: soma o transportado por semana (segunda-feira como início). */
  function ritmoConfig(list, expanded) {
    var SEMANA = 7 * 86400000;
    var buckets = {};
    list.forEach(function (r) {
      var d = new Date(r.createdAt);
      if (isNaN(d.getTime())) return;
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      var k = x.getTime();
      buckets[k] = (buckets[k] || 0) + (Number(r.volTransportado) || 0);
    });
    var keys = Object.keys(buckets).map(Number).sort(function (a, b) { return a - b; });
    var labels = [], data = [];
    for (var t = keys[0]; keys.length && t <= keys[keys.length - 1]; t += SEMANA) {
      labels.push("sem. " + fmtDate.format(new Date(t)));
      data.push(buckets[t] || 0);
    }
    var scales = colScales(expanded, function (v) { return fmtC.format(v); });
    scales.y.suggestedMax = paddedMax(data, expanded ? 1.25 : 1.18);
    return {
      type: "bar",
      data: { labels: labels, datasets: [{ label: "Transportado na semana", data: data, backgroundColor: C.verde, borderRadius: expanded ? 6 : 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: expanded ? 34 : 20, right: expanded ? 16 : 6, left: expanded ? 8 : 2, bottom: 0 } },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return " Transportado: " + withUnit(c.parsed.y); } } },
          datalabels: colTopLabels(expanded, function (v) { return fmtC.format(v); })
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  /* % de conclusão por fornecedor (barras horizontais normalizadas). */
  function conclFornConfig(list, expanded) {
    var d = Store.pedidoVsTransportado(list, "fornecedor");
    var pcts = d.map(function (x) {
      return x.pedido > 0 ? Math.round(Math.min(100, (x.transportado / x.pedido) * 100) * 10) / 10 : 0;
    });
    var scales = baseScales(expanded);
    scales.x.max = 118;
    scales.x.ticks.callback = function (v) { return v <= 100 ? v + "%" : ""; };
    scales.y.ticks.autoSkip = false;
    return {
      type: "bar",
      data: { labels: d.map(function (x) { return x.label; }), datasets: [{ label: "% concluído", data: pcts, backgroundColor: C.verde, borderRadius: expanded ? 6 : 3 }] },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: expanded ? 70 : 40, top: expanded ? 12 : 2, bottom: expanded ? 10 : 2 } },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return " Concluído: " + pct(c.parsed.x); } } },
          datalabels: {
            anchor: "end", align: "right", clamp: true, clip: false, offset: expanded ? 8 : 4,
            color: C.texto, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 4, padding: expanded ? 5 : 3,
            font: { size: expanded ? 12 : 9, weight: "700" },
            formatter: function (v) { return pct(v); }
          }
        }
      },
      plugins: [ChartDataLabels]
    };
  }

  /* Entregas por semana (volTransportado, semana pela data de cadastro),
     uma série por valor do campo (fornecedor ou pedido). */
  function weeklyDeliveredSeries(list, field) {
    var SEMANA = 7 * 86400000;
    var groups = {};
    var min = null, max = null;
    list.forEach(function (r) {
      var d = new Date(r.createdAt);
      if (isNaN(d.getTime())) return;
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      var k = x.getTime();
      if (min === null || k < min) min = k;
      if (max === null || k > max) max = k;
      var g = r[field] || "—";
      if (!groups[g]) groups[g] = {};
      groups[g][k] = (groups[g][k] || 0) + (Number(r.volTransportado) || 0);
    });
    var weeks = [];
    if (min !== null) for (var t = min; t <= max; t += SEMANA) weeks.push(t);
    var names = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
    return {
      labels: weeks.map(function (t) { return "sem. " + fmtDate.format(new Date(t)); }),
      series: names.map(function (name) {
        return { name: name, data: weeks.map(function (t) { return groups[name][t] || 0; }) };
      })
    };
  }

  /* Evolução semanal dos dormentes entregues, uma linha por fornecedor/pedido. */
  function entregasSemanaisConfig(list, field, expanded) {
    var d = weeklyDeliveredSeries(list, field);
    var all = [];
    var datasets = d.series.map(function (s, i) {
      var cor = DOUGHNUT[i % DOUGHNUT.length];
      all = all.concat(s.data);
      return {
        label: s.name, data: s.data,
        borderColor: cor, backgroundColor: cor,
        fill: false, tension: 0.3,
        pointRadius: expanded ? 4 : 2, borderWidth: expanded ? 3 : 2
      };
    });
    var scales = colScales(expanded, function (v) { return fmtC.format(v); });
    scales.y.suggestedMax = paddedMax(all, expanded ? 1.25 : 1.18);
    return {
      type: "line",
      data: { labels: d.labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: expanded ? 20 : 8, right: expanded ? 16 : 8, left: expanded ? 8 : 2, bottom: 0 } },
        scales: scales,
        plugins: {
          legend: legendConfig(expanded),
          tooltip: { callbacks: { label: function (c) { return " " + c.dataset.label + ": " + withUnit(c.parsed.y); } } }
        }
      }
    };
  }

  /* Escalas para colunas verticais (grade só no eixo Y). */
  function colScales(expanded, yTick) {
    var tickSize = expanded ? 12 : 10;
    return {
      x: { grid: { display: false }, ticks: { color: tickColor(), font: { size: tickSize }, maxRotation: expanded ? 25 : 40, autoSkip: true, maxTicksLimit: expanded ? 14 : 8 } },
      y: { beginAtZero: true, grid: { color: gridColor() }, ticks: { color: tickColor(), font: { size: tickSize }, callback: yTick } }
    };
  }

  /* Rótulo no topo de colunas verticais. */
  function colTopLabels(expanded, fmtFn) {
    return {
      display: function (ctx) { return Number(ctx.dataset.data[ctx.dataIndex]) > 0; },
      anchor: "end", align: "top", offset: expanded ? 6 : 3, clamp: true, clip: false,
      color: C.texto, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 4, padding: expanded ? 4 : 2,
      font: { size: expanded ? 11 : 9, weight: "700" },
      formatter: fmtFn
    };
  }

  function legendConfig(expanded) {
    return {
      position: "top",
      labels: { boxWidth: expanded ? 13 : 9, boxHeight: expanded ? 13 : 9, font: { size: expanded ? 13 : 10 } }
    };
  }

  function barEndLabels(expanded) {
    return {
      anchor: "end", align: "right", clamp: true, clip: false, offset: expanded ? 8 : 4,
      color: C.texto, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 4, padding: expanded ? 5 : 3,
      font: { size: expanded ? 12 : 9, weight: "700" },
      formatter: function (v) { return v > 0 ? fmtC.format(v) : ""; }
    };
  }

  function barEndLabelsExact(expanded) {
    return {
      anchor: "end", align: "right", clamp: true, clip: false, offset: expanded ? 8 : 4,
      color: C.texto, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 4, padding: expanded ? 5 : 3,
      font: { size: expanded ? 12 : 9, weight: "700" },
      formatter: function (v, ctx) {
        if (v <= 0) return "";
        return ctx.dataset && ctx.dataset.label === "Saldo a transportar" ? "Saldo: " + withUnit(v) : withUnit(v);
      }
    };
  }

  function linePointLabels(formatter, expanded) {
    return {
      display: function (ctx) {
        if (ctx.datasetIndex !== 0) return false;
        var total = ctx.dataset && ctx.dataset.data ? ctx.dataset.data.length : 0;
        if (total <= 6) return true;
        var step = Math.ceil(total / 5);
        return ctx.dataIndex === 0 || ctx.dataIndex === total - 1 || ctx.dataIndex % step === 0;
      },
      anchor: "end", align: "top", offset: expanded ? 7 : 4, clamp: true, clip: false,
      color: C.texto, backgroundColor: "rgba(255,255,255,0.86)", borderRadius: 4, padding: expanded ? 4 : 2,
      font: { size: expanded ? 11 : 9, weight: "700" },
      formatter: formatter
    };
  }

  function val(n) { return fmt.format(Math.round(n)); }
  function pct(n) { return (Math.round(n * 10) / 10).toString().replace(".", ",") + "%"; }
  function withUnit(n) { return fmt.format(Math.round(Number(n) || 0)) + (UNIT ? " " + UNIT : ""); }
  function tipVal(c) { return " " + c.dataset.label + ": " + withUnit(c.parsed.x != null ? c.parsed.x : c.parsed.y); }

  function onThemeChange() {
    ensureDefaults(); // atualiza a cor da legenda
    // Redesenha os gráficos (eixos/grade) só se o dashboard estiver aberto.
    if (document.body.classList.contains("dashboard-mode")) refresh();
  }

  window.DashboardUI = { refresh: refresh, onThemeChange: onThemeChange };
})();

/* =====================================================================
   MENU RETRÁTIL
   ===================================================================== */
(function () {
  "use strict";

  var btn = document.getElementById("btn-menu");
  if (!btn) return;

  function sync() {
    var open = !document.body.classList.contains("sidebar-collapsed");
    btn.setAttribute("aria-expanded", String(open));
  }

  btn.addEventListener("click", function () {
    document.body.classList.toggle("sidebar-collapsed");
    sync();
  });

  sync();
})();

/* =====================================================================
   (4) ROTEADOR — alterna entre as telas (via hash #registros / #dashboard)
   ===================================================================== */
(function () {
  "use strict";

  var views = {
    registros: document.getElementById("view-registros"),
    dashboard: document.getElementById("view-dashboard"),
    pendentes: document.getElementById("view-pendentes"),
    contas: document.getElementById("view-contas"),
    padronizacao: document.getElementById("view-padronizacao")
  };

  function show(view) {
    if (!views[view]) view = "registros";

    Object.keys(views).forEach(function (k) {
      views[k].hidden = (k !== view);
    });

    var items = document.querySelectorAll(".nav__item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("is-active", items[i].getAttribute("data-view") === view);
    }

    document.body.classList.toggle("dashboard-mode", view === "dashboard");

    if (view === "dashboard" && window.DashboardUI) window.DashboardUI.refresh();
    if (view === "registros" && window.RegistrosUI) window.RegistrosUI.render();
    if (view === "pendentes" && window.PendentesUI) window.PendentesUI.render();
    if (view === "contas" && window.ContasUI) window.ContasUI.render();
    if (view === "padronizacao" && window.PadronizacaoUI) window.PadronizacaoUI.render();

    window.scrollTo(0, 0);
  }

  // Cliques em qualquer elemento com data-view (sidebar, botões, empty-state)
  document.addEventListener("click", function (e) {
    var link = e.target.closest("[data-view]");
    if (!link) return;
    e.preventDefault();

    // Ao clicar em qualquer opção do menu lateral, o menu fecha sozinho.
    if (link.closest(".sidebar")) {
      document.body.classList.add("sidebar-collapsed");
      var menuButton = document.getElementById("btn-menu");
      if (menuButton) menuButton.setAttribute("aria-expanded", "false");
    }

    var v = link.getAttribute("data-view");
    if (location.hash !== "#" + v) {
      location.hash = "#" + v; // dispara hashchange -> show
    } else {
      show(v);
    }
  });

  window.addEventListener("hashchange", function () {
    show((location.hash || "#registros").slice(1));
  });

  // Permite ao login redesenhar a tela atual depois que a sessão é resolvida.
  window.RouterShow = show;

  // Estado inicial (respeita o hash da URL, se houver)
  show((location.hash || "#registros").slice(1));
})();