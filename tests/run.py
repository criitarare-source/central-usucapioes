#!/usr/bin/env python3
"""Roda os testes do site: python3 tests/run.py   (precisa de: pip install playwright && playwright install chromium; cd tests && npm ci)"""
import os, re, subprocess, sys, traceback
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

@teste
def consulta_mostra_o_nome_do_requerente(srv):
    with Navegador(srv, 'oficial', 420, 900) as n:
        n.page.goto(srv.url + '/index.html?p=52474'); n.page.wait_for_timeout(1000)
        confere('João da S. R.' in n.page.inner_text('.res-h'), 'o nome do requerente não apareceu na consulta')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)

@teste
def novo_processo_exige_advogado_mas_nao_o_email(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('#bNew'); p.wait_for_timeout(300)
        p.fill('#nwProto', '60001'); p.fill('#nwNome', 'Fulano de Tal')
        p.click('#nwOk'); p.wait_for_timeout(200)
        confere('advogado' in p.inner_text('#nwErr').lower(), 'deveria exigir o advogado: ' + p.inner_text('#nwErr'))
        confere(not [c for c in n.calls if c[0] == 'novo_processo'], 'criou sem advogado')
        p.select_option('#nwAdv', '1'); p.click('#nwOk'); p.wait_for_timeout(500)
        corpo = [c for c in n.calls if c[0] == 'novo_processo'][-1][1]
        confere('"p_email":null' in corpo.replace(' ', '') and '"p_advogado":1' in corpo.replace(' ', ''), 'payload errado: ' + corpo[:300])

@teste
def card_sem_email_mostra_selo(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        confere('Sem e-mail' in p.inner_text('.card[data-id="4"]'), 'faltou o selo “Sem e-mail”')
        confere('Sem e-mail' not in p.inner_text('.card[data-id="1"]'), 'selo no card que tem e-mail')

@teste
def graficos_mostram_emolumentos_dos_concluidos(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('[data-view=graficos]'); p.wait_for_timeout(900)
        t = p.inner_text('.gr-page')
        confere('Emolumentos dos concluídos' in t and 'estimado' in t.lower(), 'faltou a parte dos concluídos')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)

@teste
def link_permanente_do_advogado_abre_a_lista(srv):
    with Navegador(srv, 'oficial', 420, 900) as n:
        n.page.goto(srv.url + '/index.html?acesso=tokenvalido'); n.page.wait_for_timeout(1000)
        t = n.page.inner_text('#out')
        confere('área do advogado' in t.lower() and 'João da S. R.' in t, 'o link permanente não abriu a lista: ' + t[:200])
        n.page.goto(srv.url + '/index.html?acesso=outro'); n.page.wait_for_timeout(800)
        confere('não é mais válido' in n.page.inner_text('#out'), 'link inválido deveria ser recusado')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)

@teste
def oficial_envia_link_ao_advogado_e_escrevente_nao_ve_botao(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('[data-view=advogados]'); p.wait_for_timeout(700)
        confere('Enviar link a quem ainda não recebeu' in p.inner_text('.page'), 'faltou o botão de envio em lote')
        p.click('[data-al]'); p.wait_for_timeout(300); p.click('#cfOk'); p.wait_for_timeout(600)
        confere([c for c in n.calls if c[0] == 'enviar_link_advogado'], 'não chamou enviar_link_advogado')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)
    with Navegador(srv, 'escrevente') as n:
        n.entrar(); p = n.page
        p.click('[data-view=advogados]'); p.wait_for_timeout(700)
        confere('Enviar link' not in p.inner_text('.page'), 'escrevente não deveria ver o envio de link')

@teste
def duplicidade_avisa_protocolo_e_nome(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('#bNew'); p.wait_for_timeout(300)
        p.fill('#nwProto', '52474'); p.fill('#nwNome', 'Outro'); p.select_option('#nwAdv', '1'); p.click('#nwOk'); p.wait_for_timeout(200)
        confere('Já existe o protocolo 52474' in p.inner_text('#nwErr'), 'não avisou protocolo repetido')
        p.fill('#nwProto', '60002'); p.fill('#nwNome', 'joão'); p.click('#nwOk'); p.wait_for_timeout(400)
        confere('este nome' in p.inner_text('#dGen'), 'não avisou nome repetido')
        confere(not [c for c in n.calls if c[0] == 'novo_processo'], 'criou antes de confirmar')
        p.click('#cfOk'); p.wait_for_timeout(500)
        confere([c for c in n.calls if c[0] == 'novo_processo'], 'não criou depois de confirmar')

@teste
def cadastro_rapido_de_advogado_no_novo_processo(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('#bNew'); p.wait_for_timeout(300)
        p.select_option('#nwAdv', '__novo'); p.wait_for_timeout(300)
        p.fill('#qaNome', 'Dra. Nova Advogada'); p.click('#qaOk'); p.wait_for_timeout(900)
        confere([c for c in n.calls if c[0] == 'criar_advogado'], 'não chamou criar_advogado')
        confere(p.input_value('#nwAdv') == '2', 'o novo advogado não ficou selecionado')
        confere('ABCD' in p.inner_text('#dGen'), 'não mostrou o código do advogado')

@teste
def etiquetas_salvas_e_mostradas_no_card(srv):
    with Navegador(srv, 'escrevente') as n:
        n.entrar(); p = n.page
        p.click('.card[data-id="3"] .nome'); p.wait_for_timeout(500)
        if p.locator('text=Editar dados').count(): p.click('text=Editar dados')
        p.wait_for_timeout(300)
        p.fill('#edTags', 'aguardando perícia, retorno do INCRA, aguardando perícia'); p.click('#edSave'); p.wait_for_timeout(600)
        corpo = [c for c in n.calls if c[0] == 'PATCH processos'][-1][1]
        confere(__import__('json').loads(corpo).get('etiquetas') == ['aguardando perícia', 'retorno do INCRA'], 'etiquetas erradas: ' + corpo[:300])

@teste
def mensagem_pronta_preenche_marcadores(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('.card[data-id="1"] .nome'); p.wait_for_timeout(500)
        p.select_option('#dtFase', '2'); p.wait_for_timeout(400)
        p.select_option('#mvPad', '1'); p.wait_for_timeout(300)
        t = p.input_value('#mvMsg')
        confere(re.match(r'^Olá João, protocolo 52474 na etapa Qualificação\. Prazo \d\d/\d\d/\d{4}\. Adv Dr\. Fulano\.$', t), 'marcadores não preenchidos: ' + t)

@teste
def mensagem_pronta_sem_dado_some_sem_colchetes(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('.card[data-id="3"] .nome'); p.wait_for_timeout(500)
        p.select_option('#dtFase', '2'); p.wait_for_timeout(400)
        p.select_option('#mvPad', '1'); p.wait_for_timeout(300)
        t = p.input_value('#mvMsg')
        confere('[' not in t and '{' not in t and ' .' not in t and '  ' not in t and 'Prazo.' in t, 'texto sem dado deveria ficar limpo: ' + t)

@teste
def desfazer_em_lote_lista_e_desfaz(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('#bUndo'); p.wait_for_timeout(500)
        confere(p.locator('#dlBody input[data-h]').count() == 2 and p.locator('#dlBody input[data-h]:disabled').count() == 1, 'lista de movimentos errada')
        confere('e-mail já foi enviado' in p.inner_text('#dlBody'), 'não explicou por que não dá para desfazer')
        p.check('input[data-h="7"]'); p.click('#dlOk'); p.wait_for_timeout(600)
        corpo = [c for c in n.calls if c[0] == 'desfazer_movimento'][-1][1]
        confere('"p_hist_id":7' in corpo.replace(' ', ''), 'desfazer errado: ' + corpo)

@teste
def agenda_mostra_prazos_e_abre_processo(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('[data-view=agenda]'); p.wait_for_timeout(500)
        confere(p.locator('.ag-chip').count() >= 1, 'a agenda não mostrou o prazo')
        p.click('#agModo'); p.wait_for_timeout(300)
        confere(p.locator('.ag-mes').count() == 1, 'visão do mês não abriu')
        p.click('.ag-chip >> nth=0'); p.wait_for_timeout(600)
        confere('52474' in p.inner_text('#dDetail'), 'o clique não abriu o processo')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)

@teste
def ranking_por_escrevente_e_aba_de_acessos(srv):
    with Navegador(srv, 'oficial') as n:
        n.entrar(); p = n.page
        p.click('[data-view=graficos]'); p.wait_for_timeout(900)
        t = p.inner_text('#grEquipe')
        confere('Maria Silva' in t and '4,5 d' in t, 'ranking não apareceu: ' + t[:200])
        confere('9,0' not in t, 'célula com poucos dados deveria ficar em branco')
        p.click('[data-view=acessos]'); p.wait_for_timeout(700)
        confere(p.locator('#acRes tbody tr').count() == 2, 'deveria listar só os 2 acessos que encontraram algo')
        confere('Dr. Fulano' in p.inner_text('#acRes') and 'iPhone' in p.inner_text('#acRes'), 'faltou advogado ou aparelho')
        p.select_option('#acModo', 'visitantes'); p.wait_for_timeout(300)
        confere(p.locator('#acRes tbody tr').count() == 2, 'visão por visitante errada')
        confere(not n.erros, 'erros de JavaScript: %s' % n.erros)
    with Navegador(srv, 'escrevente') as n:
        n.entrar(); p = n.page
        confere(p.locator('[data-view=acessos]').count() == 0, 'escrevente não deveria ver a aba Acessos')
        p.click('[data-view=graficos]'); p.wait_for_timeout(700)
        confere(p.locator('#grEquipe').count() == 0, 'escrevente não deveria ver o ranking')

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
