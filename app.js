const state = {
  manifest: null,
};

const methodColors = {
  raw: "#64716d",
  "agms-ilrma": "#8a4fb5",
  "agms-fw": "#d89c16",
};

const waveformCache = new Map();
let sharedAudioContext = null;

const els = {
  methodHeader: document.querySelector("#methodHeader"),
  sampleList: document.querySelector("#sampleList"),
  notice: document.querySelector("#notice"),
  groupTemplate: document.querySelector("#groupTemplate"),
  speakerTemplate: document.querySelector("#speakerTemplate"),
  methodTemplate: document.querySelector("#methodTemplate"),
  clipTemplate: document.querySelector("#clipTemplate"),
};

async function init() {
  try {
    const response = await fetch("samples.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load samples.json (${response.status})`);
    state.manifest = await response.json();
    renderMethodHeader();
    render();
  } catch (error) {
    showNotice(error.message);
  }
}

function renderMethodHeader() {
  const spacer = document.createElement("span");
  const body = document.createElement("div");
  const speakerSpacer = document.createElement("span");
  const labels = document.createElement("div");

  spacer.className = "methodHeaderSpacer";
  spacer.setAttribute("aria-hidden", "true");
  body.className = "methodHeaderBody";
  speakerSpacer.className = "methodHeaderSpeakerSpacer";
  labels.className = "methodLabels";

  const labelNodes = state.manifest.methods.map((method) => {
    const color = methodColors[method.method] || "#64716d";
    const label = document.createElement("span");
    label.className = "methodLabel";
    label.style.setProperty("--method-color", color);
    label.innerHTML = `<i aria-hidden="true"></i><b>${method.method_name}</b>`;
    label.querySelector("i").style.background = color;
    return label;
  });

  labels.replaceChildren(...labelNodes);
  body.replaceChildren(speakerSpacer, labels);
  els.methodHeader.replaceChildren(spacer, body);
}

function render() {
  hideNotice();
  const groups = filteredGroups();
  els.sampleList.replaceChildren(...groups.map(renderGroup));
  if (!groups.length) {
    showNotice("No samples match the current filters.");
  }
}

function filteredGroups() {
  return state.manifest.groups;
}

function renderGroup(group) {
  const node = els.groupTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".caseKicker").textContent = `Input SNR ${group.snr_label}`;
  node.querySelector("h2").textContent = group.distance_label;

  const speakers = (group.examples || []).map(renderSpeaker);
  node.querySelector(".speakerList").replaceChildren(...speakers);
  return node;
}

function renderSpeaker(example) {
  const node = els.speakerTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = example.speaker_label;
  node.querySelector(".methodGrid").replaceChildren(...example.methods.map(renderMethod));
  return node;
}

function renderMethod(method) {
  const node = els.methodTemplate.content.firstElementChild.cloneNode(true);
  const color = methodColors[method.method] || "#64716d";
  node.style.setProperty("--method-color", color);
  node.dataset.methodName = method.method_name;
  node.setAttribute("aria-label", method.method_name);

  const samples = method.samples || [method];
  const clips = samples.map((sample) => renderClip(sample, method.method_name, method.method));
  node.querySelector(".clips").replaceChildren(...clips);
  return node;
}

function renderClip(sample, methodName, methodKey) {
  const node = els.clipTemplate.content.firstElementChild.cloneNode(true);
  const audio = node.querySelector("audio");
  const playButton = node.querySelector(".playButton");
  const seekRange = node.querySelector(".seekRange");
  const currentTime = node.querySelector(".currentTime");
  const durationTime = node.querySelector(".durationTime");
  const waveformColor = methodColors[methodKey] || "#0f766e";

  audio.src = sample.file;
  audio.setAttribute("aria-label", `${methodName} audio example`);
  playButton.setAttribute("aria-label", `Play ${methodName} sample`);
  seekRange.setAttribute("aria-label", `Seek ${methodName} sample`);
  node._waveform = {
    color: waveformColor,
    peaks: makePlaceholderPeaks(96),
    progress: 0,
    ready: false,
  };

  const fallbackDuration = Number(sample.duration_s) || 0;
  durationTime.textContent = formatTime(fallbackDuration);
  seekRange.max = String(fallbackDuration);

  playButton.addEventListener("click", () => togglePlayback(audio));
  seekRange.addEventListener("input", () => {
    audio.currentTime = Number(seekRange.value) || 0;
    updatePlayer(node, audio, fallbackDuration);
  });

  audio.addEventListener("loadedmetadata", () => updatePlayer(node, audio, fallbackDuration));
  audio.addEventListener("durationchange", () => updatePlayer(node, audio, fallbackDuration));
  audio.addEventListener("timeupdate", () => updatePlayer(node, audio, fallbackDuration));
  audio.addEventListener("play", (event) => {
    pauseOtherAudio(event.currentTarget);
    updatePlayer(node, audio, fallbackDuration);
  });
  audio.addEventListener("pause", () => updatePlayer(node, audio, fallbackDuration));
  audio.addEventListener("ended", () => updatePlayer(node, audio, fallbackDuration));
  audio.addEventListener("error", () => {
    playButton.disabled = true;
    seekRange.disabled = true;
    node.classList.add("isUnavailable");
  });

  requestAnimationFrame(() => {
    drawWaveform(node);
    prepareWaveform(node, sample.file);
  });
  updatePlayer(node, audio, fallbackDuration);
  return node;
}

function togglePlayback(audio) {
  if (audio.paused) {
    if (audio.ended) audio.currentTime = 0;
    audio.play().catch(() => {
      audio.closest(".clip")?.classList.add("isBlocked");
    });
    return;
  }

  audio.pause();
}

function pauseOtherAudio(activeAudio) {
  document.querySelectorAll("audio").forEach((audio) => {
    if (audio !== activeAudio) audio.pause();
  });
}

function pauseAllAudio() {
  document.querySelectorAll("audio").forEach((audio) => audio.pause());
}

function updatePlayer(node, audio, fallbackDuration = 0) {
  const duration = getDuration(audio) || fallbackDuration;
  const current = Math.min(audio.currentTime || 0, duration || 0);
  const progress = duration ? `${(current / duration) * 100}%` : "0%";
  const isPlaying = !audio.paused && !audio.ended;
  const card = node.closest(".methodCard");

  node.classList.toggle("isPlaying", isPlaying);
  node.classList.remove("isBlocked");
  card?.classList.toggle("isPlaying", isPlaying);
  node.querySelector(".playButton").setAttribute(
    "aria-label",
    `${audio.paused || audio.ended ? "Play" : "Pause"} ${audio.getAttribute("aria-label") || "sample"}`
  );
  const seekRange = node.querySelector(".seekRange");
  seekRange.max = String(duration || 0);
  seekRange.value = String(current);
  seekRange.style.setProperty("--progress", progress);
  seekRange.setAttribute("aria-valuetext", `${formatTime(current)} of ${formatTime(duration)}`);
  node.querySelector(".currentTime").textContent = formatTime(current);
  node.querySelector(".durationTime").textContent = formatTime(duration);
  updateWaveformProgress(node, duration ? current / duration : 0);
}

function getDuration(audio) {
  return Number.isFinite(audio.duration) ? audio.duration : 0;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

async function prepareWaveform(node, url) {
  const waveform = node._waveform;
  if (!waveform) return;

  try {
    const peaks = await getWaveformPeaks(url);
    waveform.peaks = peaks;
    waveform.ready = true;
    drawWaveform(node);
  } catch {
    waveform.ready = false;
    drawWaveform(node);
  }
}

async function getWaveformPeaks(url) {
  if (waveformCache.has(url)) return waveformCache.get(url);

  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load waveform audio (${response.status})`);
      return response.arrayBuffer();
    })
    .then(async (arrayBuffer) => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is not available");
      sharedAudioContext ||= new AudioContextClass();
      const audioBuffer = await sharedAudioContext.decodeAudioData(arrayBuffer.slice(0));
      return extractPeaks(audioBuffer, 112);
    });

  waveformCache.set(url, promise);
  return promise;
}

function extractPeaks(audioBuffer, count) {
  const length = audioBuffer.length;
  const channelCount = Math.min(audioBuffer.numberOfChannels, 2);
  const samplesPerPeak = Math.max(1, Math.floor(length / count));
  const peaks = [];

  for (let peakIndex = 0; peakIndex < count; peakIndex += 1) {
    const start = peakIndex * samplesPerPeak;
    const end = Math.min(length, start + samplesPerPeak);
    const step = Math.max(1, Math.floor((end - start) / 80));
    let sum = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = audioBuffer.getChannelData(channel);
      for (let i = start; i < end; i += step) {
        sum += Math.abs(data[i]);
        sampleCount += 1;
      }
    }

    peaks.push(sampleCount ? sum / sampleCount : 0);
  }

  const maxPeak = Math.max(...peaks, 0.001);
  return peaks.map((peak) => Math.max(0.08, Math.min(1, peak / maxPeak)));
}

function makePlaceholderPeaks(count) {
  return Array.from({ length: count }, (_, index) => {
    const a = Math.sin(index * 0.48) * 0.28;
    const b = Math.sin(index * 0.17 + 1.3) * 0.18;
    return Math.max(0.12, Math.min(0.62, 0.34 + a + b));
  });
}

function updateWaveformProgress(node, ratio) {
  const waveform = node._waveform;
  if (!waveform) return;
  const nextProgress = Math.max(0, Math.min(1, ratio || 0));
  if (Math.abs(nextProgress - waveform.progress) < 0.002 && waveform.ready) return;
  waveform.progress = nextProgress;
  drawWaveform(node);
}

function drawWaveform(node) {
  const canvas = node.querySelector(".waveCanvas");
  const waveform = node._waveform;
  if (!canvas || !waveform) return;

  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  const scale = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  drawPeakBars(ctx, waveform.peaks, width, height, "rgba(23, 33, 31, 0.16)");

  if (waveform.progress > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width * waveform.progress, height);
    ctx.clip();
    drawPeakBars(ctx, waveform.peaks, width, height, waveform.color);
    ctx.restore();
  }
}

function drawPeakBars(ctx, peaks, width, height, color) {
  const step = width / peaks.length;
  const gap = Math.min(2.4, Math.max(1, step * 0.34));
  const barWidth = Math.max(1.25, step - gap);
  ctx.fillStyle = color;

  peaks.forEach((peak, index) => {
    const barHeight = Math.max(3, peak * height * 0.76);
    const x = index * step + gap / 2;
    const y = (height - barHeight) / 2;
    fillRoundedRect(ctx, x, y, barWidth, barHeight, Math.min(2.2, barWidth / 2));
  });
}

function fillRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}


function showNotice(message) {
  els.notice.textContent = message;
  els.notice.hidden = false;
}

function hideNotice() {
  els.notice.hidden = true;
}

init();
