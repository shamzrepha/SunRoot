# 🧠 CogniTwin AI
### Cognitive Digital Twin LMS & Bayesian Knowledge Tracing Engine

**CogniTwin** is an AI-first learning platform that moves beyond superficial exam percentages to model the student's *actual cognitive learning process* using **Bayesian Knowledge Tracing (BKT)**, **NotebookLM-style grounded document synthesis**, and **hands-on gamified simulation workbenches**.

---

## 🚀 Key Features

### 1. Bayesian Knowledge Tracing (BKT) Cognitive Engine
- **Mathematical Latent Modeling**: Uses Hidden Markov Models to estimate the posterior belief of mastery $P(L_t)$ based on prior knowledge $P(L_0)$, learning transition rate $P(T)$, guess probability $P(G)$, and slip probability $P(S)$.
- **Process Over Raw Scores**: Forgives accidental slips and separates lucky guesses from real conceptual understanding.
- **Dynamic Mastery Threshold**: Concepts are classified into Cognitive Tiers: *Novice*, *Developing*, *Proficient*, and *Mastered* ($\ge 85\%$).
- **Adaptive Prerequisite Routing**: Automatically calculates the next best learning step based on prerequisite DAG completion.

### 2. Digital Twin Gamified Electronics Workbench
- **Interactive Breadboard Simulation**: Real-time DC circuit simulator with selectable power rails (3V, 5V, 9V, 12V), customizable series resistors (color code band generator), LEDs (Red, Green, Blue with standard diode forward drops), and switches.
- **Realistic Physical Solver**:
  - Live Ohm's Law $V = I \times R$ calculations.
  - Animated electron current flow proportional to amperage.
  - Multimeter telemetry (Loop Current, Resistor Drop, Diode Drop, Power Dissipation).
  - **Burnout Physics**: If current exceeds 30 mA, the LED bursts with thermal overload feedback!
- **Mission Challenge Mode**: Challenges (e.g. *Protect the LED from a 9V Battery*) feed empirical evidence directly into the student's BKT cognitive profile.

### 3. NotebookLM Study Studio
- **Grounded Document Ingestion**: Upload lecture notes and lab manuals (PDF/text); the AI chunks content and auto-extracts Knowledge Components (KCs).
- **Interactive Concept DAG Mindmap**: Visual dependency graph displaying prerequisite links and live student mastery levels.
- **Spaced-Repetition Flashcards**: Flip cards integrated with SuperMemo SM-2 interval algorithms and BKT feedback loops.
- **Grounded Socratic Assistant**: AI study tutor strictly citing uploaded class materials with inline chapter/section quotes.

### 4. Classroom Twin & Teacher Command
- **Public & Private Classes**: Shareable 6-digit class join codes (e.g., `OHM-402`).
- **Classroom Cognitive Heatmap**: Student $\times$ Knowledge Component matrix showing live $P(L_t)$ probabilities across the entire class.
- **AI Misconception & Struggle Detection**: Flags elevated slip rates and suggests targeted interventions.

### 5. Peer Study Lounges ("Rooms")
- **Social Digital Twin**: Any learner can spin up an ad-hoc virtual study room (e.g., `LOU-882`) and invite friends.
- **Synchronous Collaboration**: Live member presence, collaborative whiteboard notes, and shared study materials.

### 6. Full Gamification
- Daily streaks with streak freeze shields.
- Brain XP, Level Progression, and Mastery Badges.
- Dynamic Class Leaderboard and Global Leaderboard.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Celebrations**: Canvas Confetti
- **State & Cognitive Core**: React Context, LocalStorage persistence, custom mathematical BKT engine

---

## 🏃 Getting Started

### 1. Set as Active Workspace
Open `C:\Users\shamz\.gemini\antigravity\scratch\cognitwin` in your editor.

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Switch Roles
Use the top-right role switcher to toggle between:
- 🎓 **Leo Chen** (Student - High School class member)
- 👩‍🏫 **Dr. Elena Vance** (Teacher - Class creator & curriculum manager)
- 🐺 **Kai Takahashi** (Individual Learner - Independent self-directed scholar)
