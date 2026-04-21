// ── STATE ──
let state = {
  cards: [],
  queue: [],       // indices of cards to review this session
  current: 0,      // index into queue
  flipped: false,
  filename: '',
};

// ── DOM REFS ──
const uploadZone   = document.getElementById('upload-zone');
const fileInput    = document.getElementById('file-input');
const btnGenerate  = document.getElementById('btn-generate');
const fileLabel    = document.getElementById('file-name-label');
const flashcard    = document.getElementById('flashcard');
const ratingRow    = document.getElementById('rating-row');
const flipHint     = document.getElementById('flip-hint');
const cardCounter  = document.getElementById('card-counter');
const progressBar  = document.getElementById('progress-bar');
const deckMeta     = document.getElementById('deck-meta');

// ── SCREEN MANAGEMENT ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── UPLOAD ZONE ──
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') {
    fileInput.files = e.dataTransfer.files;
    handleFileSelect(f);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

function handleFileSelect(file) {
  fileLabel.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  btnGenerate.disabled = false;
}

// ── GENERATE FLASHCARDS ──
btnGenerate.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const btnText = btnGenerate.querySelector('.btn-text');
  const btnLoader = btnGenerate.querySelector('.btn-loader');
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-flex';
  btnGenerate.disabled = true;

  try {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/generate', { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || 'Failed to generate cards');

    state.cards = data.cards;
    state.filename = data.filename;
    initStudySession();

  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
    btnGenerate.disabled = false;
  }
});

// ── STUDY SESSION ──
function initStudySession() {
  // Queue = all cards sorted: new first, then by due_in (soonest first)
  state.queue = state.cards
    .map((_, i) => i)
    .sort((a, b) => {
      const ca = state.cards[a], cb = state.cards[b];
      if (ca.status === 'new' && cb.status !== 'new') return -1;
      if (cb.status === 'new' && ca.status !== 'new') return 1;
      return ca.due_in - cb.due_in;
    });
  state.current = 0;
  state.flipped = false;

  deckMeta.textContent = `${state.cards.length} cards · ${state.filename}`;
  updateStats();
  showScreen('screen-study');
  loadCard();
}

function loadCard() {
  if (state.current >= state.queue.length) {
    showComplete();
    return;
  }

  const idx = state.queue[state.current];
  const card = state.cards[idx];

  document.getElementById('card-front-text').textContent = card.front;
  document.getElementById('card-back-text').textContent = card.back;
  document.getElementById('card-topic-front').textContent = card.topic;
  document.getElementById('card-topic-back').textContent = card.topic;

  flashcard.classList.remove('flipped');
  ratingRow.style.display = 'none';
  flipHint.style.display = 'block';
  state.flipped = false;

  cardCounter.textContent = `${state.current + 1} / ${state.queue.length}`;
  const pct = (state.current / state.queue.length) * 100;
  progressBar.style.width = pct + '%';
}

// ── FLIP ──
document.getElementById('card-scene').addEventListener('click', flipCard);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); flipCard(); }
  if (e.code === 'Digit1') rateCard(0);
  if (e.code === 'Digit2') rateCard(1);
  if (e.code === 'Digit3') rateCard(2);
  if (e.code === 'Digit4') rateCard(3);
});

function flipCard() {
  if (state.flipped) return;
  state.flipped = true;
  flashcard.classList.add('flipped');
  setTimeout(() => {
    ratingRow.style.display = 'flex';
    flipHint.style.display = 'none';
  }, 280);
}

// ── RATE CARD ──
async function rateCard(grade) {
  const idx = state.queue[state.current];
  try {
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards: state.cards, card_index: idx, grade })
    });
    const data = await res.json();
    state.cards = data.cards;
  } catch (_) {
    // fallback: update locally
    const card = state.cards[idx];
    if (grade === 0) card.status = 'learning';
    else if (grade >= 2 && card.repetitions >= 2) card.status = 'mastered';
    else { card.status = 'learning'; card.repetitions = (card.repetitions || 0) + 1; }
    state.cards[idx] = card;
  }

  updateStats();
  state.current++;
  loadCard();
}

// ── STATS ──
function updateStats() {
  const counts = { new: 0, learning: 0, mastered: 0 };
  state.cards.forEach(c => counts[c.status] = (counts[c.status] || 0) + 1);

  document.querySelector('#stat-new .stat-num').textContent = counts.new;
  document.querySelector('#stat-learning .stat-num').textContent = counts.learning;
  document.querySelector('#stat-mastered .stat-num').textContent = counts.mastered;
}

// ── COMPLETE ──
function showComplete() {
  progressBar.style.width = '100%';
  const total = state.cards.length;
  const mastered = state.cards.filter(c => c.status === 'mastered').length;
  const learning = state.cards.filter(c => c.status === 'learning').length;
  const newCards = state.cards.filter(c => c.status === 'new').length;

  document.getElementById('complete-summary').textContent =
    `You reviewed all ${total} cards in this round.`;

  document.getElementById('complete-stats').innerHTML = `
    <div class="complete-stat">
      <span class="complete-stat-num" style="color:var(--accent)">${mastered}</span>
      <span class="complete-stat-label">Mastered</span>
    </div>
    <div class="complete-stat">
      <span class="complete-stat-num" style="color:var(--hard)">${learning}</span>
      <span class="complete-stat-label">Learning</span>
    </div>
    <div class="complete-stat">
      <span class="complete-stat-num" style="color:var(--text-muted)">${newCards}</span>
      <span class="complete-stat-label">New</span>
    </div>
    <div class="complete-stat">
      <span class="complete-stat-num" style="color:var(--accent2)">${total}</span>
      <span class="complete-stat-label">Total</span>
    </div>
  `;

  showScreen('screen-complete');
}

function restartStudy() {
  initStudySession();
}

// ── BACK BUTTON ──
document.getElementById('btn-back').addEventListener('click', () => {
  showScreen('screen-upload');
});

// ── TOAST ──
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}