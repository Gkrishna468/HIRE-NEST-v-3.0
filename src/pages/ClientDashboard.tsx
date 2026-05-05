import React from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Briefcase, Zap, TrendingUp, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ClientDashboard() {
  const { jobs } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();

  // For a client, they see their own jobs based on RLS
  const activeJobs = jobs;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Client Portal</h1>
          <p className="text-slate-500 font-medium mt-1">Monitor your job requisitions and matched candidates.</p>
        </div>
        <div className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">CLIENT MODE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
            <Briefcase className="w-6 h-6" />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Active Jobs</p>
          <h2 className="text-3xl font-black text-slate-900 mt-1">{activeJobs.length}</h2>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
            <Zap className="w-6 h-6" />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Matched Candidates</p>
          <h2 className="text-3xl font-black text-slate-900 mt-1">0</h2>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-4">
            <TrendingUp className="w-6 h-6" />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">In Pipeline</p>
          <h2 className="text-3xl font-black text-slate-900 mt-1">0</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-6">
          <h3 className="font-black text-slate-900 tracking-tight text-xl">Quick Actions</h3>
          <button 
            onClick={() => navigate('/jobs')}
            className="w-full bg-slate-900 text-white rounded-xl py-3 font-bold hover:bg-slate-800 transition-colors"
          >
            Manage Active Jobs
          </button>
          <button 
            onClick={() => navigate('/ai-matching')}
            className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl py-3 font-bold hover:bg-slate-50 transition-colors"
          >
            Review AI Matches
          </button>
        </div>

        <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <ShieldCheck className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <h3 className="text-xl font-bold mb-2">Automated Talent Discovery</h3>
              <p className="text-indigo-100 text-sm leading-relaxed mb-6">
                Your requisitions are continuously matched against our marketplace talent pool using neural search.
              </p>
            </div>
          </div>
      </div>
    </div>
  );
}
