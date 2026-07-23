const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("gráficos e modal usam a paleta Rumo no tema escuro", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  assert.match(source, /tickColor\(\)[\s\S]*isDark\(\) \? C\.cinza/);
  assert.match(source, /gridColor\(\)[\s\S]*rgba\(50,166,230,0\.18\)/);
  assert.match(source, /dataLabelBg[\s\S]*rgba\(0,30,54,0\.94\)/);
  assert.match(source, /Chart\.defaults\.plugins\.tooltip\.backgroundColor = C\.azulNoite/);
  assert.match(source, /modalChart = new Chart\(modal\.canvas, buildChartConfig\(modalKind/);
  assert.match(css, /data-theme="dark"\] \.chart-modal__body \{ background: var\(--rumo-azul-profundo\)/);
  assert.match(css, /data-theme="dark"\] \.chart-modal__head h2 \{ color: #e6eff6/);
  assert.match(html, /style\.css\?v=programacao-semanal-1/);
  assert.match(html, /app\.js\?v=programacao-semanal-1/);
});
