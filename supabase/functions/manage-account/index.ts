// Edge Function: manage-account - altera ou exclui contas.
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const FULL_ROLES = ["editor", "coordenador", "analista", "admin"];
const VALID_ROLES = ["editor", "coordenador", "analista", "fornecedor"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Não autenticado." }, 401);

    const { data: caller, error: callerErr } = await admin.from("profiles")
      .select("role").eq("id", userData.user.id).maybeSingle();
    if (callerErr) return json({ error: "Falha ao ler o perfil do solicitante: " + callerErr.message }, 500);
    if (!caller || !FULL_ROLES.includes(caller.role)) {
      return json({ error: "Apenas Editor, Coordenador ou Analista podem gerenciar contas." }, 403);
    }

    const { action, id, email, password, role, nome, fornecedor, fiscal } = await req.json();
    if (!id) return json({ error: "Conta não informada." }, 400);

    if (action === "delete") {
      if (id === userData.user.id) return json({ error: "Você não pode excluir a própria conta." }, 400);
      const { error: deleteErr } = await admin.auth.admin.deleteUser(id);
      if (deleteErr) return json({ error: deleteErr.message }, 400);
      return json({ ok: true });
    }

    if (action === "update") {
      const { data: oldProfile, error: oldProfileErr } = await admin.from("profiles")
        .select("role, nome, fornecedor, fiscal").eq("id", id).maybeSingle();
      if (oldProfileErr) return json({ error: "Falha ao ler o perfil: " + oldProfileErr.message }, 500);

      if (role && !VALID_ROLES.includes(role)) return json({ error: "Perfil inválido." }, 400);
      if (id === userData.user.id && role && !FULL_ROLES.includes(role)) {
        return json({ error: "Você não pode retirar o próprio acesso completo." }, 400);
      }
      if (password && String(password).length < 6) return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);

      const authPatch: Record<string, unknown> = {};
      if (email) { authPatch.email = email; authPatch.email_confirm = true; }
      if (password) authPatch.password = password;
      if (Object.keys(authPatch).length) {
        const { error: updateAuthErr } = await admin.auth.admin.updateUserById(id, authPatch);
        if (updateAuthErr) return json({ error: updateAuthErr.message }, 400);
      }

      const merged = {
        id,
        role: role || oldProfile?.role,
        nome: nome !== undefined && nome !== null ? nome : oldProfile?.nome,
        fornecedor: fornecedor !== undefined ? fornecedor : oldProfile?.fornecedor,
        fiscal: fiscal !== undefined ? fiscal : oldProfile?.fiscal,
      };
      if (!merged.role) return json({ error: "Defina o perfil da conta." }, 400);
      if (merged.role !== "fornecedor") merged.fornecedor = null;
      merged.fiscal = null;
      if (merged.role === "fornecedor" && !merged.fornecedor) return json({ error: "Informe o nome do fornecedor." }, 400);

      const { error: profileErr } = await admin.from("profiles").upsert(merged);
      if (profileErr) return json({ error: "Erro ao salvar o perfil: " + profileErr.message }, 400);

      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});
