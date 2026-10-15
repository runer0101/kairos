# ODD (Organic Driven Development) en opencode-venjix

Flujo de trabajo para tareas que no caben en un solo paso:

1. **Explorar** el código y los requisitos antes de cambiar nada.
2. **Clasificar**: una tarea pequeña y entendida se hace en línea, sin documento. Una tarea grande (no se puede retomar solo con la petición y `git diff`) se documenta.
3. **Documentar** con `/odd-task <nombre>`, que crea `odd/tasks/<nombre>.md` en el repositorio del proyecto a partir de `TEMPLATE.md`.
4. **Implementar** tarea por tarea, con una prueba por tarea y un commit por unidad de trabajo.
5. **Cerrar** con evidencia observada: comandos, salidas y pendientes.

El documento es la fuente de verdad para retomar: al reanudar, se reconcilia con el código y con la memoria antes de seguir.
