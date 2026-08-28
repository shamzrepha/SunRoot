import React from 'react';
import CreateClass from '../components/CreateClass';
import RecommendationsForm from '../components/RecommendationsForm';

export default function TeacherDashboard() {
  // In your app, pass real user/teacher props
  const teacherId = 'TODO_TEACHER_UID';
  const teacherName = 'TODO_TEACHER_NAME';

  function onCreated(cls: any) {
    // Insert into local UI state or refresh list
    console.log('class created', cls);
  }

  return (
    <div>
      <h2>Teacher Dashboard</h2>
      <section>
        <h3>Create Class</h3>
        <CreateClass teacherId={teacherId} teacherName={teacherName} onCreated={onCreated} />
      </section>
      <section>
        <RecommendationsForm teacherId={teacherId} teacherName={teacherName} />
      </section>
      <section>
        <h3>Your classes</h3>
        <div>Class list UI goes here (only classes you own + admin classes visible).</div>
      </section>
    </div>
  );
}
