---
description: Revisión del cambio actual con lentes 4R según tamaño y riesgo
agent: kairos
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
| Comportamiento, estado, tests, determinismo, regresiones | `review-reliability` |
| Integración de procesos, fallos parciales, recuperación, dependencias degradadas | `review-resilience` |
| Seguridad, permisos, exposición o pérdida de datos, arquitectura, dependencias | `review-risk` |
| PR grande, ruta caliente o más de 400 líneas cambiadas | las cuatro |
| Solo documentación, comentarios o formato | ninguna: revisión manual |

Lanza las lentes elegidas en paralelo con la herramienta `task` (el `subagent_type` es el nombre de la lente) y pásales el alcance exacto. Cada lente devuelve hallazgos con severidad `BLOCKER | CRITICAL | WARNING | SUGGESTION`, archivo, línea y evidencia.

Consolida los hallazgos en una sola lista ordenada por severidad. No apliques correcciones: propón el siguiente paso y espera confirmación.
