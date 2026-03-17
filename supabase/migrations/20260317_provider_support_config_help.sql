-- Add enriched help columns to provider_support_config
ALTER TABLE provider_support_config
  ADD COLUMN IF NOT EXISTS help_steps jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faq_items jsonb DEFAULT '[]'::jsonb;

-- Update existing providers with personalized help content

-- Netflix - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a netflix.com con el correo y contraseña de tu panel",
  "Seleccioná el perfil que te fue asignado",
  "Si te pide código hogar, seleccioná \"estoy de viaje\" (TV) o \"ver temporalmente\" (Cel)",
  "Seleccioná \"Enviar Email\"",
  "Volvé a tu panel ClickPar → botón \"Consultar Código\"",
  "Colocá el correo de tu Netflix → CONSULTAR",
  "Ingresá el código que aparece. ⚠️ SOLO 1 DISPOSITIVO a la vez"
]'::jsonb,
    faq_items = '[
  {"q": "¿Me pide código hogar, qué hago?", "a": "Seguí los pasos de ayuda arriba. Usá el botón \"Consultar Código\" en tu panel. ⚠️ Solo podés activar 1 dispositivo."},
  {"q": "¿Puedo usar en Smart TV y celular a la vez?", "a": "No, solo podés usar 1 dispositivo a la vez con tu perfil."},
  {"q": "¿Cambió la contraseña?", "a": "Las contraseñas pueden cambiar periódicamente. Siempre consultá tu panel para ver la contraseña actualizada."},
  {"q": "¿Cuándo vence mi servicio?", "a": "Revisá tu panel en la sección \"Servicios\", ahí aparece la fecha de vencimiento."}
]'::jsonb
WHERE platform = 'Netflix' AND supplier_name = 'POP PREMIUM';

-- Netflix - CLICKPAR
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a netflix.com con el correo y contraseña de tu panel",
  "Seleccioná el perfil asignado",
  "Si tenés algún problema, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿La contraseña no funciona?", "a": "Las contraseñas pueden actualizarse. Revisá tu panel para la contraseña actual. Si sigue sin funcionar, escribinos por WhatsApp."},
  {"q": "¿Cuándo vence mi servicio?", "a": "Revisá tu panel en la sección \"Servicios\", ahí aparece la fecha de vencimiento."}
]'::jsonb
WHERE platform = 'Netflix' AND supplier_name = 'CLICKPAR';

-- Netflix - Vivas Play
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a netflix.com con el correo y contraseña de tu panel",
  "Seleccioná el perfil asignado",
  "Si tenés algún problema, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿La contraseña no funciona?", "a": "Revisá tu panel para la contraseña actual. Si sigue sin funcionar, contactá soporte."}
]'::jsonb
WHERE platform = 'Netflix' AND supplier_name = 'Vivas Play';

-- Disney+ - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a disneyplus.com con el correo y contraseña de tu panel",
  "Seleccioná tu perfil asignado",
  "Si te pide código de verificación, usá el botón \"Consultar Código\" en tu panel"
]'::jsonb,
    faq_items = '[
  {"q": "¿Me pide verificación?", "a": "Usá el botón \"Consultar Código\" en tu panel para obtener el código."},
  {"q": "¿Puedo descargar contenido?", "a": "Sí, podés descargar dentro de tu perfil asignado."}
]'::jsonb
WHERE platform = 'Disney+' AND supplier_name = 'POP PREMIUM';

-- HBO Max - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a max.com con el correo y contraseña de tu panel",
  "Seleccioná tu perfil asignado",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿HBO Max o Max?", "a": "HBO Max ahora se llama Max. Ingresá a max.com con las mismas credenciales."},
  {"q": "¿Puedo usar en varios dispositivos?", "a": "Solo podés usar 1 dispositivo a la vez con tu perfil."}
]'::jsonb
WHERE platform = 'HBO Max' AND supplier_name = 'POP PREMIUM';

-- Amazon Prime Video - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a primevideo.com con el correo y contraseña de tu panel",
  "Seleccioná tu perfil asignado",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿Incluye envíos de Amazon?", "a": "No, tu servicio es solo para streaming de Prime Video."},
  {"q": "¿No me deja iniciar sesión?", "a": "Asegurate de usar primevideo.com, no amazon.com. Si sigue fallando, consultá tu panel por la contraseña actualizada."}
]'::jsonb
WHERE platform = 'Amazon Prime Video' AND supplier_name = 'POP PREMIUM';

-- Amazon Prime Video - G2G
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a primevideo.com con el correo y contraseña de tu panel",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿No me deja iniciar sesión?", "a": "Revisá tu panel para la contraseña actual. Si sigue fallando, contactá soporte."}
]'::jsonb
WHERE platform = 'Amazon Prime Video' AND supplier_name = 'G2G';

-- Spotify Premium (all suppliers)
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a open.spotify.com o la app con el correo y contraseña de tu panel",
  "Si no funciona, cerrá sesión completamente y volvé a iniciar",
  "No cambies la contraseña ni los datos de la cuenta"
]'::jsonb,
    faq_items = '[
  {"q": "¿Puedo descargar música?", "a": "Sí, con Spotify Premium podés descargar música para escuchar offline."},
  {"q": "¿Se puede usar en varios dispositivos?", "a": "Sí, pero solo podés reproducir en 1 dispositivo a la vez."}
]'::jsonb
WHERE platform LIKE 'Spotify%';

-- YouTube Premium
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a youtube.com con el correo y contraseña de tu panel",
  "Si no funciona, cerrá sesión y volvé a iniciar",
  "No cambies la contraseña ni los datos de la cuenta"
]'::jsonb,
    faq_items = '[
  {"q": "¿Incluye YouTube Music?", "a": "Sí, YouTube Premium incluye YouTube Music sin anuncios."},
  {"q": "¿Puedo descargar videos?", "a": "Sí, podés descargar videos para ver offline desde la app."}
]'::jsonb
WHERE platform = 'YouTube Premium';

-- Crunchyroll - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a crunchyroll.com con el correo y contraseña de tu panel",
  "Si tenés problemas para iniciar sesión, contactá soporte"
]'::jsonb,
    faq_items = '[
  {"q": "¿Puedo ver en español?", "a": "Sí, Crunchyroll tiene subtítulos y doblaje en español para la mayoría del contenido."}
]'::jsonb
WHERE platform = 'Crunchyroll' AND supplier_name = 'POP PREMIUM';

-- Paramount+ - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a paramountplus.com con el correo y contraseña de tu panel",
  "Seleccioná tu perfil asignado",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿Puedo ver en Smart TV?", "a": "Sí, Paramount+ está disponible en Smart TV, celular, tablet y computadora."}
]'::jsonb
WHERE platform = 'Paramount+' AND supplier_name = 'POP PREMIUM';

-- FLUJO TV
UPDATE provider_support_config
SET help_steps = '[
  "Descargá la app de FLUJO TV en tu dispositivo",
  "Ingresá con las credenciales de tu panel",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿En qué dispositivos funciona?", "a": "FLUJO TV funciona en Smart TV, celular, tablet y TV Box."}
]'::jsonb
WHERE platform = 'FLUJOTV';

-- VIX
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a vix.com o descargá la app de ViX",
  "Iniciá sesión con el correo y contraseña de tu panel",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿ViX tiene contenido en español?", "a": "Sí, ViX tiene todo su contenido en español."}
]'::jsonb
WHERE platform = 'Vix';
