---
description: Revisión del cambio actual con lentes 4R según tamaño y riesgo
agent: kairos-control
---
Revisa el cambio actual del repositorio.

Tamaño del cambio:

!`git diff --stat HEAD 2>&1 | tail -20`

Archivos nuevos sin seguimiento:

!`git ls-files --others --exclude-standard 2>&1 | head -30`

Elige las lentes que correspondan y di en una línea por qué:

| Contexto | Lente (subagente) |
|---|---|
| Nombres, estructura, mantenibilidad, refactors pequeños | `review-readability` |
| ¿Hace falta este código? Reutilización, stdlib, dependencias, simplificación | `review-readability` con la lente lean de `skills/ponytail-review/SKILL.md` |
| Comportamiento, estado, tests, determinismo, regresiones | `review-reliability` |
| Integración de procesos, fallos parciales, recuperación, dependencias degradadas | `review-resilience` |
| Seguridad, permisos, exposición o pérdida de datos, arquitectura, dependencias | `review-risk` |
| PR grande, ruta caliente o más de 400 líneas cambiadas | las cuatro |
| Solo documentación, comentarios o formato | ninguna: revisión manual |

Si el cambio añade código, abstracciones o dependencias, pásale también a `review-readability` la lente lean de `skills/ponytail-review/SKILL.md`: ¿hace falta?, ¿ya existe?, ¿lo resuelve la stdlib o la plataforma?, ¿qué se puede borrar? La lente lean nunca recorta validación, seguridad, accesibilidad ni tests.

Lanza las lentes elegidas en paralelo con la herramienta `task` (el `subagent_type` es el nombre de la lente) y pásales el alcance exacto. Cada lente devuelve hallazgos con severidad `BLOCKER | CRITICAL | WARNING | SUGGESTION`, archivo, línea y evidencia.

Consolida los hallazgos en una sola lista ordenada por severidad. No apliques correcciones: propón el siguiente paso y espera confirmación.
