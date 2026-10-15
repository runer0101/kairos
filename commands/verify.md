---
description: Verificación independiente del cambio con evidencia observada
agent: kairos
---
Verifica de forma independiente el cambio actual.

Estado del repositorio:

!`git status --short 2>&1 | head -30`

Lanza `gentle-ai-verify` con la herramienta `task` y pásale: el alcance (archivos cambiados), los comandos de prueba del proyecto (los que encuentres en package.json, Makefile o similares) y los criterios de aceptación si existen en `odd/tasks/`.

Cuando responda, resume: comandos ejecutados, resultado observado de cada uno y fallos pendientes. No des por bueno nada que no tenga una salida observada que lo respalde.
