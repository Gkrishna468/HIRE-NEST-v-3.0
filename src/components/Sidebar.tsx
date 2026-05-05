/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  Building2, 
  Truck, 
  FileText, 
  Bot, 
  Zap, 
  Settings, 
  LogOut,
  History,
  TrendingUp,
  MessageSquare,
  ShieldCheck,
  Globe,
  BrainCircuit,
  Mail,
  Cpu,
  Coins,
  Activity
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { isSupabaseConfigured } from '@/lib/supabase';

function hasAccess(userRole: string | undefined, allowedRoles: string[] | 'all') {
  if (!userRole || userRole === 'admin') return true;
  if (userRole === 'gopal@hirenestworkforce.com') return true;
  if (allowedRoles === 'all') return true;
  return allowedRoles.includes(userRole);
}

const menuGroups = [
  {
    title: "Core System",
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: 'all' },
      { icon: Users, label: 'Candidate Pool', path: '/candidates', roles: ['recruiter', 'vendor', 'vendor_manager'] },
      { icon: Briefcase, label: 'Job Requisitions', path: '/jobs', roles: 'all' },
      { icon: Zap, label: 'Match Engine', path: '/ai-matching', roles: 'all' },
      { icon: TrendingUp, label: 'Recruiter Pipeline', path: '/pipeline', roles: ['recruiter', 'client', 'client_manager'] },
    ]
  },
  {
    title: "AI System",
    items: [
      { icon: BrainCircuit, label: 'Intelligence OS', path: '/intelligence', roles: ['recruiter'] },
      { icon: FileText, label: 'Neural Parsing', path: '/resumes', roles: ['recruiter'] },
      { icon: Activity, label: 'AI Monitor', path: '/ai-monitor', roles: ['recruiter'] },
      { icon: Cpu, label: 'Autonomous Agents', path: '/agents', roles: ['recruiter'] },
    ]
  },
  {
    title: "Communication",
    items: [
      { icon: Mail, label: 'Email Node', path: '/email', roles: ['recruiter'] },
      { icon: MessageSquare, label: 'WhatsApp Node', path: '/whatsapp', roles: ['recruiter'] },
    ]
  },
  {
    title: "Marketplace",
    items: [
      { icon: Truck, label: 'Vendor Network', path: '/vendors', roles: ['recruiter'] },
      { icon: Building2, label: 'Strategic Clients', path: '/clients', roles: ['recruiter'] },
      { icon: Globe, label: 'Marketplace Dynamics', path: '/marketplace', roles: ['recruiter', 'vendor', 'vendor_manager'] },
      { icon: Coins, label: 'Revenue Hub', path: '/deal-room', roles: ['recruiter'] },
    ]
  },
  {
    title: "System",
    items: [
      { icon: ShieldCheck, label: 'Command Center', path: '/exec-suite', roles: [] },
      { icon: History, label: 'Activity Logs', path: '/activity', roles: [] },
      { icon: Settings, label: 'OS Settings', path: '/settings', roles: 'all' },
    ]
  }
];

export function Sidebar() {
  const { signOut, user } = useAuth();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 border-r border-slate-800">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
          <Zap className="text-white w-5 h-5 fill-current" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">HireNest</h1>
      </div>

      <nav className="flex-1 px-4 py-2 overflow-y-auto custom-scrollbar">
        {menuGroups.map((group, index) => {
          const visibleItems = group.items.filter(item => hasAccess(user?.role, item.roles as any));
          if (visibleItems.length === 0) return null;

          return (
            <div key={index} className="mb-8">
              <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">{group.title}</h3>
              <div className="space-y-1">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group relative",
                        isActive 
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                          : "hover:bg-slate-800 hover:text-white"
                      )
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium text-sm">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-4">
        <div className="flex items-center gap-3 px-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs uppercase">
            {user?.name?.[0] || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
            <p className="text-xs text-slate-400 capitalize truncate">{user?.role}</p>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors group"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Sign Out</span>
        </button>

        <div className="px-3 pt-2">
          <div className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest border",
            isSupabaseConfigured() 
              ? "bg-green-500/10 text-green-400 border-green-500/20" 
              : "bg-red-500/10 text-red-400 border-red-500/20"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isSupabaseConfigured() ? "bg-green-400" : "bg-red-400")} />
            {isSupabaseConfigured() ? 'Cloud Sync Active' : 'Offline Mode'}
          </div>
        </div>
      </div>
    </aside>
  );
}
