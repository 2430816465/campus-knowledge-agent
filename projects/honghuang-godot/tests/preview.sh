#!/bin/sh
PROJECT_ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)" || exit 1
mkdir -p "$PROJECT_ROOT/../runtime-home" || exit 1
RUNTIME_HOME="$(CDPATH= cd -- "$PROJECT_ROOT/../runtime-home" && pwd -P)" || exit 1
export HOME="$RUNTIME_HOME"
export XDG_DATA_HOME="$RUNTIME_HOME/.local/share"
export XDG_CONFIG_HOME="$RUNTIME_HOME/.config"
export XDG_CACHE_HOME="$RUNTIME_HOME/.cache"
mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
cd "$PROJECT_ROOT" || exit 1
exec godot --path . --script "${1:-tests/audit_visual.gd}" -- --ui-test
