const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function functionBlock(name, nextName) {
  const start = app.indexOf("function " + name);
  const end = app.indexOf("function " + nextName, start);
  assert.ok(start >= 0 && end > start, "funções " + name + " e " + nextName + " devem existir");
  return app.slice(start, end);
}

test("transportado acumulado contém somente a série real", () => {
  const block = functionBlock("historicoConfig", "ritmoConfig");
  assert.match(block, /label: "Transportado acumulado"/);
  assert.match(block, /legend: \{ display: false \}/);
  assert.doesNotMatch(block, /Projeção|ritmo atual|etaInfo|datasets\.push/);
  assert.doesNotMatch(html, /projeção no ritmo atual/i);
});

test("gráficos semanais usam o número da semana e entregas são barras agrupadas", () => {
  const ritmo = functionBlock("ritmoConfig", "conclFornConfig");
  const entregas = functionBlock("entregasSemanaisConfig", "colScales");
  assert.match(app, /return "Semana " \+ Store\.isoWeekNumber\(iso\)/);
  assert.match(ritmo, /labels\.push\(weekNumberLabel\(t\)\)/);
  assert.match(entregas, /type: "bar"/);
  assert.match(entregas, /barPercentage: 0\.82, categoryPercentage: 0\.78/);
  assert.doesNotMatch(entregas, /type: "line"/);
});

test("distribuição e conclusão foram unidas por fornecedor", () => {
  const block = functionBlock("conclFornConfig", "weeklyDeliveredSeries");
  assert.match(html, /Distribuição e conclusão por fornecedor/);
  assert.match(html, /Legenda: volume total · % concluído/);
  assert.doesNotMatch(html, /chart-local|Distribuição por local/);
  assert.match(block, /type: "doughnut"/);
  assert.match(block, /label: "Volume total"/);
  assert.match(block, /item\.label \+ " · ".*item\.pedido.*pct\(pcts\[i\]\)/s);
});
