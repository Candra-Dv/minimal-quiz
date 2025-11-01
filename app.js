// Quiz with Start Menu, Categories, Levels, Shuffle, mobile inline timer (Option B)
// Simplified Result screen (points, total, correct, wrong)
const PER_QUESTION_SECONDS = 30;
const POINTS_PER_CORRECT = 10;

let RAW = [];
let QUIZ = [];
let idx = 0;
let score = 0; // number of correct answers
let answered = false;
let tStart = 0;
let deadline = 0;
let tickHandle = null;
let chosen = { category: "numerik", level: "easy", limit: null };

const $ = (s) => document.querySelector(s);

// Menu controls
$("#startBtn").addEventListener("click", startFromMenu);
$("#backBtn").addEventListener("click", backToMenu);
$("#retryBtn").addEventListener("click", () => startQuiz());
$("#toMenuBtn").addEventListener("click", backToMenu);

async function boot() {
  try {
    const res = await fetch("questions.json");
    RAW = await res.json();
    if (Array.isArray(RAW) && RAW.some((r) => Array.isArray(r))) {
      RAW = RAW.flat();
    }
  } catch (e) {
    console.error("Gagal memuat questions.json", e);
    alert(
      "Gagal memuat questions.json. Jalankan lewat server lokal (mis: python -m http.server)."
    );
    return;
  }
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
  $("#total").textContent = QUIZ.length;
  $("#catLabel").textContent = labelCategory(chosen.category);
  $("#lvlLabel").textContent = labelLevel(chosen.level);
  $("#metaBar").hidden = false;

  $("#menuCard").hidden = true;
  $("#resultCard").hidden = true;
  $("#quizCard").hidden = false;

  const t2 = document.getElementById("timerInline");
  if (t2) t2.textContent = PER_QUESTION_SECONDS;

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
  return raw.map((q, qi) => {
    const entries = Object.entries(q.options).map(([key, text]) => ({
      key,
      text,
    }));
    const shuffled = shuffle(entries);
    const correctText = q.options[q.correct];
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

  const t2 = document.getElementById("timerInline");
  if (t2) t2.textContent = PER_QUESTION_SECONDS;

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
  const t2 = document.getElementById("timerInline");
  if (t2) t2.textContent = left;

  const total = PER_QUESTION_SECONDS * 1000;
  const used = Math.min(total, now - tStart);
  const pct = Math.max(0, Math.min(100, ((total - used) / total) * 100));
  $("#timebar").style.width = pct + "%";

  if (now >= deadline && !answered) {
    answered = true;
    stopTick();
    const q = QUIZ[idx];
    showFeedback(false, "(Waktu habis) " + correctSentence(q));
    lockOptions(q.correct, null);
    $("#nextBtn").disabled = false;
    setTimeout(goNext, 1500);
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

  const isCorrect = key === q.correct;
  if (isCorrect) score++;

  lockOptions(q.correct, key);
  showFeedback(
    isCorrect,
    (isCorrect ? "Benar! " : "Salah. ") + correctSentence(q)
  );

  $("#nextBtn").disabled = false;
  setTimeout(goNext, 1200);
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
  $("#metaBar").hidden = true; // Sembunyikan meta bar terlebih dahulu
  $("#quizCard").hidden = true;
  $("#resultCard").hidden = false;

  const total = QUIZ.length;
  const correct = score;
  const wrong = total - correct;
  const points = correct * POINTS_PER_CORRECT;

  $("#resultPoints").textContent = `You've scored +${points} points`;
  $("#statTotal").textContent = total;
  $("#statCorrect").textContent = correct.toString().padStart(2, "0");
  $("#statWrong").textContent = wrong.toString().padStart(2, "0");
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
