#!/usr/bin/env python3
"""Roda os testes do site: python3 tests/run.py   (precisa de: pip install playwright && playwright install chromium; cd tests && npm ci)"""
import os, subprocess, sys, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock
from mock import Servidor, Navegador

TESTES = []
def teste(f): TESTES.append(f); return f
def confere(cond, msg):
    if not cond: raise AssertionError(msg)

@teste
def tabela_de_emolumentos(srv):
    r = subprocess.run(['node', os.path.join(mock.RAIZ, 'tests', 'test_emolumentos.js')], capture_output=True, text=True)
    confere(r.returncode == 0, r.stdout + r.stderr)

@teste
def consulta_publica_tema_claro_por_padrao(srv):
    with Navegador(srv, 'oficial', 420, 900) as n:
        n.page.goto(srv.url + '/index.html?p=52474'); n.page.wait_for_timeout(1000)
        confere(n.page.evaluate("document.documentElement.getAttribute('data-theme')") == 'light', 'o tema padrão deveria ser o claro')
        confere('Protocolo' in n.page.inner_text('body'), 'a linha do tempo não apareceu')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)

@teste
def painel_oficial_ve_valores_e_emolumentos_no_card(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        confere('R$' in p.inner_text('.card[data-id="1"] .valor'), 'valor não aparece no card')
        confere('1.850,50' in p.inner_text('.card[data-id="1"] .emol'), 'emolumento pago não aparece')
        est = p.inner_text('.card[data-id="2"] .emol')
        confere('3.985,64' in est and 'estimado' in est, 'estimativa errada: ' + est)
        confere('21.542,32' in p.inner_text('.card[data-id="3"] .emol'), 'estimativa com vários registros errada')
        confere(p.locator('.card[data-id="5"] .emol').count() == 0, 'concluído sem valor pago não deve ter estimativa')
        confere(p.locator('.card[data-id="4"] .valor').count() == 0, 'processo sem valor não deve mostrar valor')
        confere(p.locator('.card[data-id="4"] .chip.prov').count() == 1, 'processo em andamento sem e-mail deve mostrar "Dados a preencher"')
        confere(p.locator('.card[data-id="5"] .chip.prov').count() == 0, 'concluído não deve mostrar "Dados a preencher"')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)

@teste
def botao_valores_oculta_os_numeros(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('#bVals'); p.wait_for_timeout(300)
        confere('••••' in p.inner_text('.card[data-id="1"] .valor') and '••••' in p.inner_text('.card[data-id="2"] .emol'), 'valores não foram ocultados')
        p.click('[data-view=graficos]'); p.wait_for_timeout(800)
        t = p.inner_text('.gr-page')
        confere('ocultos' in t and '300.000' not in t, 'o gráfico de valores deveria estar oculto')
        p.click('#bVals'); p.wait_for_timeout(300); p.click('[data-view=graficos]'); p.wait_for_timeout(800)
        confere('Valor por fase' in p.inner_text('.gr-page') and 'Emolumentos previstos' in p.inner_text('.gr-page'), 'gráficos de valores não voltaram')

@teste
def oficial_edita_emolumentos_e_registros(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('.card[data-id="3"] .nome'); p.wait_for_timeout(500)
        if p.locator('text=Editar dados').count(): p.click('text=Editar dados')
        p.wait_for_timeout(300)
        confere(p.input_value('#edRegs').startswith('2.064.128,02'), 'campo dos registros não veio preenchido')
        p.fill('#edEmol', '2.000,00'); p.fill('#edRegs', '1.000,00; 2.000,00'); p.click('#edSave'); p.wait_for_timeout(600)
        corpo = [c for c in n.calls if c[0] == 'PATCH processos'][-1][1]
        confere('"emolumentos":2000' in corpo and '"registros":[1000,2000]' in corpo, 'payload errado: ' + corpo[:200])

@teste
def escrevente_nao_ve_emolumentos_nem_abas_do_oficial(srv):
    with Navegador(srv, 'escrevente') as n:
        n.entrar(); p = n.page
        confere(p.locator('.card .valor').count() == 0, 'escrevente não deve ver o valor no card')
        confere(p.locator('.card .emol').count() == 0, 'escrevente não deve ver emolumentos no card')
        confere(p.locator('#bVals').count() == 0, 'botão Valores é só do Oficial')
        for aba in ('equipe', 'auditoria', 'ajustes', 'emails'):
            confere(p.locator('[data-view=%s]' % aba).count() == 0, 'aba %s só do Oficial' % aba)
        p.click('.card[data-id="3"] .nome'); p.wait_for_timeout(500)
        if p.locator('text=Editar dados').count(): p.click('text=Editar dados')
        p.wait_for_timeout(300)
        confere(p.locator('#edVal').count() == 1 and p.locator('#edEmol').count() == 0 and p.locator('#edRegs').count() == 0, 'campos do escrevente errados')
        confere('Emolumentos' not in p.inner_text('body'), 'a palavra Emolumentos não deveria aparecer para o escrevente')
        p.keyboard.press('Escape'); p.click('[data-view=graficos]'); p.wait_for_timeout(800)
        confere('só Oficial' not in p.inner_text('.gr-page') and 'Valor por fase' not in p.inner_text('.gr-page'), 'gráficos de valor vazaram para o escrevente')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)

@teste
def graficos_e_auditoria_do_oficial(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('[data-view=graficos]'); p.wait_for_timeout(900)
        t = p.inner_text('.gr-page')
        for trecho in ('Processos por fase', 'Em andamento por escrevente', 'Entradas e conclusões por mês', 'Tempo médio em cada fase'):
            confere(trecho in t, 'faltou no gráfico: ' + trecho)
        p.click('[data-view=auditoria]'); p.wait_for_timeout(900)
        confere('registro' in p.inner_text('#auCount') and p.locator('#auLista tbody tr').count() >= 2, 'a auditoria não listou os eventos')
        p.select_option('#auGrupo', 'fases'); p.wait_for_timeout(200)
        confere(p.locator('#auLista tbody tr').count() == 1, 'filtro por tipo não funcionou')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)

def main():
    falhas = 0
    with Servidor() as srv:
        for t in TESTES:
            try:
                t(srv); print('PASSOU  ', t.__name__)
            except BaseException as e:
                falhas += 1; print('FALHOU  ', t.__name__, '->', e)
                if os.environ.get('TRACE'): traceback.print_exc()
    print('\n%d testes, %d falha(s)' % (len(TESTES), falhas))
    sys.exit(1 if falhas else 0)

main()
