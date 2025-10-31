// Quiz with Start Menu, Categories, Levels, Shuffle, and Recap
const PER_QUESTION_SECONDS = 30;
const LEVELS = ["easy", "medium", "hard"];

let RAW = [];
let QUIZ = [];
let score = 0;
let answered = false;
let tStart = 0;
let deadline = 0;
let tickHandle = null;
let recap = [];
let chosen = { category: "numerik", level: "easy", limit: null };

const $ = (s) => document.querySelector(s);

// Menu controls
$("#startBtn").addEventListener("click", startFromMenu);
$("#backBtn").addEventListener("click", backToMenu);
$("#retryBtn").addEventListener("click", () => startQuiz());
$("#exportBtn").addEventListener("click", exportJSON);
$("#toMenuBtn").addEventListener("click", backToMenu);

async function boot() {
  try {
    const res = await fetch("questions.json");
    RAW = await res.json();
  } catch (e) {
    console.error("Gagal memuat questions.json", e);
    alert(
      "Gagal memuat questions.json. Jalankan lewat server lokal (mis: python -m http.server)."
    );
    return;
  }
  // Default: stay on menu
  showMenu();
}

function showMenu() {
  $("#menuCard").hidden = false;
  $("#quizCard").hidden = true;
  $("#resultCard").hidden = true;
  $("#metaBar").hidden = true;
}

function backToMenu() {
  stopTick();
  showMenu();
}

function startFromMenu() {
  const category = $("#category").value;
  const level = $("#level").value;
  const limit = parseInt($("#limit").value || "0", 10);
  chosen = { category, level, limit: limit > 0 ? limit : null };
  startQuiz();
}

function startQuiz() {
  // filter by category and level
  const filtered = RAW.filter(
    (q) => q.category === chosen.category && q.level === chosen.level
  );
  let pool = normalizeQuestions(filtered);
  pool = shuffle(pool);
  if (chosen.limit && chosen.limit > 0) pool = pool.slice(0, chosen.limit);

  if (pool.length === 0) {
    alert(
      "Belum ada soal untuk kombinasi tersebut. Coba pilih level/kategori lain."
    );
    return;
  }

  QUIZ = pool;
  idx = 0;
  score = 0;
  recap = [];
  $("#score").textContent = score;
  $("#total").textContent = QUIZ.length;
  $("#catLabel").textContent = labelCategory(chosen.category);
  $("#lvlLabel").textContent = labelLevel(chosen.level);
  $("#metaBar").hidden = false;

  $("#menuCard").hidden = true;
  $("#resultCard").hidden = true;
  $("#quizCard").hidden = false;

  renderQuestion();
}

function labelCategory(c) {
  return (
    {
      numerik: "Numerik",
      sosiologi: "Sosiologi",
      pengetahuan_umum: "Pengetahuan Umum",
    }[c] || c
  );
}
function labelLevel(l) {
  const m = { easy: "Easy", medium: "Medium", hard: "Hard" };
  return m[l] || l;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeQuestions(raw) {
  // Ensure uniform structure and shuffle options while keeping correct mapping by text
  return raw.map((q, qi) => {
    const entries = Object.entries(q.options).map(([key, text]) => ({
      key,
      text,
    }));
    const shuffled = shuffle(entries);
    const correctText = q.options[q.correct];
    // Find the new key where the correct text appears
    const newKey =
      shuffled.find((o) => o.text === correctText)?.key || q.correct;
    const options = {};
    shuffled.forEach((o) => (options[o.key] = o.text));
    return {
      id: qi + 1,
      body: q.body,
      options,
      correct: newKey,
      explain: q.explain || "",
    };
  });
}

function renderQuestion() {
  const q = QUIZ[idx];
  $("#pos").textContent = idx + 1;
  $("#qtext").innerHTML = q.body;
  $("#opts").innerHTML = "";
  $("#feedback").textContent = "";
  $("#feedback").className = "feedback";
  $("#nextBtn").disabled = true;

  Object.entries(q.options).forEach(([key, text]) => {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.innerHTML = `<b>${key}.</b> ${text}`;
    btn.onclick = () => handleAnswer(q, key);
    $("#opts").appendChild(btn);
  });

  answered = false;
  tStart = Date.now();
  deadline = tStart + PER_QUESTION_SECONDS * 1000;
  startTick();
}

function startTick() {
  stopTick();
  tick();
  tickHandle = setInterval(tick, 100);
}
function stopTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}
function tick() {
  const now = Date.now();
  const left = Math.max(0, Math.floor((deadline - now) / 1000));
  $("#timer").textContent = left;
  const total = PER_QUESTION_SECONDS * 1000;
  const used = Math.min(total, now - tStart);
  const pct = Math.max(0, Math.min(100, ((total - used) / total) * 100));
  $("#timebar").style.width = pct + "%";

  if (now >= deadline && !answered) {
    answered = true;
    stopTick();
    const q = QUIZ[idx];
    const timeSec = PER_QUESTION_SECONDS;
    pushRecap(q, null, timeSec);
    showFeedback(false, "(Waktu habis) " + correctSentence(q));
    lockOptions(q.correct, null);
    $("#nextBtn").disabled = false;
    setTimeout(goNext, 1200);
  }
}

function correctSentence(q) {
  const k = q.correct;
  const t = q.options[k];
  const ex = q.explain ? ` (${q.explain})` : "";
  return `Jawaban benar: ${k}. ${t}${ex}`;
}

function lockOptions(correctKey, chosenKey) {
  [...document.querySelectorAll(".opt")].forEach((btn) => {
    const key = btn.textContent.trim().slice(0, 1);
    btn.classList.add("disabled");
    btn.disabled = true;
    if (key === correctKey) btn.classList.add("correct");
    if (chosenKey && key === chosenKey && chosenKey !== correctKey)
      btn.classList.add("wrong");
  });
}

function handleAnswer(q, key) {
  if (answered) return;
  answered = true;
  stopTick();

  const timeSec = Math.max(0, Math.round((Date.now() - tStart) / 1000));
  const isCorrect = key === q.correct;
  if (isCorrect) score++;
  $("#score").textContent = score;

  lockOptions(q.correct, key);
  showFeedback(
    isCorrect,
    (isCorrect ? "Benar! " : "Salah. ") + correctSentence(q)
  );
  pushRecap(q, key, timeSec);

  $("#nextBtn").disabled = false;
  setTimeout(goNext, 2000);
}

function pushRecap(q, selectedKey, timeSec) {
  const correctKey = q.correct;
  recap.push({
    n: idx + 1,
    body: stripTags(q.body),
    selected: selectedKey
      ? `${selectedKey}. ${q.options[selectedKey]}`
      : "(tidak menjawab)",
    correctKey,
    correctText: q.options[correctKey],
    isCorrect: !!(selectedKey && selectedKey === correctKey),
    timeSec,
  });
}

function showFeedback(ok, text) {
  $("#feedback").textContent = text.replace(/<\/?[^>]+(>|$)/g, "");
  $("#feedback").className = "feedback " + (ok ? "good" : "bad");
}

function goNext() {
  if (idx < QUIZ.length - 1) {
    idx++;
    renderQuestion();
  } else {
    showResult();
  }
}

function showResult() {
  stopTick();
  $("#quizCard").hidden = true;
  $("#resultCard").hidden = false;

  const percent = Math.round((score / QUIZ.length) * 100);
  $("#summaryScore").textContent = `Skor ${score}/${QUIZ.length} (${percent}%)`;

  const tbody = $("#recapBody");
  tbody.innerHTML = "";
  recap.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.n}</td>
      <td>${escapeHtml(row.body)}</td>
      <td>${escapeHtml(row.selected)}</td>
      <td>${row.correctKey}. ${escapeHtml(row.correctText)}</td>
      <td>${
        row.isCorrect
          ? '<span class="badge ok">Benar</span>'
          : '<span class="badge bad">Salah</span>'
      }</td>
      <td>${row.timeSec}</td>
    `;
    tbody.appendChild(tr);
  });
}

function stripTags(s) {
  return (s || "").replace(/<[^>]*>/g, "");
}
function escapeHtml(s) {
  return (s || "").toString().replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m])
  );
}

function exportJSON() {
  const data = {
    category: chosen.category,
    level: chosen.level,
    score,
    total: QUIZ.length,
    recap,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekap-${chosen.category}-${chosen.level}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Start
boot();
