import React from 'react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { SidebarProvider } from '@/components/dashboard/SidebarContext';
import { Toaster } from '@/components/ui/toaster';
import { ChatWidget } from '@/components/dashboard/ChatWidget';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative">
          {children}
        </main>
      </div>
      <Toaster />
      <ChatWidget />
    </SidebarProvider>
  );
}
