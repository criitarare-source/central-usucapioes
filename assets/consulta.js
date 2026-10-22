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
    return sb.from('fases').select('id,nome,descricao_publica,ordem,etapa_principal,oculta').order('ordem').then(function (r) {
      fasesCache = r.data || [];
      return fasesCache;
    });
  }

  function render(d, fases) {
    var byId = {}; fases.forEach(function (f) { byId[f.id] = f; });
    var cur = byId[d.fase_id] || { nome: 'Em andamento', ordem: 0 };
    var path = fases.filter(function (f) { return f.etapa_principal && !f.oculta; });
    var hist = d.historico || [];
    var lastMove = -1;
    hist.forEach(function (h, i) { if (h.tipo === 'fase') lastMove = i; });
    var on = path.filter(function (f) { return Number(f.ordem) <= Number(cur.ordem); }).length;

    var items = hist.map(function (h, i) {
      if (h.tipo === 'prazo') {
        return '<li class="minor"><span class="tl-dot"></span><div class="tl-head"><span class="tl-t" style="font-size:14px">Prazo do edital ' +
          (h.prazo_edital ? 'informado' : 'removido') + '</span><time>' + fmtDT(h.em) + '</time></div>' +
          (h.prazo_edital ? '<p class="tl-d">O prazo termina em <b>' + fmtYMD(h.prazo_edital) + '</b>.</p>' : '') + '</li>';
      }
      var isCur = i === lastMove, cls = isCur && d.fase_id < 8 ? 'current' : 'done', extra = '';
      if (h.prazo_edital && isCur && d.prazo_edital) {
        var n = daysLeft(d.prazo_edital);
        extra = '<div class="tl-pr"><span class="chip ' + (n < 0 ? 'bad' : n <= 15 ? 'warn' : 'gold') + '">' + clock +
          ' Prazo do edital termina em ' + fmtYMD(d.prazo_edital) + ' · ' +
          (n < 0 ? 'encerrado' : n === 0 ? 'termina hoje' : 'faltam ' + n + ' ' + plural(n, 'dia', 'dias')) + '</span></div>';
      } else if (h.prazo_edital) {
        extra = '<div class="tl-pr"><span class="chip gold">' + clock + ' Prazo do edital: ' + fmtYMD(h.prazo_edital) + '</span></div>';
      }
      return '<li class="' + cls + '"><span class="tl-dot">' + (cls === 'done' ? check : '') + '</span>' +
        '<div class="tl-head"><span class="tl-t">' + esc(h.fase_nome) + '</span><time>' + fmtDT(h.em) + '</time></div>' +
        '<p class="tl-d">' + esc(h.descricao) + '</p>' +
        (h.mensagem ? '<div class="tl-msg"><small>Mensagem do cartório</small>' + esc(h.mensagem) + '</div>' : '') + extra + '</li>';
    }).join('');

    var up = d.fase_id >= 8 ? [] : path.filter(function (f) { return Number(f.ordem) > Number(cur.ordem); });
    var upHTML = up.length ? '<li class="tl-sep">Próximas etapas</li>' + up.map(function (f) {
      return '<li class="upcoming"><span class="tl-dot"></span><div class="tl-head"><span class="tl-t">' + esc(f.nome) + '</span></div></li>';
    }).join('') : '';

    var last = hist.length ? hist[hist.length - 1] : null, call = '';
    if (d.fase_id === 3) call = '<div class="callout">Ação necessária: o cartório aguarda providências suas. Leia a mensagem abaixo e procure o cartório.</div>';
    if (d.fase_id === 8) call = '<div class="callout ok">Seu pedido foi concluído. Procure o cartório para retirar a certidão.</div>';
    if (d.fase_id === 9) call = '<div class="callout bad">Seu pedido não seguirá pela via extrajudicial. Procure o cartório para orientações.</div>';

    var seg = '';
    if (d.fase_id < 9) {
      seg = '<div><div class="seg" aria-hidden="true">' + path.map(function (f, i) { return '<i class="' + (i < on ? 'on' : '') + '"></i>'; }).join('') +
        '</div><div class="seg-l">' + (d.fase_id === 8 ? 'Todas as etapas concluídas' : on + ' de ' + path.length + ' etapas concluídas') + '</div></div>';
    }
    return '<div class="result"><div class="res-h"><span class="k">Usucapião extrajudicial</span><h3>Protocolo ' + esc(d.protocolo) + '</h3>' +
      '<div class="meta"><span class="pill" style="--c:' + phaseColor(d.fase_id) + '">' + esc(cur.nome) + '</span>' +
      (last ? '<span>Atualizado em ' + fmtDate(last.em) + '</span>' : '') + '</div>' + seg + '</div>' +
      call + '<ol class="tl" aria-label="Linha do tempo do pedido">' + items + upHTML + '</ol></div>';
  }

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
      var byId = {}; fases.forEach(function (f) { byId[f.id] = f; });
      var lista = r.data.processos || [];
      out.innerHTML = '<div class="result"><div class="res-h"><span class="k">Área do advogado</span><h3>' + esc(r.data.nome) + '</h3>' +
        '<div class="meta"><span>' + lista.length + ' ' + plural(lista.length, 'processo', 'processos') + '</span></div></div>' +
        (lista.length ? '<ul class="plist">' + lista.map(function (p) {
          return '<li><button type="button" class="prow" data-p="' + esc(p.protocolo) + '"><span class="prow-main"><b>' + esc(p.protocolo) + '</b>' + (p.referencia ? '<span class="prow-ref">' + esc(p.referencia) + '</span>' : '') + '</span>' +
            '<span class="pill" style="--c:' + phaseColor(p.fase_id) + '">' + esc((byId[p.fase_id] || {}).nome || p.fase_nome) + '</span>' +
            '<span class="prow-d">Atualizado em ' + fmtDate(p.atualizado_em) + '</span></button></li>';
        }).join('') + '</ul><p class="note" style="margin:12px 16px">Toque em um processo para ver a linha do tempo.</p>' : '<p class="note" style="margin:12px 16px">Nenhum processo está ligado a este código no momento.</p>') + '</div>';
      out.querySelectorAll('.prow').forEach(function (b) {
        b.addEventListener('click', function () { $('#pubProto').value = b.dataset.p; consultar(b.dataset.p); });
      });
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
  if (q) { $('#pubProto').value = q; consultar(q); }
})();
