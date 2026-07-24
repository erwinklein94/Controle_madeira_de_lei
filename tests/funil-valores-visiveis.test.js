const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("funil limita barras ao trilho sem alterar a porcentagem real", () => {
  assert.match(app, /var visualW = Math\.min\(100, Math\.max\(w, 6\)\)/);
  assert.match(app, /data-w="' \+ visualW\.toFixed\(1\)/);
  assert.match(app, /Math\.round\(pofp\) \+ "%<\/span>"/);
});

test("rótulo do funil possui posição de segurança quando não cabe", () => {
  assert.match(app, /funnel__value--pinned/);
  assert.match(app, /trackW - pinnedNeed - 8/);
  assert.match(app, /var minBar = parseFloat\(barStyle\.minWidth\) \|\| 0/);
  assert.match(app, /Math\.min\(trackW, Math\.max\(trackW \* frac, minBar\)\)/);
  assert.match(css, /\.funnel__value--pinned/);
  assert.match(css, /color: var\(--txt\) !important/);
  assert.match(html, /app\.js\?v=historico-tendencia-1/);
});
