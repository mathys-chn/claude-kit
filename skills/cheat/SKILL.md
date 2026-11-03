---
name: cheat
description: Affiche l'aide-mémoire claude-kit (commandes, raccourcis, légende de la statusline). À utiliser pour "/cheat", "aide", "quelles commandes j'ai".
---

Affiche ce tableau tel quel, puis demande si l'utilisateur veut des détails sur un point :

**Skills claude-kit**
| Commande | Rôle |
|---|---|
| `/plan <tâche>` | Méthode APEX : analyser → planifier → exécuter → examiner |
| `/fix <erreur>` | Trouve la cause racine et corrige, avec preuve |
| `/review` | Revue de code (agent dédié) : bloquant / important / suggestions |
| `/test <cible>` | Écrit et fait passer des tests |
| `/refactor <cible>` | Nettoie sans changer le comportement |
| `/explain <sujet>` | Explique un fichier, un flux, un concept |
| `/commit` | Commit Conventional Commits propre |
| `/pr` | Branche + push + PR avec description |
| `/standup [période]` | Récap de ton travail, prêt à coller |
| `/onboard` | Découvre un repo et écrit son CLAUDE.md |
| `/kit` | Réglages : bande, couleurs, notifications, sécurité, automatisations |

**Agents** : `explorer` (cartographie le code), `code-reviewer`, `debugger`, `test-writer` — Claude les appelle tout seul, ou demande « utilise l'agent explorer pour… ».

**Raccourcis Claude Code**
| Touche | Action |
|---|---|
| `Shift+Tab` | Cycle des modes : normal → auto-accept → plan |
| `Esc` / `Esc Esc` | Interrompre / revenir à un message précédent |
| `Ctrl+R` | Rechercher dans l'historique |
| `Ctrl+O` | Voir le détail (transcript) |
| `@fichier` | Ajouter un fichier au contexte |
| `!cmd` | Lancer une commande shell directement |
| `#note` | Ajouter une note à la mémoire (CLAUDE.md) |
| `/compact` · `/clear` | Compresser · vider le contexte |
| `/model` · `/cost` · `/context` | Modèle · coût · détail du contexte |

**Statusline** : `● indexés  ✚ modifiés  ? non suivis  ≡ stash  ↑ à pousser  ↓ à tirer` · barre de contexte verte < 50 % < jaune < 70 % < orange < 85 % < rouge (pense à `/compact`).
