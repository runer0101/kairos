---
description: Judgment Day del cambio: dos jueces ciegos con modelos distintos y corrección acotada
agent: venjix
---
Ejecuta un Judgment Day sobre: $ARGUMENTS
Si no se indica alcance, usa el cambio actual.

Cambio de referencia:

!`git diff HEAD 2>&1 | head -400`

Protocolo (skill `judgment-day`):
1. Lanza `jd-judge-a` y `jd-judge-b` en paralelo con la herramienta `task`, con el mismo alcance y los mismos criterios. Son ciegos: no compartas las conclusiones de uno con el otro. Espera a los dos; no aceptes un juicio parcial.
2. Compara los dos resultados. Solo corrige hallazgos confirmados por ambos jueces y de severidad BLOCKER o CRITICAL. WARNING y SUGGESTION quedan como informativos.
3. Si hay hallazgos confirmados, lanza `jd-fix-agent` con la lista exacta de hallazgos (no opiniones) y después una re-revisión acotada al delta.
4. Como máximo dos rondas de corrección y dos re-revisiones. Si quedan hallazgos confirmados al final, el veredicto es `escalated`.
5. Reporta: veredicto (`approved` o `escalated`), hallazgos confirmados, correcciones aplicadas y hallazgos descartados con su motivo.
