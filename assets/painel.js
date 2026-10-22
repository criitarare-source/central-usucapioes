(function () {
  'use strict';
  var C = window.CENTRAL;
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var fmtDate = function (iso) { return new Date(iso).toLocaleDateString('pt-BR'); };
  var fmtDT = function (iso) { var d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' às ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  var fmtYMD = function (s) { var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  var daysLeft = function (s) {
    var p = s.split('-').map(Number), t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((new Date(p[0], p[1] - 1, p[2]) - t) / 86400000);
  };
  var daysSince = function (iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86400000)); };
  var plural = function (n, a, b) { return n === 1 ? a : b; };
  var mask = function (e) { var p = String(e).split('@'); return p[0] ? p[0][0] + '***@' + (p[1] || '') : e; };
  var LOGO = '/assets/logo.jpg';

  var ICON = {
    clock: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
    grip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  /* ---------- estado ---------- */
  var S = { me: null, fases: [], equipe: [], procs: [], view: 'quadro', emails: null };
  var F = { q: '', resp: 'all', att: false };
  var dragging = false, needReload = false, channel = null, recovering = false;

  var faseById = function (id) { return S.fases.find(function (f) { return f.id === id; }) || { id: id, nome: 'Fase ' + id }; };
  var userById = function (id) { return S.equipe.find(function (u) { return u.id === id; }); };
  var userName = function (id) { var u = userById(id); return u ? u.nome : 'Sem responsável'; };
  var userIdx = function (id) { var i = S.equipe.filter(function (u) { return u.aprovado; }).findIndex(function (u) { return u.id === id; }); return Math.max(0, i); };
  var initials = function (n) { return n === 'Oficial' ? 'OF' : String(n).trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  var avatar = function (id) { var n = userName(id); return '<span class="av" style="--i:' + (userIdx(id) % 4) + '" aria-hidden="true">' + esc(initials(n)) + '</span>'; };
  var isOficial = function () { return S.me && S.me.papel === 'oficial'; };
  var byId = function (id) { return S.procs.find(function (p) { return p.id === id; }); };

  function phaseColor(id) {
    if (id === 3) return 'var(--warn)';
    if (id === 8) return 'var(--ok)';
    if (id === 9) return 'var(--bad)';
    var i = { 1: 0, 2: 1, 4: 2, 5: 3, 6: 4, 7: 5 }[id] || 0;
    return 'color-mix(in srgb, var(--gold) ' + (i * 18) + '%, var(--green-2))';
  }

  var toastT;
  function toast(t) {
    var el = $('#toast'); el.textContent = t; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 5000);
  }
  function errText(e) {
    var m = (e && e.message) || 'Erro inesperado.';
    if (e && e.code === '23505') return 'Já existe um processo com este protocolo.';
    if (e && e.code === '23514') return 'Algum campo está fora do formato permitido. Confira os dados.';
    return m;
  }

  /* ---------- autenticação ---------- */
  function authShell(inner) {
    $('#root').innerHTML = '<div class="center-screen"><div class="auth-card"><div class="plaque"><img src="' + LOGO + '" alt="Registro de Imóveis de Itararé"></div>' + inner + '</div></div>';
  }

  function showAuth(mode, note) {
    mode = mode || 'login';
    var title = mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Recuperar senha';
    var sub = mode === 'login' ? 'Painel interno das usucapiões.' : mode === 'signup' ? 'Depois do cadastro, o Oficial precisa aprovar o seu acesso.' : 'Enviaremos um link para criar uma nova senha.';
    authShell(
      '<h1>' + title + '</h1><p class="sub">' + sub + '</p>' +
      '<form id="fAuth" novalidate>' +
      (mode === 'signup' ? '<label for="aNome">Seu nome</label><input id="aNome" autocomplete="name" placeholder="Como aparece nos cartões">' : '') +
      '<label for="aMail">E-mail</label><input id="aMail" type="email" autocomplete="email" placeholder="nome@cartorio.com.br">' +
      (mode !== 'reset' ? '<label for="aPass">Senha</label><input id="aPass" type="password" autocomplete="' + (mode === 'login' ? 'current-password' : 'new-password') + '" placeholder="' + (mode === 'signup' ? 'Mínimo de 8 caracteres' : '') + '">' : '') +
      '<div id="aMsg">' + (note ? '<div class="msg ' + note.k + '">' + esc(note.t) + '</div>' : '') + '</div>' +
      '<button class="btn primary" type="submit" id="aBtn">' + (mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link') + '</button></form>' +
      '<div class="links">' +
      (mode === 'login' ? '<button class="linkbtn" data-m="signup">Criar conta</button><button class="linkbtn" data-m="reset">Esqueci a senha</button>' : '<button class="linkbtn" data-m="login">Voltar para entrar</button>') +
      '</div>'
    );
    document.querySelectorAll('.links .linkbtn').forEach(function (b) { b.onclick = function () { showAuth(b.dataset.m); }; });
    $('#fAuth').onsubmit = function (e) { e.preventDefault(); submitAuth(mode); };
    var first = $('#aNome') || $('#aMail'); if (first) first.focus();
  }

  function setMsg(k, t) { $('#aMsg').innerHTML = '<div class="msg ' + k + '">' + esc(t) + '</div>'; }

  function submitAuth(mode) {
    var mail = $('#aMail').value.trim(), pass = $('#aPass') ? $('#aPass').value : '', btn = $('#aBtn');
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setMsg('err', 'Informe um e-mail válido.');
    if (mode !== 'reset' && pass.length < 8) return setMsg('err', 'A senha precisa ter pelo menos 8 caracteres.');
    btn.disabled = true;
    var p;
    if (mode === 'login') {
      p = sb.auth.signInWithPassword({ email: mail, password: pass }).then(function (r) {
        if (r.error) { setMsg('err', r.error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : r.error.message === 'Email not confirmed' ? 'Confirme seu e-mail pelo link que enviamos e tente de novo.' : r.error.message); return; }
        return enter();
      });
    } else if (mode === 'signup') {
      var nome = $('#aNome').value.trim();
      if (nome.length < 2) { btn.disabled = false; return setMsg('err', 'Informe o seu nome.'); }
      p = sb.auth.signUp({ email: mail, password: pass, options: { data: { nome: nome }, emailRedirectTo: location.origin + '/painel' } }).then(function (r) {
        if (r.error) { setMsg('err', r.error.message); return; }
        if (r.data && r.data.session) return enter();
        showAuth('login', { k: 'ok', t: 'Conta criada. Confirme seu e-mail pelo link que enviamos e depois entre. O Oficial vai aprovar o seu acesso.' });
      });
    } else {
      p = sb.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + '/painel' }).then(function (r) {
        if (r.error) { setMsg('err', r.error.message); return; }
        setMsg('ok', 'Se esse e-mail tiver conta, enviamos o link para criar uma nova senha.');
      });
    }
    p.then(function () { var b = $('#aBtn'); if (b) b.disabled = false; });
  }

  function showRecovery() {
    recovering = true;
    authShell('<h1>Nova senha</h1><p class="sub">Escolha uma senha nova para a sua conta.</p><form id="fRec" novalidate><label for="rPass">Nova senha</label><input id="rPass" type="password" autocomplete="new-password" placeholder="Mínimo de 8 caracteres"><div id="aMsg"></div><button class="btn primary" type="submit" id="aBtn">Salvar senha</button></form>');
    $('#fRec').onsubmit = function (e) {
      e.preventDefault();
      var v = $('#rPass').value;
      if (v.length < 8) return setMsg('err', 'A senha precisa ter pelo menos 8 caracteres.');
      sb.auth.updateUser({ password: v }).then(function (r) {
        if (r.error) return setMsg('err', r.error.message);
        recovering = false; history.replaceState(null, '', '/painel'); enter();
      });
    };
  }

  function showPending() {
    authShell('<h1>Aguardando aprovação</h1><p class="sub">Sua conta (' + esc(S.me.email) + ') foi criada. O Oficial precisa liberar o seu acesso antes de você ver os processos.</p>' +
      '<div class="msg info">Volte depois e entre de novo. Se for urgente, avise o Oficial.</div>' +
      '<button class="btn" id="bOut">Sair</button><button class="btn ghost" id="bRe">Verificar de novo</button>');
    $('#bOut').onclick = signOut; $('#bRe').onclick = enter;
  }

  function signOut() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    sb.auth.signOut().then(function () { S = { me: null, fases: [], equipe: [], procs: [], view: 'quadro', emails: null }; showAuth('login'); });
  }

  /* ---------- carga de dados ---------- */
  function enter() {
    return sb.auth.getUser().then(function (r) {
      if (!r.data || !r.data.user) { showAuth('login'); return; }
      return sb.from('perfis').select('*').eq('id', r.data.user.id).maybeSingle().then(function (pr) {
        if (pr.error || !pr.data) { showAuth('login', { k: 'err', t: 'Não foi possível carregar o seu perfil. Tente de novo.' }); return; }
        S.me = pr.data;
        if (!S.me.aprovado) { showPending(); return; }
        $('#root').innerHTML = '<div class="loading">Carregando processos…</div>';
        return loadAll().then(function (ok) { if (ok) { renderApp(); subscribe(); } });
      });
    });
  }

  function loadAll() {
    return Promise.all([
      sb.from('fases').select('*').order('ordem'),
      sb.from('perfis').select('id,nome,email,papel,aprovado,criado_em').order('nome'),
      sb.from('processos').select('*').order('ord')
    ]).then(function (r) {
      var bad = r.find(function (x) { return x.error; });
      if (bad) { $('#root').innerHTML = '<div class="loading">Não foi possível carregar os dados: ' + esc(bad.error.message) + '</div>'; return false; }
      S.fases = r[0].data; S.equipe = r[1].data; S.procs = r[2].data; return true;
    });
  }

  var reloadT;
  function reloadProcs() {
    if (dragging) { needReload = true; return Promise.resolve(); }
    return sb.from('processos').select('*').order('ord').then(function (r) {
      if (r.error) return;
      S.procs = r.data;
      if (S.view === 'quadro' && $('#board')) { renderStats(); renderBoard(); }
      var d = $('#dDetail');
      if (d.open && d.dataset.id) fillDetail(+d.dataset.id);
    });
  }
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('processos-ao-vivo').on('postgres_changes', { event: '*', schema: 'public', table: 'processos' }, function () {
      clearTimeout(reloadT); reloadT = setTimeout(reloadProcs, 300);
    }).subscribe();
  }

  /* ---------- estrutura do app ---------- */
  function pendentesCount() { return S.equipe.filter(function (u) { return !u.aprovado; }).length; }

  function renderApp() {
    var tabs = '<button class="tab" role="tab" data-view="quadro" aria-selected="' + (S.view === 'quadro') + '">Quadro</button>';
    if (isOficial()) {
      var n = pendentesCount();
      tabs += '<button class="tab" role="tab" data-view="equipe" aria-selected="' + (S.view === 'equipe') + '">Equipe' + (n ? '<span class="badge-n">' + n + '</span>' : '') + '</button>' +
        '<button class="tab" role="tab" data-view="emails" aria-selected="' + (S.view === 'emails') + '">E-mails</button>';
    }
    $('#root').innerHTML =
      '<div class="app"><header class="top"><div class="top-in gut">' +
      '<img class="logo" src="' + LOGO + '" alt="Registro de Imóveis de Itararé">' +
      '<div class="brand"><h1>Central de Usucapiões</h1><p>Usucapião extrajudicial · Itararé</p></div>' +
      '<nav class="tabs" role="tablist" aria-label="Seções">' + tabs + '</nav>' +
      '<div class="who2"><span>' + esc(S.me.nome) + (isOficial() ? ' · Oficial' : '') + '</span><a href="/" target="_blank" rel="noopener">Página do cliente</a><button class="btn" id="bOut">Sair</button></div>' +
      '</div></header><div id="body" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>';
    $('#bOut').onclick = signOut;
    document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { S.view = t.dataset.view; renderApp(); }; });
    if (S.view === 'equipe' && isOficial()) renderEquipe();
    else if (S.view === 'emails' && isOficial()) renderEmails();
    else renderQuadro();
  }

  /* ---------- quadro ---------- */
  function attention(p) {
    if (p.fase_id >= 8) return null;
    if (p.fase_id === 5 && p.prazo_edital) {
      var d = daysLeft(p.prazo_edital);
      if (d < 0) return { t: 'Prazo do edital encerrado', c: 'bad' };
      if (d <= 15) return { t: d === 0 ? 'Prazo termina hoje' : 'Faltam ' + d + ' ' + plural(d, 'dia', 'dias'), c: 'warn' };
    }
    if (p.fase_id !== 3 && daysSince(p.fase_desde) > 30) return { t: 'Parado há ' + daysSince(p.fase_desde) + ' dias', c: 'warn' };
    return null;
  }
  function visible(p) {
    if (F.resp !== 'all' && p.responsavel_id !== F.resp) return false;
    if (F.att && !attention(p) && p.fase_id !== 3) return false;
    if (F.q) { var t = (p.protocolo + ' ' + p.requerente_nome + ' ' + p.imovel).toLowerCase(); if (t.indexOf(F.q.toLowerCase()) < 0) return false; }
    return true;
  }

  function renderQuadro() {
    $('#body').innerHTML =
      '<div class="toolbar gut"><div class="search">' + ICON.search + '<input id="q" type="search" placeholder="Buscar protocolo, nome ou imóvel" aria-label="Buscar processo" value="' + esc(F.q) + '"></div>' +
      '<div class="chips" id="resps" role="group" aria-label="Filtrar por escrevente"></div>' +
      '<button type="button" class="fchip plain" id="fAtt" aria-pressed="' + F.att + '">Só os que pedem atenção</button>' +
      '<button type="button" class="btn primary" id="bNew">' + ICON.plus + 'Novo processo</button></div>' +
      '<div class="stats gut" id="stats"></div><div class="board gut" id="board" aria-label="Quadro de processos"></div>';
    $('#q').oninput = function (e) { F.q = e.target.value.trim(); renderBoard(); };
    $('#fAtt').onclick = function () { F.att = !F.att; $('#fAtt').setAttribute('aria-pressed', F.att); renderBoard(); };
    $('#bNew').onclick = openNew;
    renderResps(); renderStats(); renderBoard();
  }

  function renderResps() {
    var aprov = S.equipe.filter(function (u) { return u.aprovado; });
    $('#resps').innerHTML = '<button type="button" class="fchip plain" data-resp="all" aria-pressed="' + (F.resp === 'all') + '">Todos</button>' +
      aprov.map(function (u) { return '<button type="button" class="fchip" data-resp="' + u.id + '" aria-pressed="' + (F.resp === u.id) + '">' + avatar(u.id) + esc(u.nome) + '</button>'; }).join('');
    document.querySelectorAll('#resps .fchip').forEach(function (b) { b.onclick = function () { F.resp = b.dataset.resp; renderResps(); renderBoard(); }; });
  }

  function renderStats() {
    var act = S.procs.filter(function (p) { return p.fase_id < 8; });
    var venc = act.filter(function (p) { return p.fase_id === 5 && p.prazo_edital && daysLeft(p.prazo_edital) <= 15; }).length;
    var par = act.filter(function (p) { return p.fase_id !== 3 && daysSince(p.fase_desde) > 30; }).length;
    var aw = S.procs.filter(function (p) { return p.fase_id === 3; }).length;
    var done = S.procs.filter(function (p) { return p.fase_id === 8; }).length;
    var st = function (n, l, a) { return '<div class="stat ' + (a && n ? 'alert' : '') + '"><b>' + n + '</b><span>' + l + '</span></div>'; };
    $('#stats').innerHTML = st(act.length, 'em andamento') + st(venc, 'editais vencendo em 15 dias', 1) + st(par, 'parados há mais de 30 dias', 1) + st(aw, 'aguardando o requerente') + st(done, 'concluídos');
  }

  function cardHTML(p) {
    var a = attention(p), tags = [];
    if (p.fase_id === 3) tags.push('<span class="chip warn">Aguardando requerente</span>');
    if (p.fase_id === 5) {
      if (p.prazo_edital) {
        var d = daysLeft(p.prazo_edital);
        tags.push('<span class="chip ' + (d < 0 ? 'bad' : d <= 15 ? 'warn' : 'gold') + '">' + ICON.clock + ' Edital até ' + fmtYMD(p.prazo_edital).slice(0, 5) + ' · ' + (d < 0 ? 'encerrado' : d === 0 ? 'hoje' : d + ' ' + plural(d, 'dia', 'dias')) + '</span>');
      } else tags.push('<span class="chip">Prazo do edital não informado</span>');
    }
    if (a && p.fase_id !== 5) tags.push('<span class="chip ' + a.c + '">' + esc(a.t) + '</span>');
    var age = daysSince(p.fase_desde);
    return '<article class="card" data-id="' + p.id + '" tabindex="0" role="button" aria-label="Processo ' + esc(p.protocolo) + ', ' + esc(p.requerente_nome) + ', responsável ' + esc(userName(p.responsavel_id)) + '">' +
      '<div class="card-top"><span class="proto">' + esc(p.protocolo) + '</span><span class="grip" aria-hidden="true">' + ICON.grip + '</span></div>' +
      '<div class="nome">' + esc(p.requerente_nome) + '</div><div class="imovel">' + esc(p.imovel) + '</div>' +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') +
      '<div class="card-foot">' + avatar(p.responsavel_id) + '<span class="resp">' + esc(userName(p.responsavel_id)) + '</span><span class="age">' + (age === 0 ? 'hoje' : 'há ' + age + ' ' + plural(age, 'dia', 'dias')) + '</span></div></article>';
  }

  var sortables = [], lastDrag = 0;
  function renderBoard() {
    var b = $('#board'); if (!b) return;
    var sx = b.scrollLeft;
    b.innerHTML = S.fases.map(function (f) {
      var items = S.procs.filter(function (p) { return p.fase_id === f.id && visible(p); }).sort(function (x, y) { return x.ord - y.ord; });
      return '<section class="col" style="--c:' + phaseColor(f.id) + '"><div class="col-h"><h2>' + esc(f.nome) + '</h2><span class="count">' + items.length + '</span></div><div class="list" data-phase="' + f.id + '">' + items.map(cardHTML).join('') + '</div></section>';
    }).join('');
    b.scrollLeft = sx;
    sortables.forEach(function (s) { s.destroy(); }); sortables = [];
    if (typeof Sortable === 'undefined') return;
    var clearOver = function () { document.querySelectorAll('.col.is-over').forEach(function (c) { c.classList.remove('is-over'); }); };
    document.querySelectorAll('.list').forEach(function (el) {
      sortables.push(new Sortable(el, {
        group: 'board', animation: 160, draggable: '.card', forceFallback: true, fallbackOnBody: true, fallbackTolerance: 4,
        delay: 170, delayOnTouchOnly: true, touchStartThreshold: 6,
        ghostClass: 'is-ghost', chosenClass: 'is-chosen', dragClass: 'is-drag',
        onStart: function () { dragging = true; },
        onMove: function (e) { clearOver(); e.to.closest('.col').classList.add('is-over'); },
        onEnd: function (e) {
          clearOver(); lastDrag = Date.now(); dragging = false;
          var id = +e.item.dataset.id, to = +e.to.dataset.phase, p = byId(id);
          var pv = e.item.previousElementSibling, nx = e.item.nextElementSibling;
          var po = pv && pv.dataset.id ? byId(+pv.dataset.id).ord : null, no = nx && nx.dataset.id ? byId(+nx.dataset.id).ord : null;
          var ord = p.ord;
          if (po != null && no != null) ord = (po + no) / 2; else if (po != null) ord = po + 1; else if (no != null) ord = no - 1;
          if (to === p.fase_id) {
            if (ord !== p.ord) { p.ord = ord; sb.from('processos').update({ ord: ord }).eq('id', id).then(function (r) { if (r.error) toast(errText(r.error)); }); }
            if (needReload) { needReload = false; reloadProcs(); }
          } else openMove(id, to, ord);
        }
      }));
    });
  }

  /* ---------- mover processo ---------- */
  var pending = null;
  function mailHTML(p, to, msg, prazo) {
    var f = faseById(to);
    return '<div class="mail"><div class="mail-meta"><div><b>De:</b> Registro de Imóveis de Itararé</div><div><b>Para:</b> ' + esc(mask(p.requerente_email)) + '</div><div><b>Assunto:</b> Usucapião ' + esc(p.protocolo) + ': seu pedido mudou de etapa</div></div>' +
      '<div class="mail-body"><p>Olá! O andamento do seu pedido de usucapião extrajudicial foi atualizado.</p>' +
      '<p class="mail-stage"><span>Nova etapa</span><strong>' + esc(f.nome) + '</strong><em>' + fmtDate(new Date()) + '</em></p>' +
      '<p>' + esc(f.descricao_publica || '') + '</p>' + (msg ? '<blockquote>' + esc(msg) + '</blockquote>' : '') +
      (prazo ? '<p>O prazo do edital termina em <b>' + fmtYMD(prazo) + '</b>.</p>' : '') +
      '<p><span class="btn primary sm" style="display:inline-block">Acompanhar meu pedido</span></p>' +
      '<p class="muted small" style="margin:0">Você recebe um e-mail a cada mudança de etapa. Para consultar quando quiser, use o protocolo ' + esc(p.protocolo) + ' na página de acompanhamento do cartório.</p></div></div>';
  }

  function openMove(id, to, ord) {
    var p = byId(id); if (!p || p.fase_id === to) { renderBoard(); return; }
    pending = { id: id, to: to, ord: ord };
    var f = faseById(to), from = faseById(p.fase_id), d = $('#dMove');
    d.innerHTML = '<div class="m-in"><h2>Mover processo ' + esc(p.protocolo) + '</h2><div class="muted">' + esc(p.requerente_nome) + '</div>' +
      '<div class="route"><span class="pill" style="--c:' + phaseColor(p.fase_id) + '">' + esc(from.nome) + '</span>' + ICON.arrow + '<span class="pill" style="--c:' + phaseColor(to) + '">' + esc(f.nome) + '</span></div>' +
      (to >= 8 ? '<div class="warnbox">' + (to === 8 ? 'Esta fase conclui o procedimento.' : 'Esta fase encerra o procedimento extrajudicial.') + ' Confira a mensagem antes de confirmar.</div>' : '') +
      '<label for="mvMsg">Mensagem para o requerente <span class="opt">(opcional)</span></label>' +
      '<textarea id="mvMsg" rows="3" maxlength="600" placeholder="Ex.: As notificações aos confrontantes foram expedidas."></textarea>' +
      '<p class="hint">Aparece na consulta pública e no e-mail. Não escreva CPF, endereço ou nomes de terceiros.</p>' +
      (to === 5 ? '<label for="mvPrazo">Prazo do edital termina em <span class="opt">(opcional)</span></label><input type="date" id="mvPrazo"><p class="hint">Deixe em branco se ainda não souber. Dá para informar depois.</p>' : '') +
      '<label class="check"><input type="checkbox" id="mvEmail" checked> Enviar e-mail ao requerente</label>' +
      '<details class="prev"><summary>Ver prévia do e-mail</summary><div id="mvPrev"></div></details>' +
      '<div class="err" id="mvErr" role="alert"></div>' +
      '<div class="m-f"><button type="button" class="btn ghost" id="mvCancel">Cancelar</button><button type="button" class="btn primary" id="mvOk">Confirmar mudança</button></div></div>';
    var upd = function () { $('#mvPrev').innerHTML = mailHTML(p, to, $('#mvMsg').value.trim(), $('#mvPrazo') ? $('#mvPrazo').value : ''); };
    d.oninput = upd; upd();
    $('#mvCancel').onclick = function () { d.close(); };
    $('#mvOk').onclick = confirmMove;
    d.showModal(); setTimeout(function () { var m = $('#mvMsg'); if (m) m.focus(); }, 30);
  }
  $('#dMove').addEventListener('close', function () { if (pending) { pending = null; renderBoard(); } });

  function confirmMove() {
    var pm = pending; if (!pm) return;
    var p = byId(pm.id), to = pm.to, btn = $('#mvOk');
    var msg = $('#mvMsg').value.trim().slice(0, 600);
    var prazo = to === 5 && $('#mvPrazo') && $('#mvPrazo').value ? $('#mvPrazo').value : null;
    var mail = $('#mvEmail').checked;
    btn.disabled = true;
    sb.rpc('mover_processo', { p_id: pm.id, p_fase: to, p_mensagem: msg || null, p_prazo: prazo, p_email: mail, p_ord: pm.ord }).then(function (r) {
      btn.disabled = false;
      if (r.error) { $('#mvErr').textContent = errText(r.error); return; }
      pending = null; $('#dMove').close();
      toast('Processo ' + p.protocolo + ' movido para “' + faseById(to).nome + '”.' + (mail ? ' E-mail ao requerente na fila de envio.' : ''));
      reloadProcs();
    });
  }

  /* ---------- detalhe ---------- */
  function fillDetail(id) {
    var p = byId(id); if (!p) { $('#dDetail').close(); return; }
    var d = $('#dDetail'); d.dataset.id = id;
    sb.from('historico').select('*').eq('processo_id', id).order('em', { ascending: false }).then(function (r) {
      if (!d.open || +d.dataset.id !== id) return;
      var hist = r.data || [], pa = byId(id) || p;
      var aprov = S.equipe.filter(function (u) { return u.aprovado; });
      d.innerHTML = '<div class="sh"><div class="sh-h"><div><h2>' + esc(pa.protocolo) + '</h2><div class="muted">' + esc(pa.requerente_nome) + '</div></div><button type="button" class="x" id="dtClose" aria-label="Fechar">' + ICON.x + '</button></div><div class="sh-b">' +
        '<h3>Andamento</h3><label for="dtFase">Fase atual</label><select id="dtFase">' + S.fases.map(function (f) { return '<option value="' + f.id + '"' + (f.id === pa.fase_id ? ' selected' : '') + '>' + esc(f.nome) + '</option>'; }).join('') + '</select>' +
        '<p class="hint">Ao escolher outra fase, o sistema pede a mensagem ao requerente antes de confirmar.</p>' +
        '<label for="dtResp">Escrevente responsável</label><select id="dtResp"><option value=""' + (pa.responsavel_id ? '' : ' selected') + '>Sem responsável</option>' + aprov.map(function (u) { return '<option value="' + u.id + '"' + (u.id === pa.responsavel_id ? ' selected' : '') + '>' + esc(u.nome) + '</option>'; }).join('') + '</select>' +
        (pa.fase_id === 5 ? '<label for="dtPrazo">Prazo do edital termina em <span class="opt">(opcional)</span></label><div class="row2"><input type="date" id="dtPrazo" value="' + esc(pa.prazo_edital || '') + '"><button type="button" class="btn sm" id="dtPrazoBtn">Salvar prazo</button></div><p class="hint">O requerente recebe a data por e-mail e a vê na consulta pública.</p>' : '') +
        '<h3>Notas internas</h3><label for="dtNotes">Só a equipe vê estas notas</label><textarea id="dtNotes" rows="3" maxlength="5000" placeholder="Anotações do processo">' + esc(pa.notas_internas) + '</textarea><div class="saved" id="dtSaved"></div>' +
        '<h3>Dados</h3><dl class="dl"><dt>E-mail</dt><dd>' + esc(pa.requerente_email) + '</dd><dt>Imóvel</dt><dd>' + esc(pa.imovel || '—') + '</dd><dt>Protocolado</dt><dd>' + fmtDate(pa.criado_em) + '</dd></dl>' +
        '<p><a class="btn sm" style="display:inline-block;text-decoration:none" href="/?p=' + encodeURIComponent(pa.protocolo) + '" target="_blank" rel="noopener">Ver como o requerente vê</a></p>' +
        '<h3>Histórico</h3><ul class="hist">' + hist.map(function (h) {
          return '<li><b>' + (h.tipo === 'prazo' ? 'Prazo do edital atualizado' : esc(faseById(h.fase_id).nome)) + '</b><time>' + fmtDT(h.em) + ' · ' + esc(userName(h.por)) + (h.email_solicitado ? ' · e-mail pedido' : '') + '</time>' +
            (h.mensagem ? '<p>' + esc(h.mensagem) + '</p>' : '') + (h.prazo_edital && h.tipo === 'fase' ? '<p>Prazo do edital: ' + fmtYMD(h.prazo_edital) + '</p>' : '') + '</li>';
        }).join('') + '</ul></div></div>';
      $('#dtClose').onclick = function () { d.close(); };
      $('#dtFase').onchange = function (e) { var to = +e.target.value; e.target.value = pa.fase_id; openMove(pa.id, to, null); };
      $('#dtResp').onchange = function (e) {
        sb.from('processos').update({ responsavel_id: e.target.value || null }).eq('id', pa.id).then(function (r) {
          if (r.error) return toast(errText(r.error));
          pa.responsavel_id = e.target.value || null; toast('Responsável: ' + userName(pa.responsavel_id) + '.'); renderStats(); renderBoard();
        });
      };
      $('#dtNotes').onchange = function (e) {
        sb.from('processos').update({ notas_internas: e.target.value }).eq('id', pa.id).then(function (r) {
          if (r.error) return toast(errText(r.error)); pa.notas_internas = e.target.value; $('#dtSaved').textContent = 'Nota salva.';
        });
      };
      if ($('#dtPrazoBtn')) $('#dtPrazoBtn').onclick = function () {
        var v = $('#dtPrazo').value || null;
        if (v === (pa.prazo_edital || null)) return toast('O prazo já está assim.');
        this.disabled = true;
        sb.rpc('definir_prazo_edital', { p_id: pa.id, p_prazo: v, p_email: true }).then(function (r) {
          if (r.error) { toast(errText(r.error)); var b = $('#dtPrazoBtn'); if (b) b.disabled = false; return; }
          toast(v ? 'Prazo do edital salvo: ' + fmtYMD(v) + '. E-mail ao requerente na fila de envio.' : 'Prazo do edital removido.');
          reloadProcs();
        });
      };
    });
  }
  function openDetail(id) { var d = $('#dDetail'); d.dataset.id = id; if (!d.open) { d.innerHTML = '<div class="loading">Carregando…</div>'; d.showModal(); } fillDetail(id); }

  /* ---------- novo processo ---------- */
  function openNew() {
    var d = $('#dNew'), aprov = S.equipe.filter(function (u) { return u.aprovado; });
    d.innerHTML = '<div class="m-in"><h2>Novo processo</h2><div class="muted">O processo entra na fase “Protocolo / Prenotação”.</div>' +
      '<label for="nwProto">Número do protocolo</label><input type="text" id="nwProto" inputmode="numeric" maxlength="12" placeholder="Ex.: 52474">' +
      '<label for="nwNome">Requerente</label><input type="text" id="nwNome" maxlength="200" placeholder="Nome completo">' +
      '<label for="nwMail">E-mail do requerente</label><input type="email" id="nwMail" maxlength="200" placeholder="nome@exemplo.com">' +
      '<label for="nwImo">Imóvel <span class="opt">(descrição curta)</span></label><input type="text" id="nwImo" maxlength="300" placeholder="Ex.: Rua das Flores, lote 5">' +
      '<label for="nwResp">Escrevente responsável</label><select id="nwResp">' + aprov.map(function (u) { return '<option value="' + u.id + '"' + (u.id === S.me.id ? ' selected' : '') + '>' + esc(u.nome) + '</option>'; }).join('') + '</select>' +
      '<div class="err" id="nwErr" role="alert"></div><div class="m-f"><button type="button" class="btn ghost" id="nwCancel">Cancelar</button><button type="button" class="btn primary" id="nwOk">Criar processo</button></div></div>';
    $('#nwCancel').onclick = function () { d.close(); };
    $('#nwOk').onclick = function () {
      var proto = $('#nwProto').value.trim(), nome = $('#nwNome').value.trim(), mail = $('#nwMail').value.trim(), imo = $('#nwImo').value.trim(), err = $('#nwErr');
      if (!/^[0-9]{1,12}$/.test(proto)) return (err.textContent = 'O protocolo deve ter só números, como 52474.');
      if (nome.length < 2) return (err.textContent = 'Informe o nome do requerente.');
      if (!/^\S+@\S+\.\S+$/.test(mail)) return (err.textContent = 'Informe um e-mail válido para o aviso de andamento.');
      var btn = $('#nwOk'); btn.disabled = true; err.textContent = '';
      sb.rpc('criar_processo', { p_protocolo: proto, p_nome: nome, p_email: mail, p_imovel: imo, p_responsavel: $('#nwResp').value || null }).then(function (r) {
        btn.disabled = false;
        if (r.error) { err.textContent = errText(r.error); return; }
        d.close(); toast('Processo ' + proto + ' criado. E-mail de confirmação na fila de envio.'); reloadProcs();
      });
    };
    d.showModal(); setTimeout(function () { $('#nwProto').focus(); }, 30);
  }

  /* ---------- equipe (Oficial) ---------- */
  function renderEquipe() {
    var rows = S.equipe.map(function (u) {
      var self = u.id === S.me.id;
      return '<tr><td><b>' + esc(u.nome) + '</b>' + (u.papel === 'oficial' ? ' <span class="chip gold">Oficial</span>' : '') + '</td><td>' + esc(u.email) + '</td><td>' + fmtDate(u.criado_em) + '</td>' +
        '<td><span class="pill sm" style="--c:' + (u.aprovado ? 'var(--ok)' : 'var(--warn)') + '">' + (u.aprovado ? 'Aprovado' : 'Aguardando') + '</span></td>' +
        '<td>' + (self ? '' : '<button class="btn sm ' + (u.aprovado ? '' : 'primary') + '" data-uid="' + u.id + '" data-ap="' + (u.aprovado ? '0' : '1') + '">' + (u.aprovado ? 'Bloquear' : 'Aprovar') + '</button>') + '</td></tr>';
    }).join('');
    $('#body').innerHTML = '<div class="page gut"><h2>Equipe</h2><p class="muted" style="margin:0">Cada escrevente cria a própria conta. O acesso só começa depois que você aprova.</p>' +
      '<div class="tblwrap"><table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Cadastro</th><th>Situação</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    document.querySelectorAll('[data-uid]').forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        sb.from('perfis').update({ aprovado: b.dataset.ap === '1' }).eq('id', b.dataset.uid).then(function (r) {
          if (r.error) { toast(errText(r.error)); b.disabled = false; return; }
          var u = userById(b.dataset.uid); u.aprovado = b.dataset.ap === '1';
          toast(u.nome + (u.aprovado ? ' foi aprovado(a).' : ' foi bloqueado(a).')); renderApp();
        });
      };
    });
  }

  /* ---------- e-mails (Oficial) ---------- */
  function renderEmails() {
    $('#body').innerHTML = '<div class="page gut"><h2>E-mails ao requerente</h2><p class="muted" style="margin:0">Um e-mail é pedido a cada mudança de fase ou de prazo e sai em até 1 minuto. Aqui você confere se saiu. Se falhar, o sistema tenta até 3 vezes.</p><div id="emTbl"><div class="loading">Carregando…</div></div></div>';
    sb.from('emails_enviados').select('id,destinatario,status,erro,criado_em,enviado_em,processos(protocolo)').order('criado_em', { ascending: false }).limit(100).then(function (r) {
      var el = $('#emTbl'); if (!el) return;
      if (r.error) { el.innerHTML = '<div class="msg err">' + esc(r.error.message) + '</div>'; return; }
      var st = { pendente: 'Na fila', enviando: 'Enviando', enviado: 'Enviado', falhou: 'Falhou' };
      el.innerHTML = r.data.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Quando</th><th>Protocolo</th><th>Para</th><th>Situação</th></tr></thead><tbody>' +
        r.data.map(function (e) {
          return '<tr><td>' + fmtDT(e.criado_em) + '</td><td>' + esc(e.processos ? e.processos.protocolo : '—') + '</td><td>' + esc(mask(e.destinatario)) + '</td><td><span class="pill sm st-' + e.status + '">' + st[e.status] + '</span>' + (e.erro ? ' <span class="muted small">' + esc(e.erro) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="msg info" style="margin-top:12px">Nenhum e-mail ainda.</div>';
    });
  }

  /* ---------- eventos globais ---------- */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (card && Date.now() - lastDrag > 250) openDetail(+card.dataset.id);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('card')) { e.preventDefault(); openDetail(+e.target.dataset.id); }
  });
  ['#dMove', '#dDetail', '#dNew'].forEach(function (s) { $(s).addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); }); });

  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'PASSWORD_RECOVERY') showRecovery();
    if (ev === 'SIGNED_OUT' && S.me) { S.me = null; showAuth('login'); }
  });

  /* ---------- início ---------- */
  if (/type=recovery/.test(location.hash)) { showRecovery(); }
  else sb.auth.getSession().then(function (r) { if (r.data && r.data.session && !recovering) enter(); else if (!recovering) showAuth('login'); });
})();
