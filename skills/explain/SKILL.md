---
name: explain
description: Explique un fichier, une fonction, un dossier ou un concept du projet de façon claire, avec un schéma si utile. À utiliser pour "/explain", "c'est quoi ce code", "comment marche X".
argument-hint: "<fichier, fonction ou question>"
---

# /explain

Sujet : $ARGUMENTS

Explique en français, du général au particulier :
1. **En une phrase** : à quoi ça sert.
2. **Comment ça marche** : le flux principal (avec un mini schéma ASCII / mermaid si plusieurs composants interagissent).
3. **Les points clés** : fichiers et fonctions importants avec `chemin:ligne`.
4. **Pièges** : ce qui est surprenant, fragile ou mal nommé.
Adapte le niveau : concis si c'est simple, n'invente rien que tu n'as pas lu.
