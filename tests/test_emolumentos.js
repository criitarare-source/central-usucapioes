// Teste da tabela de emolumentos: node tests/test_emolumentos.js
global.window = {};
require('../assets/emolumentos.js');
const E = window.CENTRAL_EMOL;
let falhas = 0;
const igual = (nome, obtido, esperado) => {
  const ok = Object.is(obtido, esperado);
  console.log((ok ? 'PASSOU ' : 'FALHOU ') + nome + (ok ? '' : ' -> obtido ' + obtido + ', esperado ' + esperado));
  if (!ok) falhas++;
};
igual('48 faixas (a até z22)', E.faixas, 48);
igual('limite superior é inclusivo (2.306,00 -> faixa a)', E.oficial(2306.00), 156.07);
igual('2.306,01 -> faixa b', E.oficial(2306.01), 250.43);
igual('R$ 300.000,00 -> faixa j', E.oficial(300000), 1652.32);
igual('R$ 695.837,33 -> faixa m', E.oficial(695837.33), 1992.82);
igual('142.154.000,00 -> faixa z21', E.oficial(142154000), 132611.22);
igual('acima de 142.154.000,00 -> faixa z22', E.oficial(142154000.01), 140336.23);
igual('estimativa = 2 x Oficial (300.000)', E.estimar([300000]), 3304.64);
igual('vários registros somam cada faixa (48926)', E.estimar([2064128.02, 2064128.02, 1029050.72, 759727.84]), 21542.32);
igual('valor zero não estima', E.estimar([0]), null);
igual('sem valor não estima', E.estimar(null), null);
igual('lista vazia não estima', E.estimar([]), null);
process.exit(falhas ? 1 : 0);
