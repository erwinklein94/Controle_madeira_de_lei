const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

test("interface permite digitar pedido e mostra ações do fornecedor", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="forn-pedido" type="text" list="forn-pedidos-list"/);
  assert.doesNotMatch(html, /forn-pedido-detalhes/);
  assert.match(html, /id="forn-cancel"[^>]*hidden/);
  assert.match(html, /Histórico dos fornecedores/);
  assert.doesNotMatch(html, /id="solic-tabela"/);
});

test("script mantém avisos livres sem depender de pedidos padronizados", () => {
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
  assert.match(source, /pedido_id: null/);
  assert.match(source, /Marcar como analisada/);
  assert.doesNotMatch(source, /Padroes/);
});

test("migração mantém o aviso sem transformá-lo em registro operacional", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase", "migrations", "20260723094628_remover_padronizacao_pedidos.sql"),
    "utf8"
  );
  assert.match(migration, /normalize_pending_order_reference/);
  assert.match(migration, /set status = 'aceita'/);
  assert.doesNotMatch(migration, /insert into public\.registros/i);
  assert.doesNotMatch(migration, /new\.vol_pedido\s*:=/);
});
