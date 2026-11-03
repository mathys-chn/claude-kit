---
name: plan
description: Méthode APEX (Analyser → Planifier → Exécuter → eXaminer) pour une feature ou un changement non trivial. À utiliser pour "/plan", une grosse tâche, ou quand l'utilisateur veut réfléchir avant de coder.
argument-hint: "<la tâche à réaliser>"
---

# /plan — APEX

Tâche : $ARGUMENTS

## A — Analyser
- Explore le code concerné (délègue à l'agent `explorer` si c'est large). Identifie les fichiers, patterns existants, conventions, tests.
- Liste les inconnues. S'il y a une vraie ambiguïté qui change la solution, pose **une** question groupée ; sinon choisis le défaut raisonnable et dis-le.

## P — Planifier
Présente un plan court :
- Objectif en une phrase
- Étapes numérotées (fichier → changement)
- Risques & cas limites
- Comment on vérifiera que ça marche
**Attends la validation** avant de coder (sauf si l'utilisateur a dit "fonce").

## E — Exécuter
- Suis le plan étape par étape, en réutilisant le code existant plutôt qu'en le dupliquant.
- Petits changements, cohérents avec le style du repo.

## X — eXaminer
- Lance lint / typecheck / tests disponibles. Corrige jusqu'à ce que ce soit vert.
- Résumé final : ce qui a changé, comment c'est vérifié, ce qui reste à faire.
