-- Etiquetas livres, registro de acessos à consulta, estatísticas por escrevente e desfazer movimentos ampliado.

-- 1) Etiquetas
create or replace function private.etiquetas_ok(e text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(e) <= 8, true) and coalesce((select bool_and(char_length(x) between 1 and 30) from unnest(e) x), true);
$$;
alter table public.processos add column if not exists etiquetas text[] not null default '{}';
alter table public.processos drop constraint if exists processos_etiquetas_ok;
alter table public.processos add constraint processos_etiquetas_ok check (private.etiquetas_ok(etiquetas));

do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('private.auditar_processo()'::regprocedure);
  d2 := replace(d, $a$'registros'];$a$, $a$'registros','etiquetas'];$a$);
  if d2 = d then raise exception 'auditoria: trecho não encontrado'; end if;
  execute d2;
end $$;

-- 2) Registro de acessos às consultas públicas (guardado 12 meses)
create table if not exists public.acessos_consulta (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  via text not null check (via in ('protocolo', 'email', 'codigo', 'link', 'link_permanente')),
  alvo text,
  advogado_id bigint references public.advogados(id) on delete set null,
  processo_id bigint references public.processos(id) on delete set null,
  ok boolean not null,
  ip text,
  agente text
);
create index if not exists acessos_consulta_em on public.acessos_consulta (em desc);
alter table public.acessos_consulta enable row level security;
revoke all on public.acessos_consulta from anon, authenticated;

create or replace function private.registrar_acesso(p_via text, p_alvo text, p_adv bigint, p_proc bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_h json; v_ip text; v_ag text;
begin
  begin v_h := current_setting('request.headers', true)::json; exception when others then v_h := null; end;
  v_ip := nullif(trim(split_part(coalesce(v_h->>'x-forwarded-for', ''), ',', 1)), '');
  v_ag := left(v_h->>'user-agent', 300);
  insert into public.acessos_consulta (via, alvo, advogado_id, processo_id, ok, ip, agente)
  values (p_via, p_alvo, p_adv, p_proc, p_ok, v_ip, v_ag);
  if random() < 0.01 then delete from public.acessos_consulta where em < now() - interval '12 months'; end if;
end $$;
revoke all on function private.registrar_acesso(text, text, bigint, bigint, boolean) from public, anon, authenticated;

do $$
declare d text; d2 text; f text; via text;
begin
  -- consulta por protocolo
  d := pg_get_functiondef('public.consulta_publica(text)'::regprocedure);
  d2 := replace(d, 'if not found then return null; end if;', $a$if not found then perform private.registrar_acesso('protocolo', v_prot, null, null, false); return null; end if;$a$);
  if d2 = d then raise exception 'consulta_publica: not found'; end if;
  d := d2;
  d2 := replace(d, 'return private.dados_publicos(v_proc) ||', $a$perform private.registrar_acesso('protocolo', v_prot, null, v_proc.id, true); return private.dados_publicos(v_proc) ||$a$);
  if d2 = d then raise exception 'consulta_publica: return'; end if;
  execute d2;
  -- consultas do advogado
  foreach f in array array['consulta_advogado(text)', 'consulta_advogado_email(text)', 'consulta_advogado_link(text)', 'consulta_advogado_perm(text)'] loop
    via := case f when 'consulta_advogado(text)' then 'codigo' when 'consulta_advogado_email(text)' then 'email' when 'consulta_advogado_link(text)' then 'link' else 'link_permanente' end;
    d := pg_get_functiondef(('public.' || f)::regprocedure);
    d2 := replace(d, 'if not found then return null; end if;', format($a$if not found then perform private.registrar_acesso(%L, null, null, null, false); return null; end if;$a$, via));
    if d2 = d then raise exception '%: not found', f; end if;
    d := d2;
    d2 := replace(d, 'return jsonb_build_object(', format($a$perform private.registrar_acesso(%L, null, v_adv.id, null, true); return jsonb_build_object($a$, via));
    if d2 = d then raise exception '%: return', f; end if;
    execute d2;
  end loop;
end $$;

-- Oficial: lista dos acessos
create or replace function public.listar_acessos(p_dias int default 30, p_limite int default 2000)
returns table(id bigint, em timestamptz, via text, ok boolean, ip text, agente text, protocolo text, requerente text, advogado text)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_oficial() then raise exception 'Só o Oficial.'; end if;
  return query
    select a.id, a.em, a.via, a.ok, a.ip, a.agente, coalesce(p.protocolo, case when a.via = 'protocolo' then a.alvo end), p.requerente_nome, v.nome
      from public.acessos_consulta a
      left join public.processos p on p.id = a.processo_id
      left join public.advogados v on v.id = a.advogado_id
     where a.em > now() - make_interval(days => greatest(1, least(p_dias, 400)))
     order by a.em desc limit greatest(1, least(p_limite, 5000));
end $$;
revoke all on function public.listar_acessos(int, int) from public, anon;
grant execute on function public.listar_acessos(int, int) to authenticated;

-- 3) Tempo médio em cada fase, por escrevente (Oficial)
create or replace function public.estatisticas_equipe()
returns table(resp_id uuid, resp_nome text, fase_id int, dias_medio numeric, n int)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_oficial() then raise exception 'Só o Oficial.'; end if;
  return query
    with h as (
      select x.processo_id, x.fase_id, x.em, lead(x.em) over (partition by x.processo_id order by x.em, x.id) as fim
        from public.historico x where x.tipo = 'fase'
    )
    select p.responsavel_id, pf.nome, h.fase_id::int,
           round(avg(extract(epoch from (h.fim - h.em)) / 86400)::numeric, 1), count(*)::int
      from h join public.processos p on p.id = h.processo_id join public.perfis pf on pf.id = p.responsavel_id
     where h.fim is not null and h.fase_id < 8
     group by p.responsavel_id, pf.nome, h.fase_id;
end $$;
revoke all on function public.estatisticas_equipe() from public, anon;
grant execute on function public.estatisticas_equipe() to authenticated;

-- 4) Desfazer movimentos: Oficial até 7 dias, demais até 15 minutos (continua exigindo que nenhum e-mail tenha saído)
create or replace function private.janela_desfazer() returns interval
language sql stable set search_path = '' as $$
  select case when private.is_oficial() then interval '7 days' else interval '15 minutes' end;
$$;

do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.desfazer_movimento(bigint,double precision)'::regprocedure);
  d2 := replace(d, $a$if h.em < now() - interval '2 minutes' then$a$, $a$if h.em < now() - private.janela_desfazer() then$a$);
  if d2 = d then raise exception 'desfazer: janela não encontrada'; end if;
  d := d2;
  d2 := replace(d, $a$  return true;
end$a$, $a$  insert into public.auditoria(processo_id, protocolo, acao, detalhes, por)
  select h.processo_id, protocolo, 'movimento_desfeito', jsonb_build_object('de', h.fase_id, 'para', v_prev.fase_id), (select auth.uid())
    from public.processos where id = h.processo_id;
  return true;
end$a$);
  if d2 = d then
    d2 := replace(d, E'  return true;\r\nend', E'  insert into public.auditoria(processo_id, protocolo, acao, detalhes, por)\r\n  select h.processo_id, protocolo, ''movimento_desfeito'', jsonb_build_object(''de'', h.fase_id, ''para'', v_prev.fase_id), (select auth.uid())\r\n    from public.processos where id = h.processo_id;\r\n  return true;\r\nend');
  end if;
  if d2 = d then raise exception 'desfazer: fim não encontrado'; end if;
  execute d2;
end $$;

create or replace function public.movimentos_recentes(p_limite int default 80)
returns table(hist_id bigint, processo_id bigint, protocolo text, requerente text, de_fase int, para_fase int, em timestamptz, por_nome text, pode boolean, motivo text)
language plpgsql security definer set search_path = '' as $$
declare v_of boolean; v_jan interval;
begin
  if not private.is_aprovado() then raise exception 'Sem permissão.'; end if;
  v_of := private.is_oficial(); v_jan := private.janela_desfazer();
  return query
    with h as (
      select x.id, x.processo_id, x.fase_id, x.em, x.por,
             lag(x.fase_id) over (partition by x.processo_id order by x.em, x.id) as ant,
             lead(x.id) over (partition by x.processo_id order by x.em, x.id) as depois
        from public.historico x where x.tipo = 'fase'
    )
    select h.id, h.processo_id, p.protocolo, p.requerente_nome, h.ant::int, h.fase_id::int, h.em, pf.nome,
           (h.ant is not null and h.depois is null and h.em > now() - v_jan
              and not exists (select 1 from public.emails_enviados e where e.historico_id = h.id and e.status <> 'pendente')),
           case when h.ant is null then 'primeira fase do processo'
                when h.depois is not null then 'houve outra movimentação depois'
                when h.em <= now() - v_jan then 'passou o prazo para desfazer'
                when exists (select 1 from public.emails_enviados e where e.historico_id = h.id and e.status <> 'pendente') then 'o e-mail já foi enviado'
                else null end
      from h join public.processos p on p.id = h.processo_id left join public.perfis pf on pf.id = h.por
     where h.em > now() - interval '7 days' and h.ant is not null and (v_of or h.por = (select auth.uid()))
     order by h.em desc limit greatest(1, least(p_limite, 300));
end $$;
revoke all on function public.movimentos_recentes(int) from public, anon;
grant execute on function public.movimentos_recentes(int) to authenticated;
