-- Cole este conteúdo inteiro no Supabase: SQL Editor -> New query -> Run.
-- (O conector automático bloqueia funções públicas e comandos que apagam dados.)

-- 1) Consulta pública pelo código do advogado (limite: 6 por minuto por IP)
create or replace function public.consulta_advogado(p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ip text; v_chave text; v_n int; v_total int; v_adv public.advogados;
  v_cod text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  v_ip := trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  if v_ip = '' then v_ip := 'desconhecido'; end if;
  v_chave := 'adv:' || v_ip;
  delete from public.consulta_tentativas where em < now() - interval '1 hour';
  select count(*) into v_n from public.consulta_tentativas where chave = v_chave and em > now() - interval '1 minute';
  select count(*) into v_total from public.consulta_tentativas where chave like 'adv:%' and em > now() - interval '1 minute';
  if v_n >= 6 or v_total >= 100 then raise exception 'Muitas consultas. Aguarde um minuto e tente de novo.'; end if;
  insert into public.consulta_tentativas (chave) values (v_chave);

  if char_length(v_cod) <> 12 then return null; end if;
  select * into v_adv from public.advogados
   where codigo_hash = encode(sha256(convert_to(v_cod, 'utf8')), 'hex') and ativo;
  if not found then return null; end if;

  return jsonb_build_object(
    'nome', v_adv.nome,
    'processos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'protocolo', p.protocolo, 'referencia', p.referencia, 'fase_id', p.fase_id, 'fase_nome', f.nome,
        'atualizado_em', coalesce((select max(h.em) from public.historico h where h.processo_id = p.id), p.criado_em)
      ) order by p.protocolo), '[]'::jsonb)
      from public.processos p join public.fases f on f.id = p.fase_id where p.advogado_id = v_adv.id
    )
  );
end $$;
revoke all on function public.consulta_advogado(text) from public;
grant execute on function public.consulta_advogado(text) to anon, authenticated;

-- 2) Apagar todos os processos (só o Oficial, com confirmação digitada)
create or replace function public.limpar_quadro(p_confirmacao text) returns integer
language plpgsql set search_path = '' as $$
declare n integer;
begin
  if not private.is_oficial() then raise exception 'Somente o Oficial pode apagar todos os processos.'; end if;
  if p_confirmacao is distinct from 'APAGAR TUDO' then raise exception 'Confirmação incorreta.'; end if;
  delete from public.processos where id is not null;
  get diagnostics n = row_count;
  insert into public.auditoria(acao, detalhes, por) values ('quadro_limpo', jsonb_build_object('processos', n), (select auth.uid()));
  return n;
end $$;
revoke all on function public.limpar_quadro(text) from public, anon;
grant execute on function public.limpar_quadro(text) to authenticated;
