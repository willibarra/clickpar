# Plan de Integración WhatsApp - ClickPar

## Tecnología: Evolution API v2 (Self-hosted en Dokploy)

---

## Fase 1: Infraestructura (Evolution API)
- [ ] Instalar Evolution API como servicio en Dokploy
- [ ] Dominio: wa.clickpar.shop (HTTPS)
- [ ] Crear 2 instancias: clickpar-1, clickpar-2
- [ ] Conectar ambos números vía QR
- [ ] Crear lib/whatsapp.ts (cliente API)

## Fase 2: Backend - Módulo WhatsApp
### lib/whatsapp.ts
- [ ] Clase WhatsAppService
  - connectInstance(name) → genera QR
  - sendText(phone, message, instancePreference?)
  - sendImage(phone, imageUrl, caption)
  - getInstances() → estado de cada número
  - getQR(instanceName) → QR para escanear
- [ ] Lógica de balanceo:
  - mode: 'alternate' | 'instance-1' | 'instance-2' | 'manual'
  - Guardar preferencia en tabla `settings`
  - Round-robin: contador en tabla `whatsapp_send_log`

### lib/whatsapp-templates.ts
- [ ] Cargar templates desde tabla `whatsapp_templates`
- [ ] Variables dinámicas: {nombre}, {plataforma}, {email}, {password}, {perfil}, {fecha}, {precio}
- [ ] Función renderTemplate(templateKey, variables) → string

## Fase 3: Base de datos
### Tabla: whatsapp_templates
```sql
CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,        -- 'venta_credenciales', 'pre_vencimiento', etc.
  name TEXT NOT NULL,               -- 'Credenciales de Venta'
  message TEXT NOT NULL,            -- 'Hola {nombre}! Tus credenciales...'
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabla: whatsapp_send_log
```sql
CREATE TABLE whatsapp_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  instance_used TEXT,               -- 'clickpar-1' o 'clickpar-2'
  status TEXT DEFAULT 'sent',       -- 'sent', 'delivered', 'failed'
  customer_id UUID REFERENCES customers(id),
  sale_id UUID REFERENCES sales(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabla: whatsapp_settings
```sql
CREATE TABLE whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_mode TEXT DEFAULT 'alternate',  -- 'alternate', 'instance-1', 'instance-2'
  instance_1_name TEXT DEFAULT 'clickpar-1',
  instance_2_name TEXT DEFAULT 'clickpar-2',
  auto_send_credentials BOOLEAN DEFAULT true,
  auto_send_pre_expiry BOOLEAN DEFAULT true,
  auto_send_expiry BOOLEAN DEFAULT true,
  auto_send_credential_change BOOLEAN DEFAULT true,
  pre_expiry_days INTEGER DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Fase 4: Templates por defecto
```
KEY: venta_credenciales
"¡Hola {nombre}! 🎬

Tus credenciales de *{plataforma}* están listas:

📧 Email: {email}
🔑 Contraseña: {password}
📺 Perfil: {perfil}

✅ Válido hasta: {fecha_vencimiento}

¡Gracias por tu compra! Si tenés dudas, escribinos."

---

KEY: pre_vencimiento
"¡Hola {nombre}! ⏰

Tu suscripción de *{plataforma}* vence en {dias_restantes} días ({fecha_vencimiento}).

💰 Renovar: Gs. {precio}

¿Querés renovar? Respondé a este mensaje."

---

KEY: vencimiento_hoy
"Hola {nombre} 👋

Tu servicio de *{plataforma}* venció hoy.

💰 Precio renovación: Gs. {precio}

Si querés seguir disfrutando, respondé 'RENOVAR' o contactanos."

---

KEY: credenciales_actualizadas
"Hola {nombre} 🔄

Las credenciales de tu *{plataforma}* fueron actualizadas:

📧 Nuevo email: {email}
🔑 Nueva contraseña: {password}
📺 Tu perfil: {perfil}

Si tenés dudas, escribinos."
```

## Fase 5: Integración con flujos existentes

### 5a. Venta confirmada (webhook Kommo + manual)
- Después de crear la venta → enviar template 'venta_credenciales'
- Usar el WhatsApp del cliente registrado

### 5b. Cambio de credenciales de cuenta madre
- Al editar email/password de una mother_account:
  1. Obtener todos los slots activos de esa cuenta
  2. Separar: al día (sale activa no vencida) vs morosos (vencidos)
  3. Enviar 'credenciales_actualizadas' a los que están al día
  4. Mostrar modal: "Estos {n} clientes están vencidos: [lista]. ¿Liberar sus slots?"
  5. Si confirma → liberar slots (deactivate sales, free slots)
  6. Slots quedan disponibles para nueva venta

### 5c. Cron de vencimientos
- Cron diario (o cada 12h):
  - 3 días antes → enviar 'pre_vencimiento'
  - Día de vencimiento → enviar 'vencimiento_hoy'
  - Guardar en whatsapp_send_log para no enviar duplicados

## Fase 6: UI del Panel Admin

### Ajustes → WhatsApp
- **Conexiones**: Ver estado de cada número, QR para reconectar
- **Modo de envío**: Selector (Alternar / Solo Nº1 / Solo Nº2)
- **Templates**: Editor de cada mensaje con preview
- **Historial**: Log de mensajes enviados

### Inventario → Editar Cuenta
- Al cambiar email/password:
  - Checkbox: "Notificar usuarios activos por WhatsApp"
  - Si marca → enviar automático
  - Mostrar modal de liberación de slots vencidos

## Fase 7: Producción
- [ ] DNS: wa.clickpar.shop → 76.13.163.100
- [ ] Evolution API en Dokploy con HTTPS
- [ ] Variables de entorno: EVOLUTION_API_URL, EVOLUTION_API_KEY
- [ ] Deploy completo
- [ ] Escanear QR con ambos números
