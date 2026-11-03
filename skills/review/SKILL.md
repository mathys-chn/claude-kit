---
name: review
description: Revue de code approfondie des changements en cours ou d'une branche — bugs, sécurité, perf, lisibilité. À utiliser pour "/review", "relis mon code", "c'est bon pour merge ?".
argument-hint: "[branche, fichier ou numéro de PR]"
context: fork
agent: code-reviewer
---

Fais une revue de : ${ARGUMENTS:-les changements non commités et la branche courante vs main}.

Rends un rapport en français :

## Verdict
✅ prêt à merger / ⚠️ à corriger / ❌ à revoir — en une phrase.

## 🔴 Bloquant
## 🟠 Important
## 🟡 Suggestions

Pour chaque point : `fichier:ligne`, le problème, **un scénario concret qui casse**, et le correctif proposé (code). Pas de remarques vagues, pas de nitpicks de style si un formateur existe.
