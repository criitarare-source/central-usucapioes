# Visualizador de Usucapiões

Registro de Imóveis de Itararé.

Site com duas partes:

- **`/`**: página pública. O cliente digita o número do protocolo e vê a linha do tempo do pedido.
- **`/painel`**: painel interno dos escreventes, em quadro Kanban. Exige login e aprovação do Oficial.

Os dados ficam no Supabase (projeto `central-usucapioes-sp`, região São Paulo).
O site é estático (HTML, CSS e JavaScript) e não precisa de build.

## Como publicar na Vercel

1. Em vercel.com, entre com a conta do GitHub `criitarare-source`.
2. Clique em **Add New → Project** e escolha o repositório `central-usucapioes`.
3. Não mude nada nas configurações (Framework Preset: *Other*; sem comando de build).
4. Clique em **Deploy**. O site abre em um endereço como `central-usucapioes.vercel.app`.

## Depois de publicar: configurar o login (Supabase)

No painel do Supabase, em **Authentication → URL Configuration**:

- **Site URL:** o endereço do site na Vercel.
- **Redirect URLs:** adicione `https://SEU-ENDERECO/painel`.

Sem isso, os links de confirmação de e-mail e de recuperação de senha não voltam para o painel.

## Primeiro acesso

1. Abra `/painel` e clique em **Criar conta** com o e-mail `cri.itarare@gmail.com`.
2. Confirme o e-mail pelo link recebido. Esta conta já nasce como **Oficial**, aprovada.
3. Cada escrevente cria a própria conta e aparece em **Equipe** para o Oficial aprovar.

Crie a conta do Oficial **antes** de divulgar o endereço do painel.

## Subdomínio do cartório (quando o site for assinado)

Na Vercel: **Settings → Domains** e adicione, por exemplo, `acompanhamento.seucartorio.com.br`.
A Vercel mostra o registro DNS (CNAME) que quem administra o domínio deve criar.
Depois troque a *Site URL* no Supabase para o novo endereço.

## Estrutura

```
index.html          página pública do cliente
painel/index.html   painel dos escreventes
assets/             estilos, scripts, logo e configuração do Supabase
vercel.json         ajustes de endereço e cabeçalhos de segurança
```

## Segurança

- A chave em `assets/config.js` é a chave pública (*publishable*). Ela foi feita para ficar no navegador.
- O acesso aos dados é controlado no banco (RLS). Conta sem aprovação não vê nada.
- A consulta pública devolve só o andamento: fases, datas, mensagens ao cliente e prazo do edital.
  Nome, e-mail, imóvel e notas internas nunca saem do painel.
- A consulta pública tem limite de consultas por minuto, contra tentativa de varrer protocolos.
- Nunca coloque senhas nem a chave `service_role` neste repositório.

## E-mails automáticos

Cada mudança de fase ou de prazo entra numa fila (tabela `emails_enviados`).
A cada minuto, o agendador do banco (pg_cron) aciona a função `enviar-emails`
(código em `supabase/functions/enviar-emails/`), que envia pelo Resend.
O Oficial acompanha tudo na aba **E-mails** do painel.

Configurações da função (Supabase → Edge Functions → Secrets):

| Nome | Para quê |
|---|---|
| `RESEND_API_KEY` | Chave do Resend. Sem ela, os e-mails ficam na fila. |
| `EMAIL_FROM` | Remetente, por exemplo `Registro de Imóveis de Itararé <usucapiao@seucartorio.com.br>`. Só funciona depois de verificar o domínio no Resend. Sem este valor, usa o remetente de teste do Resend, que só envia ao dono da conta Resend. |
| `SITE_URL` | Endereço do site, para o link do e-mail. Se não for definido, usa `https://central-usucapioes.vercel.app`. |

## Recursos do painel

- **Dados editáveis:** Oficial e escreventes editam nome, e-mails (até 5 adicionais), imóvel, matrícula, tipo, data de prenotação, referência, advogado e **protocolo** (a troca pede confirmação). Toda alteração entra na trilha de auditoria (aba Ajustes → Registro de alterações e no cartão).
- **Com quem está o caso:** qualquer escrevente aprovado pode ser indicado como responsável (no cartão, no novo processo, no detalhe). O Oficial pode passar todos os processos de um escrevente para outro (aba Equipe).
- **Advogados:** aba *Advogados*. Cada um tem um código fixo de 12 caracteres (guardado só como hash, mostrado uma vez). Na página do cliente, o campo de e-mail (ou “Tenho um código de advogado”) lista os processos dele (protocolo, etapa e referência curta). O advogado recebe cópia dos e-mails se tiver e-mail cadastrado.
- **Ajustes (Oficial):** nomes e textos das etapas, ocultar etapas sem uso, mensagens prontas, exportar CSV, apagar todos os processos, registro de alterações.
- **Apagar:** um processo (Oficial, botão no cartão, digitando o protocolo) ou todos (Oficial, digitando APAGAR TUDO).
- **Resumo diário:** e-mail às 8h (dias úteis) ao responsável com processos parados há mais de 30 dias ou com prazo de edital perto do fim. Vem **desligado por padrão**; cada um liga em *Minha conta*. Agendado por pg_cron (`resumo-diario-usucapioes`).
- **Verificação em duas etapas (TOTP):** em *Minha conta*. Quando ativada, o banco só libera dados a sessões verificadas.

## SQL aplicado manualmente

`supabase/manual/08_consulta_advogado_e_limpar_quadro.sql` precisa ser colado no SQL Editor do Supabase (o conector automático bloqueia funções públicas e comandos de exclusão).

## Prazos, observações e responsáveis sem conta

- **Com quem está o processo:** pode ser um escrevente com conta ou uma "pessoa sem conta no painel" (cadastrada na hora, em qualquer seletor, ou na aba Equipe). Quem tiver e-mail recebe o resumo diário.
- **Observação no andamento:** o botão "Registrar no andamento" (no cartão aberto) grava uma observação na linha do tempo do cliente, com aviso opcional por e-mail. O histórico é imutável: correções entram como novas observações.
- **Prazos:** cada processo pode ter vários prazos em aberto (intimação, edital, exigência, outro), em qualquer fase, com vencimento e descrição. O cliente vê os prazos em aberto. Marque como cumprido ou cancele. O prazo de edital é encerrado automaticamente ao sair da fase de edital, e todos os prazos ao concluir/encerrar o processo. A aba **Prazos** lista todos os vencimentos.
- **Lembrete em exigência:** todo dia, às 8h30, processos parados em "Exigências" há mais de 15 dias recebem um e-mail de lembrete (repetido a cada 15 dias). Função `gerar_lembretes` (pg_cron `lembretes-exigencia-usucapioes`).
- **Backup semanal por e-mail:** toda segunda, às 7h (Brasília), o CSV completo é enviado **só** ao e-mail do cartório (`BACKUP_EMAIL`, se definido como segredo da função; senão o e-mail do Oficial). Cron `backup-semanal-usucapioes` (`0 10 * * 1`, modo `backup` da função `enviar-emails`), no máximo 1 vez a cada 100 horas (`liberar_execucao`). Não vai a escreventes. Se o envio falhar, a trava é liberada para nova tentativa. O modo `resumo` também tem trava de 20 horas.
- **Área do advogado:** os processos abrem todos na mesma tela (podem ficar vários abertos), com contagem por situação, filtros e busca.

`supabase/manual/09_consultas_publicas_v2.sql` atualiza as duas consultas públicas (já aplicado).

## Manual dos escreventes

`docs/Manual-Escreventes.pdf` (guia rápido de 2 páginas), gerado por `docs/gerar_manual.py`. **Sempre que uma função do painel mudar, atualize o texto e os campos `VERSAO` e `DATA` no script e rode `python3 docs/gerar_manual.py`**, depois envie o PDF novo à equipe.

## Melhorias de uso (v1.2)

- **Painel:** filtros rápidos e filtros salvos (neste navegador), selos amarelo/vermelho nos cartões, aviso "Dados a preencher", seleção em lote (atribuir/mover), **Desfazer** após mover de fase ou atribuir, importação de planilha (CSV ou colar do Excel; botão "Importar planilha"), busca global (`/` ou Ctrl+K) e atalhos (`N`, `M`, `P`, `Q`, `?`), tour no primeiro acesso, prévia do e-mail também em observações e prazos, tema claro/escuro e tamanho da letra (`assets/prefs.js`).
- **Consulta pública:** "O que isso significa" e "O que você precisa fazer agora" por fase (colunas `fases.significado` e `fases.acao`, editáveis em Ajustes → Fases), imprimir/salvar em PDF, copiar link, lembrar o protocolo no aparelho, `manifest.webmanifest` (adicionar à tela inicial), tema e letra.
- **E-mails com atraso de 45 s:** `emails_enviados.liberar_em` (gatilho `private.atrasar_email`) e a função `reservar_emails_v4` dão tempo para o Desfazer. A função de e-mails usa a v4.
- **SQL manual:** `supabase/manual/10_...sql` (registro do que foi aplicado automaticamente) e `11_desfazer_movimento.sql` (**precisa ser colado no SQL Editor**: o conector bloqueia funções que apagam dados). Sem o arquivo 11, o botão Desfazer avisa que ainda não foi ativado.
- **Advogado entra só com o e-mail:** na consulta pública, o advogado informa o e-mail cadastrado e vê direto todos os processos vinculados (função `consulta_advogado_email`, limite de 6 consultas por minuto por conexão; sem código e sem prazo de validade). Decisão do cartório: quem souber o e-mail cadastrado vê protocolos, etapas e mensagens públicas desse advogado (nunca nomes de requerentes). O mecanismo de link por e-mail (`supabase/manual/12_...sql`, `advogado_acessos`, modo `acesso` da função de e-mails) foi criado e depois **desativado** (execução revogada); não é usado.

## Aba Gráficos
Painel com processos por fase, carga por escrevente, entradas/conclusões por mês, tempo médio por fase e (só Oficial) valor por fase. Os dois últimos gráficos de série vêm da função `public.estatisticas()` (só números agregados, exige usuário aprovado).

## Emolumentos, ocultar valores e tema
- `processos.emolumentos` (R$): só o Oficial vê e edita; aparece no cartão apenas quando preenchido.
- Botão **Valores** (só Oficial) oculta Valor e Emolumentos nas telas; preferência salva no aparelho.
- Tema padrão: claro (chave `central_prefs2`, que reinicia escolhas antigas).
- Carga dos usucapiões concluídos (Regwin, 27/10/2026): 12 processos na fase Concluído, sem e-mails.
