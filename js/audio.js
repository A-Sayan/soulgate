/* ==========================================================================
 *  SOULGATE — audio.js
 *  Sorumluluk : Tüm ses — anlık sentezlenen efektler ve oyunun gidişatına
 *               göre kendini dönüştüren üretken (generative) ambient müzik.
 *               Ses dosyası yoktur; her şey WebAudio ile üretilir, çevrimdışı çalışır.
 *  Bağımlılık : config, utils, events (katman 0).
 *
 *  Kullanım
 *   init(ayarlar)  → main.js açılışta bir kez çağırır (olaylara abone olur)
 *   unlock()       → ilk dokunuşta çağrılır (mobil tarayıcılar sesi ancak
 *                    kullanıcı etkileşiminden sonra açar)
 *   play(id, opt)  → arayüz sesleri için (ui_tap, ui_open ...)
 *   Oyun sesleri olaylardan kendiliğinden çalar; game.js sesi bilmez.
 *
 *  Olay yükünden beklenen alanlar (game.js bu alanları sağlar)
 *   kule  : { type, x, level, mastery }
 *   düşman: { type, x }
 *   Doğan her düşman (yavru ve çağrılanlar dahil) için bir SPAWN,
 *   sahadan çıkan her düşman için tam olarak bir KILL ya da LEAK yayılır.
 *   IMPACT türleri: 'shell' | 'hellmaw' | 'quake' | 'shard' | 'glob'
 *   HIT'in 5. argümanı true ise (zehir/yanma tiki) ses çalınmaz.
 *
 *  Müzik katmanları (yoğunluk 0..1 ile karışır)
 *   pad akorları          → Markov zinciriyle seçilir, döngü hissi vermez
 *                           (1.3.0: sürekli bas uğultusu ve rüzgâr kaldırıldı —
 *                           oyuncular boğuk ve yorucu buldu; boşluğu pad doldurur)
 *   çan/arp melodisi      → rastgele yürüyüş, yoğunlukla sıklaşır
 *   savaş davulları       → dalga sırasında girer
 *   pirinç vuruşları + Frigyen dizi → yalnızca boss sahadayken
 * ========================================================================== */

import { AUDIO, ENEMIES, GRID, MAP_BY_ID } from './config.js';
import { clamp, clamp01, lerp, rng, createRng } from './utils.js';
import { EV, on } from './events.js';

/* --------------------------------------------------------------------------
 * 1. MOTOR DURUMU
 * ------------------------------------------------------------------------ */
const MUSIC_LEVEL = 0.55;          // müziğin efektlere göre taban seviyesi
/** Kaliteye göre aynı anda çalabilecek sıradan efekt sayısı (öncelikliler hariç). */
const VOICE_BUDGET = { low: 10, medium: 18, high: 26 };
const LOOKAHEAD = 0.35;            // müzik zamanlayıcısının ileriye bakışı (sn)
const TICK_MS = 100;
const EPS = 0.0001;                // üstel rampaların sıfır yerine kullandığı değer

let ctx = null;
let bus = null;                    // { master, comp, sfx:{dry,wet}, music:{dry,wet}, tone, duck, reverbIn, convolver, reverbOut }
let noiseBuffer = null;
let canPan = false;

let sfxVoices = 0;                 // şu an çalan sıradan efekt sayısı
let initialized = false;
let unlocked = false;
let hidden = false;
let paused = false;

const settings = { sfx: 0.8, music: 0.5, quality: 'high' };

/** AudioContext hazır ve çalıyor mu? */
const ready = () => ctx !== null && unlocked && !hidden && ctx.state === 'running';

/* --------------------------------------------------------------------------
 * 2. GENEL ARAYÜZ
 * ------------------------------------------------------------------------ */
/** Ses sistemini kurar ve olaylara abone olur. Bir kez çağrılır. */
export function init(initial = {}) {
  if (initialized) return;
  initialized = true;
  settings.sfx = clamp01(initial.sfxVolume ?? settings.sfx);
  settings.music = clamp01(initial.musicVolume ?? settings.music);
  settings.quality = initial.quality ?? settings.quality;
  subscribe();
}

/** İlk kullanıcı etkileşiminde çağrılır; sesi açar ve müziği başlatır. */
export function unlock() {
  if (!ctx) {
    ctx = createContext();
    if (!ctx) return; // tarayıcı WebAudio desteklemiyor: oyun sessiz çalışır
    buildGraph();
  }
  if (ctx.state !== 'running' && !hidden) ctx.resume().catch(() => {});
  unlocked = true;
  if (settings.music > 0) startMusic();
}

export const isUnlocked = () => unlocked;

/**
 * Bir efekt çalar.
 * @param {string} id   SFX tablosundaki ad
 * @param {object} opt  { x: dünya x'i (stereo konum), ...tarife özel değerler }
 */
export function play(id, opt = NO_OPT) {
  if (!ready() || settings.sfx <= 0) return;
  const recipe = SFX[id];
  if (!recipe) return;
  const meta = META[id] ?? DEFAULT_META;
  if (!meta.pri && sfxVoices >= (VOICE_BUDGET[settings.quality] ?? VOICE_BUDGET.high)) return;
  const now = ctx.currentTime;
  if (!admit(id, meta, now)) return;

  const pan = opt.x === undefined ? 0 : clamp((opt.x / GRID.cols) * 2 - 1, -1, 1) * 0.6;
  let v;
  if (meta.pri) {
    v = makeVoice(bus.sfx, meta.wet, pan, meta.gain);
  } else {
    sfxVoices += 1;
    v = makeVoice(bus.sfx, meta.wet, pan, meta.gain, () => { sfxVoices -= 1; });
  }
  const length = recipe(v, now + 0.005, opt);
  holdVoice(id, now + length);
}
const NO_OPT = Object.freeze({});

/* --------------------------------------------------------------------------
 * 3. SES GRAFİĞİ
 *  efektler ──► sfx.dry ─┐                  ┌─► sıkıştırıcı ─► hoparlör
 *            └► sfx.wet ─┼─► yankı ─────────┤
 *  müzik ───► music.dry ─► ton ─► kısma ────┤
 *            └► music.wet ─► yankı          │
 *  Sıkıştırıcı aynı anda patlayan onlarca sesin cızırdamasını önler.
 * ------------------------------------------------------------------------ */
function createContext() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    return new AC({ latencyHint: 'interactive' });
  } catch {
    try {
      return new AC();
    } catch {
      return null;
    }
  }
}

function buildGraph() {
  canPan = typeof ctx.createStereoPanner === 'function';
  noiseBuffer = createNoiseBuffer(2);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 8;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  comp.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = AUDIO.master;
  master.connect(comp);

  const reverbIn = ctx.createGain();
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.9;
  reverbOut.connect(master);

  const sfx = { dry: ctx.createGain(), wet: ctx.createGain() };
  sfx.dry.connect(master);
  sfx.wet.connect(reverbIn);

  const tone = ctx.createBiquadFilter(); // duraklatmada müziği boğuklaştırır
  tone.type = 'lowpass';
  tone.frequency.value = 18000;
  const duck = ctx.createGain();
  const music = { dry: ctx.createGain(), wet: ctx.createGain() };
  music.dry.connect(tone);
  tone.connect(duck);
  duck.connect(master);
  music.wet.connect(reverbIn);

  bus = { master, comp, sfx, music, tone, duck, reverbIn, convolver: null, reverbOut };
  applyQuality(settings.quality);
  applyVolumes(0);
}

function createNoiseBuffer(seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Karanlık bir taş salon yankısı: koyulaşarak sönen gürültü. */
function createImpulse(seconds) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const predelay = Math.floor(rate * 0.015);
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = predelay; i < length; i++) {
      const k = i / length;
      lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.45 * k); // zamanla kararan ton
      data[i] = lp * (1 - k) ** 2.4;
    }
  }
  return buf;
}

function applyQuality(q) {
  settings.quality = q;
  if (!bus) return;
  // Yankı her kalite değişiminde yeni düğümle kurulur; düşük kalitede tamamen
  // kapanır (mobilde en pahalı ses işlemi budur).
  try {
    bus.reverbIn.disconnect();
  } catch {
    /* zaten bağlı değil */
  }
  if (bus.convolver) {
    bus.convolver.disconnect();
    bus.convolver = null;
  }
  if (q === 'low') return;
  const conv = ctx.createConvolver();
  conv.buffer = createImpulse(q === 'medium' ? 1.6 : 2.6);
  conv.connect(bus.reverbOut);
  bus.reverbIn.connect(conv);
  bus.convolver = conv;
}

function setParam(param, value, timeConstant = 0.04) {
  const t = ctx.currentTime;
  param.cancelScheduledValues(t);
  param.setTargetAtTime(value, t, timeConstant);
}

function applyVolumes(timeConstant = 0.04) {
  if (!bus) return;
  const set = timeConstant > 0 ? (p, v) => setParam(p, v, timeConstant) : (p, v) => { p.value = v; };
  set(bus.sfx.dry.gain, settings.sfx);
  set(bus.sfx.wet.gain, settings.sfx);
  const m = settings.music * MUSIC_LEVEL * (paused ? 0.35 : 1) * stingDuck;
  set(bus.music.dry.gain, m);
  set(bus.music.wet.gain, m);
}

/* --------------------------------------------------------------------------
 * 4. SES (VOICE) YÖNETİMİ
 *  Her efekt bir "voice" içinde kurulur. Voice'un tüm kaynakları bitince
 *  bütün düğümler ayrılır → bellek sızıntısı olmaz.
 *  Aynı sesten çok fazla çalmasın diye her ses için en kısa tekrar aralığı
 *  ve eşzamanlı ses sınırı uygulanır (3x hızda bile kulak yorulmaz).
 *  Ayrıca toplam bir ses bütçesi vardır: dolunca sıradan atış/vuruş sesleri
 *  atlanır, "pri" (öncelikli) sesler — can kaybı, boss, arayüz — her zaman çalar.
 * ------------------------------------------------------------------------ */
function makeVoice(target, wet = 0, pan = 0, gain = 1, onDone = null) {
  const nodes = [];
  const out = ctx.createGain();
  out.gain.value = gain;
  nodes.push(out);

  let tail = out;
  if (pan !== 0 && canPan) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    out.connect(p);
    nodes.push(p);
    tail = p;
  }
  tail.connect(target.dry);
  if (wet > 0) {
    const send = ctx.createGain();
    send.gain.value = wet;
    tail.connect(send);
    send.connect(target.wet);
    nodes.push(send);
  }

  let pending = 0;
  const release = () => {
    pending -= 1;
    if (pending > 0) return;
    for (const n of nodes) n.disconnect();
    nodes.length = 0;
    if (onDone) onDone();
  };
  return {
    out,
    keep: (node) => {
      nodes.push(node);
      return node;
    },
    track: (src) => {
      pending += 1;
      nodes.push(src);
      src.onended = release;
      return src;
    },
  };
}

const DEFAULT_META = Object.freeze({ throttle: AUDIO.sfxThrottle, voices: AUDIO.maxVoicesPerSfx, wet: 0.1, gain: 1, pri: false });
const voiceState = new Map(); // id → { last, ends: [] }

function admit(id, meta, now) {
  let st = voiceState.get(id);
  if (!st) {
    st = { last: -Infinity, ends: [] };
    voiceState.set(id, st);
  }
  if (now - st.last < meta.throttle) return false;
  let active = 0;
  for (let i = 0; i < st.ends.length; i++) if (st.ends[i] > now) active++;
  if (active >= meta.voices) return false;
  st.last = now;
  return true;
}

function holdVoice(id, endTime) {
  const st = voiceState.get(id);
  const now = ctx.currentTime;
  let w = 0;
  for (let i = 0; i < st.ends.length; i++) if (st.ends[i] > now) st.ends[w++] = st.ends[i];
  st.ends.length = w;
  st.ends.push(endTime);
}

/* --------------------------------------------------------------------------
 * 5. SENTEZ YAPI TAŞLARI
 * ------------------------------------------------------------------------ */
/** 0'dan tepe değere çıkıp üstel olarak sönen zarf. */
function envelope(param, t, attack, peak, decay) {
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay);
}

/** Yükselip bir süre tutulan, sonra sönen zarf (boru, pad). */
function envelopeHold(param, t, attack, peak, hold, release) {
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setValueAtTime(peak, t + attack + hold);
  param.exponentialRampToValueAtTime(EPS, t + attack + hold + release);
}

function gainNode(v, value = 0) {
  const g = v.keep(ctx.createGain());
  g.gain.value = value;
  return g;
}

function filterNode(v, type, freq, q = 1) {
  const f = v.keep(ctx.createBiquadFilter());
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function oscNode(v, type, freq, t0, t1) {
  const o = v.track(ctx.createOscillator());
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.start(t0);
  o.stop(t1);
  return o;
}

function noiseNode(v, t0, t1, loop = false) {
  const s = v.track(ctx.createBufferSource());
  s.buffer = noiseBuffer;
  s.loop = loop;
  s.start(t0, Math.random() * (noiseBuffer.duration * 0.5));
  if (t1 !== Infinity) s.stop(t1);
  return s;
}

/** Perdesi kayabilen, sönen tek bir ton. */
function tone(v, { type = 'sine', f0, f1 = f0, t, attack = 0.004, dur, peak, dest = v.out, detune = 0 }) {
  const end = t + attack + dur;
  const o = oscNode(v, type, f0, t, end + 0.05);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, end);
  if (detune) o.detune.value = detune;
  const g = gainNode(v);
  envelope(g.gain, t, attack, peak, dur);
  o.connect(g);
  g.connect(dest);
  return end - t;
}

/** Süzgeçten geçen, süzgeci kayabilen gürültü patlaması. */
function burst(v, { t, dur, peak, attack = 0.003, type = 'bandpass', f0, f1 = f0, q = 1, dest = v.out }) {
  const end = t + attack + dur;
  const s = noiseNode(v, t, end + 0.05);
  const f = filterNode(v, type, f0, q);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, end);
  const g = gainNode(v);
  envelope(g.gain, t, attack, peak, dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  return end - t;
}

/** Çan tınısı: temel + uyumsuz kısmi sesler. */
function bell(v, { f, t, peak, decay }) {
  tone(v, { f0: f, t, dur: decay, peak });
  tone(v, { f0: f * 2.76, t, dur: decay * 0.35, peak: peak * 0.35 });
  tone(v, { type: 'triangle', f0: f * 2, t, dur: decay * 0.5, peak: peak * 0.2 });
  return decay;
}

/** Süzgeç zarflı, tutulan boru/pirinç sesi. */
function horn(v, { f, t, attack, hold, release, peak, cutoffPeak = 1400, bend = 0.94 }) {
  const end = t + attack + hold + release;
  const lp = filterNode(v, 'lowpass', 250, 1.2);
  lp.frequency.setValueAtTime(250, t);
  lp.frequency.linearRampToValueAtTime(cutoffPeak, t + attack);
  lp.frequency.exponentialRampToValueAtTime(400, end);
  const g = gainNode(v);
  envelopeHold(g.gain, t, attack, peak, hold, release);
  lp.connect(g);
  g.connect(v.out);
  for (const cents of [-7, 7]) {
    const o = oscNode(v, 'sawtooth', f * bend, t, end + 0.05);
    o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.25, attack));
    o.detune.value = cents;
    o.connect(lp);
  }
  return end - t;
}

const vary = (f, amount = 0.06) => f * (1 + rng.spread(0, amount));

/* --------------------------------------------------------------------------
 * 6. EFEKT TARİFLERİ
 *  Her tarif (voice, başlangıç zamanı, seçenekler) alır ve süresini döndürür.
 * ------------------------------------------------------------------------ */
const META = {
  archer: { throttle: 0.05, voices: 3, wet: 0.08, gain: 1.3 },
  mortar: { throttle: 0.09, voices: 3, wet: 0.16, gain: 0.55 },
  frost: { throttle: 0.06, voices: 3, wet: 0.25, gain: 1.2 },
  tesla: { throttle: 0.07, voices: 3, wet: 0.14, gain: 1.2 },
  poison: { throttle: 0.08, voices: 3, wet: 0.16, gain: 1.6 },
  curse: { throttle: 0.4, voices: 2, wet: 0.35, gain: 1 },
  lance: { throttle: 0.08, voices: 3, wet: 0.12, gain: 1.4 },
  prism: { throttle: 0.35, voices: 2, wet: 0.3, gain: 1.1 },
  flame: { throttle: 0.16, voices: 2, wet: 0.1, gain: 1.3 },
  hunter: { throttle: 0.1, voices: 2, wet: 0.22, gain: 1.2 },
  bell: { throttle: 0.5, voices: 2, wet: 0.55, gain: 1.4 },
  generate: { throttle: 0.15, voices: 2, wet: 0.4, gain: 1.8 },
  evade: { throttle: 0.1, voices: 2, wet: 0.1, gain: 1.3 },
  execute: { throttle: 0.1, voices: 2, wet: 0.2, gain: 1.6, pri: true },
  enrage: { throttle: 0.5, voices: 2, wet: 0.3, gain: 1.3 },
  ward: { throttle: 0.3, voices: 2, wet: 0.45, gain: 1.3 },
  cleanse: { throttle: 0.3, voices: 2, wet: 0.45, gain: 1.2 },
  blink: { throttle: 0.15, voices: 2, wet: 0.3, gain: 1.4 },
  web: { throttle: 0.2, voices: 2, wet: 0.15, gain: 1.5, pri: true },
  deathblast: { throttle: 0.2, voices: 2, wet: 0.25, gain: 1.3, pri: true },
  harden: { throttle: 1, voices: 1, wet: 0.35, gain: 1.3, pri: true },
  hex: { throttle: 1, voices: 1, wet: 0.45, gain: 1.3, pri: true },
  blizzard: { throttle: 2, voices: 1, wet: 0.55, gain: 1.1, pri: true },
  rebirth: { throttle: 2, voices: 1, wet: 0.55, gain: 1, pri: true },
  stomp: { throttle: 1, voices: 1, wet: 0.35, gain: 1, pri: true },
  voidburst: { throttle: 1, voices: 1, wet: 0.45, gain: 1, pri: true },
  roar: { throttle: 1, voices: 1, wet: 0.4, gain: 1.1, pri: true },
  ev_warn: { throttle: 1, voices: 1, wet: 0.55, gain: 1.2, pri: true },
  ev_rise: { throttle: 0.8, voices: 1, wet: 0.35, gain: 1.2, pri: true },
  ev_gas: { throttle: 0.8, voices: 1, wet: 0.3, gain: 1.2, pri: true },
  ev_rift: { throttle: 0.8, voices: 1, wet: 0.5, gain: 1.1, pri: true },
  rift_hit: { throttle: 0.12, voices: 2, wet: 0.3, gain: 1.3 },
  skill_thunder: { throttle: 0.5, voices: 1, wet: 0.45, gain: 1, pri: true },
  thunder_hit: { throttle: 0.05, voices: 3, wet: 0.2, gain: 1.2 },
  skill_timestop: { throttle: 0.5, voices: 1, wet: 0.6, gain: 1.2, pri: true },
  skill_plague: { throttle: 0.5, voices: 1, wet: 0.35, gain: 1.2, pri: true },
  skill_mend: { throttle: 0.5, voices: 1, wet: 0.6, gain: 1.2, pri: true },
  skill_vortex: { throttle: 0.5, voices: 1, wet: 0.4, gain: 1.1, pri: true },
  vortex_hit: { throttle: 0.3, voices: 1, wet: 0.35, gain: 1, pri: true },
  skill_reaper: { throttle: 0.5, voices: 1, wet: 0.5, gain: 1.2, pri: true },
  hit: { throttle: 0.07, voices: 3, wet: 0, gain: 2 },
  crit: { throttle: 0.05, voices: 3, wet: 0.05, gain: 2 },
  clank: { throttle: 0.09, voices: 3, wet: 0.1, gain: 1.6 },
  kill: { throttle: 0.045, voices: 5, wet: 0.12, gain: 1.3 },
  coin: { throttle: 0.09, voices: 2, wet: 0.1, gain: 2 },
  soul: { throttle: 0.07, voices: 3, wet: 0.35, gain: 2 },
  skill_log: { throttle: 0.5, voices: 1, wet: 0.2, gain: 1, pri: true },
  log_hit: { throttle: 0.06, voices: 3, wet: 0.1, gain: 1.2 },
  skill_meteor: { throttle: 0.3, voices: 2, wet: 0.3, gain: 1, pri: true },
  skill_frost: { throttle: 0.5, voices: 1, wet: 0.5, gain: 1.2, pri: true },
  purchase: { throttle: 0.1, voices: 2, wet: 0.35, gain: 1.6, pri: true },
  repair: { throttle: 0.5, voices: 1, wet: 0.3, gain: 1.4, pri: true },
  leak: { throttle: 0.25, voices: 2, wet: 0.4, gain: 1, pri: true },
  phase: { throttle: 0.15, voices: 2, wet: 0.45, gain: 1.4 },
  heal: { throttle: 0.3, voices: 2, wet: 0.45, gain: 1 },
  freeze: { throttle: 0.1, voices: 2, wet: 0.2, gain: 1.3 },
  stun: { throttle: 0.1, voices: 2, wet: 0.1, gain: 1 },
  silence: { throttle: 0.2, voices: 2, wet: 0.2, gain: 2, pri: true },
  explosion: { throttle: 0.08, voices: 4, wet: 0.2, gain: 1 },
  shatter: { throttle: 0.08, voices: 3, wet: 0.25, gain: 1 },
  splat: { throttle: 0.08, voices: 3, wet: 0.12, gain: 1.5 },
  scorch: { throttle: 1, voices: 1, wet: 0.35, gain: 1, pri: true },
  summon: { throttle: 1, voices: 1, wet: 0.35, gain: 1, pri: true },
  boss_spawn: { throttle: 2, voices: 1, wet: 0.5, gain: 1, pri: true },
  boss_phase: { throttle: 1, voices: 1, wet: 0.45, gain: 1, pri: true },
  boss_die: { throttle: 2, voices: 1, wet: 0.5, gain: 1, pri: true },
  wave_start: { throttle: 1, voices: 1, wet: 0.45, gain: 1, pri: true },
  wave_clear: { throttle: 1, voices: 1, wet: 0.55, gain: 1, pri: true },
  unlock: { throttle: 0.5, voices: 1, wet: 0.5, gain: 1.4, pri: true },
  victory: { throttle: 3, voices: 1, wet: 0.5, gain: 1, pri: true },
  defeat: { throttle: 3, voices: 1, wet: 0.55, gain: 1, pri: true },
  build: { throttle: 0.08, voices: 2, wet: 0.15, gain: 1, pri: true },
  upgrade: { throttle: 0.08, voices: 2, wet: 0.3, gain: 1.6, pri: true },
  sell: { throttle: 0.08, voices: 2, wet: 0.15, gain: 2, pri: true },
  ui_tap: { throttle: 0.03, voices: 2, wet: 0, gain: 3, pri: true },
  ui_open: { throttle: 0.05, voices: 2, wet: 0.1, gain: 3, pri: true },
  ui_close: { throttle: 0.05, voices: 2, wet: 0.1, gain: 3, pri: true },
  ui_confirm: { throttle: 0.05, voices: 2, wet: 0.15, gain: 2, pri: true },
  ui_deny: { throttle: 0.15, voices: 1, wet: 0, gain: 1, pri: true },
  ui_tick: { throttle: 0.2, voices: 1, wet: 0.1, gain: 3, pri: true },
  ui_toggle: { throttle: 0.03, voices: 2, wet: 0, gain: 3, pri: true },
};

const SFX = {
  /* — Kule atışları — */
  archer(v, t, o) {
    const f = vary(1100, 0.08);
    tone(v, { type: 'triangle', f0: f, f1: f * 0.45, t, dur: 0.09, peak: 0.22 }); // kiriş
    burst(v, { t: t + 0.005, dur: 0.11, peak: 0.12, type: 'highpass', f0: 3000, f1: 1800, q: 0.7 }); // ok sesi
    if (o.mastery === 0) tone(v, { type: 'square', f0: f * 0.5, f1: f * 0.22, t, dur: 0.06, peak: 0.07 });
    if (o.mastery === 1) {
      burst(v, { t: t + 0.04, dur: 0.1, peak: 0.08, type: 'highpass', f0: 3400, f1: 2000, q: 0.7 });
      burst(v, { t: t + 0.08, dur: 0.1, peak: 0.06, type: 'highpass', f0: 2800, f1: 1700, q: 0.7 });
    }
    return 0.22;
  },

  mortar(v, t, o) {
    const quake = o.mastery === 1;
    tone(v, { f0: vary(quake ? 110 : 150), f1: quake ? 34 : 45, t, dur: quake ? 0.5 : 0.35, peak: 0.55 });
    burst(v, { t, dur: 0.25, peak: 0.28, type: 'lowpass', f0: 900, f1: 120, q: 0.8 });
    tone(v, { type: 'square', f0: 220, f1: 110, t: t + 0.01, dur: 0.04, peak: 0.04 }); // namlu tıkırtısı
    return quake ? 0.6 : 0.42;
  },

  frost(v, t, o) {
    const base = vary(2600, 0.1);
    [1, 1.51, 2.37].forEach((m, i) => tone(v, { f0: base * m, t: t + i * 0.012, dur: 0.35 - i * 0.08, peak: 0.065 }));
    burst(v, { t, dur: 0.06, peak: 0.12, type: 'highpass', f0: 5000, q: 0.5 });
    if (o.mastery === 0) tone(v, { type: 'triangle', f0: 900, f1: 1300, t, attack: 0.03, dur: 0.3, peak: 0.05 });
    return 0.4;
  },

  tesla(v, t, o) {
    const thunder = o.mastery === 0;
    const len = o.mastery === 1 ? 0.3 : 0.16;
    const hp = filterNode(v, 'highpass', 400, 0.7);
    const g = gainNode(v);
    envelope(g.gain, t, 0.003, 0.11, len);
    hp.connect(g);
    g.connect(v.out);
    const zap = oscNode(v, 'sawtooth', 180, t, t + len + 0.05);
    for (let i = 0; i < 8; i++) zap.frequency.setValueAtTime(rng.range(120, 900), t + (i * len) / 8);
    zap.connect(hp);
    burst(v, { t, dur: len * 0.8, peak: 0.14, type: 'highpass', f0: 2500, q: 0.6 }); // çıtırtı
    if (thunder) {
      tone(v, { f0: 90, f1: 38, t, dur: 0.6, peak: 0.35 });
      burst(v, { t, dur: 0.8, peak: 0.28, type: 'lowpass', f0: 1200, f1: 100, q: 0.6 });
      return 0.9;
    }
    return len + 0.05;
  },

  poison(v, t) {
    tone(v, { f0: vary(260), f1: vary(620), t, dur: 0.07, peak: 0.12 }); // fokurtu
    tone(v, { f0: vary(320), f1: vary(760), t: t + 0.06, dur: 0.06, peak: 0.08 });
    burst(v, { t, dur: 0.12, peak: 0.07, type: 'lowpass', f0: 600, q: 0.8 });
    return 0.2;
  },

  curse(v, t) {
    burst(v, { t, attack: 0.08, dur: 0.5, peak: 0.08, type: 'bandpass', f0: 500, f1: 260, q: 4 }); // fısıltı
    tone(v, { f0: 110, f1: 98, t, attack: 0.05, dur: 0.6, peak: 0.08 }); // uğultu
    return 0.7;
  },

  /** Mızrak Atar: ağır kiriş, havayı yaran mızrak. */
  lance(v, t, o) {
    tone(v, { type: 'triangle', f0: vary(260, 0.06), f1: 90, t, dur: 0.16, peak: 0.24 });
    burst(v, { t: t + 0.01, dur: 0.22, peak: 0.12, type: 'bandpass', f0: 1800, f1: 500, q: 1.2 });
    tone(v, { f0: vary(120), f1: 70, t, dur: 0.1, peak: 0.18 }); // tahta gümbürtüsü
    if (o.mastery === 1) burst(v, { t: t + 0.05, dur: 0.3, peak: 0.06, type: 'highpass', f0: 2600, f1: 1400, q: 0.8 }); // zincir
    return 0.36;
  },

  /** Kristal Prizma: ışın sürdükçe cam gibi uğuldar. */
  prism(v, t) {
    const f = vary(880, 0.02);
    const o = oscNode(v, 'sine', f, t, t + 0.6);
    const g2 = gainNode(v);
    envelope(g2.gain, t, 0.08, 0.035, 0.45);
    const lfo = oscNode(v, 'sine', 14, t, t + 0.6);
    const depth = gainNode(v, 18);
    lfo.connect(depth);
    depth.connect(o.frequency);
    o.connect(g2);
    g2.connect(v.out);
    tone(v, { type: 'triangle', f0: f * 2.01, t: t + 0.04, attack: 0.05, dur: 0.35, peak: 0.012 });
    return 0.6;
  },

  /** Ejder Ağzı: kısa alev püskürmesi ve çıtırtı. */
  flame(v, t) {
    burst(v, { t, attack: 0.03, dur: 0.28, peak: 0.16, type: 'lowpass', f0: 2600, f1: 500, q: 0.6 });
    for (let i = 0; i < 3; i++) burst(v, { t: t + 0.04 + i * 0.05 + rng.range(0, 0.02), dur: 0.02, peak: 0.05, type: 'highpass', f0: vary(3000, 0.3), q: 1.5 });
    return 0.34;
  },

  /** Kara Avcı: sert tetik, uzaktan yankı. */
  hunter(v, t) {
    burst(v, { t, dur: 0.05, peak: 0.26, type: 'highpass', f0: 2200, q: 0.7 });
    tone(v, { f0: 160, f1: 50, t, dur: 0.22, peak: 0.3 });
    tone(v, { type: 'triangle', f0: vary(1300, 0.04), f1: 700, t: t + 0.01, dur: 0.12, peak: 0.05 });
    return 0.3;
  },

  /** Savaş Çanı (Ölüm Çanı nabzı): derin, uzun çan. */
  bell(v, t, o) {
    const f = o.mastery === 1 ? 147 : 220;
    bell(v, { f, t, peak: 0.12, decay: 2.4 });
    bell(v, { f: f * 1.5, t: t + 0.01, peak: 0.04, decay: 1.6 });
    tone(v, { f0: f / 2, t, dur: 1.2, peak: 0.08 });
    return 2.5;
  },

  /** Ruh Kuyusu üretti: iki notalık yumuşak çınlama. */
  generate(v, t, o) {
    const base = o.kind === 'interest' ? 1318.5 : 1046.5;
    tone(v, { type: 'triangle', f0: base, t, attack: 0.02, dur: 0.3, peak: 0.03 });
    tone(v, { type: 'triangle', f0: base * 1.5, t: t + 0.08, attack: 0.02, dur: 0.4, peak: 0.028 });
    if (o.kind === 'interest') tone(v, { type: 'triangle', f0: base * 2, t: t + 0.16, attack: 0.02, dur: 0.5, peak: 0.024 });
    return 0.7;
  },

  /* — Düşman yetenekleri ve durumları — */
  evade(v, t) {
    burst(v, { t, attack: 0.01, dur: 0.12, peak: 0.08, type: 'highpass', f0: 3600, f1: 1400, q: 0.7 });
    return 0.15;
  },
  execute(v, t) {
    burst(v, { t, dur: 0.12, peak: 0.2, type: 'bandpass', f0: 4000, f1: 1500, q: 2 });
    tone(v, { f0: 180, f1: 50, t: t + 0.04, dur: 0.35, peak: 0.3 });
    bell(v, { f: 110, t: t + 0.05, peak: 0.05, decay: 1.2 });
    return 1.3;
  },
  enrage(v, t) {
    const o = oscNode(v, 'sawtooth', 70, t, t + 0.7);
    o.frequency.linearRampToValueAtTime(110, t + 0.5);
    const lp = filterNode(v, 'lowpass', 600, 1.5);
    const g2 = gainNode(v);
    envelope(g2.gain, t, 0.08, 0.08, 0.55);
    o.connect(lp);
    lp.connect(g2);
    g2.connect(v.out);
    return 0.7;
  },
  ward(v, t) {
    const base = vary(2200, 0.05);
    [1, 1.33, 1.78].forEach((m, i) => tone(v, { f0: base * m, t: t + i * 0.05, attack: 0.03, dur: 0.6, peak: 0.022 }));
    burst(v, { t, attack: 0.1, dur: 0.4, peak: 0.05, type: 'highpass', f0: 5000, q: 0.5 });
    return 0.8;
  },
  cleanse(v, t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(v, { type: 'triangle', f0: f, t: t + i * 0.04, attack: 0.04, dur: 0.5, peak: 0.022 }));
    return 0.7;
  },
  blink(v, t) {
    tone(v, { f0: 300, f1: 1800, t, attack: 0.01, dur: 0.14, peak: 0.06 });
    burst(v, { t, attack: 0.12, dur: 0.06, peak: 0.08, type: 'bandpass', f0: 600, f1: 3000, q: 2 });
    return 0.25;
  },
  web(v, t) {
    burst(v, { t, dur: 0.14, peak: 0.14, type: 'lowpass', f0: 900, f1: 300, q: 1.2 });
    tone(v, { type: 'square', f0: vary(160), f1: 120, t: t + 0.03, dur: 0.2, peak: 0.025 });
    return 0.3;
  },
  deathblast(v, t) {
    burst(v, { t, dur: 0.35, peak: 0.2, type: 'lowpass', f0: 1200, f1: 200, q: 0.9 });
    burst(v, { t: t + 0.05, attack: 0.05, dur: 0.6, peak: 0.08, type: 'highpass', f0: 2500, q: 0.5 }); // tıslama
    tone(v, { f0: 90, f1: 40, t, dur: 0.3, peak: 0.3 });
    return 0.8;
  },
  harden(v, t) {
    const f = vary(420, 0.05);
    [1, 2.4, 3.9, 5.1].forEach((m, i) => tone(v, { f0: f * m, t: t + i * 0.01, dur: 0.6 - i * 0.1, peak: 0.06 / (i + 1) }));
    burst(v, { t, dur: 0.04, peak: 0.12, type: 'highpass', f0: 2500, q: 0.7 });
    return 0.7;
  },
  hex(v, t) {
    burst(v, { t, attack: 0.15, dur: 0.8, peak: 0.1, type: 'bandpass', f0: 700, f1: 300, q: 5 });
    tone(v, { f0: 98, f1: 92, t, attack: 0.1, dur: 0.9, peak: 0.08 });
    tone(v, { f0: 104, t, attack: 0.1, dur: 0.9, peak: 0.05 }); // akortsuzluk
    return 1.1;
  },
  blizzard(v, t) {
    burst(v, { t, attack: 0.4, dur: 2.2, peak: 0.2, type: 'bandpass', f0: 400, f1: 1800, q: 1.2 });
    burst(v, { t: t + 0.3, attack: 0.5, dur: 1.8, peak: 0.1, type: 'highpass', f0: 3000, q: 0.5 });
    [1760, 2093, 2637].forEach((f, i) => tone(v, { f0: f, t: t + 0.2 + i * 0.12, attack: 0.05, dur: 1, peak: 0.018 }));
    return 2.8;
  },
  rebirth(v, t) {
    burst(v, { t, attack: 0.6, dur: 0.4, peak: 0.26, type: 'lowpass', f0: 300, f1: 4000, q: 0.6 });
    horn(v, { f: 220, t: t + 0.55, attack: 0.1, hold: 0.5, release: 1.2, peak: 0.07, cutoffPeak: 1800, bend: 1 });
    horn(v, { f: 330, t: t + 0.6, attack: 0.1, hold: 0.4, release: 1.1, peak: 0.05, cutoffPeak: 1800, bend: 1 });
    return 2.4;
  },
  stomp(v, t) {
    tone(v, { f0: 80, f1: 30, t, dur: 0.8, peak: 0.55 });
    burst(v, { t, dur: 0.5, peak: 0.26, type: 'lowpass', f0: 900, f1: 120, q: 0.8 });
    const base = vary(2800, 0.1);
    [1, 1.4, 1.9].forEach((m, i) => tone(v, { f0: base * m, t: t + 0.04 + i * 0.02, dur: 0.4, peak: 0.03 }));
    return 1;
  },
  voidburst(v, t) {
    tone(v, { f0: 60, f1: 28, t, dur: 1.2, peak: 0.5 });
    burst(v, { t, attack: 0.3, dur: 0.6, peak: 0.12, type: 'bandpass', f0: 300, f1: 2400, q: 3 });
    tone(v, { type: 'sawtooth', f0: 46, t, attack: 0.2, dur: 1, peak: 0.04 });
    return 1.4;
  },
  /** Öfkeli patronun kükremesi: pes, hırıltılı, titreyen bir boğaz sesi. */
  roar(v, t) {
    burst(v, { t, attack: 0.08, dur: 0.9, peak: 0.24, type: 'bandpass', f0: 260, f1: 140, q: 1.6 });
    tone(v, { type: 'sawtooth', f0: 92, f1: 58, t, attack: 0.06, dur: 0.95, peak: 0.07 });
    tone(v, { type: 'sawtooth', f0: 97, f1: 61, t, attack: 0.06, dur: 0.9, peak: 0.05 }); // akortsuz: hırıltı
    tone(v, { f0: 55, f1: 32, t, dur: 0.8, peak: 0.35 });
    return 1.1;
  },

  /* — Harita olayları — */
  /** Uyarı: alçak, yükselen bir uğultu ve iki kısa çan vuruşu (bir şey geliyor). */
  ev_warn(v, t) {
    burst(v, { t, attack: 0.5, dur: 0.6, peak: 0.08, type: 'bandpass', f0: 180, f1: 520, q: 2.5 });
    bell(v, { f: 207.65, t: t + 0.1, peak: 0.05, decay: 1.2 });
    bell(v, { f: 196, t: t + 0.42, peak: 0.04, decay: 1.4 });
    return 1.8;
  },
  /** Mezardan kalkan ölüler: toprak gürlemesi ve kemik takırtısı. */
  ev_rise(v, t) {
    tone(v, { f0: 70, f1: 40, t, attack: 0.05, dur: 0.7, peak: 0.4 });
    burst(v, { t, dur: 0.5, peak: 0.18, type: 'lowpass', f0: 700, f1: 120, q: 0.8 });
    for (let i = 0; i < 6; i++) {
      burst(v, { t: t + 0.12 + i * 0.05 + rng.range(0, 0.02), dur: 0.025, peak: 0.08, type: 'highpass', f0: vary(2400, 0.3), q: 2 });
    }
    return 0.9;
  },
  /** Gaz kabarcığı patlar: tok "plop" ve uzun tıslama. */
  ev_gas(v, t) {
    tone(v, { f0: 160, f1: 60, t, dur: 0.25, peak: 0.3 });
    burst(v, { t: t + 0.04, attack: 0.1, dur: 1.4, peak: 0.12, type: 'highpass', f0: 1800, q: 0.5 });
    for (let i = 0; i < 4; i++) tone(v, { f0: vary(320, 0.3), f1: 520, t: t + 0.2 + i * 0.13, dur: 0.06, peak: 0.04 });
    return 1.6;
  },
  /** Boşluk yarığı açılır: içe çeken bir vınlama. */
  ev_rift(v, t) {
    tone(v, { f0: 1400, f1: 120, t, attack: 0.3, dur: 0.9, peak: 0.05 });
    burst(v, { t, attack: 0.4, dur: 0.8, peak: 0.12, type: 'bandpass', f0: 2400, f1: 300, q: 3 });
    tone(v, { f0: 52, t: t + 0.2, attack: 0.2, dur: 1.2, peak: 0.3 });
    return 1.5;
  },
  rift_hit(v, t) {
    tone(v, { f0: 300, f1: 1600, t, attack: 0.01, dur: 0.12, peak: 0.05 });
    burst(v, { t, attack: 0.08, dur: 0.06, peak: 0.06, type: 'bandpass', f0: 800, f1: 2600, q: 2 });
    return 0.2;
  },

  /* — Vuruş ve ölüm — */
  hit(v, t) {
    burst(v, { t, dur: 0.04, peak: 0.07, type: 'bandpass', f0: vary(1200, 0.2), q: 1.2 });
    tone(v, { f0: vary(220), f1: 140, t, dur: 0.05, peak: 0.05 });
    return 0.07;
  },

  crit(v, t) {
    burst(v, { t, dur: 0.05, peak: 0.2, type: 'highpass', f0: 3000, q: 0.7 });
    tone(v, { type: 'square', f0: 1800, f1: 900, t, dur: 0.06, peak: 0.05 });
    return 0.08;
  },

  /** Fiziksel hasar zırha çarptı: oyuncuya "burası büyü ister" der. */
  clank(v, t) {
    const f = vary(620, 0.08);
    [1, 2.7, 4.1].forEach((m, i) => tone(v, { f0: f * m, t, dur: 0.18 - i * 0.04, peak: 0.06 / (i + 1) }));
    burst(v, { t, dur: 0.03, peak: 0.09, type: 'highpass', f0: 2000, q: 0.7 });
    return 0.2;
  },

  kill(v, t, o) {
    const def = ENEMIES[o.type];
    const size = def ? def.size : 0.3;
    const pitch = 1.5 - size * 1.6; // küçük düşman → tiz, büyük → pes
    burst(v, { t, dur: 0.15 + size * 0.5, peak: 0.14, type: 'lowpass', f0: 2200 * pitch, f1: 180, q: 1 }); // savrulma
    switch (o.type) {
      case 'wolf':
        tone(v, { type: 'triangle', f0: 900, f1: 1400, t, dur: 0.06, peak: 0.11 });
        tone(v, { type: 'triangle', f0: 1400, f1: 420, t: t + 0.06, dur: 0.16, peak: 0.1 });
        return 0.3;
      case 'bat':
        tone(v, { type: 'square', f0: 3000, f1: 1800, t, dur: 0.07, peak: 0.05 });
        tone(v, { type: 'square', f0: 2600, f1: 1500, t: t + 0.07, dur: 0.07, peak: 0.036 });
        return 0.2;
      case 'knight':
      case 'skeleton':
        for (let i = 0; i < 5; i++) {
          burst(v, { t: t + i * 0.028 + rng.range(0, 0.012), dur: 0.025, peak: 0.11, type: 'highpass', f0: vary(2600, 0.3), q: 2 });
        }
        return 0.25;
      case 'wraith': {
        const end = tone(v, { f0: 820, f1: 190, t, attack: 0.02, dur: 0.55, peak: 0.07 });
        tone(v, { f0: 830, f1: 200, t, attack: 0.02, dur: 0.5, peak: 0.04, detune: 18 });
        return end + 0.1;
      }
      case 'brute':
      case 'brood':
      case 'troll':
      case 'molten':
        tone(v, { f0: 120, f1: 38, t, dur: 0.5, peak: 0.22 });
        return 0.6;
      case 'golem':
      case 'shardling':
      case 'frostwolf': {
        const base = vary(2600, 0.1);
        [1, 1.33, 1.78].forEach((m, i) => tone(v, { f0: base * m, t: t + i * 0.015, dur: 0.16, peak: 0.035 }));
        if (o.type === 'golem') tone(v, { f0: 110, f1: 45, t, dur: 0.4, peak: 0.2 });
        return 0.45;
      }
      case 'raven':
        tone(v, { type: 'square', f0: 900, f1: 600, t, dur: 0.08, peak: 0.04 });
        tone(v, { type: 'square', f0: 850, f1: 500, t: t + 0.1, dur: 0.1, peak: 0.035 });
        return 0.25;
      case 'slime':
      case 'slimelet':
        tone(v, { f0: vary(240), f1: vary(560), t, dur: 0.08, peak: 0.1 });
        return 0.2;
      case 'imp':
        tone(v, { type: 'triangle', f0: 1200, f1: 400, t, dur: 0.12, peak: 0.07 });
        return 0.2;
      case 'voidwalker':
      case 'revenant':
      case 'spider':
      case 'oracle': {
        const end = tone(v, { f0: 300, f1: 1200, t, attack: 0.02, dur: 0.3, peak: 0.05 });
        tone(v, { f0: 90, f1: 45, t, dur: 0.3, peak: 0.12 });
        return end + 0.05;
      }
      default:
        tone(v, { type: 'triangle', f0: 300 * pitch, f1: 70, t, dur: 0.2 + size * 0.4, peak: 0.1 });
        return 0.45;
    }
  },

  coin(v, t) {
    tone(v, { type: 'triangle', f0: vary(1976, 0.02), t, dur: 0.12, peak: 0.045 });
    tone(v, { type: 'triangle', f0: vary(2637, 0.02), t: t + 0.05, dur: 0.14, peak: 0.04 });
    return 0.22;
  },

  /** Ruh toplanır: havada asılı, cam gibi yumuşak bir tını. */
  soul(v, t) {
    const f = vary(1568, 0.03);
    tone(v, { f0: f, f1: f * 1.5, t, attack: 0.02, dur: 0.35, peak: 0.035 });
    tone(v, { f0: f * 2.01, t: t + 0.04, attack: 0.02, dur: 0.3, peak: 0.018 });
    return 0.45;
  },

  /* — Yetenekler — */
  skill_log(v, t) {
    burst(v, { t, attack: 0.05, dur: 1.6, peak: 0.22, type: 'lowpass', f0: 380, f1: 160, q: 0.8 }); // yuvarlanma gürültüsü
    for (let i = 0; i < 6; i++) tone(v, { f0: vary(70, 0.1), f1: 45, t: t + i * 0.22, dur: 0.18, peak: 0.25 }); // tok vuruşlar
    return 1.8;
  },

  log_hit(v, t) {
    tone(v, { f0: vary(140), f1: 60, t, dur: 0.12, peak: 0.3 });
    burst(v, { t, dur: 0.08, peak: 0.12, type: 'lowpass', f0: 1500, q: 0.8 });
    return 0.2;
  },

  skill_meteor(v, t) {
    burst(v, { t, attack: 0.5, dur: 0.75, peak: 0.16, type: 'bandpass', f0: 2600, f1: 500, q: 2.5 }); // düşüş ıslığı
    tone(v, { type: 'sawtooth', f0: 900, f1: 120, t, attack: 0.4, dur: 0.75, peak: 0.025 });
    return 0.85;
  },

  skill_thunder(v, t) {
    burst(v, { t, dur: 0.12, peak: 0.3, type: 'highpass', f0: 1800, q: 0.6 }); // çatırtı
    burst(v, { t: t + 0.08, attack: 0.1, dur: 1.6, peak: 0.24, type: 'lowpass', f0: 600, f1: 80, q: 0.7 }); // gürleme
    tone(v, { f0: 60, f1: 30, t: t + 0.05, dur: 1.4, peak: 0.35 });
    return 1.8;
  },
  thunder_hit(v, t) {
    burst(v, { t, dur: 0.05, peak: 0.16, type: 'highpass', f0: 3000, q: 0.8 });
    tone(v, { f0: 140, f1: 60, t, dur: 0.15, peak: 0.14 });
    return 0.2;
  },
  skill_timestop(v, t) {
    for (const d of [0, 0.3, 0.6]) {
      tone(v, { type: 'square', f0: 1800, f1: 1700, t: t + d, dur: 0.02, peak: 0.04 }); // tik
      tone(v, { type: 'square', f0: 1300, f1: 1250, t: t + d + 0.15, dur: 0.02, peak: 0.035 }); // tak
    }
    const o = oscNode(v, 'sine', 880, t, t + 1.4);
    o.frequency.exponentialRampToValueAtTime(220, t + 1.3); // zaman yavaşlar
    const g2 = gainNode(v);
    envelope(g2.gain, t, 0.3, 0.05, 1.0);
    o.connect(g2);
    g2.connect(v.out);
    return 1.5;
  },
  skill_plague(v, t) {
    for (let i = 0; i < 6; i++) tone(v, { f0: vary(220), f1: vary(520), t: t + i * 0.07, dur: 0.07, peak: 0.07 });
    burst(v, { t, attack: 0.2, dur: 0.9, peak: 0.1, type: 'bandpass', f0: 900, f1: 500, q: 1.2 });
    return 1.1;
  },
  skill_mend(v, t) {
    [261.63, 329.63, 392, 523.25].forEach((f, i) => horn(v, { f, t: t + i * 0.06, attack: 0.3, hold: 0.6, release: 1.2, peak: 0.03, cutoffPeak: 1600, bend: 1 }));
    bell(v, { f: 1046.5, t: t + 0.2, peak: 0.04, decay: 1.6 });
    return 2.2;
  },
  skill_vortex(v, t) {
    burst(v, { t, attack: 0.3, dur: 0.5, peak: 0.16, type: 'bandpass', f0: 300, f1: 2400, q: 4 });
    tone(v, { f0: 80, f1: 160, t, attack: 0.2, dur: 0.5, peak: 0.12 });
    return 0.8;
  },
  vortex_hit(v, t) {
    tone(v, { f0: 120, f1: 35, t, dur: 0.6, peak: 0.4 });
    burst(v, { t, dur: 0.5, peak: 0.2, type: 'lowpass', f0: 1600, f1: 120, q: 0.8 });
    return 0.8;
  },
  skill_reaper(v, t) {
    burst(v, { t, attack: 0.15, dur: 0.35, peak: 0.22, type: 'bandpass', f0: 5000, f1: 700, q: 2 }); // savrulma
    bell(v, { f: 98, t: t + 0.25, peak: 0.12, decay: 2.4 });
    return 2.6;
  },

  skill_frost(v, t) {
    const base = vary(1800, 0.05);
    [1, 1.26, 1.5, 2, 2.52].forEach((m, i) => tone(v, { f0: base * m, t: t + i * 0.05, attack: 0.03, dur: 1.4 - i * 0.15, peak: 0.04 }));
    burst(v, { t, attack: 0.25, dur: 1.6, peak: 0.14, type: 'highpass', f0: 4000, f1: 1500, q: 0.6 }); // buz rüzgârı
    return 1.8;
  },

  /* — Çarşı — */
  purchase(v, t) {
    [1318.5, 1760, 2093].forEach((f, i) => tone(v, { type: 'triangle', f0: f, t: t + i * 0.07, dur: 0.3, peak: 0.04 }));
    tone(v, { type: 'triangle', f0: vary(1976, 0.02), t: t + 0.25, dur: 0.4, peak: 0.03 });
    return 0.7;
  },

  repair(v, t) {
    for (const d of [0, 0.18, 0.36]) {
      tone(v, { type: 'square', f0: vary(880, 0.05), f1: 600, t: t + d, dur: 0.05, peak: 0.05 }); // çekiç
      burst(v, { t: t + d, dur: 0.06, peak: 0.1, type: 'bandpass', f0: 3200, q: 2 });
    }
    bell(v, { f: 440, t: t + 0.5, peak: 0.05, decay: 1.2 });
    return 1.7;
  },

  /** Kaleye ulaşan düşman: uğursuz çan. */
  leak(v, t, o) {
    const f = o.boss ? 82.4 : 110;
    [1, 2, 2.4, 3, 4.2].forEach((m, i) => tone(v, { f0: f * m, t, dur: 2 - i * 0.3, peak: 0.12 / (i + 1) }));
    tone(v, { f0: 160, f1: 45, t, dur: 0.4, peak: 0.4 });
    burst(v, { t, dur: 0.3, peak: 0.18, type: 'lowpass', f0: 1200, f1: 150, q: 0.8 });
    return 2.1;
  },

  phase(v, t) {
    burst(v, { t, attack: 0.22, dur: 0.12, peak: 0.08, type: 'bandpass', f0: 800, f1: 2400, q: 2 });
    tone(v, { f0: 600, f1: 900, t, attack: 0.1, dur: 0.3, peak: 0.035 });
    return 0.45;
  },

  heal(v, t) {
    [660, 990, 1320].forEach((f, i) => tone(v, { f0: f, f1: f * 1.02, t: t + i * 0.06, attack: 0.05, dur: 0.4, peak: 0.035 }));
    return 0.6;
  },

  freeze(v, t) {
    burst(v, { t, dur: 0.05, peak: 0.18, type: 'highpass', f0: 4000, q: 0.7 });
    burst(v, { t: t + 0.04, dur: 0.04, peak: 0.12, type: 'highpass', f0: 5200, q: 0.7 });
    tone(v, { f0: 3200, f1: 2600, t, dur: 0.2, peak: 0.04 });
    return 0.25;
  },

  stun(v, t) {
    tone(v, { f0: 380, f1: 160, t, dur: 0.12, peak: 0.16 });
    burst(v, { t, dur: 0.05, peak: 0.08, type: 'lowpass', f0: 800, q: 0.8 });
    return 0.15;
  },

  silence(v, t) {
    burst(v, { t, dur: 0.4, peak: 0.1, type: 'bandpass', f0: 1500, f1: 300, q: 3 });
    tone(v, { type: 'sawtooth', f0: 300, f1: 60, t, dur: 0.35, peak: 0.03 });
    return 0.45;
  },

  /* — Patlamalar — */
  explosion(v, t, o) {
    const r = clamp(o.radius ?? 1, 0.5, 1.6);
    burst(v, { t, dur: 0.45 + r * 0.35, peak: 0.3 + r * 0.1, type: 'lowpass', f0: 2400, f1: 90, q: 0.7 });
    tone(v, { f0: 110, f1: 32, t, dur: 0.4 + r * 0.3, peak: 0.45 });
    if (o.kind === 'hellmaw') burst(v, { t, attack: 0.02, dur: 0.7, peak: 0.12, type: 'bandpass', f0: 1200, f1: 400, q: 0.8 });
    if (o.kind === 'quake') {
      tone(v, { f0: 55, f1: 30, t, dur: 1.2, peak: 0.32 });
      burst(v, { t, attack: 0.05, dur: 1, peak: 0.18, type: 'lowpass', f0: 300, q: 0.7 });
      return 1.3;
    }
    return 0.9 + r * 0.35;
  },

  shatter(v, t) {
    const base = vary(3000, 0.1);
    [1, 1.33, 1.78, 2.2].forEach((m, i) => tone(v, { f0: base * m, t: t + i * 0.015, dur: 0.18, peak: 0.04 }));
    burst(v, { t, dur: 0.12, peak: 0.12, type: 'highpass', f0: 3500, q: 0.6 });
    return 0.25;
  },

  splat(v, t) {
    burst(v, { t, dur: 0.18, peak: 0.16, type: 'lowpass', f0: 1400, f1: 300, q: 1 });
    tone(v, { f0: vary(200), f1: vary(520), t: t + 0.03, dur: 0.08, peak: 0.08 });
    return 0.25;
  },

  /* — Boss — */
  scorch(v, t) {
    burst(v, { t, attack: 0.15, dur: 1.4, peak: 0.32, type: 'lowpass', f0: 3500, f1: 400, q: 0.5 }); // alev
    burst(v, { t: t + 0.05, attack: 0.1, dur: 1.2, peak: 0.14, type: 'bandpass', f0: 700, f1: 300, q: 3 }); // kükreme
    tone(v, { type: 'sawtooth', f0: 90, f1: 60, t, attack: 0.2, dur: 1.2, peak: 0.06 });
    return 1.6;
  },

  summon(v, t) {
    tone(v, { f0: 60, f1: 40, t, attack: 0.1, dur: 1, peak: 0.3 });
    for (let i = 0; i < 8; i++) {
      burst(v, { t: t + 0.2 + i * 0.07 + rng.range(0, 0.03), dur: 0.02, peak: 0.07, type: 'highpass', f0: vary(2400, 0.3), q: 2 });
    }
    return 1.2;
  },

  boss_spawn(v, t) {
    for (const f of [55, 58.27, 82.41]) horn(v, { f, t, attack: 0.6, hold: 1.6, release: 1.6, peak: 0.07, cutoffPeak: 900 });
    tone(v, { f0: 70, f1: 30, t, dur: 2, peak: 0.45 });
    burst(v, { t, attack: 0.3, dur: 2.5, peak: 0.18, type: 'lowpass', f0: 400, q: 0.7 });
    return 4;
  },

  boss_phase(v, t) {
    bell(v, { f: 220, t, peak: 0.12, decay: 1.5 });
    burst(v, { t, dur: 0.6, peak: 0.22, type: 'highpass', f0: 1500, q: 0.6 });
    burst(v, { t: t + 0.05, attack: 0.1, dur: 0.9, peak: 0.14, type: 'bandpass', f0: 600, f1: 280, q: 3 });
    return 1.6;
  },

  boss_die(v, t) {
    SFX.explosion(v, t, { radius: 1.6 });
    SFX.explosion(v, t + 0.35, { radius: 1.3 });
    horn(v, { f: 220, t: t + 0.2, attack: 0.1, hold: 0.6, release: 1.8, peak: 0.06, cutoffPeak: 1200, bend: 1.0 });
    bell(v, { f: 55 * 2, t: t + 0.6, peak: 0.12, decay: 3 });
    return 3.8;
  },

  /* — Akış — */
  wave_start(v, t) {
    horn(v, { f: 110, t, attack: 0.25, hold: 0.9, release: 0.9, peak: 0.08 });
    horn(v, { f: 164.81, t: t + 0.02, attack: 0.25, hold: 0.9, release: 0.9, peak: 0.05 });
    tone(v, { f0: 90, f1: 45, t, dur: 0.5, peak: 0.45 });
    burst(v, { t, dur: 0.12, peak: 0.12, type: 'lowpass', f0: 1800, f1: 300, q: 0.8 });
    return 2.1;
  },

  wave_clear(v, t) {
    [440, 523.25, 659.25, 987.77].forEach((f, i) => bell(v, { f, t: t + i * 0.07, peak: 0.045, decay: 1.6 }));
    return 1.9;
  },

  unlock(v, t) {
    [659.25, 880, 1046.5, 1318.5].forEach((f, i) => tone(v, { type: 'triangle', f0: f, t: t + i * 0.06, dur: 0.5, peak: 0.045 }));
    burst(v, { t, attack: 0.1, dur: 0.4, peak: 0.05, type: 'highpass', f0: 6000, q: 0.5 });
    return 0.8;
  },

  victory(v, t) {
    // Am → F → G → A majör (karanlıktan doğan aydınlık)
    const chords = [[110, 130.81, 164.81], [87.31, 110, 130.81], [98, 123.47, 146.83], [110, 138.59, 164.81]];
    chords.forEach((ch, i) => {
      const last = i === chords.length - 1;
      const at = t + i * 0.9;
      for (const f of ch) horn(v, { f: f * 2, t: at, attack: 0.15, hold: last ? 1.6 : 0.6, release: last ? 2 : 0.4, peak: 0.035, bend: 1 });
      bell(v, { f: ch[2] * 4, t: at, peak: 0.035, decay: last ? 2.5 : 0.8 });
    });
    tone(v, { f0: 90, f1: 40, t: t + 2.7, dur: 0.8, peak: 0.4 });
    return 6.5;
  },

  defeat(v, t) {
    [110, 98, 87.31, 82.41].forEach((f, i) => horn(v, { f, t: t + i * 0.8, attack: 0.2, hold: 0.4, release: 0.6, peak: 0.06, cutoffPeak: 700, bend: 1 }));
    bell(v, { f: 55, t: t + 3.2, peak: 0.16, decay: 3.5 });
    return 7;
  },

  build(v, t) {
    for (const d of [0, 0.09]) {
      tone(v, { f0: vary(180), f1: 115, t: t + d, dur: 0.08, peak: 0.22 });
      burst(v, { t: t + d, dur: 0.05, peak: 0.08, type: 'lowpass', f0: 1200, q: 0.8 });
    }
    tone(v, { type: 'triangle', f0: 660, f1: 990, t: t + 0.16, dur: 0.15, peak: 0.035 });
    return 0.35;
  },

  upgrade(v, t, o) {
    [440, 523.25, 659.25, 880].forEach((f, i) => tone(v, { type: 'triangle', f0: f, t: t + i * 0.05, dur: 0.22, peak: 0.05 }));
    burst(v, { t, attack: 0.2, dur: 0.1, peak: 0.06, type: 'bandpass', f0: 600, f1: 2400, q: 1.2 });
    if (o.mastery >= 0) {
      bell(v, { f: 880, t: t + 0.22, peak: 0.06, decay: 1.4 });
      tone(v, { f0: 110, f1: 45, t: t + 0.2, dur: 0.5, peak: 0.35 });
      return 1.6;
    }
    return 0.5;
  },

  sell(v, t) {
    [2637, 2349.3, 1975.5, 1760, 1568].forEach((f, i) => tone(v, { type: 'triangle', f0: f, t: t + i * 0.04, dur: 0.1, peak: 0.04 }));
    return 0.35;
  },

  /* — Arayüz — */
  ui_tap(v, t) {
    tone(v, { f0: 1300, f1: 900, t, dur: 0.03, peak: 0.05 });
    burst(v, { t, dur: 0.015, peak: 0.025, type: 'highpass', f0: 4000, q: 0.7 });
    return 0.05;
  },
  ui_open(v, t) {
    burst(v, { t, attack: 0.06, dur: 0.08, peak: 0.05, type: 'bandpass', f0: 500, f1: 1800, q: 1.5 });
    tone(v, { f0: 520, f1: 780, t, dur: 0.1, peak: 0.025 });
    return 0.16;
  },
  ui_close(v, t) {
    burst(v, { t, attack: 0.04, dur: 0.08, peak: 0.045, type: 'bandpass', f0: 1800, f1: 500, q: 1.5 });
    tone(v, { f0: 780, f1: 520, t, dur: 0.1, peak: 0.022 });
    return 0.14;
  },
  ui_confirm(v, t) {
    tone(v, { type: 'triangle', f0: 880, t, dur: 0.1, peak: 0.05 });
    tone(v, { type: 'triangle', f0: 1318.5, t: t + 0.07, dur: 0.16, peak: 0.05 });
    return 0.25;
  },
  ui_deny(v, t) {
    const lp = filterNode(v, 'lowpass', 900, 0.8);
    lp.connect(v.out);
    tone(v, { type: 'square', f0: 140, f1: 120, t, dur: 0.1, peak: 0.05, dest: lp });
    tone(v, { type: 'square', f0: 120, f1: 100, t: t + 0.11, dur: 0.12, peak: 0.05, dest: lp });
    return 0.25;
  },
  ui_tick(v, t) {
    tone(v, { f0: 2000, t, dur: 0.025, peak: 0.045 });
    return 0.04;
  },
  ui_toggle(v, t, o) {
    const up = o.on !== false;
    tone(v, { type: 'triangle', f0: up ? 1000 : 1500, f1: up ? 1500 : 1000, t, dur: 0.05, peak: 0.045 });
    return 0.07;
  },
};

/** Test ve araçlar için: tanımlı tüm efekt adları. */
export const SFX_IDS = Object.freeze(Object.keys(SFX));

/* --------------------------------------------------------------------------
 * 7. MÜZİK MOTORU
 * ------------------------------------------------------------------------ */
const { bpm } = AUDIO.music;
const STEP = 60 / bpm / 2; // sekizlik nota süresi
/**
 * Bölümün müzik rengi: kök nota, dizi ve boss dizisi. Her bölüm kendi
 * tonunda çalar (content/chapters.js → music). Menüde Kül Vadisi.
 */
const tune = { root: AUDIO.music.root, scale: AUDIO.music.scale, boss: AUDIO.music.altScale };
const MOODS = {
  menu: 0.12,
  calm: AUDIO.music.combatIntensity.calm,
  wave: AUDIO.music.combatIntensity.wave,
  boss: AUDIO.music.combatIntensity.boss,
};

// Akor geçiş olasılıkları (dizi dereceleri: 0=i 1=II 2=III 3=iv 4=v 5=VI 6=VII)
const CHORD_MOVES = {
  0: [[5, 0.35], [3, 0.25], [6, 0.2], [2, 0.2]],
  2: [[6, 0.35], [5, 0.3], [3, 0.35]],
  3: [[0, 0.35], [4, 0.3], [5, 0.35]],
  4: [[0, 0.7], [5, 0.3]],
  5: [[6, 0.3], [2, 0.25], [3, 0.25], [0, 0.2]],
  6: [[0, 0.5], [5, 0.3], [2, 0.2]],
};
const BOSS_MOVES = {
  0: [[1, 0.4], [5, 0.3], [3, 0.3]],
  1: [[0, 0.6], [6, 0.4]],
  3: [[1, 0.5], [0, 0.5]],
  5: [[1, 0.5], [0, 0.5]],
  6: [[0, 0.6], [1, 0.4]],
};
const WAR_DRUMS = [1, 0, 0, 0.5, 0, 0, 0.7, 0];
const BOSS_DRUMS = [1, 0, 0.6, 0.8, 0, 0.6, 1, 0.5];

const music = {
  on: false,
  timer: 0,
  next: 0,
  step: 0,
  level: MOODS.menu,
  target: MOODS.menu,
  chord: 0,
  chordLeft: 0,
  melody: 16,
  r: createRng((Date.now() ^ 0x5eed) >>> 0),
};

const smooth01 = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Dizi derecesi → frekans (oktav 0 = bölümün kökü, ör. A1 = 55 Hz). */
function noteFreq(degree, octave, scale) {
  const oct = octave + Math.floor(degree / 7);
  const semis = scale[((degree % 7) + 7) % 7] + 12 * oct;
  return tune.root * 2 ** (semis / 12);
}

/** Bölümün müziğine geçer; sıradaki akorlar yeni kökte çalar. */
function setTune(mapId) {
  const m = MAP_BY_ID[mapId]?.music;
  tune.root = m ? m.root : AUDIO.music.root;
  tune.scale = m ? m.scale : AUDIO.music.scale;
  tune.boss = m ? m.boss : AUDIO.music.altScale;
}

function pickWeighted(r, options) {
  let x = r.next();
  for (const [value, w] of options) {
    x -= w;
    if (x <= 0) return value;
  }
  return options[options.length - 1][0];
}

function startMusic() {
  if (music.on || !ctx) return;
  music.on = true;
  music.next = ctx.currentTime + 0.1;
  music.step = 0;
  music.chordLeft = 0;
  music.timer = setInterval(musicTick, TICK_MS);
}

function stopMusic() {
  if (!music.on) return;
  music.on = false;
  clearInterval(music.timer);
}

function musicTick() {
  if (!ready() || !music.on) return;
  const now = ctx.currentTime;
  if (music.next < now - 0.5) music.next = now + 0.05; // askıdan dönüş: biriken notaları atla
  music.level = lerp(music.level, music.target, 0.02); // ~5 sn'de yumuşak geçiş
  while (music.next < now + LOOKAHEAD) {
    scheduleStep(music.next);
    music.next += STEP;
    music.step += 1;
  }
}

function scheduleStep(t) {
  const lvl = music.level;
  const boss = lvl > 0.85;
  const scale = boss ? tune.boss : tune.scale;
  const r = music.r;
  const beat = music.step % 8;

  if (music.chordLeft <= 0) {
    const moves = (boss ? BOSS_MOVES : CHORD_MOVES)[music.chord] ?? CHORD_MOVES[0];
    music.chord = pickWeighted(r, moves);
    music.chordLeft = boss ? 8 : 16;
    padChord(t, music.chord, music.chordLeft * STEP, scale, lvl);
    if (boss) brassStab(t, music.chord, scale);
  }
  music.chordLeft -= 1;

  const drums = smooth01(0.4, 0.75, lvl);
  if (drums > 0.02) {
    const accent = (boss ? BOSS_DRUMS : WAR_DRUMS)[beat];
    if (accent > 0) drum(t, drums * accent);
  }

  if (r.chance(0.05 + 0.2 * lvl)) melodyNote(t, scale, r, beat === 0);
  if (lvl < 0.45 && beat === 0 && music.step % 32 === 0 && r.chance(0.35)) distantBell(t, scale);
}

function padChord(t, degree, length, scale, lvl) {
  const v = makeVoice(bus.music, 0.55, 0, 1);
  const attack = 2.2;
  const release = 3;
  const lp = filterNode(v, 'lowpass', 600 + lvl * 1400, 0.7); // eskiden 260: uğultu kalkınca pad daha net duyulsun
  const g = gainNode(v);
  envelopeHold(g.gain, t, attack, 0.05, Math.max(0.1, length - attack), release);
  lp.connect(g);
  g.connect(v.out);

  const tones = [degree, degree + 2, degree + 4];
  if (lvl > 0.5) tones.push(degree + 7);
  const end = t + length + release + 0.1;
  const rich = settings.quality !== 'low';
  for (const deg of tones) {
    const f = noteFreq(deg, 1, scale);
    for (const cents of rich ? [-6, 6] : [0]) {
      const o = oscNode(v, rich ? 'sawtooth' : 'triangle', f, t, end);
      o.detune.value = cents;
      o.connect(lp);
    }
  }
}

function brassStab(t, degree, scale) {
  const v = makeVoice(bus.music, 0.4, 0, 1);
  horn(v, { f: noteFreq(degree, 1, scale), t, attack: 0.15, hold: 0.5, release: 0.8, peak: 0.07, cutoffPeak: 1200, bend: 1 });
}

function drum(t, amp) {
  const v = makeVoice(bus.music, 0.25, 0, 1);
  tone(v, { f0: 95, f1: 42, t, dur: 0.55, peak: 0.45 * amp });
  burst(v, { t, dur: 0.08, peak: 0.12 * amp, type: 'lowpass', f0: 1800, f1: 300, q: 0.8 });
}

function melodyNote(t, scale, r, strong) {
  let m = music.melody + pickWeighted(r, [[-2, 0.15], [-1, 0.3], [1, 0.3], [2, 0.15], [3, 0.1]]);
  if (strong) {
    // güçlü zamanda akor tonuna çekil — kulak "doğru" duyar
    const rel = (((m - music.chord) % 7) + 7) % 7;
    if (rel === 1 || rel === 3 || rel === 5) m -= 1;
  }
  m = clamp(m, 14, 26); // A3 .. F5
  music.melody = m;
  const v = makeVoice(bus.music, 0.6, r.spread(0, 0.35), 1);
  bell(v, { f: noteFreq(m, 0, scale), t, peak: 0.045, decay: 2.2 });
}

function distantBell(t, scale) {
  const v = makeVoice(bus.music, 0.75, music.r.spread(0, 0.5), 1);
  bell(v, { f: noteFreq(0, 2, scale), t, peak: 0.05, decay: 4 });
}

function setMood(name) {
  music.target = MOODS[name] ?? MOODS.calm;
}

/* --------------------------------------------------------------------------
 * 8. OLAYLAR → SES
 *  Ruh hâli sahadaki düşman sayısından türetilir:
 *  boss varsa "boss", düşman varsa ya da doğum sürüyorsa "wave", yoksa "calm".
 * ------------------------------------------------------------------------ */
const field = { alive: 0, bosses: 0, spawning: false, inGame: false };
let stingDuck = 1;
let stingTimer = 0;

function refreshMood() {
  if (!field.inGame) return setMood('menu');
  if (field.bosses > 0) return setMood('boss');
  if (field.alive > 0 || field.spawning) return setMood('wave');
  return setMood('calm');
}

function resetField() {
  field.alive = 0;
  field.bosses = 0;
  field.spawning = false;
}

function enemyGone(enemy) {
  field.alive = Math.max(0, field.alive - 1);
  if (ENEMIES[enemy.type]?.boss) field.bosses = Math.max(0, field.bosses - 1);
  refreshMood();
}

function playSting(id, seconds) {
  clearTimeout(stingTimer);
  stingDuck = 0.25;
  applyVolumes(0.3);
  play(id);
  stingTimer = setTimeout(() => {
    stingDuck = 1;
    applyVolumes(1.5);
  }, seconds * 1000);
}

function onSetting(key, value) {
  if (key === 'sfxVolume') {
    settings.sfx = value;
    applyVolumes();
  } else if (key === 'musicVolume') {
    settings.music = value;
    applyVolumes();
    if (value > 0 && unlocked) startMusic();
    else if (value <= 0) stopMusic();
  } else if (key === 'quality') {
    applyQuality(value);
  }
}

function onVisibility(isHidden) {
  hidden = isHidden;
  if (!ctx) return;
  if (isHidden) ctx.suspend().catch(() => {});
  else if (unlocked) ctx.resume().catch(() => {});
}

function onPause(isPaused) {
  paused = isPaused;
  if (!bus) return;
  applyVolumes(0.25);
  setParam(bus.tone.frequency, isPaused ? 700 : 18000, 0.25);
}

function subscribe() {
  on(EV.SETTINGS, onSetting);
  on(EV.VISIBILITY, onVisibility);
  on(EV.PAUSE, onPause);
  on(EV.SCENE, (name) => {
    field.inGame = name === 'game';
    if (!field.inGame) {
      resetField();
      setTune(null); // menüde ilk bölümün tonu
    }
    refreshMood();
  });

  on(EV.RUN_START, (fromSave, mapId) => {
    setTune(mapId);
    field.inGame = true;
    clearTimeout(stingTimer);
    stingDuck = 1;
    applyVolumes(0.5);
    resetField();
    refreshMood();
  });
  on(EV.RUN_END, (victory) => {
    resetField();
    field.inGame = false;
    refreshMood();
    playSting(victory ? 'victory' : 'defeat', victory ? 6 : 6.5);
  });

  on(EV.WAVE_START, () => {
    field.spawning = true;
    refreshMood();
    play('wave_start');
  });
  on(EV.WAVE_SPAWNED, () => {
    field.spawning = false;
    refreshMood();
  });
  on(EV.WAVE_CLEAR, () => play('wave_clear'));
  on(EV.PURCHASE, (kind) => play(kind === 'repair' ? 'repair' : 'purchase'));
  on(EV.SKILL, (id, phase, x, y, value) => {
    if (phase === 'cast') play(`skill_${id}`, { x });
    else if (id === 'log' && phase === 'hit') play('log_hit', { x });
    else if (id === 'meteor') play('explosion', { x, radius: value, kind: 'hellmaw' });
    else if (id === 'thunder') play('thunder_hit', { x });
    else if (id === 'vortex' && phase === 'impact') play('vortex_hit', { x });
  });
  on(EV.ABILITY, (en, kind, x) => play(kind, { x: en.x }));
  on(EV.GENERATE, (tw, amount, kind) => play(kind === 'mend' ? 'heal' : 'generate', { x: tw.x, kind }));

  on(EV.BUILD, (tw) => play('build', { x: tw.x }));
  on(EV.UPGRADE, (tw) => play('upgrade', { x: tw.x, mastery: tw.mastery }));
  on(EV.SELL, (tw) => play('sell', { x: tw.x }));
  on(EV.FIRE, (tw) => play(tw.type, { x: tw.x, mastery: tw.mastery, level: tw.level }));
  on(EV.SILENCE, (tw) => play('silence', { x: tw.x }));

  on(EV.SPAWN, (en) => {
    field.alive += 1;
    if (ENEMIES[en.type]?.boss) field.bosses += 1;
    refreshMood();
  });
  on(EV.HIT, (en, amount, crit, dmgType, periodic) => {
    if (periodic) return; // zehir/yanma tikleri sessizdir; sayıları efekt katmanı gösterir
    if (crit) play('crit', { x: en.x });
    else if (dmgType === 'phys' && (ENEMIES[en.type]?.armor ?? 0) >= 0.3) play('clank', { x: en.x });
    else if (dmgType !== 'pure') play('hit', { x: en.x });
  });
  on(EV.KILL, (en, souls) => {
    enemyGone(en);
    if (ENEMIES[en.type]?.boss) return; // boss ölümü kendi sesini çalar
    play('kill', { x: en.x, type: en.type });
    if (souls >= 5) play('soul', { x: en.x });
  });
  on(EV.LEAK, (en) => {
    enemyGone(en);
    play('leak', { x: en.x, boss: !!ENEMIES[en.type]?.boss });
  });
  on(EV.PHASE, (en, entered) => {
    if (entered) play('phase', { x: en.x });
  });
  on(EV.HEAL, (healer) => play('heal', { x: healer.x }));
  on(EV.STATUS, (en, kind) => {
    if (kind === 'freeze' || kind === 'stun' || kind === 'evade' || kind === 'execute' || kind === 'enrage') play(kind, { x: en.x });
  });

  on(EV.MAP_EVENT, (id, phase, x, y, value) => {
    if (phase === 'warn') play('ev_warn', { x });
    else if (phase === 'hit') play('rift_hit', { x });
    else if (phase !== 'act') return;
    else if (id === 'lava') play('explosion', { x, radius: value, kind: 'hellmaw' });
    else if (id === 'blizzard') play('blizzard');
    else play(`ev_${id}`, { x });
  });
  on(EV.RUN_CONTINUE, () => {
    field.inGame = true;
    resetField();
    refreshMood();
  });

  on(EV.BOSS_SPAWN, () => play('boss_spawn'));
  on(EV.BOSS_PHASE, (b) => play('boss_phase', { x: b.x }));
  on(EV.BOSS_ABILITY, (b, kind, x) => play(kind, { x }));
  on(EV.BOSS_DIE, () => play('boss_die'));

  on(EV.IMPACT, (x, y, radius, kind) => {
    if (kind === 'shard') play('shatter', { x });
    else if (kind === 'glob') play('splat', { x });
    else if (kind === 'lance' || kind === 'harpoon' || kind === 'knell') return; // vuruş/çan sesi zaten çaldı
    else play('explosion', { x, radius, kind });
  });
}
