// POST /api/crear-reserva
// Recibe los datos del asistente, comprueba que queden plazas y crea
// una sesión de Stripe Checkout. Devuelve la URL de pago para redirigir.
//
// El precio y el aforo se leen del SERVIDOR (Supabase), nunca del cliente,
// para que no se puedan manipular desde el navegador.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Verificar configuración antes de instanciar nada (para dar errores claros).
  const faltan = [];
  if (!process.env.STRIPE_SECRET_KEY) faltan.push('STRIPE_SECRET_KEY');
  if (!process.env.SUPABASE_URL) faltan.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) faltan.push('SUPABASE_SERVICE_ROLE_KEY');
  if (faltan.length) {
    console.error('Faltan variables de entorno:', faltan.join(', '));
    return res.status(500).json({
      error: 'El sistema de pago no está configurado todavía. (Faltan: ' + faltan.join(', ') + ')',
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let datos;
  try {
    datos = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Petición inválida.' });
  }

  const nombre = (datos.nombre || '').trim();
  const email = (datos.email || '').trim();
  const telefono = (datos.telefono || '').trim();

  if (!nombre || !email) {
    return res.status(400).json({ error: 'Nombre y email son obligatorios.' });
  }

  // Leer el evento activo desde la base de datos.
  const { data: evento, error } = await supabase
    .from('eventos')
    .select('id, nombre, descripcion, precio_centimos, moneda, aforo_total, plazas_ocupadas')
    .eq('activo', true)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !evento) {
    return res.status(404).json({ error: 'No hay ningún evento disponible.' });
  }

  // Comprobación de aforo (suave; la confirmación real ocurre en el webhook).
  if (evento.plazas_ocupadas >= evento.aforo_total) {
    return res.status(409).json({ error: 'Lo sentimos, las plazas están agotadas.' });
  }

  const origin = siteUrl(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Checkout muestra automáticamente los métodos que tengas activados
      // en tu panel de Stripe (tarjeta, Bizum, Apple/Google Pay…).
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: evento.moneda || 'eur',
            product_data: {
              name: evento.nombre,
              description: evento.descripcion || undefined,
            },
            unit_amount: evento.precio_centimos,
          },
          quantity: 1,
        },
      ],
      metadata: {
        evento_id: String(evento.id),
        nombre,
        telefono,
      },
      success_url: `${origin}/gracias.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pago-cancelado.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('Error creando la sesión de Stripe:', e);
    return res.status(500).json({ error: 'No se pudo iniciar el pago. Inténtalo de nuevo.' });
  }
}

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/$/, '');
  const host = req.headers.host;
  return host ? `https://${host}` : '';
}
