const state = {
  manifest: null,
};

const methodColors = {
  raw: "#64716d",
  "agms-ilrma": "#8a4fb5",
  "agms-fw": "#d89c16",
};

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
    const response = await fetch("samples.json");
    if (!response.ok) throw new Error(`Unable to load samples.json (${response.status})`);
    state.manifest = await response.json();
    renderMethodHeader();
    render();
  } catch (error) {
    showNotice(error.message);
  }
}

function renderMethodHeader() {
  const spacer = document.createElement("button");
  const body = document.createElement("div");
  const speakerSpacer = document.createElement("span");
  const labels = document.createElement("div");

  spacer.className = "stopButton";
  spacer.type = "button";
  spacer.textContent = "Stop";
  spacer.addEventListener("click", pauseAllAudio);
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
  const clips = samples.map((sample) => renderClip(sample, method.method_name));
  node.querySelector(".clips").replaceChildren(...clips);
  return node;
}

function renderClip(sample, methodName) {
  const node = els.clipTemplate.content.firstElementChild.cloneNode(true);
  const audio = node.querySelector("audio");
  const playButton = node.querySelector(".playButton");
  const seekRange = node.querySelector(".seekRange");
  const currentTime = node.querySelector(".currentTime");
  const durationTime = node.querySelector(".durationTime");

  audio.src = sample.file;
  audio.setAttribute("aria-label", `${methodName} audio example`);
  playButton.setAttribute("aria-label", `Play ${methodName} sample`);
  seekRange.setAttribute("aria-label", `Seek ${methodName} sample`);

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


function showNotice(message) {
  els.notice.textContent = message;
  els.notice.hidden = false;
}

function hideNotice() {
  els.notice.hidden = true;
}

init();
