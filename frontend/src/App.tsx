import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { JobHistory } from './pages/JobHistory';
import { ScheduleEmail } from './pages/ScheduleEmail';
import { Senders } from './pages/Senders';
import { NotFound } from './pages/NotFound';

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<JobHistory />} />
          <Route path="/emails" element={<Navigate to="/jobs" replace />} />
          <Route path="/schedule" element={<ScheduleEmail />} />
          <Route path="/senders" element={<Senders />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
};

export default App;
