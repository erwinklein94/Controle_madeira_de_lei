const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("modo apresentação oferece controle de tema ao lado do botão de saída", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");

  assert.match(
    html,
    /id="btn-presentation"[\s\S]*?id="btn-presentation-theme"[\s\S]*?id="btn-export-pdf"/
  );
  assert.match(css, /\.presentation-theme-toggle \{ display: none; \}/);
  assert.match(
    css,
    /body\.presentation-mode \.presentation-theme-toggle \{ display: inline-flex; \}/
  );
});

test("botões do menu e da apresentação compartilham a preferência de tema", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "tema.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  assert.match(source, /document\.getElementById\("btn-tema"\)/);
  assert.match(source, /document\.getElementById\("btn-presentation-theme"\)/);
  assert.match(source, /controls\.forEach\(function \(control\)/);
  assert.match(source, /control\.btn\.addEventListener\("click"/);
  assert.match(html, /tema\.js\?v=tema-apresentacao-1/);
});
