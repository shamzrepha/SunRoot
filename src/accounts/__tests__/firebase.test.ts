import { afterEach, describe, expect, it, vi } from 'vitest'

describe('firebase config resilience', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('initializes safely without throwing or mutating document.body when env vars are unset', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')
    vi.resetModules()

    document.body.innerHTML = '<div id="app">ready</div>'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fb = await import('../firebase')
    expect(fb.isFirebaseConfigured()).toBe(false)
    expect(fb.auth).toBeDefined()
    expect(fb.db).toBeDefined()
    expect(document.body.innerHTML).toBe('<div id="app">ready</div>')

    warnSpy.mockRestore()
  })

  it('reports configured=true when required VITE_FIREBASE_* env vars are present', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'AIzaSyFakeDemoKeyForUnitTest')
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'sunroot-test.firebaseapp.com')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'sunroot-test')
    vi.resetModules()

    const fb = await import('../firebase')
    expect(fb.isFirebaseConfigured()).toBe(true)
    expect(fb.app.options.projectId).toBe('sunroot-test')
    expect(fb.auth).toBeDefined()
    expect(fb.db).toBeDefined()
  })

  it('short-circuits all ClassroomService async functions in < 50ms without Firestore RPCs when unconfigured', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')
    vi.resetModules()
    localStorage.clear()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cs = await import('../ClassroomService')
    const start = performance.now()

    await cs.ensureDemoClassroomExists()
    const personal = await cs.createPersonalClassroom({
      userId: 'u1',
      userName: 'Student',
      name: 'Personal Solar Lab',
    })
    expect(personal.id).toContain('local-personal-')

    const createdId = await cs.createClassroom({
      teacherId: 't1',
      teacherName: 'Teacher',
      name: 'Class 1',
      topic: 'Solar & Irrigation Systems',
      visibility: 'public',
    })
    expect(createdId).toContain('local-class-')

    const userClasses = await cs.listClassroomsForUser({
      uid: 'u1',
      email: 'u1@test.local',
      displayName: 'Student',
      role: 'student',
      createdAt: 0,
      learningStyle: {
        visual: 0.25,
        auditory: 0.25,
        kinesthetic: 0.25,
        readingWriting: 0.25,
        lastUpdated: 0,
      },
    })
    expect(userClasses.some((c) => c.id === cs.DEMO_CLASSROOM_ID)).toBe(true)
    expect(await cs.getClassroom(cs.DEMO_CLASSROOM_ID)).not.toBeNull()
    expect(await cs.listPublicClassrooms()).toHaveLength(1)

    await cs.joinPublicClassroom('c1', 'u1')
    await cs.leaveClassroom('c1', 'u1')
    await cs.removeStudent('c1', 'u1')
    expect(await cs.findStudentByTag('SR-1234')).toBeNull()
    expect(await cs.fetchUsersByIds(['u1', 'u2'])).toEqual([])
    expect(
      await cs.inviteStudentByTag({
        classroomId: 'c1',
        classroomName: 'Class 1',
        teacherId: 't1',
        tag: 'SR-1234',
      }),
    ).toBe('not_found')
    expect(await cs.listPendingInvites('u1')).toEqual([])
    await cs.respondToInvite('inv1', true, 'u1', 'c1')
    await cs.deleteClassroom(createdId, 't1')
    await cs.submitClassSuggestion({
      teacherId: 't1',
      teacherName: 'Teacher',
      title: 'Wind',
      description: 'Turbine lab',
    })
    expect(await cs.listClassSuggestions()).toEqual([])
    await cs.markSuggestionReviewed('sug1')
    const resetRes = await cs.resetDatabaseToSingleClassroom()
    expect(resetRes.message).toContain('canonical class')

    const elapsedMs = performance.now() - start
    expect(elapsedMs).toBeLessThan(50)

    const allErrorOutput = errSpy.mock.calls.flat().join(' ')
    expect(allErrorOutput).not.toContain('PERMISSION_DENIED')

    warnSpy.mockRestore()
    errSpy.mockRestore()
  })
})
