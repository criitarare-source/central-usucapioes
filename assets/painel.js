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
  function freshState() { return { me: null, fases: [], equipe: [], procs: [], advs: [], msgs: [], externos: [], prazos: [], view: 'quadro', sub: 'fases' }; }
  var S = freshState();
  var F = { q: '', resp: 'all', att: false, tipo: '', mine: false, stall: 0, prov: false };
  var SEL = { on: false, ids: {} };
  var dragging = false, needReload = false, channel = null, recovering = false;

  var visFases = function () { return S.fases.filter(function (f) { return !f.oculta; }); };
  var faseById = function (id) { return S.fases.find(function (f) { return f.id === id; }) || { id: id, nome: 'Fase ' + id }; };
  var userById = function (id) { return S.equipe.find(function (u) { return u.id === id; }); };
  var userName = function (id) { var u = userById(id); return u ? u.nome : 'Sem responsável'; };
  var advById = function (id) { return S.advs.find(function (a) { return a.id === id; }); };
  var approved = function () { return S.equipe.filter(function (u) { return u.aprovado; }); };
  var extById = function (id) { return S.externos.find(function (x) { return x.id === id; }); };
  var respKey = function (p) { return p.responsavel_id ? 'u:' + p.responsavel_id : p.responsavel_externo_id ? 'x:' + p.responsavel_externo_id : ''; };
  var keyName = function (k) {
    if (!k) return 'Sem responsável';
    if (k.charAt(0) === 'u') return userName(k.slice(2));
    var x = extById(+k.slice(2)); return x ? x.nome : 'Pessoa removida';
  };
  var respName = function (p) { return keyName(respKey(p)); };
  var respPayload = function (k) { return { responsavel_id: k && k.charAt(0) === 'u' ? k.slice(2) : null, responsavel_externo_id: k && k.charAt(0) === 'x' ? +k.slice(2) : null }; };
  var openPrazos = function (pid) { return S.prazos.filter(function (z) { return z.processo_id === pid && z.situacao === 'aberto'; }).sort(function (a, b) { return a.vence_em < b.vence_em ? -1 : 1; }); };
  var TIPO_PRAZO = { intimacao: 'Intimação', edital: 'Edital', exigencia: 'Exigência', outro: 'Prazo' };
  var userIdx = function (id) { var i = approved().findIndex(function (u) { return u.id === id; }); return Math.max(0, i); };
  var initials = function (n) { return n === 'Oficial' ? 'OF' : String(n).trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  var avatarKey = function (k) {
    if (!k) return '<span class="av" aria-hidden="true">?</span>';
    if (k.charAt(0) === 'u') return avatar(k.slice(2));
    return '<span class="av ext" aria-hidden="true">' + esc(initials(keyName(k))) + '</span>';
  };
  var avatar = function (id) { var n = userName(id); return '<span class="av" style="--i:' + (userIdx(id) % 4) + '" aria-hidden="true">' + (id ? esc(initials(n)) : '?') + '</span>'; };
  var isOficial = function () { return S.me && S.me.papel === 'oficial'; };
  var byId = function (id) { return S.procs.find(function (p) { return p.id === id; }); };
  var isProv = function (p) { return /\.invalid$/i.test(p.requerente_email || '') || /^a preencher/i.test(p.requerente_nome || ''); };
  var selCount = function () { return Object.keys(SEL.ids).length; };
  var fmtCode = function (c) { return String(c).replace(/(.{4})(?=.)/g, '$1-'); };

  function phaseColor(id) {
    if (id === 3) return 'var(--warn)';
    if (id === 8) return 'var(--ok)';
    if (id === 9) return 'var(--bad)';
    var i = { 1: 0, 2: 1, 4: 2, 5: 3, 6: 4, 7: 5 }[id] || 0;
    return 'color-mix(in srgb, var(--gold) ' + (i * 18) + '%, var(--green-2))';
  }

  var toastT;
  function toast(t, act, ms) {
    var el = $('#toast'); el.textContent = t; el.hidden = false;
    if (act) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = act.label;
      b.onclick = function () { clearTimeout(toastT); el.hidden = true; act.fn(); };
      el.appendChild(b);
    }
    clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, ms || (act ? 30000 : 5000));
  }
  /* preferências do aparelho (tema, tamanho da letra, filtros salvos, tour) */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
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
        if (r.error) { setMsg('err', r.error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : r.error.message === 'Email not confirmed' ? 'Esta conta ainda não foi liberada. Peça ao Oficial.' : r.error.message); return; }
        return enter();
      });
    } else if (mode === 'signup') {
      var nome = $('#aNome').value.trim();
      if (nome.length < 2) { btn.disabled = false; return setMsg('err', 'Informe o seu nome.'); }
      p = sb.auth.signUp({ email: mail, password: pass, options: { data: { nome: nome }, emailRedirectTo: location.origin + '/painel' } }).then(function (r) {
        if (r.error) { setMsg('err', r.error.message); return; }
        if (r.data && r.data.session) return enter();
        showAuth('login', { k: 'ok', t: 'Conta criada. Agora é só entrar: o Oficial vai aprovar o seu acesso.' });
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
          return loadAll().then(function (ok) { if (ok) { renderApp(); subscribe(); maybeTour(); } });
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
      sb.from('mensagens_padrao').select('*').order('fase_id', { nullsFirst: true }).order('id'),
      sb.from('pessoas_externas').select('*').order('nome'),
      sb.from('prazos').select('*').eq('situacao', 'aberto').order('vence_em')
    ]).then(function (r) {
      var bad = r.find(function (x) { return x.error; });
      if (bad) { $('#root').innerHTML = '<div class="loading">Não foi possível carregar os dados: ' + esc(bad.error.message) + '</div>'; return false; }
      S.fases = r[0].data; S.equipe = r[1].data; S.procs = r[2].data; S.advs = r[3].data; S.msgs = r[4].data; S.externos = r[5].data; S.prazos = r[6].data;
      var me = S.equipe.find(function (u) { return u.id === S.me.id; }); if (me) S.me = Object.assign(S.me, me);
      return true;
    });
  }

  function reloadProcs() {
    if (dragging) { needReload = true; return Promise.resolve(); }
    return Promise.all([sb.from('processos').select('*').order('ord'), sb.from('prazos').select('*').eq('situacao', 'aberto').order('vence_em'), sb.from('pessoas_externas').select('*').order('nome')]).then(function (rs) {
      var r = rs[0]; if (r.error) return;
      S.procs = r.data; if (!rs[1].error) S.prazos = rs[1].data; if (!rs[2].error) S.externos = rs[2].data;
      if (S.view === 'quadro' && $('#board')) { renderStats(); renderBoard(); renderResps(); }
      else if (S.view === 'prazos' && !$('#dDetail').open) renderPrazos();
      var d = $('#dDetail');
      if (d.open && d.dataset.id && !d.dataset.dirty) fillDetail(+d.dataset.id);
    });
  }
  var reloadT;
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    var ping = function () { clearTimeout(reloadT); reloadT = setTimeout(reloadProcs, 300); };
    channel = sb.channel('processos-ao-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'processos' }, ping)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prazos' }, ping)
      .subscribe();
  }

  /* ---------- estrutura do app ---------- */
  function pendentesCount() { return S.equipe.filter(function (u) { return !u.aprovado; }).length; }

  function renderApp() {
    var tab = function (v, label, extra) { return '<button class="tab" role="tab" data-view="' + v + '" aria-selected="' + (S.view === v) + '">' + label + (extra || '') + '</button>'; };
    var tabs = tab('quadro', 'Quadro') + tab('prazos', 'Prazos') + tab('advogados', 'Advogados');
    if (isOficial()) {
      var n = pendentesCount();
      tabs += tab('equipe', 'Equipe', n ? '<span class="badge-n">' + n + '</span>' : '') + tab('emails', 'E-mails') + tab('ajustes', 'Ajustes');
    }
    tabs += tab('conta', 'Minha conta');
    $('#root').innerHTML =
      '<div class="app"><header class="top"><div class="top-in gut">' +
      '<img class="logo" src="' + LOGO + '" alt="Registro de Imóveis de Itararé">' +
      '<div class="brand"><h1>Visualizador de Usucapiões</h1><p>Usucapião extrajudicial · Itararé</p></div>' +
      '<nav class="tabs" role="tablist" aria-label="Seções">' + tabs + '</nav>' +
      '<div class="who2"><button type="button" class="btn hbtn" id="bGlobal" title="Buscar em todos os processos (atalho: /)">' + ICON.search + '<span>Buscar</span><kbd>/</kbd></button><button type="button" class="btn hbtn" id="bTema" title="Mudar o tema"></button><button type="button" class="btn hbtn" id="bFonte" title="Mudar o tamanho da letra"></button><button type="button" class="btn hbtn" id="bAjuda" title="Atalhos e tour" aria-label="Ajuda">?</button><span class="who-n">' + esc(S.me.nome) + (isOficial() ? ' · Oficial' : '') + '</span><a href="/" target="_blank" rel="noopener">Página do cliente</a><button class="btn" id="bOut">Sair</button></div>' +
      '</div></header><div id="body" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>';
    $('#bOut').onclick = signOut;
    $('#bGlobal').onclick = openGlobalSearch;
    $('#bAjuda').onclick = openHelp;
    var prefBtns = function () { $('#bTema').textContent = '◐ ' + { auto: 'Auto', claro: 'Claro', escuro: 'Escuro' }[window.CENTRAL_PREFS.get().tema]; $('#bFonte').textContent = 'Aa ' + window.CENTRAL_PREFS.get().fonte; };
    prefBtns();
    $('#bTema').onclick = function () { window.CENTRAL_PREFS.cycle('tema'); prefBtns(); };
    $('#bFonte').onclick = function () { window.CENTRAL_PREFS.cycle('fonte'); prefBtns(); };
    document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { S.view = t.dataset.view; SEL.on = false; SEL.ids = {}; renderApp(); }; });
    var v = S.view;
    if (v === 'equipe' && isOficial()) renderEquipe();
    else if (v === 'emails' && isOficial()) renderEmails();
    else if (v === 'ajustes' && isOficial()) renderAjustes();
    else if (v === 'prazos') renderPrazos();
    else if (v === 'advogados') renderAdvogados();
    else if (v === 'conta') renderConta();
    else renderQuadro();
  }

  /* ---------- quadro ---------- */
  function attention(p) {
    if (p.fase_id >= 8) return null;
    var pz = openPrazos(p.id)[0];
    if (pz) {
      var d = daysLeft(pz.vence_em), nm = TIPO_PRAZO[pz.tipo].toLowerCase();
      if (d < 0) return { t: 'Prazo (' + nm + ') vencido', c: 'bad' };
      if (d <= 15) return { t: d === 0 ? 'Prazo (' + nm + ') vence hoje' : 'Prazo (' + nm + '): ' + d + ' ' + plural(d, 'dia', 'dias'), c: 'warn' };
    }
    if (p.fase_id !== 3 && daysSince(p.fase_desde) > 30) return { t: 'Parado há ' + daysSince(p.fase_desde) + ' dias', c: 'warn' };
    return null;
  }
  function searchText(p) {
    var a = advById(p.advogado_id);
    return [p.protocolo, p.requerente_nome, p.imovel, p.matricula, p.referencia, p.tipo_usucapiao, a ? a.nome : '', p.requerente_email].join(' ').toLowerCase();
  }
  function visible(p) {
    if (F.resp === 'none') { if (respKey(p)) return false; }
    else if (F.resp !== 'all' && respKey(p) !== F.resp) return false;
    if (F.tipo && p.tipo_usucapiao !== F.tipo) return false;
    if (F.att && !attention(p) && p.fase_id !== 3) return false;
    if (F.mine && respKey(p) !== 'u:' + S.me.id) return false;
    if (F.stall && (p.fase_id >= 8 || daysSince(p.fase_desde) < F.stall)) return false;
    if (F.prov && !isProv(p)) return false;
    if (F.q && searchText(p).indexOf(F.q.toLowerCase()) < 0) return false;
    return true;
  }

  function filtroAtivo() { return F.q || F.resp !== 'all' || F.att || F.tipo || F.mine || F.stall || F.prov; }
  function renderQuadro() {
    var tipos = Array.from(new Set(S.procs.map(function (p) { return p.tipo_usucapiao; }).filter(Boolean))).sort();
    var salvos = lsGet('central_filtros', []);
    $('#body').innerHTML =
      '<div class="toolbar gut"><div class="search">' + ICON.search + '<input id="q" type="search" placeholder="Filtrar o quadro (protocolo, nome, imóvel…)" aria-label="Filtrar processos do quadro" value="' + esc(F.q) + '"></div>' +
      '<div class="chips" id="resps" role="group" aria-label="Filtrar por escrevente"></div>' +
      (tipos.length ? '<select id="fTipo" class="fsel" aria-label="Filtrar por tipo de usucapião"><option value="">Todos os tipos</option>' + tipos.map(function (t) { return '<option' + (F.tipo === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' : '') +
      '<div class="tb-right"><button type="button" class="btn" id="bSel" aria-pressed="' + SEL.on + '">' + (SEL.on ? 'Sair da seleção' : 'Selecionar vários') + '</button>' +
      '<button type="button" class="btn" id="bImp">Importar planilha</button>' +
      '<button type="button" class="btn primary" id="bNew">' + ICON.plus + 'Novo processo</button></div></div>' +
      '<div class="toolbar quick gut" id="quick" role="group" aria-label="Filtros rápidos"></div>' +
      '<div class="stats gut" id="stats"></div><div class="board gut" id="board" aria-label="Quadro de processos"></div><div id="selbar" class="selbar" hidden></div>';
    $('#q').oninput = function (e) { F.q = e.target.value.trim(); renderBoard(); renderQuick(); };
    if ($('#fTipo')) $('#fTipo').onchange = function (e) { F.tipo = e.target.value; renderBoard(); renderQuick(); };
    $('#bNew').onclick = openNew;
    $('#bImp').onclick = openImport;
    $('#bSel').onclick = function () { SEL.on = !SEL.on; SEL.ids = {}; renderQuadro(); };
    renderResps(); renderStats(); renderQuick(); renderBoard(); renderSelBar();
  }

  function renderQuick() {
    var el = $('#quick'); if (!el) return;
    var salvos = lsGet('central_filtros', []);
    var pre = [
      ['mine', 'Só os meus', F.mine], ['stall', 'Parados há 15+ dias', !!F.stall], ['att', 'Pedem atenção', F.att], ['prov', 'Dados a preencher', F.prov]
    ];
    el.innerHTML = '<span class="muted small">Filtros rápidos:</span>' + pre.map(function (c) {
      return '<button type="button" class="fchip plain" data-qf="' + c[0] + '" aria-pressed="' + c[2] + '">' + c[1] + '</button>';
    }).join('') +
      (salvos.length ? '<select id="fSalvos" class="fsel" aria-label="Meus filtros salvos"><option value="">Meus filtros salvos…</option>' + salvos.map(function (f, i) { return '<option value="' + i + '">' + esc(f.nome) + '</option>'; }).join('') + '</select>' : '') +
      (filtroAtivo() ? '<button type="button" class="linkbtn" id="fSave">Salvar este filtro</button><button type="button" class="linkbtn" id="fClear">Limpar filtros</button>' : '');
    el.querySelectorAll('[data-qf]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.qf;
        if (k === 'mine') F.mine = !F.mine; else if (k === 'stall') F.stall = F.stall ? 0 : 15; else if (k === 'att') F.att = !F.att; else if (k === 'prov') F.prov = !F.prov;
        renderQuick(); renderBoard();
      };
    });
    if ($('#fSalvos')) $('#fSalvos').onchange = function (e) {
      var f = salvos[+e.target.value]; if (!f) return;
      F.q = f.q || ''; F.resp = f.resp || 'all'; F.att = !!f.att; F.tipo = f.tipo || ''; F.mine = !!f.mine; F.stall = f.stall || 0; F.prov = !!f.prov;
      renderQuadro();
    };
    if ($('#fClear')) $('#fClear').onclick = function () { F = { q: '', resp: 'all', att: false, tipo: '', mine: false, stall: 0, prov: false }; renderQuadro(); };
    if ($('#fSave')) $('#fSave').onclick = function () {
      openGen('<h2>Salvar este filtro</h2><div class="muted">Fica guardado neste navegador. Aparece em “Meus filtros salvos”.</div><label for="fsNome">Nome do filtro</label><input type="text" id="fsNome" maxlength="40" placeholder="Ex.: Meus parados"><div class="err" id="fsErr" role="alert"></div><div class="m-f"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" id="fsOk">Salvar</button></div>', function (d) {
        $('#fsNome').focus();
        $('#fsOk').onclick = function () {
          var n = $('#fsNome').value.trim(); if (n.length < 2) return ($('#fsErr').textContent = 'Dê um nome ao filtro.');
          var l = lsGet('central_filtros', []).filter(function (x) { return x.nome !== n; });
          l.push({ nome: n, q: F.q, resp: F.resp, att: F.att, tipo: F.tipo, mine: F.mine, stall: F.stall, prov: F.prov });
          lsSet('central_filtros', l); d.close(); toast('Filtro “' + n + '” salvo.'); renderQuick();
        };
      });
    };
  }

  function renderResps() {
    $('#resps').innerHTML = '<button type="button" class="fchip plain" data-resp="all" aria-pressed="' + (F.resp === 'all') + '">Todos</button>' +
      approved().map(function (u) { return '<button type="button" class="fchip" data-resp="u:' + u.id + '" aria-pressed="' + (F.resp === 'u:' + u.id) + '">' + avatar(u.id) + esc(u.nome) + '</button>'; }).join('') +
      S.externos.filter(function (x) { return x.ativo || S.procs.some(function (p) { return p.responsavel_externo_id === x.id; }); }).map(function (x) { return '<button type="button" class="fchip" data-resp="x:' + x.id + '" aria-pressed="' + (F.resp === 'x:' + x.id) + '">' + avatarKey('x:' + x.id) + esc(x.nome) + '</button>'; }).join('') +
      '<button type="button" class="fchip plain" data-resp="none" aria-pressed="' + (F.resp === 'none') + '">Sem responsável</button>';
    document.querySelectorAll('#resps .fchip').forEach(function (b) { b.onclick = function () { F.resp = b.dataset.resp; renderResps(); renderBoard(); renderQuick(); }; });
  }

  function renderStats() {
    var act = S.procs.filter(function (p) { return p.fase_id < 8; });
    var venc = act.filter(function (p) { var z = openPrazos(p.id)[0]; return z && daysLeft(z.vence_em) <= 15; }).length;
    var par = act.filter(function (p) { return p.fase_id !== 3 && daysSince(p.fase_desde) > 30; }).length;
    var aw = S.procs.filter(function (p) { return p.fase_id === 3; }).length;
    var done = S.procs.filter(function (p) { return p.fase_id === 8; }).length;
    var sem = act.filter(function (p) { return !respKey(p); }).length;
    var prv = S.procs.filter(isProv).length;
    var st = function (n, l, a) { return '<div class="stat ' + (a && n ? 'alert' : '') + '"><b>' + n + '</b><span>' + l + '</span></div>'; };
    $('#stats').innerHTML = st(act.length, 'em andamento') + st(venc, 'prazos vencendo em 15 dias', 1) + st(par, 'parados há mais de 30 dias', 1) + st(sem, 'sem escrevente responsável', 1) + st(prv, 'com dados a preencher', 1) + st(aw, 'aguardando o requerente') + st(done, 'concluídos');
  }

  function brl(v) { var n = Number(v); return isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''; }
  function parseBrl(t) { t = String(t || '').replace(/[^0-9,.\-]/g, ''); if (!t) return null; if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); var n = parseFloat(t); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; }
  function cardHTML(p) {
    var a = attention(p), tags = [];
    if (p.fase_id === 3) tags.push('<span class="chip warn">Aguardando requerente</span>');
    var pzs = openPrazos(p.id);
    pzs.slice(0, 2).forEach(function (z) {
      var d = daysLeft(z.vence_em);
      tags.push('<span class="chip ' + (d < 0 ? 'bad' : d <= 15 ? 'warn' : 'gold') + '">' + ICON.clock + ' ' + TIPO_PRAZO[z.tipo] + ' até ' + fmtYMD(z.vence_em).slice(0, 5) + ' · ' + (d < 0 ? 'vencido' : d === 0 ? 'hoje' : d + ' ' + plural(d, 'dia', 'dias')) + '</span>');
    });
    if (pzs.length > 2) tags.push('<span class="chip">+' + (pzs.length - 2) + ' ' + plural(pzs.length - 2, 'prazo', 'prazos') + '</span>');
    if (p.fase_id === 5 && !pzs.some(function (z) { return z.tipo === 'edital'; })) tags.push('<span class="chip">Prazo do edital não informado</span>');
    if (a && !pzs.length) tags.push('<span class="chip ' + a.c + '">' + esc(a.t) + '</span>');
    var age = daysSince(p.fase_desde);
    if (isProv(p)) tags.unshift('<span class="chip prov">Dados a preencher</span>');
    var nivel = p.fase_id >= 8 ? '' : (a && a.c === 'bad') || (age > 60 && p.fase_id !== 3) ? 'lv-bad' : a || (age > 15 && p.fase_id !== 3) ? 'lv-warn' : '';
    var ageCls = p.fase_id >= 8 ? '' : p.fase_id !== 3 && age > 30 ? ' bad' : p.fase_id !== 3 && age > 15 ? ' warn' : '';
    return '<article class="card ' + nivel + (SEL.ids[p.id] ? ' is-sel' : '') + '" data-id="' + p.id + '" tabindex="0" role="button" aria-label="Processo ' + esc(p.protocolo) + ', ' + esc(p.requerente_nome) + ', responsável ' + esc(respName(p)) + '">' +
      '<div class="card-top">' + (SEL.on ? '<span class="selbox" aria-hidden="true">' + (SEL.ids[p.id] ? '✓' : '') + '</span>' : '') + '<span class="proto">' + esc(p.protocolo) + '</span><span class="grip" aria-hidden="true">' + ICON.grip + '</span></div>' +
      '<div class="nome">' + esc(p.requerente_nome) + '</div><div class="imovel">' + esc(p.referencia || p.imovel) + '</div>' +
      (isOficial() && p.valor != null ? '<div class="valor" title="Valor do ato / base de cálculo">' + brl(p.valor) + '</div>' : '') +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') +
      '<div class="card-foot"><button type="button" class="assign" data-assign="' + p.id + '" title="Mudar com quem está o processo">' + avatarKey(respKey(p)) + '<span class="resp">' + esc(respName(p)) + '</span></button><span class="age' + ageCls + '" title="Tempo nesta fase">' + (age === 0 ? 'hoje' : 'há ' + age + ' ' + plural(age, 'dia', 'dias')) + '</span></div></article>';
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

  /* ---------- seleção em lote ---------- */
  function visibleIds() { return S.procs.filter(visible).map(function (p) { return p.id; }); }
  function toggleSel(id) {
    if (SEL.ids[id]) delete SEL.ids[id]; else SEL.ids[id] = 1;
    var el = document.querySelector('.card[data-id="' + id + '"]');
    if (el) { el.classList.toggle('is-sel', !!SEL.ids[id]); var b = el.querySelector('.selbox'); if (b) b.textContent = SEL.ids[id] ? '✓' : ''; }
    renderSelBar();
  }
  function renderSelBar() {
    var bar = $('#selbar'); if (!bar) return;
    var n = selCount();
    if (!SEL.on) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = '<b>' + n + ' ' + plural(n, 'selecionado', 'selecionados') + '</b><button type="button" class="linkbtn" id="sbAll">Selecionar os ' + visibleIds().length + ' visíveis</button>' +
      '<select id="sbResp" aria-label="Atribuir a"' + (n ? '' : ' disabled') + '><option value="__">Atribuir a…</option><option value="">Sem responsável</option>' +
      approved().map(function (u) { return '<option value="u:' + u.id + '">' + esc(u.nome) + '</option>'; }).join('') +
      S.externos.filter(function (x) { return x.ativo; }).map(function (x) { return '<option value="x:' + x.id + '">' + esc(x.nome) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="btn" id="sbMove"' + (n ? '' : ' disabled') + '>Mover de fase…</button><button type="button" class="btn ghost" id="sbCancel">Cancelar</button>';
    $('#sbAll').onclick = function () { visibleIds().forEach(function (id) { SEL.ids[id] = 1; }); renderBoard(); renderSelBar(); };
    $('#sbCancel').onclick = function () { SEL.on = false; SEL.ids = {}; renderQuadro(); };
    $('#sbResp').onchange = function (e) { var v = e.target.value; if (v === '__') return; batchAssign(v); e.target.value = '__'; };
    $('#sbMove').onclick = batchMoveDialog;
  }
  function batchAssign(key) {
    var ids = Object.keys(SEL.ids).map(Number), prev = {};
    ids.forEach(function (id) { var k = respKey(byId(id)); (prev[k] = prev[k] || []).push(id); });
    var pl = respPayload(key);
    sb.from('processos').update(pl).in('id', ids).then(function (r) {
      if (r.error) return toast(errText(r.error));
      ids.forEach(function (id) { var p = byId(id); p.responsavel_id = pl.responsavel_id; p.responsavel_externo_id = pl.responsavel_externo_id; });
      SEL.ids = {}; renderStats(); renderBoard(); renderResps(); renderSelBar();
      toast(ids.length + ' ' + plural(ids.length, 'processo agora está', 'processos agora estão') + ' com ' + keyName(key) + '.', {
        label: 'Desfazer', fn: function () {
          Promise.all(Object.keys(prev).map(function (k) { return sb.from('processos').update(respPayload(k)).in('id', prev[k]); })).then(function () { toast('Atribuição desfeita.'); reloadProcs(); });
        }
      }, 20000);
    });
  }
  function batchMoveDialog() {
    var ids = Object.keys(SEL.ids).map(Number); if (!ids.length) return;
    var procs = ids.map(byId).filter(Boolean);
    var comEmail = procs.filter(function (p) { return !isProv(p); }).length;
    openGen('<h2>Mover ' + procs.length + ' ' + plural(procs.length, 'processo', 'processos') + '</h2><div class="muted">Todos vão para a mesma fase, com a mesma mensagem.</div>' +
      '<label for="bmFase">Nova fase</label><select id="bmFase">' + visFases().map(function (f) { return '<option value="' + f.id + '">' + esc(f.nome) + '</option>'; }).join('') + '</select>' +
      '<label for="bmMsg">Mensagem para os requerentes <span class="opt">(opcional)</span></label><textarea id="bmMsg" rows="3" maxlength="600"></textarea>' +
      '<label class="check"><input type="checkbox" id="bmMail"' + (comEmail ? ' checked' : '') + '> Enviar e-mail aos requerentes (' + comEmail + ' ' + plural(comEmail, 'processo tem', 'processos têm') + ' e-mail válido)</label>' +
      '<p class="hint">Quem estiver com dados provisórios (e-mail “pendente”) não recebe e-mail. O prazo do edital deve ser informado depois, em cada processo.</p>' +
      '<div class="err" id="bmErr" role="alert"></div><div class="m-f"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" id="bmOk">Mover</button></div>', function (d) {
        $('#bmOk').onclick = function () {
          var to = +$('#bmFase').value, msg = $('#bmMsg').value.trim().slice(0, 600) || null, mail = $('#bmMail').checked;
          var alvo = procs.filter(function (p) { return p.fase_id !== to; });
          if (!alvo.length) return ($('#bmErr').textContent = 'Todos já estão nessa fase.');
          $('#bmOk').disabled = true; $('#bmOk').textContent = 'Movendo…';
          var feitos = [], erros = 0;
          alvo.reduce(function (pr, p) {
            return pr.then(function () {
              return sb.rpc('mover_processo', { p_id: p.id, p_fase: to, p_mensagem: msg, p_prazo: null, p_email: mail, p_ord: null }).then(function (r) {
                if (r.error) erros++; else feitos.push({ hist: r.data.id, ord: p.ord });
              });
            });
          }, Promise.resolve()).then(function () {
            d.close(); SEL.ids = {};
            reloadProcs().then(function () { renderSelBar(); });
            toast(feitos.length + ' ' + plural(feitos.length, 'processo movido', 'processos movidos') + ' para “' + faseById(to).nome + '”.' + (erros ? ' ' + erros + ' com erro.' : ''), feitos.length ? {
              label: 'Desfazer', fn: function () { desfazerVarios(feitos); }
            } : null);
          });
        };
      });
  }
  function desfazerErro(e) {
    if (e && (e.code === 'PGRST202' || /Could not find the function/i.test(e.message || ''))) return 'O botão Desfazer ainda não foi ativado no banco de dados. Avise o administrador.';
    return errText(e);
  }
  function desfazerVarios(lista) {
    var ok = 0, falha = null;
    lista.reduce(function (pr, it) {
      return pr.then(function () {
        return sb.rpc('desfazer_movimento', { p_hist_id: it.hist, p_ord: it.ord }).then(function (r) { if (r.error) falha = r.error; else ok++; });
      });
    }, Promise.resolve()).then(function () {
      reloadProcs();
      toast(ok ? ok + ' ' + plural(ok, 'movimentação desfeita', 'movimentações desfeitas') + '.' + (falha ? ' Algumas não puderam ser desfeitas: ' + desfazerErro(falha) : '') : desfazerErro(falha));
    });
  }

  /* ---------- atribuir responsável (com ou sem conta) ---------- */
  function setResponsavel(p, key) {
    var prevKey = respKey(p);
    return sb.from('processos').update(respPayload(key)).eq('id', p.id).then(function (r) {
      if (r.error) { toast(errText(r.error)); return false; }
      var pl = respPayload(key); p.responsavel_id = pl.responsavel_id; p.responsavel_externo_id = pl.responsavel_externo_id;
      var antes = prevKey;
      toast(key ? 'Processo ' + p.protocolo + ' agora está com ' + keyName(key) + '.' : 'Processo ' + p.protocolo + ' ficou sem responsável.', antes === key ? null : {
        label: 'Desfazer', fn: function () { setResponsavel(p, antes).then(function () { var dd = $('#dDetail'); if (dd.open && +dd.dataset.id === p.id) fillDetail(p.id); }); }
      }, 15000);
      if ($('#stats')) { renderStats(); renderBoard(); renderResps(); }
      return true;
    });
  }
  function respOptions(sel) {
    return '<option value=""' + (sel ? '' : ' selected') + '>Sem responsável</option>' +
      '<optgroup label="Escreventes com acesso">' + approved().map(function (u) { return '<option value="u:' + u.id + '"' + (sel === 'u:' + u.id ? ' selected' : '') + '>' + esc(u.nome) + (u.id === S.me.id ? ' (você)' : '') + '</option>'; }).join('') + '</optgroup>' +
      (S.externos.some(function (x) { return x.ativo || sel === 'x:' + x.id; }) ? '<optgroup label="Sem conta no painel">' + S.externos.filter(function (x) { return x.ativo || sel === 'x:' + x.id; }).map(function (x) { return '<option value="x:' + x.id + '"' + (sel === 'x:' + x.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</optgroup>' : '') +
      '<option value="__novo">+ Adicionar pessoa sem conta…</option>';
  }
  function addExterno(done) {
    openGen('<h2>Adicionar pessoa sem conta</h2><div class="muted">Para quem trabalha nos processos mas não usa o painel (estagiário, escrevente de outro setor, etc.).</div>' +
      '<label for="exNome">Nome</label><input type="text" id="exNome" maxlength="120">' +
      '<label for="exMail">E-mail <span class="opt">(opcional, para receber o resumo diário)</span></label><input type="email" id="exMail" maxlength="200">' +
      '<div class="err" id="exErr" role="alert"></div><div class="m-f"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" id="exOk">Adicionar</button></div>', function (d) {
        $('#exNome').focus();
        $('#exOk').onclick = function () {
          var nome = $('#exNome').value.trim(), mail = $('#exMail').value.trim();
          if (nome.length < 2) return ($('#exErr').textContent = 'Informe o nome.');
          if (mail && !EMAIL_RE.test(mail)) return ($('#exErr').textContent = 'E-mail inválido.');
          $('#exOk').disabled = true;
          sb.from('pessoas_externas').insert({ nome: nome, email: mail || null }).select().single().then(function (r) {
            if (r.error) { $('#exOk').disabled = false; return ($('#exErr').textContent = errText(r.error)); }
            S.externos.push(r.data); S.externos.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
            d.close(); done('x:' + r.data.id);
          });
        };
      });
  }
  function openAssign(id) {
    var p = byId(id); if (!p) return;
    var cur = respKey(p);
    var row = function (k, nome) {
      return '<label class="opt-row"><input type="radio" name="asg" value="' + k + '"' + (k === cur ? ' checked' : '') + '>' + avatarKey(k) + '<span>' + esc(nome) + '</span></label>';
    };
    var opts = approved().map(function (u) { return row('u:' + u.id, u.nome + (u.id === S.me.id ? ' (você)' : '')); }).join('') +
      S.externos.filter(function (x) { return x.ativo || cur === 'x:' + x.id; }).map(function (x) { return row('x:' + x.id, x.nome + ' (sem conta)'); }).join('') + row('', 'Sem responsável');
    openGen('<h2>Com quem está o processo?</h2><div class="muted">' + esc(p.protocolo) + ' · ' + esc(p.requerente_nome) + '</div><div class="opt-list">' + opts + '</div>' +
      '<button type="button" class="linkbtn" id="asNovo">+ Adicionar pessoa sem conta no painel</button>' +
      '<p class="hint">Pode ser qualquer pessoa, não só quem está logado. Quem não tem conta aparece com avatar cinza.</p>' +
      '<div class="m-f"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" id="asOk">Salvar</button></div>', function (d) {
        $('#asNovo').onclick = function () { addExterno(function (k) { setResponsavel(p, k).then(function () { var dd = $('#dDetail'); if (dd.open && +dd.dataset.id === p.id) fillDetail(p.id); }); }); };
        $('#asOk').onclick = function () {
          var v = d.querySelector('input[name=asg]:checked'); var k = v ? v.value : '';
          if (k === cur) { d.close(); return; }
          $('#asOk').disabled = true;
          setResponsavel(p, k).then(function (ok) { if (ok) { d.close(); var dd = $('#dDetail'); if (dd.open && +dd.dataset.id === p.id) fillDetail(p.id); } else $('#asOk').disabled = false; });
        };
      });
  }
  // select com opção "+ Adicionar pessoa": chama onPick(key) ao escolher/criar
  function bindRespSelect(sel, current, onPick) {
    sel.onchange = function () {
      if (sel.value === '__novo') {
        sel.value = current;
        addExterno(function (k) { onPick(k); });
      } else onPick(sel.value);
    };
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

  function mailGeneric(p, rotulo, titulo, msg, enviar) {
    if (!enviar) return '<p class="muted small" style="margin:6px 0 0">Nenhum e-mail será enviado; o texto só aparece na linha do tempo da consulta.</p>';
    return '<div class="mail"><div class="mail-meta"><div><b>De:</b> Registro de Imóveis de Itararé</div><div><b>Para:</b> ' + esc(destinatariosTxt(p)) + '</div><div><b>Assunto:</b> Usucapião ' + esc(p.protocolo) + ': ' + esc(titulo.toLowerCase()) + '</div></div>' +
      '<div class="mail-body"><p>Olá! O andamento do seu pedido de usucapião extrajudicial foi atualizado.</p><p class="mail-stage"><span>' + esc(rotulo) + '</span><strong>' + esc(titulo) + '</strong><em>' + fmtDate(new Date()) + '</em></p>' +
      (msg ? '<blockquote>' + esc(msg) + '</blockquote>' : '<p class="muted small">(escreva o texto acima para ver aqui)</p>') +
      '<p><span class="btn primary sm" style="display:inline-block">Acompanhar meu pedido</span></p></div></div>';
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
    var mail = $('#mvEmail').checked, ordAntes = p.ord;
    btn.disabled = true;
    sb.rpc('mover_processo', { p_id: pm.id, p_fase: to, p_mensagem: msg || null, p_prazo: prazo, p_email: mail, p_ord: pm.ord }).then(function (r) {
      btn.disabled = false;
      if (r.error) { $('#mvErr').textContent = errText(r.error); return; }
      pending = null; $('#dMove').close();
      var hid = r.data && r.data.id;
      toast('Processo ' + p.protocolo + ' movido para “' + faseById(to).nome + '”.' + (mail ? ' O e-mail sai em cerca de 1 minuto.' : ''), hid ? {
        label: 'Desfazer', fn: function () { desfazerVarios([{ hist: hid, ord: ordAntes }]); }
      } : null, 40000);
      reloadProcs();
    });
  }

  /* ---------- detalhe ---------- */
  var FIELD = { protocolo: 'Protocolo', requerente_nome: 'Requerente', requerente_email: 'E-mail', emails_extra: 'E-mails adicionais', imovel: 'Imóvel', matricula: 'Matrícula', tipo_usucapiao: 'Tipo', data_prenotacao: 'Data de prenotação', referencia: 'Referência', advogado_id: 'Advogado', responsavel_id: 'Responsável', responsavel_externo_id: 'Responsável (sem conta)', valor: 'Valor' };
  function fmtVal(c, v) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
    if (c === 'responsavel_id') return userName(v);
    if (c === 'responsavel_externo_id') { var xx = extById(v); return xx ? xx.nome : '#' + v; }
    if (c === 'advogado_id') { var a = advById(v); return a ? a.nome : '#' + v; }
    if (c === 'data_prenotacao') return fmtYMD(v);
    if (c === 'valor') return brl(v);
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

  function prazosHTML(all) {
    var abertos = all.filter(function (z) { return z.situacao === 'aberto'; }), fechados = all.filter(function (z) { return z.situacao !== 'aberto'; });
    var linha = function (z, acoes) {
      var d = daysLeft(z.vence_em), cls = z.situacao !== 'aberto' ? '' : d < 0 ? 'bad' : d <= 15 ? 'warn' : 'gold';
      return '<li class="pz-row"><div><b>' + TIPO_PRAZO[z.tipo] + '</b>' + (z.descricao ? ' · ' + esc(z.descricao) : '') + '<div class="muted small">Vence em ' + fmtYMD(z.vence_em) +
        (z.situacao === 'aberto' ? ' · <span class="chip ' + cls + '">' + (d < 0 ? 'vencido há ' + (-d) + ' ' + plural(-d, 'dia', 'dias') : d === 0 ? 'vence hoje' : 'faltam ' + d + ' ' + plural(d, 'dia', 'dias')) + '</span>' : ' · ' + (z.situacao === 'cumprido' ? 'cumprido' : 'cancelado')) + '</div></div>' + (acoes || '') + '</li>';
    };
    return (abertos.length ? '<ul class="pz-list">' + abertos.map(function (z) {
        return linha(z, '<div class="pz-acts"><button type="button" class="btn sm" data-pz="' + z.id + '" data-sit="cumprido">Cumprido</button><button type="button" class="btn sm ghost" data-pz="' + z.id + '" data-sit="cancelado">Cancelar</button></div>');
      }).join('') + '</ul>' : '<p class="muted small" style="margin:0">Nenhum prazo em aberto.</p>') +
      (fechados.length ? '<details class="prev"><summary>Prazos encerrados (' + fechados.length + ')</summary><ul class="pz-list">' + fechados.map(function (z) { return linha(z); }).join('') + '</ul></details>' : '');
  }
  function prazoForm() {
    return '<div class="pz-form"><div class="grid2"><div><label for="pzTipo">Novo prazo</label><select id="pzTipo"><option value="intimacao">Intimação</option><option value="edital">Edital</option><option value="exigencia">Exigência</option><option value="outro">Outro</option></select></div>' +
      '<div><label for="pzData">Vence em</label><input type="date" id="pzData"></div></div>' +
      '<label for="pzDesc">Descrição <span class="opt">(opcional, ex.: Confrontante Silva)</span></label><input type="text" id="pzDesc" maxlength="120">' +
      '<label class="check"><input type="checkbox" id="pzMail" checked> Avisar o requerente por e-mail</label>' +
      '<details class="prev"><summary>Ver prévia do e-mail</summary><div id="pzPrev"></div></details>' +
      '<p class="hint">O cliente vê o tipo, a descrição e a data na consulta. Não escreva dados pessoais de terceiros.</p>' +
      '<div class="err" id="pzErr" role="alert"></div><button type="button" class="btn sm primary" id="pzAdd">Adicionar prazo</button></div>';
  }

  function fillDetail(id) {
    var p = byId(id); if (!p) { $('#dDetail').close(); return; }
    var d = $('#dDetail'); d.dataset.id = id; delete d.dataset.dirty;
    Promise.all([
      sb.from('historico').select('*').eq('processo_id', id).order('em', { ascending: false }),
      sb.from('auditoria').select('*').eq('processo_id', id).order('em', { ascending: false }).limit(50),
      sb.from('prazos').select('*').eq('processo_id', id).order('vence_em')
    ]).then(function (rs) {
      if (!d.open || +d.dataset.id !== id) return;
      var hist = rs[0].data || [], aud = rs[1].data || [], pzAll = rs[2].data || [], pa = byId(id) || p;
      var fasesOpt = S.fases.filter(function (f) { return !f.oculta || f.id === pa.fase_id; });
      d.innerHTML = '<div class="sh"><div class="sh-h"><div><h2>' + esc(pa.protocolo) + '</h2><div class="muted">' + esc(pa.requerente_nome) + '</div></div><button type="button" class="x" id="dtClose" aria-label="Fechar">' + ICON.x + '</button></div><div class="sh-b">' +
        '<h3>Andamento</h3><label for="dtFase">Fase atual</label><select id="dtFase">' + fasesOpt.map(function (f) { return '<option value="' + f.id + '"' + (f.id === pa.fase_id ? ' selected' : '') + '>' + esc(f.nome) + '</option>'; }).join('') + '</select>' +
        '<p class="hint">Ao escolher outra fase, o sistema pede a mensagem ao requerente antes de confirmar.</p>' +
        '<label for="dtResp">Com quem está o processo</label><select id="dtResp">' + respOptions(respKey(pa)) + '</select>' +
        '<p class="hint">Pode ser qualquer pessoa, mesmo sem conta no painel.</p>' +
        '<h3>Observação no andamento</h3><label for="dtObs">Aparece na linha do tempo do cliente</label><textarea id="dtObs" rows="2" maxlength="600" placeholder="Ex.: Edital publicado, prazo até 20/12."></textarea>' +
        '<label class="check"><input type="checkbox" id="dtObsMail"> Avisar o requerente por e-mail</label><details class="prev" id="obPrevBox"><summary>Ver prévia do e-mail</summary><div id="obPrev"></div></details><div class="err" id="dtObsErr" role="alert"></div><button type="button" class="btn sm" id="dtObsBtn">Registrar no andamento</button>' +
        '<h3>Prazos</h3>' + prazosHTML(pzAll) + prazoForm() +
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
        '<label for="edVal">Valor <span class="opt">(R$, valor do ato ou base de cálculo; uso interno, não aparece na consulta pública)</span></label><input type="text" id="edVal" inputmode="decimal" maxlength="20" placeholder="0,00" value="' + (pa.valor != null ? esc(Number(pa.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '') + '">' +
        '<label for="edTipo">Tipo de usucapião</label><input type="text" id="edTipo" maxlength="60" list="dlTipos" value="' + esc(pa.tipo_usucapiao || '') + '"><datalist id="dlTipos">' + TIPOS.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
        '<label for="edAdv">Advogado / representante</label>' + advSelect('edAdv', pa.advogado_id) +
        '<div class="err" id="edErr" role="alert"></div><button type="submit" class="btn primary" id="edSave">Salvar dados</button></form>' +
        '<h3>Notas internas</h3><label for="dtNotes">Só a equipe vê estas notas</label><textarea id="dtNotes" rows="3" maxlength="5000" placeholder="Anotações do processo">' + esc(pa.notas_internas) + '</textarea><div class="saved" id="dtSaved"></div>' +
        '<p><a class="btn sm" style="display:inline-block;text-decoration:none" href="/?p=' + encodeURIComponent(pa.protocolo) + '" target="_blank" rel="noopener">Ver como o requerente vê</a></p>' +
        '<h3>Histórico do andamento</h3><p class="hint">O que o requerente vê. Não pode ser editado; se algo estiver errado, registre uma nova movimentação.</p><ul class="hist">' + hist.map(function (h) {
          return '<li><b>' + (h.tipo === 'prazo' ? 'Prazo' : h.tipo === 'nota' ? 'Observação' : esc(faseById(h.fase_id).nome)) + '</b><time>' + fmtDT(h.em) + ' · ' + esc(userName(h.por)) + (h.email_solicitado ? ' · e-mail pedido' : '') + '</time>' +
            (h.mensagem ? '<p>' + esc(h.mensagem) + '</p>' : '') + (h.prazo_edital && h.tipo === 'fase' ? '<p>Prazo do edital: ' + fmtYMD(h.prazo_edital) + '</p>' : '') + '</li>';
        }).join('') + '</ul>' +
        '<h3>Alterações nos dados</h3>' + auditHTML(aud) +
        (isOficial() ? '<h3>Zona de perigo</h3><p class="hint">Apagar remove o processo, o histórico do andamento e os e-mails ligados a ele. Não dá para desfazer.</p><button type="button" class="btn danger" id="dtDel">Apagar este processo</button>' : '') +
        '</div></div>';

      $('#dtClose').onclick = function () { d.close(); };
      var obUpd = function () { $('#obPrev').innerHTML = mailGeneric(pa, 'Observação', 'Observação do cartório', $('#dtObs').value.trim(), $('#dtObsMail').checked); };
      $('#dtObs').addEventListener('input', obUpd); $('#dtObsMail').addEventListener('change', obUpd); obUpd();
      if ($('#pzTipo')) {
        var pzUpd = function () {
          var v = $('#pzData').value, ds = $('#pzDesc').value.trim(), tp = TIPO_PRAZO[$('#pzTipo').value];
          $('#pzPrev').innerHTML = mailGeneric(pa, 'Atualização', 'Prazo atualizado', tp + ': ' + (ds ? ds + '. ' : '') + 'Vence em ' + (v ? fmtYMD(v) : '__/__/____') + '.', $('#pzMail').checked);
        };
        ['pzTipo', 'pzData', 'pzDesc', 'pzMail'].forEach(function (id) { $('#' + id).addEventListener('input', pzUpd); $('#' + id).addEventListener('change', pzUpd); }); pzUpd();
      }
      d.oninput = function () { d.dataset.dirty = '1'; };
      $('#dtFase').onchange = function (e) { var to = +e.target.value; e.target.value = pa.fase_id; openMove(pa.id, to, null); };
      bindRespSelect($('#dtResp'), respKey(pa), function (k) { setResponsavel(pa, k).then(function () { delete d.dataset.dirty; fillDetail(pa.id); }); });
      $('#dtObsBtn').onclick = function () {
        var t = $('#dtObs').value.trim(), mail = $('#dtObsMail').checked;
        if (t.length < 2) return ($('#dtObsErr').textContent = 'Escreva a observação.');
        this.disabled = true;
        sb.rpc('anotar_andamento', { p_id: pa.id, p_texto: t, p_email: mail }).then(function (r) {
          if (r.error) { $('#dtObsBtn').disabled = false; return ($('#dtObsErr').textContent = errText(r.error)); }
          toast('Observação registrada no andamento.' + (mail ? ' E-mails na fila de envio.' : '')); fillDetail(pa.id);
        });
      };
      var pAdd = $('#pzAdd');
      if (pAdd) pAdd.onclick = function () {
        var desc = $('#pzDesc').value.trim(), venc = $('#pzData').value;
        if (!venc) return ($('#pzErr').textContent = 'Informe a data de vencimento.');
        this.disabled = true;
        sb.rpc('adicionar_prazo', { p_id: pa.id, p_tipo: $('#pzTipo').value, p_descricao: desc || null, p_vence: venc, p_email: $('#pzMail').checked }).then(function (r) {
          if (r.error) { $('#pzAdd').disabled = false; return ($('#pzErr').textContent = errText(r.error)); }
          toast('Prazo registrado até ' + fmtYMD(venc) + '.'); reloadProcs().then(function () { fillDetail(pa.id); });
        });
      };
      d.querySelectorAll('[data-pz]').forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          sb.rpc('concluir_prazo', { p_prazo_id: +b.dataset.pz, p_situacao: b.dataset.sit, p_email: false }).then(function (r) {
            if (r.error) { b.disabled = false; return toast(errText(r.error)); }
            toast(b.dataset.sit === 'cumprido' ? 'Prazo marcado como cumprido.' : 'Prazo cancelado.'); reloadProcs().then(function () { fillDetail(pa.id); });
          });
        };
      });
      $('#dtNotes').onchange = function (e) {
        sb.from('processos').update({ notas_internas: e.target.value }).eq('id', pa.id).then(function (r) {
          if (r.error) return toast(errText(r.error)); pa.notas_internas = e.target.value; $('#dtSaved').textContent = 'Nota salva.';
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
    var valor = parseBrl($('#edVal').value);
    if (valor !== null && isNaN(valor)) return (err.textContent = 'Valor inválido. Use o formato 1.234,56.');
    var campos = {
      valor: valor, protocolo: proto, requerente_nome: nome, requerente_email: mail, emails_extra: extras, imovel: imo,
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
      '<label for="nwResp">Com quem está o processo</label><select id="nwResp">' + respOptions('u:' + S.me.id) + '</select>' +
      '<p class="hint">Escolha com quem o caso vai ficar, mesmo que não seja você ou que a pessoa não tenha conta.</p>' +
      '<div class="err" id="nwErr" role="alert"></div><div class="m-f"><button type="button" class="btn ghost" id="nwCancel">Cancelar</button><button type="button" class="btn primary" id="nwOk">Criar processo</button></div></div>';
    $('#nwCancel').onclick = function () { d.close(); };
    var nwBind = function (cur) {
      bindRespSelect($('#nwResp'), cur, function (k) {
        if (!$('#nwResp').querySelector('option[value="' + k + '"]')) $('#nwResp').innerHTML = respOptions(k);
        $('#nwResp').value = k; nwBind(k);
      });
    };
    nwBind('u:' + S.me.id);
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
      var rk = $('#nwResp').value, rp = respPayload(rk === '__novo' ? '' : rk);
      sb.rpc('novo_processo', {
        p_protocolo: proto, p_nome: nome, p_email: mail, p_imovel: imo, p_responsavel: rp.responsavel_id,
        p_emails_extra: extras, p_matricula: $('#nwMat').value.trim() || null, p_tipo: $('#nwTipo').value.trim() || null,
        p_prenotacao: $('#nwPren').value || null, p_referencia: $('#nwRef').value.trim() || null, p_advogado: $('#nwAdv').value ? +$('#nwAdv').value : null
      }).then(function (r) {
        btn.disabled = false;
        if (r.error) { err.textContent = errText(r.error); return; }
        var fin = function () { d.close(); toast('Processo ' + proto + ' criado. E-mail de confirmação na fila de envio.'); reloadProcs(); };
        if (rp.responsavel_externo_id && r.data) sb.from('processos').update({ responsavel_externo_id: rp.responsavel_externo_id }).eq('id', r.data.id).then(fin); else fin();
      });
    };
    d.showModal(); setTimeout(function () { $('#nwProto').focus(); }, 30);
  }

  /* ---------- busca global, atalhos e ajuda ---------- */
  function anyDialogOpen() { return Array.prototype.some.call(document.querySelectorAll('dialog'), function (d) { return d.open; }); }
  function openGlobalSearch() {
    if (!S.me) return;
    var d = $('#dGen');
    var render = function (q) {
      var toks = norm(q) ? String(q).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean) : [];
      var list = !toks.length ? S.procs.slice().sort(function (a, b) { return new Date(b.atualizado_em || 0) - new Date(a.atualizado_em || 0); }).slice(0, 8) :
        S.procs.filter(function (p) {
          var txt = (searchText(p) + ' ' + respName(p) + ' ' + faseById(p.fase_id).nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          return toks.every(function (t) { return txt.indexOf(t) >= 0; });
        }).slice(0, 30);
      $('#gsList').innerHTML = list.length ? list.map(function (p, i) {
        return '<li><button type="button" class="gs-item' + (i === 0 ? ' on' : '') + '" data-id="' + p.id + '"><b>' + esc(p.protocolo) + '</b><span class="gs-n">' + esc(p.requerente_nome) + (p.referencia ? ' · ' + esc(p.referencia) : '') + '</span><span class="gs-m">' + esc(faseById(p.fase_id).nome) + ' · ' + esc(respName(p)) + '</span></button></li>';
      }).join('') : '<li class="muted small" style="padding:10px">Nada encontrado.</li>';
      d.querySelectorAll('.gs-item').forEach(function (b) { b.onclick = function () { d.close(); openDetail(+b.dataset.id); }; });
    };
    openGen('<h2>Buscar processo</h2><input type="search" id="gsQ" placeholder="Protocolo, nome, matrícula, advogado, escrevente…" aria-label="Buscar em todos os processos" autocomplete="off"><ul class="gs-list" id="gsList"></ul><p class="hint">Setas ↑ ↓ para escolher, Enter para abrir, Esc para fechar.</p>', function () {
      render('');
      var q = $('#gsQ');
      q.oninput = function () { render(q.value); };
      q.onkeydown = function (e) {
        var items = Array.prototype.slice.call(d.querySelectorAll('.gs-item')); if (!items.length) return;
        var cur = items.findIndex(function (x) { return x.classList.contains('on'); });
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); var n = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items.forEach(function (x, i) { x.classList.toggle('on', i === n); }); items[n].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') { e.preventDefault(); if (items[cur]) items[cur].click(); }
      };
      setTimeout(function () { q.focus(); }, 20);
    });
  }
  var SHORTCUTS = [['/ ou Ctrl+K', 'Buscar em todos os processos'], ['N', 'Novo processo'], ['M', 'Só os meus processos (Quadro)'], ['P', 'Ir para Prazos'], ['Q', 'Ir para o Quadro'], ['?', 'Mostrar esta ajuda']];
  function openHelp() {
    openGen('<h2>Ajuda rápida</h2><table class="tbl keys"><tbody>' + SHORTCUTS.map(function (k) { return '<tr><td><kbd>' + esc(k[0]) + '</kbd></td><td>' + esc(k[1]) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="hint">Os atalhos não funcionam enquanto você digita em um campo.</p><div class="m-f"><button type="button" class="btn" id="hpTour">Rever o tour</button><button type="button" class="btn primary" data-close>Fechar</button></div>', function (d) {
        $('#hpTour').onclick = function () { d.close(); openTour(); };
      });
  }
  document.addEventListener('keydown', function (e) {
    if (!S.me || !S.me.aprovado || !$('#body')) return;
    var t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (!($('#dGen').open && $('#gsQ'))) { if ($('#dDetail').open) $('#dDetail').close(); openGlobalSearch(); } return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || anyDialogOpen()) return;
    var k = e.key;
    if (k === '/') { e.preventDefault(); openGlobalSearch(); }
    else if (k === '?') { e.preventDefault(); openHelp(); }
    else if (k === 'n' || k === 'N') { e.preventDefault(); if (S.view !== 'quadro') { S.view = 'quadro'; renderApp(); } openNew(); }
    else if (k === 'm' || k === 'M') { S.view = 'quadro'; F.mine = true; renderApp(); }
    else if (k === 'p' || k === 'P') { S.view = 'prazos'; renderApp(); }
    else if (k === 'q' || k === 'Q') { S.view = 'quadro'; renderApp(); }
  });

  /* ---------- tour do primeiro acesso ---------- */
  var TOUR = [
    ['Bem-vindo ao Visualizador de Usucapiões', 'Aqui você acompanha todos os processos do cartório. O requerente consulta só o andamento, digitando o número do protocolo. Este tour leva menos de um minuto.'],
    ['O quadro', 'Cada coluna é uma fase. Arraste um cartão para a fase seguinte (ou abra o cartão e escolha a fase). Ao mover, você escreve a mensagem para o requerente e pode conferir a prévia do e-mail.'],
    ['Errou? Desfaça', 'Depois de mover um processo aparece o botão “Desfazer” por alguns segundos. Os e-mails só saem cerca de 1 minuto depois, para dar tempo de corrigir.'],
    ['Com quem está o processo', 'Clique no nome no pé do cartão para passar o caso a outro escrevente, mesmo quem não tem conta no painel. Em “Selecionar vários” você muda de responsável ou de fase vários cartões de uma vez.'],
    ['Prazos e observações', 'Dentro do cartão você registra prazos (intimação, edital, exigência) e observações que o requerente vê na linha do tempo. Os cartões ficam amarelos ou vermelhos quando algo está parado ou vencendo.'],
    ['Buscar e atalhos', 'Aperte / (ou Ctrl+K) em qualquer tela para buscar um processo. Use os filtros rápidos acima do quadro e salve os que você mais usa. Aperte ? para ver todos os atalhos.']
  ];
  function openTour() {
    var i = 0;
    var draw = function () {
      var st = TOUR[i];
      openGen('<div class="tour-n">' + (i + 1) + ' de ' + TOUR.length + '</div><h2>' + esc(st[0]) + '</h2><p class="tour-t">' + esc(st[1]) + '</p><div class="tour-dots" aria-hidden="true">' + TOUR.map(function (_, j) { return '<i class="' + (j === i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="m-f"><button type="button" class="btn ghost" id="trSkip">Pular</button>' + (i ? '<button type="button" class="btn" id="trBack">Voltar</button>' : '') + '<button type="button" class="btn primary" id="trNext">' + (i === TOUR.length - 1 ? 'Concluir' : 'Próximo') + '</button></div>', function (d) {
          var fim = function () { lsSet('central_tour_v1_' + S.me.id, 1); d.close(); };
          $('#trSkip').onclick = fim;
          if ($('#trBack')) $('#trBack').onclick = function () { i--; draw(); };
          $('#trNext').onclick = function () { if (i === TOUR.length - 1) fim(); else { i++; draw(); } };
          $('#trNext').focus();
        });
    };
    draw();
  }
  function maybeTour() { if (S.me && !lsGet('central_tour_v1_' + S.me.id, 0)) setTimeout(function () { if (!anyDialogOpen()) openTour(); }, 600); }

  /* ---------- importar planilha ---------- */
  var IMP_COLS = [['protocolo', 'Protocolo'], ['requerente', 'Requerente'], ['email', 'E-mail'], ['outros_emails', 'Outros e-mails'], ['imovel', 'Imóvel'], ['referencia', 'Referência'], ['matricula', 'Matrícula'], ['tipo', 'Tipo de usucapião'], ['prenotacao', 'Data da prenotação'], ['advogado', 'Advogado'], ['escrevente', 'Escrevente responsável'], ['fase', 'Fase']];
  var IMP_ALIAS = { protocolo: ['protocolo', 'prot', 'numero', 'n'], requerente: ['requerente', 'nome', 'cliente', 'interessado'], email: ['email', 'e-mail', 'mail'], outros_emails: ['outrosemails', 'emailsadicionais', 'outroemail', 'emailsextras', 'emails'],
    imovel: ['imovel', 'endereco', 'descricao'], referencia: ['referencia', 'ref', 'apelido'], matricula: ['matricula', 'mat'], tipo: ['tipo', 'tipodeusucapiao', 'tipousucapiao', 'modalidade'], prenotacao: ['datadaprenotacao', 'datadeprenotacao', 'dataprenotacao', 'prenotacao', 'dataprotocolo', 'data'],
    advogado: ['advogado', 'representante'], escrevente: ['escrevente', 'responsavel', 'escreventeresponsavel', 'comquem'], fase: ['fase', 'etapa', 'situacao', 'status'] };
  var norm = function (t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); };

  function parseTable(txt) {
    txt = String(txt || '').replace(/^﻿/, '');
    var first = txt.split(/\r?\n/)[0] || '';
    var delim = (first.match(/\t/g) || []).length ? '\t' : (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < txt.length; i++) {
      var c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row); row = []; }
      else cell += c;
    }
    row.push(cell); if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
    return rows;
  }
  function parseDateAny(v) {
    v = String(v || '').trim(); if (!v) return null;
    var m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + pad(+m[2]) + '-' + pad(+m[1]); }
    m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? v : undefined;
  }
  function buildImport(rows) {
    if (rows.length < 2) return { erro: 'A planilha precisa ter uma linha de títulos e pelo menos um processo.' };
    var head = rows[0].map(norm), col = {};
    Object.keys(IMP_ALIAS).forEach(function (k) {
      var i = head.findIndex(function (h) { return IMP_ALIAS[k].indexOf(h) >= 0; });
      if (i >= 0) col[k] = i;
    });
    if (col.protocolo == null) return { erro: 'Não achei a coluna “Protocolo” na primeira linha. Use o modelo para conferir os títulos.' };
    var existentes = {}; S.procs.forEach(function (p) { existentes[p.protocolo] = 1; });
    var vistos = {}, itens = [];
    rows.slice(1).forEach(function (r, ix) {
      var g = function (k) { return col[k] == null ? '' : String(r[col[k]] == null ? '' : r[col[k]]).trim(); };
      var proto = g('protocolo').replace(/[.\s]/g, ''), it = { linha: ix + 2, proto: proto, avisos: [], erro: '' };
      if (!/^[0-9]{1,12}$/.test(proto)) it.erro = 'Protocolo inválido';
      else if (existentes[proto]) it.erro = 'Já existe no quadro';
      else if (vistos[proto]) it.erro = 'Repetido na planilha';
      vistos[proto] = 1;
      var mail = g('email'), nome = g('requerente');
      if (nome.length < 2) { nome = 'A preencher (protocolo ' + proto + ')'; it.avisos.push('sem nome'); }
      if (!EMAIL_RE.test(mail)) { if (mail) it.avisos.push('e-mail inválido'); else it.avisos.push('sem e-mail'); mail = 'sem-email-' + proto + '@pendente.invalid'; }
      var extras = parseEmails(g('outros_emails').replace(/\|/g, ',')).filter(function (e) { return EMAIL_RE.test(e); }).slice(0, 5);
      var pr = parseDateAny(g('prenotacao')); if (pr === undefined) { it.avisos.push('data inválida'); pr = null; }
      var fase = 1, fv = g('fase');
      if (fv) {
        var fn = norm(fv), f = S.fases.find(function (x) { return String(x.id) === fv || norm(x.nome) === fn || norm(x.nome).indexOf(fn) === 0 || fn.indexOf(norm(x.nome)) === 0; });
        if (f && !f.oculta) fase = f.id; else it.avisos.push('fase “' + fv + '” não reconhecida (vai para a fase 1)');
      }
      var resp = null, ev = g('escrevente');
      if (ev) {
        var en = norm(ev), u = approved().find(function (x) { return norm(x.nome) === en || norm(x.nome).indexOf(en) === 0; });
        var x = u ? null : S.externos.find(function (y) { return norm(y.nome) === en || norm(y.nome).indexOf(en) === 0; });
        resp = u ? 'u:' + u.id : x ? 'x:' + x.id : null;
        if (!resp) it.novoResp = ev;
      }
      var adv = null, av = g('advogado');
      if (av) { var an = norm(av), a = S.advs.find(function (y) { return norm(y.nome) === an; }); if (a) adv = a.id; else it.avisos.push('advogado “' + av + '” não cadastrado'); }
      it.dados = { nome: nome, email: mail, extras: extras, imovel: g('imovel'), ref: g('referencia'), mat: g('matricula'), tipo: g('tipo'), pren: pr, fase: fase, resp: resp, adv: adv };
      itens.push(it);
    });
    return { itens: itens };
  }
  function modeloCsv() {
    var ex = ['52474', 'Maria da Silva', 'maria@exemplo.com', '', 'Rua das Flores, lote 5', 'Chácara Santa Luzia', '12345', 'Extraordinária', '10/09/2026', '', 'Luana', 'Protocolo / Prenotação'];
    var blob = new Blob(['﻿' + IMP_COLS.map(function (c) { return c[1]; }).join(';') + '\r\n' + ex.join(';') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'modelo-importacao.csv'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function openImport() {
    openGen('<h2>Importar planilha</h2><div class="muted">Traga vários processos de uma vez. Só o <b>Protocolo</b> é obrigatório; o que faltar fica como “dados a preencher”.</div>' +
      '<div class="row2 wrap" style="margin-top:8px"><input type="file" id="imFile" accept=".csv,.txt,.tsv,text/csv" aria-label="Arquivo CSV"><button type="button" class="linkbtn" id="imModelo">Baixar modelo</button></div>' +
      '<p class="hint">Excel: use Arquivo → Salvar como → CSV. Ou copie as células no Excel e cole abaixo.</p>' +
      '<textarea id="imTxt" rows="5" placeholder="Cole aqui (a primeira linha deve ter os títulos das colunas)"></textarea>' +
      '<div class="err" id="imErr" role="alert"></div><div id="imPrev"></div>' +
      '<div class="m-f"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn" id="imAnalisar">Conferir</button><button type="button" class="btn primary" id="imOk" disabled>Importar</button></div>', function (d) {
        var plan = null;
        $('#imModelo').onclick = modeloCsv;
        $('#imFile').onchange = function (e) {
          var f = e.target.files[0]; if (!f) return;
          var rd = new FileReader(); rd.onload = function () { $('#imTxt').value = rd.result; analisar(); }; rd.readAsText(f, 'utf-8');
        };
        $('#imAnalisar').onclick = analisar;
        function analisar() {
          $('#imErr').textContent = ''; $('#imPrev').innerHTML = ''; $('#imOk').disabled = true; plan = null;
          var txt = $('#imTxt').value; if (!txt.trim()) return ($('#imErr').textContent = 'Escolha um arquivo ou cole os dados.');
          var b = buildImport(parseTable(txt));
          if (b.erro) return ($('#imErr').textContent = b.erro);
          if (b.itens.length > 300) return ($('#imErr').textContent = 'Máximo de 300 processos por vez.');
          plan = b;
          var ok = b.itens.filter(function (i) { return !i.erro; }), ruins = b.itens.length - ok.length;
          var novos = Array.from(new Set(ok.filter(function (i) { return i.novoResp; }).map(function (i) { return i.novoResp; })));
          $('#imPrev').innerHTML = '<div class="msg info" style="margin:8px 0">' + ok.length + ' ' + plural(ok.length, 'processo será importado', 'processos serão importados') + (ruins ? ' · ' + ruins + ' ' + plural(ruins, 'linha será ignorada', 'linhas serão ignoradas') : '') + '</div>' +
            '<div class="tblwrap" style="max-height:220px;overflow:auto"><table class="tbl"><thead><tr><th>Protocolo</th><th>Requerente</th><th>Fase</th><th>Observações</th></tr></thead><tbody>' + b.itens.slice(0, 60).map(function (i) {
              return '<tr class="' + (i.erro ? 'imp-bad' : '') + '"><td>' + esc(i.proto || '—') + '</td><td>' + esc(i.dados.nome) + '</td><td>' + esc(faseById(i.dados.fase).nome) + '</td><td class="small">' + (i.erro ? '<b>' + esc(i.erro) + '</b>' : esc(i.avisos.join('; '))) + '</td></tr>';
            }).join('') + '</tbody></table></div>' + (b.itens.length > 60 ? '<p class="hint">Mostrando as 60 primeiras linhas.</p>' : '') +
            (novos.length ? '<p class="hint">Escreventes não encontrados serão cadastrados como “pessoa sem conta”: <b>' + esc(novos.join(', ')) + '</b>.</p>' : '') +
            '<label class="check"><input type="checkbox" id="imMail"> Enviar e-mail de aviso aos requerentes que tiverem e-mail válido</label><p class="hint">Deixe desmarcado se os requerentes já estão em andamento e não precisam de novo aviso.</p>';
          $('#imOk').disabled = !ok.length;
        }
        $('#imOk').onclick = function () {
          if (!plan) return;
          var ok = plan.itens.filter(function (i) { return !i.erro; }), avisar = $('#imMail') && $('#imMail').checked;
          $('#imOk').disabled = true; $('#imAnalisar').disabled = true;
          var nomes = Array.from(new Set(ok.filter(function (i) { return i.novoResp; }).map(function (i) { return i.novoResp; })));
          var mapaNovos = {};
          var criar = nomes.reduce(function (pr, n) {
            return pr.then(function () {
              return sb.from('pessoas_externas').insert({ nome: n }).select().single().then(function (r) { if (!r.error) { S.externos.push(r.data); mapaNovos[n] = 'x:' + r.data.id; } });
            });
          }, Promise.resolve());
          var feitos = 0, falhas = [];
          criar.then(function () {
            return ok.reduce(function (pr, it, idx) {
              return pr.then(function () {
                $('#imOk').textContent = 'Importando ' + (idx + 1) + ' de ' + ok.length + '…';
                var k = it.dados.resp || mapaNovos[it.novoResp] || null, pl = respPayload(k), dd = it.dados;
                return sb.rpc('importar_processo', {
                  p_protocolo: it.proto, p_nome: dd.nome, p_email: dd.email, p_imovel: dd.imovel, p_fase: dd.fase,
                  p_responsavel: pl.responsavel_id, p_responsavel_externo: pl.responsavel_externo_id, p_emails_extra: dd.extras,
                  p_matricula: dd.mat || null, p_tipo: dd.tipo || null, p_prenotacao: dd.pren, p_referencia: dd.ref || null, p_advogado: dd.adv, p_avisar: !!avisar
                }).then(function (r) { if (r.error) falhas.push(it.proto + ': ' + errText(r.error)); else feitos++; });
              });
            }, Promise.resolve());
          }).then(function () {
            d.close(); reloadProcs().then(function () { if ($('#resps')) renderResps(); });
            toast(feitos + ' ' + plural(feitos, 'processo importado', 'processos importados') + (falhas.length ? '. Com erro: ' + falhas.slice(0, 3).join(' | ') : '.'), null, 9000);
          });
        };
      });
  }

  /* ---------- aba Prazos ---------- */
  var PF = { resp: 'all', tipo: '' };
  function renderPrazos() {
    var lista = S.prazos.filter(function (z) {
      var p = byId(z.processo_id); if (!p) return false;
      if (PF.tipo && z.tipo !== PF.tipo) return false;
      if (PF.resp === 'none') return !respKey(p);
      if (PF.resp !== 'all') return respKey(p) === PF.resp;
      return true;
    }).sort(function (a, b) { return a.vence_em < b.vence_em ? -1 : a.vence_em > b.vence_em ? 1 : 0; });
    var vencidos = lista.filter(function (z) { return daysLeft(z.vence_em) < 0; }).length;
    var semana = lista.filter(function (z) { var d = daysLeft(z.vence_em); return d >= 0 && d <= 7; }).length;
    var respOpts = '<option value="all">Todos</option>' + approved().map(function (u) { return '<option value="u:' + u.id + '"' + (PF.resp === 'u:' + u.id ? ' selected' : '') + '>' + esc(u.nome) + '</option>'; }).join('') +
      S.externos.map(function (x) { return '<option value="x:' + x.id + '"' + (PF.resp === 'x:' + x.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '<option value="none"' + (PF.resp === 'none' ? ' selected' : '') + '>Sem responsável</option>';
    $('#body').innerHTML = '<div class="page gut"><h2>Prazos</h2><p class="muted" style="margin:0">Todos os prazos em aberto (intimações, editais, exigências), do mais próximo ao mais distante. Para registrar um novo, abra o processo.</p>' +
      '<div class="stats" style="padding:12px 0 4px"><div class="stat ' + (vencidos ? 'alert' : '') + '"><b>' + vencidos + '</b><span>vencidos</span></div><div class="stat"><b>' + semana + '</b><span>vencem em 7 dias</span></div><div class="stat"><b>' + lista.length + '</b><span>em aberto</span></div></div>' +
      '<div class="row2 wrap" style="margin:8px 0"><select id="pfResp" aria-label="Filtrar por responsável">' + respOpts + '</select><select id="pfTipo" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option>' +
      Object.keys(TIPO_PRAZO).map(function (k) { return '<option value="' + k + '"' + (PF.tipo === k ? ' selected' : '') + '>' + TIPO_PRAZO[k] + '</option>'; }).join('') + '</select></div>' +
      (lista.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Vence em</th><th>Tipo</th><th>Processo</th><th>Com quem está</th><th></th></tr></thead><tbody>' + lista.map(function (z) {
        var p = byId(z.processo_id), d = daysLeft(z.vence_em);
        return '<tr class="clickrow" data-open="' + p.id + '"><td><b>' + fmtYMD(z.vence_em) + '</b><br><span class="chip ' + (d < 0 ? 'bad' : d <= 15 ? 'warn' : 'gold') + '">' + (d < 0 ? 'vencido há ' + (-d) + ' ' + plural(-d, 'dia', 'dias') : d === 0 ? 'vence hoje' : 'faltam ' + d + ' ' + plural(d, 'dia', 'dias')) + '</span></td>' +
          '<td>' + TIPO_PRAZO[z.tipo] + (z.descricao ? '<br><span class="muted small">' + esc(z.descricao) + '</span>' : '') + '</td><td><b>' + esc(p.protocolo) + '</b><br><span class="muted small">' + esc(p.requerente_nome) + '</span></td>' +
          '<td>' + avatarKey(respKey(p)) + ' ' + esc(respName(p)) + '</td><td><button class="btn sm" data-done="' + z.id + '">Cumprido</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="msg info" style="margin-top:12px">Nenhum prazo em aberto com esses filtros.</div>') + '</div>';
    $('#pfResp').onchange = function (e) { PF.resp = e.target.value; renderPrazos(); };
    $('#pfTipo').onchange = function (e) { PF.tipo = e.target.value; renderPrazos(); };
    document.querySelectorAll('[data-done]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation(); b.disabled = true;
        sb.rpc('concluir_prazo', { p_prazo_id: +b.dataset.done, p_situacao: 'cumprido', p_email: false }).then(function (r) {
          if (r.error) { b.disabled = false; return toast(errText(r.error)); }
          toast('Prazo marcado como cumprido.'); reloadProcs().then(renderPrazos);
        });
      };
    });
    document.querySelectorAll('.clickrow').forEach(function (tr) { tr.onclick = function () { openDetail(+tr.dataset.open); }; });
  }

  /* ---------- advogados ---------- */
  function showCode(titulo, nome, code) {
    openGen('<h2>' + esc(titulo) + '</h2><div class="muted">' + esc(nome) + '</div>' +
      '<div class="codebox" id="cdBox">' + esc(fmtCode(code)) + '</div>' +
      '<div class="warnbox">Anote ou copie agora: por segurança, este código <b>não aparece de novo</b>. Se for perdido, gere outro (o anterior deixa de funcionar).</div>' +
      '<p class="hint">Entregue ao advogado. Na página ' + esc(location.origin) + '/ ele clica em “Tenho um código de advogado” e digita o código (ou, se tiver e-mail cadastrado, só informa o e-mail) para ver seus processos.</p>' +
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
    var opts = approved().map(function (u) { return '<option value="u:' + u.id + '">' + esc(u.nome) + '</option>'; }).join('') +
      S.externos.map(function (x) { return '<option value="x:' + x.id + '">' + esc(x.nome) + ' (sem conta)</option>'; }).join('');
    var exRows = S.externos.map(function (x) {
      var n = S.procs.filter(function (p) { return p.responsavel_externo_id === x.id && p.fase_id < 8; }).length;
      return '<tr><td><b>' + esc(x.nome) + '</b>' + (x.ativo ? '' : ' <span class="chip">Desativado</span>') + '</td><td>' + esc(x.email || '—') + '</td><td>' + n + '</td><td><button class="btn sm" data-xt="' + x.id + '">' + (x.ativo ? 'Desativar' : 'Reativar') + '</button></td></tr>';
    }).join('');
    $('#body').innerHTML = '<div class="page gut"><h2>Equipe</h2><p class="muted" style="margin:0">Cada escrevente cria a própria conta. O acesso só começa depois que você aprova.</p>' +
      '<div class="tblwrap"><table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Em andamento</th><th>Cadastro</th><th>Situação</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="page-h" style="margin-top:22px"><div><h3 style="margin:0 0 4px">Pessoas sem conta no painel</h3><p class="muted" style="margin:0">Podem ser indicadas em “Com quem está o processo”, mas não entram no painel.</p></div><button class="btn" id="exNew">' + ICON.plus + 'Adicionar pessoa</button></div>' +
      (S.externos.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Em andamento</th><th></th></tr></thead><tbody>' + exRows + '</tbody></table></div>' : '') +
      '<h3 style="margin:22px 0 4px">Passar processos de uma pessoa para outra</h3><p class="muted" style="margin:0">Útil em férias ou afastamentos. Só os processos em andamento mudam; a troca fica registrada.</p>' +
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
    $('#exNew').onclick = function () { addExterno(function () { toast('Pessoa adicionada.'); renderEquipe(); }); };
    document.querySelectorAll('[data-xt]').forEach(function (b) {
      b.onclick = function () {
        var x = extById(+b.dataset.xt);
        sb.from('pessoas_externas').update({ ativo: !x.ativo }).eq('id', x.id).then(function (r) {
          if (r.error) return toast(errText(r.error)); x.ativo = !x.ativo; renderEquipe();
        });
      };
    });
    $('#trOk').onclick = function () {
      var de = $('#trDe').value, para = $('#trPara').value;
      if (!de || !para || de === para) return toast('Escolha duas pessoas diferentes.');
      var n = S.procs.filter(function (p) { return respKey(p) === de && p.fase_id < 8; }).length;
      if (!n) return toast(keyName(de) + ' não tem processos em andamento.');
      confirmDialog({ titulo: 'Passar ' + n + ' ' + plural(n, 'processo', 'processos') + '?', texto: 'De <b>' + esc(keyName(de)) + '</b> para <b>' + esc(keyName(para)) + '</b>.', ok: 'Passar processos' }).then(function (ok) {
        if (!ok) return;
        var q = sb.from('processos').update(respPayload(para)).lt('fase_id', 8);
        q = de.charAt(0) === 'u' ? q.eq('responsavel_id', de.slice(2)) : q.eq('responsavel_externo_id', +de.slice(2));
        q.then(function (r) {
          if (r.error) return toast(errText(r.error)); toast(n + ' ' + plural(n, 'processo passou', 'processos passaram') + ' para ' + keyName(para) + '.'); reloadProcs().then(renderEquipe);
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
          '<label>O que isso significa <span class="opt">(linguagem simples, aparece na consulta)</span></label><textarea rows="2" maxlength="400" data-k="significado">' + esc(f.significado || '') + '</textarea>' +
          '<label>O que o requerente precisa fazer agora</label><textarea rows="2" maxlength="400" data-k="acao">' + esc(f.acao || '') + '</textarea>' +
          '<div class="row2 wrap"><label class="check"><input type="checkbox" data-k="oculta"' + (f.oculta ? ' checked' : '') + (fixa ? ' disabled' : '') + '> Ocultar esta etapa' + (fixa ? ' (obrigatória)' : '') + '</label><button class="btn sm primary" data-save="' + f.id + '">Salvar</button></div></div></div>';
      }).join('');
    document.querySelectorAll('[data-save]').forEach(function (b) {
      b.onclick = function () {
        var row = b.closest('.fase-row'), id = +row.dataset.f;
        var nome = row.querySelector('[data-k=nome]').value.trim(), desc = row.querySelector('[data-k=descricao_publica]').value.trim();
        if (nome.length < 2) return toast('Informe o nome da etapa.');
        b.disabled = true;
        var sig = row.querySelector('[data-k=significado]').value.trim() || null, aca = row.querySelector('[data-k=acao]').value.trim() || null;
        sb.from('fases').update({ nome: nome, descricao_publica: desc, significado: sig, acao: aca, oculta: row.querySelector('[data-k=oculta]').checked }).eq('id', id).then(function (r) {
          b.disabled = false;
          if (r.error) { toast(errText(r.error)); return; }
          var f = faseById(id); f.nome = nome; f.descricao_publica = desc; f.significado = sig; f.acao = aca; f.oculta = row.querySelector('[data-k=oculta]').checked;
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
    var head = ['Protocolo', 'Requerente', 'E-mail', 'E-mails adicionais', 'Imóvel', 'Referência', 'Matrícula', 'Tipo de usucapião', 'Data da prenotação', 'Advogado', 'Fase', 'Responsável', 'Prazos em aberto', 'Na fase desde', 'Criado em'].concat(isOficial() ? ['Valor (R$)'] : []);
    var rows = S.procs.slice().sort(function (a, b) { return a.protocolo.localeCompare(b.protocolo, 'pt-BR', { numeric: true }); }).map(function (p) {
      var a = advById(p.advogado_id);
      return [p.protocolo, p.requerente_nome, p.requerente_email, (p.emails_extra || []).join(' | '), p.imovel, p.referencia, p.matricula, p.tipo_usucapiao,
        p.data_prenotacao ? fmtYMD(p.data_prenotacao) : '', a ? a.nome : '', faseById(p.fase_id).nome, respKey(p) ? respName(p) : '',
        openPrazos(p.id).map(function (z) { return TIPO_PRAZO[z.tipo] + (z.descricao ? ' - ' + z.descricao : '') + ': ' + fmtYMD(z.vence_em); }).join(' | '), fmtDate(p.fase_desde), fmtDate(p.criado_em)].concat(isOficial() ? [p.valor != null ? String(p.valor).replace('.', ',') : ''] : []).map(csvCell).join(';');
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
      '<div class="card-box"><h3 style="margin:0 0 4px">Aparência</h3><p class="muted" style="margin:0 0 8px">Vale só para este aparelho.</p><div class="grid2"><div><label for="cTema">Tema</label><select id="cTema"><option value="auto">Automático (segue o aparelho)</option><option value="claro">Claro</option><option value="escuro">Escuro</option></select></div><div><label for="cFonte">Tamanho da letra</label><select id="cFonte"><option value="normal">Normal</option><option value="grande">Grande</option><option value="maior">Maior</option></select></div></div><p style="margin:10px 0 0"><button type="button" class="btn sm" id="cTour">Rever o tour de boas-vindas</button> <button type="button" class="btn sm" id="cAtalhos">Ver atalhos</button></p></div>' +
      '<div class="card-box"><h3 style="margin:0 0 4px">Verificação em duas etapas</h3><div id="mfaBox"><div class="loading">Carregando…</div></div></div>' +
      '<div class="card-box"><h3 style="margin:0 0 4px">Trocar senha</h3><label for="cPass">Nova senha</label><input type="password" id="cPass" autocomplete="new-password" placeholder="Mínimo de 8 caracteres"><div class="err" id="cPErr"></div><button class="btn" id="cPBtn" style="margin-top:8px">Salvar senha</button></div></div>';
    $('#cTema').value = window.CENTRAL_PREFS.get().tema; $('#cFonte').value = window.CENTRAL_PREFS.get().fonte;
    $('#cTema').onchange = function (e) { window.CENTRAL_PREFS.set('tema', e.target.value); };
    $('#cFonte').onchange = function (e) { window.CENTRAL_PREFS.set('fonte', e.target.value); };
    $('#cTour').onclick = openTour; $('#cAtalhos').onclick = openHelp;
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
    if (as) { e.stopPropagation(); if (SEL.on) { toggleSel(+as.dataset.assign); return; } if (Date.now() - lastDrag > 250) openAssign(+as.dataset.assign); return; }
    var card = e.target.closest('.card');
    if (card && Date.now() - lastDrag > 250) { if (SEL.on) toggleSel(+card.dataset.id); else openDetail(+card.dataset.id); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('card')) { e.preventDefault(); if (SEL.on) toggleSel(+e.target.dataset.id); else openDetail(+e.target.dataset.id); }
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
