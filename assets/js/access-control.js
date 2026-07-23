/* =====================================================================
   CONTROLE DE ACESSO - fonte unica dos papeis usados pela interface.
   A protecao definitiva continua no RLS e nas Edge Functions.
   ===================================================================== */
(function (global) {
  "use strict";

  var FULL = ["editor", "coordenador", "analista"];
  var TEAM = FULL.slice();
  var LABELS = {
    editor: "Editor",
    coordenador: "Coordenador",
    analista: "Analista",
    fiscal: "Fiscal/Inspetor",
    fornecedor: "Fornecedor",
    admin: "Editor" // compatibilidade durante a migracao do perfil antigo
  };

  function normalized(role) { return role === "admin" ? "editor" : role; }
  function isFull(role) { return FULL.indexOf(normalized(role)) >= 0; }
  function isFiscal(role) { return normalized(role) === "fiscal"; }
  function isFornecedor(role) { return normalized(role) === "fornecedor"; }
  function isTeam(role) { return TEAM.indexOf(normalized(role)) >= 0; }
  function currentRole() { return global.currentProfile ? global.currentProfile.role : null; }
  function canView(view, role) {
    role = normalized(role || currentRole());
    if (role === "fornecedor") return view === "fornecedor" || view === "contato-rumo";
    if (view === "fornecedor" || view === "contato-rumo") return false;
    if (role === "fiscal" && (view === "contas" || view === "pendentes")) return false;
    return TEAM.indexOf(role) >= 0;
  }

  global.AccessControl = {
    fullRoles: FULL.slice(),
    teamRoles: TEAM.slice(),
    normalized: normalized,
    label: function (role) { return LABELS[role] || LABELS[normalized(role)] || role || "Perfil"; },
    isFull: isFull,
    isFiscal: isFiscal,
    isFornecedor: isFornecedor,
    isTeam: isTeam,
    canView: canView,
    canEditRecords: function (role) { return isFull(role || currentRole()); }
  };
})(window);
