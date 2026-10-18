// DOM overlays: HUD, journal, menus and reports.
import { EVIDENCE, GHOST_TYPES } from './ghostTypes.js';

const $ = (s) => document.querySelector(s);
const EV_KEYS = Object.keys(EVIDENCE);

export class UI {
  constructor(game) {
    this.game = game;
    this.ev = [null, null, null];
    this.guess = -1;
    this.viewing = null;
    this.toastT = null;
    this.subT = null;
    this.makeGrain();
    this.buildJournal();
  }

  makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const x = c.getContext('2d');
    const img = x.createImageData(180, 180);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
  }

  show(id, on = true) {
    $(id).classList.toggle('hidden', !on);
  }

  prompt(text) {
    const el = $('#prompt');
    if (el.textContent !== text) el.textContent = text;
  }

  hint(text) {
    const el = $('#hint');
    if (el.textContent !== text) el.textContent = text;
  }

  toast(text, ms = 2500) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), ms);
  }

  subtitle(text, ms = 2500) {
    const el = $('#subtitle');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.subT);
    this.subT = setTimeout(() => el.classList.remove('show'), ms);
  }

  setSlots(inv, active) {
    document.querySelectorAll('.slot').forEach((el, i) => {
      el.textContent = inv[i] ? inv[i].name : `${i + 1}`;
      el.classList.toggle('active', i === active);
    });
  }

  setStamina(v) {
    $('#stamina div').style.width = `${v * 100}%`;
    $('#stamina').style.opacity = v < 0.99 ? 1 : 0;
  }

  setNightVision(on) {
    $('#nightvision').classList.toggle('on', on);
  }

  setFear(f) {
    $('#vignette').style.background = `radial-gradient(ellipse at center, transparent ${45 - f * 25}%, rgba(${Math.floor(f * 30)},0,0,${0.75 + f * 0.2}) 100%)`;
  }

  // ---------------- journal ----------------
  buildJournal() {
    const slots = $('#evslots');
    slots.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'evslot';
      d.innerHTML = `<div class="lbl">Evidence Found #${i + 1}</div><div class="selector"><button class="arr" data-dir="-1">◀</button><span></span><button class="arr" data-dir="1">▶</button></div>`;
      d.querySelectorAll('.arr').forEach((b) =>
        b.addEventListener('click', () => {
          this.cycleEvidence(i, +b.dataset.dir);
        })
      );
      slots.appendChild(d);
    }
    $('#guess')
      .querySelectorAll('.arr')
      .forEach((b) =>
        b.addEventListener('click', () => {
          const n = GHOST_TYPES.length;
          this.guess = ((this.guess + 1 + +b.dataset.dir + (n + 1)) % (n + 1)) - 1;
          this.renderJournal();
        })
      );
    const list = $('#ghostlist');
    GHOST_TYPES.forEach((g, i) => {
      const d = document.createElement('div');
      d.textContent = g.name;
      d.addEventListener('click', () => {
        this.viewing = i;
        this.guess = i;
        this.renderJournal();
      });
      list.appendChild(d);
    });
    this.renderJournal();
  }

  cycleEvidence(slot, dir) {
    const opts = [null, ...EV_KEYS];
    let idx = opts.indexOf(this.ev[slot]);
    for (let k = 0; k < opts.length; k++) {
      idx = (idx + dir + opts.length) % opts.length;
      const v = opts[idx];
      if (v === null || !this.ev.some((e, j) => j !== slot && e === v)) break;
    }
    this.ev[slot] = opts[idx];
    this.renderJournal();
  }

  matches(g) {
    return this.ev.every((e) => e === null || g.ev.includes(e));
  }

  renderJournal() {
    document.querySelectorAll('.evslot span').forEach((s, i) => (s.textContent = this.ev[i] ? EVIDENCE[this.ev[i]] : 'No evidence'));
    $('#guess span').textContent = this.guess < 0 ? 'Not yet discovered' : GHOST_TYPES[this.guess].name;
    document.querySelectorAll('#ghostlist div').forEach((d, i) => {
      d.classList.toggle('out', !this.matches(GHOST_TYPES[i]));
      d.classList.toggle('picked', i === this.guess);
    });
    const v = this.viewing ?? (this.guess >= 0 ? this.guess : null);
    const desc = $('#ghostdesc');
    if (v === null) desc.innerHTML = '<i>Click a ghost to read about it.</i>';
    else {
      const g = GHOST_TYPES[v];
      desc.innerHTML = `<b>${g.name}</b><br>${g.desc}<br><span class="ev">Evidence: ${g.ev.map((e) => EVIDENCE[e]).join(', ')}</span>`;
    }
    this.renderCase();
  }

  renderCase() {
    const g = this.game;
    if (!g.ghost) return;
    const mins = Math.floor(g.time / 60), secs = Math.floor(g.time % 60).toString().padStart(2, '0');
    $('#caseinfo').innerHTML = `Ghost's name: <b>${g.ghost.name}</b><br>It responds to ${g.ghost.respondsTo}.<br>My sanity: <b>${Math.round(g.sanity)}%</b> &nbsp; Time: ${mins}:${secs}`;
  }

  get guessType() {
    return this.guess >= 0 ? GHOST_TYPES[this.guess] : null;
  }
}
