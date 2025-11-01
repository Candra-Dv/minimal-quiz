// Quiz with Start Menu, Categories, Levels, Shuffle, mobile inline timer (Option B)
// Simplified Result screen (points, total, correct, wrong)
const PER_QUESTION_SECONDS = 30;
const POINTS_PER_CORRECT = 10;
const BALANCED_RATIO = { easy: 1, medium: 2, hard: 2 };

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
  const category = chosen.category;
  const level = chosen.level;
  const desiredTotal = chosen.limit || null; // null => pakai semua

  // Kumpulan soal per kategori
  const catAll = RAW.filter((q) => q.category === category);

  // Jika bukan balanced: pakai flow lama (filter by level)
  if (level !== "balanced") {
    let pool = normalizeQuestions(catAll.filter((q) => q.level === level));
    pool = shuffle(pool);
    if (desiredTotal) pool = pool.slice(0, desiredTotal);

    if (pool.length === 0) {
      alert(
        "Belum ada soal untuk kombinasi tersebut. Coba pilih level/kategori lain."
      );
      return;
    }
    prepareAndStart(pool, levelLabel(level));
    return;
  }

  // ---- Mode Balanced (Easy:1, Medium:2, Hard:2) ----
  const poolE = normalizeQuestions(catAll.filter((q) => q.level === "easy"));
  const poolM = normalizeQuestions(catAll.filter((q) => q.level === "medium"));
  const poolH = normalizeQuestions(catAll.filter((q) => q.level === "hard"));

  let totalAvailable = poolE.length + poolM.length + poolH.length;
  if (totalAvailable === 0) {
    alert("Belum ada soal pada kategori ini.");
    return;
  }

  const target = desiredTotal
    ? Math.min(desiredTotal, totalAvailable)
    : totalAvailable;

  // Hitung alokasi berdasarkan rasio 1:2:2
  const sumWeight =
    BALANCED_RATIO.easy + BALANCED_RATIO.medium + BALANCED_RATIO.hard; // 5
  let needE = Math.floor((target * BALANCED_RATIO.easy) / sumWeight);
  let needM = Math.floor((target * BALANCED_RATIO.medium) / sumWeight);
  let needH = Math.floor((target * BALANCED_RATIO.hard) / sumWeight);

  // Distribusikan sisa agar total tepat = target (prioritas Medium > Hard > Easy)
  let remainder = target - (needE + needM + needH);
  const priority = ["medium", "hard", "easy"];
  let ptr = 0;
  while (remainder > 0) {
    const p = priority[ptr % priority.length];
    if (p === "medium") needM++;
    else if (p === "hard") needH++;
    else needE++;
    remainder--;
    ptr++;
  }

  // Ambil sesuai alokasi (kalau kurang, akan ditambal)
  let takeE = sample(poolE, needE);
  let takeM = sample(poolM, needM);
  let takeH = sample(poolH, needH);

  // Hitung kekurangan dan tambal dari level lain (urut preferensi: Medium → Hard → Easy)
  function short(n, got) {
    return Math.max(0, n - got.length);
  }

  let shortage = target - (takeE.length + takeM.length + takeH.length);
  if (shortage > 0) {
    // sisa kandidat (yang belum terambil)
    const leftE = poolE.filter((x) => !takeE.includes(x));
    const leftM = poolM.filter((x) => !takeM.includes(x));
    const leftH = poolH.filter((x) => !takeH.includes(x));

    const refillOrder = [leftM, leftH, leftE];
    for (const bucket of refillOrder) {
      if (shortage <= 0) break;
      const add = sample(bucket, shortage);
      // push ke bucket yang paling “kurang” secara proporsi saat ini
      for (const it of add) {
        // pilih kemana? prioritaskan menambah M → H → E agar profil tetap mirip
        if (leftM.includes(it)) takeM.push(it);
        else if (leftH.includes(it)) takeH.push(it);
        else takeE.push(it);
      }
      shortage = target - (takeE.length + takeM.length + takeH.length);
    }
  }

  let pool = shuffle([...takeE, ...takeM, ...takeH]).slice(0, target);
  prepareAndStart(pool, "Balanced");
}

// helper label untuk start
function levelLabel(lv) {
  const m = { easy: "Easy", medium: "Medium", hard: "Hard" };
  return m[lv] || lv;
}

// pemersih start yang sama untuk semua mode
function prepareAndStart(pool, label) {
  QUIZ = pool;
  idx = 0;
  score = 0;
  $("#score").textContent = score;
  $("#total").textContent = QUIZ.length;
  $("#catLabel").textContent = labelCategory(chosen.category);
  $("#lvlLabel").textContent = label;
  $("#metaBar").hidden = false;

  $("#menuCard").hidden = true;
  $("#resultCard").hidden = true;
  $("#quizCard").hidden = false;

  const t2 = document.getElementById("timerInline");
  if (t2) t2.textContent = PER_QUESTION_SECONDS;

  renderQuestion();
}

// helper label untuk start
function levelLabel(lv) {
  const m = { easy: "Easy", medium: "Medium", hard: "Hard" };
  return m[lv] || lv;
}

// pemersih start yang sama untuk semua mode
function prepareAndStart(pool, label) {
  QUIZ = pool;
  idx = 0;
  score = 0;
  $("#score").textContent = score;
  $("#total").textContent = QUIZ.length;
  $("#catLabel").textContent = labelCategory(chosen.category);
  $("#lvlLabel").textContent = label;
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

function sample(arr, n) {
  return shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)));
}

// pemersih start yang sama untuk semua mode
function prepareAndStart(pool, label) {
  QUIZ = pool;
  idx = 0;
  score = 0;
  $("#total").textContent = QUIZ.length;
  $("#catLabel").textContent = labelCategory(chosen.category);
  $("#lvlLabel").textContent = label;
  $("#metaBar").hidden = false;

  $("#menuCard").hidden = true;
  $("#resultCard").hidden = true;
  $("#quizCard").hidden = false;

  const t2 = document.getElementById("timerInline");
  if (t2) t2.textContent = PER_QUESTION_SECONDS;

  renderQuestion();
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
