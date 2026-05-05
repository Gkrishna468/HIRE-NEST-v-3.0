import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, Search, RefreshCw, BrainCircuit, User, FileText, CheckCircle, Clock, AlertCircle, Send, Edit, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Email {
  id: string;
  message_id: string;
  thread_id: string;
  subject: string;
  from_email: string;
  snippet: string;
  body: string;
  direction: 'inbound' | 'outbound';
  received_at: string;
  ai_metadata?: any;
  status?: string;
}

export function EmailCenter() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchEmails();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('email_updates')
      .on(
        'postgres_changes' as any, 
        { event: '*', table: 'emails' }, 
        () => {
          fetchEmails();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false });

      if (error) throw error;
      setEmails(data || []);
      
      // Auto-select first thread if none selected
      if (data && data.length > 0 && !selectedThreadId) {
        setSelectedThreadId(data[0].thread_id);
      }
    } catch (err: any) {
      console.error('Fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const { syncGmailInbox } = await import('@/services/gmailService');
      const result = await syncGmailInbox();
      toast.success(result.message);
      await fetchEmails();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedThreadId || !replyText.trim()) return;

    const threadMessages = emails.filter(e => e.thread_id === selectedThreadId);
    const lastInbound = threadMessages.find(e => e.direction === 'inbound') || threadMessages[0];

    setIsSending(true);
    try {
      const { sendEmailReply } = await import('@/services/gmailService');
      await sendEmailReply(
        selectedThreadId, 
        lastInbound.from_email,
        lastInbound.subject,
        replyText
      );
      toast.success("Reply sent successfully");
      setReplyText('');
      await fetchEmails();
    } catch (err: any) {
      toast.error(err.message || "Failed to send reply");
    } finally {
      setIsSending(false);
    }
  };

  const generateAIReply = () => {
    if (!selectedThreadId) return;
    const threadMessages = emails.filter(e => e.thread_id === selectedThreadId);
    const latest = threadMessages[0];
    
    if (latest.ai_metadata?.reply) {
      setReplyText(latest.ai_metadata.reply);
      toast.success("AI Draft loaded");
    } else {
      toast.info("Generating AI draft...");
      // In a real app we'd call an AI service here if not pre-computed
    }
  };

  // Group emails by thread
  const threads = Array.from(new Set(emails.map(e => e.thread_id))).map(tid => {
    const threadMsgs = emails.filter(e => e.thread_id === tid);
    return {
      id: tid,
      latest: threadMsgs[0],
      count: threadMsgs.length
    };
  });

  const filteredThreads = threads.filter(t => 
    t.latest.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.latest.from_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedThreadMessages = emails
    .filter(e => e.thread_id === selectedThreadId)
    .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

  const selectedEmail = selectedThreadMessages[selectedThreadMessages.length - 1];

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#f8fafc] overflow-hidden">
      {/* PANEL 1: THREAD LIST */}
      <div className="w-80 border-r border-[#e2e8f0] bg-white flex flex-col">
        <div className="p-4 border-b border-[#e2e8f0] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-[#1e293b] flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600" />
              Conversations
            </h1>
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">Neural stream syncing...</span>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No messages found</p>
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <div 
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                className={`p-4 border-b border-gray-50 cursor-pointer transition-all hover:bg-indigo-50/50 ${selectedThreadId === thread.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-bold text-gray-900 truncate flex-1 pr-2">
                    {thread.latest.from_email.split('<')[0] || thread.latest.from_email}
                  </span>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {new Date(thread.latest.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-xs font-medium text-gray-600 truncate mb-1">
                  {thread.latest.subject}
                </div>
                <div className="text-[11px] text-gray-400 line-clamp-1 leading-relaxed italic">
                  "{thread.latest.snippet}"
                </div>
                <div className="mt-2 flex items-center justify-between">
                   <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 font-bold">
                     {thread.count} messages
                   </span>
                   {thread.latest.ai_metadata?.intent && (
                     <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase tracking-wider">
                       {thread.latest.ai_metadata.intent.replace('_', ' ')}
                     </span>
                   )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PANEL 2: CONVERSATION VIEW */}
      <div className="flex-1 bg-[#fcfdfe] flex flex-col">
        {selectedThreadId ? (
          <>
            <div className="p-6 border-b border-[#e2e8f0] bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black text-[#1e293b] mb-1">{selectedEmail?.subject}</h2>
                  <p className="text-sm text-gray-500 font-medium">Conversation with {selectedEmail?.from_email}</p>
                </div>
                <div className="flex gap-2">
                  <button className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><Edit className="w-5 h-5" /></button>
                  <button className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><Sparkles className="w-5 h-5" /></button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-8">
                {selectedThreadMessages.map((msg) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={msg.id} 
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] rounded-3xl p-6 shadow-sm border ${
                      msg.direction === 'outbound' 
                        ? 'bg-indigo-600 text-white border-indigo-500 rounded-tr-none' 
                        : 'bg-white text-[#334155] border-gray-100 rounded-tl-none'
                    }`}>
                      <div className="flex items-center gap-2 mb-3 opacity-80">
                        <User className="w-3 h-3" />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {msg.direction === 'outbound' ? 'Hirenest Agent' : msg.from_email.split('<')[0]}
                        </span>
                        <span className="mx-1">•</span>
                        <span className="text-[10px]">
                          {new Date(msg.received_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                        {msg.body || msg.snippet}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* REPLY BOX */}
            <div className="p-6 bg-white border-t border-[#e2e8f0]">
               <div className="max-w-4xl mx-auto">
                 <div className="relative group">
                    <textarea 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your response or use AI for a context-aware draft..."
                      className="w-full h-32 px-6 py-4 bg-slate-50 border border-slate-200 rounded-3xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all resize-none font-medium"
                    />
                    <div className="absolute bottom-4 right-4 flex gap-2">
                       <button 
                         onClick={generateAIReply}
                         className="p-2.5 bg-white border border-slate-200 rounded-2xl text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
                         title="Generate AI Draft"
                       >
                         <Sparkles className="w-5 h-5" />
                       </button>
                       <button 
                         onClick={handleSendReply}
                         disabled={isSending || !replyText.trim()}
                         className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                       >
                         {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                         Send Reply
                       </button>
                    </div>
                 </div>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-4">
            <Mail className="w-16 h-16 opacity-20" />
            <p className="text-lg font-bold">Select a conversation to begin intelligence analysis</p>
          </div>
        )}
      </div>

      {/* PANEL 3: NESTOR AGENT INTELLIGENCE */}
      <div className="w-[380px] border-l border-[#e2e8f0] bg-[#f8fafc] flex flex-col">
        <div className="p-4 border-b border-[#e2e8f0] bg-white flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
             <BrainCircuit className="w-5 h-5 text-indigo-600" />
          </div>
          <h2 className="font-black text-[#1e293b] tracking-tight">Nestor Intelligence</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {!selectedEmail ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
               <Sparkles className="w-8 h-8 mb-4 opacity-20" />
               <p className="text-xs font-bold leading-relaxed">Neural processing unit standby.<br/>Select a signal to activate.</p>
            </div>
          ) : (
            <>
              {/* INTENT & SCORE */}
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 border-l-4 border-l-indigo-600">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Neural Analysis</span>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Sparkles className="w-3 h-3" />
                    <span className="text-[10px] font-black">{selectedEmail.ai_metadata?.best_job_match?.score || 0}% Match</span>
                  </div>
                </div>
                <h3 className="text-lg font-black text-slate-900 capitalize mb-2 leading-tight">
                  {selectedEmail.ai_metadata?.intent?.replace(/_/g, ' ') || 'Detecting Intent...'}
                </h3>
                {selectedEmail.ai_metadata?.best_job_match && (
                  <div className="flex items-center gap-2 text-[11px] text-indigo-600 font-black">
                    <CheckCircle className="w-3 h-3" />
                    Target: {selectedEmail.ai_metadata.best_job_match.job_title}
                  </div>
                )}
              </div>

              {/* ACTION CENTER */}
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Autonomous Intelligence</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Candidate Mapped to Talent Graph
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-blue-50 text-blue-700 text-[11px] font-bold">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Auto-Reply Drafted by Nestor
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    Semantic Match Ranking Updated
                  </div>
                </div>
              </div>

              {/* EXTRACTED CORE DATA */}
              {selectedEmail.ai_metadata?.extracted && (
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Extracted Knowledge</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                         <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">Contact Identity</div>
                        <div className="text-xs font-black text-slate-700">{selectedEmail.ai_metadata.extracted.name || 'Unknown'}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                         <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">Neural Skill Map</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {selectedEmail.ai_metadata.extracted.skills?.map((s: string) => (
                            <span key={s} className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-bold">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
