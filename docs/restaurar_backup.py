#!/usr/bin/env python3
"""Gera o SQL para restaurar o backup semanal (backup-completo-AAAA-MM-DD.json) no Supabase.

Uso:   python3 docs/restaurar_backup.py backup-completo-2026-11-02.json > restaurar.sql
       (opções: --schema public  --sem-auditoria)
Depois cole o conteúdo de restaurar.sql no Supabase: SQL Editor -> New query -> Run.

- Só INSERE o que falta (on conflict do nothing): não apaga nem sobrescreve nada que já exista.
- Advogados voltam SEM código (o backup não guarda códigos): gere um novo em Advogados > "Gerar novo código".
- Contas da equipe (perfis) dependem do login do Supabase Auth e NÃO são restauradas aqui: cada pessoa cria a conta
  de novo e o Oficial aprova. Os processos que apontavam para elas ficam sem responsável até reatribuir.
"""
import json, sys

ORDEM = ['fases', 'advogados', 'pessoas_externas', 'processos', 'mensagens_padrao', 'historico', 'prazos', 'auditoria']
IDENTIDADE = ['advogados', 'pessoas_externas', 'processos', 'mensagens_padrao', 'historico', 'prazos', 'auditoria']

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    esq = 'public'
    if '--schema' in sys.argv:
        esq = sys.argv[sys.argv.index('--schema') + 1]
        args = [a for a in args if a != esq]
    if not args:
        sys.exit(__doc__)
    dados = json.load(open(args[0], encoding='utf-8'))
    tabs = dados['tabelas']
    out = ['-- Restauração gerada a partir de %s (gerado em %s)' % (args[0], dados.get('gerado_em', '?')), 'begin;']
    for t in ORDEM:
        if t == 'auditoria' and '--sem-auditoria' in sys.argv:
            continue
        linhas = tabs.get(t) or []
        if not linhas:
            continue
        lit = json.dumps(linhas, ensure_ascii=False)
        assert '$bk$' not in lit
        fonte = "jsonb_populate_recordset(null::%s.%s, $bk$%s$bk$::jsonb)" % (esq, t, lit)
        if t == 'advogados':
            out.append("insert into %s.advogados (id, nome, email, copia_email, ativo, criado_em, codigo_hash, codigo_final) overriding system value\n"
                       "select id, nome, email, coalesce(copia_email, true), coalesce(ativo, true), coalesce(criado_em, now()),\n"
                       "       encode(sha256(convert_to(gen_random_uuid()::text, 'utf8')), 'hex'), '----'\n"
                       "from %s on conflict (id) do nothing;" % (esq, fonte))
        else:
            sobre = ' overriding system value' if t in IDENTIDADE else ''
            out.append("insert into %s.%s%s select * from %s on conflict do nothing;" % (esq, t, sobre, fonte))
    for t in IDENTIDADE:
        if tabs.get(t) and not (t == 'auditoria' and '--sem-auditoria' in sys.argv):
            out.append("select setval(pg_get_serial_sequence('%s.%s', 'id'), greatest((select coalesce(max(id), 1) from %s.%s), 1));" % (esq, t, esq, t))
    out.append('commit;')
    print('\n'.join(out))

main()
