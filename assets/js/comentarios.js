/* =====================================================================
   COMENTÁRIOS — mural da equipe + comentários na área do fornecedor.
   Regras (espelhadas no RLS da tabela comentarios):
   - perfis de acesso completo leem tudo e podem excluir qualquer comentário;
   - fornecedor só lê/cria comentários do próprio fornecedor;
   - o autor pode excluir o próprio comentário.
   ===================================================================== */
(function () {
  "use strict";

  var sb = window.sbClient;
  var fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function dataHora(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "—" : fmtDataHora.format(d);
  }

  function isAdmin() {
    return !!(window.currentProfile && window.AccessControl && window.AccessControl.isFull(window.currentProfile.role));
  }

  /* Card de um comentário. showForn: mostra a etiqueta do fornecedor.
     showAutorTag: etiqueta com o papel do autor (para listas mistas). */
  function comentarioHtml(c, userId, showForn, showAutorTag) {
    var podeExcluir = (userId && c.autor_id === userId) || isAdmin();
    var tagAutor = !showAutorTag ? "" : (c.autor_role === "fornecedor"
      ? '<span class="comentario__tag comentario__tag--autor">Fornecedor</span>'
      : '<span class="comentario__tag">Equipe Rumo</span>');
    return (
      '<article class="comentario">' +
        '<div class="comentario__head">' +
          '<span class="comentario__autor">' + esc(c.autor_nome || "Usuário") + "</span>" +
          tagAutor +
          '<span class="comentario__data">' + dataHora(c.created_at) + "</span>" +
          (showForn ? '<span class="comentario__tag">' + esc(c.fornecedor) + "</span>" : "") +
          '<span class="comentario__tag comentario__tag--pedido">Pedido ' + esc(c.pedido) + "</span>" +
          (podeExcluir
            ? '<button class="btn btn--ghost btn--sm coment-del" data-id="' + c.id + '" type="button" title="Excluir comentário">Excluir</button>'
            : "") +
        "</div>" +
        '<p class="comentario__texto">' + esc(c.texto) + "</p>" +
      "</article>"
    );
  }

  function listarComentarios() {
    return Promise.all([
      sb.auth.getUser(),
      sb.from("comentarios")
        .select("id, autor_id, autor_nome, autor_role, fornecedor, pedido, texto, created_at")
        .order("created_at", { ascending: false })
    ]).then(function (out) {
      var userId = out[0].data && out[0].data.user ? out[0].data.user.id : null;
      return { userId: userId, res: out[1] };
    });
  }

  /* ================== PÁGINA DO ADMIN (menu Comentários) ================== */
  (function () {

  var wired = false;
  var els = {};
  var userId = null;

  function grab() {
    els = {
      form: document.getElementById("coment-form"),
      forn: document.getElementById("coment-fornecedor"),
      pedido: document.getElementById("coment-pedido"),
      texto: document.getElementById("coment-texto"),
      msg: document.getElementById("coment-msg"),
      listaEquipe: document.getElementById("coment-lista-equipe"),
      countEquipe: document.getElementById("coment-count-equipe"),
      listaForn: document.getElementById("coment-lista-forn"),
      countForn: document.getElementById("coment-count-forn"),
      refresh: document.getElementById("coment-refresh")
    };
  }

  function setup() {
    if (wired) return;
    grab();
    els.forn.addEventListener("change", fillPedidos);
    els.form.addEventListener("submit", onSubmit);
    els.refresh.addEventListener("click", render);
    els.listaEquipe.addEventListener("click", onListClick);
    els.listaForn.addEventListener("click", onListClick);
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
      els.listaEquipe.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>';
      els.listaForn.innerHTML = "";
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
    var values = Store.distinct(Store.getAll(), "fornecedor");
    fillSelect(els.forn, values);
  }

  /* A lista de pedidos acompanha o fornecedor escolhido. */
  function fillPedidos() {
    var forn = els.forn.value;
    var base = Store.getAll().filter(function (r) { return !forn || r.fornecedor === forn; });
    var values = Store.distinct(base, "pedido");
    fillSelect(els.pedido, values);
  }

  function listar() {
    listarComentarios().then(function (out) {
      userId = out.userId;
      var res = out.res;
      if (res.error) {
        els.countEquipe.textContent = "";
        els.countForn.textContent = "";
        els.listaEquipe.innerHTML = '<p class="card__hint">Não foi possível carregar os comentários (' + esc(res.error.message) + ").</p>";
        els.listaForn.innerHTML = "";
        return;
      }
      draw(res.data || []);
    });
  }

  function draw(lista) {
    var equipe = lista.filter(function (c) { return c.autor_role !== "fornecedor"; });
    var forn = lista.filter(function (c) { return c.autor_role === "fornecedor"; });
    drawGrupo(els.listaEquipe, els.countEquipe, equipe,
      "Use o formulário acima para deixar o primeiro comentário para a equipe.");
    drawGrupo(els.listaForn, els.countForn, forn,
      "Os comentários que os fornecedores fizerem na área deles aparecem aqui.");
  }

  function drawGrupo(listaEl, countEl, lista, textoVazio) {
    countEl.textContent = lista.length
      ? lista.length + (lista.length === 1 ? " comentário. " : " comentários. ") +
        "O autor pode excluir o próprio comentário; usuários com acesso completo podem excluir qualquer um."
      : "Nenhum comentário ainda.";

    if (!lista.length) {
      listaEl.innerHTML =
        '<div class="empty"><div class="empty__title">Nenhum comentário ainda</div>' +
        '<div class="empty__txt">' + textoVazio + "</div></div>";
      return;
    }

    listaEl.innerHTML = lista.map(function (c) {
      return comentarioHtml(c, userId, true, false);
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
      autor_role: prof.role || null,
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

  window.ComentariosUI = { render: render };
  })();

  /* ============== ÁREA DO FORNECEDOR (comentários dos pedidos) ============== */
  (function () {

  var wired = false;
  var els = {};
  var userId = null;

  function grab() {
    els = {
      form: document.getElementById("forncom-form"),
      pedido: document.getElementById("forncom-pedido"),
      texto: document.getElementById("forncom-texto"),
      msg: document.getElementById("forncom-msg"),
      lista: document.getElementById("forncom-lista"),
      count: document.getElementById("forncom-count")
    };
  }

  function setup() {
    if (wired) return;
    grab();
    els.form.addEventListener("submit", onSubmit);
    els.lista.addEventListener("click", onListClick);
    wired = true;
  }

  function showMsg(text, ok) {
    els.msg.textContent = text || "";
    els.msg.className = "form-msg" + (ok === true ? " is-ok" : ok === false ? " is-error" : "");
  }

  /* Chamado no login do fornecedor (auth.js). */
  function render() {
    setup();
    if (!sb) {
      els.lista.innerHTML = '<p class="card__hint">Sem conexão com o servidor.</p>';
      return;
    }
    fillPedidos();
    listar();
  }

  /* Pedidos do PRÓPRIO fornecedor: registros + envios dele. O RLS já
     devolve só as linhas do fornecedor logado nas duas tabelas. */
  function fillPedidos() {
    Promise.all([
      sb.from("registros").select("pedido"),
      sb.from("pendencias").select("pedido")
    ]).then(function (out) {
      var seen = {};
      out.forEach(function (res) {
        (res.data || []).forEach(function (r) { if (r.pedido) seen[r.pedido] = true; });
      });
      var prev = els.pedido.value;
      els.pedido.innerHTML = '<option value="">Selecione…</option>';
      Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); }).forEach(function (p) {
        var o = document.createElement("option");
        o.value = p; o.textContent = p;
        els.pedido.appendChild(o);
      });
      if (seen[prev]) els.pedido.value = prev;
    });
  }

  function listar() {
    listarComentarios().then(function (out) {
      userId = out.userId;
      var res = out.res;
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
      ? lista.length + (lista.length === 1 ? " comentário" : " comentários") + " sobre os seus pedidos."
      : "Nenhum comentário ainda.";

    if (!lista.length) {
      els.lista.innerHTML =
        '<div class="empty"><div class="empty__title">Nenhum comentário ainda</div>' +
        '<div class="empty__txt">Use o formulário acima para deixar um comentário para a equipe Rumo.</div></div>';
      return;
    }

    // showForn = false (só há um fornecedor aqui); a etiqueta do autor
    // distingue os comentários dele dos da equipe Rumo.
    els.lista.innerHTML = lista.map(function (c) {
      return comentarioHtml(c, userId, false, true);
    }).join("");
  }

  function onSubmit(e) {
    e.preventDefault();
    showMsg("");

    var prof = window.currentProfile || {};
    var ped = els.pedido.value, texto = els.texto.value.trim();
    if (!prof.fornecedor) { showMsg("Seu perfil não tem fornecedor definido. Fale com a equipe responsável.", false); return; }
    if (!ped) { showMsg("Escolha o pedido do comentário.", false); return; }
    if (!texto) { showMsg("Escreva o comentário antes de publicar.", false); return; }

    var btn = els.form.querySelector('button[type="submit"]');
    btn.disabled = true;
    sb.from("comentarios").insert({
      autor_nome: prof.nome || prof.fornecedor || null,
      autor_role: prof.role || "fornecedor",
      fornecedor: prof.fornecedor,
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

  window.FornComentariosUI = { render: render };
  })();
})();
