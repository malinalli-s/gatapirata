'use strict';
const $ = (id) => document.getElementById(id);
let ctx,
  master,
  source,
  playing = false,
  position = 0,
  lastTick = 0,
  rate = 1,
  targetRate = 1,
  level = 0.43,
  lastMeow = -Infinity,
  armed = true,
  ws = null,
  lastPacket = 0,
  selected = 0;
const tracks = [
  {
    id: 'demo-001',
    title: 'Señal de prueba',
    artist: 'Gata Pirata · demo sintetizada',
    bpm: 100,
    bio: 'Instrumental generada para probar el báculo. No representa a un grupo real. Carga canciones de los artistas para preparar tu selección.',
    buffer: null,
  },
];
let favorites = new Set();
try {
  favorites = new Set(JSON.parse(localStorage.getItem('gp-favorites') || '[]'));
} catch {}
const history = [];
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function demoBuffer() {
  const sr = ctx.sampleRate,
    duration = 19.2,
    b = ctx.createBuffer(1, Math.floor(sr * duration), sr),
    a = b.getChannelData(0);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr,
      beat = t % 0.6,
      step = Math.floor(t / 0.3),
      nt = t % 0.3,
      notes = [110, 130.81, 164.81, 146.83, 110, 164.81, 196, 146.83],
      f = notes[step % notes.length];
    const kick =
      Math.sin(2 * Math.PI * (45 * beat + 9 * (1 - Math.exp(-beat * 35)))) *
      Math.exp(-beat * 19) *
      0.45;
    const bass =
      (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) *
      Math.exp(-nt * 10) *
      0.17;
    const h = t % 0.15,
      hat = (Math.random() * 2 - 1) * Math.exp(-h * 140) * 0.04;
    a[i] = (kick + bass + hat) * Math.min(1, t / 0.015, (duration - t) / 0.02);
  }
  return b;
}
async function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = Number($('volume').value);
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(ctx.destination);
    tracks[0].buffer = demoBuffer();
  }
  await ctx.resume();
}
function stopSource() {
  if (source) {
    source.onended = null;
    try {
      source.stop();
    } catch {}
    source.disconnect();
    source = null;
  }
}
function startSource() {
  stopSource();
  const track = tracks[selected];
  source = ctx.createBufferSource();
  source.buffer = track.buffer;
  source.playbackRate.value = rate;
  source.connect(master);
  source.start(0, Math.min(position, track.buffer.duration - 0.001));
  source.onended = () => {
    if (playing) {
      position = 0;
      selected = (selected + 1) % tracks.length;
      startSource();
      recordHistory();
      render();
    }
  };
}
function recordHistory() {
  const index = selected;
  if (history[0] !== index) history.unshift(index);
  history.splice(30);
  renderHistory();
}
function renderHistory() {
  $('history').replaceChildren(
    ...history.map((i) => {
      const t = tracks[i],
        li = document.createElement('li'),
        meta = document.createElement('div'),
        title = document.createElement('button'),
        band = document.createElement('button'),
        tempo = document.createElement('span');
      li.className = 'history-entry';
      title.className = 'history-title';
      title.textContent = t.title;
      title.setAttribute('aria-label', 'Reproducir ' + t.title);
      title.onclick = async () => {
        await select(i);
        if (!playing) await toggle();
      };
      band.className = 'artist-link';
      band.textContent = t.artist + ' ↗';
      band.setAttribute('aria-label', 'Ver información de ' + t.artist);
      band.onclick = () => openBand(i);
      meta.append(title, band);
      tempo.className = 'history-tempo';
      tempo.textContent = t.bpm ? '≈ ' + t.bpm + ' BPM' : 'BPM —';
      li.append(meta, tempo);
      return li;
    }),
  );
}
async function toggle() {
  try {
    await audio();
    playing = !playing;
    if (playing) {
      startSource();
      recordHistory();
      $('feedback').textContent = '';
    } else stopSource();
    render();
  } catch (e) {
    playing = false;
    $('feedback').textContent =
      'No se pudo iniciar el audio. Pulsa Escuchar de nuevo.';
    render();
  }
}
function render() {
  const t = tracks[selected];
  $('title').textContent = t.title;
  $('artist').textContent = t.artist + ' ↗';
  $('fav').textContent = favorites.has(t.id) ? '★' : '☆';
  $('fav').setAttribute('aria-pressed', String(favorites.has(t.id)));
  $('play').textContent = playing ? 'Ⅱ Pausar' : '▶ Escuchar';
  $('onair').textContent = playing ? 'SONANDO AQUÍ' : 'EN PAUSA';
  $('vinyl').style.animationPlayState = playing ? 'running' : 'paused';
}

async function select(i) {
  try {
    await audio();
    selected = i;
    position = 0;
    if (playing) {
      startSource();
      recordHistory();
    }
    render();
  } catch {
    $('feedback').textContent = 'No se pudo cargar el audio.';
  }
}
function setLevel(v, trigger = true) {
  level = clamp(v, 0, 1);
  targetRate = 0.85 + Math.min(level / 0.85, 1) * 0.35;
  $('movement').value = String(level * 100);
  $('mood').textContent =
    level > 0.92
      ? '¡Gata erizada!'
      : level > 0.65
        ? 'Alborotada'
        : level > 0.2
          ? 'Paseando'
          : 'En reposo';
  if (level < 0.75) armed = true;
  if (
    trigger &&
    level > 0.92 &&
    armed &&
    playing &&
    performance.now() - lastMeow > 3000
  ) {
    armed = false;
    meow();
  }
}
async function meow() {
  try {
    await audio();
    const now = ctx.currentTime;
    if (performance.now() - lastMeow < 3000) {
      $('feedback').textContent = 'La gata toma aire… espera 3 segundos.';
      return;
    }
    lastMeow = performance.now();
    const o = ctx.createOscillator(),
      g = ctx.createGain(),
      filter = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(480, now);
    o.frequency.exponentialRampToValueAtTime(890, now + 0.12);
    o.frequency.exponentialRampToValueAtTime(320, now + 0.65);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.frequency.exponentialRampToValueAtTime(700, now + 0.7);
    filter.Q.value = 2;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    o.connect(filter);
    filter.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + 0.8);
    o.onended = () => {
      o.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    $('feedback').textContent =
      '¡Miau! Efecto sintético mezclado con la música.';
  } catch {
    $('feedback').textContent = 'Pulsa Escuchar para activar el audio.';
  }
}
const time = (n) =>
  Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0');
function tick(stamp) {
  const dt = lastTick ? (stamp - lastTick) / 1000 : 0;
  lastTick = stamp;
  if (ws && ws.readyState === 1 && performance.now() - lastPacket > 2000) {
    targetRate = 1;
    $('connection').textContent =
      'Conectada, pero sin datos recientes. Velocidad segura: 1×.';
    $('sourceStatus').textContent = 'SIN DATOS';
  }
  const old = rate;
  rate += (targetRate - rate) * (1 - Math.exp(-dt / 0.22));
  if (playing && source) {
    position += (old + rate) * 0.5 * dt;
    source.playbackRate.setValueAtTime(rate, ctx.currentTime);
  }
  const t = tracks[selected],
    d = t.buffer?.duration || 19.2;
  $('bpm').textContent = t.bpm ? Math.round(t.bpm * rate) : '—';
  $('rate').textContent = rate.toFixed(2) + '×';
  $('elapsed').textContent = time(Math.min(position, d));
  $('duration').textContent = time(d);
  $('progress').value = Math.min(position / d, 1);
  requestAnimationFrame(tick);
}
$('play').onclick = toggle;
$('next').onclick = () => select((selected + 1) % tracks.length);
$('movement').oninput = (e) => setLevel(Number(e.target.value) / 100);
document
  .querySelectorAll('[data-level]')
  .forEach((b) => (b.onclick = () => setLevel(Number(b.dataset.level) / 100)));
$('meow').onclick = meow;
$('volume').oninput = (e) => {
  if (master)
    master.gain.setTargetAtTime(Number(e.target.value), ctx.currentTime, 0.03);
};
$('fav').onclick = () => {
  const id = tracks[selected].id;
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  try {
    localStorage.setItem('gp-favorites', JSON.stringify([...favorites]));
  } catch {}
  render();
};
let pendingTrack = null,
  analysisWorker = null,
  uploadVersion = 0;
function analyze(buffer) {
  return new Promise((resolve) => {
    const worker = new Worker('bpm-worker.js');
    analysisWorker = worker;
    const length = Math.min(buffer.length, Math.floor(buffer.sampleRate * 90));
    const samples = new Float32Array(length);
    const offset = Math.floor((buffer.length - length) / 2);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < length; i++)
        samples[i] += channel[offset + i] / buffer.numberOfChannels;
    }
    const done = (result) => {
      clearTimeout(timeout);
      worker.terminate();
      if (analysisWorker === worker) analysisWorker = null;
      resolve(result);
    };
    const timeout = setTimeout(() => done({ bpm: null }), 20000);
    worker.onmessage = (e) => done(e.data);
    worker.onerror = () => done({ bpm: null });
    worker.postMessage({ samples, sampleRate: buffer.sampleRate }, [
      samples.buffer,
    ]);
  });
}
$('files').onchange = async (e) => {
  const version = ++uploadVersion;
  pendingTrack = null;
  $('addTrack').disabled = true;
  $('uploadStatus').textContent = '';
  const f = e.target.files[0];
  if (!f) {
    $('bpmAnalysis').textContent =
      'El BPM se calculará al seleccionar el archivo.';
    return;
  }
  $('bpmAnalysis').textContent = 'Analizando el ritmo…';
  try {
    if (f.size > 50 * 1024 * 1024) throw Error('El archivo supera 50 MB.');
    await audio();
    const buffer = await ctx.decodeAudioData(await f.arrayBuffer());
    if (version !== uploadVersion) return;
    const result = await analyze(buffer);
    if (version !== uploadVersion) return;
    pendingTrack = { id: f.name + '-' + f.size, buffer, bpm: result.bpm };
    $('bpmAnalysis').textContent = result.bpm
      ? '≈ ' + result.bpm + ' BPM · estimación automática'
      : 'BPM no detectado: puedes agregar y reproducir el audio igualmente.';
    $('addTrack').disabled = false;
  } catch (error) {
    if (version !== uploadVersion) return;
    $('bpmAnalysis').textContent =
      'No se pudo analizar el archivo. Usa un audio compatible de hasta 50 MB.';
  }
};
$('uploadForm').onsubmit = async (e) => {
  e.preventDefault();
  if (!pendingTrack) return;
  const title = $('uploadTitle').value.trim(),
    artist = $('uploadArtist').value.trim(),
    bio = $('uploadBio').value.trim();
  if (!title || !artist || !bio) {
    $('uploadStatus').textContent = 'Completa título, banda y descripción.';
    return;
  }
  tracks.push(Object.freeze({ ...pendingTrack, title, artist, bio }));
  pendingTrack = null;
  ++uploadVersion;
  $('uploadForm').reset();
  $('addTrack').disabled = true;
  $('bpmAnalysis').textContent =
    'El BPM se calculará al seleccionar el archivo.';
  $('uploadStatus').textContent =
    'Canción agregada. Sus datos ya son de solo lectura.';
  await select(tracks.length - 1);
  $('uploadDialog').close();
  $('feedback').textContent = playing ? '' : 'Canción lista. Pulsa Escuchar.';
};
function openBand(i) {
  const t = tracks[i];
  $('artistName').textContent = t.artist;
  $('artistBio').textContent = t.bio || 'Sin descripción disponible.';
  $('artistDialog').showModal();
}
$('artist').onclick = () => openBand(selected);
$('closeDialog').onclick = () => $('artistDialog').close();
$('artistDialog').addEventListener('click', (e) => {
  if (e.target !== $('artistDialog')) return;
  const r = e.target.getBoundingClientRect();
  if (
    e.clientX < r.left ||
    e.clientX > r.right ||
    e.clientY < r.top ||
    e.clientY > r.bottom
  )
    e.target.close();
});
function controls(connected) {
  $('disconnect').disabled = !connected;
  $('connect').disabled = connected;
  $('movement').disabled = connected;
  document
    .querySelectorAll('[data-level]')
    .forEach((b) => (b.disabled = connected));
}
function disconnect() {
  if (ws) {
    const old = ws;
    ws = null;
    old.close();
  }
  controls(false);
  targetRate = 1;
  $('sourceStatus').textContent = 'SIMULADOR';
  $('connection').textContent =
    'Sensor desconectado. Velocidad restaurada a 1×; mueve el simulador para continuar.';
}
$('disconnect').onclick = disconnect;
$('connect').onclick = () => {
  let url;
  try {
    url = new URL($('endpoint').value);
    if (!['ws:', 'wss:'].includes(url.protocol)) throw Error();
  } catch {
    $('connection').textContent =
      'Escribe una dirección ws:// o wss:// válida.';
    return;
  }
  if (location.protocol === 'https:' && url.protocol === 'ws:') {
    $('connection').textContent =
      'Esta página HTTPS necesita wss://. Para ws:// local, sirve la página por HTTP en la misma Wi-Fi (ver guía).';
    return;
  }
  disconnect();
  try {
    const socket = new WebSocket(url.href);
    ws = socket;
    controls(true);
    $('connection').textContent = 'Conectando…';
    const timeout = setTimeout(() => {
      if (ws === socket && socket.readyState === 0) {
        disconnect();
        $('connection').textContent =
          'Sin respuesta. Revisa la dirección y la red.';
      }
    }, 8000);
    socket.onopen = () => {
      clearTimeout(timeout);
      if (ws !== socket) return;
      lastPacket = performance.now();
      $('sourceStatus').textContent = 'ESP32';
      $('connection').textContent =
        'Conectada. Esperando intensidad del báculo…';
    };
    socket.onmessage = (e) => {
      if (ws !== socket) return;
      try {
        const data = JSON.parse(e.data);
        if (
          typeof data.motion !== 'number' ||
          !Number.isFinite(data.motion) ||
          data.motion < 0 ||
          data.motion > 1
        )
          throw Error();
        lastPacket = performance.now();
        setLevel(data.motion);
        $('sourceStatus').textContent = 'ESP32';
        $('connection').textContent =
          'Recibiendo movimiento · ' + Math.round(data.motion * 100) + '%';
      } catch {
        $('connection').textContent =
          'Mensaje inválido: usa {"motion":0.65}, entre 0 y 1.';
      }
    };
    socket.onerror = () => {
      if (ws === socket)
        $('connection').textContent =
          'No se pudo conectar. Revisa el servidor, certificado y permisos de red.';
    };
    socket.onclose = () => {
      clearTimeout(timeout);
      if (ws === socket) {
        ws = null;
        controls(false);
        targetRate = 1;
        $('sourceStatus').textContent = 'SIN CONEXIÓN';
        $('connection').textContent =
          'Conexión cerrada. Volviendo a 1×; puedes usar el simulador.';
      }
    };
  } catch {
    disconnect();
    $('connection').textContent =
      'El navegador bloqueó la conexión. Revisa la guía.';
  }
};
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: 'set_simulated_motion',
        description:
          'Configura la intensidad del simulador de Gata Pirata. No inicia reproducción.',
        inputSchema: {
          type: 'object',
          properties: { motion: { type: 'number', minimum: 0, maximum: 1 } },
          required: ['motion'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: ({ motion }) => {
          if (
            typeof motion !== 'number' ||
            !Number.isFinite(motion) ||
            motion < 0 ||
            motion > 1
          )
            throw Error('Intensidad inválida');
          if (ws) throw Error('Desconecta el sensor para usar el simulador');
          setLevel(motion);
          return { motion: level, targetRate };
        },
      }),
    ).catch(() => {});
  } catch {}
}
render();
setLevel(0.43, false);
requestAnimationFrame(tick);

$('openUpload').onclick = () => $('uploadDialog').showModal();
$('openConnection').onclick = () => $('connectionDialog').showModal();
document
  .querySelectorAll('[data-close]')
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
for (const id of ['uploadDialog', 'connectionDialog']) {
  $(id).addEventListener('click', (e) => {
    if (e.target !== $(id)) return;
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  });
}
