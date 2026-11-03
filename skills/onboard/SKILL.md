---
name: onboard
description: Fait le tour d'un projet inconnu et génère/actualise son CLAUDE.md (stack, commandes, architecture, conventions). À utiliser pour "/onboard", en arrivant sur un nouveau repo.
---

# /onboard

1. Lis : README, package.json / pyproject / go.mod / Cargo.toml, configs (tsconfig, eslint, biome, docker, CI), structure des dossiers (2 niveaux).
2. Identifie : stack, commandes (dev, build, test, lint, migrations), architecture, conventions de code, variables d'env nécessaires (noms seulement, jamais les valeurs).
3. Crée ou mets à jour `CLAUDE.md` à la racine — **court** (< 80 lignes), uniquement ce qui n'est pas évident en lisant le code :

```md
# <Projet>
<1 phrase>

## Commandes
## Architecture
## Conventions
## Pièges connus
```
4. Affiche un résumé de 5 lignes du projet à l'utilisateur.
