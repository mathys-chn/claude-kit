#!/bin/bash
# claude-kit · installation en double-clic (macOS)
# Premier lancement : clic droit → Ouvrir (macOS demande de confirmer un script téléchargé).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js n'est pas installé. Télécharge-le sur https://nodejs.org (version LTS),"
  echo "  puis relance ce fichier."
  echo ""
  read -r -p "  Appuie sur Entrée pour fermer…"
  exit 1
fi
node install.js "$@"
echo ""
read -r -p "  Appuie sur Entrée pour fermer…"
