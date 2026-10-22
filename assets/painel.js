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
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var LOGO = '/assets/logo.jpg';
  var TIPOS = ['Extraordinária', 'Ordinária', 'Especial urbana individual', 'Especial urbana coletiva', 'Especial rural', 'Familiar'];

  var ICON = {
    clock: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
    grip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  /* ---------- estado ---------- */
  function freshState() { return { me: null, fases: [], equipe: [], procs: [], advs: [], msgs: [], view: 'quadro', sub: 'fases' }; }
  var S = freshState();
  var F = { q: '', resp: 'all', att: false, tipo: '' };
  var dragging = false, needReload = false, channel = null, recovering = false;

  var visFases = function () { return S.fases.filter(function (f) { return !f.oculta; }); };
  var faseById = function (id) { return S.fases.find(function (f) { return f.id === id; }) || { id: id, nome: 'Fase ' + id }; };
  var userById = function (id) { return S.equipe.find(function (u) { return u.id === id; }); };
  var userName = function (id) { var u = userById(id); return u ? u.nome : 'Sem responsável'; };
  var advById = function (id) { return S.advs.find(function (a) { return a.id === id; }); };
  var approved = function () { return S.equipe.filter(function (u) { return u.aprovado; }); };
  var userIdx = function (id) { var i = approved().findIndex(function (u) { return u.id === id; }); return Math.max(0, i); };
  var initials = function (n) { return n === 'Oficial' ? 'OF' : String(n).trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  var avatar = function (id) { var n = userName(id); return '<span class="av" style="--i:' + (userIdx(id) % 4) + '" aria-hidden="true">' + (id ? esc(initials(n)) : '?') + '</span>'; };
  var isOficial = function () { return S.me && S.me.papel === 'oficial'; };
  var byId = function (id) { return S.procs.find(function (p) { return p.id === id; }); };
  var fmtCode = function (c) { return String(c).replace(/(.{4})(?=.)/g, '$1-'); };

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

  /* diálogo genérico (confirmações, atribuição, códigos) */
  function openGen(html, setup) {
    var d = $('#dGen'); d.innerHTML = '<div class="m-in">' + html + '</div>';
    d.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { d.close(); }; });
    if (setup) setup(d);
    if (!d.open) d.showModal();
    return d;
  }
  function confirmDialog(o) {
    // o: {titulo, texto, ok, perigo, digitar}
    return new Promise(function (resolve) {
      var done = false;
      var d = openGen('<h2>' + esc(o.titulo) + '</h2><div class="' + (o.perigo ? 'warnbox' : 'muted') + '">' + o.texto + '</div>' +
        (o.digitar ? '<label for="cfTxt">Para confirmar, digite <b>' + esc(o.digitar) + '</b></label><input type="text" id="cfTxt" autocomplete="off">' : '') +
        '<div class="m-f"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn ' + (o.perigo ? 'danger' : 'primary') + '" id="cfOk"' + (o.digitar ? ' disabled' : '') + '>' + esc(o.ok || 'Confirmar') + '</button></div>', function (d) {
        if (o.digitar) $('#cfTxt').oninput = function (e) { $('#cfOk').disabled = e.target.value.trim() !== o.digitar; };
        $('#cfOk').onclick = function () { done = true; d.close(); resolve(true); };
        d.addEventListener('close', function once() { d.removeEventListener('close', once); if (!done) resolve(false); });
      });
    });
  }

  /* ---------- autenticação ---------- */
  var PRIVACY = '<details class="lgpd"><summary>Aviso de privacidade (LGPD)</summary><p>Este sistema trata dados pessoais dos requerentes (nome, e-mail, imóvel e andamento do pedido) somente para a tramitação da usucapião extrajudicial e para avisar os interessados sobre o andamento. O controlador é o Registro de Imóveis de Itararé. O acesso é restrito à equipe autorizada e as alterações ficam registradas. Não compartilhe a sua senha nem dados do painel fora do serviço.</p></details>';

  function authShell(inner) {
    $('#root').innerHTML = '<div class="center-screen"><div class="auth-card"><div class="plaque"><img src="' + LOGO + '" alt="Registro de Imóveis de Itararé"></div>' + inner + PRIVACY + '</div></div>';
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
    if (!EMAIL_RE.test(mail)) return setMsg('err', 'Informe um e-mail válido.');
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

  function showMfa() {
    sb.auth.mfa.listFactors().then(function (r) {
      var f = r.data && r.data.totp && r.data.totp.find(function (x) { return x.status === 'verified'; });
      if (!f) { showAuth('login', { k: 'err', t: 'Não foi possível verificar a segunda etapa. Tente de novo.' }); return; }
      authShell('<h1>Verificação em duas etapas</h1><p class="sub">Digite o código de 6 números do aplicativo autenticador.</p>' +
        '<form id="fMfa" novalidate><label for="mCode">Código</label><input id="mCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"><div id="aMsg"></div>' +
        '<button class="btn primary" type="submit" id="aBtn">Confirmar</button></form><div class="links"><button class="linkbtn" id="mOut">Sair</button></div>');
      $('#mOut').onclick = signOut;
      $('#mCode').focus();
      $('#fMfa').onsubmit = function (e) {
        e.preventDefault();
        var code = $('#mCode').value.replace(/\s/g, '');
        if (!/^\d{6}$/.test(code)) return setMsg('err', 'O código tem 6 números.');
        $('#aBtn').disabled = true;
        sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: code }).then(function (v) {
          if (v.error) { $('#aBtn').disabled = false; return setMsg('err', 'Código incorreto ou vencido. Tente o próximo.'); }
          enter();
        });
      };
    });
  }

  function signOut() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    sb.auth.signOut().then(function () { S = freshState(); showAuth('login'); });
  }

  /* ---------- carga de dados ---------- */
  function enter() {
    return sb.auth.getUser().then(function (r) {
      if (!r.data || !r.data.user) { showAuth('login'); return; }
      return sb.from('perfis').select('*').eq('id', r.data.user.id).maybeSingle().then(function (pr) {
        if (pr.error || !pr.data) { showAuth('login', { k: 'err', t: 'Não foi possível carregar o seu perfil. Tente de novo.' }); return; }
        S.me = pr.data;
        if (!S.me.aprovado) { showPending(); return; }
        return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
          if (a.data && a.data.nextLevel === 'aal2' && a.data.currentLevel !== 'aal2') { showMfa(); return; }
          $('#root').innerHTML = '<div class="loading">Carregando processos…</div>';
          return loadAll().then(function (ok) { if (ok) { renderApp(); subscribe(); } });
        });
      });
    });
  }

  function loadAll() {
    return Promise.all([
      sb.from('fases').select('*').order('ordem'),
      sb.from('perfis').select('id,nome,email,papel,aprovado,criado_em,resumo_diario').order('nome'),
      sb.from('processos').select('*').order('ord'),
      sb.from('advogados').select('id,nome,email,copia_email,codigo_final,ativo,criado_em').order('nome'),
      sb.from('mensagens_padrao').select('*').order('fase_id', { nullsFirst: true }).order('id')
    ]).then(function (r) {
      var bad = r.find(function (x) { return x.error; });
      if (bad) { $('#root').innerHTML = '<div class="loading">Não foi possível carregar os dados: ' + esc(bad.error.message) + '</div>'; return false; }
      S.fases = r[0].data; S.equipe = r[1].data; S.procs = r[2].data; S.advs = r[3].data; S.msgs = r[4].data;
      var me = S.equipe.find(function (u) { return u.id === S.me.id; }); if (me) S.me = Object.assign(S.me, me);
      return true;
    });
  }

  function reloadProcs() {
    if (dragging) { needReload = true; return Promise.resolve(); }
    return sb.from('processos').select('*').order('ord').then(function (r) {
      if (r.error) return;
      S.procs = r.data;
      if (S.view === 'quadro' && $('#board')) { renderStats(); renderBoard(); }
      var d = $('#dDetail');
      if (d.open && d.dataset.id && !d.dataset.dirty) fillDetail(+d.dataset.id);
    });
  }
  var reloadT;
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('processos-ao-vivo').on('postgres_changes', { event: '*', schema: 'public', table: 'processos' }, function () {
      clearTimeout(reloadT); reloadT = setTimeout(reloadProcs, 300);
    }).subscribe();
  }

  /* ---------- estrutura do app ---------- */
  function pendentesCount() { return S.equipe.filter(function (u) { return !u.aprovado; }).length; }

  function renderApp() {
    var tab = function (v, label, extra) { return '<button class="tab" role="tab" data-view="' + v + '" aria-selected="' + (S.view === v) + '">' + label + (extra || '') + '</button>'; };
    var tabs = tab('quadro', 'Quadro') + tab('advogados', 'Advogados');
    if (isOficial()) {
      var n = pendentesCount();
      tabs += tab('equipe', 'Equipe', n ? '<span class="badge-n">' + n + '</span>' : '') + tab('emails', 'E-mails') + tab('ajustes', 'Ajustes');
    }
    tabs += tab('conta', 'Minha conta');
    $('#root').innerHTML =
      '<div class="app"><header class="top"><div class="top-in gut">' +
      '<img class="logo" src="' + LOGO + '" alt="Registro de Imóveis de Itararé">' +
      '<div class="brand"><h1>Central de Usucapiões</h1><p>Usucapião extrajudicial · Itararé</p></div>' +
      '<nav class="tabs" role="tablist" aria-label="Seções">' + tabs + '</nav>' +
      '<div class="who2"><span>' + esc(S.me.nome) + (isOficial() ? ' · Oficial' : '') + '</span><a href="/" target="_blank" rel="noopener">Página do cliente</a><button class="btn" id="bOut">Sair</button></div>' +
      '</div></header><div id="body" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>';
    $('#bOut').onclick = signOut;
    document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { S.view = t.dataset.view; renderApp(); }; });
    var v = S.view;
    if (v === 'equipe' && isOficial()) renderEquipe();
    else if (v === 'emails' && isOficial()) renderEmails();
    else if (v === 'ajustes' && isOficial()) renderAjustes();
    else if (v === 'advogados') renderAdvogados();
    else if (v === 'conta') renderConta();
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
  function searchText(p) {
    var a = advById(p.advogado_id);
    return [p.protocolo, p.requerente_nome, p.imovel, p.matricula, p.referencia, p.tipo_usucapiao, a ? a.nome : '', p.requerente_email].join(' ').toLowerCase();
  }
  function visible(p) {
    if (F.resp === 'none') { if (p.responsavel_id) return false; }
    else if (F.resp !== 'all' && p.responsavel_id !== F.resp) return false;
    if (F.tipo && p.tipo_usucapiao !== F.tipo) return false;
    if (F.att && !attention(p) && p.fase_id !== 3) return false;
    if (F.q && searchText(p).indexOf(F.q.toLowerCase()) < 0) return false;
    return true;
  }

  function renderQuadro() {
    var tipos = Array.from(new Set(S.procs.map(function (p) { return p.tipo_usucapiao; }).filter(Boolean))).sort();
    $('#body').innerHTML =
      '<div class="toolbar gut"><div class="search">' + ICON.search + '<input id="q" type="search" placeholder="Buscar protocolo, nome, imóvel, matrícula, advogado" aria-label="Buscar processo" value="' + esc(F.q) + '"></div>' +
      '<div class="chips" id="resps" role="group" aria-label="Filtrar por escrevente"></div>' +
      (tipos.length ? '<select id="fTipo" class="fsel" aria-label="Filtrar por tipo de usucapião"><option value="">Todos os tipos</option>' + tipos.map(function (t) { return '<option' + (F.tipo === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' : '') +
      '<button type="button" class="fchip plain" id="fAtt" aria-pressed="' + F.att + '">Só os que pedem atenção</button>' +
      '<button type="button" class="btn primary" id="bNew">' + ICON.plus + 'Novo processo</button></div>' +
      '<div class="stats gut" id="stats"></div><div class="board gut" id="board" aria-label="Quadro de processos"></div>';
    $('#q').oninput = function (e) { F.q = e.target.value.trim(); renderBoard(); };
    if ($('#fTipo')) $('#fTipo').onchange = function (e) { F.tipo = e.target.value; renderBoard(); };
    $('#fAtt').onclick = function () { F.att = !F.att; $('#fAtt').setAttribute('aria-pressed', F.att); renderBoard(); };
    $('#bNew').onclick = openNew;
    renderResps(); renderStats(); renderBoard();
  }

  function renderResps() {
    $('#resps').innerHTML = '<button type="button" class="fchip plain" data-resp="all" aria-pressed="' + (F.resp === 'all') + '">Todos</button>' +
      approved().map(function (u) { return '<button type="button" class="fchip" data-resp="' + u.id + '" aria-pressed="' + (F.resp === u.id) + '">' + avatar(u.id) + esc(u.nome) + '</button>'; }).join('') +
      '<button type="button" class="fchip plain" data-resp="none" aria-pressed="' + (F.resp === 'none') + '">Sem responsável</button>';
    document.querySelectorAll('#resps .fchip').forEach(function (b) { b.onclick = function () { F.resp = b.dataset.resp; renderResps(); renderBoard(); }; });
  }

  function renderStats() {
    var act = S.procs.filter(function (p) { return p.fase_id < 8; });
    var venc = act.filter(function (p) { return p.fase_id === 5 && p.prazo_edital && daysLeft(p.prazo_edital) <= 15; }).length;
    var par = act.filter(function (p) { return p.fase_id !== 3 && daysSince(p.fase_desde) > 30; }).length;
    var aw = S.procs.filter(function (p) { return p.fase_id === 3; }).length;
    var done = S.procs.filter(function (p) { return p.fase_id === 8; }).length;
    var sem = act.filter(function (p) { return !p.responsavel_id; }).length;
    var st = function (n, l, a) { return '<div class="stat ' + (a && n ? 'alert' : '') + '"><b>' + n + '</b><span>' + l + '</span></div>'; };
    $('#stats').innerHTML = st(act.length, 'em andamento') + st(venc, 'editais vencendo em 15 dias', 1) + st(par, 'parados há mais de 30 dias', 1) + st(sem, 'sem escrevente responsável', 1) + st(aw, 'aguardando o requerente') + st(done, 'concluídos');
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
      '<div class="nome">' + esc(p.requerente_nome) + '</div><div class="imovel">' + esc(p.referencia || p.imovel) + '</div>' +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') +
      '<div class="card-foot"><button type="button" class="assign" data-assign="' + p.id + '" title="Mudar o escrevente responsável">' + avatar(p.responsavel_id) + '<span class="resp">' + esc(userName(p.responsavel_id)) + '</span></button><span class="age">' + (age === 0 ? 'hoje' : 'há ' + age + ' ' + plural(age, 'dia', 'dias')) + '</span></div></article>';
  }

  var sortables = [], lastDrag = 0;
  function renderBoard() {
    var b = $('#board'); if (!b) return;
    var sx = b.scrollLeft;
    b.innerHTML = visFases().map(function (f) {
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
        delay: 170, delayOnTouchOnly: true, touchStartThreshold: 6, filter: '.assign', preventOnFilter: false,
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

  /* ---------- atribuir escrevente ---------- */
  function setResponsavel(p, uid) {
    return sb.from('processos').update({ responsavel_id: uid || null }).eq('id', p.id).then(function (r) {
      if (r.error) { toast(errText(r.error)); return false; }
      p.responsavel_id = uid || null;
      toast(uid ? 'Processo ' + p.protocolo + ' agora está com ' + userName(uid) + '.' : 'Processo ' + p.protocolo + ' ficou sem responsável.');
      if ($('#stats')) { renderStats(); renderBoard(); }
      return true;
    });
  }
  function openAssign(id) {
    var p = byId(id); if (!p) return;
    var opts = approved().map(function (u) {
      return '<label class="opt-row"><input type="radio" name="asg" value="' + u.id + '"' + (u.id === p.responsavel_id ? ' checked' : '') + '>' + avatar(u.id) + '<span>' + esc(u.nome) + (u.id === S.me.id ? ' (você)' : '') + '</span></label>';
    }).join('') + '<label class="opt-row"><input type="radio" name="asg" value=""' + (p.responsavel_id ? '' : ' checked') + '><span class="av" aria-hidden="true">?</span><span>Sem responsável</span></label>';
    openGen('<h2>Com quem está o processo?</h2><div class="muted">' + esc(p.protocolo) + ' · ' + esc(p.requerente_nome) + '</div><div class="opt-list">' + opts + '</div>' +
      '<p class="hint">Vale para qualquer escrevente aprovado, não só para quem está logado. O resumo diário e os filtros usam esta informação.</p>' +
      '<div class="m-f"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" id="asOk">Salvar</button></div>', function (d) {
        $('#asOk').onclick = function () {
          var v = d.querySelector('input[name=asg]:checked'); var uid = v ? v.value : '';
          if ((uid || null) === (p.responsavel_id || null)) { d.close(); return; }
          $('#asOk').disabled = true;
          setResponsavel(p, uid).then(function (ok) { if (ok) { d.close(); var dd = $('#dDetail'); if (dd.open && +dd.dataset.id === p.id) fillDetail(p.id); } else $('#asOk').disabled = false; });
        };
      });
  }

  /* ---------- mover processo ---------- */
  var pending = null;
  function destinatariosTxt(p) {
    var l = [mask(p.requerente_email)].concat((p.emails_extra || []).map(mask));
    var a = advById(p.advogado_id);
    var s = l.join(', ');
    if (a && a.ativo && a.copia_email && a.email) s += ' · cópia: ' + mask(a.email);
    return s;
  }
  function mailHTML(p, to, msg, prazo) {
    var f = faseById(to);
    return '<div class="mail"><div class="mail-meta"><div><b>De:</b> Registro de Imóveis de Itararé</div><div><b>Para:</b> ' + esc(destinatariosTxt(p)) + '</div><div><b>Assunto:</b> Usucapião ' + esc(p.protocolo) + ': ' + esc(f.nome) + '</div></div>' +
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
    var padroes = S.msgs.filter(function (m) { return m.fase_id === to || m.fase_id == null; });
    d.innerHTML = '<div class="m-in"><h2>Mover processo ' + esc(p.protocolo) + '</h2><div class="muted">' + esc(p.requerente_nome) + '</div>' +
      '<div class="route"><span class="pill" style="--c:' + phaseColor(p.fase_id) + '">' + esc(from.nome) + '</span>' + ICON.arrow + '<span class="pill" style="--c:' + phaseColor(to) + '">' + esc(f.nome) + '</span></div>' +
      (to >= 8 ? '<div class="warnbox">' + (to === 8 ? 'Esta fase conclui o procedimento.' : 'Esta fase encerra o procedimento extrajudicial.') + ' Confira a mensagem antes de confirmar.</div>' : '') +
      '<label for="mvMsg">Mensagem para o requerente <span class="opt">(opcional)</span></label>' +
      (padroes.length ? '<select id="mvPad" aria-label="Mensagem pronta"><option value="">Usar mensagem pronta…</option>' + padroes.map(function (m) { return '<option value="' + m.id + '">' + esc(m.titulo) + '</option>'; }).join('') + '</select>' : '') +
      '<textarea id="mvMsg" rows="3" maxlength="600" placeholder="Ex.: As notificações aos confrontantes foram expedidas."></textarea>' +
      '<p class="hint">Aparece na consulta pública e no e-mail. Não escreva CPF, endereço ou nomes de terceiros.</p>' +
      (to === 5 ? '<label for="mvPrazo">Prazo do edital termina em <span class="opt">(opcional)</span></label><input type="date" id="mvPrazo"><p class="hint">Deixe em branco se ainda não souber. Dá para informar depois.</p>' : '') +
      '<label class="check"><input type="checkbox" id="mvEmail" checked> Enviar e-mail (' + (1 + (p.emails_extra || []).length) + ' ' + plural(1 + (p.emails_extra || []).length, 'destinatário', 'destinatários') + (advById(p.advogado_id) && advById(p.advogado_id).email && advById(p.advogado_id).copia_email ? ' + advogado' : '') + ')</label>' +
      '<details class="prev"><summary>Ver prévia do e-mail</summary><div id="mvPrev"></div></details>' +
      '<div class="err" id="mvErr" role="alert"></div>' +
      '<div class="m-f"><button type="button" class="btn ghost" id="mvCancel">Cancelar</button><button type="button" class="btn primary" id="mvOk">Confirmar mudança</button></div></div>';
    var upd = function () { $('#mvPrev').innerHTML = mailHTML(p, to, $('#mvMsg').value.trim(), $('#mvPrazo') ? $('#mvPrazo').value : ''); };
    d.oninput = upd; upd();
    if ($('#mvPad')) $('#mvPad').onchange = function (e) {
      var m = S.msgs.find(function (x) { return String(x.id) === e.target.value; });
      if (m) { $('#mvMsg').value = m.texto; upd(); }
      e.target.value = '';
    };
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
      toast('Processo ' + p.protocolo + ' movido para “' + faseById(to).nome + '”.' + (mail ? ' E-mails na fila de envio.' : ''));
      reloadProcs();
    });
  }

  /* ---------- detalhe ---------- */
  var FIELD = { protocolo: 'Protocolo', requerente_nome: 'Requerente', requerente_email: 'E-mail', emails_extra: 'E-mails adicionais', imovel: 'Imóvel', matricula: 'Matrícula', tipo_usucapiao: 'Tipo', data_prenotacao: 'Data de prenotação', referencia: 'Referência', advogado_id: 'Advogado', responsavel_id: 'Responsável' };
  function fmtVal(c, v) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
    if (c === 'responsavel_id') return userName(v);
    if (c === 'advogado_id') { var a = advById(v); return a ? a.nome : '#' + v; }
    if (c === 'data_prenotacao') return fmtYMD(v);
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }
  function auditHTML(rows) {
    if (!rows.length) return '<p class="muted small">Nenhuma alteração registrada.</p>';
    return '<ul class="hist">' + rows.map(function (a) {
      var det = a.detalhes || {}, linhas = '';
      if (a.acao === 'excluido') linhas = '<p>Processo excluído (' + esc(det.requerente || '') + ').</p>';
      else if (a.acao === 'quadro_limpo') linhas = '<p>Todos os processos foram apagados (' + esc(det.processos) + ').</p>';
      else linhas = Object.keys(det).map(function (c) { return '<p><b>' + esc(FIELD[c] || c) + ':</b> ' + esc(fmtVal(c, det[c].de)) + ' → ' + esc(fmtVal(c, det[c].para)) + '</p>'; }).join('');
      var titulo = a.acao === 'criado' ? 'Processo criado' : a.acao === 'protocolo_alterado' ? 'Protocolo alterado' : a.acao === 'editado' ? 'Dados alterados' : a.acao === 'excluido' ? 'Processo excluído' : 'Quadro apagado';
      return '<li><b>' + titulo + '</b><time>' + fmtDT(a.em) + ' · ' + esc(userName(a.por)) + '</time>' + linhas + '</li>';
    }).join('') + '</ul>';
  }

  function parseEmails(txt) {
    var seen = {}, out = [];
    String(txt || '').split(/[\n,;]+/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (e) {
      var k = e.toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(e); }
    });
    return out;
  }
  function advSelect(id, sel) {
    return '<select id="' + id + '"><option value="">Nenhum</option>' + S.advs.filter(function (a) { return a.ativo || a.id === sel; }).map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.nome) + '</option>';
    }).join('') + '</select>';
  }

  function fillDetail(id) {
    var p = byId(id); if (!p) { $('#dDetail').close(); return; }
    var d = $('#dDetail'); d.dataset.id = id; delete d.dataset.dirty;
    Promise.all([
      sb.from('historico').select('*').eq('processo_id', id).order('em', { ascending: false }),
      sb.from('auditoria').select('*').eq('processo_id', id).order('em', { ascending: false }).limit(50)
    ]).then(function (rs) {
      if (!d.open || +d.dataset.id !== id) return;
      var hist = rs[0].data || [], aud = rs[1].data || [], pa = byId(id) || p;
      var fasesOpt = S.fases.filter(function (f) { return !f.oculta || f.id === pa.fase_id; });
      d.innerHTML = '<div class="sh"><div class="sh-h"><div><h2>' + esc(pa.protocolo) + '</h2><div class="muted">' + esc(pa.requerente_nome) + '</div></div><button type="button" class="x" id="dtClose" aria-label="Fechar">' + ICON.x + '</button></div><div class="sh-b">' +
        '<h3>Andamento</h3><label for="dtFase">Fase atual</label><select id="dtFase">' + fasesOpt.map(function (f) { return '<option value="' + f.id + '"' + (f.id === pa.fase_id ? ' selected' : '') + '>' + esc(f.nome) + '</option>'; }).join('') + '</select>' +
        '<p class="hint">Ao escolher outra fase, o sistema pede a mensagem ao requerente antes de confirmar.</p>' +
        '<label for="dtResp">Com quem está o processo</label><select id="dtResp"><option value=""' + (pa.responsavel_id ? '' : ' selected') + '>Sem responsável</option>' + approved().map(function (u) { return '<option value="' + u.id + '"' + (u.id === pa.responsavel_id ? ' selected' : '') + '>' + esc(u.nome) + (u.id === S.me.id ? ' (você)' : '') + '</option>'; }).join('') + '</select>' +
        '<p class="hint">Pode ser qualquer escrevente, não só quem está logado.</p>' +
        (pa.fase_id === 5 ? '<label for="dtPrazo">Prazo do edital termina em <span class="opt">(opcional)</span></label><div class="row2"><input type="date" id="dtPrazo" value="' + esc(pa.prazo_edital || '') + '"><button type="button" class="btn sm" id="dtPrazoBtn">Salvar prazo</button></div><p class="hint">O requerente recebe a data por e-mail e a vê na consulta pública.</p>' : '') +
        '<h3>Dados do processo</h3><form id="fDados" novalidate>' +
        '<label for="edProto">Número do protocolo</label><input type="text" id="edProto" inputmode="numeric" maxlength="12" value="' + esc(pa.protocolo) + '">' +
        '<p class="hint" id="edProtoHint">Mudar o protocolo muda o número que o requerente digita na página. Links de e-mails já enviados deixam de funcionar. A troca fica registrada.</p>' +
        '<label for="edNome">Requerente</label><input type="text" id="edNome" maxlength="200" value="' + esc(pa.requerente_nome) + '">' +
        '<label for="edMail">E-mail do requerente</label><input type="email" id="edMail" maxlength="200" value="' + esc(pa.requerente_email) + '">' +
        '<label for="edExtra">Outros e-mails <span class="opt">(outros requerentes, um por linha, até 5)</span></label><textarea id="edExtra" rows="2" placeholder="outro@exemplo.com">' + esc((pa.emails_extra || []).join('\n')) + '</textarea>' +
        '<label for="edImo">Imóvel</label><input type="text" id="edImo" maxlength="300" value="' + esc(pa.imovel) + '">' +
        '<label for="edRef">Referência curta <span class="opt">(aparece ao advogado, ex.: Chácara Santa Luzia)</span></label><input type="text" id="edRef" maxlength="80" value="' + esc(pa.referencia || '') + '">' +
        '<div class="grid2"><div><label for="edMat">Matrícula</label><input type="text" id="edMat" maxlength="40" value="' + esc(pa.matricula || '') + '"></div>' +
        '<div><label for="edPren">Data da prenotação</label><input type="date" id="edPren" value="' + esc(pa.data_prenotacao || '') + '"></div></div>' +
        '<label for="edTipo">Tipo de usucapião</label><input type="text" id="edTipo" maxlength="60" list="dlTipos" value="' + esc(pa.tipo_usucapiao || '') + '"><datalist id="dlTipos">' + TIPOS.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
        '<label for="edAdv">Advogado / representante</label>' + advSelect('edAdv', pa.advogado_id) +
        '<div class="err" id="edErr" role="alert"></div><button type="submit" class="btn primary" id="edSave">Salvar dados</button></form>' +
        '<h3>Notas internas</h3><label for="dtNotes">Só a equipe vê estas notas</label><textarea id="dtNotes" rows="3" maxlength="5000" placeholder="Anotações do processo">' + esc(pa.notas_internas) + '</textarea><div class="saved" id="dtSaved"></div>' +
        '<p><a class="btn sm" style="display:inline-block;text-decoration:none" href="/?p=' + encodeURIComponent(pa.protocolo) + '" target="_blank" rel="noopener">Ver como o requerente vê</a></p>' +
        '<h3>Histórico do andamento</h3><p class="hint">O que o requerente vê. Não pode ser editado; se algo estiver errado, registre uma nova movimentação.</p><ul class="hist">' + hist.map(function (h) {
          return '<li><b>' + (h.tipo === 'prazo' ? 'Prazo do edital atualizado' : esc(faseById(h.fase_id).nome)) + '</b><time>' + fmtDT(h.em) + ' · ' + esc(userName(h.por)) + (h.email_solicitado ? ' · e-mail pedido' : '') + '</time>' +
            (h.mensagem ? '<p>' + esc(h.mensagem) + '</p>' : '') + (h.prazo_edital && h.tipo === 'fase' ? '<p>Prazo do edital: ' + fmtYMD(h.prazo_edital) + '</p>' : '') + '</li>';
        }).join('') + '</ul>' +
        '<h3>Alterações nos dados</h3>' + auditHTML(aud) +
        (isOficial() ? '<h3>Zona de perigo</h3><p class="hint">Apagar remove o processo, o histórico do andamento e os e-mails ligados a ele. Não dá para desfazer.</p><button type="button" class="btn danger" id="dtDel">Apagar este processo</button>' : '') +
        '</div></div>';

      $('#dtClose').onclick = function () { d.close(); };
      d.oninput = function () { d.dataset.dirty = '1'; };
      $('#dtFase').onchange = function (e) { var to = +e.target.value; e.target.value = pa.fase_id; openMove(pa.id, to, null); };
      $('#dtResp').onchange = function (e) { setResponsavel(pa, e.target.value).then(function () { delete d.dataset.dirty; }); };
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
          toast(v ? 'Prazo do edital salvo: ' + fmtYMD(v) + '. E-mails na fila de envio.' : 'Prazo do edital removido.');
          reloadProcs();
        });
      };
      $('#fDados').onsubmit = function (e) { e.preventDefault(); saveDados(pa); };
      if ($('#dtDel')) $('#dtDel').onclick = function () {
        confirmDialog({ titulo: 'Apagar o processo ' + pa.protocolo + '?', perigo: true, ok: 'Apagar processo', digitar: pa.protocolo,
          texto: 'Será apagado o processo de <b>' + esc(pa.requerente_nome) + '</b>, com todo o histórico do andamento. Esta ação não pode ser desfeita.' }).then(function (ok) {
          if (!ok) return;
          sb.from('processos').delete().eq('id', pa.id).then(function (r) {
            if (r.error) return toast(errText(r.error));
            d.close(); toast('Processo ' + pa.protocolo + ' apagado.'); reloadProcs();
          });
        });
      };
    });
  }

  function saveDados(pa) {
    var err = $('#edErr'), btn = $('#edSave'); err.textContent = '';
    var proto = $('#edProto').value.trim(), nome = $('#edNome').value.trim(), mail = $('#edMail').value.trim();
    var extras = parseEmails($('#edExtra').value), imo = $('#edImo').value.trim();
    if (!/^[0-9]{1,12}$/.test(proto)) return (err.textContent = 'O protocolo deve ter só números, como 52474.');
    if (nome.length < 2) return (err.textContent = 'Informe o nome do requerente.');
    if (!EMAIL_RE.test(mail)) return (err.textContent = 'Informe um e-mail válido para o requerente.');
    if (extras.length > 5) return (err.textContent = 'Use no máximo 5 e-mails adicionais.');
    var ruim = extras.find(function (x) { return !EMAIL_RE.test(x); });
    if (ruim) return (err.textContent = 'E-mail inválido: ' + ruim);
    var campos = {
      protocolo: proto, requerente_nome: nome, requerente_email: mail, emails_extra: extras, imovel: imo,
      referencia: $('#edRef').value.trim() || null, matricula: $('#edMat').value.trim() || null,
      data_prenotacao: $('#edPren').value || null, tipo_usucapiao: $('#edTipo').value.trim() || null,
      advogado_id: $('#edAdv').value ? +$('#edAdv').value : null, atualizado_em: new Date().toISOString()
    };
    var go = function () {
      btn.disabled = true;
      sb.from('processos').update(campos).eq('id', pa.id).then(function (r) {
        btn.disabled = false;
        if (r.error) { err.textContent = errText(r.error); return; }
        toast('Dados do processo ' + proto + ' salvos.');
        var dd = $('#dDetail'); delete dd.dataset.dirty;
        reloadProcs().then(function () { fillDetail(pa.id); });
      });
    };
    if (proto !== pa.protocolo) {
      confirmDialog({ titulo: 'Trocar o número do protocolo?', ok: 'Trocar protocolo', perigo: true,
        texto: 'De <b>' + esc(pa.protocolo) + '</b> para <b>' + esc(proto) + '</b>. O requerente passará a consultar pelo número novo, e os links de e-mails anteriores deixarão de funcionar. A troca fica registrada com o seu nome.' }).then(function (ok) { if (ok) go(); });
    } else go();
  }
  function openDetail(id) { var d = $('#dDetail'); d.dataset.id = id; if (!d.open) { d.innerHTML = '<div class="loading">Carregando…</div>'; d.showModal(); } fillDetail(id); }

  /* ---------- novo processo ---------- */
  function openNew() {
    var d = $('#dNew');
    d.innerHTML = '<div class="m-in"><h2>Novo processo</h2><div class="muted">O processo entra na fase “Protocolo / Prenotação”.</div>' +
      '<label for="nwProto">Número do protocolo</label><input type="text" id="nwProto" inputmode="numeric" maxlength="12" placeholder="Ex.: 52474">' +
      '<label for="nwNome">Requerente</label><input type="text" id="nwNome" maxlength="200" placeholder="Nome completo">' +
      '<label for="nwMail">E-mail do requerente</label><input type="email" id="nwMail" maxlength="200" placeholder="nome@exemplo.com">' +
      '<label for="nwExtra">Outros e-mails <span class="opt">(outros requerentes, um por linha, opcional)</span></label><textarea id="nwExtra" rows="2"></textarea>' +
      '<label for="nwImo">Imóvel <span class="opt">(descrição curta)</span></label><input type="text" id="nwImo" maxlength="300" placeholder="Ex.: Rua das Flores, lote 5">' +
      '<label for="nwRef">Referência curta <span class="opt">(aparece ao advogado)</span></label><input type="text" id="nwRef" maxlength="80" placeholder="Ex.: Chácara Santa Luzia">' +
      '<div class="grid2"><div><label for="nwMat">Matrícula</label><input type="text" id="nwMat" maxlength="40"></div><div><label for="nwPren">Data da prenotação</label><input type="date" id="nwPren"></div></div>' +
      '<label for="nwTipo">Tipo de usucapião</label><input type="text" id="nwTipo" maxlength="60" list="dlTipos2"><datalist id="dlTipos2">' + TIPOS.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
      '<label for="nwAdv">Advogado / representante</label>' + advSelect('nwAdv', null) +
      '<label for="nwResp">Escrevente responsável</label><select id="nwResp">' + approved().map(function (u) { return '<option value="' + u.id + '"' + (u.id === S.me.id ? ' selected' : '') + '>' + esc(u.nome) + (u.id === S.me.id ? ' (você)' : '') + '</option>'; }).join('') + '<option value="">Sem responsável</option></select>' +
      '<p class="hint">Escolha com quem o caso vai ficar, mesmo que não seja você.</p>' +
      '<div class="err" id="nwErr" role="alert"></div><div class="m-f"><button type="button" class="btn ghost" id="nwCancel">Cancelar</button><button type="button" class="btn primary" id="nwOk">Criar processo</button></div></div>';
    $('#nwCancel').onclick = function () { d.close(); };
    $('#nwOk').onclick = function () {
      var proto = $('#nwProto').value.trim(), nome = $('#nwNome').value.trim(), mail = $('#nwMail').value.trim(), imo = $('#nwImo').value.trim(), err = $('#nwErr');
      var extras = parseEmails($('#nwExtra').value);
      if (!/^[0-9]{1,12}$/.test(proto)) return (err.textContent = 'O protocolo deve ter só números, como 52474.');
      if (nome.length < 2) return (err.textContent = 'Informe o nome do requerente.');
      if (!EMAIL_RE.test(mail)) return (err.textContent = 'Informe um e-mail válido para o aviso de andamento.');
      if (extras.length > 5) return (err.textContent = 'Use no máximo 5 e-mails adicionais.');
      var ruim = extras.find(function (x) { return !EMAIL_RE.test(x); });
      if (ruim) return (err.textContent = 'E-mail inválido: ' + ruim);
      var btn = $('#nwOk'); btn.disabled = true; err.textContent = '';
      sb.rpc('novo_processo', {
        p_protocolo: proto, p_nome: nome, p_email: mail, p_imovel: imo, p_responsavel: $('#nwResp').value || null,
        p_emails_extra: extras, p_matricula: $('#nwMat').value.trim() || null, p_tipo: $('#nwTipo').value.trim() || null,
        p_prenotacao: $('#nwPren').value || null, p_referencia: $('#nwRef').value.trim() || null, p_advogado: $('#nwAdv').value ? +$('#nwAdv').value : null
      }).then(function (r) {
        btn.disabled = false;
        if (r.error) { err.textContent = errText(r.error); return; }
        d.close(); toast('Processo ' + proto + ' criado. E-mail de confirmação na fila de envio.'); reloadProcs();
      });
    };
    d.showModal(); setTimeout(function () { $('#nwProto').focus(); }, 30);
  }

  /* ---------- advogados ---------- */
  function showCode(titulo, nome, code) {
    openGen('<h2>' + esc(titulo) + '</h2><div class="muted">' + esc(nome) + '</div>' +
      '<div class="codebox" id="cdBox">' + esc(fmtCode(code)) + '</div>' +
      '<div class="warnbox">Anote ou copie agora: por segurança, este código <b>não aparece de novo</b>. Se for perdido, gere outro (o anterior deixa de funcionar).</div>' +
      '<p class="hint">Entregue ao advogado. Na página ' + esc(location.origin) + '/ ele clica em “Tenho mais de um processo” e digita o código para ver seus processos.</p>' +
      '<div class="m-f"><button type="button" class="btn" id="cdCopy">Copiar código</button><button type="button" class="btn primary" data-close>Fechar</button></div>', function () {
        $('#cdCopy').onclick = function () {
          var done = function () { toast('Código copiado.'); };
          if (navigator.clipboard) navigator.clipboard.writeText(fmtCode(code)).then(done, function () { toast('Copie manualmente.'); }); else toast('Copie manualmente.');
        };
      });
  }

  function advForm(a) {
    var novo = !a;
    openGen('<h2>' + (novo ? 'Novo advogado / representante' : 'Editar ' + esc(a.nome)) + '</h2>' +
      '<label for="avNome">Nome</label><input type="text" id="avNome" maxlength="200" value="' + esc(a ? a.nome : '') + '">' +
      '<label for="avMail">E-mail <span class="opt">(opcional)</span></label><input type="email" id="avMail" maxlength="200" value="' + esc(a && a.email || '') + '">' +
      '<label class="check"><input type="checkbox" id="avCopia"' + (!a || a.copia_email ? ' checked' : '') + '> Enviar a ele uma cópia dos e-mails de andamento</label>' +
      '<div class="err" id="avErr" role="alert"></div><div class="m-f"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" id="avOk">' + (novo ? 'Criar e gerar código' : 'Salvar') + '</button></div>', function (d) {
        $('#avOk').onclick = function () {
          var nome = $('#avNome').value.trim(), mail = $('#avMail').value.trim(), cp = $('#avCopia').checked, err = $('#avErr');
          if (nome.length < 2) return (err.textContent = 'Informe o nome.');
          if (mail && !EMAIL_RE.test(mail)) return (err.textContent = 'E-mail inválido.');
          $('#avOk').disabled = true;
          var req = novo ? sb.rpc('criar_advogado', { p_nome: nome, p_email: mail || null, p_copia: cp })
            : sb.from('advogados').update({ nome: nome, email: mail || null, copia_email: cp }).eq('id', a.id);
          req.then(function (r) {
            if (r.error) { $('#avOk').disabled = false; err.textContent = errText(r.error); return; }
            d.close();
            sb.from('advogados').select('id,nome,email,copia_email,codigo_final,ativo,criado_em').order('nome').then(function (rr) {
              if (!rr.error) S.advs = rr.data; renderApp();
              if (novo) showCode('Código do advogado', nome, r.data); else toast('Dados salvos.');
            });
          });
        };
      });
  }

  function renderAdvogados() {
    var cnt = function (id) { return S.procs.filter(function (p) { return p.advogado_id === id; }).length; };
    var rows = S.advs.map(function (a) {
      return '<tr><td><b>' + esc(a.nome) + '</b>' + (a.ativo ? '' : ' <span class="chip">Desativado</span>') + '</td><td>' + esc(a.email || '—') + (a.email && a.copia_email ? ' <span class="muted small">(recebe cópias)</span>' : '') + '</td>' +
        '<td>' + cnt(a.id) + '</td><td><code>…' + esc(a.codigo_final) + '</code></td>' +
        '<td class="acts"><button class="btn sm" data-ae="' + a.id + '">Editar</button> <button class="btn sm" data-ar="' + a.id + '">Novo código</button> <button class="btn sm" data-at="' + a.id + '">' + (a.ativo ? 'Desativar' : 'Reativar') + '</button></td></tr>';
    }).join('');
    $('#body').innerHTML = '<div class="page gut"><div class="page-h"><div><h2>Advogados e representantes</h2><p class="muted" style="margin:0">Quem tem mais de um processo recebe um código fixo. Digitando-o na página do cliente, ele vê a lista dos seus processos (protocolo, etapa e a referência curta), sem nomes dos requerentes.</p></div><button class="btn primary" id="avNew">' + ICON.plus + 'Novo advogado</button></div>' +
      (S.advs.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Processos</th><th>Código</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="msg info" style="margin-top:12px">Nenhum advogado cadastrado ainda.</div>') + '</div>';
    $('#avNew').onclick = function () { advForm(null); };
    document.querySelectorAll('[data-ae]').forEach(function (b) { b.onclick = function () { advForm(advById(+b.dataset.ae)); }; });
    document.querySelectorAll('[data-ar]').forEach(function (b) {
      b.onclick = function () {
        var a = advById(+b.dataset.ar);
        confirmDialog({ titulo: 'Gerar novo código?', texto: 'O código atual de <b>' + esc(a.nome) + '</b> deixa de funcionar. Use isto se ele foi perdido ou exposto.', ok: 'Gerar novo código' }).then(function (ok) {
          if (!ok) return;
          sb.rpc('redefinir_codigo_advogado', { p_id: a.id }).then(function (r) {
            if (r.error) return toast(errText(r.error));
            a.codigo_final = r.data.slice(-4); renderAdvogados(); showCode('Novo código', a.nome, r.data);
          });
        });
      };
    });
    document.querySelectorAll('[data-at]').forEach(function (b) {
      b.onclick = function () {
        var a = advById(+b.dataset.at);
        sb.from('advogados').update({ ativo: !a.ativo }).eq('id', a.id).then(function (r) {
          if (r.error) return toast(errText(r.error)); a.ativo = !a.ativo; toast(a.nome + (a.ativo ? ' reativado(a).' : ' desativado(a): o código não funciona mais.')); renderAdvogados();
        });
      };
    });
  }

  /* ---------- equipe (Oficial) ---------- */
  function renderEquipe() {
    var cnt = function (id) { return S.procs.filter(function (p) { return p.responsavel_id === id && p.fase_id < 8; }).length; };
    var rows = S.equipe.map(function (u) {
      var self = u.id === S.me.id;
      return '<tr><td><b>' + esc(u.nome) + '</b>' + (u.papel === 'oficial' ? ' <span class="chip gold">Oficial</span>' : '') + '</td><td>' + esc(u.email) + '</td><td>' + (u.aprovado ? cnt(u.id) : '—') + '</td><td>' + fmtDate(u.criado_em) + '</td>' +
        '<td><span class="pill sm" style="--c:' + (u.aprovado ? 'var(--ok)' : 'var(--warn)') + '">' + (u.aprovado ? 'Aprovado' : 'Aguardando') + '</span></td>' +
        '<td>' + (self ? '' : '<button class="btn sm ' + (u.aprovado ? '' : 'primary') + '" data-uid="' + u.id + '" data-ap="' + (u.aprovado ? '0' : '1') + '">' + (u.aprovado ? 'Bloquear' : 'Aprovar') + '</button>') + '</td></tr>';
    }).join('');
    var opts = approved().map(function (u) { return '<option value="' + u.id + '">' + esc(u.nome) + '</option>'; }).join('');
    $('#body').innerHTML = '<div class="page gut"><h2>Equipe</h2><p class="muted" style="margin:0">Cada escrevente cria a própria conta. O acesso só começa depois que você aprova.</p>' +
      '<div class="tblwrap"><table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Em andamento</th><th>Cadastro</th><th>Situação</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h3 style="margin:22px 0 4px">Passar processos de um escrevente para outro</h3><p class="muted" style="margin:0">Útil em férias ou afastamentos. Só os processos em andamento mudam; a troca fica registrada.</p>' +
      '<div class="row2 wrap" style="margin-top:8px"><select id="trDe" aria-label="De"><option value="">De…</option>' + opts + '</select><span>→</span><select id="trPara" aria-label="Para"><option value="">Para…</option>' + opts + '</select><button class="btn" id="trOk">Passar processos</button></div></div>';
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
    $('#trOk').onclick = function () {
      var de = $('#trDe').value, para = $('#trPara').value;
      if (!de || !para || de === para) return toast('Escolha dois escreventes diferentes.');
      var n = S.procs.filter(function (p) { return p.responsavel_id === de && p.fase_id < 8; }).length;
      if (!n) return toast(userName(de) + ' não tem processos em andamento.');
      confirmDialog({ titulo: 'Passar ' + n + ' ' + plural(n, 'processo', 'processos') + '?', texto: 'De <b>' + esc(userName(de)) + '</b> para <b>' + esc(userName(para)) + '</b>.', ok: 'Passar processos' }).then(function (ok) {
        if (!ok) return;
        sb.from('processos').update({ responsavel_id: para }).eq('responsavel_id', de).lt('fase_id', 8).then(function (r) {
          if (r.error) return toast(errText(r.error)); toast(n + ' ' + plural(n, 'processo passou', 'processos passaram') + ' para ' + userName(para) + '.'); reloadProcs().then(renderEquipe);
        });
      });
    };
  }

  /* ---------- e-mails (Oficial) ---------- */
  function renderEmails() {
    $('#body').innerHTML = '<div class="page gut"><h2>E-mails enviados</h2><p class="muted" style="margin:0">Um e-mail é pedido a cada mudança de fase ou de prazo e sai em até 1 minuto. Aqui você confere se saiu. Se falhar, o sistema tenta até 3 vezes.</p><div id="emTbl"><div class="loading">Carregando…</div></div></div>';
    sb.from('emails_enviados').select('id,destinatario,status,erro,copia,criado_em,enviado_em,processos(protocolo)').order('criado_em', { ascending: false }).limit(100).then(function (r) {
      var el = $('#emTbl'); if (!el) return;
      if (r.error) { el.innerHTML = '<div class="msg err">' + esc(r.error.message) + '</div>'; return; }
      var st = { pendente: 'Na fila', enviando: 'Enviando', enviado: 'Enviado', falhou: 'Falhou' };
      el.innerHTML = r.data.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Quando</th><th>Protocolo</th><th>Para</th><th>Situação</th></tr></thead><tbody>' +
        r.data.map(function (e) {
          return '<tr><td>' + fmtDT(e.criado_em) + '</td><td>' + esc(e.processos ? e.processos.protocolo : '—') + '</td><td>' + esc(mask(e.destinatario)) + (e.copia ? ' <span class="muted small">(cópia)</span>' : '') + '</td><td><span class="pill sm st-' + e.status + '">' + st[e.status] + '</span>' + (e.erro ? ' <span class="muted small">' + esc(e.erro) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="msg info" style="margin-top:12px">Nenhum e-mail ainda.</div>';
    });
  }

  /* ---------- ajustes (Oficial) ---------- */
  function renderAjustes() {
    var subs = [['fases', 'Fases'], ['mensagens', 'Mensagens prontas'], ['dados', 'Dados e exportação'], ['auditoria', 'Registro de alterações']];
    $('#body').innerHTML = '<div class="page gut"><h2>Ajustes</h2><div class="subnav" role="tablist">' +
      subs.map(function (s) { return '<button class="subtab" role="tab" data-sub="' + s[0] + '" aria-selected="' + (S.sub === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div><div id="subBody"></div></div>';
    document.querySelectorAll('.subtab').forEach(function (b) { b.onclick = function () { S.sub = b.dataset.sub; renderAjustes(); }; });
    ({ fases: ajFases, mensagens: ajMensagens, dados: ajDados, auditoria: ajAuditoria })[S.sub]();
  }

  function ajFases() {
    $('#subBody').innerHTML = '<p class="muted">Troque o nome e o texto que o requerente vê em cada etapa. A ordem das etapas é fixa. Uma etapa que você não usa pode ser ocultada (só se não houver processos nela).</p>' +
      S.fases.map(function (f) {
        var fixa = f.id === 1 || f.id === 2 || f.id === 8;
        return '<div class="fase-row" data-f="' + f.id + '"><div class="fase-n" style="--c:' + phaseColor(f.id) + '">' + f.id + '</div><div class="fase-f">' +
          '<label>Nome da etapa</label><input type="text" maxlength="80" data-k="nome" value="' + esc(f.nome) + '">' +
          '<label>Texto mostrado ao requerente</label><textarea rows="2" maxlength="400" data-k="descricao_publica">' + esc(f.descricao_publica || '') + '</textarea>' +
          '<div class="row2 wrap"><label class="check"><input type="checkbox" data-k="oculta"' + (f.oculta ? ' checked' : '') + (fixa ? ' disabled' : '') + '> Ocultar esta etapa' + (fixa ? ' (obrigatória)' : '') + '</label><button class="btn sm primary" data-save="' + f.id + '">Salvar</button></div></div></div>';
      }).join('');
    document.querySelectorAll('[data-save]').forEach(function (b) {
      b.onclick = function () {
        var row = b.closest('.fase-row'), id = +row.dataset.f;
        var nome = row.querySelector('[data-k=nome]').value.trim(), desc = row.querySelector('[data-k=descricao_publica]').value.trim();
        if (nome.length < 2) return toast('Informe o nome da etapa.');
        b.disabled = true;
        sb.from('fases').update({ nome: nome, descricao_publica: desc, oculta: row.querySelector('[data-k=oculta]').checked }).eq('id', id).then(function (r) {
          b.disabled = false;
          if (r.error) { toast(errText(r.error)); return; }
          var f = faseById(id); f.nome = nome; f.descricao_publica = desc; f.oculta = row.querySelector('[data-k=oculta]').checked;
          toast('Etapa salva.');
        });
      };
    });
  }

  function ajMensagens() {
    var grupos = [{ id: null, nome: 'Qualquer etapa' }].concat(S.fases.map(function (f) { return { id: f.id, nome: f.nome }; }));
    $('#subBody').innerHTML = '<p class="muted">Textos prontos que os escreventes escolhem ao mover um processo. Máximo de 600 caracteres.</p>' +
      '<div class="card-box"><h3 style="margin:0 0 6px">Nova mensagem</h3><div class="grid2"><div><label for="mpFase">Etapa</label><select id="mpFase">' + grupos.map(function (g) { return '<option value="' + (g.id == null ? '' : g.id) + '">' + esc(g.nome) + '</option>'; }).join('') + '</select></div><div><label for="mpTit">Título</label><input type="text" id="mpTit" maxlength="80"></div></div>' +
      '<label for="mpTxt">Texto</label><textarea id="mpTxt" rows="3" maxlength="600"></textarea><div class="err" id="mpErr"></div><button class="btn primary" id="mpAdd">Adicionar</button></div>' +
      grupos.map(function (g) {
        var l = S.msgs.filter(function (m) { return (m.fase_id == null ? null : m.fase_id) === g.id; });
        if (!l.length) return '';
        return '<h3 style="margin:16px 0 4px">' + esc(g.nome) + '</h3>' + l.map(function (m) {
          return '<div class="msg-row"><div><b>' + esc(m.titulo) + '</b><p>' + esc(m.texto) + '</p></div><button class="btn sm" data-mdel="' + m.id + '">Excluir</button></div>';
        }).join('');
      }).join('');
    $('#mpAdd').onclick = function () {
      var t = $('#mpTit').value.trim(), x = $('#mpTxt').value.trim(), f = $('#mpFase').value;
      if (t.length < 2 || x.length < 2) return ($('#mpErr').textContent = 'Preencha título e texto.');
      sb.from('mensagens_padrao').insert({ fase_id: f ? +f : null, titulo: t, texto: x }).select().single().then(function (r) {
        if (r.error) return ($('#mpErr').textContent = errText(r.error));
        S.msgs.push(r.data); S.msgs.sort(function (a, b) { return (a.fase_id || 0) - (b.fase_id || 0) || a.id - b.id; }); toast('Mensagem adicionada.'); ajMensagens();
      });
    };
    document.querySelectorAll('[data-mdel]').forEach(function (b) {
      b.onclick = function () {
        sb.from('mensagens_padrao').delete().eq('id', +b.dataset.mdel).then(function (r) {
          if (r.error) return toast(errText(r.error)); S.msgs = S.msgs.filter(function (m) { return m.id !== +b.dataset.mdel; }); ajMensagens();
        });
      };
    });
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportCsv() {
    var head = ['Protocolo', 'Requerente', 'E-mail', 'E-mails adicionais', 'Imóvel', 'Referência', 'Matrícula', 'Tipo de usucapião', 'Data da prenotação', 'Advogado', 'Fase', 'Responsável', 'Prazo do edital', 'Na fase desde', 'Criado em'];
    var rows = S.procs.slice().sort(function (a, b) { return a.protocolo.localeCompare(b.protocolo, 'pt-BR', { numeric: true }); }).map(function (p) {
      var a = advById(p.advogado_id);
      return [p.protocolo, p.requerente_nome, p.requerente_email, (p.emails_extra || []).join(' | '), p.imovel, p.referencia, p.matricula, p.tipo_usucapiao,
        p.data_prenotacao ? fmtYMD(p.data_prenotacao) : '', a ? a.nome : '', faseById(p.fase_id).nome, p.responsavel_id ? userName(p.responsavel_id) : '',
        p.prazo_edital ? fmtYMD(p.prazo_edital) : '', fmtDate(p.fase_desde), fmtDate(p.criado_em)].map(csvCell).join(';');
    });
    var blob = new Blob(['﻿' + head.map(csvCell).join(';') + '\r\n' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'usucapioes-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function ajDados() {
    $('#subBody').innerHTML = '<div class="card-box"><h3 style="margin:0 0 4px">Exportar planilha</h3><p class="muted" style="margin:0 0 8px">Baixa todos os processos (' + S.procs.length + ') em CSV, que abre no Excel. O arquivo contém dados pessoais: guarde e compartilhe com cuidado.</p><button class="btn" id="exCsv">Baixar CSV</button></div>' +
      '<div class="card-box danger-box"><h3 style="margin:0 0 4px">Apagar todos os processos</h3><p class="muted" style="margin:0 0 8px">Esvazia o quadro inteiro, com históricos e e-mails ligados. Exporte a planilha antes. Não dá para desfazer. Para apagar só um processo, abra o cartão e use “Apagar este processo”.</p><button class="btn danger" id="exClr"' + (S.procs.length ? '' : ' disabled') + '>Apagar todos os processos</button></div>';
    $('#exCsv').onclick = exportCsv;
    $('#exClr').onclick = function () {
      confirmDialog({ titulo: 'Apagar TODOS os processos?', perigo: true, ok: 'Apagar tudo', digitar: 'APAGAR TUDO',
        texto: 'Serão apagados <b>' + S.procs.length + '</b> processos, com todo o histórico. Você baixou a planilha antes?' }).then(function (ok) {
        if (!ok) return;
        sb.rpc('limpar_quadro', { p_confirmacao: 'APAGAR TUDO' }).then(function (r) {
          if (r.error) return toast(errText(r.error));
          toast(r.data + ' processos apagados.'); reloadProcs().then(renderAjustes);
        });
      });
    };
  }

  function ajAuditoria() {
    $('#subBody').innerHTML = '<p class="muted">As últimas 200 alterações de dados (criação, edição, troca de protocolo, de responsável, exclusões).</p><div id="auTbl"><div class="loading">Carregando…</div></div>';
    sb.from('auditoria').select('*').order('em', { ascending: false }).limit(200).then(function (r) {
      var el = $('#auTbl'); if (!el) return;
      if (r.error) { el.innerHTML = '<div class="msg err">' + esc(r.error.message) + '</div>'; return; }
      el.innerHTML = r.data.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Protocolo</th><th>O que mudou</th></tr></thead><tbody>' + r.data.map(function (a) {
        var det = a.detalhes || {}, txt;
        if (a.acao === 'criado') txt = 'Processo criado';
        else if (a.acao === 'excluido') txt = 'Processo excluído';
        else if (a.acao === 'quadro_limpo') txt = 'Todos os processos apagados (' + det.processos + ')';
        else txt = Object.keys(det).map(function (c) { return (FIELD[c] || c) + ': ' + fmtVal(c, det[c].de) + ' → ' + fmtVal(c, det[c].para); }).join('; ');
        return '<tr><td>' + fmtDT(a.em) + '</td><td>' + esc(userName(a.por)) + '</td><td>' + esc(a.protocolo || '—') + '</td><td>' + esc(txt) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="msg info">Nada registrado ainda.</div>';
    });
  }

  /* ---------- minha conta ---------- */
  function renderConta() {
    $('#body').innerHTML = '<div class="page gut narrow"><h2>Minha conta</h2><p class="muted" style="margin:0">' + esc(S.me.nome) + ' · ' + esc(S.me.email) + '</p>' +
      '<div class="card-box"><h3 style="margin:0 0 4px">Resumo diário por e-mail</h3><p class="muted" style="margin:0 0 8px">Nos dias úteis, às 8h, você recebe a lista dos seus processos parados há mais de 30 dias ou com prazo de edital perto do fim.' + (isOficial() ? ' Como Oficial, você também recebe os processos sem responsável.' : '') + '</p><label class="check"><input type="checkbox" id="cResumo"' + (S.me.resumo_diario ? ' checked' : '') + '> Receber o resumo diário</label></div>' +
      '<div class="card-box"><h3 style="margin:0 0 4px">Verificação em duas etapas</h3><div id="mfaBox"><div class="loading">Carregando…</div></div></div>' +
      '<div class="card-box"><h3 style="margin:0 0 4px">Trocar senha</h3><label for="cPass">Nova senha</label><input type="password" id="cPass" autocomplete="new-password" placeholder="Mínimo de 8 caracteres"><div class="err" id="cPErr"></div><button class="btn" id="cPBtn" style="margin-top:8px">Salvar senha</button></div></div>';
    $('#cResumo').onchange = function (e) {
      sb.rpc('definir_resumo_diario', { p_ativo: e.target.checked }).then(function (r) { if (r.error) { toast(errText(r.error)); e.target.checked = !e.target.checked; } else { S.me.resumo_diario = e.target.checked; toast(e.target.checked ? 'Resumo diário ativado.' : 'Resumo diário desativado.'); } });
    };
    $('#cPBtn').onclick = function () {
      var v = $('#cPass').value; if (v.length < 8) return ($('#cPErr').textContent = 'A senha precisa ter pelo menos 8 caracteres.');
      sb.auth.updateUser({ password: v }).then(function (r) { if (r.error) return ($('#cPErr').textContent = r.error.message); $('#cPass').value = ''; $('#cPErr').textContent = ''; toast('Senha alterada.'); });
    };
    renderMfa();
  }

  function renderMfa() {
    var box = $('#mfaBox'); if (!box) return;
    sb.auth.mfa.listFactors().then(function (r) {
      var f = r.data && r.data.totp && r.data.totp.find(function (x) { return x.status === 'verified'; });
      if (f) {
        box.innerHTML = '<p class="muted" style="margin:0 0 8px"><span class="pill sm" style="--c:var(--ok)">Ativada</span> Ao entrar, além da senha, é pedido o código do aplicativo autenticador.</p><button class="btn" id="mfaOff">Desativar</button>';
        $('#mfaOff').onclick = function () {
          confirmDialog({ titulo: 'Desativar a verificação em duas etapas?', texto: 'A conta ficará protegida só pela senha.', ok: 'Desativar', perigo: true }).then(function (ok) {
            if (!ok) return;
            sb.auth.mfa.unenroll({ factorId: f.id }).then(function (u) { if (u.error) return toast(errText(u.error)); toast('Verificação em duas etapas desativada.'); sb.auth.refreshSession().then(renderMfa); });
          });
        };
      } else {
        box.innerHTML = (isOficial() ? '<div class="warnbox" style="margin:0 0 8px">Recomendado para o Oficial: protege o acesso à equipe, aos dados e aos ajustes mesmo que a senha vaze.</div>' : '') +
          '<p class="muted" style="margin:0 0 8px">Use um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator, Authy, 1Password).</p><button class="btn primary" id="mfaOn">Ativar</button><div id="mfaSetup"></div>';
        $('#mfaOn').onclick = function () {
          $('#mfaOn').disabled = true;
          sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Celular ' + Date.now().toString(36) }).then(function (e) {
            if (e.error) { $('#mfaOn').disabled = false; return toast(errText(e.error)); }
            $('#mfaSetup').innerHTML = '<ol class="steps"><li>Abra o aplicativo e escolha adicionar conta, ler QR code.</li><li>Aponte a câmera para o código abaixo.</li><li>Digite aqui os 6 números que o aplicativo mostrar.</li></ol>' +
              '<img class="qr" alt="QR code para o aplicativo autenticador" src="' + esc(e.data.totp.qr_code) + '"><p class="hint">Sem câmera? Digite esta chave no aplicativo: <code>' + esc(e.data.totp.secret) + '</code></p>' +
              '<div class="row2"><input type="text" id="mfaCode" inputmode="numeric" maxlength="6" placeholder="000000" aria-label="Código de 6 números"><button class="btn primary" id="mfaOk">Confirmar</button></div><div class="err" id="mfaErr"></div>';
            $('#mfaOk').onclick = function () {
              var code = $('#mfaCode').value.replace(/\s/g, '');
              if (!/^\d{6}$/.test(code)) return ($('#mfaErr').textContent = 'O código tem 6 números.');
              sb.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: code }).then(function (v) {
                if (v.error) return ($('#mfaErr').textContent = 'Código incorreto. Tente o próximo que aparecer.');
                toast('Verificação em duas etapas ativada.'); renderMfa();
              });
            };
          });
        };
      }
    });
  }

  /* ---------- eventos globais ---------- */
  document.addEventListener('click', function (e) {
    var as = e.target.closest('[data-assign]');
    if (as) { e.stopPropagation(); if (Date.now() - lastDrag > 250) openAssign(+as.dataset.assign); return; }
    var card = e.target.closest('.card');
    if (card && Date.now() - lastDrag > 250) openDetail(+card.dataset.id);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('card')) { e.preventDefault(); openDetail(+e.target.dataset.id); }
  });
  ['#dMove', '#dDetail', '#dNew', '#dGen'].forEach(function (s) { $(s).addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); }); });

  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'PASSWORD_RECOVERY') showRecovery();
    if (ev === 'SIGNED_OUT' && S.me) { S = freshState(); showAuth('login'); }
  });

  /* ---------- início ---------- */
  if (/type=recovery/.test(location.hash)) { showRecovery(); }
  else sb.auth.getSession().then(function (r) { if (r.data && r.data.session && !recovering) enter(); else if (!recovering) showAuth('login'); });
})();
