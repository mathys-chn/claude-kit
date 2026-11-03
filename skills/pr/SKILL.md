---
name: pr
description: Prépare et ouvre une pull request GitHub (branche, push, titre, description). À utiliser quand l'utilisateur demande une PR ou "/pr".
argument-hint: "[branche cible, défaut: main]"
---

# /pr

1. Vérifie qu'on n'est pas sur la branche par défaut ; sinon crée une branche `type/description-courte`.
2. S'il reste des modifs non commitées, lance d'abord le workflow `/commit`.
3. `git log <base>..HEAD` + `git diff <base>...HEAD --stat` pour comprendre l'ensemble.
4. Cherche un template (`.github/pull_request_template.md`…) et respecte ses sections.
5. Description :
   - **Pourquoi** (contexte, problème)
   - **Quoi** (changements principaux, en puces)
   - **Comment tester** (étapes concrètes)
   - **Points d'attention** (risques, migrations, breaking changes)
6. `git push -u origin <branche>` puis `gh pr create --base <base> --title ... --body ...`.
7. Donne le lien de la PR.

Base : ${ARGUMENTS:-main}
