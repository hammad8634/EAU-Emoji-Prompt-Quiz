// ============================
// CONFIG (change in ONE place)
// ============================
const QUIZ_PLAN = [
  { length: 6, count: 4 },
  { length: 7, count: 4 },
  { length: 8, count: 4 },
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
  const views = ["viewLogin", "viewWelcome", "viewQuiz", "viewResults"];
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
  //   const btnReset = $("btnResetAllTop");
  const btnLogout = $("btnLogout");

  if (!username) {
    pill.classList.add("d-none");
    // btnReset.classList.add("d-none");
    btnLogout.classList.add("d-none");
    return;
  }

  $("topUserName").textContent = username;
  pill.classList.remove("d-none");
  //   btnReset.classList.remove("d-none");
  btnLogout.classList.remove("d-none");
}

// ============================
// App state
// ============================
let emojiBank = [];
let quiz = { quizVersion: "", questions: [] };

let timerInterval = null;

// ============================
// Load JSON
// ============================
async function loadData() {
  const [bankRes, quizRes] = await Promise.all([
    fetch("./emoji_bank.json", { cache: "no-store" }),
    fetch("./quiz_set.json", { cache: "no-store" }),
  ]);

  if (!bankRes.ok) throw new Error("Failed to load emoji_bank.json");
  if (!quizRes.ok) throw new Error("Failed to load quiz_set.json");

  emojiBank = await bankRes.json();
  quiz = await quizRes.json();

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

  showWelcome();
}

function showWelcome() {
  const username = getUser();
  $("welcomeName").textContent = username || "Student";

  // Top UI
  setTopUserUI(username);

  showView("viewWelcome");
}

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

  const answers = getAnswers();
  answers[idx] = normalizedInput;
  setAnswers(answers);

  // move forward
  const nextIdx = idx + 1;

  if (nextIdx >= total) {
    // finish
    setFinished(true);
    stopTimer();
    showResults();
  } else {
    setCurrentIdx(nextIdx);
    renderQuestion();
  }
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

  const username = getUser();
  const finalPercent = Math.round(finalScore * 100);

  submitToGoogleForm({
    name: username,
    correct,
    total,
    timeSeconds: timeTakenSeconds,
    finalPercent,
    quizVersion: quiz.quizVersion,
  }).catch(() => {});

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
function wireEvents() {
  $("loginForm").addEventListener("submit", handleLoginSubmit);

  $("btnDemoFill").addEventListener("click", () => {
    $("loginUsername").value = "Hammad";
    $("loginPassword").value = "HammadEAU2026";
  });

  $("btnStart").addEventListener("click", () => {
    // Fresh start each time you press Start
    clearAttempt();
    startAttempt();
    showQuiz();
  });

  $("btnSaveNext").addEventListener("click", handleSaveNext);

  $("btnLogout").addEventListener("click", () => {
    // clear everything
    localStorage.clear();

    // reset UI
    setTopUserUI("");
    showView("viewLogin");

    showAlert("You have been logged out.", "info");
  });

  // Enter key = Save & Next
  $("answerInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveNext();
    }
  });

  // Legend modal
  const legendModalEl = document.getElementById("legendModal");
  const legendModal = new bootstrap.Modal(legendModalEl);

  $("btnShowLegend").addEventListener("click", () => legendModal.show());
  $("btnLegendInQuiz").addEventListener("click", () => legendModal.show());

  // Reset
  //   $("btnResetAll").addEventListener("click", () => {
  //     clearAttempt();
  //     showWelcome();
  //     showAlert("Attempt reset. You can start again.", "info");
  //   });

  //   $("btnResetAllTop").addEventListener("click", () => {
  //     clearAttempt();
  //     showWelcome();
  //     showAlert("Attempt reset. You can start again.", "info");
  //   });

  //   $("btnBackToWelcome").addEventListener("click", () => {
  //     showWelcome();
  //   });
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

    // If finished, go to results; else if started, resume quiz; else welcome
    if (hasStart && finished) {
      showResults();
    } else if (hasStart && !finished) {
      showQuiz();
    } else {
      showWelcome();
    }
  } catch (err) {
    console.error(err);
    showView("viewLogin");
    showAlert(
      "Could not load quiz files. If you're opening index.html directly, use Live Server or deploy to Netlify so JSON fetch works.",
      "danger",
    );
  }
})();
