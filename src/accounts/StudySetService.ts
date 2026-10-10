import { collection, doc, addDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { StudySet } from './types'

const LOCAL_SETS_KEY = 'sunroot:study_sets:local'

const DEFAULT_DEMO_STUDY_SET: StudySet = {
  id: 'set_demo_agritech_01',
  classroomId: 'demo_classroom',
  teacherId: 'teacher_evelyn',
  teacherName: 'Dr. Evelyn Reed',
  title: 'Cyber-Physical Systems & Agritech Engineering (Unit 1)',
  sourceText: `Cyber-Physical Systems (CPS) bridge digital computing logic with physical mechanical processes.
In agricultural automation, sensors monitor soil moisture and solar irradiance.
A breadboard circuit coordinates logic levels (3.3V / 5V) and ensures common grounding between microcontrollers and high-draw water pumps.
Blockly state machines execute hysteresis loops (e.g. Turn pump ON when soil moisture < 28%, Turn pump OFF when soil moisture > 65%) to prevent actuator chatter and avoid damaging hydraulic motors.
Photovoltaic arrays supply DC energy to battery storage banks. Solar generation fluctuates based on diurnal solar irradiance curves and weather.
Energy budgeting ensures daily generation (W·h) exceeds pump consumption and sensor quiescent drain to maintain 24-hour uninterrupted operation.`,
  briefingDoc: 'Executive Overview: Unit 1 establishes the three pillars of cyber-physical engineering: energy equilibrium under solar diurnal cycles, analog telemetry calibration with common grounding, and dual-threshold hysteresis control to suppress actuator chatter.',
  faq: [
    {
      question: 'Why is common grounding critical between sensors and the pump?',
      answer: 'Without a shared ground reference, the analog voltage readings from capacitive soil sensors float unpredictably, triggering erroneous pump activations and false telemetry signals.',
    },
    {
      question: 'How does dual-threshold hysteresis protect hardware?',
      answer: 'A single threshold causes rapid on-off cycling (actuator chatter) whenever soil moisture hovers near the trigger boundary. Hysteresis establishes separate ON and OFF thresholds (e.g. ON < 28%, OFF > 65%), ensuring the pump runs in stable, deliberate cycles.',
    },
    {
      question: 'What is energy budget equilibrium?',
      answer: 'Energy budgeting balances diurnal solar generation against continuous quiescent draw and intermittent pump loads. Peak sunlight hours must replenish battery banks sufficiently to survive 12+ hours of nocturnal operation.',
    },
  ],
  audioOverview: [
    {
      speaker: 'Host (Alex)',
      text: "Welcome to today's Deep Dive on SunRoot cyber-physical systems! Sam, we're looking at Unit 1—why is wiring a micro-farm so much more than just sticking sensors into dirt?",
    },
    {
      speaker: 'Expert (Dr. Sam)',
      text: "Because in the real physical world, electrons and water don't negotiate! If your ground wire is loose, your ADC readings fluctuate randomly. And if your control code doesn't use hysteresis, your pump chatters itself to death in ten minutes.",
    },
    {
      speaker: 'Host (Alex)',
      text: "That chatter problem is fascinating. Students often just write 'if soil moisture is less than 30, pump on; else off'. Why does that cause mechanical failure?",
    },
    {
      speaker: 'Expert (Dr. Sam)',
      text: "Because as soon as the water hits the soil, moisture jumps to 30.1% and turns the pump off. Seconds later it seeps in, drops to 29.9%, and kicks the pump back on. That rapid oscillation draws massive inrush current and destroys relays. Dual thresholds give the system breathing room.",
    },
    {
      speaker: 'Host (Alex)',
      text: "And what about the energy balance? How do solar panels factor into this closed loop?",
    },
    {
      speaker: 'Expert (Dr. Sam)',
      text: "You only get peak solar irradiance for 4 to 6 hours a day. Your solar panel must harvest enough surplus Watt-hours during daylight to both irrigate the crops AND charge the battery for overnight survival. That's true engineering equilibrium.",
    },
  ],
  notes: `# Cyber-Physical Systems & Agritech Engineering

## 1. Fundamentals of Cyber-Physical Architecture
Cyber-Physical Systems (**CPS**) integrate algorithmic computational processes with physical actuators and sensors.
- **Computation**: Microcontroller state machines, hysteresis logic, telemetry processing.
- **Physical Dynamics**: Soil moisture diffusion, diurnal solar radiation, hydraulic fluid flow.

## 2. Electrical Wiring & Ground Integrity
- **Logic Level Matching**: Bridging 3.3V microcontroller logic with 5V sensor outputs requires voltage divider resistors or logic-level converters.
- **Common Grounding**: All components must share a 0V ground reference wire. Floating grounds induce 50/60Hz electromagnetic noise and corrupted ADC measurements.
- **Drive Stages**: Microcontroller GPIO pins can only deliver ~20mA. Inductive loads like DC water pumps must be switched via NPN transistors or MOSFET gates with flyback diodes.

## 3. Algorithmic Control & Hysteresis
To avoid damaging mechanical pumps:
$$\\text{State} = \\begin{cases} \\text{ON} & \\text{if } \\text{Moisture} < 28\\% \\\\ \\text{OFF} & \\text{if } \\text{Moisture} > 65\\% \\\\ \\text{HOLD} & \\text{otherwise} \\end{cases}$$
This suppresses high-frequency relay switching (*chatter*).

## 4. Renewable Photovoltaic Budgeting
- Daily energy generated: $E_{\\text{gen}} = P_{\\text{panel}} \\times T_{\\text{peak\\_sun}}$
- Daily consumption: $E_{\\text{load}} = (P_{\\text{sensor}} \\times 24) + (P_{\\text{pump}} \\times T_{\\text{pump}})$
- Safe operation requires: $E_{\\text{gen}} \\ge 1.25 \\times E_{\\text{load}}$`,
  flashcards: [
    {
      question: 'What is the primary function of a common ground connection in a circuit?',
      answer: 'To establish a shared 0V reference potential across all components, preventing floating voltages and signal noise.',
    },
    {
      question: 'Why is dual-threshold hysteresis preferred over single-point thresholding for pump control?',
      answer: 'It creates a deadband that prevents rapid on/off switching (actuator chatter) near the target threshold, saving motor life and reducing electrical strain.',
    },
    {
      question: 'Why can a water pump NOT be driven directly from a microcontroller GPIO pin?',
      answer: 'GPIO pins are limited to ~20mA, while pumps require 500mA–2000mA. An external transistor/MOSFET driver stage is required to switch high current safely.',
    },
    {
      question: 'How do you calculate the required daily solar energy reserve?',
      answer: 'Total Watt-hours = (Continuous sensor power × 24h) + (Pump power × Run hours), scaled by a safety factor (typically 1.25× to 1.3×).',
    },
  ],
  quiz: [
    {
      question: 'A soil moisture sensor reads erratically between 10% and 90% every few milliseconds. What is the most likely circuit cause?',
      options: [
        'The microcontroller clock frequency is too low',
        'Missing common ground connection between sensor and board',
        'The solar panel is overproducing current',
        'The water pump is running backwards',
      ],
      correctIndex: 1,
      explanation: 'Without a shared ground wire, the analog pin reference voltage floats freely, picking up ambient electromagnetic noise.',
    },
    {
      question: 'In a closed-loop irrigation system, setting ON threshold to 30% and OFF threshold to 30.5% causes what issue?',
      options: [
        'Severe actuator chatter due to an overly narrow hysteresis deadband',
        'The battery immediately overcharges',
        'The microcontroller resets from memory overflow',
        'Soil moisture will permanently freeze at 30%',
      ],
      correctIndex: 0,
      explanation: 'A 0.5% deadband is far too narrow; water diffusion ripples will immediately cause the pump to rapidly toggle on and off.',
    },
    {
      question: 'A sensor node draws 5W continuously (24h/day). Peak sun hours are 5 hours/day. Neglecting losses, what is the minimum solar panel Wattage?',
      options: ['5 Watts', '24 Watts', '120 Watts', '12 Watts'],
      correctIndex: 1,
      explanation: 'Daily energy = 5W × 24h = 120 Watt-hours. In 5 peak sun hours: 120 W·h / 5h = 24 Watts minimum.',
    },
  ],
  createdAt: Date.now() - 3600000,
}

function getLocalSets(): StudySet[] {
  try {
    const raw = localStorage.getItem(LOCAL_SETS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    return [DEFAULT_DEMO_STUDY_SET]
  } catch {
    return [DEFAULT_DEMO_STUDY_SET]
  }
}

function saveLocalSets(sets: StudySet[]) {
  try {
    localStorage.setItem(LOCAL_SETS_KEY, JSON.stringify(sets.slice(0, 50)))
  } catch {}
}

export async function createStudySet(params: {
  classroomId: string
  teacherId: string
  teacherName: string
  title: string
  sourceText: string
  sources?: StudySet['sources']
  notes: string
  briefingDoc?: string
  faq?: StudySet['faq']
  audioOverview?: StudySet['audioOverview']
  flashcards: StudySet['flashcards']
  quiz: StudySet['quiz']
}): Promise<string> {
  const localSet: StudySet = {
    id: `set_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...params,
    createdAt: Date.now(),
  }

  const locals = getLocalSets()
  locals.unshift(localSet)
  saveLocalSets(locals)

  try {
    const ref = await addDoc(collection(db, 'studySets'), {
      ...params,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch {
    return localSet.id
  }
}

export async function listStudySetsForClassroom(classroomId: string): Promise<StudySet[]> {
  const locals = getLocalSets().filter((s) => s.classroomId === classroomId)
  try {
    const snap = await getDocs(query(collection(db, 'studySets'), where('classroomId', '==', classroomId)))
    const remote = snap.docs
      .map((d) => {
        const data = d.data()
        return {
          id: d.id,
          ...(data as Omit<StudySet, 'id' | 'createdAt'>),
          createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        }
      })
    const map = new Map<string, StudySet>()
    locals.forEach((s) => map.set(s.id, s))
    remote.forEach((s) => map.set(s.id, s))
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return locals
  }
}

export async function getStudySet(id: string): Promise<StudySet | null> {
  const locals = getLocalSets()
  const localFound = locals.find((s) => s.id === id)

  try {
    const snap = await getDoc(doc(db, 'studySets', id))
    if (!snap.exists()) return localFound || null
    const data = snap.data()
    return {
      id: snap.id,
      ...(data as Omit<StudySet, 'id' | 'createdAt'>),
      createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    }
  } catch {
    return localFound || null
  }
}

export async function deleteStudySet(id: string): Promise<void> {
  const locals = getLocalSets().filter((s) => s.id !== id)
  saveLocalSets(locals)
  try {
    await deleteDoc(doc(db, 'studySets', id))
  } catch {}
}
