const { Platform } = require('react-native');

let audioContext = null;
let nativePlayer = null;
let nativeLoading = null;
let listening = false;

function webContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

function tone(ctx, when, frequency, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.22, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function playWebChime() {
  const ctx = webContext();
  if (!ctx) return;
  const start = () => {
    const now = ctx.currentTime;
    tone(ctx, now, 523.25, 0.12);
    tone(ctx, now + 0.13, 659.25, 0.22);
  };
  if (ctx.state === 'suspended') {
    const pending = ctx.resume();
    if (pending && typeof pending.then === 'function') pending.then(start).catch(() => {});
    else start();
    return;
  }
  start();
}

function listenForUnlock() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const unlock = () => {
    const ctx = webContext();
    if (ctx && ctx.state === 'suspended') {
      const pending = ctx.resume();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    }
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

function loadNativePlayer() {
  if (nativePlayer) return Promise.resolve(nativePlayer);
  if (!nativeLoading) {
    nativeLoading = (async () => {
      const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
      });
      nativePlayer = createAudioPlayer(require('../assets/chime.wav'));
      return nativePlayer;
    })();
  }
  return nativeLoading;
}

async function playNativeChime() {
  const player = await loadNativePlayer();
  const start = Date.now();
  while (player && !player.isLoaded && Date.now() - start < 1500) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  if (!player) return;
  try {
    await player.seekTo(0);
  } catch (error) {
    // Playback can start at the beginning when the file is still opening.
  }
  player.play();
}

function prepareChime() {
  if (Platform.OS === 'web') {
    listenForUnlock();
    webContext();
    return;
  }
  loadNativePlayer().catch(() => {});
}

function playChime() {
  if (Platform.OS === 'web') {
    playWebChime();
    return;
  }
  playNativeChime().catch(() => {});
}

module.exports = { playChime, prepareChime };
