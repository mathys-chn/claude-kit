---
name: test
description: Écrit ou complète des tests pour un fichier/une fonction, puis les fait passer. À utiliser pour "/test", "ajoute des tests", "couvre ce code".
argument-hint: "<fichier ou fonction>"
---

# /test

Cible : ${ARGUMENTS:-les fichiers modifiés récemment}

1. Détecte le framework (vitest, jest, pytest, go test, playwright…) et copie le style des tests existants.
2. Liste les cas : nominal, limites (vide, null, très grand, unicode), erreurs, et le bug que ce code est le plus susceptible d'avoir.
3. Écris des tests lisibles, un comportement par test, sans mocker ce qui n'a pas besoin de l'être.
4. Lance-les. Si un test échoue, détermine si c'est le test ou le code qui a tort — et dis-le clairement, ne modifie pas le code pour faire plaisir au test.
5. Résumé : nombre de tests, cas couverts, éventuels bugs trouvés.
