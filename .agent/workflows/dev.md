---
description: Comandos de desarrollo para ClickPar
---

// turbo-all

## Servidor de Desarrollo

1. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

## Build y Verificación

2. Compilar el proyecto:
```bash
npm run build
```

3. Verificar linting:
```bash
npm run lint
```

## Base de Datos

4. Generar tipos de Supabase:
```bash
npx supabase gen types typescript --project-id <PROJECT_ID> > lib/supabase/database.types.ts
```

## Git

5. Ver estado de cambios:
```bash
git status
```

6. Ver diferencias:
```bash
git diff
```

## Utilidades

7. Instalar dependencias:
```bash
npm install
```

8. Limpiar caché de Next.js:
```bash
rm -rf .next
```
