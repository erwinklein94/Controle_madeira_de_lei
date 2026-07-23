const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "assets", "js", "app.js"), "utf8");
const source = fs.readFileSync(path.join(root, "assets", "js", "pedidos.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "css", "style.css"), "utf8");

test("página Pedidos possui menu, filtros, gráficos e tabela consolidada", () => {
  assert.match(html, /href="#pedidos" data-view="pedidos"/);
  assert.match(html, /id="view-pedidos"/);
  [
    "pedidos-f-fornecedor",
    "pedidos-f-fiscal",
    "pedidos-f-semana",
    "pedidos-f-pedido",
    "pedidos-f-local",
    "pedidos-orders-chart",
    "pedidos-completion-chart",
    "pedidos-table"
  ].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(app, /pedidos: document\.getElementById\("view-pedidos"\)/);
  assert.match(app, /view === "pedidos" && window\.PedidosUI/);
  assert.match(html, /assets\/js\/pedidos\.js\?v=pagina-pedidos-1/);
  assert.match(css, /\.pedidos-summary-grid/);
  assert.match(source, /indexAxis: "y"/);
  assert.match(source, /label: "Volume do pedido"/);
  assert.match(source, /label: "Transportado"/);
});

test("pedidos repetidos viram uma linha com maiores acumulados e metadados reunidos", () => {
  const sandbox = { window: {}, console, Intl };
  vm.runInNewContext(source, sandbox, {
    filename: path.join(root, "assets", "js", "pedidos.js")
  });
  const aggregate = sandbox.window.PedidosUI.aggregateOrders;
  const orders = aggregate([
    {
      pedido: "100", fornecedor: "Fornecedor A", fiscal: "Walter", local: "Local 1",
      semana: 29, dataRef: "2026-07-17", volPedido: 1000, volTransportado: 400
    },
    {
      pedido: "100", fornecedor: "Fornecedor A", fiscal: "Ivan", local: "Local 2",
      semana: 30, dataRef: "2026-07-20", volPedido: 900, volTransportado: 1100
    },
    {
      pedido: "200", fornecedor: "Fornecedor B", fiscal: "Walter", local: "Local 3",
      semana: 30, dataRef: "2026-07-21", volPedido: 500, volTransportado: 250
    }
  ]);

  assert.equal(orders.length, 2);
  const order100 = orders.find((order) => order.pedido === "100");
  const order200 = orders.find((order) => order.pedido === "200");
  assert.equal(order100.volumePedido, 1000);
  assert.equal(order100.transportado, 1100);
  assert.equal(order100.conclusao, 100);
  assert.equal(order100.concluido, true);
  assert.deepEqual(Array.from(order100.fiscais), ["Ivan", "Walter"]);
  assert.deepEqual(Array.from(order100.locais), ["Local 1", "Local 2"]);
  assert.deepEqual(Array.from(order100.semanas), ["29", "30"]);
  assert.equal(order100.registros, 2);
  assert.equal(order200.conclusao, 50);
  assert.equal(orders.filter((order) => order.concluido).length / orders.length * 100, 50);
});
