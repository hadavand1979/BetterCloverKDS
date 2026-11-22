#!/bin/bash
# Installs Better Clover KDS on a Raspberry Pi and starts it when the desktop logs in.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22, then run this script again."
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "  sudo apt install -y nodejs"
  exit 1
fi

MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$MAJOR" -lt 22 ]; then
  echo "Node.js 22 or newer is required. This Pi has $(node -v)."
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0
fi

npm install
npm run export:web
npm install --prefix desktop
npm install --prefix server

mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/better-clover-kds.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Better Clover KDS
Comment=Kitchen display
Exec=$ROOT/raspberry/start-kiosk.sh
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=8
EOF
chmod +x "$ROOT/raspberry/start-kiosk.sh" "$ROOT/raspberry/install-kiosk.sh"

if command -v raspi-config >/dev/null 2>&1; then
  # B4 is desktop with automatic login. Blanking 1 turns the screensaver off.
  sudo raspi-config nonint do_boot_behaviour B4 || true
  sudo raspi-config nonint do_blanking 1 || true
fi

echo
echo "Better Clover KDS will open fullscreen after the next reboot."
echo "Plug the monitor into HDMI and its touch cable into USB."
echo "To leave the kitchen screen, plug in a keyboard and press Ctrl+Shift+F."
echo "To quit, press Ctrl+Shift+Q."
