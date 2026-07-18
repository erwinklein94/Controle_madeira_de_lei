/* =====================================================================
   AUDITORIA - consulta a trilha imutavel criada por gatilhos no Supabase.
   Somente Editor, Coordenador e Analista recebem linhas pelo RLS.
   ===================================================================== */
(function () {
  "use strict";

  var sb = window.sbClient;
  var root, countEl, filters, refreshBtn, wired = false;
  var searchTimer = null;
  var fmtDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  var ACTION = { INSERT: "Criação", UPDATE: "Alteração", DELETE: "Exclusão" };
  var ACTION_CLASS = { INSERT: "audit-action--insert", UPDATE: "audit-action--update", DELETE: "audit-action--delete" };
  var ENTITY = {
    registros: "Registros",
    pendencias: "Informações pendentes",
    solicitacoes: "Solicitações",
    comentarios: "Comentários",
    padroes: "Padronização",
    report_semanal_planejamentos: "Report · Planejamento",
    report_semanal_registros: "Report · Atividades",
    contas: "Contas"
  };
  var FIELD = {
    data_ref: "Data", fiscal: "Fiscal", fornecedor: "Fornecedor", local: "Local", pedido: "Pedido",
    vol_pedido: "Volume do pedido", vol_fabricar: "A fabricar", vol_pronto: "Fabricado",
    vol_pronto_insp: "Pronto para inspeção", vol_inspecionado: "Inspecionado",
    vol_liberado: "Estoque para entrega", vol_transportado: "Transportado",
    status: "Status", texto: "Texto", categoria: "Categoria", valor: "Valor",
    semana_inicio: "Semana", expectativa_inspecionado: "Expectativa de inspeção",
    expectativa_entregue: "Expectativa de entrega", observacoes: "Observações",
    role: "Perfil", nome: "Nome", email: "E-mail", password_changed: "Senha alterada"
  };
  var IGNORED = { created_at: true, updated_at: true, created_by: true, autor_id: true };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function stringify(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    return String(value);
  }
  function humanRole(role) {
    return window.AccessControl ? AccessControl.label(role) : (role || "—");
  }
  function actor(row) {
    return row.actor_name || row.actor_email || (row.actor_id ? "Usuário " + row.actor_id.slice(0, 8) : "Sistema");
  }
  function changedFields(row) {
    var before = row.old_data || {}, after = row.new_data || {};
    var keys = {};
    Object.keys(before).concat(Object.keys(after)).forEach(function (key) { if (!IGNORED[key]) keys[key] = true; });
    return Object.keys(keys).filter(function (key) {
      return JSON.stringify(before[key] === undefined ? null : before[key]) !== JSON.stringify(after[key] === undefined ? null : after[key]);
    });
  }
  function summary(row) {
    if (row.summary) return row.summary;
    if (row.action === "INSERT") return "Novo item criado";
    if (row.action === "DELETE") return "Item excluído";
    var fields = changedFields(row).map(function (key) { return FIELD[key] || key; });
    if (!fields.length) return "Registro atualizado";
    return fields.slice(0, 4).join(", ") + (fields.length > 4 ? " e mais " + (fields.length - 4) : "");
  }
  function details(row) {
    var before = row.old_data || {}, after = row.new_data || {};
    var keys = row.action === "UPDATE" ? changedFields(row) : Object.keys(row.action === "DELETE" ? before : after).filter(function (key) { return !IGNORED[key]; });
    if (!keys.length) return '<p class="audit-detail-empty">Sem campos adicionais.</p>';
    var rows = keys.map(function (key) {
      var label = FIELD[key] || key;
      if (row.action === "UPDATE") {
        return "<tr><th>" + esc(label) + "</th><td>" + esc(stringify(before[key])) + "</td><td>" + esc(stringify(after[key])) + "</td></tr>";
      }
      var value = row.action === "DELETE" ? before[key] : after[key];
      return "<tr><th>" + esc(label) + "</th><td colspan=\"2\">" + esc(stringify(value)) + "</td></tr>";
    }).join("");
    return '<div class="table-wrap"><table class="audit-detail-table"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }
  function rowHtml(row) {
    var actionLabel = ACTION[row.action] || row.action;
    return "<tr>" +
      "<td>" + esc(fmtDate.format(new Date(row.occurred_at))) + "</td>" +
      '<td class="col-text"><strong>' + esc(actor(row)) + "</strong><small>" + esc(row.actor_email || "") + "</small></td>" +
      '<td><span class="audit-role">' + esc(humanRole(row.actor_role)) + "</span></td>" +
      '<td><span class="audit-action ' + (ACTION_CLASS[row.action] || "") + '">' + esc(actionLabel) + "</span></td>" +
      '<td class="col-text">' + esc(ENTITY[row.entity] || row.entity) + "</td>" +
      '<td class="col-text audit-summary">' + esc(summary(row)) +
        '<details><summary>Ver detalhes</summary>' + details(row) + "</details></td>" +
      "</tr>";
  }
  function empty(text) {
    return '<div class="empty"><div class="empty__title">Nenhum evento encontrado</div><div class="empty__txt">' + esc(text) + "</div></div>";
  }
  function setLoading(value) {
    if (refreshBtn) { refreshBtn.disabled = value; refreshBtn.textContent = value ? "Atualizando…" : "Atualizar"; }
  }
  function load() {
    if (!root) grab();
    if (!root || !sb) return;
    if (!window.AccessControl || !AccessControl.isFull(window.currentProfile && window.currentProfile.role)) {
      root.innerHTML = empty("Seu perfil não possui acesso à auditoria.");
      return;
    }
    setLoading(true);
    var query = sb.from("audit_logs")
      .select("id, occurred_at, actor_id, actor_email, actor_role, actor_name, action, entity, record_id, old_data, new_data, summary")
      .order("occurred_at", { ascending: false }).limit(500);
    var role = filters.role.value, action = filters.action.value, entity = filters.entity.value;
    if (role) query = query.eq("actor_role", role);
    if (action) query = query.eq("action", action);
    if (entity) query = query.eq("entity", entity);
    if (filters.from.value) query = query.gte("occurred_at", filters.from.value + "T00:00:00");
    if (filters.to.value) query = query.lte("occurred_at", filters.to.value + "T23:59:59.999");
    query.then(function (res) {
      setLoading(false);
      if (res.error) {
        root.innerHTML = '<p class="card__hint">Não foi possível carregar a auditoria (' + esc(res.error.message) + "). Execute supabase/auditoria-perfis.sql.</p>";
        countEl.textContent = "";
        return;
      }
      var list = res.data || [];
      var search = filters.user.value.trim().toLocaleLowerCase("pt-BR");
      if (search) list = list.filter(function (row) { return (actor(row) + " " + (row.actor_email || "")).toLocaleLowerCase("pt-BR").indexOf(search) >= 0; });
      countEl.textContent = list.length + (list.length === 1 ? " evento exibido." : " eventos exibidos.") + (list.length === 500 ? " Limite de 500 eventos." : "");
      if (!list.length) { root.innerHTML = empty("Ajuste os filtros ou aguarde novas alterações no site."); return; }
      var head = "<thead><tr><th>Data e hora</th><th class=\"col-text\">Usuário</th><th>Perfil</th><th>Ação</th><th class=\"col-text\">Área</th><th class=\"col-text\">Alteração</th></tr></thead>";
      root.innerHTML = '<div class="table-wrap"><table class="tabela audit-table">' + head + "<tbody>" + list.map(rowHtml).join("") + "</tbody></table></div>";
    });
  }
  function grab() {
    root = document.getElementById("auditoria-tabela");
    countEl = document.getElementById("auditoria-count");
    refreshBtn = document.getElementById("auditoria-refresh");
    filters = {
      user: document.getElementById("audit-user"), role: document.getElementById("audit-role"),
      action: document.getElementById("audit-action"), entity: document.getElementById("audit-entity"),
      from: document.getElementById("audit-from"), to: document.getElementById("audit-to")
    };
  }
  function wire() {
    if (wired) return;
    grab();
    if (!root) return;
    refreshBtn.addEventListener("click", load);
    Object.keys(filters).forEach(function (key) { filters[key].addEventListener("change", load); });
    filters.user.addEventListener("input", function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(load, 250);
    });
    document.getElementById("audit-clear").addEventListener("click", function () {
      Object.keys(filters).forEach(function (key) { filters[key].value = ""; });
      load();
    });
    wired = true;
  }
  window.AuditoriaUI = { render: function () { wire(); load(); } };
})();
