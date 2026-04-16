#!/bin/bash
SUPABASE_URL="https://db.clickpar.shop"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg"

patch_account() {
  local email="$1"
  local country="$2"
  local encoded_email
  encoded_email=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$email'))")
  local result
  result=$(curl -s -X PATCH \
    "${SUPABASE_URL}/rest/v1/mother_accounts?email=ilike.${encoded_email}" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "{\"notes\": \"Pais: ${country}\"}")

  if echo "$result" | grep -q '"id"'; then
    echo "✅ ${email} → Pais: ${country}"
  elif [ "$result" = "[]" ]; then
    echo "⚠️  NO ENCONTRADO: ${email}"
  else
    echo "❌ ERROR: ${email} → $result"
  fi
}

patch_account "tiki_foreign.0a@icloud.com" "Brasil"
patch_account "Jpdlod+gissette.medina@icloud.com" "Estados Unidos"
patch_account "amoebic.violins-1y@icloud.com" "Estados Unidos"
patch_account "donlastnamelong@nyckmail.com" "Estados Unidos"
patch_account "gabriela_3304@nyckz.com" "Guatemala"
patch_account "Jpdlod+siddharthkaul@icloud.com" "Estados Unidos"
patch_account "slices_refill.0a@icloud.com" "Canadá"
patch_account "eduardoalex2004@nyckmail.net" "Estados Unidos"
patch_account "progres55@nyckz.com" "Polonia"
patch_account "nigh_hefty_0j@icloud.com" "Polonia"
patch_account "markup_pears_9r@icloud.com" "Estados Unidos"
patch_account "kstayman91@nyckz.com" "Estados Unidos"
patch_account "nivel.madera.01@icloud.com" "Reino Unido"
patch_account "metalico-07amapola@icloud.com" "Francia"
patch_account "reader_digger.03@icloud.com" "Alemania"
patch_account "craigtroj@nyckz.com" "Estados Unidos"
patch_account "pons.prior_0j@icloud.com" "Estados Unidos"
patch_account "mrybak.17pl@nyckz.com" "Polonia"
patch_account "gherkin.sun_0q@icloud.com" "Estados Unidos"
patch_account "pwjg46-45pl@nyckz.com" "Polonia"

echo ""
echo "✔ Proceso completado."
