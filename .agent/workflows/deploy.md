---
description: Cómo subir cambios a producción (deploy a clickpar.shop)
---

# Deploy a Producción

## Requisitos previos
- GitHub CLI (`gh`) autenticado
- Acceso a Dokploy en `http://76.13.163.100:3000`
- Dominio: `clickpar.shop` (DNS en Hostinger)

## Pasos para deployer cambios

### 1. Verificar que el código compila localmente
// turbo
```bash
cd /Applications/ClickPar && npm run build
```
Si hay errores de build, corregilos antes de continuar.

### 2. Commit y push a GitHub
```bash
cd /Applications/ClickPar && git add -A && git commit -m "descripción del cambio" && git push origin main
```

### 3. Deploy en Dokploy
Ir a Dokploy → Proyecto-Sistema-ClickPar → clickpar-app → Pestaña "General" → Click "Deploy" → Confirmar.

**O usar el webhook de auto-deploy:**
```bash
curl -X POST "http://76.13.163.100:3000/api/deploy/B7G2eJua-C74j8FZ9Lb-P"
```

### 4. Verificar el deploy
// turbo
```bash
curl -sk -o /dev/null -w "HTTP %{http_code}" https://clickpar.shop/login
```
Debe devolver `HTTP 200`.

## Qué sucede internamente

Cuando hacés deploy:
1. **Git push** → Sube tu código a `github.com/willibarra/clickpar`
2. **Dokploy** → Clona el repo, ejecuta el `Dockerfile`:
   - Usa **Node.js 22** (alpine)
   - `npm ci` → instala dependencias
   - `npm run build` → compila Next.js en modo standalone
   - Crea imagen Docker optimizada (~200MB)
3. **Traefik** → Rutea `clickpar.shop` al contenedor, maneja HTTPS con Let's Encrypt
4. La app corre en el puerto 3000 dentro del contenedor

## Estructura del servidor (76.13.163.100)

```
Dokploy (puerto 3000 del host)
├── Proyecto-Sistema-ClickPar
│   ├── supabase (Base de datos + Auth + API)
│   │   └── URL: db.clickpar.shop (HTTPS)
│   └── clickpar-app (Next.js frontend + API)
│       └── URL: clickpar.shop (HTTPS)
```

## Variables de entorno (en Dokploy → Environment)

```env
NEXT_PUBLIC_SUPABASE_URL=https://db.clickpar.shop
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
KOMMO_CLIENT_ID=b270d946-...
KOMMO_CLIENT_SECRET=636n8pu...
KOMMO_SUBDOMAIN=clickrespuestas
KOMMO_REDIRECT_URI=https://clickpar.shop/api/kommo/callback
KOMMO_ACCESS_TOKEN=eyJ...
KOMMO_REFRESH_TOKEN=def...
GMAIL_CLIENT_ID=41899230842-...
GMAIL_CLIENT_SECRET=GOCSPX-...
GMAIL_REDIRECT_URI=https://clickpar.shop/api/gmail/callback
# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://103.199.185.138:50844
EVOLUTION_API_KEY=MXXQNLeNhHVVloPRLhz9xGMXyM43SqFx
# Google reCAPTCHA v3
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lft7HUsAAAAAFdaHtBu1sLE-h8Z0yjI8i96Lndg
RECAPTCHA_SECRET_KEY=6Lft7HUsAAAAAAM_ARvX4GxhlbTTAGX8Au1khs6W
```

## Troubleshooting

### Error "Failed to fetch" en login
- Verificar que `NEXT_PUBLIC_SUPABASE_URL` use HTTPS (no HTTP)
- Supabase debe estar accesible via HTTPS para evitar Mixed Content

### Error de Node.js version
- El Dockerfile usa Node 22 alpine. Si Next.js se actualiza, verificar compatibilidad.

### Tokens de Kommo expirados
Los tokens se refrescan automáticamente, pero si hay problemas:
```bash
# Refrescar token manualmente
node -e "
async function refresh() {
    const res = await fetch('https://clickrespuestas.kommo.com/oauth2/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.KOMMO_CLIENT_ID,
            client_secret: process.env.KOMMO_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: 'REFRESH_TOKEN_ACTUAL',
            redirect_uri: 'https://clickpar.shop/api/kommo/callback'
        })
    });
    console.log(await res.json());
}
refresh();
"
```
Luego actualizar los tokens en Dokploy → Environment y re-deployar.
