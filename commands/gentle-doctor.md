---
description: Diagnóstico de la instalación gentle-shell en opencode-kairos
---
Resume el estado de la instalación y señala solo lo que falte o esté roto.

Agentes: !`ls "$OPENCODE_CONFIG_DIR/agents"`
Comandos: !`ls "$OPENCODE_CONFIG_DIR/commands"`
Plugins: !`ls "$OPENCODE_CONFIG_DIR/plugins"`
Skills instaladas: !`ls "$OPENCODE_CONFIG_DIR/skills" | wc -l`
Sincronización con gentle-shell: !`cat "$OPENCODE_CONFIG_DIR/.gentle-shell-sync.json" 2>/dev/null || echo "sin marcador"`
Tema: !`cat "$OPENCODE_CONFIG_DIR/tui.json"`
