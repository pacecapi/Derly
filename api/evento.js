// GET /api/evento
// Devuelve los datos públicos del evento activo y la disponibilidad
// de plazas en tiempo real, para mostrarlos en la web.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(request) {
  if (request.method !== 'GET') {
    return json({ error: 'Método no permitido' }, 405);
  }

  const { data: evento, error } = await supabase
    .from('eventos')
    .select('slug, nombre, descripcion, fecha, ubicacion, precio_centimos, moneda, aforo_total, plazas_ocupadas')
    .eq('activo', true)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !evento) {
    return json({ error: 'No hay ningún evento activo.' }, 404);
  }

  const plazas_disponibles = Math.max(0, evento.aforo_total - evento.plazas_ocupadas);

  return json({
    slug: evento.slug,
    nombre: evento.nombre,
    descripcion: evento.descripcion,
    fecha: evento.fecha,
    ubicacion: evento.ubicacion,
    precio_centimos: evento.precio_centimos,
    moneda: evento.moneda,
    plazas_disponibles,
    agotado: plazas_disponibles <= 0,
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
