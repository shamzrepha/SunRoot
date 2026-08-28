import React from 'react';

export default function AdminDashboard() {
  return (
    <div>
      <h2>Admin Dashboard</h2>
      <section>
        <h3>Pending verifications</h3>
        <div>List of unverified users with actions to verify (uses setUserRole callable).</div>
      </section>
      <section>
        <h3>Recommendations</h3>
        <div>List of teacher recommendations to review and create admin classes from.</div>
      </section>
    </div>
  );
}
