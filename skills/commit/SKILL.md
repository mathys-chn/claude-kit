---
name: commit
description: Crée un commit propre (Conventional Commits) à partir des modifications en cours. À utiliser quand l'utilisateur demande de commiter, "/commit", ou de sauvegarder son travail dans git.
argument-hint: "[message ou indice optionnel]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*)
---

# /commit

1. `git status --short` et `git diff --staged` (puis `git diff` si rien n'est indexé).
2. Si rien n'est indexé, indexe les fichiers pertinents **un par un** (jamais `.env`, secrets, builds, fichiers > 1 Mo).
3. Si les changements couvrent plusieurs sujets sans lien, propose de faire plusieurs commits.
4. Regarde `git log --oneline -10` pour copier le style du repo (langue, préfixes, emojis).
5. Rédige le message :
   - `type(scope): résumé` à l'impératif, ≤ 72 caractères — types : feat, fix, refactor, perf, docs, test, chore, style, ci, build
   - corps facultatif : le **pourquoi**, pas le quoi
6. Commite. N'utilise **jamais** `--no-verify` ; si un hook échoue, corrige la cause et recommence.
7. Affiche le hash + le message. Ne push pas, sauf si on te le demande.

Indice de l'utilisateur : $ARGUMENTS
