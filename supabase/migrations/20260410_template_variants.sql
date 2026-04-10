-- ============================================
-- Migration: Template Variants (5 per type)
-- ============================================

-- 1. Add variant column
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS variant integer DEFAULT 1;

-- 2. Update existing rows to variant 1
UPDATE whatsapp_templates SET variant = 1 WHERE variant IS NULL;

-- 3. Add unique constraint on (key, variant)
ALTER TABLE whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_key_variant_unique;
ALTER TABLE whatsapp_templates ADD CONSTRAINT whatsapp_templates_key_variant_unique UNIQUE (key, variant);

-- ============================================
-- Delete existing templates and re-seed all 25
-- ============================================
DELETE FROM whatsapp_templates;

-- ============================================
-- CREDENCIALES ACTUALIZADAS (5 variantes)
-- ============================================

INSERT INTO whatsapp_templates (key, name, message, enabled, variant) VALUES
('credenciales_actualizadas', 'Credenciales Actualizadas', 
'Hola {nombre} 😊

Las credenciales de tu *{plataforma}* fueron actualizadas:

📧 Nuevo email: {email}
🔑 Nueva contraseña: {password}
📺 Tu perfil: {perfil}
🔒 PIN: {pin}

Si tenés dudas, escribinos.', true, 1),

('credenciales_actualizadas', 'Credenciales Actualizadas', 
'Hey {nombre}! 👋

Actualizamos los datos de tu *{plataforma}*:

✉️ Email: {email}
🔐 Contraseña: {password}
👤 Perfil: {perfil}
🔢 PIN: {pin}

Cualquier consulta, estamos para ayudarte.', true, 2),

('credenciales_actualizadas', 'Credenciales Actualizadas', 
'{nombre}, te informamos que tus datos de *{plataforma}* cambiaron 🔄

📩 Email: {email}
🗝️ Pass: {password}
🖥️ Perfil: {perfil}
📌 PIN: {pin}

Guardá estos datos. ¡Saludos!', true, 3),

('credenciales_actualizadas', 'Credenciales Actualizadas', 
'Hola {nombre}! 🙌

Tus nuevas credenciales de *{plataforma}* están listas:

📬 Email: {email}
🔑 Contraseña: {password}
📺 Perfil: {perfil}
🔒 PIN: {pin}

Escribinos si necesitás ayuda.', true, 4),

('credenciales_actualizadas', 'Credenciales Actualizadas', 
'Buenas {nombre} ✌️

Te compartimos tus credenciales actualizadas de *{plataforma}*:

📧 Correo: {email}
🔐 Clave: {password}
👤 Perfil asignado: {perfil}
🔢 PIN: {pin}

Cualquier duda nos avisás.', true, 5);

-- ============================================
-- PRE-VENCIMIENTO (5 variantes)
-- ============================================

INSERT INTO whatsapp_templates (key, name, message, enabled, variant) VALUES
('pre_vencimiento', 'Pre-Vencimiento', 
'Hola 👋

Tu suscripción de *{plataforma}* vence en {dias_restantes} días ({fecha_vencimiento}).

💰 Renovar: Gs. {precio}

¿Querés renovar? Respondé este mensaje.', true, 1),

('pre_vencimiento', 'Pre-Vencimiento', 
'Hey {nombre}! ⏰

Te recordamos que tu *{plataforma}* vence el {fecha_vencimiento} (en {dias_restantes} días).

💵 Precio de renovación: Gs. {precio}

Escribinos para renovar y seguir disfrutando del servicio 🙌', true, 2),

('pre_vencimiento', 'Pre-Vencimiento', 
'{nombre}, aviso importante 📢

Tu servicio de *{plataforma}* está por vencer en {dias_restantes} días ({fecha_vencimiento}).

🏷️ Renovación: Gs. {precio}

No te quedes sin acceso, respondé para renovar ✅', true, 3),

('pre_vencimiento', 'Pre-Vencimiento', 
'Hola {nombre} 👋

Se acerca el vencimiento de tu *{plataforma}* ({fecha_vencimiento} - faltan {dias_restantes} días).

💰 Gs. {precio} para renovar.

¿Renovamos? Escribinos 📲', true, 4),

('pre_vencimiento', 'Pre-Vencimiento', 
'Buenas {nombre}! 😊

Tu *{plataforma}* vence pronto: {fecha_vencimiento} ({dias_restantes} días restantes).

💵 Renovar: Gs. {precio}

Avisanos y lo renovamos al toque 🚀', true, 5);

-- ============================================
-- VENCIMIENTO HOY (5 variantes)
-- ============================================

INSERT INTO whatsapp_templates (key, name, message, enabled, variant) VALUES
('vencimiento_hoy', 'Vencimiento', 
'Hola 👋

Tu servicio de *{plataforma}* vence hoy.

✅ Escribinos para renovar y no perder el acceso.

💰 Renovar: Gs. {precio}', true, 1),

('vencimiento_hoy', 'Vencimiento', 
'{nombre}, tu *{plataforma}* vence HOY 🔴

Si no renovás, mañana se suspenderá tu acceso.

💰 Renovación: Gs. {precio}

Escribinos ahora para renovar ✅', true, 2),

('vencimiento_hoy', 'Vencimiento', 
'⚠️ {nombre}, último día de tu *{plataforma}*!

Hoy vence tu servicio. Renovalo para seguir disfrutando sin interrupción.

💵 Renovar: Gs. {precio}

Respondé este mensaje para renovar 📲', true, 3),

('vencimiento_hoy', 'Vencimiento', 
'Hola {nombre} 🔔

Tu suscripción de *{plataforma}* vence hoy ({fecha_vencimiento}).

💰 Gs. {precio} para renovar.

Escribinos antes de que se suspenda el acceso.', true, 4),

('vencimiento_hoy', 'Vencimiento', 
'{nombre}, te avisamos que hoy vence tu *{plataforma}* ⏳

💵 Precio de renovación: Gs. {precio}

No pierdas tu acceso, contactanos para renovar 🙌', true, 5);

-- ============================================
-- SERVICIO VENCIDO (5 variantes)
-- ============================================

INSERT INTO whatsapp_templates (key, name, message, enabled, variant) VALUES
('vencimiento_vencido', 'Recordatorio de Pago', 
'⚠️ *Recordatorio de Pago*

Hola {nombre}, te recordamos que el pago de tu servicio de *{plataforma}* se encuentra pendiente.

💰 Renovación: Gs. {precio}

si desea renovar nos decis con que metodo de pago.
de lo contrario si ya no necesita ignorar este mensaje', true, 1),

('vencimiento_vencido', 'Recordatorio de Pago', 
'⚠️ *Recordatorio de Pago*

Hola {nombre}, te avisamos que tu servicio de *{plataforma}* tiene el pago pendiente.

💰 Renovación: Gs. {precio}

si deseas renovar indicanos el metodo de pago.
de lo contrario si ya no necesitas ignorar este mensaje', true, 2),

('vencimiento_vencido', 'Recordatorio de Pago', 
'⚠️ *Recordatorio de Pago*

Hola {nombre}, te informamos que el pago de tu *{plataforma}* aún no fue realizado.

💰 Renovación: Gs. {precio}

si desea renovar nos avisa con que metodo de pago.
de lo contrario si ya no necesita ignorar este mensaje', true, 3),

('vencimiento_vencido', 'Recordatorio de Pago', 
'⚠️ *Recordatorio de Pago*

Hola {nombre}, queremos recordarte que tu servicio de *{plataforma}* está pendiente de pago.

💰 Renovación: Gs. {precio}

si desea renovar nos comenta con que metodo de pago.
de lo contrario si ya no necesita ignorar este mensaje', true, 4),

('vencimiento_vencido', 'Recordatorio de Pago', 
'⚠️ *Recordatorio de Pago*

Hola {nombre}, te escribimos para recordarte que el pago de *{plataforma}* se encuentra pendiente.

💰 Renovación: Gs. {precio}

si deseas renovar decinos el metodo de pago.
de lo contrario si ya no necesitas ignorar este mensaje', true, 5);

-- ============================================
-- CREDENCIALES DE VENTA (5 variantes)
-- ============================================

INSERT INTO whatsapp_templates (key, name, message, enabled, variant) VALUES
('venta_credenciales', 'Credenciales de Venta', 
'Hola {nombre} 😊

Tus credenciales de *{plataforma}* están listas:

📧 Email: {email}
🔑 Contraseña: {password}
📺 Tu perfil: {perfil}
🔒 PIN: {pin}

📅 Vence: {fecha_vencimiento}

Si tenés dudas, escribinos.', true, 1),

('venta_credenciales', 'Credenciales de Venta', 
'Hey {nombre}! 🎉

Ya tenés acceso a *{plataforma}*:

✉️ Correo: {email}
🔐 Clave: {password}
👤 Perfil: {perfil}
🔢 PIN: {pin}

📆 Vigencia hasta: {fecha_vencimiento}

¡Disfrutalo! Cualquier consulta nos avisás.', true, 2),

('venta_credenciales', 'Credenciales de Venta', 
'{nombre}, tu *{plataforma}* está activado ✅

📧 Email: {email}
🔑 Pass: {password}
🖥️ Perfil: {perfil}
📌 PIN: {pin}

📅 Válido hasta: {fecha_vencimiento}

Guardá estos datos. ¡Saludos!', true, 3),

('venta_credenciales', 'Credenciales de Venta', 
'Hola {nombre}! 🙌

Acá van tus datos de acceso a *{plataforma}*:

📬 Email: {email}
🔑 Contraseña: {password}
📺 Perfil: {perfil}
🔒 PIN: {pin}

📆 Fecha de vencimiento: {fecha_vencimiento}

Escribinos si necesitás ayuda.', true, 4),

('venta_credenciales', 'Credenciales de Venta', 
'Buenas {nombre} ✌️

Te compartimos tu acceso a *{plataforma}*:

📩 Email: {email}
🔐 Contraseña: {password}
👤 Perfil asignado: {perfil}
🔢 PIN: {pin}

📅 Vence el: {fecha_vencimiento}

Cualquier duda, estamos disponibles.', true, 5);

-- ============================================
-- Rotation counters in app_config
-- ============================================

INSERT INTO app_config (key, value, label) VALUES
('template_rotation_credenciales_actualizadas', '0', 'Último variante usado: Credenciales Actualizadas'),
('template_rotation_pre_vencimiento', '0', 'Último variante usado: Pre-Vencimiento'),
('template_rotation_vencimiento_hoy', '0', 'Último variante usado: Vencimiento Hoy'),
('template_rotation_vencimiento_vencido', '0', 'Último variante usado: Servicio Vencido'),
('template_rotation_venta_credenciales', '0', 'Último variante usado: Credenciales de Venta')
ON CONFLICT (key) DO NOTHING;
