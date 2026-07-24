const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");

test("cartão Em andamento mostra pedidos filtrados sem repetição", () => {
  assert.match(app, /Store\.pedidosEmAndamento\(list\)/);
  assert.match(app, /kpiCard\("Em andamento"[\s\S]*"kpi--orders", pedidosEmAndamento\)/);
  assert.match(app, /class="kpi-orders-popover"/);
  assert.match(app, /tabindex="0" aria-describedby="kpi-orders-popover"/);
});

test("lista aparece ao passar o mouse ou focar pelo teclado", () => {
  assert.match(css, /\.kpi\.kpi--orders:hover \.kpi-orders-popover/);
  assert.match(css, /\.kpi\.kpi--orders:focus \.kpi-orders-popover/);
  assert.match(css, /visibility: visible/);
});
