# Changelog

## 3.4.0 — 2026-11-03

- **Mises à jour automatiques** : à l'ouverture de Claude (au plus toutes les 6 h), le kit vérifie GitHub en arrière-plan et installe la nouvelle version tout seul, réglages conservés. Modes Auto, Me prévenir ou Désactivé dans /kit → À propos.
- **Notes de version** dans /kit → À propos, avec les boutons Vérifier et Mettre à jour.
- **Pastille dans la bande** quand une version est disponible ou vient d'être installée.
- Le plugin **Stream Deck** est mis à jour avec le kit s'il est installé.
- L'installeur demande à la première installation si tu veux les mises à jour automatiques ; il ne garde que les 15 dernières sauvegardes.

## 3.3.1 — 2026-11-03

- **Stream Deck** : les touches « Limite semaine » et « Budget mensuel » affichaient la vue d'ensemble. L'app Stream Deck renvoie les identifiants d'action en minuscules ; ils le sont désormais dans le manifeste, et le plugin les reconnaît sans tenir compte de la casse (plugin v1.0.1).

## 3.3.0 — 2026-11-03

- **Onglet Stream Deck dans `/kit`** : détecte l'app et le plugin, installe, met à jour ou désinstalle en un clic, avec le guide pour ajouter les touches.
- **Installation en double-clic** : `Installer.command` (macOS) et `Installer.cmd` (Windows).
- L'installeur dépose le plugin Stream Deck dans le kit au lieu de l'imposer ; `--streamdeck` l'installe directement.
- Réglage « Publier pour le Stream Deck » (section `streamdeck` de `config.json`).

## 3.2.0 — 2026-11-03

- **Plugin Stream Deck** (`streamdeck/`) : 8 touches en français (limite 5 h, semaine, budget, contexte, coût, git, statut de Claude, vue d'ensemble), réglables touche par touche ; fonctionne avec l'app Claude, VS Code et le terminal. Zéro dépendance.
- La bande publie l'état de chaque session dans `claude-kit/sessions/<id>.json` (lu par le Stream Deck).
- L'installeur copie le plugin si l'app Stream Deck est présente (`--no-streamdeck` pour l'éviter).

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
