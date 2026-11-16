import type { Fighter } from './types';

const $ = (id: string) => document.getElementById(id)!;

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export class Hud {
  private root = $('hud');
  private crosshair = $('crosshair');
  private hitmarkerEl = $('hitmarker');
  private healthFill = $('health-fill');
  private healthNum = $('health-num');
  private weaponName = $('weapon-name');
  private ammoMag = $('ammo-mag');
  private ammoMax = $('ammo-max');
  private reloadBar = $('reload-bar');
  private reloadFill = $('reload-fill');
  private slotsEl = $('slots');
  private feed = $('killfeed');
  private dmgWrap = $('dmg-indicators');
  private vignette = $('vignette');
  private center = $('center-msg');
  private death = $('death');
  private deathBy = $('death-by');
  private deathTimer = $('death-timer');
  private scope = $('scope');
  private sb = $('scoreboard');
  private sbBody = $('sb-body');
  private fpsEl = $('fps');
  private speedEl = $('speed');
  private pingEl = $('ping');
  private aaHud = $('aa-hud');
  private dmgNumbers = $('dmg-numbers');
  private targetLock = $('target-lock');
  private lockLabel = $('lock-label');
  private btnLock = $('btn-lock');
  private btnLockText = $('btn-lock-text');
  private deathLoadout = $('death-loadout');
  private netInfo = $('net-info');
  private scoreYou = $('score-you');
  private scoreLeader = $('score-leader');
  private timer = $('timer');
  private centerTimeout = 0;
  private lastSbUpdate = 0;
  private lastGap = -1;
  private lastMode = '';

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setHealth(h: number): void {
    const v = Math.max(0, Math.ceil(h));
    this.healthFill.style.width = `${v}%`;
    this.healthFill.classList.toggle('low', v <= 35);
    setText(this.healthNum, String(v));
  }

  setAmmo(name: string, mag: number, size: number, reload: number): void {
    setText(this.weaponName, name);
    const melee = size === 0;
    setText(this.ammoMag, melee ? '—' : String(mag));
    setText(this.ammoMax, melee ? '' : ` / ${size}`);
    this.ammoMag.classList.toggle('low', !melee && mag <= Math.ceil(size * 0.25));
    this.reloadBar.classList.toggle('active', reload >= 0);
    if (reload >= 0) this.reloadFill.style.width = `${Math.round(reload * 100)}%`;
  }

  setSlots(names: string[], current: number): void {
    this.slotsEl.innerHTML = names
      .map((n, i) => `<div class="slot${i === current ? ' active' : ''}"><b>${i + 1}</b>${esc(n.split(' ')[0])}</div>`)
      .join('');
  }

  setCrosshair(gapPx: number, mode: 'full' | 'dot' | 'none'): void {
    const gap = Math.round(Math.min(120, Math.max(4, gapPx)));
    if (gap === this.lastGap && mode === this.lastMode) return;
    this.lastGap = gap;
    this.lastMode = mode;
    this.crosshair.className = mode;
    this.crosshair.style.setProperty('--gap', `${gap}px`);
  }

  hitmarker(kind: 'hit' | 'head' | 'kill'): void {
    const el = this.hitmarkerEl;
    el.className = '';
    void el.offsetWidth;
    el.className = `show ${kind}`;
  }

  /** Floating damage number near the crosshair. */
  damageNumber(amount: number, head: boolean, kill: boolean): void {
    const el = document.createElement('div');
    el.className = `dmgnum${head ? ' head' : ''}${kill ? ' kill' : ''}`;
    el.textContent = String(Math.round(amount));
    el.style.left = `${24 + Math.random() * 30}px`;
    el.style.top = `${-30 - Math.random() * 20}px`;
    this.dmgNumbers.appendChild(el);
    while (this.dmgNumbers.children.length > 8) this.dmgNumbers.firstElementChild!.remove();
    setTimeout(() => el.remove(), 800);
  }

  /** Death-screen line showing the primary for the next life. */
  setNextLoadout(text: string): void {
    setText(this.deathLoadout, text);
  }

  killfeed(killer: Fighter | null, victim: Fighter, weapon: string, head: boolean, mine: boolean): void {
    const row = document.createElement('div');
    row.className = `kf${mine ? ' mine' : ''}`;
    const k = killer ? `<span style="color:${killer.color}">${esc(killer.name)}</span>` : '';
    const w = killer ? `<span class="w">[${esc(weapon.split(' ')[0])}${head ? ' ◎' : ''}]</span>` : `<span class="w">[${esc(weapon)}]</span>`;
    row.innerHTML = `${k}${w}<span style="color:${victim.color}">${esc(victim.name)}</span>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 6) this.feed.lastElementChild!.remove();
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 5600);
  }

  clearKillfeed(): void {
    this.feed.innerHTML = '';
  }

  damageIndicator(angleRad: number): void {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.style.transform = `rotate(${angleRad}rad)`;
    this.dmgWrap.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  flashDamage(amount: number): void {
    this.vignette.style.opacity = String(Math.min(0.85, 0.25 + amount / 60));
    requestAnimationFrame(() => {
      this.vignette.style.opacity = '0';
    });
  }

  centerMessage(text: string, sub: string): void {
    this.center.innerHTML = `<div>${esc(text)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`;
    this.center.classList.add('show');
    clearTimeout(this.centerTimeout);
    this.centerTimeout = window.setTimeout(() => this.center.classList.remove('show'), 1600);
  }

  showDeath(by: string, weapon: string): void {
    this.deathBy.textContent = `by ${by}${weapon && weapon !== 'fell' ? ` · ${weapon}` : ''}`;
    this.death.classList.remove('hidden');
  }

  updateDeathTimer(sec: number): void {
    setText(this.deathTimer, `Respawning in ${sec.toFixed(1)}s`);
  }

  hideDeath(): void {
    this.death.classList.add('hidden');
  }

  setScope(on: boolean): void {
    this.scope.classList.toggle('hidden', !on);
  }

  setTop(youKills: number, leader: Fighter, timeLeft: number, limit: number): void {
    setText(this.scoreYou, `YOU ${youKills}`);
    setText(this.scoreLeader, `${leader.name.toUpperCase()} ${leader.kills} / ${limit}`);
    this.scoreLeader.style.color = leader.color;
    const m = Math.floor(timeLeft / 60);
    const s = Math.floor(timeLeft % 60);
    setText(this.timer, `${m}:${String(s).padStart(2, '0')}`);
  }

  scoreboard(fighters: Fighter[], visible: boolean, me: Fighter): void {
    this.sb.classList.toggle('hidden', !visible);
    if (!visible) return;
    const now = performance.now();
    if (now - this.lastSbUpdate < 250) return;
    this.lastSbUpdate = now;
    this.sbBody.innerHTML = this.rows(fighters, me);
  }

  private rows(fighters: Fighter[], me: Fighter): string {
    return [...fighters]
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map(
        (f, i) =>
          `<tr class="${f === me ? 'me' : ''}"><td>${i + 1}</td><td style="color:${f.color}">${esc(f.name)}</td><td>${f.kills}</td><td>${f.deaths}</td><td>${(f.kills / Math.max(1, f.deaths)).toFixed(2)}</td></tr>`,
      )
      .join('');
  }

  showEnd(ranked: Fighter[], me: Fighter, subtitle: string): void {
    const place = ranked.indexOf(me) + 1;
    $('end-title').textContent = place === 1 ? 'VICTORY' : `#${place} PLACE`;
    $('end-sub').textContent = subtitle;
    $('end-body').innerHTML = this.rows(ranked, me);
    $('end').classList.remove('hidden');
  }

  hideEnd(): void {
    $('end').classList.add('hidden');
  }

  /** Room code etc. shown in the top-left stats line. */
  setNetInfo(text: string): void {
    setText(this.netInfo, text);
  }

  stats(fps: number, speed: number, pingMs: number): void {
    setText(this.fpsEl, String(fps));
    setText(this.speedEl, speed.toFixed(1));
    setText(this.pingEl, pingMs >= 0 ? ` · PING ${pingMs}ms` : '');
  }

  setAimAssistIndicator(on: boolean, strength: number): void {
    if (!this.aaHud) return;
    this.aaHud.className = `aa-hud ${on ? 'on' : 'off'}`;
    setText(this.aaHud, ` · AA: ${on ? `ON (${Math.round(strength * 100)}%)` : 'OFF'}`);
  }

  setTargetLock(visible: boolean, name?: string, screenX?: number, screenY?: number): void {
    if (!this.targetLock) return;
    if (!visible || screenX === undefined || screenY === undefined) {
      this.targetLock.classList.add('hidden');
      return;
    }
    this.targetLock.classList.remove('hidden');
    this.targetLock.style.left = `${Math.round(screenX)}px`;
    this.targetLock.style.top = `${Math.round(screenY)}px`;
    if (this.lockLabel && name) {
      setText(this.lockLabel, `LOCKED: ${name}`);
    }
  }

  updateLockBtn(locked: boolean, targetName?: string): void {
    if (!this.btnLock) return;
    this.btnLock.classList.toggle('locked', locked);
    if (this.btnLockText) {
      setText(this.btnLockText, locked ? `UNLOCK${targetName ? ` ${targetName}` : ''} [E]` : `LOCK [E]`);
    }
  }
}
