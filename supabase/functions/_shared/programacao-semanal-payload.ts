export type ProgramacaoSemanalPayload = {
  excel_id: string;
  ano: number;
  semana: number;
  fiscal: string;
  fornecedor: string | null;
  local: string;
  expectativa_pecas: number;
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
  return {
    excel_id: textValue(source, "excel_id", { required: true, maxLength: 200 })!,
    ano: integerValue(source, "ano", 2020, 2100),
    semana: integerValue(source, "semana", 1, 53),
    fiscal: textValue(source, "fiscal", { required: true, maxLength: 200 })!,
    fornecedor: textValue(source, "fornecedor", { maxLength: 200 }),
    local: textValue(source, "local", { required: true, maxLength: 200 })!,
    expectativa_pecas: integerValue(source, "expectativa_pecas", 0, Number.MAX_SAFE_INTEGER),
    observacoes: textValue(source, "observacoes", { maxLength: 2000 }),
  };
}
