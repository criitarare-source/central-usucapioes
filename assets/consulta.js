(function () {
  'use strict';
  var C = window.CENTRAL;
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: false } });
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
  var plural = function (n, a, b) { return n === 1 ? a : b; };

  var clock = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var check = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';

  function phaseColor(id) {
    if (id === 3) return 'var(--warn)';
    if (id === 8) return 'var(--ok)';
    if (id === 9) return 'var(--bad)';
    var i = { 1: 0, 2: 1, 4: 2, 5: 3, 6: 4, 7: 5 }[id] || 0;
    return 'color-mix(in srgb, var(--gold) ' + (i * 18) + '%, var(--green-2))';
  }

  var fasesCache = null;
  function getFases() {
    if (fasesCache) return Promise.resolve(fasesCache);
    return sb.from('fases').select('id,nome,descricao_publica,significado,acao,ordem,etapa_principal,oculta').order('ordem').then(function (r) {
      fasesCache = r.data || [];
      return fasesCache;
    });
  }

  var TIPO_PRAZO = { intimacao: 'Intimação', edital: 'Edital', exigencia: 'Exigência', outro: 'Prazo' };

  function prazoChip(z) {
    var n = daysLeft(z.vence_em);
    return '<span class="chip ' + (n < 0 ? 'bad' : n <= 15 ? 'warn' : 'gold') + '">' + clock + ' ' + esc(TIPO_PRAZO[z.tipo] || 'Prazo') + (z.descricao ? ' (' + esc(z.descricao) + ')' : '') +
      ': ' + fmtYMD(z.vence_em) + ' · ' + (n < 0 ? 'vencido' : n === 0 ? 'vence hoje' : 'faltam ' + n + ' ' + plural(n, 'dia', 'dias')) + '</span>';
  }

  function progress(d, fases) {
    var cur = fases.find(function (f) { return f.id === d.fase_id; }) || { ordem: 0 };
    var path = fases.filter(function (f) { return f.etapa_principal && !f.oculta; });
    var on = path.filter(function (f) { return Number(f.ordem) <= Number(cur.ordem); }).length;
    if (d.fase_id >= 9) return { html: '', on: on, total: path.length };
    return {
      on: on, total: path.length,
      html: '<div><div class="seg" aria-hidden="true">' + path.map(function (f, i) { return '<i class="' + (i < on ? 'on' : '') + '"></i>'; }).join('') +
        '</div><div class="seg-l">' + (d.fase_id === 8 ? 'Todas as etapas concluídas' : on + ' de ' + path.length + ' etapas concluídas') + '</div></div>'
    };
  }

  // callout + prazos + linha do tempo (usado na consulta por protocolo e dentro de cada processo do advogado)
  function timelineHTML(d, fases) {
    var byId = {}; fases.forEach(function (f) { byId[f.id] = f; });
    var cur = byId[d.fase_id] || { nome: 'Em andamento', ordem: 0 };
    var path = fases.filter(function (f) { return f.etapa_principal && !f.oculta; });
    var hist = d.historico || [];
    var lastMove = -1;
    hist.forEach(function (h, i) { if (h.tipo === 'fase') lastMove = i; });

    var items = hist.map(function (h, i) {
      if (h.tipo === 'prazo' || h.tipo === 'nota') {
        return '<li class="minor"><span class="tl-dot"></span><div class="tl-head"><span class="tl-t" style="font-size:14px">' + (h.tipo === 'nota' ? 'Observação do cartório' : 'Prazo') +
          '</span><time>' + fmtDT(h.em) + '</time></div>' + (h.mensagem ? '<p class="tl-d">' + esc(h.mensagem) + '</p>' : '') + '</li>';
      }
      var isCur = i === lastMove, cls = isCur && d.fase_id < 8 ? 'current' : 'done', extra = '';
      if (h.prazo_edital) extra = '<div class="tl-pr"><span class="chip gold">' + clock + ' Prazo do edital: ' + fmtYMD(h.prazo_edital) + '</span></div>';
      return '<li class="' + cls + '"><span class="tl-dot">' + (cls === 'done' ? check : '') + '</span>' +
        '<div class="tl-head"><span class="tl-t">' + esc(h.fase_nome) + '</span><time>' + fmtDT(h.em) + '</time></div>' +
        '<p class="tl-d">' + esc(h.descricao) + '</p>' +
        (h.mensagem ? '<div class="tl-msg"><small>Mensagem do cartório</small>' + esc(h.mensagem) + '</div>' : '') + extra + '</li>';
    }).join('');

    var up = d.fase_id >= 8 ? [] : path.filter(function (f) { return Number(f.ordem) > Number(cur.ordem); });
    var upHTML = up.length ? '<li class="tl-sep">Próximas etapas</li>' + up.map(function (f) {
      return '<li class="upcoming"><span class="tl-dot"></span><div class="tl-head"><span class="tl-t">' + esc(f.nome) + '</span></div></li>';
    }).join('') : '';

    var call = '';
    if (d.fase_id === 3) call = '<div class="callout">Ação necessária: o cartório aguarda providências suas. Leia a mensagem abaixo e procure o cartório.</div>';
    if (d.fase_id === 8) call = '<div class="callout ok">Seu pedido foi concluído. Procure o cartório para retirar a certidão.</div>';
    if (d.fase_id === 9) call = '<div class="callout bad">Seu pedido não seguirá pela via extrajudicial. Procure o cartório para orientações.</div>';

    var guide = (cur.significado || cur.acao) ? '<div class="guide">' + (cur.significado ? '<div><h4>O que isso significa</h4><p>' + esc(cur.significado) + '</p></div>' : '') +
      (cur.acao ? '<div class="todo"><h4>O que você precisa fazer agora</h4><p>' + esc(cur.acao) + '</p></div>' : '') + '</div>' : '';
    var prazos = d.prazos || [];
    var pbox = prazos.length ? '<div class="pbox"><b>Prazos em andamento</b><div class="pchips">' + prazos.map(prazoChip).join('') + '</div></div>' : '';
    return guide + call + pbox + '<ol class="tl" aria-label="Linha do tempo do pedido">' + items + upHTML + '</ol>';
  }

  function render(d, fases) {
    var cur = fases.find(function (f) { return f.id === d.fase_id; }) || { nome: 'Em andamento' };
    var hist = d.historico || [], last = hist.length ? hist[hist.length - 1] : null;
    return '<div class="result"><div class="res-h"><span class="k">Usucapião extrajudicial</span><h3>Protocolo ' + esc(d.protocolo) + '</h3>' +
      '<div class="meta"><span class="pill" style="--c:' + phaseColor(d.fase_id) + '">' + esc(cur.nome) + '</span>' +
      (last ? '<span>Atualizado em ' + fmtDate(last.em) + '</span>' : '') + '</div>' + progress(d, fases).html + '</div>' +
      timelineHTML(d, fases) +
      '<div class="res-actions"><button type="button" class="btn" data-act="print">Imprimir ou salvar em PDF</button><button type="button" class="btn" data-act="copy">Copiar o link</button><button type="button" class="btn" data-act="save">Lembrar neste aparelho</button></div></div>';
  }

  /* ---------- área do advogado: vários processos abertos ao mesmo tempo ---------- */
  function grupo(d) {
    if (d.fase_id === 3) return 'acao';
    if (d.fase_id === 8) return 'concluido';
    if (d.fase_id === 9) return 'encerrado';
    return 'andamento';
  }
  function urgente(d) {
    if (d.fase_id === 3) return true;
    return (d.prazos || []).some(function (z) { return daysLeft(z.vence_em) <= 7; });
  }
  function renderAdv(data, fases) {
    var lista = (data.processos || []).slice().sort(function (a, b) {
      var ua = urgente(a) ? 0 : 1, ub = urgente(b) ? 0 : 1;
      return ua - ub || String(a.protocolo).localeCompare(String(b.protocolo), 'pt-BR', { numeric: true });
    });
    var byId = {}; fases.forEach(function (f) { byId[f.id] = f; });
    var cont = { todos: lista.length, acao: 0, andamento: 0, concluido: 0, encerrado: 0 };
    lista.forEach(function (d) { cont[grupo(d)]++; });
    var ativos = cont.andamento + cont.acao;
    var chips = [['todos', 'Todos'], ['acao', 'Precisam de ação'], ['andamento', 'Em andamento'], ['concluido', 'Concluídos'], ['encerrado', 'Encerrados']]
      .filter(function (c) { return c[0] === 'todos' || cont[c[0]] > 0; })
      .map(function (c) { return '<button type="button" class="fchip" data-f="' + c[0] + '" aria-pressed="' + (c[0] === 'todos') + '">' + c[1] + ' <b>' + cont[c[0]] + '</b></button>'; }).join('');

    var itens = lista.map(function (d) {
      var cur = byId[d.fase_id] || { nome: 'Em andamento' }, pr = progress(d, fases), prazos = d.prazos || [];
      var hist = d.historico || [], last = hist.length ? hist[hist.length - 1] : null;
      return '<li class="pitem" data-g="' + grupo(d) + '" data-q="' + esc((d.protocolo + ' ' + (d.referencia || '')).toLowerCase()) + '"><details' + (lista.length === 1 ? ' open' : '') + '>' +
        '<summary><span class="pi-main"><b>' + esc(d.protocolo) + '</b>' + (d.referencia ? '<span class="pi-ref">' + esc(d.referencia) + '</span>' : '') + '</span>' +
        '<span class="pill" style="--c:' + phaseColor(d.fase_id) + '">' + esc(cur.nome) + '</span>' +
        '<span class="pi-meta">' + (pr.total && d.fase_id < 9 ? '<span class="pi-prog" aria-label="' + pr.on + ' de ' + pr.total + ' etapas"><span class="seg" aria-hidden="true">' + Array.from({ length: pr.total }, function (_, i) { return '<i class="' + (i < pr.on ? 'on' : '') + '"></i>'; }).join('') + '</span></span>' : '') +
        (last ? '<span>Atualizado em ' + fmtDate(last.em) + '</span>' : '') + '</span>' +
        (prazos.length ? '<span class="pi-prazos">' + prazos.slice(0, 2).map(prazoChip).join('') + (prazos.length > 2 ? '<span class="chip">+' + (prazos.length - 2) + '</span>' : '') + '</span>' : '') +
        '<span class="pi-chev" aria-hidden="true"></span></summary>' +
        '<div class="pi-body">' + timelineHTML(d, fases) + '</div></details></li>';
    }).join('');

    return '<div class="result adv"><div class="res-h"><span class="k">Área do advogado</span><h3>' + esc(data.nome) + '</h3>' +
      '<div class="meta"><span><b>' + cont.todos + '</b> ' + plural(cont.todos, 'processo', 'processos') + '</span>' +
      (ativos ? '<span><b>' + ativos + '</b> ' + plural(ativos, 'em andamento', 'em andamento') + '</span>' : '') +
      (cont.acao ? '<span class="warn-t"><b>' + cont.acao + '</b> ' + plural(cont.acao, 'precisa de ação', 'precisam de ação') + '</span>' : '') +
      (cont.concluido ? '<span><b>' + cont.concluido + '</b> ' + plural(cont.concluido, 'concluído', 'concluídos') + '</span>' : '') + '</div></div>' +
      (lista.length ? '<div class="adv-tools"><div class="chips" id="advChips" role="group" aria-label="Filtrar processos">' + chips + '</div>' +
        (lista.length > 4 ? '<input type="search" id="advQ" placeholder="Buscar protocolo ou referência" aria-label="Buscar processo">' : '') +
        '<div class="adv-open"><button type="button" class="linkbtn" id="advAll">Abrir todos</button><button type="button" class="linkbtn" id="advNone">Fechar todos</button><button type="button" class="linkbtn" data-act="print">Imprimir ou salvar em PDF</button></div></div>' +
        '<ul class="plist" id="advList">' + itens + '</ul><p class="adv-empty" id="advEmpty" hidden>Nenhum processo com esse filtro.</p>' :
        '<p class="note" style="margin:12px 16px">Nenhum processo está ligado a este código no momento.</p>') + '</div>';
  }
  function bindAdv(out) {
    var f = 'todos', q = '';
    var apply = function () {
      var n = 0;
      out.querySelectorAll('.pitem').forEach(function (li) {
        var ok = (f === 'todos' || li.dataset.g === f) && (!q || li.dataset.q.indexOf(q) >= 0);
        li.hidden = !ok; if (ok) n++;
      });
      var e = $('#advEmpty'); if (e) e.hidden = n > 0;
    };
    out.querySelectorAll('#advChips .fchip').forEach(function (b) {
      b.addEventListener('click', function () {
        f = b.dataset.f;
        out.querySelectorAll('#advChips .fchip').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        apply();
      });
    });
    var qi = $('#advQ'); if (qi) qi.addEventListener('input', function () { q = qi.value.trim().toLowerCase(); apply(); });
    var setAll = function (v) { out.querySelectorAll('.pitem:not([hidden]) details').forEach(function (d) { d.open = v; }); };
    var a = $('#advAll'), n = $('#advNone');
    if (a) a.addEventListener('click', function () { setAll(true); });
    if (n) n.addEventListener('click', function () { setAll(false); });
  }

  /* ---------- imprimir, copiar link, lembrar neste aparelho ---------- */
  var LS = 'central_protocolo';
  function lsGet() { try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } }
  function lsSet(v) { try { if (v) localStorage.setItem(LS, v); else localStorage.removeItem(LS); } catch (e) {} }
  function printHead(txt) {
    var h = $('#printHead'); if (!h) return;
    var d = new Date();
    h.innerHTML = '<b>Registro de Imóveis de Itararé</b><br>Acompanhamento de usucapião extrajudicial · ' + esc(txt) + '<br>Consulta feita em ' + fmtDT(d.toISOString()) + '. Documento informativo, sem valor de certidão.';
  }
  var reopen = [];
  window.addEventListener('beforeprint', function () {
    reopen = [];
    document.querySelectorAll('.pitem details').forEach(function (x) { if (!x.open) { reopen.push(x); x.open = true; } });
  });
  window.addEventListener('afterprint', function () { reopen.forEach(function (x) { x.open = false; }); reopen = []; });
  function flash(btn, txt) { var o = btn.textContent; btn.textContent = txt; setTimeout(function () { btn.textContent = o; }, 2500); }
  function bindActions(out, proto) {
    out.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.act;
        if (a === 'print') window.print();
        else if (a === 'copy') {
          var url = location.origin + '/?p=' + encodeURIComponent(proto);
          if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { flash(b, 'Link copiado'); }, function () { flash(b, 'Copie pelo endereço do navegador'); }); else flash(b, 'Copie pelo endereço do navegador');
        } else if (a === 'save') {
          lsSet(proto); flash(b, 'Guardado! Na próxima visita aparece um atalho'); showResume();
        }
      });
    });
  }
  function showResume() {
    var el = $('#resume'); if (!el) return;
    var p = lsGet();
    if (!p || !/^[0-9]{1,12}$/.test(p)) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="resume"><span>Acompanhando o protocolo <b>' + esc(p) + '</b></span><button type="button" class="btn sm primary" id="resOpen">Ver agora</button><button type="button" class="linkbtn" id="resForget">Esquecer</button></div>' +
      '<p class="note" style="margin-top:6px">Dica: no celular, use o menu do navegador e escolha “Adicionar à tela inicial”.</p>';
    $('#resOpen').addEventListener('click', function () { $('#pubProto').value = p; consultar(p); });
    $('#resForget').addEventListener('click', function () { lsSet(''); showResume(); });
  }

  /* tema e tamanho da letra */
  (function () {
    if (!window.CENTRAL_PREFS) return;
    var bar = document.createElement('div'); bar.className = 'prefbar';
    var bt = document.createElement('button'), bf = document.createElement('button');
    bt.type = bf.type = 'button';
    var upd = function () { bt.textContent = window.CENTRAL_PREFS.label('tema').replace('Tema: ', 'Tema ') ; bf.textContent = 'Aa ' + window.CENTRAL_PREFS.label('fonte').replace('Letra: ', ''); };
    bt.onclick = function () { window.CENTRAL_PREFS.cycle('tema'); upd(); };
    bf.onclick = function () { window.CENTRAL_PREFS.cycle('fonte'); upd(); };
    upd(); bar.appendChild(bt); bar.appendChild(bf); document.body.appendChild(bar);
  })();

  var busy = false;
  function consultar(raw) {
    var out = $('#out'), n = String(raw || '').replace(/\s+/g, '');
    if (!/^[0-9]{1,12}$/.test(n)) {
      out.innerHTML = '<div class="notfound">Digite apenas os números do protocolo, como 52474.</div>';
      return;
    }
    if (busy) return;
    busy = true; $('#qbtn').disabled = true;
    out.innerHTML = '<div class="loading">Consultando…</div>';
    Promise.all([sb.rpc('consulta_publica', { p_protocolo: n }), getFases()]).then(function (res) {
      var r = res[0], fases = res[1];
      if (r.error) {
        var m = r.error.message || '';
        out.innerHTML = '<div class="notfound">' + (m.indexOf('Muitas consultas') >= 0
          ? 'Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.'
          : 'Não foi possível consultar agora. Tente de novo em instantes.') + '</div>';
        return;
      }
      if (!r.data) {
        out.innerHTML = '<div class="notfound">Não encontramos esse protocolo. Confira o número no recibo do cartório e tente de novo.</div>';
        return;
      }
      out.innerHTML = render(r.data, fases);
      bindActions(out, r.data.protocolo);
      printHead('Protocolo ' + r.data.protocolo);
      out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }).catch(function () {
      out.innerHTML = '<div class="notfound">Não foi possível consultar agora. Tente de novo em instantes.</div>';
    }).then(function () { busy = false; $('#qbtn').disabled = false; });
  }

  /* ---------- área do advogado (vários processos) ---------- */
  $('#advToggle').addEventListener('click', function () {
    var box = $('#advBox'), open = box.hidden;
    box.hidden = !open; this.setAttribute('aria-expanded', open);
    if (open) $('#advCode').focus();
  });

  var advBusy = false;
  $('#advForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var out = $('#out'), code = $('#advCode').value;
    if (advBusy) return;
    if (String(code).replace(/[^A-Za-z0-9]/g, '').length !== 12) {
      out.innerHTML = '<div class="notfound">O código tem 12 letras e números. Confira como o cartório entregou.</div>';
      return;
    }
    advBusy = true; $('#advBtn').disabled = true;
    out.innerHTML = '<div class="loading">Consultando…</div>';
    Promise.all([sb.rpc('consulta_advogado', { p_codigo: code }), getFases()]).then(function (res) {
      var r = res[0], fases = res[1];
      if (r.error) {
        out.innerHTML = '<div class="notfound">' + (String(r.error.message || '').indexOf('Muitas consultas') >= 0
          ? 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.'
          : 'Não foi possível consultar agora. Tente de novo em instantes.') + '</div>';
        return;
      }
      if (!r.data) { out.innerHTML = '<div class="notfound">Código não encontrado ou desativado. Confira o código ou procure o cartório.</div>'; return; }
      out.innerHTML = renderAdv(r.data, fases);
      bindAdv(out);
      bindActions(out, null);
      printHead('Área do advogado: ' + r.data.nome);
      out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }).catch(function () {
      out.innerHTML = '<div class="notfound">Não foi possível consultar agora. Tente de novo em instantes.</div>';
    }).then(function () { advBusy = false; $('#advBtn').disabled = false; });
  });

  $('#qform').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#pubProto').value;
    consultar(v);
    try { history.replaceState(null, '', '?p=' + encodeURIComponent(String(v).replace(/\s+/g, ''))); } catch (x) {}
  });

  // Link direto, como o do e-mail: /?p=52474
  var q = new URLSearchParams(location.search).get('p');
  if (q) { $('#pubProto').value = q; consultar(q); } else showResume();
})();
