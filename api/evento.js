// GET /api/evento
// Devuelve los datos públicos del evento activo y la disponibilidad
// de plazas en tiempo real, para mostrarlos en la web.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { data: evento, error } = await supabase
    .from('eventos')
    .select('slug, nombre, descripcion, fecha, ubicacion, precio_centimos, moneda, aforo_total, plazas_ocupadas')
    .eq('activo', true)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !evento) {
    return res.status(404).json({ error: 'No hay ningún evento activo.' });
  }

  const plazas_disponibles = Math.max(0, evento.aforo_total - evento.plazas_ocupadas);

  return res.status(200).json({
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
