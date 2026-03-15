# Guía: Workflow N8N - Mensajes de Renovación con IA

## Workflow 1: Generación de Mensaje AI

Este workflow recibe datos del cron de renovaciones y genera un mensaje único con IA.

### Configuración paso a paso

#### Nodo 1: Webhook Trigger
- **Tipo**: Webhook
- **Método**: POST
- **Path**: `renewal-message`
- **URL final**: `https://n8n.clickpar.shop/webhook/renewal-message`
- **Response**: "Respond Immediately" (para no bloquear el cron)

El cron envía este JSON:
```json
{
  "customer": { "id": "uuid", "name": "Juan", "phone": "0981123456", "whatsapp_instance": "clickpar-1" },
  "sale": { "id": "uuid", "platform": "Netflix", "platform_display": "Netflix Premium", "amount_gs": 25000, "end_date": "2026-03-15" },
  "type": "pre_expiry",
  "instanceName": "clickpar-1",
  "timestamp": "2026-03-14T20:00:00Z"
}
```

---

#### Nodo 2: HTTP Request - Obtener métodos de pago
- **Tipo**: HTTP Request
- **Método**: GET
- **URL**: `https://clickpar.shop/api/n8n/payment-methods`
- **Headers**: `x-n8n-secret` = `clickpar-n8n-2024`
- **On Error**: Continue

---

#### Nodo 3: Code - Construir Prompt

```javascript
const customer = $('Webhook').item.json.customer;
const sale = $('Webhook').item.json.sale;
const type = $('Webhook').item.json.type;
const methods = $('HTTP Request').item.json.methods || [];

// Tipo de urgencia
const urgencyMap = {
  'pre_expiry': 'El servicio vence MAÑANA',
  'expiry_today': 'El servicio vence HOY',
  'expired_yesterday': 'El servicio ya venció AYER'
};
const urgency = urgencyMap[type] || 'El servicio está por vencer';

// Lista de métodos de pago
const methodsList = methods.map(m => `${m.emoji} ${m.name}`).join('\n');

const systemPrompt = `Sos un asistente de cobranzas de ClickPar, una empresa de servicios de streaming en Paraguay. 
Tu tono es amigable, cercano, paraguayo (usá "vos", "che", expresiones locales cuando sea natural).
REGLAS ESTRICTAS:
- Generá un mensaje ÚNICO. NUNCA repitas el mismo saludo o estructura.
- Usá formato WhatsApp: *negrita* para resaltar.
- Máximo 500 caracteres.
- NO uses markdown, solo formato WhatsApp.
- Variá el saludo: a veces usá emoji, a veces no. A veces saludá por nombre, a veces no.
- Sé creativo pero profesional. Podés usar humor ligero.
- SIEMPRE terminá preguntando cómo quiere pagar y listá las opciones.`;

const userPrompt = `Generá un mensaje de WhatsApp para cobrar una renovación.

DATOS:
- Cliente: ${customer.name}
- Plataforma: ${sale.platform_display}
- Precio: Gs. ${sale.amount_gs.toLocaleString('es-PY')}
- Situación: ${urgency}
- Fecha vencimiento: ${sale.end_date}

MÉTODOS DE PAGO DISPONIBLES:
${methodsList}

Recordá: cada mensaje debe ser DIFERENTE. Variá el tono, el saludo, y la forma de pedir el pago.`;

return {
  systemPrompt,
  userPrompt,
  customer,
  sale,
  type
};
```

---

#### Nodo 4: HTTP Request - AI (Groq)
- **Tipo**: HTTP Request
- **Método**: POST
- **URL**: `https://api.groq.com/openai/v1/chat/completions`
- **Authentication**: Header Auth
  - **Name**: `Authorization`
  - **Value**: `Bearer TU_GROQ_API_KEY`
- **Body (JSON)**:
```json
{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    { "role": "system", "content": "={{ $json.systemPrompt }}" },
    { "role": "user", "content": "={{ $json.userPrompt }}" }
  ],
  "temperature": 0.95,
  "max_tokens": 300
}
```

---

#### Nodo 5: Code - Extraer respuesta

```javascript
const aiResponse = $input.first().json;
const message = aiResponse.choices?.[0]?.message?.content || '';
const customer = $('Code').item.json.customer;
const sale = $('Code').item.json.sale;
const instanceName = $('Webhook').item.json.instanceName || 'clickpar-1';

return {
  message: message.trim(),
  phone: customer.phone,
  instanceName,
  customerId: customer.id,
  saleId: sale.id,
  platform: sale.platform
};
```

---

#### Nodo 6: HTTP Request - Enviar WhatsApp
- **Tipo**: HTTP Request
- **Método**: POST
- **URL**: `http://103.199.185.138:50844/message/sendText/{{ $json.instanceName }}`
- **Headers**: `apikey` = `MXXQNLeNhHVVloPRLhz9xGMXyM43SqFx`
- **Body (JSON)**:
```json
{
  "number": "={{ $json.phone }}",
  "text": "={{ $json.message }}"
}
```

---

#### Nodo 7 (opcional): HTTP Request - Log en Supabase
- **Tipo**: HTTP Request
- **Método**: POST
- **URL**: `http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me/rest/v1/whatsapp_send_log`
- **Headers**:
  - `apikey`: (service role key)
  - `Authorization`: `Bearer (service role key)`
- **Body**:
```json
{
  "template_key": "n8n_ai_renewal",
  "phone": "={{ $json.phone }}",
  "message": "={{ $json.message }}",
  "instance_used": "={{ $json.instanceName }}",
  "status": "sent",
  "customer_id": "={{ $json.customerId }}",
  "sale_id": "={{ $json.saleId }}"
}
```

---

## Workflow 2: Respuesta del Cliente (Flujo de Pago)

Este workflow maneja las respuestas de los clientes al mensaje de renovación.

> **NOTA**: Este puede integrarse en el workflow existente "ClickPar WhatsApp AI" 
> agregando un branch condicional que detecte si el cliente tiene una renovación pendiente.

### Lógica del flujo:

1. **Webhook de Evolution API** recibe mensaje entrante del cliente
2. **Buscar en Supabase** si el teléfono del remitente tiene ventas activas próximas a vencer
3. **Si tiene renovación pendiente** → analizar intención con AI:
   - ¿Quiere renovar? → Enviar opciones de pago
   - ¿Eligió un método? → Enviar instrucciones de ese método
   - ¿Pregunta algo? → Responder con AI
4. **Si NO tiene renovación** → pasar al bot AI general

### Nodo clave: Analizar intención

Prompt sugerido para la IA:
```
Analizá el mensaje del cliente y clasificá su intención en una de estas categorías:
- RENOVAR: quiere renovar (dice "sí", "quiero", "renuevo", "dale", etc.)
- PAGO_TIGO: eligió Tigo Money
- PAGO_PERSONAL: eligió Billetera Personal  
- PAGO_BANCO: eligió Transferencia Bancaria
- PAGO_BINANCE: eligió Binance Pay
- NO_RENOVAR: no quiere renovar
- PREGUNTA: tiene una pregunta

Respondé SOLO con la categoría, sin explicación.

Mensaje del cliente: "{mensaje}"
```

### Nodo clave: Enviar instrucciones de pago

Cuando la intención es `PAGO_*`:
1. Hacer GET a `/api/n8n/payment-methods?key=tigo_money`
2. Enviar las instrucciones al cliente por WhatsApp
3. Agregar mensaje: "*Cuando envíes el pago, mandanos la captura por acá y renovamos tu servicio al toque* ✅"

---

## Activación

Para activar los mensajes AI, cambiá en Supabase:
```sql
UPDATE app_config SET value = 'true' WHERE key = 'use_n8n_ai';
```

O para desactivar (vuelve a templates estáticos):
```sql
UPDATE app_config SET value = 'false' WHERE key = 'use_n8n_ai';
```
