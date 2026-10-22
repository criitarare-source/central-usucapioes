-- Cole este conteúdo inteiro no Supabase: SQL Editor -> New query -> Run.
-- Liga o botão "Desfazer" depois de mover um processo de fase.

-- 4) Desfazer a última mudança de fase (até 2 minutos, só se nenhum e-mail dela já saiu)
create or replace function public.desfazer_movimento(p_hist_id bigint, p_ord double precision default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare h public.historico; v_prev public.historico;
begin
  if not private.is_aprovado() then raise exception 'Sem permissão.'; end if;
  select * into h from public.historico where id = p_hist_id and tipo = 'fase';
  if not found then raise exception 'Movimentação não encontrada.'; end if;
  if h.em < now() - interval '2 minutes' then raise exception 'Já passou o tempo para desfazer.'; end if;
  if exists (select 1 from public.historico x where x.processo_id = h.processo_id and x.id <> h.id and x.em >= h.em) then
    raise exception 'Houve outra movimentação depois desta; não dá para desfazer.';
  end if;
  if exists (select 1 from public.emails_enviados e where e.historico_id = h.id and e.status <> 'pendente') then
    raise exception 'O e-mail desta mudança já foi enviado; não dá para desfazer.';
  end if;
  select * into v_prev from public.historico x where x.processo_id = h.processo_id and x.tipo = 'fase' and x.id <> h.id order by x.em desc limit 1;
  if not found then raise exception 'Não há fase anterior.'; end if;

  delete from public.emails_enviados where historico_id = h.id;
  delete from public.prazos where processo_id = h.processo_id and tipo = 'edital' and criado_em >= h.em - interval '2 seconds' and descricao = 'Prazo do edital' and h.fase_id = 5;
  update public.prazos set situacao = 'aberto', concluido_em = null
   where processo_id = h.processo_id and situacao = 'cumprido' and concluido_em between h.em - interval '2 seconds' and h.em + interval '2 seconds';
  delete from public.historico where id = h.id;
  update public.processos set fase_id = v_prev.fase_id, fase_desde = v_prev.em, ord = coalesce(p_ord, ord), atualizado_em = now()
   where id = h.processo_id;
  return true;
end $$;
revoke all on function public.desfazer_movimento(bigint, double precision) from public, anon;
grant execute on function public.desfazer_movimento(bigint, double precision) to authenticated;
