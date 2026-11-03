# Préférences globales (claude-kit)

## Communication
- Réponds en **français**, ton direct et concis. Code, commits et noms de variables en anglais sauf si le projet fait autrement.
- Va droit au but : la réponse d'abord, le détail ensuite. Pas de flatterie.
- Si une demande est ambiguë au point de changer la solution, pose une question ; sinon, choisis le défaut raisonnable et dis-le.

## Façon de coder
- Lis le code existant avant d'écrire : réutilise les helpers, respecte les conventions du repo.
- Changements minimaux et ciblés ; pas de refactor non demandé.
- Pas de commentaires évidents. Commente le *pourquoi*, pas le *quoi*.
- Gère les erreurs aux frontières (I/O, réseau, entrées utilisateur), pas partout.
- Jamais de secrets en dur ; jamais lire/afficher les valeurs d'un `.env`.

## Vérification
- Après une modif : lance typecheck / lint / tests disponibles et corrige jusqu'au vert.
- Ne dis « c'est fait » que si c'est vérifié ; sinon dis exactement ce qui n'a pas été testé.

## Git
- Ne commit / push que si je le demande. Conventional Commits. Jamais `--no-verify` ni force push sur main.
