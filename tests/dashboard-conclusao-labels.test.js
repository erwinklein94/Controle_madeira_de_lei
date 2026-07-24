const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("Conclusão por Pedido exibe todos os pedidos na vertical e percentuais sem cards", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");
  const start = source.indexOf("function pedidoPctLabels");
  const end = source.indexOf("function historicoConfig", start);
  const labelsConfig = source.slice(start, end);
  const chartStart = source.indexOf("function tendenciaConfig");
  const chartConfig = source.slice(chartStart, start);

  assert.ok(start >= 0 && end > start, "configuração dos percentuais deve existir");
  assert.match(chartConfig, /maxRotation: 90, minRotation: 90, autoSkip: false/);
  assert.match(labelsConfig, /return segmentoDoTopo;/);
  assert.match(labelsConfig, /formatter:[\s\S]*pct\(pcts\[ctx\.dataIndex\]\)/);
  assert.doesNotMatch(labelsConfig, /backgroundColor|borderColor|borderWidth|borderRadius/);
  assert.match(html, /class="card chart-card chart-card--wide" data-modal-chart="tendencia"/);
  assert.match(css, /#view-dashboard \.chart-card--wide\s*\{\s*grid-column:\s*span 2;/);
  assert.match(html, /app\.js\?v=entregas-valores-percentuais-1/);
});
