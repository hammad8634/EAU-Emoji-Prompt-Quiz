// ============================
// CONFIG (change in ONE place)
// ============================
const QUIZ_PLAN = [
  { length: 3, count: 2 },
  { length: 3, count: 2 },
];

// Target time for time-score normalization (seconds)
const TARGET_TIME_SECONDS = 240; // e.g., 4 minutes

// Storage keys
const LS = {
  user: "eauEmojiQuiz.user",
  startMs: "eauEmojiQuiz.startMs",
  answers: "eauEmojiQuiz.answers",
  idx: "eauEmojiQuiz.currentIdx",
  finished: "eauEmojiQuiz.finished",
  quizVersion: "eauEmojiQuiz.version",
};

const COMP = {
  unlocked: "eauComp.unlocked", // 1..4
  catStart: "eauComp.catStartMs", // start ms for current category
  catTimes: "eauComp.catTimes", // {1:sec,2:sec,3:sec,4:sec}
  cat1Score: "eauComp.cat1Score", // {c,total}
  cat3Score: "eauComp.cat3Score", // {c,total}

  scIdx: "eauComp.scIdx",
  scPrompts: "eauComp.scPrompts",

  abIdx: "eauComp.abIdx",
  abPicks: "eauComp.abPicks",
  completed: "eauComp.completed",
};

// ============================
// DOM helpers
// ============================
const $ = (id) => document.getElementById(id);

function showAlert(message, type = "info") {
  const el = $("globalAlert");
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.classList.remove("d-none");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function hideAlert() {
  const el = $("globalAlert");
  el.classList.add("d-none");
}

function showView(viewId) {
  const views = [
    "viewLogin",
    "viewWelcome",
    "viewCategories",
    "viewQuiz",
    "viewScenario",
    "viewAB",
    "viewPython",
    "viewCat1Result",
    "viewCat3Result",
    "viewResults",
    "viewSummary",
  ];
  for (const v of views) $(v).classList.add("d-none");
  $(viewId).classList.remove("d-none");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function normalizeAnswer(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function setTopUserUI(username) {
  const pill = $("topUserPill");
  const btnLogout = $("btnLogout");

  if (!username) {
    pill.classList.add("d-none");
    btnLogout.classList.add("d-none");
    return;
  }

  $("topUserName").textContent = username;
  pill.classList.remove("d-none");
  btnLogout.classList.remove("d-none");
}

// ============================
// App state
// ============================
let emojiBank = [];
let quiz = { quizVersion: "", questions: [] };
let compData = null; // competition.json

let timerInterval = null;

// ============================
// Load JSON
// ============================
async function loadData() {
  const [bankRes, quizRes, compRes] = await Promise.all([
    fetch("./emoji_bank.json", { cache: "no-store" }),
    fetch("./quiz_set.json", { cache: "no-store" }),
    fetch("./competition.json", { cache: "no-store" }),
  ]);
  if (!compRes.ok) throw new Error("Failed to load competition.json");
  if (!bankRes.ok) throw new Error("Failed to load emoji_bank.json");
  if (!quizRes.ok) throw new Error("Failed to load quiz_set.json");

  emojiBank = await bankRes.json();
  quiz = await quizRes.json();
  compData = await compRes.json();

  // Footer version
  $("quizVersionFooter").textContent = `Quiz: ${quiz.quizVersion}`;

  // Validate plan vs quiz
  validateQuizPlan();

  // Build legend table
  renderLegend();
  renderPlanList();
}

function validateQuizPlan() {
  const qs = quiz.questions || [];
  const expectedTotal = QUIZ_PLAN.reduce((sum, x) => sum + x.count, 0);

  if (qs.length !== expectedTotal) {
    showAlert(
      `Quiz set has ${qs.length} questions, but plan expects ${expectedTotal}. Please fix quiz_set.json.`,
      "warning",
    );
  }

  // Count by length
  const counts = new Map();
  for (const q of qs) {
    const len = (q.emojis || []).length;
    counts.set(len, (counts.get(len) || 0) + 1);
  }

  for (const p of QUIZ_PLAN) {
    const have = counts.get(p.length) || 0;
    if (have !== p.count) {
      showAlert(
        `Quiz set length mismatch: expected ${p.count} questions of length ${p.length}, but found ${have}.`,
        "warning",
      );
    }
  }
}

// ============================
// Legend + Plan UI
// ============================
function renderLegend() {
  const tbody = $("legendTableBody");
  tbody.innerHTML = "";

  for (const item of emojiBank) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-center fs-4">${item.emoji}</td>
      <td><span class="badge text-bg-light border text-ink">${item.word}</span></td>
      <td class="text-muted">${item.meaning || ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderPlanList() {
  const el = $("planList");
  el.innerHTML = "";
  for (const p of QUIZ_PLAN) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${p.count}</strong> questions × <strong>${p.length}</strong> emojis`;
    el.appendChild(li);
  }
}

// ============================
// Session / localStorage
// ============================
function getUser() {
  return localStorage.getItem(LS.user) || "";
}

function setUser(name) {
  localStorage.setItem(LS.user, name);
  setTopUserUI(name);
}

function clearAttempt() {
  localStorage.removeItem(LS.startMs);
  localStorage.removeItem(LS.answers);
  localStorage.removeItem(LS.idx);
  localStorage.removeItem(LS.finished);
  localStorage.removeItem(LS.quizVersion);
}

function startAttempt() {
  localStorage.setItem(LS.startMs, String(Date.now()));
  localStorage.setItem(LS.answers, JSON.stringify([]));
  localStorage.setItem(LS.idx, "0");
  localStorage.setItem(LS.finished, "0");
  localStorage.setItem(LS.quizVersion, quiz.quizVersion);
}

function getStartMs() {
  const v = localStorage.getItem(LS.startMs);
  return v ? Number(v) : 0;
}

function getCurrentIdx() {
  return Number(localStorage.getItem(LS.idx) || "0");
}

function setCurrentIdx(i) {
  localStorage.setItem(LS.idx, String(i));
}

function getAnswers() {
  try {
    return JSON.parse(localStorage.getItem(LS.answers) || "[]");
  } catch {
    return [];
  }
}

function getJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function startCategoryTimer() {
  localStorage.setItem(COMP.catStart, String(Date.now()));
}

function stopCategoryTimer(catNum) {
  const start = Number(localStorage.getItem(COMP.catStart) || "0");
  const sec = start ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0;

  const times = getJson(COMP.catTimes, {});
  times[catNum] = sec;
  setJson(COMP.catTimes, times);

  localStorage.removeItem(COMP.catStart);
  return sec;
}

function setUnlocked(catNum) {
  localStorage.setItem(COMP.unlocked, String(catNum));
}

function getUnlocked() {
  return Number(localStorage.getItem(COMP.unlocked) || "1");
}

function setJson(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}

function setAnswers(arr) {
  localStorage.setItem(LS.answers, JSON.stringify(arr));
}

function setFinished(flag) {
  localStorage.setItem(LS.finished, flag ? "1" : "0");
}

function isFinished() {
  return localStorage.getItem(LS.finished) === "1";
}

// ============================
// Views: Login
// ============================
function handleLoginSubmit(e) {
  e.preventDefault();
  hideAlert();

  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value.trim();

  if (!username) return showAlert("Please enter a username.", "warning");

  const expected = `${username}EAU2026`;
  if (password !== expected) {
    return showAlert(
      "Invalid password. Format is Username + EAU2026.",
      "danger",
    );
  }

  setUser(username);

  // If user already has an unfinished attempt, resume
  const storedVersion = localStorage.getItem(LS.quizVersion);
  if (storedVersion && storedVersion !== quiz.quizVersion) {
    // New quiz version: reset attempt automatically
    clearAttempt();
  }

  // initialize competition on first login
  if (!localStorage.getItem(COMP.unlocked)) setUnlocked(1);
  showCategories();
}

// function showWelcome() {
//   const username = getUser();
//   $("welcomeName").textContent = username || "Student";

//   setTopUserUI(username);

//   showView("viewWelcome");
// }

// ============================
// Views: Quiz
// ============================
function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    const startMs = getStartMs();
    if (!startMs) return;
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    $("timerText").textContent = formatTime(elapsed);
  }, 250);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}
function stopAllClocks() {
  if (scInterval) clearInterval(scInterval);
  if (abInterval) clearInterval(abInterval);
  if (pyInterval) clearInterval(pyInterval);
  scInterval = abInterval = pyInterval = null;
}

function renderQuestion() {
  hideAlert();

  const idx = getCurrentIdx();
  const total = quiz.questions.length;

  $("qNumber").textContent = String(idx + 1);
  $("qTotal").textContent = String(total);

  const q = quiz.questions[idx];
  if (!q) {
    // Safety
    showResults();
    return;
  }

  const len = (q.emojis || []).length;
  $("qLength").textContent = String(len);

  // Progress bar
  const pct = Math.round((idx / total) * 100);
  $("progressBar").style.width = `${pct}%`;

  // Emojis
  const seq = $("emojiSequence");
  seq.innerHTML = "";
  for (const em of q.emojis) {
    const span = document.createElement("span");
    span.textContent = em;
    seq.appendChild(span);
  }

  // Input
  $("answerInput").value = "";
  $("answerInput").focus();

  $("answerCountHint").textContent = `Expected words: ${len}`;

  // Timer
  startTimer();
}

function showQuiz() {
  // If no attempt started, start one
  if (!getStartMs() || isFinished()) {
    startAttempt();
  }

  showView("viewQuiz");
  renderQuestion();
}

// Save and move next (no back)
function handleSaveNext() {
  hideAlert();

  const idx = getCurrentIdx();
  const q = quiz.questions[idx];
  const total = quiz.questions.length;

  if (!q) return;

  const input = $("answerInput").value;
  const normalizedInput = normalizeAnswer(input);

  if (!normalizedInput) {
    return showAlert("Please enter your answer before saving.", "warning");
  }

  // Save answer
  const answers = getAnswers();
  answers[idx] = normalizedInput;
  setAnswers(answers);

  const nextIdx = idx + 1;

  // Move forward until last question
  if (nextIdx < total) {
    setCurrentIdx(nextIdx);
    renderQuestion();
    return;
  }

  // =========================
  // FINISH CATEGORY 1
  // =========================
  setFinished(true);
  stopTimer();

  const { correct, total: tot, timeTakenSeconds } = computeScores();

  // Store Category 1 score + time
  localStorage.setItem(
    COMP.cat1Score,
    JSON.stringify({ c: correct, total: tot }),
  );

  const times = getJson(COMP.catTimes, {});
  times[1] = timeTakenSeconds;
  setJson(COMP.catTimes, times);

  // Unlock Category 2 + reset category 2 progress
  setUnlocked(2);
  localStorage.setItem(COMP.scIdx, "0");
  setJson(COMP.scPrompts, []);

  // IMPORTANT: clear catStart so Category 2 starts fresh when opened
  localStorage.removeItem(COMP.catStart);

  // Show detailed Category 1 results (then Continue -> categories)
  showCat1Result();
}

function showCategories() {
  showView("viewCategories");
  const u = getUnlocked();

  for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById(`catBtn${i}`);
    if (btn) btn.disabled = i !== u;
  }
}

let scInterval = null;

function showCat1Result() {
  const { correct, total, timeTakenSeconds, rows } = computeScores();

  // Score + Time
  document.getElementById("cat1ScoreText").textContent = `${correct}/${total}`;
  document.getElementById("cat1TimeText").textContent =
    formatTime(timeTakenSeconds);

  // Table
  const tbody = document.getElementById("cat1ReviewBody");
  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = r.isCorrect ? "table-success" : "table-danger";
    tr.innerHTML = `
      <td class="fw-semibold">${r.i}</td>
      <td class="fs-5">${escapeHtml(r.emojis)}</td>
      <td>${escapeHtml(r.userAns || "(blank)")}</td>
      <td class="fw-semibold">${escapeHtml(r.correctAns)}</td>
      <td class="fw-semibold">${r.isCorrect ? "✅" : "❌"}</td>
    `;
    tbody.appendChild(tr);
  }

  showView("viewCat1Result");
}

function showCat3Result() {
  const qs = compData.category3_ab || [];
  const picks = getJson(COMP.abPicks, []);

  let correct = 0;
  const tbody = document.getElementById("cat3ReviewBody");
  tbody.innerHTML = "";

  for (let i = 0; i < qs.length; i++) {
    const userPick = picks[i] || "";
    const correctPick = qs[i].correct || "";
    const ok = userPick === correctPick;
    if (ok) correct++;

    const tr = document.createElement("tr");
    tr.className = ok ? "table-success" : "table-danger";
    tr.innerHTML = `
      <td class="fw-semibold">${i + 1}</td>
      <td>${escapeHtml(userPick || "-")}</td>
      <td class="fw-semibold">${escapeHtml(correctPick || "-")}</td>
      <td class="fw-semibold">${ok ? "✅" : "❌"}</td>
    `;
    tbody.appendChild(tr);
  }

  // Save score
  localStorage.setItem(
    COMP.cat3Score,
    JSON.stringify({ c: correct, total: qs.length }),
  );

  // Read stored time for Category 3
  const times = getJson(COMP.catTimes, {});
  const timeSeconds = times[3] || 0;

  // UI values
  document.getElementById("cat3ScoreText").textContent =
    `${correct}/${qs.length}`;
  document.getElementById("cat3TimeText").textContent = formatTime(timeSeconds);

  showView("viewCat3Result");
}

function showScenario() {
  // Start Category 2 timer ONCE
  if (!localStorage.getItem(COMP.catStart)) startCategoryTimer();

  const idx = Number(localStorage.getItem(COMP.scIdx) || "0");
  const items = compData.category2_scenarios || [];
  const q = items[idx];

  // Finished Category 2
  if (!q) {
    // Save elapsed time for Category 2 (without stopCategoryTimer)
    const start = Number(localStorage.getItem(COMP.catStart) || "0");
    const sec = start
      ? Math.max(0, Math.floor((Date.now() - start) / 1000))
      : 0;

    const times = getJson(COMP.catTimes, {});
    times[2] = sec;
    setJson(COMP.catTimes, times);

    // Clear catStart so Category 3 starts fresh
    localStorage.removeItem(COMP.catStart);

    // Unlock Category 3 + init its state
    setUnlocked(3);
    localStorage.setItem(COMP.abIdx, "0");
    setJson(COMP.abPicks, []);

    showCategories();
    return;
  }

  document.getElementById("scTitle").textContent =
    `Scenario ${idx + 1}/${items.length}: ${q.title}`;

  const ul = document.getElementById("scReqList");
  ul.innerHTML = "";
  (q.requirements || []).forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    ul.appendChild(li);
  });

  const prompts = getJson(COMP.scPrompts, []);
  document.getElementById("scPrompt").value = prompts[idx] || "";

  showView("viewScenario");
  startScenarioClock();
}

function startScenarioClock() {
  if (scInterval) clearInterval(scInterval);
  scInterval = setInterval(() => {
    const start = Number(localStorage.getItem(COMP.catStart) || "0");
    const sec = start ? Math.floor((Date.now() - start) / 1000) : 0;
    document.getElementById("scTimer").textContent = formatTime(sec);
  }, 250);
}

function scenarioNext() {
  const idx = Number(localStorage.getItem(COMP.scIdx) || "0");
  const prompts = getJson(COMP.scPrompts, []);
  prompts[idx] = (document.getElementById("scPrompt").value || "").trim();
  setJson(COMP.scPrompts, prompts);

  localStorage.setItem(COMP.scIdx, String(idx + 1));
  showScenario();
}

let abInterval = null;
let abChosen = "";

function showCategoryResult({ title, lines }) {
  $("catResTitle").textContent = title;

  const tbody = $("catResBody");
  tbody.innerHTML = "";
  for (const [k, v] of lines) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="fw-semibold">${k}</td><td>${v}</td>`;
    tbody.appendChild(tr);
  }

  showView("viewCatResult");
}

function saveCategoryElapsed(catNum) {
  const start = Number(localStorage.getItem(COMP.catStart) || "0");
  const sec = start ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0;

  const times = getJson(COMP.catTimes, {});
  times[catNum] = sec;
  setJson(COMP.catTimes, times);

  return sec;
}

function showAB() {
  // Start Category 3 timer ONCE
  if (!localStorage.getItem(COMP.catStart)) startCategoryTimer();

  const idx = Number(localStorage.getItem(COMP.abIdx) || "0");
  const qs = compData.category3_ab || [];
  const q = qs[idx];

  // Finished Category 3
  if (!q) {
    // Save elapsed time for Category 3 (without stopCategoryTimer)
    const start = Number(localStorage.getItem(COMP.catStart) || "0");
    const sec = start
      ? Math.max(0, Math.floor((Date.now() - start) / 1000))
      : 0;

    const times = getJson(COMP.catTimes, {});
    times[3] = sec;
    setJson(COMP.catTimes, times);

    // Clear catStart so Category 4 starts fresh
    localStorage.removeItem(COMP.catStart);

    // Compute score
    const picks = getJson(COMP.abPicks, []);
    let correct = 0;
    for (let i = 0; i < qs.length; i++) {
      if ((picks[i] || "") === (qs[i].correct || "")) correct++;
    }

    localStorage.setItem(
      COMP.cat3Score,
      JSON.stringify({ c: correct, total: qs.length }),
    );

    // Unlock Category 4
    setUnlocked(4);

    // Show Category 3 detailed results FIRST
    showCat3Result();
    return;
  }

  document.getElementById("abQNum").textContent = String(idx + 1);
  document.getElementById("abQTotal").textContent = String(qs.length);

  document.getElementById("abImgA").src = q.a;
  document.getElementById("abImgB").src = q.b;

  // Reset selection
  abChosen = "";
  document.getElementById("btnAbNext").classList.add("d-none");
  document.getElementById("abPickA").classList.remove("ab-selected");
  document.getElementById("abPickB").classList.remove("ab-selected");

  showView("viewAB");
  startABClock();
}

function startABClock() {
  if (abInterval) clearInterval(abInterval);
  abInterval = setInterval(() => {
    const start = Number(localStorage.getItem(COMP.catStart) || "0");
    const sec = start ? Math.floor((Date.now() - start) / 1000) : 0;
    document.getElementById("abTimer").textContent = formatTime(sec);
  }, 250);
}

function chooseAB(letter) {
  abChosen = letter;
  document
    .getElementById("abPickA")
    .classList.toggle("ab-selected", letter === "A");
  document
    .getElementById("abPickB")
    .classList.toggle("ab-selected", letter === "B");
  document.getElementById("btnAbNext").classList.remove("d-none");
}

function abNext() {
  const idx = Number(localStorage.getItem(COMP.abIdx) || "0");
  const picks = getJson(COMP.abPicks, []);
  picks[idx] = abChosen;
  setJson(COMP.abPicks, picks);

  localStorage.setItem(COMP.abIdx, String(idx + 1));
  showAB();
}

let pyInterval = null;

function showPython() {
  showView("viewPython");

  document.getElementById("pyTitle").textContent =
    compData.category4_python.title;

  const ul = document.getElementById("pyInstr");
  ul.innerHTML = "";
  (compData.category4_python.instructions || []).forEach((x) => {
    const li = document.createElement("li");
    li.textContent = x;
    ul.appendChild(li);
  });

  document.getElementById("btnPyStart").classList.remove("d-none");
  document.getElementById("btnPySubmit").classList.add("d-none");
  document.getElementById("pyTimer").textContent = "00:00";
}

function pyStart() {
  startCategoryTimer();
  document.getElementById("btnPyStart").classList.add("d-none");
  document.getElementById("btnPySubmit").classList.remove("d-none");
  startPyClock();
}

function startPyClock() {
  if (pyInterval) clearInterval(pyInterval);
  pyInterval = setInterval(() => {
    const start = Number(localStorage.getItem(COMP.catStart) || "0");
    const sec = start ? Math.floor((Date.now() - start) / 1000) : 0;
    document.getElementById("pyTimer").textContent = formatTime(sec);
  }, 250);
}

function pySubmit() {
  stopCategoryTimer(4);
  showSummaryAndSubmit();
}

function showSummaryAndSubmit() {
  const name = getUser();

  const times = getJson(COMP.catTimes, {});
  const cat1 = getJson(COMP.cat1Score, { c: 0, total: 0 });
  const cat3 = getJson(COMP.cat3Score, { c: 0, total: 0 });

  const rows = [
    {
      label: "Category 1 (Emoji)",
      marks: `${cat1.c}/${cat1.total}`,
      time: formatTime(times[1] || 0),
    },
    {
      label: "Category 2 (Scenario)",
      marks: "—",
      time: formatTime(times[2] || 0),
    },
    {
      label: "Category 3 (Which is AI?)",
      marks: `${cat3.c}/${cat3.total}`,
      time: formatTime(times[3] || 0),
    },
    {
      label: "Category 4 (Python)",
      marks: "—",
      time: formatTime(times[4] || 0),
    },
  ];

  const tbody = document.getElementById("sumBody");
  tbody.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="fw-semibold">${r.label}</td><td>${r.marks}</td><td>${r.time}</td>`;
    tbody.appendChild(tr);
  });

  // Submit to same Google form (extend your form fields for cat times & cat3 marks)
  submitCompetitionToGoogleForm({
    name,
    cat1Correct: cat1.c,
    cat1Total: cat1.total,
    cat1Time: times[1] || 0,
    cat2Time: times[2] || 0,
    cat3Correct: cat3.c,
    cat3Total: cat3.total,
    cat3Time: times[3] || 0,
    cat4Time: times[4] || 0,
    competitionVersion: compData.competitionVersion,
  }).catch(() => {});

  localStorage.setItem(COMP.completed, "1");
  showView("viewSummary");
}

// ============================
// Results
// ============================
function computeTimeTakenSeconds() {
  const startMs = getStartMs();
  if (!startMs) return 0;
  return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
}

function computeScores() {
  const answers = getAnswers();
  const qs = quiz.questions;
  const total = qs.length;

  let correct = 0;
  const rows = [];

  for (let i = 0; i < total; i++) {
    const q = qs[i];
    const correctAns = normalizeAnswer(q.answer);
    const userAns = normalizeAnswer(answers[i] || "");

    const isCorrect = userAns === correctAns;
    if (isCorrect) correct++;

    rows.push({
      i: i + 1,
      emojis: (q.emojis || []).join(" "),
      userAns,
      correctAns,
      isCorrect,
    });
  }

  const timeTakenSeconds = computeTimeTakenSeconds();

  const accuracyScore = total ? correct / total : 0;

  // TimeScore: 1 at 0 seconds, 0 at TARGET_TIME_SECONDS and beyond
  const timeScore = Math.max(0, 1 - timeTakenSeconds / TARGET_TIME_SECONDS);

  const finalScore = 0.5 * accuracyScore + 0.5 * timeScore;

  return {
    correct,
    total,
    timeTakenSeconds,
    accuracyScore,
    timeScore,
    finalScore,
    rows,
  };
}

function showResults() {
  stopTimer();

  // Ensure finished flag
  setFinished(true);

  const { correct, total, timeTakenSeconds, finalScore, rows } =
    computeScores();

  $("statCorrect").textContent = String(correct);
  $("statTotal").textContent = String(total);
  $("statTime").textContent = formatTime(timeTakenSeconds);
  $("statTargetTime").textContent = formatTime(TARGET_TIME_SECONDS);
  $("statFinal").textContent = `${Math.round(finalScore * 100)}%`;

  // Review table
  const tbody = $("reviewTableBody");
  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = r.isCorrect ? "table-success" : "table-danger";
    tr.innerHTML = `
      <td class="fw-semibold">${r.i}</td>
      <td class="fs-5">${escapeHtml(r.emojis)}</td>
      <td><span class="text-wrap">${escapeHtml(r.userAns || "(blank)")}</span></td>
      <td><span class="text-wrap fw-semibold">${escapeHtml(r.correctAns)}</span></td>
      <td class="fw-semibold">
        ${
          r.isCorrect
            ? '<i class="bi bi-check-circle me-1"></i>Correct'
            : '<i class="bi bi-x-circle me-1"></i>Wrong'
        }
      </td>
    `;
    tbody.appendChild(tr);
  }

  $("progressBar").style.width = `100%`;
  showView("viewResults");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============================
// Events
// ============================

const on = (id, event, handler) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
};

function wireEvents() {
  // Login
  on("loginForm", "submit", handleLoginSubmit);

  on("btnDemoFill", "click", () => {
    $("loginUsername").value = "Hammad";
    $("loginPassword").value = "HammadEAU2026";
  });

  // Category 1 start (Emoji)
  on("btnStart", "click", () => {
    clearAttempt();
    startAttempt();
    showQuiz();
  });

  on("btnCatResBack", "click", () => {
    showCategories();
  });

  on("btnCat1Continue", "click", () => showCategories());
  on("btnCat3Continue", "click", () => showCategories());

  // Emoji quiz next
  on("btnSaveNext", "click", handleSaveNext);

  // Logout
  on("btnLogout", "click", () => {
    stopTimer();
    // stop other category timers too (prevents ghost intervals)
    if (scInterval) clearInterval(scInterval);
    scInterval = null;
    if (abInterval) clearInterval(abInterval);
    abInterval = null;
    if (pyInterval) clearInterval(pyInterval);
    pyInterval = null;

    localStorage.clear();
    setTopUserUI("");
    showView("viewLogin");
    showAlert("Logged out.", "info");
  });

  // Enter key = Save & Next (only exists in emoji view)
  on("answerInput", "keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveNext();
    }
  });

  // Legend modal (only if modal exists)
  const legendModalEl = document.getElementById("legendModal");
  if (legendModalEl) {
    const legendModal = new bootstrap.Modal(legendModalEl);
    on("btnShowLegend", "click", () => legendModal.show());
    on("btnLegendInQuiz", "click", () => legendModal.show());
  }

  // =========================
  // Competition Category Buttons
  // =========================
  on("catBtn1", "click", () => {
    clearAttempt();
    startAttempt();
    showQuiz();
  });

  on("catBtn2", "click", () => {
    // timer is handled inside showScenario() too, but this is ok
    showScenario();
  });

  on("catBtn3", "click", () => {
    // IMPORTANT: this was missing before
    showAB();
  });

  on("catBtn4", "click", () => {
    showPython();
  });

  // =========================
  // Category 2 (Scenario)
  // =========================
  on("btnScNext", "click", scenarioNext);

  // =========================
  // Category 3 (A/B)
  // =========================
  on("abPickA", "click", () => chooseAB("A"));
  on("abPickB", "click", () => chooseAB("B"));
  on("btnAbNext", "click", abNext);

  // =========================
  // Category 4 (Python)
  // =========================
  on("btnPyStart", "click", pyStart);
  on("btnPySubmit", "click", pySubmit);
}

// ============================
// SEND RESULTS TO GOOGLE FORM
// ============================
async function submitToGoogleForm({
  name,
  correct,
  total,
  timeSeconds,
  finalPercent,
  quizVersion,
}) {
  const FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSd5xrfG94GMqbpLmdZ4kGkXvBHMioLkEz2_MFuI1dy-O1SdUg/formResponse";

  const ENTRY = {
    name: "entry.1318314687",
    correct: "entry.1904729944",
    total: "entry.1770815127",
    timeSeconds: "entry.576033853",
    finalPercent: "entry.694035758",
    quizVersion: "entry.1742727032",
  };

  const data = new URLSearchParams();
  data.append(ENTRY.name, name);
  data.append(ENTRY.correct, String(correct));
  data.append(ENTRY.total, String(total));
  data.append(ENTRY.timeSeconds, String(timeSeconds));
  data.append(ENTRY.finalPercent, String(finalPercent));
  data.append(ENTRY.quizVersion, quizVersion);

  await fetch(FORM_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: data.toString(),
  });
}

async function submitCompetitionToGoogleForm(payload) {
  const FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSd5xrfG94GMqbpLmdZ4kGkXvBHMioLkEz2_MFuI1dy-O1SdUg/formResponse";

  const ENTRY = {
    name: "entry.1318314687",
    cat1Correct: "entry.1904729944",
    cat1Total: "entry.1770815127",
    cat1Time: "entry.576033853",
    cat2Time: "entry.1892709739",
    cat3Correct: "entry.2133166864",
    cat3Total: "entry.1271692548",
    cat3Time: "entry.1080138411",
    cat4Time: "entry.3925717",
    competitionVersion: "entry.1742727032",
  };

  const data = new URLSearchParams();
  data.append(ENTRY.name, payload.name);
  data.append(ENTRY.cat1Correct, String(payload.cat1Correct));
  data.append(ENTRY.cat1Total, String(payload.cat1Total));
  data.append(ENTRY.cat1Time, String(payload.cat1Time));
  data.append(ENTRY.cat2Time, String(payload.cat2Time));
  data.append(ENTRY.cat3Correct, String(payload.cat3Correct));
  data.append(ENTRY.cat3Total, String(payload.cat3Total));
  data.append(ENTRY.cat3Time, String(payload.cat3Time));
  data.append(ENTRY.cat4Time, String(payload.cat4Time));
  data.append(ENTRY.competitionVersion, payload.competitionVersion);

  await fetch(FORM_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: data.toString(),
  });
}

// ============================
// Boot
// ============================
(async function init() {
  try {
    await loadData();
    wireEvents();

    const username = getUser();
    setTopUserUI(username);

    // Resume logic
    const hasUser = !!username;
    const hasStart = !!getStartMs();
    const finished = isFinished();

    if (!hasUser) {
      showView("viewLogin");
      return;
    }

    if (localStorage.getItem(COMP.completed) === "1") {
      showSummaryAndSubmit(); 
      return;
    }
    // If finished, go to results; else if started, resume quiz; else welcome
    // competition mode: always go to categories after login
    showCategories();
  } catch (err) {
    console.error(err);
    showView("viewLogin");
    showAlert(
      "Could not load quiz files. If you're opening index.html directly, use Live Server or deploy to Netlify so JSON fetch works.",
      "danger",
    );
  }
})();
