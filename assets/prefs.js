/* Preferências deste aparelho: tema (automático/claro/escuro) e tamanho da letra. Roda antes de desenhar a página. */
(function () {
  'use strict';
  var KEY = 'central_prefs', TEMAS = ['auto', 'claro', 'escuro'], FONTES = ['normal', 'grande', 'maior'];
  var st = { tema: 'auto', fonte: 'normal' };
  try { var j = JSON.parse(localStorage.getItem(KEY) || '{}'); if (TEMAS.indexOf(j.tema) >= 0) st.tema = j.tema; if (FONTES.indexOf(j.fonte) >= 0) st.fonte = j.fonte; } catch (e) {}
  function apply() {
    var r = document.documentElement;
    if (st.tema === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', st.tema === 'claro' ? 'light' : 'dark');
    if (st.fonte === 'normal') r.removeAttribute('data-fs'); else r.setAttribute('data-fs', st.fonte);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} apply(); }
  apply();
  window.CENTRAL_PREFS = {
    get: function () { return { tema: st.tema, fonte: st.fonte }; },
    set: function (k, v) { if (k === 'tema' && TEMAS.indexOf(v) >= 0) st.tema = v; if (k === 'fonte' && FONTES.indexOf(v) >= 0) st.fonte = v; save(); },
    cycle: function (k) { var l = k === 'tema' ? TEMAS : FONTES; st[k] = l[(l.indexOf(st[k]) + 1) % l.length]; save(); return st[k]; },
    label: function (k) { return k === 'tema' ? { auto: 'Tema: automático', claro: 'Tema: claro', escuro: 'Tema: escuro' }[st.tema] : { normal: 'Letra: normal', grande: 'Letra: grande', maior: 'Letra: maior' }[st.fonte]; }
  };
})();
