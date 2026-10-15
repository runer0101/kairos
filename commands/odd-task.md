---
description: Crea el documento de feature ODD para una tarea grande (odd/tasks/<nombre>.md)
agent: kairos
---
Crea el documento de feature ODD para la tarea: $ARGUMENTS

Plantilla de la configuración:

!`cat "$OPENCODE_CONFIG_DIR/odd/TEMPLATE.md"`

Reglas:
- El documento va en el repositorio actual: `odd/tasks/<nombre-en-kebab>.md`. Si ya existe, léelo y reconcílialo; no lo sobrescribas.
- Antes de escribir código, rellena objetivo, problema, alcance, restricciones y la checklist, con IDs estables y criterios de aceptación observables.
- Espeja el documento completo en memoria (engram, tema `odd/<nombre>/tasks`) si la herramienta de memoria está disponible; si no, deja la copia como pendiente dentro del documento.
- Este comando no implementa nada. Deja el documento listo y pregunta solo por las decisiones abiertas que cambien el alcance.
