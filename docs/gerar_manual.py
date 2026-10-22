#!/usr/bin/env python3
"""Gera docs/Manual-Escreventes.pdf. Atualize VERSAO/DATA e o texto sempre que o painel mudar."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether

VERSAO = "1.6"
DATA = "22/10/2026"
AQUI = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(AQUI, "..", "assets", "logo.jpg")
SAIDA = os.path.join(AQUI, "Manual-Escreventes.pdf")

VERDE = colors.HexColor("#0F3B2D"); OURO = colors.HexColor("#A8751F"); CINZA = colors.HexColor("#465850"); FUNDO = colors.HexColor("#F5F7F3")

base = ParagraphStyle("b", fontName="Helvetica", fontSize=9.6, leading=13, textColor=colors.HexColor("#13261F"))
h1 = ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=18, leading=21, textColor=VERDE)
sub = ParagraphStyle("sub", parent=base, fontSize=9.5, textColor=CINZA)
h2 = ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=11.5, leading=14, textColor=VERDE, spaceBefore=9, spaceAfter=3)
li = ParagraphStyle("li", parent=base, leftIndent=11, bulletIndent=1, spaceAfter=1.5)
aviso = ParagraphStyle("av", parent=base, fontSize=9.4, leading=12.5)

def P(t, s=base): return Paragraph(t, s)
def L(itens): return [Paragraph(t, li, bulletText="•") for t in itens]
def sec(t, itens): return KeepTogether([P(t, h2)] + L(itens))

URL = "acompanhamento.riitarare.com.br"

story = []
cab = Table([[Image(LOGO, width=22*mm, height=22*mm * 0.62) if os.path.exists(LOGO) else "",
              [P("Visualizador de Usucapião", h1), P("Guia rápido para escreventes · Registro de Imóveis de Itararé", sub)]]],
            colWidths=[28*mm, None])
cab.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, 0), 1.2, OURO), ("BOTTOMPADDING", (0, 0), (-1, 0), 7)]))
story += [cab, Spacer(1, 4)]

story.append(sec("1. Entrar no painel", [
    f"Endereço: <b>{URL}/painel</b> (funciona no computador e no celular).",
    "Primeiro acesso: <b>Criar conta</b> com o seu nome (como aparece nos cartões) e e-mail. Confirme o e-mail pelo link recebido e <b>aguarde o Oficial aprovar</b> o seu acesso.",
    "Esqueceu a senha? Use <b>Esqueci a senha</b>. Não compartilhe a sua senha.",
]))
story.append(sec("2. O quadro", [
    "Cada <b>coluna</b> é uma fase; cada <b>cartão</b> é um processo. Clique no cartão para abrir os detalhes.",
    "<b>Arraste o cartão</b> para outra coluna para mudar de fase. Abre uma janela: escreva uma <b>mensagem ao requerente</b> (opcional; há mensagens prontas), informe o prazo se for edital, e confirme. No celular, segure o cartão um instante antes de arrastar.",
    "Arrastar dentro da mesma coluna só muda a ordem, sem avisar ninguém.",
    "Acima do quadro: filtro por escrevente e <b>filtros rápidos</b> (só os meus, parados há 15+ dias, pedem atenção, dados a preencher). Dá para <b>salvar</b> um filtro seu. Cartões com borda amarela ou vermelha estão parados ou com prazo perto do fim.",
    "Se errar ao mover, use <b>Desfazer</b> (aparece por alguns segundos). O e-mail só sai cerca de 1 minuto depois, por isso dá tempo.",
]))
story.append(sec("3. Novo processo", [
    "Botão <b>Novo processo</b>. Protocolo: só números (ex.: 52474). Preencha nome e e-mail do requerente; outros requerentes entram em “Outros e-mails”.",
    "Opcional: imóvel, <b>referência curta</b> (o advogado vê, ex.: “Chácara Santa Luzia”), matrícula, tipo de usucapião, data da prenotação, advogado.",
    "Em <b>Com quem está o processo</b>, escolha quem cuida do caso, mesmo que não seja você ou que a pessoa não tenha conta. O requerente recebe um e-mail de confirmação.",
]))
story.append(sec("4. Dentro do cartão", [
    "<b>Com quem está:</b> troque no cartão (clique no nome embaixo) ou nos detalhes. Dá para adicionar pessoa sem conta.",
    "<b>Observação no andamento:</b> escreve na linha do tempo do cliente sem mudar de fase (ex.: “Edital publicado, prazo até 20/12”). E-mail só se marcar a caixa.",
    "<b>Prazos:</b> adicione intimação, edital, exigência ou outro, com data e descrição curta. O cliente vê os prazos em aberto. Marque <b>Cumprido</b> ou <b>Cancelar</b> quando acabar. A aba <b>Prazos</b> mostra todos os vencimentos.",
    "<b>Dados:</b> dá para corrigir nome, e-mails, imóvel e demais campos. <b>Mudar o protocolo</b> é possível, mas pede confirmação: o cliente passa a consultar pelo número novo e links de e-mails antigos deixam de funcionar.",
    "<b>Notas internas:</b> só a equipe vê. O <b>histórico do andamento</b> não se edita; se errar, registre uma nova observação. Toda alteração de dados fica gravada com o nome de quem fez.",
]))
story.append(sec("5. E-mails automáticos", [
    "A cada mudança de fase, prazo ou observação marcada, o requerente (e os outros e-mails do caso) recebe um aviso com o link. O advogado vinculado recebe <b>cópia</b>. Saem em cerca de 1 minuto.",
    "O <b>resumo diário</b> por e-mail (às 8h, dias úteis, com os seus processos parados ou com prazo perto) vem <b>desligado</b>. Para receber, ative em <b>Minha conta</b>.",
    "Processos em “Exigências” há mais de 15 dias geram um lembrete automático ao requerente.",
]))
story.append(sec("6. Advogados com vários processos", [
    "Aba <b>Advogados</b>: cadastre o nome (e e-mail, se quiser que receba cópias). O sistema gera um <b>código fixo</b>, mostrado <b>uma única vez</b>: copie e entregue ao advogado. Se perder, gere outro.",
    f"Ele digita o código em <b>{URL}</b>, em “Tenho um código de advogado”, e acompanha todos de uma vez.",
    "Vincule o advogado em cada processo (campo “Advogado / representante”).",
    "<b>Sem código:</b> se o advogado tiver e-mail cadastrado, ele pode informar só o e-mail, no campo logo abaixo do protocolo, e ver todos os processos vinculados na hora. Quem souber o e-mail cadastrado vê a lista, então use um e-mail que só o advogado conheça e mantenha-o correto.",
]))
story.append(sec("7. Ganhar tempo", [
    "<b>Buscar em tudo:</b> aperte <b>/</b> (ou Ctrl+K) em qualquer tela. Outros atalhos: <b>N</b> novo processo, <b>M</b> só os meus, <b>P</b> prazos, <b>?</b> ajuda.",
    "<b>Selecionar vários:</b> marque cartões e mude o responsável ou a fase de todos de uma vez (com opção de Desfazer).",
    "<b>Importar planilha:</b> botão no quadro. Aceita CSV ou células coladas do Excel (baixe o modelo). Só o protocolo é obrigatório; o que faltar fica como <b>“Dados a preencher”</b>. Os e-mails de aviso vêm desmarcados.",
    "<b>Aparência:</b> botões no topo (tema claro/escuro e tamanho da letra). <b>?</b> reabre o tour de boas-vindas.",
]))
story.append(sec("8. O cliente consulta assim", [
    f"Em <b>{URL}</b>, digita só o <b>número do protocolo</b> e vê a linha do tempo, os prazos e as mensagens, com a explicação “o que isso significa” e “o que fazer agora” (você edita esses textos em Ajustes → Fases). Nome, e-mail e imóvel nunca aparecem ali.",
    "Ele pode <b>imprimir ou salvar em PDF</b> o andamento e <b>lembrar o protocolo</b> no aparelho.",
]))

av = Table([[P("<b>Cuidados importantes</b><br/>"
               "• Mensagens, observações e descrições de prazo são <b>públicas</b>: quem tem o protocolo as lê. <b>Não escreva</b> CPF, endereço, telefone nem nome de terceiros. Use as notas internas para isso.<br/>"
               "• Confira o e-mail do requerente: é por ele que o aviso chega.<br/>"
               "• Só o <b>Oficial</b> apaga processos. Se precisar, peça a ele.<br/>"
               "• Recomendamos ativar a <b>verificação em duas etapas</b> em Minha conta (aplicativo autenticador no celular).<br/>"
               "• Dados dos requerentes são pessoais (LGPD): não exporte nem compartilhe fora do serviço.", aviso)]], colWidths=[None])
av.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), FUNDO), ("BOX", (0, 0), (-1, -1), 0.8, OURO), ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
story += [Spacer(1, 8), av]

def rodape(c, d):
    c.saveState(); c.setFont("Helvetica", 7.8); c.setFillColor(CINZA)
    c.drawString(18*mm, 10*mm, f"Visualizador de Usucapião · Guia rápido · versão {VERSAO} · atualizado em {DATA} · dúvidas: fale com o Oficial")
    c.drawRightString(A4[0] - 18*mm, 10*mm, f"{d.page}")
    c.restoreState()

doc = SimpleDocTemplate(SAIDA, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=14*mm, bottomMargin=17*mm,
                        title="Visualizador de Usucapião - Guia rápido para escreventes", author="Registro de Imóveis de Itararé")
doc.build(story, onFirstPage=rodape, onLaterPages=rodape)
print("ok", SAIDA)
