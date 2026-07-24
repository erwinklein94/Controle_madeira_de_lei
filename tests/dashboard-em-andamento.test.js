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
  assert.match(css, /#view-dashboard \.kpi\.kpi--orders \{[\s\S]*?overflow: visible;[\s\S]*?clip-path: none;/);
  const popoverStart = css.indexOf(".kpi-orders-popover {");
  const popoverEnd = css.indexOf(".kpi-orders-popover::before", popoverStart);
  const popover = css.slice(popoverStart, popoverEnd);
  assert.doesNotMatch(popover, /max-height|overflow-y:\s*auto/);
  assert.match(popover, /overflow: visible/);
  assert.match(popover, /background: #ffffff/);
  assert.match(css, /:root\[data-theme="dark"\] \.kpi-orders-popover \{[\s\S]*?background: #002b49/);
  assert.match(css, /\.kpi\.kpi--orders:hover \.kpi-orders-popover/);
  assert.match(css, /\.kpi\.kpi--orders:focus \.kpi-orders-popover/);
  assert.match(css, /visibility: visible/);
});
