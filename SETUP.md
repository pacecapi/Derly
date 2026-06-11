# Configuración: reserva y pago anticipado de eventos

Esta web ya tiene integrado un sistema de **reserva de plaza + pago anticipado**
con Stripe, Supabase (aforo) y Resend (email de confirmación).

Para que funcione necesitas crear 3 cuentas gratuitas y pegar sus claves en
Vercel. Sigue los pasos en orden.

---

## 1. Stripe (cobros)

1. Crea una cuenta en https://dashboard.stripe.com (selecciona **España** como país).
2. Mantén el **modo de prueba** activado (interruptor "Test mode" arriba a la derecha) mientras pruebas.
3. Ve a **Developers → API keys** y copia la **Secret key** (`sk_test_...`).
4. (Opcional) Activa **Bizum** en **Settings → Payment methods**.

> El webhook (paso 4) te dará la otra clave de Stripe (`whsec_...`).

---

## 2. Supabase (base de datos / aforo)

1. Crea un proyecto en https://app.supabase.com.
2. Abre **SQL Editor → New query**, pega el contenido de
   [`supabase-schema.sql`](supabase-schema.sql) y pulsa **Run**.
   Esto crea las tablas y un evento de ejemplo (edítalo luego con tu evento real).
3. Ve a **Settings → API** y copia:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key (la secreta) → `SUPABASE_SERVICE_ROLE_KEY`

---

## 3. Resend (email de confirmación)

1. Crea una cuenta en https://resend.com.
2. Verifica tu dominio en **Domains** (para enviar desde `hola@tudominio.com`).
   - Si aún no tienes dominio, puedes usar el remitente de pruebas
     `onboarding@resend.dev` para `EMAIL_REMITENTE` mientras tanto.
3. En **API Keys**, crea una clave → `RESEND_API_KEY`.

---

## 4. Variables de entorno en Vercel

En tu proyecto de Vercel: **Settings → Environment Variables**. Añade
(usa [`.env.example`](.env.example) como referencia):

| Variable | De dónde sale |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks (paso siguiente) |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service_role) |
| `RESEND_API_KEY` | Resend → API Keys |
| `EMAIL_REMITENTE` | Ej: `Derly <hola@tudominio.com>` |
| `SITE_URL` | Tu URL pública, ej: `https://derly.vercel.app` |

### Crear el webhook de Stripe
1. Despliega primero el sitio en Vercel (para tener la URL pública).
2. En Stripe: **Developers → Webhooks → Add endpoint**.
   - URL: `https://TU-DOMINIO/api/webhook`
   - Evento a escuchar: `checkout.session.completed`
3. Copia el **Signing secret** (`whsec_...`) → variable `STRIPE_WEBHOOK_SECRET` en Vercel.
4. Vuelve a desplegar para que tome la variable.

---

## 5. Probar (modo test)

1. Abre la web, ve a la sección **Evento → Reservar plaza**.
2. Rellena el formulario y paga con una **tarjeta de prueba de Stripe**:
   - Número: `4242 4242 4242 4242`
   - Fecha: cualquiera futura · CVC: cualquiera · CP: cualquiera
3. Deberías ver la página de **gracias**, recibir el **email** y ver la reserva
   en la tabla `reservas` de Supabase (con una plaza menos disponible).

---

## 6. Salir a producción

1. En Stripe, **desactiva el modo test** y repite la obtención de claves
   `sk_live_...` y crea el webhook de nuevo en modo live (`whsec_...` live).
2. Actualiza esas dos variables en Vercel y vuelve a desplegar.
3. Edita el evento real en la tabla `eventos` de Supabase (nombre, fecha,
   precio en céntimos, aforo, ubicación/Zoom).

---

## Cómo cambiar el evento

Edita la fila de la tabla `eventos` en Supabase (SQL Editor o Table Editor):
- `nombre`, `descripcion`, `fecha`, `ubicacion`
- `precio_centimos` (ej. `4900` = 49,00 €)
- `aforo_total` (nº de plazas)
- Para "cerrar" un evento, pon `activo = false`.

## Archivos del sistema
- `api/evento.js` — devuelve el evento activo y plazas disponibles.
- `api/crear-reserva.js` — crea la sesión de pago de Stripe.
- `api/webhook.js` — confirma el pago, descuenta plaza y envía el email.
- `gracias.html` / `pago-cancelado.html` — páginas de retorno del pago.
- `supabase-schema.sql` — estructura de la base de datos.
