# Como restaurar um backup

Toda segunda-feira, às 7h, o cartório recebe por e-mail dois arquivos:

- `usucapioes-AAAA-MM-DD.csv`: planilha legível dos processos (abre no Excel).
- `backup-completo-AAAA-MM-DD.json`: cópia completa para restaurar (processos, histórico, prazos, advogados, equipe, mensagens padrão, auditoria).

## Restaurar

1. Salve o `backup-completo-….json` numa pasta.
2. Gere o SQL: `python3 docs/restaurar_backup.py backup-completo-AAAA-MM-DD.json > restaurar.sql`
3. No Supabase: **SQL Editor → New query**, cole o conteúdo de `restaurar.sql` e clique em **Run**.

O script só **insere** o que está faltando (não apaga nem sobrescreve). Pode ser rodado de novo sem duplicar.

## O que não volta sozinho

- **Códigos dos advogados:** o backup não os guarda por segurança. Em *Advogados*, use "Gerar novo código" e entregue ao advogado.
- **Contas da equipe:** dependem do login do Supabase. Cada pessoa cria a conta de novo e o Oficial aprova; depois é preciso reatribuir os responsáveis.
- **Senhas:** nunca fazem parte do backup.

## Cuidados (LGPD)

Os arquivos têm dados pessoais. Guarde em local protegido, não encaminhe e apague os e-mails antigos que não precisar manter.
