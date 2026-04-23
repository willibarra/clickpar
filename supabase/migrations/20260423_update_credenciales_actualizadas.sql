-- ============================================
-- Migration: Actualizar mensajes de Credenciales Actualizadas
-- Fecha: 2026-04-23
-- Motivo: Nuevo tono explicativo indicando que la cuenta anterior
--         dejó de funcionar y se asignó una nueva.
-- ============================================

UPDATE whatsapp_templates
SET message = 'Hola {nombre} 😊

La cuenta anterior de tu *{plataforma}* dejó de funcionar, así que te asignamos una nueva.

Las credenciales fueron actualizadas:

📧 Nuevo email: {email}
🔑 Nueva contraseña: {password}
📺 Tu perfil: {perfil}
🔒 PIN: {pin}

Si tenés dudas, escribinos.'
WHERE key = 'credenciales_actualizadas' AND variant = 1;

-- -----------------------------------------------

UPDATE whatsapp_templates
SET message = 'Hey {nombre}! 👋

Tu cuenta de *{plataforma}* dejó de funcionar, así que te cambiamos a una nueva:

✉️ Email: {email}
🔐 Contraseña: {password}
👤 Perfil: {perfil}
🔢 PIN: {pin}

Cualquier consulta, estamos para ayudarte.'
WHERE key = 'credenciales_actualizadas' AND variant = 2;

-- -----------------------------------------------

UPDATE whatsapp_templates
SET message = '{nombre}, la cuenta anterior de *{plataforma}* no está funcionando, por eso te asignamos una nueva 🔄

📩 Email: {email}
🗝️ Pass: {password}
🖥️ Perfil: {perfil}
📌 PIN: {pin}

Guardá estos datos. ¡Saludos!'
WHERE key = 'credenciales_actualizadas' AND variant = 3;

-- -----------------------------------------------

UPDATE whatsapp_templates
SET message = 'Hola {nombre}! 🙌

Detectamos que tu cuenta de *{plataforma}* dejó de funcionar. Ya te asignamos una nueva:

📬 Email: {email}
🔑 Contraseña: {password}
📺 Perfil: {perfil}
🔒 PIN: {pin}

Escribinos si necesitás ayuda.'
WHERE key = 'credenciales_actualizadas' AND variant = 4;

-- -----------------------------------------------

UPDATE whatsapp_templates
SET message = 'Buenas {nombre} ✌️

Tu *{plataforma}* anterior no estaba funcionando, así que te asignamos una cuenta nueva:

📧 Correo: {email}
🔐 Clave: {password}
👤 Perfil asignado: {perfil}
🔢 PIN: {pin}

Cualquier duda nos avisás.'
WHERE key = 'credenciales_actualizadas' AND variant = 5;
