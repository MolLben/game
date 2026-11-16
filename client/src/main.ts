import { DEFAULT_PORT, MAPS, MAP_ORDER, MAX_NAME_LENGTH, PRIMARY_WEAPONS, WEAPONS, type JoinMode, type WeaponDef } from '@kinetic/shared';
import { Game } from './game';
import { saveSettings, settings, type Settings } from './settings';
import { TouchControls } from './touch';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const game = new Game($<HTMLCanvasElement>('game'));
const menu = $('menu');
const lobby = $('lobby');
const paused = $('paused');
const status = $('menu-status');
const nameInput = $<HTMLInputElement>('player-name');
const codeInput = $<HTMLInputElement>('room-code');
const roomLine = $('room-line');
const restartBtn = $('btn-restart');

const params = new URLSearchParams(location.search);
// Vite dev server (port 5173) talks to the local Node game server; deployed builds use /ws on the same host.
const isViteDev = location.port === '5173';
const SERVER_URL =
  params.get('server') ??
  (isViteDev
    ? `ws://${location.hostname}:${DEFAULT_PORT}`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

nameInput.value = localStorage.getItem('kinetic.name') ?? '';
nameInput.addEventListener('input', () => localStorage.setItem('kinetic.name', nameInput.value.slice(0, MAX_NAME_LENGTH)));
function setStatus(text: string, error = false): void {
  status.textContent = text;
  status.classList.toggle('error', error);
  status.classList.remove('invite');
}

// Invite links (?room=CODE): prefill the code and point the friend at JOIN.
const invitedCode = (params.get('room') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
if (invitedCode) {
  codeInput.value = invitedCode;
  status.textContent = `You're invited to room ${invitedCode} — type your name and press JOIN.`;
  status.classList.add('invite');
  $('btn-join').classList.add('primary');
  nameInput.focus();
}

function inviteLink(): string {
  return `${location.origin}${location.pathname}?room=${game.roomCode}`;
}

// Map picker (private rooms + practice)
const mapSelect = $<HTMLSelectElement>('map-select');
for (const id of MAP_ORDER) {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = MAPS[id].name;
  o.title = MAPS[id].description;
  mapSelect.appendChild(o);
}
mapSelect.value = MAP_ORDER.includes(settings.map) ? settings.map : MAP_ORDER[0];
mapSelect.addEventListener('change', () => {
  settings.map = mapSelect.value;
  saveSettings();
});

function showLobby(): void {
  lobby.classList.remove('hidden');
  paused.classList.add('hidden');
}

function showPaused(): void {
  lobby.classList.add('hidden');
  paused.classList.remove('hidden');
  const online = game.mode === 'online';
  restartBtn.classList.toggle('hidden', online);
  $('btn-copy-invite').classList.toggle('hidden', !online);
  if (online && game.roomCode) {
    const invite = inviteLink();
    roomLine.innerHTML = `Room <b></b> · invite: <span class="invite"></span>`;
    roomLine.querySelector('b')!.textContent = game.roomCode;
    roomLine.querySelector('.invite')!.textContent = invite;
  } else {
    roomLine.textContent = 'Practice match (offline)';
  }
}

// Phones/tablets: on-screen controls instead of keyboard + mouse
const touch = game.input.touch ? new TouchControls(game.input, () => game.input.unlock()) : null;
document.body.classList.toggle('touch', !!touch);

game.onStateChange = (s) => {
  menu.classList.toggle('hidden', s === 'playing' || s === 'ended');
  touch?.show(s === 'playing');
  document.body.classList.toggle('in-game', s === 'playing');
  if (s === 'menu') showLobby();
  if (s === 'paused') showPaused();
};
game.onDisconnect = (reason) => setStatus(reason, true);

let busy = false;
async function playOnline(mode: JoinMode): Promise<void> {
  if (busy) return;
  const code = codeInput.value.trim().toUpperCase();
  if (mode === 'join' && code.length !== 5) {
    setStatus('Enter a 5-character room code.', true);
    return;
  }
  busy = true;
  setStatus('Connecting…');
  try {
    await game.startOnline(SERVER_URL, nameInput.value, mode, code);
    setStatus('');
    if (mode === 'create') {
      game.hud.centerMessage(`PRIVATE ROOM ${game.roomCode}`, 'Press Esc → COPY INVITE LINK for your friend');
    }
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Could not connect', true);
  } finally {
    busy = false;
  }
}

$('btn-quick').addEventListener('click', () => playOnline('quick'));
$('btn-create').addEventListener('click', () => playOnline('create'));
$('btn-join').addEventListener('click', () => playOnline('join'));
codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && playOnline('join'));
$('btn-offline').addEventListener('click', () => {
  setStatus('');
  game.startOffline();
});
$('btn-resume').addEventListener('click', () => game.resume());
$('btn-copy-invite').addEventListener('click', async () => {
  const link = inviteLink();
  try {
    await navigator.clipboard.writeText(link);
    setStatus(`Copied! Send this to your friend: ${link}`);
  } catch {
    setStatus(`Send this link to your friend: ${link}`);
  }
});
restartBtn.addEventListener('click', () => game.startOffline());
$('btn-leave').addEventListener('click', () => {
  game.leave();
  setStatus('');
});
$('btn-again').addEventListener('click', () => (game.mode === 'online' ? game.resume() : game.startOffline()));

// Loadout picker
const picks = $('weapon-picks');
function statLine(d: WeaponDef): string {
  const dmg = d.pellets > 1 ? `${d.damage}×${d.pellets}` : String(d.damage);
  const mag = d.shellReload > 0 ? `${d.magSize} shells` : `${d.magSize} rds`;
  return `${dmg} dmg · ${d.rpm} rpm · ${mag}`;
}
function renderPicks(): void {
  picks.replaceChildren(
    ...PRIMARY_WEAPONS.map((id) => {
      const d = WEAPONS[id];
      const b = document.createElement('button');
      b.className = `weapon-pick${settings.primary === id ? ' selected' : ''}`;
      const title = document.createElement('b');
      title.textContent = d.name;
      const desc = document.createElement('div');
      desc.textContent = d.description;
      const stats = document.createElement('div');
      stats.className = 'stats';
      stats.textContent = statLine(d);
      b.append(title, desc, stats);
      b.addEventListener('click', () => {
        game.setPrimary(id);
        renderPicks();
      });
      return b;
    }),
  );
}
renderPicks();

// Settings sliders
type NumericKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
function bind(id: string, key: NumericKey, label: string, fmt: (v: number) => string, onChange?: (v: number) => void) {
  const input = $<HTMLInputElement>(id);
  const out = $(label);
  input.value = String(settings[key]);
  out.textContent = fmt(settings[key]);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    settings[key] = v;
    out.textContent = fmt(v);
    onChange?.(v);
    saveSettings();
  });
}
bind('set-sens', 'sensitivity', 'v-sens', (v) => v.toFixed(2));
bind('set-touch-sens', 'touchSens', 'v-touch-sens', (v) => v.toFixed(2));
bind('set-ads', 'adsSensMult', 'v-ads', (v) => v.toFixed(2));

const aaCheckbox = $<HTMLInputElement>('set-aim-assist');
const aaStatus = $('v-aa-status');
const updateAAUI = (on: boolean, strength: number) => {
  aaCheckbox.checked = on;
  aaStatus.textContent = on ? 'ON' : 'OFF';
  aaStatus.className = `status-pill ${on ? 'on' : 'off'}`;
  game.hud.setAimAssistIndicator(on, strength);
};
updateAAUI(settings.aimAssist, settings.aimAssistStrength);
aaCheckbox.addEventListener('change', () => {
  settings.aimAssist = aaCheckbox.checked;
  saveSettings();
  updateAAUI(settings.aimAssist, settings.aimAssistStrength);
});

bind('set-aim-assist-strength', 'aimAssistStrength', 'v-aa-strength', (v) => `${Math.round(v * 100)}%`, (v) => {
  game.hud.setAimAssistIndicator(settings.aimAssist, v);
});

// GTA Target Sticky Aim settings
const stickyCheckbox = $<HTMLInputElement>('set-sticky-aim');
const stickyStatus = $('v-sticky-status');
const updateStickyUI = (on: boolean) => {
  stickyCheckbox.checked = on;
  stickyStatus.textContent = on ? 'ON' : 'OFF';
  stickyStatus.className = `status-pill ${on ? 'on' : 'off'}`;
};
updateStickyUI(settings.stickyAim);
stickyCheckbox.addEventListener('change', () => {
  settings.stickyAim = stickyCheckbox.checked;
  saveSettings();
  updateStickyUI(settings.stickyAim);
  if (!settings.stickyAim) game.unlockStickyAim();
});

bind('set-sticky-speed', 'stickyAimSpeed', 'v-sticky-speed', (v) => `${v.toFixed(1)}x`);

const stickyAdsCheckbox = $<HTMLInputElement>('set-sticky-ads');
stickyAdsCheckbox.checked = settings.stickyOnAds;
stickyAdsCheckbox.addEventListener('change', () => {
  settings.stickyOnAds = stickyAdsCheckbox.checked;
  saveSettings();
});

// Mobile & PC on-screen Aim Lock button
const btnLock = document.getElementById('btn-lock');
if (btnLock) {
  const triggerLock = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    game.toggleStickyAim();
  };
  btnLock.addEventListener('click', triggerLock);
  btnLock.addEventListener('touchstart', triggerLock, { passive: false });
}

bind('set-fov', 'fov', 'v-fov', (v) => `${v}°`);
bind('set-vol', 'volume', 'v-vol', (v) => `${Math.round(v * 100)}%`, (v) => game.sfx.setVolume(v));
bind('set-bots', 'bots', 'v-bots', (v) => String(v));

if (import.meta.env.DEV) Object.assign(window, { game });
