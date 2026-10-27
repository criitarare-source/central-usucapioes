-- Já aplicado.
alter table public.processos add column if not exists emolumentos numeric(14,2) check (emolumentos is null or emolumentos >= 0);
