# Better Clover KDS

Kitchen display for iPhone, iPad, Android, and a Windows, Mac, or Linux touchscreen. The phone and tablet app is React Native. The same screen is wrapped in Electron for a monitor, including a Raspberry Pi on a 24-inch HDMI touchscreen. It reads open orders from Clover and adds a grouped tally at the bottom of every ticket.

A 10-item ticket can read:

- 4 Burgers
- 2 Chicken Fingers
- 2 Steak and Cheese
- 2 Steaks
- 10 Fries

Fries are counted when they are attached to each item. Prep notes such as `NO onion` and `Medium` stay on the item and stay out of the tally.

The app runs on the tablet. Clover is where the orders come from.

## Try it on a phone or tablet

1. Install **Expo Go** from the App Store or Google Play.
2. On this Mac, in Terminal:

```bash
cd "/Users/alihadavand/Documents/Better Clover KDS"
npm install
npx expo start
```

3. Keep the Mac and the tablet on the same Wi-Fi.
4. Scan the QR code.
   - iPhone or iPad: open the Camera app and tap the banner.
   - Android: open Expo Go and use its scan button.
5. Leave this Mac awake while the kitchen is using Expo Go. The tablet is loading the app from the Mac.

If the tablet is on a different network, start with `npx expo start --tunnel`.

Turn an iPad sideways. Tickets line up across the screen, the oldest order on the left. A phone stacks the tickets. Each ticket has **Hold** and **Bump**. Bumped tickets come back from **Recall**, and **Undo** stays up for a few seconds. Tickets turn yellow at 5 minutes and red at 10. The screen stays awake.

The first launch uses sample tickets so you can see the tally before a Clover account is connected. Table 12 is the 10-item example.

## Connect one tablet to Clover

In the app, open **Settings**, choose **Clover account**, and paste the merchant ID and access token.

### Create the Clover developer account

Use an email address that has never been used for a Clover merchant or developer login. Clover rejects an address that already exists.

1. Open [the Global Developer Dashboard](https://www.clover.com/global-developer-home) and create an account. The full signup steps are in [Clover's developer account guide](https://docs.clover.com/dev/docs/gdp-create-global-developer-account).
2. Confirm the email within 24 hours.
3. Enter the business name, choose the region (United States and Canada for a US restaurant), and finish multi-factor authentication. An authenticator app such as Google Authenticator is required.
4. You land in the sandbox. Clover creates a test merchant for you.

### Sandbox token for the sample restaurant

1. In the dashboard, open **Test Merchants** and launch the test merchant.
2. Copy the merchant ID.
3. In the merchant dashboard, open **Account & Setup**, then **API Tokens**, and create a token that can read orders and read merchant information.
4. In Better Clover KDS, choose the **Sandbox** environment and paste the merchant ID and token.
5. Tap **Test connection**, then **Save**.

Place a test order on the sandbox merchant. It shows up on the tablet within a few seconds.

## Connect every tablet through one kitchen server

Use the server when more than one screen should share the Clover login, and when bumping a ticket on one tablet should remove it from the others.

```bash
cd "/Users/alihadavand/Documents/Better Clover KDS/server"
npm install
npm start
```

Open http://localhost:8787 on the Mac. Paste the same merchant ID and access token, then save and test. The page prints the address to type into each tablet, similar to `http://192.168.1.20:8787`.

On each tablet: **Settings**, **Kitchen server**, that address, then **Save**.

Set a kitchen PIN on the server page and enter the same PIN on each tablet. Keep this server on the restaurant Wi-Fi. It is a local kitchen tool, so leave it off the public internet unless you put it behind HTTPS and the PIN.

Bumps are stored by Better Clover KDS. Bumping a ticket leaves the Clover order as it is. If the order changes in Clover after it was bumped, it comes back to the board.

## Use it with a live restaurant

A live Clover merchant uses expiring OAuth tokens. Create a private Clover app to get that key. The kitchen display is still the app on the tablets.

1. In the Global Developer Dashboard, turn **Sandbox** off.
2. Submit the developer account for approval. Clover reviews production accounts before a real merchant can install an app.
3. Create a new app: private, web, in your country. Name it Better Clover KDS.
4. Requested permissions: **Read orders** and **Read merchant**.
5. REST configuration: set the Site URL to the public https address of this kitchen server, and set the default OAuth response to **Code**.
6. On the kitchen server page, choose **United States and Canada**, enter the App ID and App secret, set the Site URL to that same https address, save, and click **Connect with Clover**. Sign in as the merchant and approve access.
7. Point the tablets at the kitchen server.

Clover's Site URL has to be https and has to match the server address exactly. A tunnel such as Cloudflare Tunnel can forward `https://your-name.example.com` to `http://localhost:8787` while you are still on the Mac.

Optional instant updates: in the Clover app settings, set the webhook URL to `https://your-server/webhooks`, subscribe to orders, and send the verification code. The code appears on the kitchen server page. Paste it back into Clover and save. Copy the Clover auth code into **Webhook auth code** on the server page.

## React Native on a phone or tablet

The project in this folder is the React Native app. Expo is the React Native toolchain that builds it for Apple and Android. `npm start` opens it in Expo Go. A permanent install is built with EAS, below.

## A 24-inch touchscreen, including a Raspberry Pi

Electron wraps the web build as a native app for Windows, Mac, and Linux. On a kitchen monitor it opens fullscreen, blocks the display from sleeping, and can start when the computer logs in.

HDMI carries the picture. A 24-inch touchscreen also has a USB cable for touch. Plug HDMI into the Pi's HDMI port and the USB cable into the Pi.

On this Mac, in a normal window:

```bash
cd "/Users/alihadavand/Documents/Better Clover KDS"
npm install
npm install --prefix desktop
npm run desktop
```

Fullscreen, the way a kitchen monitor should run:

```bash
npm run desktop:kiosk
```

Plug in a keyboard if you need to get out. **Ctrl+Shift+F** leaves fullscreen. **Ctrl+Shift+Q** quits. The cursor hides after a few seconds of stillness. The app also starts the kitchen server on port 8787 when that port is free.

Installers for a counter Mac, a Windows touch PC, or an Intel Linux box:

```bash
npm run export:web
npm run pack --prefix desktop
```

From the `desktop` folder, `npx electron-builder --mac`, `--win`, or `--linux` builds just that system. A packaged app turns on login startup when it is opened in kiosk mode. `--no-autostart` leaves login startup off.

### Raspberry Pi on the HDMI monitor

Use a Raspberry Pi 4 or 5 with 64-bit Raspberry Pi OS and the desktop. Copy this project onto the Pi, then:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
cd "/home/pi/Better Clover KDS"
bash raspberry/install-kiosk.sh
sudo reboot
```

The install script builds the app, turns on desktop auto-login, turns off screen blanking, and opens Better Clover KDS about 8 seconds after the desktop appears. Electron also holds a stay-awake lock for as long as the kitchen screen is open. Change the Pi's display to 1920×1080 in Screen Configuration if the 24-inch monitor does not fill the panel.

Open **Settings** on the monitor and connect the Clover account or the kitchen server the same way as on a tablet.

## Put an icon on the tablet

Expo Go is enough for service. A permanent install does not need the Mac to stay running.

Android, as an APK you can open on the tablet:

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

iPhone and iPad need an Apple Developer Program membership:

```bash
eas build -p ios --profile preview
```

Install the iOS build with the link Expo provides or with TestFlight. The bundle id is `com.betterclover.kds`.

## Kitchen settings

- **Count sides and add-ons** includes modifiers such as Fries. Turn it off to tally only the main items.
- **Only show items containing** is a station filter. `steak` keeps Steak and Steak and Cheese, plus the sides on those items.
- **Yellow** and **Red** change how long a ticket waits before the header changes color.
