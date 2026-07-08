// =====================================================================
// Edge Function: manage-account — admin altera ou exclui qualquer conta.
// Deploy: Dashboard -> Edge Functions -> Deploy new function
//         Nome: manage-account  ->  cole este arquivo  ->  Deploy
// Regras de proteção: o admin não pode excluir a própria conta nem
// rebaixar o próprio papel (evita ficar trancado fora do sistema).
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Quem chama precisa estar logado e ser admin.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Não autenticado." }, 401);

    const { data: callerProfile } = await admin
      .from("profiles").select("role").eq("id", userData.user.id).single();
    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Apenas administradores podem gerenciar contas." }, 403);
    }

    const { action, id, email, password, role, nome, fornecedor } = await req.json();
    if (!id) return json({ error: "Conta não informada." }, 400);

    // ---------------- EXCLUIR ----------------
    if (action === "delete") {
      if (id === userData.user.id) {
        return json({ error: "Você não pode excluir a própria conta." }, 400);
      }
      const { error: delErr } = await admin.auth.admin.deleteUser(id);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    // ---------------- ALTERAR ----------------
    if (action === "update") {
      if (role && role !== "admin" && role !== "fornecedor") {
        return json({ error: "Papel inválido." }, 400);
      }
      if (id === userData.user.id && role && role !== "admin") {
        return json({ error: "Você não pode rebaixar o próprio papel." }, 400);
      }
      if (password && String(password).length < 6) {
        return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      }

      // Login (e-mail/senha) — só o que foi enviado.
      const authPatch: Record<string, unknown> = {};
      if (email) { authPatch.email = email; authPatch.email_confirm = true; }
      if (password) authPatch.password = password;
      if (Object.keys(authPatch).length) {
        const { error: upErr } = await admin.auth.admin.updateUserById(id, authPatch);
        if (upErr) return json({ error: upErr.message }, 400);
      }

      // Perfil — mescla com o existente (funciona até para conta sem perfil).
      const { data: existing } = await admin
        .from("profiles").select("role, nome, fornecedor").eq("id", id).maybeSingle();
      const merged = {
        id,
        role: role || (existing ? existing.role : null),
        nome: nome !== undefined && nome !== null ? nome : (existing ? existing.nome : null),
        fornecedor: fornecedor !== undefined && fornecedor !== null ? fornecedor : (existing ? existing.fornecedor : null),
      };
      if (!merged.role) return json({ error: "Defina o papel da conta (admin ou fornecedor)." }, 400);
      if (merged.role === "admin") merged.fornecedor = null;
      if (merged.role === "fornecedor" && !merged.fornecedor) {
        return json({ error: "Informe o nome do fornecedor." }, 400);
      }

      const { error: profErr } = await admin.from("profiles").upsert(merged);
      if (profErr) return json({ error: "Erro ao salvar o perfil: " + profErr.message }, 400);

      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
