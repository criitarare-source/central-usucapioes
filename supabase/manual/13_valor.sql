-- Já aplicado no projeto. Coluna de uso interno (não exposta nas consultas públicas).
alter table public.processos add column if not exists valor numeric(14,2) check (valor is null or valor >= 0);
