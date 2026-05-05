import React from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Briefcase, FileText, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function VendorDashboard() {
  const { candidates, jobs } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();

  // For a vendor, they should only see their own candidates based on RLS
  const vendorCandidates = candidates;
  // Jobs might be assigned. We'll just show active jobs based on RLS.
  const activeJobs = jobs;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Vendor Workspace</h1>
          <p className="text-slate-500 font-medium mt-1">Manage your active candidates and view assigned job requisitions.</p>
        </div>
        <div className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-2">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">VENDOR MODE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
            <Users className="w-6 h-6" />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Your Candidates</p>
          <h2 className="text-3xl font-black text-slate-900 mt-1">{vendorCandidates.length}</h2>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4">
            <Briefcase className="w-6 h-6" />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Available Jobs</p>
          <h2 className="text-3xl font-black text-slate-900 mt-1">{activeJobs.length}</h2>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Submissions</p>
          <h2 className="text-3xl font-black text-slate-900 mt-1">0</h2>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 mb-4">
            <Activity className="w-6 h-6" />
          </div>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Avg Match</p>
          <h2 className="text-3xl font-black text-slate-900 mt-1">0%</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-6">
          <h3 className="font-black text-slate-900 tracking-tight text-xl">Quick Actions</h3>
          <button 
            onClick={() => navigate('/candidates')}
            className="w-full bg-slate-900 text-white rounded-xl py-3 font-bold hover:bg-slate-800 transition-colors"
          >
            Manage Candidates
          </button>
          <button 
            onClick={() => navigate('/jobs')}
            className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl py-3 font-bold hover:bg-slate-50 transition-colors"
          >
            View Available Jobs
          </button>
        </div>
      </div>
    </div>
  );
}
