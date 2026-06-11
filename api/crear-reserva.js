// POST /api/crear-reserva
// Recibe los datos del asistente, comprueba que queden plazas y crea
// una sesión de Stripe Checkout. Devuelve la URL de pago para redirigir.
//
// El precio y el aforo se leen del SERVIDOR (Supabase), nunca del cliente,
// para que no se puedan manipular desde el navegador.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405);
  }

  let datos;
  try {
    datos = await request.json();
  } catch {
    return json({ error: 'Petición inválida.' }, 400);
  }

  const nombre = (datos.nombre || '').trim();
  const email = (datos.email || '').trim();
  const telefono = (datos.telefono || '').trim();

  if (!nombre || !email) {
    return json({ error: 'Nombre y email son obligatorios.' }, 400);
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
    return json({ error: 'No hay ningún evento disponible.' }, 404);
  }

  // Comprobación de aforo (suave; la confirmación real ocurre en el webhook).
  if (evento.plazas_ocupadas >= evento.aforo_total) {
    return json({ error: 'Lo sentimos, las plazas están agotadas.' }, 409);
  }

  const origin = siteUrl(request);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Incluye automáticamente los métodos que tengas activados en Stripe
      // (tarjeta, Bizum, Apple/Google Pay…).
      automatic_payment_methods: { enabled: true },
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

    return json({ url: session.url });
  } catch (e) {
    console.error('Error creando la sesión de Stripe:', e);
    return json({ error: 'No se pudo iniciar el pago. Inténtalo de nuevo.' }, 500);
  }
}

function siteUrl(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const origin = request.headers.get('origin');
  if (origin) return origin.replace(/\/$/, '');
  const host = request.headers.get('host');
  return host ? `https://${host}` : '';
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
