const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

test("interface permite digitar pedido e mostra ações do fornecedor", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="forn-pedido" type="text" list="forn-pedidos-list"/);
  assert.match(html, /id="forn-cancel"[^>]*hidden/);
  assert.match(html, /Histórico dos fornecedores/);
  assert.doesNotMatch(html, /id="solic-tabela"/);
});

test("script de fornecedores carrega e contém edição e exclusão lógica", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "pendencias.js"), "utf8");
  const sandbox = { window: { sbClient: {} }, Intl, console };
  vm.runInNewContext(source, sandbox, { filename: "pendencias.js" });

  assert.equal(typeof sandbox.window.FornecedorUI.render, "function");
  assert.equal(typeof sandbox.window.PendentesUI.render, "function");
  assert.match(source, /acao_fornecedor = "alterada"/);
  assert.match(source, /status: "excluida", acao_fornecedor: "excluida"/);
  assert.match(source, /Alterado pelo fornecedor/);
  assert.match(source, /Excluído pelo fornecedor/);
  assert.match(source, /Atualizado em/);
});

test("migração aceita pedido sem vínculo e protege autoria", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase", "migrations", "20260721015750_fornecedor_edita_exclui_pedido_livre.sql"),
    "utf8"
  );
  assert.match(migration, /alter column pedido_id drop not null/);
  assert.match(migration, /normalize_pending_order_reference/);
  assert.match(migration, /old\.created_by is distinct from auth\.uid\(\)/);
  assert.match(migration, /status in \('enviada', 'aceita', 'recusada', 'excluida'\)/);
  assert.match(migration, /Cadastre primeiro o pedido/);
});
