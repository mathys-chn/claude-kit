---
name: refactor
description: Refactorise du code sans changer son comportement (lisibilité, duplication, découpage). À utiliser pour "/refactor", "nettoie ce code", "simplifie".
argument-hint: "<fichier ou zone>"
---

# /refactor

Cible : $ARGUMENTS

Règle d'or : **comportement identique**.
1. Vérifie qu'il existe des tests qui couvrent la zone ; sinon propose d'en écrire avant.
2. Repère : duplication, fonctions trop longues, noms flous, code mort, imbrications profondes, abstractions inutiles.
3. Propose la liste des changements, puis applique-les par petites étapes.
4. Relance tests / typecheck après chaque étape.
5. Résumé avant/après (lignes, complexité, ce qui est plus clair).
