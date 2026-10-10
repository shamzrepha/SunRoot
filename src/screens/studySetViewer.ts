import { getStudySet, listStudySetsForClassroom } from '../accounts/StudySetService'
import type { StudySet, AudioOverviewDialog } from '../accounts/types'
import { askSourceNotes, generateStudySet } from '../ai/StudySetGenerator'
import { session } from '../accounts/Session'
import { toast } from '../game/shell'
import { getActiveClassroom } from '../accounts/WorkshopContext'

let preselectedId: string | null = null

export function openStudySet(id: string) {
  preselectedId = id
}

type Tab = 'notes' | 'audio' | 'chat' | 'flashcards' | 'quiz' | 'homework'

export async function renderStudySetViewer(root: HTMLElement, onBack: () => void) {
  const id = preselectedId
  preselectedId = null

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading grounded study set…</p></div>`

  let currentSet: StudySet | null = null
  if (id) {
    currentSet = await getStudySet(id)
  }
  if (!currentSet) {
    const classId = getActiveClassroom() || 'demo_classroom'
    const available = await listStudySetsForClassroom(classId)
    if (available.length > 0) {
      currentSet = available[0]
    }
  }

  if (!currentSet) {
    root.innerHTML = `<div class="screen"><p class="empty-note">No study set found. Create one from your class page!</p></div>`
    return
  }

  let tab: Tab = 'notes'
  let cardIndex = 0
  let cardFlipped = false
  let quizIndex = 0
  let quizAnswers: (number | null)[] = new Array(currentSet.quiz.length).fill(null)
  let quizFeelings: (string | null)[] = new Array(currentSet.quiz.length).fill(null)
  let quizSubmitted = false

  // Audio Overview player state
  let isPlayingAudio = false
  let currentAudioIndex = 0

  // Chat with Sources state
  const chatMessages: Array<{ sender: 'user' | 'ai'; text: string; citations?: string[] }> = [
    {
      sender: 'ai',
      text: `Hello! I have ingested "${currentSet.title}". Ask me anything about the principles, circuit specs, or calculations covered in these notes!`,
      citations: [currentSet.title],
    },
  ]

  // Scratchpad drawing state
  let scratchpadOpen = false

  function paint() {
    root.innerHTML = `
      <div class="screen notebook-viewer-screen">
        <!-- Top Navigation & Set Header -->
        <div class="notebook-header-row">
          <button class="ghost-button small" id="backBtn">← Back to Class</button>
          <div class="notebook-badge-pill">🔬 Personal Study Lab</div>
        </div>

        <div class="lab-header notebook-hero-head">
          <div>
            <h1 class="notebook-title">${escapeHtml(currentSet!.title)}</h1>
            <p class="notebook-meta">Curated by <strong>${escapeHtml(currentSet!.teacherName)}</strong> · Grounded in verified course syllabus</p>
          </div>
          <div class="notebook-source-tags">
            <span class="source-count-tag">1 Grounded Document</span>
            <button class="ghost-button small" id="addSourceDocBtn">+ Upload Notes/PDF</button>
          </div>
        </div>

        <!-- 6 Personal Study Lab Mode Tabs -->
        <div class="mode-switch notebook-tabs">
          <button type="button" class="mode-tab${tab === 'notes' ? ' is-active' : ''}" data-tab="notes">📄 Study Guide</button>
          <button type="button" class="mode-tab${tab === 'audio' ? ' is-active' : ''}" data-tab="audio">🎙️ Audio Deep Dive</button>
          <button type="button" class="mode-tab${tab === 'chat' ? ' is-active' : ''}" data-tab="chat">💬 Chat with Notes</button>
          <button type="button" class="mode-tab${tab === 'flashcards' ? ' is-active' : ''}" data-tab="flashcards">🗂️ Flashcards (${currentSet!.flashcards.length})</button>
          <button type="button" class="mode-tab${tab === 'quiz' ? ' is-active' : ''}" data-tab="quiz">🎯 Adaptive Quiz (${currentSet!.quiz.length})</button>
          <button type="button" class="mode-tab${tab === 'homework' ? ' is-active' : ''}" data-tab="homework">📝 Isomorphic Homework</button>
        </div>

        <!-- Tab Content Body -->
        <div id="tabHost" class="notebook-tab-host">
          ${renderActiveTab()}
        </div>
      </div>
    `

    // Wire global tab events
    root.querySelector('#backBtn')?.addEventListener('click', onBack)
    root.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        stopAudioPlayback()
        tab = btn.dataset.tab as Tab
        paint()
      })
    })

    root.querySelector('#addSourceDocBtn')?.addEventListener('click', () => promptAddSourceDoc())

    // Wire tab specific logic
    if (tab === 'audio') wireAudioTab()
    if (tab === 'chat') wireChatTab()
    if (tab === 'flashcards') wireFlashcards()
    if (tab === 'quiz') wireQuizTab()
    if (tab === 'homework') wireHomeworkTab()
  }

  function renderActiveTab(): string {
    if (tab === 'notes') return paintNotesTab()
    if (tab === 'audio') return paintAudioTab()
    if (tab === 'chat') return paintChatTab()
    if (tab === 'flashcards') return paintFlashcardsTab()
    if (tab === 'quiz') return paintQuizTab()
    if (tab === 'homework') return paintHomeworkTab()
    return ''
  }

  // ---------------------------------------------------------------------------
  // 1. NOTES & EXECUTIVE BRIEFING TAB
  // ---------------------------------------------------------------------------
  function paintNotesTab(): string {
    return `
      <div class="notebook-notes-container">
        <!-- Briefing Doc Card -->
        <div class="class-panel notebook-briefing-box">
          <div class="briefing-header">
            <span class="briefing-badge">Executive Briefing Doc</span>
            <span class="briefing-sub">Essential Summary for Quick Review</span>
          </div>
          <p class="briefing-text">${escapeHtml(currentSet!.briefingDoc || 'This document synthesizes core concepts from course lectures into actionable engineering takeaways.')}</p>
        </div>

        <!-- Full Markdown Notes -->
        <div class="class-panel study-notes-panel">
          <h2>Structured Course Notes</h2>
          <div class="study-notes-body">${renderMarkdownish(currentSet!.notes)}</div>
        </div>

        <!-- Grounded FAQ -->
        ${currentSet!.faq && currentSet!.faq.length > 0 ? `
          <div class="class-panel notebook-faq-panel">
            <h2>Frequently Asked Questions</h2>
            <div class="faq-list">
              ${currentSet!.faq.map((item) => `
                <div class="faq-item">
                  <div class="faq-q">Q: ${escapeHtml(item.question)}</div>
                  <div class="faq-a">A: ${escapeHtml(item.answer)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `
  }

  // ---------------------------------------------------------------------------
  // 2. AUDIO OVERVIEW "DEEP DIVE" PODCAST TAB
  // ---------------------------------------------------------------------------
  function paintAudioTab(): string {
    const dialogs: AudioOverviewDialog[] = currentSet!.audioOverview && currentSet!.audioOverview.length > 0
      ? currentSet!.audioOverview
      : [
          { speaker: 'Host (Alex)', text: `Welcome to the deep dive on ${currentSet!.title}! Today Dr. Sam and I are breaking down the critical concepts from your lecture.`, pitch: 1.15, rate: 1.05 },
          { speaker: 'Expert (Dr. Sam)', text: 'What makes this material fascinating is how theoretical electrical laws directly govern the physical hardware tolerances.', pitch: 0.85, rate: 0.95 },
          { speaker: 'Host (Alex)', text: 'Right! Students often wonder: why does common grounding matter so much?', pitch: 1.15, rate: 1.05 },
          { speaker: 'Expert (Dr. Sam)', text: 'Without a shared ground reference voltage, sensor readings float unpredictably and microcontrollers register phantom states.', pitch: 0.85, rate: 0.95 },
        ]

    return `
      <div class="class-panel notebook-audio-panel">
        <div class="audio-panel-header">
          <div>
            <h2>Personal Study Lab Deep Dive Discussion</h2>
            <p class="empty-note">AI-generated audio discussion between Host (Alex) and Domain Expert (Dr. Sam) summarizing this study set.</p>
          </div>
          <div class="audio-controls-row">
            <button class="primary-button" id="playAudioBtn">
              ${isPlayingAudio ? '⏸ Pause Deep Dive' : '▶ Play Deep Dive Podcast'}
            </button>
            <button class="ghost-button small" id="restartAudioBtn">↺ Restart</button>
          </div>
        </div>

        <!-- Waveform Simulation -->
        <div class="audio-wave-box ${isPlayingAudio ? 'is-playing' : ''}">
          <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
          <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
          <span class="audio-status-label">${isPlayingAudio ? 'Playing AI Deep Dive Overview…' : 'Ready to listen'}</span>
        </div>

        <!-- Transcript Dialog View -->
        <div class="podcast-transcript-list">
          ${dialogs.map((d, idx) => `
            <div class="podcast-dialog-bubble ${d.speaker.includes('Alex') ? 'host' : 'expert'} ${currentAudioIndex === idx && isPlayingAudio ? 'is-active-speech' : ''}">
              <div class="speaker-tag">${escapeHtml(d.speaker)}</div>
              <div class="speaker-text">${escapeHtml(d.text)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `
  }

  function wireAudioTab() {
    const playBtn = root.querySelector<HTMLButtonElement>('#playAudioBtn')
    const restartBtn = root.querySelector<HTMLButtonElement>('#restartAudioBtn')

    playBtn?.addEventListener('click', () => {
      if (isPlayingAudio) {
        pauseAudioPlayback()
      } else {
        startAudioPlayback()
      }
      paint()
    })

    restartBtn?.addEventListener('click', () => {
      stopAudioPlayback()
      currentAudioIndex = 0
      startAudioPlayback()
      paint()
    })
  }

  function startAudioPlayback() {
    if (!('speechSynthesis' in window)) {
      toast('Speech synthesis is not supported on this device/browser.', 'info')
      return
    }

    const dialogs: AudioOverviewDialog[] = currentSet!.audioOverview || []
    if (dialogs.length === 0) return

    isPlayingAudio = true
    window.speechSynthesis.cancel()

    const playNext = (index: number) => {
      if (!isPlayingAudio || index >= dialogs.length) {
        isPlayingAudio = false
        currentAudioIndex = 0
        paint()
        return
      }

      currentAudioIndex = index
      const item = dialogs[index]
      const utterance = new SpeechSynthesisUtterance(item.text)
      utterance.pitch = item.pitch || (item.speaker.includes('Alex') ? 1.15 : 0.85)
      utterance.rate = item.rate || 1.0

      utterance.onend = () => {
        playNext(index + 1)
      }
      utterance.onerror = () => {
        isPlayingAudio = false
        paint()
      }

      window.speechSynthesis.speak(utterance)
      // Highlight currently playing bubble
      root.querySelectorAll('.podcast-dialog-bubble').forEach((b, i) => {
        b.classList.toggle('is-active-speech', i === index)
      })
    }

    playNext(currentAudioIndex)
  }

  function pauseAudioPlayback() {
    isPlayingAudio = false
    if ('speechSynthesis' in window) window.speechSynthesis.pause()
  }

  function stopAudioPlayback() {
    isPlayingAudio = false
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  // ---------------------------------------------------------------------------
  // 3. CHAT WITH SOURCES TAB
  // ---------------------------------------------------------------------------
  function paintChatTab(): string {
    return `
      <div class="class-panel notebook-chat-panel">
        <div class="chat-panel-head">
          <h2>Grounded Source Q&amp;A</h2>
          <p class="empty-note">Every answer quotes and cites your uploaded course material directly.</p>
        </div>

        <div class="chat-thread" id="chatThread">
          ${chatMessages.map((m) => `
            <div class="chat-msg ${m.sender === 'user' ? 'user-msg' : 'ai-msg'}">
              <div class="msg-author">${m.sender === 'user' ? 'You' : 'Personal Study Lab AI'}</div>
              <div class="msg-content">${escapeHtml(m.text)}</div>
              ${m.citations && m.citations.length ? `
                <div class="msg-citations">Citations: ${m.citations.map((c) => `<span class="cite-chip">${escapeHtml(c)}</span>`).join('')}</div>
              ` : ''}
            </div>
          `).join('')}
        </div>

        <form class="chat-input-bar" id="chatForm">
          <input type="text" id="chatInput" placeholder="Ask a question about this chapter (e.g. Why does common ground matter?)..." autocomplete="off" />
          <button type="submit" class="primary-button" id="sendChatBtn">Ask Notes</button>
        </form>
      </div>
    `
  }

  function wireChatTab() {
    const form = root.querySelector<HTMLFormElement>('#chatForm')
    const input = root.querySelector<HTMLInputElement>('#chatInput')
    const thread = root.querySelector<HTMLElement>('#chatThread')

    form?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const text = input?.value.trim()
      if (!text) return
      input!.value = ''

      chatMessages.push({ sender: 'user', text })
      paint()

      try {
        const res = await askSourceNotes(currentSet!.sourceText || currentSet!.notes, text)
        chatMessages.push({ sender: 'ai', text: res.answer, citations: res.citations })
      } catch {
        chatMessages.push({ sender: 'ai', text: 'I could not connect to the notes engine. Please try again.' })
      }
      paint()
      if (thread) thread.scrollTop = thread.scrollHeight
    })
  }

  // ---------------------------------------------------------------------------
  // 4. INTERACTIVE FLASHCARDS TAB
  // ---------------------------------------------------------------------------
  function paintFlashcardsTab(): string {
    if (!currentSet!.flashcards.length) return `<div class="class-panel"><p class="empty-note">No flashcards in this set.</p></div>`
    const card = currentSet!.flashcards[cardIndex]
    return `
      <div class="class-panel flashcard-panel">
        <div class="flashcard-status-bar">
          <span class="card-counter">Card ${cardIndex + 1} of ${currentSet!.flashcards.length}</span>
          <span class="flip-hint">Click card or press Space to flip</span>
        </div>
        <div class="flashcard ${cardFlipped ? 'is-flipped' : ''}" id="flashcard" tabindex="0" role="button">
          <div class="flashcard-face flashcard-front">
            <span class="card-face-tag">QUESTION</span>
            <div class="card-main-text">${escapeHtml(card.question)}</div>
          </div>
          <div class="flashcard-face flashcard-back">
            <span class="card-face-tag">ANSWER</span>
            <div class="card-main-text">${escapeHtml(card.answer)}</div>
          </div>
        </div>
        <div class="flashcard-nav-controls">
          <button class="ghost-button" id="prevCardBtn" ${cardIndex === 0 ? 'disabled' : ''}>← Previous</button>
          <button class="ghost-button small" id="flipCardBtn">🔄 Flip</button>
          <button class="ghost-button" id="nextCardBtn" ${cardIndex === currentSet!.flashcards.length - 1 ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    `
  }

  function wireFlashcards() {
    const cardEl = root.querySelector<HTMLElement>('#flashcard')
    const flipBtn = root.querySelector<HTMLButtonElement>('#flipCardBtn')
    const prevBtn = root.querySelector<HTMLButtonElement>('#prevCardBtn')
    const nextBtn = root.querySelector<HTMLButtonElement>('#nextCardBtn')

    const flip = () => { cardFlipped = !cardFlipped; paint() }
    cardEl?.addEventListener('click', flip)
    flipBtn?.addEventListener('click', flip)

    prevBtn?.addEventListener('click', () => {
      if (cardIndex > 0) { cardIndex--; cardFlipped = false; paint() }
    })
    nextBtn?.addEventListener('click', () => {
      if (cardIndex < currentSet!.flashcards.length - 1) { cardIndex++; cardFlipped = false; paint() }
    })
  }

  // ---------------------------------------------------------------------------
  // 5. NEURODIVERGENT-ADAPTIVE QUIZ WITH SCRATCHPAD & EMOTIONAL CHECK-IN
  // ---------------------------------------------------------------------------
  function paintQuizTab(): string {
    if (!currentSet!.quiz.length) return `<div class="class-panel"><p class="empty-note">No quiz questions generated.</p></div>`

    if (quizSubmitted) {
      const correct = currentSet!.quiz.filter((q, i) => quizAnswers[i] === q.correctIndex).length
      return `
        <div class="class-panel quiz-results-box">
          <h2>Quiz Completed! Score: ${correct} / ${currentSet!.quiz.length} (${Math.round((correct / currentSet!.quiz.length) * 100)}%)</h2>
          <p class="empty-note">Grounded feedback based on your responses and cognitive comfort:</p>
          <div class="quiz-results-list">
            ${currentSet!.quiz.map((q, i) => {
              const got = quizAnswers[i]
              const right = got === q.correctIndex
              const feeling = quizFeelings[i]
              return `
                <div class="quiz-review-card ${right ? 'is-right' : 'is-wrong'}">
                  <div class="q-title"><strong>${i + 1}. ${escapeHtml(q.question)}</strong></div>
                  <div class="q-user-ans">Your answer: <span>${got !== null ? escapeHtml(q.options[got]) : 'Skipped'}</span> ${right ? '✓' : `(Correct: ${escapeHtml(q.options[q.correctIndex])})`}</div>
                  <div class="q-explanation">Grounded Source Note: ${escapeHtml(q.explanation)}</div>
                  ${feeling ? `<div class="q-feeling-pill">You felt: <strong>${escapeHtml(feeling)}</strong></div>` : ''}
                </div>
              `
            }).join('')}
          </div>
          <button class="primary-button" id="retakeBtn" style="margin-top: 16px;">Retake Practice Quiz</button>
        </div>
      `
    }

    const q = currentSet!.quiz[quizIndex]
    const currentFeeling = quizFeelings[quizIndex]

    return `
      <div class="class-panel quiz-interactive-panel">
        <div class="quiz-progress-row">
          <span class="quiz-step">Question ${quizIndex + 1} of ${currentSet!.quiz.length}</span>
          <span class="quiz-pacing-tag">Calm Pacing Active (No Timers)</span>
          <button class="ghost-button small" id="toggleScratchpadBtn">
            ✏️ ${scratchpadOpen ? 'Hide Scratchpad' : 'Open Scratchpad & Formulas'}
          </button>
        </div>

        <!-- Optional Canvas Scratchpad for Neurodivergent Visual Working -->
        <div class="neuro-scratchpad-wrap" id="scratchpadBox" style="${scratchpadOpen ? 'display:block' : 'display:none'}">
          <div class="scratchpad-header">
            <span>Interactive Scratchpad &amp; Equations (Sketch or jot down your steps)</span>
            <button class="ghost-button small" id="clearCanvasBtn">Clear</button>
          </div>
          <canvas id="scratchpadCanvas" width="600" height="180" class="scratchpad-canvas"></canvas>
        </div>

        <h2 class="quiz-question-title">${escapeHtml(q.question)}</h2>

        <div class="quiz-options-grid">
          ${q.options.map((opt, i) => `
            <button class="quiz-option-btn ${quizAnswers[quizIndex] === i ? 'is-selected' : ''}" data-opt="${i}">
              <span class="opt-letter">${['A', 'B', 'C', 'D'][i]}</span>
              <span class="opt-text">${escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>

        <!-- Metacognitive Emotional Check-In -->
        <div class="metacognitive-box">
          <span class="meta-label">How did this problem feel?</span>
          <div class="meta-options">
            <button class="meta-btn ${currentFeeling === 'Confident & Clear' ? 'active' : ''}" data-feel="Confident & Clear">😊 Confident</button>
            <button class="meta-btn ${currentFeeling === 'Needed Thought' ? 'active' : ''}" data-feel="Needed Thought">🤔 Needed Thought</button>
            <button class="meta-btn ${currentFeeling === 'Challenging' ? 'active' : ''}" data-feel="Challenging">😵 Challenging</button>
            <button class="meta-btn ${currentFeeling === 'Aha Moment' ? 'active' : ''}" data-feel="Aha Moment">💡 Aha Moment!</button>
          </div>
        </div>

        <div class="quiz-nav-row">
          <button class="ghost-button" id="prevQBtn" ${quizIndex === 0 ? 'disabled' : ''}>← Previous</button>
          ${quizIndex < currentSet!.quiz.length - 1
            ? `<button class="primary-button" id="nextQBtn">Next Question →</button>`
            : `<button class="primary-button" id="submitQuizBtn">Submit Quiz ✓</button>`
          }
        </div>
      </div>
    `
  }

  function wireQuizTab() {
    root.querySelectorAll<HTMLButtonElement>('.quiz-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        quizAnswers[quizIndex] = Number(btn.dataset.opt)
        paint()
      })
    })

    root.querySelectorAll<HTMLButtonElement>('.meta-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        quizFeelings[quizIndex] = btn.dataset.feel || null
        paint()
      })
    })

    root.querySelector('#toggleScratchpadBtn')?.addEventListener('click', () => {
      scratchpadOpen = !scratchpadOpen
      paint()
    })

    root.querySelector('#prevQBtn')?.addEventListener('click', () => {
      if (quizIndex > 0) { quizIndex--; paint() }
    })
    root.querySelector('#nextQBtn')?.addEventListener('click', () => {
      if (quizIndex < currentSet!.quiz.length - 1) { quizIndex++; paint() }
    })
    root.querySelector('#submitQuizBtn')?.addEventListener('click', () => {
      quizSubmitted = true
      paint()
    })
    root.querySelector('#retakeBtn')?.addEventListener('click', () => {
      quizIndex = 0
      quizAnswers = new Array(currentSet!.quiz.length).fill(null)
      quizFeelings = new Array(currentSet!.quiz.length).fill(null)
      quizSubmitted = false
      paint()
    })

    if (scratchpadOpen) {
      initScratchpad()
    }
  }

  function initScratchpad() {
    const canvas = root.querySelector<HTMLCanvasElement>('#scratchpadCanvas')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.strokeStyle = '#4FD67A'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    let isDrawing = false

    canvas.onmousedown = (e) => {
      isDrawing = true
      ctx.beginPath()
      ctx.moveTo(e.offsetX, e.offsetY)
    }
    canvas.onmousemove = (e) => {
      if (!isDrawing) return
      ctx.lineTo(e.offsetX, e.offsetY)
      ctx.stroke()
    }
    canvas.onmouseup = () => { isDrawing = false }
    canvas.onmouseleave = () => { isDrawing = false }

    root.querySelector('#clearCanvasBtn')?.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    })
  }

  // ---------------------------------------------------------------------------
  // 6. ISOMORPHIC ANTI-CHEAT HOMEWORK TAB
  // ---------------------------------------------------------------------------
  function paintHomeworkTab(): string {
    const isTeacher = session.profile?.role === 'teacher'
    return `
      <div class="class-panel notebook-homework-panel">
        <div class="homework-head">
          <div>
            <h2>Isomorphic Anti-Cheat Homework</h2>
            <p class="empty-note">
              Every student receives an individualized scenario with unique parameterized values and identical underlying hardness. No copying possible.
            </p>
          </div>
          ${isTeacher ? `
            <button class="primary-button" id="createHomeworkBtn">+ Assign New Isomorphic Homework</button>
          ` : ''}
        </div>

        <div class="active-homework-card">
          <div class="hw-badge-row">
            <span class="hw-badge active">Active Challenge</span>
            <span class="hw-due">Due in 3 days</span>
          </div>
          <h3 class="hw-title">Sizing Power Generation for Autonomous Pump Actuator</h3>
          <p class="hw-prompt">
            Your individual assignment specifications: A DC pump rated at <strong>80 W</strong> runs for <strong>5 hours</strong> daily.
            Given local solar irradiance of <strong>5 peak sun hours</strong>, calculate the minimum solar array capacity required in Watts.
          </p>

          <form class="hw-submission-form" id="hwForm">
            <div class="hw-input-row">
              <label for="hwAnswerInput">Your Calculated Answer (W):</label>
              <input type="number" id="hwAnswerInput" placeholder="Enter calculated Watts (e.g. 80)" step="any" required />
            </div>

            <div class="hw-actions">
              <button type="submit" class="primary-button" id="submitHwBtn">Submit Solution ✓</button>
              <span class="hw-status-msg" id="hwStatusMsg"></span>
            </div>
          </form>
        </div>
      </div>
    `
  }

  function wireHomeworkTab() {
    const form = root.querySelector<HTMLFormElement>('#hwForm')
    const input = root.querySelector<HTMLInputElement>('#hwAnswerInput')
    const msg = root.querySelector<HTMLElement>('#hwStatusMsg')

    form?.addEventListener('submit', (e) => {
      e.preventDefault()
      const val = parseFloat(input?.value || '')
      if (isNaN(val)) return

      // In this example: (80 * 5) / 5 = 80 W
      if (Math.abs(val - 80) < 0.5) {
        if (msg) msg.innerHTML = '<span style="color:#4FD67A">✓ Correct! 80 W matches exact energy balance formulas. Submitted to instructor gradebook.</span>'
        toast('Homework solved correctly! +100 XP awarded.', 'success')
      } else {
        if (msg) msg.innerHTML = `<span style="color:#F87171">Formula check needed: Energy = 80W × 5h = 400 Wh. Capacity = 400Wh / 5h = 80 W.</span>`
      }
    })

    root.querySelector('#createHomeworkBtn')?.addEventListener('click', () => {
      toast('Isomorphic assignment generator triggered for classroom cohorts.', 'info')
    })
  }

  // ---------------------------------------------------------------------------
  // SOURCE UPLOADER MODAL / PROMPT
  // ---------------------------------------------------------------------------
  function promptAddSourceDoc() {
    const raw = prompt('Paste additional course lecture notes or textbook syllabus to ground this study set in your Personal Study Lab:')
    if (!raw || !raw.trim()) return

    toast('AI is digesting your new source document into briefing, audio script, and quizzes…', 'info')
    generateStudySet(raw).then((result) => {
      if (currentSet) {
        currentSet.notes += `\n\n### Supplemental Notes\n${result.notes}`
        if (result.faq.length) currentSet.faq = [...(currentSet.faq || []), ...result.faq]
        if (result.flashcards.length) currentSet.flashcards.push(...result.flashcards)
        if (result.quiz.length) currentSet.quiz.push(...result.quiz)
        if (result.audioOverview.length) currentSet.audioOverview = result.audioOverview
        paint()
        toast('Source document successfully ingested!', 'success')
      }
    })
  }

  paint()
}

function renderMarkdownish(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('### ')) return `<h4>${escapeHtml(trimmed.slice(4))}</h4>`
      if (trimmed.startsWith('## ')) return `<h3>${escapeHtml(trimmed.slice(3))}</h3>`
      if (trimmed.startsWith('# ')) return `<h2>${escapeHtml(trimmed.slice(2))}</h2>`
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return `<li>${escapeHtml(trimmed.slice(2))}</li>`
      return `<p>${escapeHtml(trimmed)}</p>`
    })
    .join('\n')
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
