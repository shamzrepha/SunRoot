export type Screen =
  | 'login'
  | 'dashboard'
  | 'classes'
  | 'findClass'
  | 'admin'
  | 'profile'
  | 'leaderboard'
  | 'messages'
  | 'workshopHub'
  | 'studySetViewer'
  | 'loading'
  | 'intro'
  | 'shed'
  | 'circuit'
  | 'coding'
  | 'farm'
  | 'tutor'
  | 'report'
  | 'learning'
  | 'teacher'
  | 'access'
  | 'quiz'
  | 'rewards'

export interface AppState {
  screen: Screen
  codeReady: boolean
  // Compiled from the Blockly workspace. Called once per simulation tick
  // with the current soil moisture and a setPump callback.
  runProgram: ((soilMoisture: number, setPump: (on: boolean) => void) => void) | null
}

export const appState: AppState = {
  screen: 'loading',
  codeReady: false,
  runProgram: null,
}

