const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("rótulos da Conclusão por Pedido evitam sobreposição", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const start = source.indexOf("function pedidoPctLabels");
  const end = source.indexOf("function historicoConfig", start);
  const labelsConfig = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "configuração dos percentuais deve existir");
  assert.match(labelsConfig, /segmentoDoTopo \? "auto" : false/);
  assert.match(labelsConfig, /formatter:[\s\S]*pct\(pcts\[ctx\.dataIndex\]\)/);
  assert.match(html, /app\.js\?v=integracao-excel-4/);
});
