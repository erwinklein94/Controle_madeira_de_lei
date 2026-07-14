/* =====================================================================
   COMENTÁRIOS — mural da equipe (Supabase).
   Todos os usuários logados leem os comentários; a exclusão é restrita
   ao autor tanto na interface quanto no banco (RLS em comentarios).
   ===================================================================== */
(function () {
  "use strict";

  var sb = window.sbClient;
  var fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  var wired = false;
  var els = {};
  var userId = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function grab() {
    els = {
      form: document.getElementById("coment-form"),
      forn: document.getElementById("coment-fornecedor"),
      pedido: document.getElementById("coment-pedido"),
      texto: document.getElementById("coment-texto"),
      msg: document.getElementById("coment-msg"),
      lista: document.getElementById("coment-lista"),
      count: document.getElementById("coment-count"),
      refresh: document.getElementById("coment-refresh")
    };
  }

  function setup() {
    if (wired) return;
    grab();
    els.forn.addEventListener("change", fillPedidos);
    els.form.addEventListener("submit", onSubmit);
    els.refresh.addEventListener("click", render);
    els.lista.addEventListener("click", onListClick);
    wired = true;
  }

  function showMsg(text, ok) {
    els.msg.textContent = text || "";
    els.msg.className = "form-msg" + (ok === true ? " is-ok" : ok === false ? " is-error" : "");
  }

  /* Chamado toda vez que a aba é aberta. */
  function render() {
    setup();
    if (!sb) {
      els.lista.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>';
      return;
    }
    // Selects de fornecedor/pedido vêm dos registros cadastrados.
    Store.refresh().catch(function () { return null; }).then(function () {
      fillFornecedores();
      fillPedidos();
    });
    listar();
  }

  function fillSelect(sel, values) {
    var prev = sel.value;
    sel.innerHTML = '<option value="">Selecione…</option>';
    values.slice().sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }).forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    if (values.indexOf(prev) >= 0) sel.value = prev;
  }

  function fillFornecedores() {
    fillSelect(els.forn, Store.distinct(Store.getAll(), "fornecedor"));
  }

  /* A lista de pedidos acompanha o fornecedor escolhido. */
  function fillPedidos() {
    var forn = els.forn.value;
    var base = Store.getAll().filter(function (r) { return !forn || r.fornecedor === forn; });
    fillSelect(els.pedido, Store.distinct(base, "pedido"));
  }

  function listar() {
    Promise.all([
      sb.auth.getUser(),
      sb.from("comentarios")
        .select("id, autor_id, autor_nome, fornecedor, pedido, texto, created_at")
        .order("created_at", { ascending: false })
    ]).then(function (out) {
      userId = out[0].data && out[0].data.user ? out[0].data.user.id : null;
      var res = out[1];
      if (res.error) {
        els.count.textContent = "";
        els.lista.innerHTML = '<p class="card__hint">Não foi possível carregar os comentários (' + esc(res.error.message) + ").</p>";
        return;
      }
      draw(res.data || []);
    });
  }

  function draw(lista) {
    els.count.textContent = lista.length
      ? lista.length + (lista.length === 1 ? " comentário. " : " comentários. ") +
        "Apenas o autor de um comentário pode excluí-lo."
      : "Nenhum comentário ainda.";

    if (!lista.length) {
      els.lista.innerHTML =
        '<div class="empty"><div class="empty__title">Nenhum comentário ainda</div>' +
        '<div class="empty__txt">Use o formulário acima para deixar o primeiro comentário para a equipe.</div></div>';
      return;
    }

    els.lista.innerHTML = lista.map(function (c) {
      var meu = userId && c.autor_id === userId;
      return (
        '<article class="comentario">' +
          '<div class="comentario__head">' +
            '<span class="comentario__autor">' + esc(c.autor_nome || "Usuário") + "</span>" +
            '<span class="comentario__data">' + dataHora(c.created_at) + "</span>" +
            '<span class="comentario__tag">' + esc(c.fornecedor) + "</span>" +
            '<span class="comentario__tag comentario__tag--pedido">Pedido ' + esc(c.pedido) + "</span>" +
            (meu
              ? '<button class="btn btn--ghost btn--sm coment-del" data-id="' + c.id + '" type="button" title="Excluir meu comentário">Excluir</button>'
              : "") +
          "</div>" +
          '<p class="comentario__texto">' + esc(c.texto) + "</p>" +
        "</article>"
      );
    }).join("");
  }

  function onSubmit(e) {
    e.preventDefault();
    showMsg("");

    var forn = els.forn.value, ped = els.pedido.value, texto = els.texto.value.trim();
    if (!forn || !ped) { showMsg("Escolha o fornecedor e o pedido do comentário.", false); return; }
    if (!texto) { showMsg("Escreva o comentário antes de publicar.", false); return; }

    var prof = window.currentProfile || {};
    var btn = els.form.querySelector('button[type="submit"]');
    btn.disabled = true;
    sb.from("comentarios").insert({
      autor_nome: prof.nome || prof.fornecedor || null,
      fornecedor: forn,
      pedido: ped,
      texto: texto
    }).then(function (res) {
      btn.disabled = false;
      if (res.error) { showMsg("Erro ao publicar: " + res.error.message, false); return; }
      els.texto.value = "";
      showMsg("Comentário publicado.", true);
      listar();
    });
  }

  function onListClick(e) {
    var del = e.target.closest(".coment-del");
    if (!del) return;
    if (!confirm("Excluir este comentário? Esta ação não pode ser desfeita.")) return;
    sb.from("comentarios").delete().eq("id", del.getAttribute("data-id")).then(function (res) {
      if (res.error) { showMsg("Erro ao excluir: " + res.error.message, false); return; }
      listar();
    });
  }

  function dataHora(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "—" : fmtDataHora.format(d);
  }

  window.ComentariosUI = { render: render };
})();
