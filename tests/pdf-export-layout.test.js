const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "assets/js/pdf-export.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("exportacao PDF limita os graficos a dois por pagina", () => {
  assert.match(script, /var blockColumns = 2;/);
  assert.match(script, /var blockHeight = 160;/);
  assert.match(script, /if \(column >= blockColumns\)/);
  assert.match(script, /if \(column === 0 && y \+ blockHeight > height - 13\) newPage\(\);/);
});

test("todas as paginas exportadas recebem cabecalho e rodape", () => {
  assert.doesNotMatch(script, /if \(pageNumber !== 1\) return;/);
  assert.match(script, /y = 25;\s+column = 0;\s+addPageBands\(page\);/);
});

test("HTML invalida o cache da versao anterior do exportador", () => {
  assert.match(html, /pdf-export\.js\?v=dois-graficos-pagina-1/);
});
