#!/usr/bin/env bash
# Run this on the Ubuntu laptop. It unpacks the zip in /home/pct and installs the kitchen screen.
set -euo pipefail

ZIP_DIR="/home/pct"
APP_DIR="$ZIP_DIR/Better Clover KDS"

if [[ ! -d "$ZIP_DIR" ]]; then
  echo "Could not find $ZIP_DIR"
  exit 1
fi

mapfile -t ZIPS < <(find "$ZIP_DIR" -maxdepth 1 -type f \( -iname '*clover*.zip' -o -iname '*kds*.zip' \) | sort)
if [[ ${#ZIPS[@]} -eq 0 ]]; then
  mapfile -t ZIPS < <(find "$ZIP_DIR" -maxdepth 1 -type f -name '*.zip' | sort)
fi
if [[ ${#ZIPS[@]} -eq 0 ]]; then
  echo "No zip file in $ZIP_DIR"
  exit 1
fi
ZIP="${ZIPS[-1]}"
echo "Using $ZIP"

sudo apt-get update
sudo apt-get install -y curl unzip ca-certificates
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p "process.versions.node.split('.')[0]")" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

install_libs() {
  sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0 libasound2
}
install_libs_t64() {
  sudo apt-get install -y libgtk-3-0t64 libnotify4t64 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0t64 libsecret-1-0 libasound2t64
}
install_libs || install_libs_t64

rm -rf "$APP_DIR"
unzip -q -o "$ZIP" -d "$ZIP_DIR"
if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "The zip did not contain Better Clover KDS/package.json"
  exit 1
fi

cd "$APP_DIR"
npm install
npm run export:web
npm install --prefix desktop
npm install --prefix server
chmod +x raspberry/start-kiosk.sh raspberry/install-kiosk.sh

mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/better-clover-kds.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Better Clover KDS
Comment=Kitchen display
Exec=$APP_DIR/raspberry/start-kiosk.sh
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=8
EOF

echo "Better Clover KDS is installed. It will open fullscreen after the next login."
echo "Starting it in a window now."
npm start --prefix desktop -- --windowed
