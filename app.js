// Quiz with Start Menu, Categories, Levels, Shuffle, mobile inline timer (Option B)
// Simplified Result screen (points, total, correct, wrong)
const PER_QUESTION_SECONDS = 30;
const POINTS_PER_CORRECT = 10;
const BALANCED_RATIO = { easy: 1, medium: 2, hard: 2 };
const FORCE_BALANCED = new Set(["silogisme", "pengetahuan_umum"]);

let RAW = [];
let QUIZ = [];
let idx = 0;
let score = 0;
let answered = false;
let tStart = 0;
let deadline = 0;
let tickHandle = null;
let chosen = { category: "numerik", level: "easy", limit: null, timed: true };
let settings = { timed: true };
let advancing = false;

const $ = (s) => document.querySelector(s);

// Menu controls
$("#startBtn").addEventListener("click", startFromMenu);
$("#backBtn").addEventListener("click", backToMenu);
$("#retryBtn").addEventListener("click", () => startQuiz());
$("#toMenuBtn").addEventListener("click", backToMenu);
// lock level silo dan PU
$("#category").addEventListener("change", updateLevelLock);

$("#nextBtn").addEventListener("click", onNextClick);
function onNextClick() {
  // Di mode dengan waktu, tombol Next dinonaktifkan (tidak boleh manual lanjut)
  if (settings.timed) return;
  // Di mode tanpa waktu, hanya boleh lanjut setelah menjawab.
  if (!answered) return; // kalau mau boleh skip tanpa jawab, ubah guard ini
  goNext();
}

function setMetaVisible(on) {
  const el = document.getElementById("metaBar");
  if (!el) return;
  el.hidden = !on;
  if (on) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

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
  // $("#metaBar").hidden = true;
  setMetaVisible(false);
}

function backToMenu() {
  stopTick();
  showMenu();
}

function startFromMenu() {
  const category = $("#category").value;
  const level = $("#level").value;
  const limit = parseInt($("#limit").value || "0", 10);
  const modeVal = $("#mode").value;
  settings.timed = modeVal === "timed";
  chosen = {
    category,
    level,
    limit: limit > 0 ? limit : null,
  };
  startQuiz();
}

// mengunci pilihan level tertentu
function updateLevelLock() {
  const cat = $("#category").value;
  const levelEl = $("#level");
  const hintEl = document.getElementById("levelHint");

  if (FORCE_BALANCED.has(cat)) {
    levelEl.value = "balanced"; // set otomatis
    levelEl.disabled = true; // kunci
    if (hintEl) hintEl.style.display = "inline";
  } else {
    levelEl.disabled = false; // buka kunci untuk kategori lain (mis. numerik)
    if (hintEl) hintEl.style.display = "none";
  }
}

function startQuiz() {
  const category = chosen.category;
  const level = chosen.level;
  const desiredTotal = chosen.limit || null; // null => pakai semua
  setMetaVisible(true);

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

// helper label untuk start
function levelLabel(lv) {
  const m = { easy: "Easy", medium: "Medium", hard: "Hard" };
  return m[lv] || lv;
}

function labelCategory(c) {
  return (
    {
      numerik: "Numerik",
      silogisme: "Silogisme",
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
  setMetaVisible(true);

  // Sembunyikan elemen timer & progress bar jika mode tanpa waktu
  const timerElement = $(".meta-timer");
  const progressBar = $(".progress");
  if (timerElement) timerElement.hidden = !settings.timed;
  if (progressBar) progressBar.hidden = !settings.timed;

  $("#menuCard").hidden = true;
  $("#resultCard").hidden = true;
  $("#quizCard").hidden = false;

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
  // In timed mode Next should be disabled (auto-advance only). In untimed,
  // Next is enabled only after answering.
  $("#nextBtn").disabled = settings.timed;

  Object.entries(q.options).forEach(([key, text]) => {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.innerHTML = `<b>${key}.</b> ${text}`;
    btn.onclick = () => handleAnswer(q, key);
    $("#opts").appendChild(btn);
  });

  answered = false;

  // handle UI timer & progress per mode
  const timebarWrap = document.querySelector(".progress");
  const timerTop = document.getElementById("timer"); // di meta bar
  const timerInline = document.getElementById("timerInline"); // pill mobile

  if (settings.timed) {
    // tampilkan progress & timer
    if (timebarWrap) timebarWrap.classList.remove("hidden");
    if (
      timerTop &&
      timerTop.parentElement &&
      timerTop.parentElement.parentElement
    )
      timerTop.parentElement.parentElement.classList.remove("hidden"); // span.timer ada di dalam .meta
    if (timerInline && timerInline.closest)
      timerInline.closest(".only-mobile").classList.remove("hidden");

    // inisialisasi waktu untuk soal saat ini
    tStart = Date.now();
    deadline = tStart + PER_QUESTION_SECONDS * 1000;
    if (timerTop) timerTop.textContent = PER_QUESTION_SECONDS;
    if (timerInline) timerInline.textContent = PER_QUESTION_SECONDS;

    startTick(); // <— hanya start tick jika timed
  } else {
    // sembunyikan progress & timer
    if (timebarWrap) timebarWrap.classList.add("hidden");
    if (
      timerTop &&
      timerTop.parentElement &&
      timerTop.parentElement.parentElement
    )
      timerTop.parentElement.parentElement.classList.add("hidden"); // sembunyi chip timer di meta
    if (timerInline && timerInline.closest)
      timerInline.closest(".only-mobile").classList.add("hidden");

    // set angka agar aman (tidak berjalan)
    if (timerTop) timerTop.textContent = "–";
    if (timerInline) timerInline.textContent = "–";
  }
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
  if (!settings.timed) return;
  const now = Date.now();
  const left = Math.max(0, Math.floor((deadline - now) / 1000));

  const timerElement = $("#timer");
  if (timerElement) {
    timerElement.textContent = left;
  }

  const total = PER_QUESTION_SECONDS * 1000;
  const used = Math.min(total, now - tStart);
  const pct = Math.max(0, Math.min(100, ((total - used) / total) * 100));

  const timeBar = $("#timebar");
  if (timeBar) {
    timeBar.style.width = pct + "%";
  }

  if (now >= deadline && !answered) {
    answered = true;
    stopTick();
    const q = QUIZ[idx];
    // tampilkan feedback tetapi jangan "memilih" jawaban pengguna otomatis;
    // hanya disable opsi tanpa menandai correct/wrong
    showFeedback(false, "(Waktu habis) " + correctSentence(q));
    disableOptionsNoHighlight();
    if (!settings.timed) $("#nextBtn").disabled = false;

    // hanya timed yang auto-next
    if (settings.timed) {
      setTimeout(() => {
        if (!advancing) goNext();
      }, 1500);
    }
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

// Disable opsi tanpa menandai correct/wrong (digunakan saat timeout agar tidak
// terlihat seperti aplikasi "memilih" jawaban sendiri)
function disableOptionsNoHighlight() {
  [...document.querySelectorAll(".opt")].forEach((btn) => {
    btn.classList.add("disabled");
    btn.disabled = true;
    // jangan tambahkan kelas correct/wrong
  });
}

function handleAnswer(q, key) {
  if (answered) return;
  answered = true;
  stopTick();

  const isCorrect = key === q.correct;
  if (isCorrect) score++;
  const scEl = $("#score");
  if (scEl) scEl.textContent = score;

  lockOptions(q.correct, key);
  showFeedback(
    isCorrect,
    (isCorrect ? "Benar! " : "Salah. ") + correctSentence(q)
  );

  if (!settings.timed) $("#nextBtn").disabled = false;

  if (settings.timed) {
    // timed: auto-next setelah delay
    setTimeout(() => {
      if (!advancing) goNext();
    }, 1200);
  } else {
  }
}

function showFeedback(ok, text) {
  $("#feedback").textContent = text.replace(/<\/?[^>]+(>|$)/g, "");
  $("#feedback").className = "feedback " + (ok ? "good" : "bad");
}

// function goNext() {
//   if (idx < QUIZ.length - 1) {
//     idx++;
//     renderQuestion();
//   } else {
//     showResult();
//   }
// }
function goNext() {
  if (advancing) return; // cegah dobel
  advancing = true;

  if (idx < QUIZ.length - 1) {
    idx++;
    renderQuestion();
  } else {
    showResult();
  }

  // reset flag setelah render flush
  setTimeout(() => {
    advancing = false;
  }, 0);
}

function showResult() {
  stopTick();
  // $("#metaBar").hidden = true; // Sembunyikan meta bar terlebih dahulu
  $("#quizCard").hidden = true;
  $("#resultCard").hidden = false;
  setMetaVisible(false);

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

updateLevelLock();
boot();
