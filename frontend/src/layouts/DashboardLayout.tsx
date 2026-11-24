import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Sidebar } from '../components/common/Sidebar';
import { ComposeModal } from '../components/compose/ComposeModal';
import { CreateSenderModal } from '../components/senders/CreateSenderModal';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { Sender, SlackStatus } from '../types';
import { useToast } from '../hooks/useToast';

export const DashboardLayout: React.FC = () => {
  const { user, loginWithGoogle, logout } = useAuth();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
  const [isCreateSenderModalOpen, setIsCreateSenderModalOpen] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);

  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchGlobalData = useCallback(async () => {
    try {
      const [sendersRes, slackRes] = await Promise.allSettled([
        api.senders.list(),
        api.slack.getStatus(),
      ]);

      if (sendersRes.status === 'fulfilled') {
        setSenders(sendersRes.value);
      }
      if (slackRes.status === 'fulfilled') {
        setSlackStatus(slackRes.value);
      }
    } catch {
      // Backend may be spinning up
    }
  }, []);

  useEffect(() => {
    fetchGlobalData();
  }, [fetchGlobalData]);

  // Handle Google OAuth login redirect success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'success') {
      showToast({
        type: 'success',
        title: 'Logged in successfully',
        message: 'Welcome to ReachInbox Email Scheduler!',
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [showToast]);

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col text-slate-900 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        user={user}
        slackStatus={slackStatus}
        onComposeClick={() => setIsComposeModalOpen(true)}
        onLogout={logout}
        onLoginClick={loginWithGoogle}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onSlackStatusChange={fetchGlobalData}
      />

      {/* Main Container */}
      <div className="flex-1 flex w-full">
        <Sidebar
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0">
          <Outlet
            context={{
              openCompose: () => setIsComposeModalOpen(true),
              openCreateSender: () => setIsCreateSenderModalOpen(true),
              refreshGlobal: fetchGlobalData,
              senders,
            }}
          />
        </main>
      </div>

      {/* Global Compose Email Modal */}
      <ComposeModal
        isOpen={isComposeModalOpen}
        onClose={() => setIsComposeModalOpen(false)}
        senders={senders}
        onCampaignCreated={() => {
          fetchGlobalData();
          navigate('/jobs');
        }}
        onAddSenderClick={() => {
          setIsComposeModalOpen(false);
          setIsCreateSenderModalOpen(true);
        }}
      />

      {/* Global Create Sender Modal */}
      <CreateSenderModal
        isOpen={isCreateSenderModalOpen}
        onClose={() => setIsCreateSenderModalOpen(false)}
        onSenderCreated={fetchGlobalData}
      />
    </div>
  );
};
