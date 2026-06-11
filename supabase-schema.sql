-- ───────────────────────────────────────────────────────────
-- Esquema de base de datos para reservas de eventos (Derly)
-- Ejecútalo en Supabase: SQL Editor → New query → pega y Run.
-- ───────────────────────────────────────────────────────────

-- Tabla del evento (un solo evento activo a la vez en esta fase)
create table if not exists eventos (
  id              bigint generated always as identity primary key,
  slug            text unique not null,
  nombre          text not null,
  descripcion     text,
  fecha           timestamptz not null,
  ubicacion       text,                 -- texto o enlace de Zoom
  precio_centimos integer not null,     -- precio en céntimos (ej: 4900 = 49,00 €)
  moneda          text not null default 'eur',
  aforo_total     integer not null,
  plazas_ocupadas integer not null default 0,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

-- Tabla de reservas (una fila por compra confirmada)
create table if not exists reservas (
  id                bigint generated always as identity primary key,
  evento_id         bigint not null references eventos(id),
  nombre            text not null,
  email             text not null,
  telefono          text,
  importe_centimos  integer not null,
  estado            text not null default 'pagado',
  stripe_session_id text unique not null,   -- clave de idempotencia
  creado_en         timestamptz not null default now()
);

create index if not exists idx_reservas_evento on reservas(evento_id);

-- ───────────────────────────────────────────────────────────
-- Función atómica e idempotente: registra una reserva pagada y
-- descuenta una plaza solo si la sesión de Stripe es nueva.
-- Devuelve TRUE si registró una reserva nueva (para enviar email).
-- ───────────────────────────────────────────────────────────
create or replace function registrar_reserva_pagada(
  p_session_id text,
  p_evento_id  bigint,
  p_nombre     text,
  p_email      text,
  p_telefono   text,
  p_importe    integer
) returns boolean
language plpgsql
as $$
declare
  v_insertado boolean := false;
begin
  insert into reservas (evento_id, nombre, email, telefono, importe_centimos, stripe_session_id)
  values (p_evento_id, p_nombre, p_email, p_telefono, p_importe, p_session_id)
  on conflict (stripe_session_id) do nothing;

  -- ¿Se insertó realmente una fila nueva?
  get diagnostics v_insertado = row_count;

  if v_insertado then
    update eventos
       set plazas_ocupadas = plazas_ocupadas + 1
     where id = p_evento_id;
    return true;
  end if;

  return false;
end;
$$;

-- ───────────────────────────────────────────────────────────
-- Seguridad: activamos RLS. El backend usa la SERVICE ROLE key,
-- que omite RLS, así que no necesitamos políticas públicas.
-- (Sin políticas = nadie con la anon key puede leer/escribir.)
-- ───────────────────────────────────────────────────────────
alter table eventos  enable row level security;
alter table reservas enable row level security;

-- ───────────────────────────────────────────────────────────
-- Evento de ejemplo. EDITA estos valores con tu evento real.
-- ───────────────────────────────────────────────────────────
insert into eventos (slug, nombre, descripcion, fecha, ubicacion, precio_centimos, aforo_total)
values (
  'evento-activo',
  'Seminario "Recuerda tu gran ser"',
  'Una jornada transformadora para reconectar con tu esencia y tu propósito.',
  '2026-09-20 10:00:00+02',
  'Online vía Zoom (recibirás el enlace por email)',
  4900,   -- 49,00 €
  30      -- 30 plazas
)
on conflict (slug) do nothing;
