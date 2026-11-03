---
name: fix
description: Diagnostique et corrige un bug ou une erreur (stack trace, test qui échoue, comportement inattendu). À utiliser pour "/fix", "ça marche pas", ou quand l'utilisateur colle une erreur.
argument-hint: "<erreur, symptôme ou test>"
---

# /fix

Problème : $ARGUMENTS

1. **Reproduire** : trouve la commande ou le test qui montre le bug. Si impossible, dis-le.
2. **Localiser** : remonte la stack trace, lis le code réel (pas de supposition), `git log -p` sur la zone si c'est une régression.
3. **Comprendre la cause racine** — explique-la en 1-2 phrases avant de toucher au code. Pas de rustine qui masque le symptôme.
4. **Corriger** au plus petit endroit possible.
5. **Prouver** : relance la repro → elle passe. Ajoute un test de non-régression si le projet a des tests.
6. Résume : cause, correctif, preuve.
