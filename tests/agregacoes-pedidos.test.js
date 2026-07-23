const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appPath = path.join(__dirname, "..", "assets", "js", "app.js");
const source = fs.readFileSync(appPath, "utf8").split("/* =====================================================================\n   (2) REGISTROS")[0];
const sandbox = {
  window: {},
  console
};

vm.runInNewContext(source, sandbox, { filename: appPath });
const Store = sandbox.window.Store;

assert.equal(Store.isoWeekNumber("2026-07-17"), 29, "17/07/2026 pertence à semana ISO 29");
assert.equal(Store.isoWeekNumber("2027-01-01"), 53, "a semana ISO deve respeitar a virada do ano");
assert.equal(Store.isoWeekNumber("", 12), 12, "sem data, preserva uma semana válida já gravada");

const records = [
  { id: "r1", pedidoId: "order-a", pedido: "100", fornecedor: "Fornecedor A", dataRef: "2026-07-20", volPedido: 1000, volFabricar: 600, volPronto: 120, volInspecionado: 100, volTransportado: 40 },
  { id: "r2", pedidoId: "order-a", pedido: "100", fornecedor: "Fornecedor A", dataRef: "2026-07-20", volPedido: 900, volFabricar: 500, volPronto: 180, volInspecionado: 150, volTransportado: 60 },
  { id: "r3", pedidoId: "order-a", pedido: "100", fornecedor: "Fornecedor A", dataRef: "2026-07-21", volPedido: 1000, volFabricar: 400, volPronto: 200, volInspecionado: 170, volTransportado: 90 },
  { id: "r4", pedidoId: "order-b", pedido: "200", fornecedor: "Fornecedor B", dataRef: "2026-07-21", volPedido: 500, volFabricar: 300, volPronto: 80, volInspecionado: 70, volTransportado: 50 }
];

assert.equal(Store.totalPedidos(records), 1500, "o total de cada pedido deve entrar uma única vez");
assert.equal(
  Store.totalPedidos([
    { id: "v1", pedido: "100", volPedido: 1000 },
    { id: "v2", pedido: "100", volPedido: 1100 }
  ]),
  1100,
  "sem pedido mestre, deve prevalecer o maior volume informado pelo Excel"
);
assert.equal(Store.sumStage(records, "volPronto"), 580, "os movimentos diários fabricados devem ser somados");
assert.equal(Store.sumStage(records, "volInspecionado"), 490, "os movimentos diários inspecionados devem ser somados");
assert.equal(Store.sumStage(records, "volFabricar"), 700, "a fabricar deve usar o menor saldo de cada pedido");
assert.equal(Store.sumStage(records, "volTransportado"), 140, "o transportado deve usar o maior acumulado de cada pedido");
assert.equal(
  Store.sumStage([
    { id: "f1", pedido: "300", volFabricar: 100 },
    { id: "f2", pedido: "300", volFabricar: 0 },
    { id: "f3", pedido: "400", volFabricar: 50 }
  ], "volFabricar"),
  50,
  "saldo zero é válido e deve prevalecer como menor valor do pedido"
);
assert.equal(
  Store.sumStage([
    { id: "x1", pedidoId: "id-antigo", pedido: "300", volTransportado: 70 },
    { id: "x2", pedidoId: "id-novo", pedido: "300", volTransportado: 80 }
  ], "volTransportado"),
  80,
  "o número do pedido deve prevalecer mesmo se o vínculo interno for diferente"
);

const byOrder = Store.pedidoVsTransportado(records, "pedido");
const orderA = byOrder.find((item) => item.label === "100");
assert.deepEqual(
  { total: orderA.pedido, fabricado: orderA.fabricado, inspecionado: orderA.inspecionado, transportado: orderA.transportado, saldo: orderA.saldo },
  { total: 1000, fabricado: 500, inspecionado: 420, transportado: 90, saldo: 910 }
);

const history = Store.cumulativeTransported(records);
assert.equal(history.length, 2, "vários registros do mesmo dia devem formar um único ponto diário");
assert.deepEqual(Array.from(history, (item) => item.total), [60, 140]);

const ivanRecords = [
  { id: "i1", pedidoId: "ivan-a", pedido: "4502028987", fornecedor: "Pandolfi", dataRef: "2026-07-17", volPedido: 10500, volTransportado: 8596 },
  { id: "i2", pedidoId: "ivan-a", pedido: "4502028987", fornecedor: "Pandolfi", dataRef: "2026-07-20", volPedido: 10500, volTransportado: 10500 },
  { id: "i3", pedidoId: "ivan-b", pedido: "4502040200", fornecedor: "Pandolfi", dataRef: "2026-07-17", volPedido: 10000, volTransportado: 3294 },
  { id: "i4", pedidoId: "ivan-b", pedido: "4502040200", fornecedor: "Pandolfi", dataRef: "2026-07-20", volPedido: 10000, volTransportado: 2972 },
  { id: "i5", pedidoId: "ivan-b", pedido: "4502040200", fornecedor: "Pandolfi", dataRef: "2026-07-21", volPedido: 10000, volTransportado: 2860 },
  { id: "i6", pedidoId: "ivan-b", pedido: "4502040200", fornecedor: "Pandolfi", dataRef: "2026-07-22", volPedido: 10000, volTransportado: 3896 }
];
const ivanKpis = Store.kpis(ivanRecords);
assert.equal(ivanKpis.totalTransportado, 14396, "Ivan deve considerar 10.500 + 3.896 transportados");
assert.equal(Math.round(ivanKpis.conclusao * 10) / 10, 70.2, "a conclusão do Ivan deve cair para 70,2%");

console.log("Agregações de pedidos validadas com sucesso.");
