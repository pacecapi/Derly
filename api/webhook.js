// POST /api/webhook
// Endpoint que Stripe llama cuando se completa un pago. Verifica la firma,
// registra la reserva de forma atómica e idempotente (descontando una plaza)
// y envía el email de confirmación.
//
// IMPORTANTE: usa el cuerpo CRUDO de la petición (request.text()) para que
// la verificación de la firma de Stripe funcione.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 });
  }

  const firma = request.headers.get('stripe-signature');
  const cuerpo = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      cuerpo,
      firma,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('Firma de webhook inválida:', e.message);
    return new Response(`Webhook Error: ${e.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const md = session.metadata || {};

    try {
      // Registro atómico e idempotente. Devuelve true solo si la reserva
      // es nueva (Stripe puede reenviar el mismo evento varias veces).
      const { data: esNueva, error } = await supabase.rpc('registrar_reserva_pagada', {
        p_session_id: session.id,
        p_evento_id: Number(md.evento_id),
        p_nombre: md.nombre || session.customer_details?.name || '',
        p_email: session.customer_details?.email || session.customer_email || '',
        p_telefono: md.telefono || '',
        p_importe: session.amount_total,
      });

      if (error) {
        console.error('Error registrando la reserva:', error);
        // 500 → Stripe reintentará el webhook más tarde.
        return new Response('Error al registrar la reserva', { status: 500 });
      }

      if (esNueva) {
        await enviarEmailConfirmacion(session, md);
      }
    } catch (e) {
      console.error('Error procesando el webhook:', e);
      return new Response('Error interno', { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function enviarEmailConfirmacion(session, md) {
  const email = session.customer_details?.email || session.customer_email;
  if (!email) return;

  // Datos del evento para el correo.
  const { data: evento } = await supabase
    .from('eventos')
    .select('nombre, fecha, ubicacion')
    .eq('id', Number(md.evento_id))
    .maybeSingle();

  const nombre = md.nombre || session.customer_details?.name || '';
  const importe = (session.amount_total / 100).toLocaleString('es-ES', {
    style: 'currency',
    currency: (session.currency || 'eur').toUpperCase(),
  });
  const fecha = evento?.fecha
    ? new Date(evento.fecha).toLocaleString('es-ES', {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : '';

  try {
    await resend.emails.send({
      from: process.env.EMAIL_REMITENTE,
      to: email,
      subject: `Confirmación de tu reserva — ${evento?.nombre || 'Evento'}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #3D3D3D; max-width: 560px; margin: 0 auto;">
          <h1 style="color: #D4A59A; font-size: 22px;">¡Tu plaza está reservada!</h1>
          <p>Hola ${nombre || ''},</p>
          <p>Hemos confirmado tu reserva y tu pago de <strong>${importe}</strong>. ¡Gracias por unirte!</p>
          <div style="background:#faf9f6; border:1px solid #f2e8de; padding:20px; margin:20px 0;">
            <p style="margin:0 0 8px;"><strong>Evento:</strong> ${evento?.nombre || ''}</p>
            ${fecha ? `<p style="margin:0 0 8px;"><strong>Fecha:</strong> ${fecha}</p>` : ''}
            ${evento?.ubicacion ? `<p style="margin:0;"><strong>Dónde:</strong> ${evento.ubicacion}</p>` : ''}
          </div>
          <p>Si tienes cualquier duda, responde a este correo.</p>
          <p style="color:#D4A59A; font-style:italic;">Con cariño,<br/>Derly</p>
        </div>
      `,
    });
  } catch (e) {
    // No bloqueamos la reserva si falla el email; solo lo registramos.
    console.error('Error enviando el email de confirmación:', e);
  }
}
