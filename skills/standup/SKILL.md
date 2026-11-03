---
name: standup
description: Résumé de ce qui a été fait (commits, PR, fichiers) sur une période, prêt à coller en daily ou dans un rapport client. À utiliser pour "/standup", "qu'est-ce que j'ai fait hier", "récap de la semaine".
argument-hint: "[période: hier | semaine | 3 days ago…]"
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(gh pr list:*), Bash(git config:*)
---

# /standup

Période : ${ARGUMENTS:-depuis hier}

1. `git log --since=<période> --author="$(git config user.email)" --stat --no-merges` (toutes branches : `--all`).
2. Si `gh` est dispo : PR ouvertes / mergées sur la période.
3. Rédige :

**✅ Fait**
- (regroupé par fonctionnalité, en langage humain — pas la liste brute des commits)

**🚧 En cours**
- (branches non mergées, modifs non commitées)

**⏭️ Prochaines étapes**
- (déduites des TODO / PR ouvertes)

Court, lisible par un non-développeur.
