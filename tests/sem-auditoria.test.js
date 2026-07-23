const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("site não expõe página, rota ou controle de acesso de auditoria", () => {
  const html = read("index.html");
  const app = read("assets", "js", "app.js");
  const access = read("assets", "js", "access-control.js");
  const css = read("assets", "css", "style.css");

  assert.doesNotMatch(html, /#auditoria|view-auditoria|auditoria\.js|data-requires-audit/i);
  assert.doesNotMatch(app, /AuditoriaUI|view-auditoria/i);
  assert.doesNotMatch(access, /canViewAudit|auditRoles|var AUDIT/i);
  assert.doesNotMatch(css, /\.audit-|view-auditoria|data-requires-audit/i);
  assert.equal(fs.existsSync(path.join(root, "assets", "js", "auditoria.js")), false);
});

test("funções de contas não gravam histórico de auditoria", () => {
  const createAccount = read("supabase", "functions", "create-account", "index.ts");
  const manageAccount = read("supabase", "functions", "manage-account", "index.ts");

  assert.doesNotMatch(createAccount, /audit_logs|capture_audit/i);
  assert.doesNotMatch(manageAccount, /audit_logs|capture_audit/i);
});

test("migração remove captura e acesso sem destruir o histórico existente", () => {
  const migration = read(
    "supabase",
    "migrations",
    "20260723100942_remover_auditoria.sql"
  );

  assert.match(migration, /drop trigger if exists/);
  assert.match(migration, /drop function if exists private\.capture_audit/);
  assert.match(migration, /revoke all on table public\.audit_logs/);
  assert.doesNotMatch(migration, /drop table(?: if exists)? public\.audit_logs/i);
});
