-- Cole este conteúdo inteiro no Supabase: SQL Editor -> New query -> Run.
-- Atualiza as duas consultas públicas (protocolo e código do advogado) para mostrar prazos e observações.

create or replace function public.consulta_publica(p_protocolo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_chave text; v_n int; v_total int; v_proc public.processos;
  v_prot text := regexp_replace(coalesce(p_protocolo, ''), '\s+', '', 'g');
begin
  v_chave := trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  if v_chave = '' then v_chave := 'desconhecido'; end if;
  delete from public.consulta_tentativas where em < now() - interval '1 hour';
  select count(*) into v_n from public.consulta_tentativas where chave = v_chave and em > now() - interval '1 minute';
  select count(*) into v_total from public.consulta_tentativas where em > now() - interval '1 minute';
  if v_n >= 12 or v_total >= 300 then raise exception 'Muitas consultas. Aguarde um minuto e tente de novo.'; end if;
  insert into public.consulta_tentativas (chave) values (v_chave);
  if v_prot !~ '^[0-9]{1,12}$' then return null; end if;
  select * into v_proc from public.processos where protocolo = v_prot;
  if not found then return null; end if;
  return private.dados_publicos(v_proc);
end $$;

-- Área do advogado: devolve de uma vez todos os processos, cada um com a linha do tempo completa
-- (assim a página abre vários ao mesmo tempo sem novas consultas).
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
      select coalesce(jsonb_agg(private.dados_publicos(p) || jsonb_build_object('referencia', p.referencia) order by p.protocolo), '[]'::jsonb)
      from public.processos p where p.advogado_id = v_adv.id
    )
  );
end $$;
revoke all on function public.consulta_advogado(text) from public;
grant execute on function public.consulta_advogado(text) to anon, authenticated;
