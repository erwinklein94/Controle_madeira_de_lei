const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("Report dos fiscais é somente leitura e usa a aba Registros", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "assets", "js", "report-semanal.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");

  assert.doesNotMatch(html, /Consulta geral/i);
  assert.doesNotMatch(html, /report-history/);
  assert.doesNotMatch(script, /report-history|historyState|loadHistory|historySupplierOptions|report_semanal_registros|\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(html, /report-entry-form|report-toggle-entry|conta-fiscal-field/);
  assert.match(html, /Painel somente de leitura/);
  assert.match(script, /Store\.refresh\(\)/);
  assert.match(script, /draw\(Store\.getAll\(\)\)/);
  assert.match(script, /Store\.sumStage\(records, field\)/);
  assert.match(script, /Store\.cumulativeTransported\(records\)/);
  assert.match(script, /report-stage-/);
  assert.match(script, /report-timeline-/);
  assert.doesNotMatch(css, /report-history|report-readonly/);
  assert.match(html, /id="report-fiscais"/);
});

test("não oferece nem autoriza novas contas de fiscal", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const accounts = fs.readFileSync(path.join(root, "assets", "js", "contas.js"), "utf8");
  const createAccount = fs.readFileSync(path.join(root, "supabase", "functions", "create-account", "index.ts"), "utf8");
  const manageAccount = fs.readFileSync(path.join(root, "supabase", "functions", "manage-account", "index.ts"), "utf8");
  const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260723002945_remover_acesso_fiscais.sql"), "utf8");
  const accountForm = html.slice(html.indexOf('id="conta-form"'), html.indexOf('id="contas-equipe-tabela"'));

  assert.doesNotMatch(accountForm, /<option value="fiscal">Fiscal\/Inspetor<\/option>/);
  assert.doesNotMatch(accounts, /role === "fiscal"/);
  assert.match(createAccount, /VALID_ROLES = \["editor", "coordenador", "analista", "fornecedor"\]/);
  assert.match(manageAccount, /VALID_ROLES = \["editor", "coordenador", "analista", "fornecedor"\]/);
  assert.match(migration, /drop policy if exists registros_fiscal_select/);
  assert.match(migration, /check \(role in \('editor', 'coordenador', 'analista', 'fornecedor'\)\)/);
});
