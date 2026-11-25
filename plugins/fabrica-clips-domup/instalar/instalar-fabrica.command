#!/usr/bin/env bash
set -u

echo "============================================================"
echo "  Instalador sin terminal - Fabrica de Clips DomUP (Mac)"
echo "============================================================"
echo ""

# 1. Homebrew (requiere que el alumno ingrese la contraseña de su Mac si se instala por primera vez)
if ! command -v brew >/dev/null 2>&1; then
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "[..] Instalando Homebrew (si te pide la contraseña de tu Mac, escribila y presioná Enter)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

# Persistir brew shellenv en ~/.zprofile para que Claude Desktop / Claude Code vean las herramientas
ZPROFILE="$HOME/.zprofile"
if [ -x /opt/homebrew/bin/brew ]; then
  if [ ! -f "$ZPROFILE" ] || ! grep -q '/opt/homebrew/bin/brew shellenv' "$ZPROFILE" 2>/dev/null; then
    printf '\neval "$(/opt/homebrew/bin/brew shellenv)"\n' >> "$ZPROFILE"
  fi
elif [ -x /usr/local/bin/brew ]; then
  if [ ! -f "$ZPROFILE" ] || ! grep -q '/usr/local/bin/brew shellenv' "$ZPROFILE" 2>/dev/null; then
    printf '\neval "$(/usr/local/bin/brew shellenv)"\n' >> "$ZPROFILE"
  fi
fi

if command -v brew >/dev/null 2>&1; then
  BREW_PREFIX="$(brew --prefix)"
else
  BREW_PREFIX=""
fi

# 2. ffmpeg y ffprobe
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "[..] Instalando ffmpeg..."
  brew install ffmpeg
fi

# 3. Node.js 20+ (node@20 en Homebrew es keg-only: requiere brew link o sumar bin al PATH)
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
    NODE_OK=1
  fi
fi
if [ "$NODE_OK" -eq 0 ]; then
  echo "[..] Instalando node@20..."
  brew install node@20
  brew link --overwrite --force node@20 >/dev/null 2>&1 || true
  if [ -n "$BREW_PREFIX" ] && [ -d "$BREW_PREFIX/opt/node@20/bin" ]; then
    PATH="$BREW_PREFIX/opt/node@20/bin:$PATH"
    export PATH
    if [ ! -f "$ZPROFILE" ] || ! grep -q 'opt/node@20/bin' "$ZPROFILE" 2>/dev/null; then
      printf '\nexport PATH="%s/opt/node@20/bin:$PATH"\n' "$BREW_PREFIX" >> "$ZPROFILE"
    fi
  fi
fi

# 4. HyperFrames (CLI global para renderizar los efectos del montaje)
if ! command -v hyperframes >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  echo "[..] Instalando HyperFrames..."
  npm install -g hyperframes >/dev/null 2>&1 || true
fi

# 5. Python 3.12 + venv (evita bloqueo PEP 668 de macOS moderno)
PY_BIN=""
if [ -n "$BREW_PREFIX" ] && [ -x "$BREW_PREFIX/opt/python@3.12/libexec/bin/python3" ]; then
  PY_BIN="$BREW_PREFIX/opt/python@3.12/libexec/bin/python3"
elif [ -n "$BREW_PREFIX" ] && [ -x "$BREW_PREFIX/bin/python3.12" ]; then
  PY_BIN="$BREW_PREFIX/bin/python3.12"
elif command -v python3.12 >/dev/null 2>&1; then
  PY_BIN="$(command -v python3.12)"
fi

if [ -z "$PY_BIN" ]; then
  echo "[..] Instalando python@3.12..."
  brew install python@3.12
  if [ -n "$BREW_PREFIX" ] && [ -x "$BREW_PREFIX/opt/python@3.12/libexec/bin/python3" ]; then
    PY_BIN="$BREW_PREFIX/opt/python@3.12/libexec/bin/python3"
  elif [ -n "$BREW_PREFIX" ] && [ -x "$BREW_PREFIX/bin/python3.12" ]; then
    PY_BIN="$BREW_PREFIX/bin/python3.12"
  elif command -v python3.12 >/dev/null 2>&1; then
    PY_BIN="$(command -v python3.12)"
  elif command -v python3 >/dev/null 2>&1; then
    PY_BIN="$(command -v python3)"
  fi
fi

# 6. Carpeta de trabajo, venv y .env.local (mismas 3 variables que instalar-fabrica.cmd)
DOCS_DIR="$HOME/Documents"
WORK_DIR="$DOCS_DIR/Fabrica DomUP"
CLIPS_DIR="$WORK_DIR/clips"
VENV_DIR="$WORK_DIR/.venv"
ENV_FILE="$WORK_DIR/.env.local"

mkdir -p "$CLIPS_DIR"

if [ -n "$PY_BIN" ]; then
  if [ ! -x "$VENV_DIR/bin/python" ]; then
    echo "[..] Creando entorno Python en $VENV_DIR..."
    "$PY_BIN" -m venv "$VENV_DIR"
  fi
  if [ -x "$VENV_DIR/bin/python" ]; then
    if ! "$VENV_DIR/bin/python" -c "import cv2, PIL, numpy" >/dev/null 2>&1; then
      echo "[..] Instalando opencv-python, pillow y numpy..."
      "$VENV_DIR/bin/python" -m pip install --upgrade pip >/dev/null 2>&1 || true
      "$VENV_DIR/bin/python" -m pip install --upgrade opencv-python pillow numpy
    fi
  fi
fi

K_ELEVEN="ELEVENLABS_API_KEY"
EXISTING_ELEVEN=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_ELEVEN="$(grep -E "^${K_ELEVEN}=" "$ENV_FILE" 2>/dev/null | head -n 1 | cut -d= -f2- | sed 's/^"//;s/"$//')"
fi

{
  printf 'CLIPS_RAIZ=%s\n' "$CLIPS_DIR"
  printf 'CLIPS_ENV_LOCAL=%s\n' "$ENV_FILE"
  printf '%s=%s\n' "$K_ELEVEN" "$EXISTING_ELEVEN"
} > "$ENV_FILE"

echo ""
echo "============================================================"
echo "  Resumen de verificacion"
echo "============================================================"

OK_FFMPEG="❌"
if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  OK_FFMPEG="✅"
fi
echo "  $OK_FFMPEG ffmpeg y ffprobe"

OK_PYTHON="❌"
VENV_PY="$VENV_DIR/bin/python"
if [ -x "$VENV_PY" ] && "$VENV_PY" --version >/dev/null 2>&1; then
  OK_PYTHON="✅"
elif [ -n "$PY_BIN" ] && "$PY_BIN" --version >/dev/null 2>&1; then
  OK_PYTHON="✅"
fi
echo "  $OK_PYTHON Python 3.12"

OK_PYLIBS="❌"
if [ -x "$VENV_PY" ] && "$VENV_PY" -c "import cv2, PIL, numpy" >/dev/null 2>&1; then
  OK_PYLIBS="✅"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import cv2, PIL, numpy" >/dev/null 2>&1; then
  OK_PYLIBS="✅"
fi
echo "  $OK_PYLIBS Librerias Python (opencv-python, pillow, numpy)"

OK_NODE="❌"
if command -v node >/dev/null 2>&1; then
  NODE_MAJ="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ -n "$NODE_MAJ" ] && [ "$NODE_MAJ" -ge 20 ] 2>/dev/null; then
    OK_NODE="✅"
  fi
fi
echo "  $OK_NODE Node.js 20+"

OK_HYPER="❌"
if command -v hyperframes >/dev/null 2>&1; then
  OK_HYPER="✅"
fi
echo "  $OK_HYPER HyperFrames"

OK_CURL="❌"
if command -v curl >/dev/null 2>&1; then
  OK_CURL="✅"
fi
echo "  $OK_CURL curl"

OK_CARPETA="❌"
if [ -d "$CLIPS_DIR" ]; then
  OK_CARPETA="✅"
fi
echo "  $OK_CARPETA Carpeta de trabajo: $CLIPS_DIR"

OK_ENV="❌"
if [ -f "$ENV_FILE" ]; then
  OK_ENV="✅"
fi
echo "  $OK_ENV Archivo .env.local: $ENV_FILE"

OK_ELEVEN="❌"
if [ -n "$EXISTING_ELEVEN" ]; then
  OK_ELEVEN="✅"
fi
echo "  $OK_ELEVEN ELEVENLABS_API_KEY en .env.local"

echo ""
if [ "$OK_ELEVEN" = "❌" ]; then
  echo "Se va a abrir .env.local en TextEdit para que pegues tu ELEVENLABS_API_KEY"
  echo "despues del signo =, guardes el archivo (Cmd+S) y lo cierres."
  echo "Nunca pegues tu clave en el chat."
  open -a TextEdit "$ENV_FILE" >/dev/null 2>&1 || open -e "$ENV_FILE" >/dev/null 2>&1 || true
  echo ""
fi
echo "============================================================"
echo "  Listo. Cerra y volve a abrir Claude para tomar los cambios."
echo "============================================================"
read -r -p "Presiona Enter para cerrar esta ventana..." _
