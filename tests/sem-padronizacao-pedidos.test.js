const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("site não expõe cadastro ou lógica de padronização de pedidos", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");

  assert.doesNotMatch(html, /view-padronizacao|#padronizacao|assets\/js\/padroes\.js/);
  assert.doesNotMatch(app, /Padroes|PadronizacaoUI|pedidoOfficialTotal/);
  assert.equal(fs.existsSync(path.join(root, "assets", "js", "padroes.js")), false);
});

test("integração grava os valores do Excel, sem substituí-los pelo pedido técnico", () => {
  const edge = fs.readFileSync(
    path.join(root, "supabase", "functions", "receber-controle-estoque", "index.ts"),
    "utf8"
  );

  assert.match(edge, /fornecedor: payload\.fornecedor/);
  assert.match(edge, /local: payload\.local/);
  assert.match(edge, /pedido: payload\.pedido/);
  assert.match(edge, /vol_pedido: payload\.vol_pedido/);
  assert.doesNotMatch(edge, /pedido\.fornecedor\s*\?\?/);
  assert.doesNotMatch(edge, /pedido\.quantidade_dormentes\s*\?\?/);
});
