// Recebe uma linha da tabela de programação semanal enviada pelo Power Automate.
// A credencial privilegiada e a chave de integração permanecem apenas no servidor.
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  isBlankProgramacaoSemanalRow,
  normalizeProgramacaoSemanalPayload,
  ProgramacaoPayloadError,
  type ProgramacaoSemanalPayload,
} from "../_shared/programacao-semanal-payload.ts";

type ProgramacaoRow = ProgramacaoSemanalPayload & {
  id: string;
  updated_at: string;
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function secureEquals(received: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(received);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function serverDatabaseKey(): string | null {
  const currentKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (currentKeys) {
    try {
      const parsed = JSON.parse(currentKeys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // Projetos legados usam a variável abaixo.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

function comparable(row: Partial<ProgramacaoRow>, payload: ProgramacaoSemanalPayload): boolean {
  return row.ano === payload.ano &&
    row.semana === payload.semana &&
    row.fornecedor === payload.fornecedor &&
    row.pedido === payload.pedido &&
    row.fiscal === payload.fiscal &&
    row.data_inicio === payload.data_inicio &&
    row.data_fim === payload.data_fim &&
    Number(row.qtde_pecas) === payload.qtde_pecas &&
    row.status === payload.status &&
    (row.observacoes ?? null) === payload.observacoes;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido. Use POST." }, 405, { Allow: "POST" });
  }

  const integrationKey = Deno.env.get("POWER_AUTOMATE_INTEGRATION_KEY");
  const databaseKey = serverDatabaseKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!integrationKey || !databaseKey || !supabaseUrl) {
    console.error("Secrets obrigatórios da programação semanal não estão configurados.");
    return json({ error: "Integração não configurada no servidor." }, 500);
  }

  const receivedKey = req.headers.get("x-integration-key") ?? "";
  if (!secureEquals(receivedKey, integrationKey)) {
    return json({ error: "Credencial de integração inválida." }, 401);
  }

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return json({ error: "Content-Type deve ser application/json." }, 415);
  }

  const admin = createClient(supabaseUrl, databaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: unknown;
  try {
    try {
      body = await req.json();
    } catch {
      return json({ error: "JSON inválido." }, 400);
    }

    if (isBlankProgramacaoSemanalRow(body)) {
      return json({ ok: true, action: "skipped", reason: "Linha vazia." });
    }

    const payload = normalizeProgramacaoSemanalPayload(body);
    const { data: previous, error: previousError } = await admin
      .from("programacao_semanal")
      .select("id, excel_id, ano, semana, fornecedor, pedido, fiscal, data_inicio, data_fim, qtde_pecas, status, observacoes, updated_at")
      .eq("excel_id", payload.excel_id)
      .maybeSingle();
    if (previousError) {
      throw new Error(`Falha ao verificar a programação: ${previousError.message}`);
    }

    const action = previous ? (comparable(previous, payload) ? "unchanged" : "updated") : "created";
    const timestamp = new Date().toISOString();
    const row = {
      ...payload,
      origem_integracao: "power_automate_excel",
      integrado_em: timestamp,
      updated_at: timestamp,
    };

    const { data: saved, error: saveError } = await admin
      .from("programacao_semanal")
      .upsert(row, { onConflict: "excel_id" })
      .select("id, excel_id, ano, semana, fornecedor, pedido, fiscal, data_inicio, data_fim, qtde_pecas, status, observacoes, updated_at")
      .single();
    if (saveError) {
      throw new Error(`Falha ao gravar a programação semanal: ${saveError.message}`);
    }

    return json({ ok: true, action, programacao: saved }, action === "created" ? 201 : 200);
  } catch (error) {
    if (error instanceof ProgramacaoPayloadError) {
      return json({ error: error.message, field: error.field }, 400);
    }
    console.error(error);
    return json({ error: "Não foi possível processar a programação semanal." }, 500);
  }
});
