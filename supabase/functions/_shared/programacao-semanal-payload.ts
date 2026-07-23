export type ProgramacaoSemanalPayload = {
  excel_id: string;
  ano: number;
  semana: number;
  fornecedor: string;
  pedido: string;
  fiscal: string;
  data_inicio: string;
  data_fim: string;
  qtde_pecas: number;
  status: string;
  observacoes: string | null;
};

export class ProgramacaoPayloadError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ProgramacaoPayloadError";
    this.field = field;
  }
}

function textValue(
  source: Record<string, unknown>,
  field: string,
  options: { required?: boolean; maxLength?: number } = {},
): string | null {
  const raw = source[field];
  const value = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!value) {
    if (options.required) {
      throw new ProgramacaoPayloadError(field, `O campo ${field} é obrigatório.`);
    }
    return null;
  }
  if (value.length > (options.maxLength ?? 500)) {
    throw new ProgramacaoPayloadError(field, `O campo ${field} excede o tamanho permitido.`);
  }
  return value;
}

function integerValue(
  source: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") {
    throw new ProgramacaoPayloadError(field, `O campo ${field} é obrigatório.`);
  }

  let normalized: string | number = raw as string | number;
  if (typeof raw === "string") {
    normalized = raw.trim().replace(/\s/g, "");
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(normalized)) {
      normalized = normalized.replace(/[.,]/g, "");
    } else {
      normalized = normalized.replace(",", ".");
    }
  }

  const value = typeof normalized === "number" ? normalized : Number(normalized);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ProgramacaoPayloadError(
      field,
      `O campo ${field} deve ser um número inteiro entre ${min} e ${max}.`,
    );
  }
  return value;
}

function dateValue(source: Record<string, unknown>, field: string): string {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") {
    throw new ProgramacaoPayloadError(field, `O campo ${field} é obrigatório.`);
  }

  if (typeof raw === "number" || /^\d+(?:[.,]\d+)?$/.test(String(raw).trim())) {
    const serial = Number(String(raw).replace(",", "."));
    if (Number.isFinite(serial) && serial > 0) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const date = new Date(excelEpoch + Math.floor(serial) * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }

  const value = String(raw).trim();
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const iso = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso) return iso;
  }

  const iso = value.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1];
  if (iso) {
    const date = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso) return iso;
  }

  throw new ProgramacaoPayloadError(
    field,
    `O campo ${field} deve conter uma data válida.`,
  );
}

function isoPeriod(isoDate: string): { ano: number; semana: number } {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const ano = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(ano, 0, 1));
  const semana = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { ano, semana };
}

export function isBlankProgramacaoSemanalRow(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const values = Object.values(body as Record<string, unknown>);
  return values.every((value) => value === null || value === undefined || String(value).trim() === "");
}

export function normalizeProgramacaoSemanalPayload(body: unknown): ProgramacaoSemanalPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProgramacaoPayloadError("body", "O corpo deve ser um objeto JSON.");
  }
  const source = body as Record<string, unknown>;
  const excelId = textValue(source, "excel_id", { required: true, maxLength: 200 })!;
  const dataInicio = dateValue(source, "data_inicio");
  const dataFim = dateValue(source, "data_fim");
  if (dataFim < dataInicio) {
    throw new ProgramacaoPayloadError(
      "data_fim",
      "O campo data_fim não pode ser anterior a data_inicio.",
    );
  }
  const period = isoPeriod(dataInicio);
  return {
    excel_id: excelId,
    ano: period.ano,
    semana: period.semana,
    fornecedor: textValue(source, "fornecedor", { required: true, maxLength: 200 })!,
    pedido: textValue(source, "pedido", { required: true, maxLength: 200 })!,
    fiscal: textValue(source, "fiscal", { required: true, maxLength: 200 })!,
    data_inicio: dataInicio,
    data_fim: dataFim,
    qtde_pecas: integerValue(source, "qtde_pecas", 0, Number.MAX_SAFE_INTEGER),
    status: textValue(source, "status", { required: true, maxLength: 100 })!,
    observacoes: textValue(source, "observacoes", { maxLength: 2000 }),
  };
}
