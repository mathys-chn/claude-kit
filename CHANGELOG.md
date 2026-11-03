# Changelog

## 3.1.0 — 2026-11-03

- **Synchronisation entre onglets** : un réglage changé dans un onglet Claude s'applique dans tous les autres en moins de 2 secondes.
- **Limites partagées** : les limites 5 h / semaine reçues par un onglet s'affichent dans tous (`claude-kit/limits.json`).

## 3.0.0 — 2026-11-03

- **Réglages unifiés** : un seul fichier `~/.claude/claude-kit/config.json` pour la bande, les hooks et la statusline.
- **Panneau `/kit`** refait en six onglets : Bande, Couleurs, Notifications, Sécurité, Automatisations, À propos.
- **Notifications réglables** : événements, durée minimale, son et choix du son, heures calmes.
- **Garde-fous réglables** : blocage, confirmation, protection des secrets et journal, séparément.
- **Formatage réglable** par langage ; nombre de commits du résumé de début de session.
- La bande s'appelle maintenant **kit-band** (ex-`mch-band`, migrée automatiquement à l'installation).
- L'installeur demande le nom à afficher (`--name=` pour le passer directement) et migre l'ancien format de réglages.

## 2.0.0

- Bande au-dessus du prompt : limites 5 h / semaine / budget avec projection, contexte, coût, git, dernier tour.
- Styles de puces Arrondi, Carré, Contour, Texte ; thèmes de couleur.

## 1.0.0

- Statusline du terminal, hooks guard / notify / format / session-start, 11 skills, 4 agents, 2 styles de réponse.
