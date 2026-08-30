import { getStudySet } from '../accounts/StudySetService'
import type { StudySet } from '../accounts/types'

let preselectedId: string | null = null

/** Call before navigating to the study set viewer to open a specific set. */
export function openStudySet(id: string) {
  preselectedId = id
}

type Tab = 'notes' | 'flashcards' | 'quiz'

export async function renderStudySetViewer(root: HTMLElement, onBack: () => void) {
  const id = preselectedId
  preselectedId = null
  if (!id) {
    root.innerHTML = `<div class="screen"><p class="empty-note">No study set selected.</p></div>`
    return
  }

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading\u2026</p></div>`
  const set = await getStudySet(id)
  if (!set) {
    root.innerHTML = `<div class="screen"><p class="empty-note">That study set couldn\u2019t be found.</p></div>`
    return
  }

  let tab: Tab = 'notes'
  let cardIndex = 0
  let cardFlipped = false
  let quizIndex = 0
  let quizAnswers: (number | null)[] = new Array(set.quiz.length).fill(null)
  let quizSubmitted = false

  function paint() {
    root.innerHTML = `
      <div class="screen">
        <button class="ghost-button small" id="backBtn">\u2190 Back to class</button>
        <div class="lab-header">
          <div><h1>${escapeHtml(set!.title)}</h1><p>by ${escapeHtml(set!.teacherName)}</p></div>
        </div>
        <div class="mode-switch">
          <button type="button" class="mode-tab${tab === 'notes' ? ' is-active' : ''}" data-tab="notes">Notes</button>
          <button type="button" class="mode-tab${tab === 'flashcards' ? ' is-active' : ''}" data-tab="flashcards">Flashcards (${set!.flashcards.length})</button>
          <button type="button" class="mode-tab${tab === 'quiz' ? ' is-active' : ''}" data-tab="quiz">Quiz (${set!.quiz.length})</button>
        </div>
        <div id="tabHost">${tab === 'notes' ? paintNotes(set!) : tab === 'flashcards' ? paintFlashcards(set!) : paintQuiz(set!)}</div>
      </div>
    `

    root.querySelector('#backBtn')?.addEventListener('click', onBack)
    root.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab as Tab
        paint()
      })
    })

    if (tab === 'flashcards') wireFlashcards(set!)
    if (tab === 'quiz') wireQuiz(set!)
  }

  function paintNotes(set: StudySet): string {
    return `<div class="class-panel study-notes">${renderMarkdownish(set.notes)}</div>`
  }

  function paintFlashcards(set: StudySet): string {
    if (!set.flashcards.length) return `<div class="class-panel"><p class="empty-note">No flashcards in this set.</p></div>`
    const card = set.flashcards[cardIndex]
    return `
      <div class="class-panel flashcard-panel">
        <p class="empty-note">Card ${cardIndex + 1} of ${set.flashcards.length}</p>
        <div class="flashcard ${cardFlipped ? 'is-flipped' : ''}" id="flashcard">
          <div class="flashcard-face flashcard-front">${escapeHtml(card.question)}</div>
          <div class="flashcard-face flashcard-back">${escapeHtml(card.answer)}</div>
        </div>
        <p class="empty-note" style="text-align:center">Click the card to flip it</p>
        <div class="inline-form" style="justify-content:center">
          <button class="ghost-button small" id="prevCardBtn" ${cardIndex === 0 ? 'disabled' : ''}>\u2190 Previous</button>
          <button class="ghost-button small" id="nextCardBtn" ${cardIndex === set.flashcards.length - 1 ? 'disabled' : ''}>Next \u2192</button>
        </div>
      </div>
    `
  }

  function paintQuiz(set: StudySet): string {
    if (!set.quiz.length) return `<div class="class-panel"><p class="empty-note">No quiz questions in this set.</p></div>`

    if (quizSubmitted) {
      const correct = set.quiz.filter((q, i) => quizAnswers[i] === q.correctIndex).length
      return `
        <div class="class-panel">
          <h2>Results: ${correct} / ${set.quiz.length}</h2>
          ${set.quiz
            .map((q, i) => {
              const got = quizAnswers[i]
              const right = got === q.correctIndex
              return `<div class="quiz-review ${right ? 'is-right' : 'is-wrong'}">
                <p><strong>${escapeHtml(q.question)}</strong></p>
                <p class="empty-note">Your answer: ${got !== null ? escapeHtml(q.options[got]) : 'Skipped'} ${right ? '\u2713' : `\u2014 correct: ${escapeHtml(q.options[q.correctIndex])}`}</p>
                <p class="empty-note">${escapeHtml(q.explanation)}</p>
              </div>`
            })
            .join('')}
          <button class="primary-button" id="retakeBtn">Retake quiz</button>
        </div>
      `
    }

    const q = set.quiz[quizIndex]
    return `
      <div class="class-panel">
        <p class="empty-note">Question ${quizIndex + 1} of ${set.quiz.length}</p>
        <h2>${escapeHtml(q.question)}</h2>
        <div class="quiz-options">
          ${q.options
            .map(
              (opt, i) => `<button class="quiz-option ${quizAnswers[quizIndex] === i ? 'is-selected' : ''}" data-opt="${i}">${escapeHtml(opt)}</button>`,
            )
            .join('')}
        </div>
        <div class="inline-form">
          <button class="ghost-button small" id="prevQBtn" ${quizIndex === 0 ? 'disabled' : ''}>\u2190 Previous</button>
          ${
            quizIndex === set.quiz.length - 1
              ? `<button class="primary-button small" id="submitQuizBtn">Submit quiz</button>`
              : `<button class="ghost-button small" id="nextQBtn">Next \u2192</button>`
          }
        </div>
      </div>
    `
  }

  function wireFlashcards(set: StudySet) {
    root.querySelector('#flashcard')?.addEventListener('click', () => {
      cardFlipped = !cardFlipped
      paint()
    })
    root.querySelector('#prevCardBtn')?.addEventListener('click', () => {
      if (cardIndex > 0) { cardIndex--; cardFlipped = false; paint() }
    })
    root.querySelector('#nextCardBtn')?.addEventListener('click', () => {
      if (cardIndex < set.flashcards.length - 1) { cardIndex++; cardFlipped = false; paint() }
    })
  }

  function wireQuiz(set: StudySet) {
    root.querySelectorAll<HTMLButtonElement>('.quiz-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        quizAnswers[quizIndex] = Number(btn.dataset.opt)
        paint()
      })
    })
    root.querySelector('#prevQBtn')?.addEventListener('click', () => { quizIndex--; paint() })
    root.querySelector('#nextQBtn')?.addEventListener('click', () => { quizIndex++; paint() })
    root.querySelector('#submitQuizBtn')?.addEventListener('click', () => { quizSubmitted = true; paint() })
    root.querySelector('#retakeBtn')?.addEventListener('click', () => {
      quizIndex = 0
      quizAnswers = new Array(set.quiz.length).fill(null)
      quizSubmitted = false
      paint()
    })
  }

  paint()
}

/** Minimal, safe markdown-ish rendering — headings and bullets only, everything else escaped and left as plain paragraphs. */
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
