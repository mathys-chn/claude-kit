# Contribuer

Merci de ton intérêt ! Quelques repères :

- **Zéro dépendance** : hooks et statusline en Node pur (CommonJS, Node 18+), le mod en TypeScript sans paquet externe.
- **Un réglage = une entrée dans `hooks/lib/config.js`** (valeur par défaut) **et dans `DEFAULT_CONFIG` de `mods/kit-band/hooks/register.tsx`**, plus son contrôle dans le panneau `/kit`.
- **Tester le mod** :
  ```bash
  claude plugin validate mods/kit-band
  claude plugin test mods/kit-band
  ```
- **Tester le plugin Stream Deck** (un faux Stream Deck lance le vrai plugin) :
  ```bash
  node --test streamdeck/test/*.test.js
  node streamdeck/build.js   # refait streamdeck/dist/claude-kit.streamDeckPlugin
  ```
- **Tester l'installeur sans toucher à ta config** :
  ```bash
  CLAUDE_CONFIG_DIR=/tmp/claude-test node install.js --name=Test
  CLAUDE_CONFIG_DIR=/tmp/claude-test node install.js --uninstall
  ```
- **Publier une version** : incrémente `VERSION` et ajoute sa section en tête de `CHANGELOG.md` (`## x.y.z — date`, puces `- `). C'est ce que lisent la mise à jour automatique et les notes de version de `/kit`. Si le plugin Stream Deck change, incrémente aussi `Version` dans son `manifest.json` et lance `node streamdeck/build.js`.
- **Tester la mise à jour** (faux GitHub local) : `node --test tests/*.test.js`
- Les textes visibles sont en français, les messages de commit en anglais (Conventional Commits).
