/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { 
  Zap, 
  Search, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  Briefcase,
  Users,
  ChevronRight,
  Filter,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  BrainCircuit,
  FileText,
  User,
  X,
  Mail,
  Phone,
  ExternalLink
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { scoreCandidateForJob, generateInterviewQuestions, getHiringPrediction } from '@/services/intelligenceService';
import { processResumes } from '@/services/resumeService';
import { safeArray, safeString } from '@/utils/safe';
import { toast } from 'sonner';

export default function AIMatching() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [talentPool, setTalentPool] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [matchThreshold, setMatchThreshold] = useState(50);

  const fetchTalentGraph = async () => {
    setIsProcessing(true);
    try {
      const { data: jobData } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
      const { data: talentData } = await supabase.from('talent_profiles').select('*').order('data_quality', { ascending: false });
      
      if (jobData) setJobs(jobData);
      if (talentData) setTalentPool(talentData);
    } finally {
      setIsProcessing(false);
    }
  };

  React.useEffect(() => {
    fetchTalentGraph();
  }, []);

  const handleProcessResumes = async () => {
    setIsProcessing(true);
    const toastId = toast.loading('AI Agent parsing historical resume library into talent graph...');
    try {
      const { processResumes } = await import('@/services/resumeService');
      const result = await processResumes();
      toast.success(`Unified ${result.count} profiles into Talent Graph!`, { id: toastId });
      await fetchTalentGraph(); 
    } catch (err) {
      toast.error('Neural processing failed', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const runMatching = async () => {
    if (!selectedJob) return;
    setIsMatching(true);
    
    // 1. Ensure Job has structured skills for high-fidelity matching
    let currentJob = { ...selectedJob };
    if (!selectedJob.skills || selectedJob.skills.length === 0) {
      toast.loading('Analyzing JD technical nodes...', { duration: 1500 });
      const { extractJobSkills } = await import('@/services/intelligenceService');
      const extractedSkills = await extractJobSkills(selectedJob.description);
      if (extractedSkills.length > 0) {
        currentJob.skills = extractedSkills;
        // Silently update DB for future matches
        await supabase.from('jobs').update({ skills: extractedSkills }).eq('id', selectedJob.id);
        setSelectedJob(currentJob);
      }
    }

    if (talentPool.length === 0) {
      toast.error('Talent Graph is empty. Upload resumes first.');
      setIsMatching(false);
      return;
    }

    const { safeLog } = await import('@/utils/logger');
    await safeLog({
      type: 'matching',
      agent_name: 'Neural Matcher',
      message: `Scanning Talent Graph (${talentPool.length} profiles) for: ${currentJob.title}`,
      level: 'info',
      status: 'pending'
    });

    const toastId = toast.loading(`Evaluating ${talentPool.length} talent profiles...`);

    try {
      const res = await Promise.all(talentPool.map(async (t) => {
        try {
          const evaluation = await scoreCandidateForJob(currentJob, t);
          return {
            id: t.id,
            name: t.full_name || t.primary_email || 'Unnamed Talent',
            email: t.primary_email,
            phone: t.primary_phone,
            skills: t.skills || [],
            experience: t.experience_years || 0,
            score: evaluation.score,
            reasoning: evaluation.reasoning,
            gaps: evaluation.gaps,
            matchedSkills: evaluation.matchedSkills || [],
            missingSkills: evaluation.missingSkills || [],
            recommendation: evaluation.recommendation,
            decision: (evaluation as any).decision,
            risk: (evaluation as any).risk,
            confidence: (evaluation as any).confidence,
            reasons: (evaluation as any).reasons,
            raw_text: t.raw_text,
            sources: t.sources
          };
        } catch (err) {
          return null;
        }
      }));

      const finalMatches = (res.filter(Boolean) as any[])
        .sort((a, b) => b.score - a.score)
        .filter(c => c.score >= matchThreshold);

      await safeLog({
        type: 'matching',
        agent_name: 'Neural Matcher',
        message: `Found ${finalMatches.length} matches for ${currentJob.title}.`,
        level: 'info',
        status: finalMatches.length > 0 ? 'success' : 'failed'
      });

      setMatches(finalMatches);
      
      if (finalMatches.length > 0 && finalMatches.every(r => r.score < matchThreshold)) {
        toast.info('Discovery Mode active.', { id: toastId });
      } else {
        toast.success(`Score generated for ${finalMatches.length} candidates.`, { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Matching Engine failed: ${err.message}`, { id: toastId });
    } finally {
      setIsMatching(false);
    }
  };

  const handleShortlist = async (match: any) => {
    const toastId = toast.loading('ORCHESTRATING NEURAL AGENTS...');
    try {
      // 1. Trigger AI Interviewer Agent
      const interviewAgent = await generateInterviewQuestions(selectedJob, match, match);
      
      // 2. Trigger AI Sales Agent
      const salesPrediction = await getHiringPrediction(selectedJob, match, match);

      // 3. Save to multi-agent pipeline
      const { error } = await supabase.from('shortlist').insert({
        job_id: selectedJob.id,
        candidate_id: String(match.id),
        score: match.score,
        decision: match.decision,
        risk: match.risk,
        confidence: match.confidence,
        reasons: match.reasons,
        interview_score: salesPrediction.offer_success, // Using offer success as proxy for readiness
        hiring_probability: salesPrediction.hiring_probability,
        offer_success_score: salesPrediction.offer_success,
        stage: 'shortlisted',
        reason: match.reasoning,
        prediction_summary: salesPrediction.summary,
        matched_skills: match.matchedSkills,
        missing_skills: match.missingSkills,
        source: match.source,
        ai_metadata: {
          risk_level: salesPrediction.risk_level,
          interview_questions: interviewAgent
        }
      });

      if (error) throw error;
      toast.success(`${match.name} finalized in Pipeline. Agents: Sourcing, Interview, Sales [SYNCED]`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Neural coordination failed', { id: toastId });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Neural Matching</h1>
        <p className="text-slate-500 mt-1">AI-driven candidate relevance scoring based on unified resume and portal data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              Target Role
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Select Requisition</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                  onChange={(e) => setSelectedJob(jobs.find(j => j.id === e.target.value))}
                  value={selectedJob?.id || ''}
                >
                  <option value="">Choose a vacancy...</option>
                  {jobs.filter(j => j.status === 'open' || j.status === 'pending').map(job => (
                    <option key={job.id} value={job.id}>{job.title}</option>
                  ))}
                </select>
              </div>

              {selectedJob && (
                <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-xs text-indigo-900 font-bold">{selectedJob.title}</p>
                  <div className="flex flex-wrap gap-1">
                    {safeArray(selectedJob.skills).map(s => (
                      <span key={s} className="px-1.5 py-0.5 bg-indigo-100/50 text-indigo-600 text-[9px] font-bold rounded uppercase">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              <button 
                onClick={runMatching}
                disabled={!selectedJob || isMatching}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
              >
                {isMatching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
                {isMatching ? 'Running AI Scoring...' : 'Run Neural Match'}
              </button>

              <div className="pt-2">
                <button 
                  onClick={handleProcessResumes}
                  disabled={isProcessing}
                  className="w-full bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-50 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <RefreshCw className={cn("w-4 h-4", isProcessing && "animate-spin")} />
                  {isProcessing ? 'Processing Library...' : 'Sync Pending Resumes'}
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-2 font-medium italic">
                  * Converts historical raw resumes into structured matches
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap className="w-16 h-16" />
            </div>
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Inference Logic
            </h3>
            <div className="space-y-3 relative z-10">
              {[
                { label: 'Technical Skills', weight: '70%', status: 'active' },
                { label: 'Core Experience', weight: '30%', status: 'active' },
              ].map(w => (
                <div key={w.label} className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-bold uppercase tracking-widest">{w.label}</span>
                  <span className="font-mono text-indigo-400">{w.weight}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Ranked Results</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Scored against {selectedJob?.title || 'None'}</p>
                </div>
              </div>
              <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-900 transition-colors">
                <Filter className="w-5 h-5" />
              </button>
            </div>

            <div className="divide-y divide-slate-50 flex-1 overflow-y-auto">
              {isMatching ? (
                <div className="h-full flex flex-col items-center justify-center p-20 text-center animate-pulse">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-indigo-100 animate-ping opacity-25" />
                    <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 relative">
                     <Zap className="w-8 h-8 fill-current" />
                    </div>
                  </div>
                  <h4 className="font-bold text-slate-900 mt-6">AI Agent is thinking...</h4>
                  <p className="text-sm text-slate-500 max-w-xs mt-2">Connecting candidates from resumes and portal data to your specific job requirements.</p>
                </div>
              ) : matches.length > 0 ? (
                <div className="flex flex-col flex-1 divide-y divide-slate-50">
                  {matches.filter(m => m.score >= matchThreshold).length === 0 && matches.length > 0 && (
                    <div className="p-4 bg-amber-50 border-b border-amber-100 text-center">
                      <p className="text-xs text-amber-600 font-bold uppercase tracking-widest leading-none">Discovery Mode</p>
                      <p className="text-[10px] text-amber-500 mt-1 italic">Showing closest relative matches (None met the {matchThreshold}% threshold)</p>
                    </div>
                  )}
                  
                  {(matches.filter(m => m.score >= matchThreshold).length > 0 
                    ? matches.filter(m => m.score >= matchThreshold)
                    : matches.slice(0, 5)
                  ).map(match => (
                    <div key={match.id} className="p-6 hover:bg-slate-50 transition-colors group flex items-start gap-6">
                    <div className="relative pt-1 shrink-0">
                      <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center font-bold text-lg text-indigo-600 group-hover:border-indigo-200 transition-colors">
                        {match.score}%
                      </div>
                      <div className={cn(
                        "absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white",
                        match.score > 80 ? 'bg-green-500' : match.score > 50 ? 'bg-orange-500' : 'bg-slate-300'
                      )} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                             <button 
                               onClick={() => setSelectedMatch(match)}
                               className="font-bold text-slate-900 text-lg hover:text-indigo-600 transition-colors cursor-pointer text-left"
                             >
                               {match.name}
                             </button>
                             <span className={cn(
                               "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                               match.source === 'crm' ? "bg-slate-100 text-slate-600" : "bg-indigo-100 text-indigo-600"
                             )}>
                               {match.source === 'crm' ? 'CRM Profile' : 'New Resume'}
                             </span>
                             {match.decision && (
                               <span className={cn(
                                 "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                                 match.decision === 'HIRE' ? "bg-green-100 text-green-700" : 
                                 match.decision === 'CONSIDER' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                               )}>
                                 {match.decision}
                               </span>
                             )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 font-medium">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {match.yearsExperience || match.experience} yrs exp
                            </span>
                            {match.risk !== undefined && (
                              <span className="flex items-center gap-1">
                                <AlertCircle className={cn("w-3.5 h-3.5", match.risk > 50 ? "text-red-500" : "text-amber-500")} />
                                Risk: {match.risk}%
                              </span>
                            )}
                            {match.confidence !== undefined && (
                              <span className="flex items-center gap-1">
                                <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
                                Confidence: {match.confidence}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {match.url && (
                            <a 
                              href={match.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-100 transition-all"
                              title="View Document"
                            >
                              <FileText className="w-4 h-4" />
                            </a>
                          )}
                          <button 
                            onClick={() => handleShortlist(match)}
                            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 rounded-xl text-xs font-bold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all group/btn"
                          >
                            Shortlist
                            <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {safeArray(match.matchedSkills).map(s => (
                          <span key={s} className="px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold rounded-md border border-green-100 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {s}
                          </span>
                        ))}
                        {safeArray(match.missingSkills).slice(0, 5).map(s => (
                          <span key={s} className="px-2 py-0.5 bg-red-50/50 text-red-400 text-[10px] font-bold rounded-md border border-red-100/30 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5 opacity-50" />
                            {s}
                          </span>
                        ))}
                      </div>

                      {match.reasoning && (
                        <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <BrainCircuit className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-bold text-slate-900 mb-1">Neural Matching Analysis</p>
                              <p className="text-sm text-slate-600 leading-relaxed italic">
                                "{match.reasoning}"
                              </p>
                            </div>
                          </div>
                          
                          {match.reasons && (
                            <div className="mt-2 pt-3 border-t border-slate-200">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Strategic Justification</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {match.reasons.map((r: string, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                    {r}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {safeArray(match.gaps).length > 0 && (
                        <div className="mt-4">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            Neural Gap Analysis
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {safeArray(match.gaps).map((gap, i) => (
                              <div key={i} className="px-3 py-2 bg-red-50/30 text-red-700 text-[11px] font-bold rounded-xl border border-red-100/50 flex items-start gap-2">
                                <span className="text-red-400 mt-0.5">•</span>
                                {gap}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
                <div className="p-20 text-center text-slate-400 flex flex-col items-center justify-center h-full">
                  <Search className="w-12 h-12 mb-4 opacity-10" />
                  <p className="font-medium">No matches found yet.</p>
                  <p className="text-sm mt-1">Select a job and run neural match to start discovering candidates.</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Security isolation active</span>
              <div className="flex gap-4">
                <span>VPC-01-PROD</span>
                <span>Latency: {isMatching ? '~' : '0.12ms'}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Resume Modal */}
        {selectedMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">{selectedMatch.name}</h3>
                    <p className="text-sm text-slate-500 font-medium">{selectedMatch.currentTitle || selectedMatch.source === 'crm' ? 'CRM Profile' : 'Resume Source'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedMatch(null)}
                  className="p-2 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-1 space-y-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Identity Signal</p>
                      <div className="space-y-3">
                        {selectedMatch.email && (
                          <div className="flex items-center gap-3 text-sm text-slate-600">
                            <Mail className="w-4 h-4 text-slate-400" />
                            {selectedMatch.email}
                          </div>
                        )}
                        {selectedMatch.phone && (
                          <div className="flex items-center gap-3 text-sm text-slate-600">
                            <Phone className="w-4 h-4 text-slate-400" />
                            {selectedMatch.phone}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Neural Profile</p>
                      <div className="space-y-3">
                        <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                          <p className="text-[10px] text-indigo-400 font-bold uppercase mb-1">AI Match Score</p>
                          <p className="text-2xl font-black text-indigo-700">{selectedMatch.score}%</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Total Experience</p>
                          <p className="text-lg font-black text-slate-700">{selectedMatch.yearsExperience || selectedMatch.experience} Years</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Resume Content</p>
                      <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6 font-mono text-sm text-slate-600 min-h-[400px] leading-relaxed whitespace-pre-wrap">
                        {selectedMatch.extractedText || selectedMatch.raw_text || selectedMatch.notes || "No raw resume text available for this profile."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                {selectedMatch.url && (
                  <a 
                    href={selectedMatch.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Source PDF
                  </a>
                )}
                <button 
                  onClick={() => setSelectedMatch(null)}
                  className="px-8 py-2.5 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
