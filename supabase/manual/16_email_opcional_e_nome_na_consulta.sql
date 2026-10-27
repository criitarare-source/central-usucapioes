-- E-mail do requerente passa a ser opcional; advogado obrigatório ao criar/importar;
-- consulta mostra o nome do requerente (parcial por protocolo, completo na área do advogado).

alter table public.processos alter column requerente_email drop not null;

-- Nome parcial para a consulta por protocolo: "Maria da Silva Rocha" -> "Maria S. da R."
create or replace function private.nome_parcial(n text) returns text
language plpgsql immutable set search_path = '' as $$
declare w text[]; r text[] := '{}'; i int; t text := trim(coalesce(n, ''));
begin
  if t = '' or t ~* '^a preencher' then return ''; end if;
  w := regexp_split_to_array(t, '\s+');
  for i in 1..array_length(w, 1) loop
    if i = 1 then r := r || w[i];
    elsif lower(w[i]) in ('da','de','do','das','dos','e') then r := r || lower(w[i]);
    else r := r || (upper(left(w[i], 1)) || '.');
    end if;
  end loop;
  return array_to_string(r, ' ');
end $$;

-- Fila de e-mails: ignora e-mail vazio e endereços .invalid
create or replace function private.enfileirar_emails(p_proc_id bigint, p_hist_id bigint) returns void
language plpgsql set search_path = '' as $$
declare v public.processos; v_adv public.advogados;
begin
  select * into v from public.processos where id = p_proc_id;
  insert into public.emails_enviados (processo_id, historico_id, destinatario, copia)
  select p_proc_id, p_hist_id, d.e, false
    from (select distinct on (lower(e)) e
            from unnest(array[v.requerente_email] || v.emails_extra) e
           where e is not null and btrim(e) <> '' and e !~* '\.invalid$') d;
  if v.advogado_id is not null then
    select * into v_adv from public.advogados where id = v.advogado_id and ativo and copia_email and email is not null;
    if found and not exists (select 1 from public.emails_enviados
                              where processo_id = p_proc_id and historico_id is not distinct from p_hist_id and lower(destinatario) = lower(v_adv.email)) then
      insert into public.emails_enviados (processo_id, historico_id, destinatario, copia) values (p_proc_id, p_hist_id, v_adv.email, true);
    end if;
  end if;
end $$;

-- Novo processo: e-mail opcional, advogado obrigatório
create or replace function public.novo_processo(p_protocolo text, p_nome text, p_email text, p_imovel text, p_responsavel uuid,
  p_emails_extra text[] default '{}', p_matricula text default null, p_tipo text default null, p_prenotacao date default null,
  p_referencia text default null, p_advogado bigint default null) returns public.processos
language plpgsql set search_path = '' as $$
declare v_proc public.processos; v_hist public.historico;
begin
  if p_advogado is null then raise exception 'Informe o advogado ou representante.'; end if;
  insert into public.processos (protocolo, requerente_nome, requerente_email, emails_extra, imovel, matricula, tipo_usucapiao, data_prenotacao, referencia, advogado_id, responsavel_id, fase_id, ord)
  values (trim(p_protocolo), trim(p_nome), nullif(trim(coalesce(p_email, '')), ''), coalesce(p_emails_extra, '{}'), coalesce(trim(p_imovel), ''),
          nullif(trim(coalesce(p_matricula, '')), ''), nullif(trim(coalesce(p_tipo, '')), ''), p_prenotacao,
          nullif(trim(coalesce(p_referencia, '')), ''), p_advogado, p_responsavel, 1,
          coalesce((select min(ord) from public.processos), 0) - 1)
  returning * into v_proc;
  insert into public.historico (processo_id, tipo, fase_id, email_solicitado, por)
  values (v_proc.id, 'fase', 1, true, (select auth.uid())) returning * into v_hist;
  perform private.enfileirar_emails(v_proc.id, v_hist.id);
  return v_proc;
end $$;

create or replace function public.importar_processo(p_protocolo text, p_nome text, p_email text, p_imovel text, p_fase smallint default 1,
  p_responsavel uuid default null, p_responsavel_externo bigint default null, p_emails_extra text[] default '{}',
  p_matricula text default null, p_tipo text default null, p_prenotacao date default null, p_referencia text default null,
  p_advogado bigint default null, p_avisar boolean default false) returns public.processos
language plpgsql set search_path = '' as $$
declare v_proc public.processos; v_hist public.historico;
begin
  if not private.is_aprovado() then raise exception 'Sem permissão.'; end if;
  if p_advogado is null then raise exception 'Informe o advogado ou representante.'; end if;
  if not exists (select 1 from public.fases where id = p_fase and not oculta) then raise exception 'Fase inválida.'; end if;
  insert into public.processos (protocolo, requerente_nome, requerente_email, emails_extra, imovel, matricula, tipo_usucapiao, data_prenotacao, referencia, advogado_id, responsavel_id, responsavel_externo_id, fase_id, ord)
  values (trim(p_protocolo), trim(p_nome), nullif(trim(coalesce(p_email, '')), ''), coalesce(p_emails_extra, '{}'), coalesce(trim(p_imovel), ''),
          nullif(trim(coalesce(p_matricula, '')), ''), nullif(trim(coalesce(p_tipo, '')), ''), p_prenotacao,
          nullif(trim(coalesce(p_referencia, '')), ''), p_advogado, p_responsavel, p_responsavel_externo, p_fase,
          coalesce((select min(ord) from public.processos), 0) - 1)
  returning * into v_proc;
  insert into public.historico (processo_id, tipo, fase_id, email_solicitado, por)
  values (v_proc.id, 'fase', p_fase, p_avisar, (select auth.uid())) returning * into v_hist;
  if p_avisar then perform private.enfileirar_emails(v_proc.id, v_hist.id); end if;
  return v_proc;
end $$;

-- Consultas: nome do requerente (parcial por protocolo; completo na área do advogado)
do $$
declare f text; d text; d2 text;
begin
  foreach f in array array['consulta_advogado(text)', 'consulta_advogado_email(text)', 'consulta_advogado_link(text)'] loop
    d := pg_get_functiondef(('public.' || f)::regprocedure);
    d2 := replace(d, $a$jsonb_build_object('referencia', p.referencia)$a$, $a$jsonb_build_object('referencia', p.referencia, 'requerente', p.requerente_nome)$a$);
    if d2 = d then raise exception 'Trecho não encontrado em %', f; end if;
    execute d2;
  end loop;
  d := pg_get_functiondef('public.consulta_publica(text)'::regprocedure);
  d2 := replace(d, 'return private.dados_publicos(v_proc);', $a$return private.dados_publicos(v_proc) || jsonb_build_object('requerente', private.nome_parcial(v_proc.requerente_nome));$a$);
  if d2 = d then raise exception 'Trecho não encontrado em consulta_publica'; end if;
  execute d2;
end $$;

-- Limpeza: tira os e-mails fictícios
update public.processos set requerente_email = null where requerente_email ~* '@pendente\.invalid$';
