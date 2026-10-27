/* Tabela de emolumentos (parte do Oficial) por faixa de valor, conforme tabela enviada pelo cartório em 27/10/2026.
   Cada linha: [limite superior da faixa (inclusive), valor do Oficial em R$]. Atualizar quando sair tabela nova.
   Estimativa de usucapião = 2 x Oficial (procedimento + registro), só sobre o registro; não inclui abertura de matrícula, certidões nem averbações. */
(function () {
  'use strict';
  var TAB = [
  [2306, 156.07],
  [5761, 250.43],
  [9603, 449.28],
  [19210, 666.61],
  [38420, 810.44],
  [115260, 903.80],
  [192100, 1153.58],
  [230520, 1402.84],
  [268940, 1527.22],
  [307360, 1652.32],
  [345780, 1741.87],
  [384200, 1787.28],
  [768400, 1992.82],
  [1152600, 2333.80],
  [1536800, 2686.76],
  [1921000, 3039.77],
  [2305200, 3222.27],
  [3842000, 4134.74],
  [5763000, 5777.19],
  [7684000, 7602.14],
  [9605000, 9427.09],
  [11526000, 11252.04],
  [13447000, 13076.99],
  [15368000, 14901.94],
  [17289000, 16726.89],
  [19210000, 18551.84],
  [23052000, 21289.27],
  [26894000, 24939.17],
  [30736000, 28589.07],
  [34578000, 32238.97],
  [38420000, 35888.87],
  [42262000, 39538.77],
  [46104000, 43188.67],
  [49946000, 46838.57],
  [53788000, 50488.47],
  [57630000, 54138.37],
  [65314000, 59613.22],
  [72998000, 66913.02],
  [80682000, 74212.82],
  [88366000, 81512.62],
  [96050000, 88812.42],
  [103734000, 96112.22],
  [111418000, 103412.02],
  [119102000, 110711.82],
  [126786000, 118011.62],
  [134470000, 125311.42],
  [142154000, 132611.22],
  [Infinity, 140336.23],
  ];
  function oficial(base) {
    var v = Number(base);
    if (!isFinite(v) || v <= 0) return null;
    for (var i = 0; i < TAB.length; i++) if (v <= TAB[i][0] + 1e-9) return TAB[i][1];
    return null;
  }
  /* bases: lista de valores de cada registro (ou um só valor). Retorna o emolumento estimado em R$ ou null. */
  function estimar(bases) {
    if (!bases || !bases.length) return null;
    var tot = 0;
    for (var i = 0; i < bases.length; i++) { var o = oficial(bases[i]); if (o == null) return null; tot += o; }
    return Math.round(tot * 2 * 100) / 100;
  }
  window.CENTRAL_EMOL = { oficial: oficial, estimar: estimar, faixas: TAB.length };
})();
