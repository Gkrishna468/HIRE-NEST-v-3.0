import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Link } from 'react-router-dom';
import { 
  Mail, Search, RefreshCw, BrainCircuit, User, FileText, CheckCircle, 
  Send, Edit, Sparkles, Loader2, Star, Archive, Trash2, SendHorizontal, 
  Paperclip, MoreVertical, ShieldCheck, Zap, AlertCircle, Inbox, 
  ChevronRight, Filter, Plus, X, Command, Briefcase, Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Email {
  id: string;
  message_id: string;
  thread_id: string;
  subject: string;
  from_email: string;
  to_email: string;
  snippet: string;
  body: string;
  body_html?: string;
  body_text?: string;
  direction: 'inbound' | 'outbound';
  received_at: string;
  ai_metadata?: any;
  status?: string;
  category?: string;
  ai_priority?: number;
  labels?: string[];
  message_header_id?: string;
}

export function EmailCenter() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'inbox' | 'recruitment' | 'sent' | 'archived'>('inbox');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('idle');
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [hasToken, setHasToken] = useState<boolean>(true);

  useEffect(() => {
    async function checkConnection() {
      const { data: { session } } = await supabase.auth.getSession();
      const isGoogleLinked = !!session?.user?.id && (
        session.user.app_metadata?.provider === 'google' || 
        session.user.identities?.some(id => id.provider === 'google')
      );
      
      const sessionToken = session?.provider_token;
      
      // Also check profile metadata for persisted token if session one is missing
      let hasPersistedToken = false;
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('metadata')
          .eq('id', session.user.id)
          .maybeSingle();
        hasPersistedToken = !!profile?.metadata?.google_token;
      }

      setIsConnected(isGoogleLinked);
      setHasToken(!!sessionToken || hasPersistedToken);
      
      if (sessionToken || hasPersistedToken) {
        handleRefresh();
      }
    }
    
    fetchEmails();
    checkConnection();
    
    // Background Signal Polling (Every 3 minutes)
    const pollInterval = setInterval(() => {
      // Need to use a ref or check state if possible, but for simplicity:
      if (syncStatus !== 'syncing') {
        handleRefresh();
      }
    }, 180000);

    const channel = supabase
      .channel('email_updates')
      .on('postgres_changes' as any, { event: '*', table: 'emails' }, () => fetchEmails())
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchEmails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false });

      if (error) throw error;
      setEmails(data || []);
      
      if (data && data.length > 0 && !selectedThreadId) {
        setSelectedThreadId(data[0].thread_id);
      }
    } catch (err: any) {
      console.error('Fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async (force: boolean = false) => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setSyncStatus('syncing');
    try {
      const { syncGmailInbox } = await import('@/services/gmailService');
      const result = await syncGmailInbox(force);
      setLastSynced(new Date().toLocaleTimeString());
      setSyncStatus('success');
      
      const syncInfo = result.count > 0 
        ? `${result.count} signals synchronized.` 
        : force ? "Depth sync complete. No new signals found." : "No new activity detected.";
        
      toast.success(syncInfo);
      await fetchEmails();
    } catch (err: any) {
      setSyncStatus('failed');
      toast.error(err.message || 'Signal sync failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedThreadId || !replyText.trim()) return;

    const threadMessages = emails.filter(e => e.thread_id === selectedThreadId);
    const lastInbound = [...threadMessages].reverse().find(e => e.direction === 'inbound') || threadMessages[0];

    setIsSending(true);
    try {
      const { sendEmailReply } = await import('@/services/gmailService');
      await sendEmailReply(
        selectedThreadId, 
        lastInbound.from_email,
        lastInbound.subject,
        replyText,
        lastInbound.message_header_id
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

  const handleMapToCandidate = async () => {
    if (!selectedEmail?.ai_metadata?.extracted) return;
    const { extracted } = selectedEmail.ai_metadata;
    
    try {
      const { error } = await supabase.from('candidates').insert({
        name: extracted.name || 'Sourced Candidate',
        email: selectedEmail.from_email,
        skills: extracted.skills || [],
        experience: extracted.experience || 0,
        stage: 'sourced',
        source: 'gmail_ai_mapping'
      });

      if (error) throw error;
      toast.success(`${extracted.name || 'Candidate'} mapped to Talent Hub!`);
    } catch (err: any) {
      toast.error("Mapping failed: " + err.message);
    }
  };

  const generateSmartReply = async () => {
    if (!selectedEmail) return;
    
    setIsGeneratingReply(true);
    try {
      const { callAISecureProxy } = await import('@/lib/ai');
      const response = await callAISecureProxy(`Generate a professional recruitment reply for this email:
        Subject: ${selectedEmail.subject}
        From: ${selectedEmail.from_email}
        Content: ${selectedEmail.body_text || selectedEmail.snippet}
        
        Keep it concise, friendly, and focus on next steps.`);
      
      setReplyText(response);
      toast.success("AI Signal Crafting Complete");
    } catch (err: any) {
      toast.error("Neural drafting failed");
    } finally {
      setIsGeneratingReply(false);
    }
  };

  // Group emails by thread
  const threads = Array.from(new Set(emails.map(e => e.thread_id))).map(tid => {
    const threadMsgs = emails.filter(e => e.thread_id === tid);
    return {
      id: tid,
      latest: threadMsgs[0],
      messages: threadMsgs,
      count: threadMsgs.length,
      isUnread: threadMsgs.some(m => m.status === 'received' && m.direction === 'inbound') // Rough unread logic
    };
  });

  const filteredThreads = threads.filter(t => {
    const matchesSearch = t.latest.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         t.latest.from_email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (activeTab === 'inbox') return t.messages.some(m => m.direction === 'inbound');
    if (activeTab === 'recruitment') return t.latest.category === 'recruitment';
    if (activeTab === 'sent') return t.messages.every(m => m.direction === 'outbound');
    
    return true;
  });

  const selectedThreadMessages = emails
    .filter(e => e.thread_id === selectedThreadId)
    .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

  const selectedEmail = selectedThreadMessages[selectedThreadMessages.length - 1];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* 1. LEFT SIDEBAR: FOLDERS */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6">
          <button 
            onClick={() => setIsComposeOpen(true)}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95 group"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
            Compose AI
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <SidebarItem 
            icon={Inbox} 
            label="Primary Inbox" 
            active={activeTab === 'inbox'} 
            onClick={() => setActiveTab('inbox')}
            count={threads.filter(t => t.isUnread).length}
          />
          <SidebarItem 
            icon={BrainCircuit} 
            label="Recruitment" 
            active={activeTab === 'recruitment'} 
            onClick={() => setActiveTab('recruitment')}
            color="text-indigo-600"
          />
          <SidebarItem 
            icon={SendHorizontal} 
            label="Sent" 
            active={activeTab === 'sent'} 
            onClick={() => setActiveTab('sent')}
          />
          <SidebarItem 
            icon={Star} 
            label="Priority" 
            active={false} 
            onClick={() => {}}
          />
          <SidebarItem 
            icon={Archive} 
            label="Archived" 
            active={activeTab === 'archived'} 
            onClick={() => setActiveTab('archived')}
          />
          
          <div className="pt-8 pb-4 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Intelligent Labels
          </div>
          <SidebarItem icon={User} label="Candidates" active={false} onClick={() => {}} dot="bg-emerald-500" />
          <SidebarItem icon={Briefcase} label="Client Queries" active={false} onClick={() => {}} dot="bg-blue-500" />
          <SidebarItem icon={Truck} label="Vendor Comms" active={false} onClick={() => {}} dot="bg-amber-500" />
        </nav>
      </div>

      {/* 2. MIDDLE PANEL: THREAD LIST */}
      <div className="w-96 bg-white border-r border-slate-200 flex flex-col min-w-0 flex-shrink-0 overflow-hidden">
        <div className="p-6 border-b border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              <div className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-full font-bold">
                {filteredThreads.length}
              </div>
            </h2>
            <button 
              onClick={() => handleRefresh()}
              disabled={isRefreshing}
              className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search conversations..."
              className="w-full bg-slate-50 border-none pl-11 pr-4 py-3 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/10 placeholder:text-slate-400 font-medium transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Neural Sync Active</span>
            </div>
          ) : !isConnected ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
              <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center mb-4 text-red-500">
                <AlertCircle className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-900">Gmail Not Connected</p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Connect your account in Settings to sync communications.
              </p>
              <Link 
                to="/settings"
                className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
              >
                Go to Settings
              </Link>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-sm font-bold text-slate-900">
                {emails.length > 0 ? 'No signal matches' : 'Inbox is quiet'}
              </p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-[200px]">
                {emails.length > 0 
                  ? 'Try clearing your search or switching tabs.' 
                  : 'Syncing your communications hub for neural matching.'}
              </p>
              
              <div className="mt-8 p-4 bg-slate-50 rounded-2xl border border-slate-100 w-full">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  <span>Diagnostic Data</span>
                </div>
                <div className="space-y-2 text-left">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400">Gmail Linked</span>
                    <span className={`font-bold ${isConnected ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isConnected ? (hasToken ? 'YES (ACTIVE)' : 'YES (STALE)') : 'NO'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400">Sync Status</span>
                    <span className={`font-bold ${syncStatus === 'failed' ? 'text-red-500' : syncStatus === 'syncing' ? 'text-indigo-500' : 'text-emerald-500'}`}>
                      {syncStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400">Last Pulse</span>
                    <span className="text-slate-900 font-bold">{lastSynced || 'Never'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400">Total Signals</span>
                    <span className="text-slate-900 font-bold">{emails.length} stored</span>
                  </div>
                  {syncStatus === 'failed' && (
                    <div className="mt-2 p-2 bg-red-50 rounded-lg text-[9px] text-red-600 font-medium">
                      Neural link interrupted. Verify permissions.
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button 
                    onClick={() => handleRefresh(true)}
                    disabled={isRefreshing}
                    className="py-2 bg-white border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:bg-slate-50 transition-all font-bold disabled:opacity-50"
                  >
                    {isRefreshing ? 'Syncing...' : 'Depth Sync'}
                  </button>
                  <Link 
                    to="/settings"
                    className="py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all font-bold text-center flex items-center justify-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset Link
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <ThreadCard 
                key={thread.id}
                thread={thread}
                isSelected={selectedThreadId === thread.id}
                onSelect={() => setSelectedThreadId(thread.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* 3. RIGHT PANEL: CONVERSATION & INTELLIGENCE */}
      <div className="flex-1 bg-white flex flex-col overflow-hidden">
        {selectedThreadId ? (
          <div className="flex h-full">
            {/* THREAD VIEW */}
            <div className="flex-1 flex flex-col border-r border-slate-100 min-w-0">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-black text-slate-900 leading-tight">{selectedEmail?.subject}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                      <User className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className="text-xs text-slate-500 font-bold">{selectedEmail?.from_email}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400"><Star className="w-5 h-5" /></button>
                  <button className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400"><Trash2 className="w-5 h-5" /></button>
                  <button className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400"><MoreVertical className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30 custom-scrollbar">
                <div className="max-w-3xl mx-auto space-y-6">
                  {selectedThreadMessages.map((msg, idx) => (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] rounded-[1.5rem] p-6 shadow-sm border ${
                        msg.direction === 'outbound' 
                          ? 'bg-slate-900 text-white border-slate-800 rounded-tr-none' 
                          : 'bg-white text-slate-700 border-slate-200/60 rounded-tl-none'
                      }`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                            {msg.direction === 'outbound' ? 'Sent via HireNest' : 'Received message'}
                          </span>
                          <span className="text-[9px] opacity-40 ml-auto font-bold uppercase">
                            {new Date(msg.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium">
                          {msg.body_text || msg.body || msg.snippet}
                        </div>
                        {msg.body_html && (
                          <div className="mt-4 p-4 bg-slate-50/50 rounded-xl text-[10px] text-slate-400 font-black cursor-pointer hover:bg-slate-100 transition-colors inline-flex items-center gap-2">
                            <FileText className="w-3 h-3" />
                            VIEW ORIGINAL HTML VERSION
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* ACTION: REPLY */}
              <div className="p-6 bg-white border-t border-slate-100">
                <div className="max-w-3xl mx-auto">
                  <div className="relative">
                    <textarea 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply or use AI for a context-aware smart response..."
                      className="w-full h-40 px-6 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] text-sm focus:ring-4 focus:ring-indigo-500/5 focus:bg-white transition-all resize-none font-medium outline-none"
                    />
                    <div className="absolute bottom-4 right-4 flex gap-2">
                      <button 
                        onClick={() => {
                          const draft = selectedEmail.ai_metadata?.reply;
                          if (draft) {
                            setReplyText(draft);
                            toast.success("Neural draft loaded.");
                          } else {
                            generateSmartReply();
                          }
                        }}
                        disabled={isGeneratingReply}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100 disabled:opacity-50"
                      >
                        {isGeneratingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Smart Craft
                      </button>
                      <button 
                         onClick={handleSendReply}
                         disabled={isSending || !replyText.trim()}
                         className="flex items-center gap-2 px-8 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 disabled:opacity-50"
                       >
                         {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
                         Transmit
                       </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI INTELLIGENCE PANEL */}
            <div className="w-80 bg-slate-50/50 p-6 space-y-6 overflow-y-auto custom-scrollbar flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                  <BrainCircuit className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-900 tracking-tight text-sm uppercase tracking-widest">Neural Insights</h3>
              </div>

              {selectedEmail.ai_metadata?.intent && (
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Detected Intent</p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full">
                      <Zap className="w-3 h-3" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{selectedEmail.ai_metadata.intent.replace('_', ' ')}</span>
                    </div>
                  </div>
                  
                  {selectedEmail.ai_metadata.score !== undefined && (
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Lead Score</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${selectedEmail.ai_metadata.score}%` }} />
                        </div>
                        <span className="text-xs font-black text-indigo-600">{selectedEmail.ai_metadata.score}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedEmail.ai_metadata?.extracted && (
                <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 space-y-5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Contact Mapping</p>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-900">{selectedEmail.ai_metadata.extracted.name || 'Unknown'}</p>
                      <p className="text-[9px] text-slate-400 font-medium">{selectedEmail.ai_metadata.extracted.experience || 'Not detected'}</p>
                    </div>
                  </div>

                  {selectedEmail.ai_metadata.extracted.skills && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Skill Intelligence</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedEmail.ai_metadata.extracted.skills.map((s: string) => (
                          <span key={s} className="px-2 py-0.5 bg-slate-50 text-slate-600 rounded text-[9px] font-bold uppercase border border-slate-100">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={handleMapToCandidate}
                    className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all"
                  >
                    Map to Candidate Hub
                  </button>
                </div>
              )}

              {selectedEmail.ai_metadata?.best_job_match && (
                <div className="bg-indigo-600 p-5 rounded-[2rem] text-white space-y-4 shadow-xl shadow-indigo-600/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <ShieldCheck className="w-20 h-20" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-[9px] font-black text-indigo-200 uppercase tracking-[0.2em] mb-2">Target Opportunity</p>
                    <h4 className="text-sm font-black leading-tight mb-2">{selectedEmail.ai_metadata.best_job_match.job_title}</h4>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/20 rounded-lg text-[9px] font-black">
                      <Sparkles className="w-3 h-3" />
                      {selectedEmail.ai_metadata.best_job_match.score}% MATCH
                    </div>
                    <p className="text-[10px] text-indigo-100 mt-4 leading-relaxed line-clamp-3">
                      {selectedEmail.ai_metadata.best_job_match.reasoning}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-12 text-center bg-slate-50/50">
            <div className="relative">
              <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl relative z-10">
                <Command className="w-10 h-10 text-slate-200" />
              </div>
              <div className="absolute inset-0 bg-indigo-100 rounded-[2rem] animate-pulse -rotate-6" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900 tracking-tight">Signal Selection Required</p>
              <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                Connect your communications hub to trigger the neural matching engine and autonomous recruiter agents.
              </p>
            </div>
            <button 
              onClick={() => handleRefresh()}
              className="px-8 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
            >
              Force Neural Sync
            </button>
          </div>
        )}
      </div>

      <ComposeModal isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} />
    </div>
  );
}

function SidebarItem({ icon: Icon, label, active, onClick, count, dot, color }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group ${
        active 
          ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10' 
          : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      <Icon className={`w-4 h-4 ${active ? 'text-white' : (color || 'text-slate-400')} group-hover:scale-110 transition-transform`} />
      <span className={`text-[11px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-slate-600'}`}>
        {label}
      </span>
      {dot && <div className={`w-1.5 h-1.5 rounded-full ml-auto ${dot}`} />}
      {count !== undefined && count > 0 && (
        <div className={`ml-auto px-1.5 py-0.5 rounded-lg text-[9px] font-black ${active ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'}`}>
          {count}
        </div>
      )}
    </button>
  );
}

function ThreadCard({ thread, isSelected, onSelect }: any) {
  const { latest, count, isUnread } = thread;
  const receivedAt = new Date(latest.received_at);

  return (
    <div 
      onClick={onSelect}
      className={`p-5 cursor-pointer transition-all border-b border-slate-50 relative overflow-hidden group ${
        isSelected 
          ? 'bg-white border-l-4 border-l-slate-900 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]' 
          : 'hover:bg-slate-50/80 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.03)]'
      }`}
    >
      {isUnread && (
        <div className="absolute top-6 right-5 w-2 h-2 bg-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]" />
      )}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">
            {latest.from_email.charAt(0).toUpperCase()}
          </div>
          <p className={`text-xs font-black truncate max-w-[120px] ${isUnread ? 'text-slate-900' : 'text-slate-600'}`}>
            {latest.from_email.split('<')[0].trim() || latest.from_email}
          </p>
        </div>
        <span className="text-[9px] font-bold text-slate-400 uppercase">
          {receivedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className={`text-[11px] font-black leading-tight mb-1 truncate ${isUnread ? 'text-slate-900' : 'text-slate-500'}`}>
        {latest.subject}
      </p>
      <p className="text-[10px] text-slate-400 line-clamp-1 font-medium italic mb-3 opacity-80">
        "{latest.snippet}"
      </p>
      
      <div className="flex items-center justify-between mt-1">
        <div className="flex gap-1.5">
          {latest.ai_metadata?.intent && (
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black uppercase tracking-widest rounded">
              {latest.ai_metadata.intent.split('_')[0]}
            </span>
          )}
          {latest.ai_priority > 70 && (
            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase tracking-widest rounded border border-indigo-100">
              PRIORITY
            </span>
          )}
        </div>
        {count > 1 && (
          <span className="text-[9px] font-bold text-slate-300">
            {count} msgs
          </span>
        )}
      </div>
    </div>
  );
}

function ComposeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  const handleSend = async () => {
    if (!to || !subject || !content) return;
    setIsSending(true);
    try {
      const { sendNewEmail } = await import('@/services/gmailService');
      await sendNewEmail(to, subject, content);
      toast.success("Intelligence packet transmitted successfully.");
      onClose();
    } catch (err: any) {
      toast.error("Transmission failure: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSmartEnhance = async () => {
    if (!content.trim()) return;
    setIsEnhancing(true);
    try {
      const { callAISecureProxy } = await import('@/lib/ai');
      const response = await callAISecureProxy(`Enhance this recruitment email to be more professional, engaging, and clear. 
        Subject: ${subject}
        Content: ${content}`);
      setContent(response);
      toast.success("AI Enhancement Applied");
    } catch (err: any) {
      toast.error("Enhancement failure");
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]" 
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed bottom-8 right-8 w-[600px] bg-white rounded-[2.5rem] shadow-2xl z-[101] overflow-hidden flex flex-col border border-slate-200"
          >
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                  <Edit className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em]">Craft New Signal</h3>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="relative group">
                   <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Recipient</div>
                   <input 
                    type="text" 
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full pl-20 py-3 border-b border-slate-100 outline-none focus:border-indigo-500 transition-all font-bold text-sm"
                   />
                </div>
                <div className="relative group">
                   <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</div>
                   <input 
                    type="text" 
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full pl-20 py-3 border-b border-slate-100 outline-none focus:border-indigo-500 transition-all font-bold text-sm"
                   />
                </div>
              </div>

              <div className="relative">
                <textarea 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Neural engine ready for drafting..."
                  className="w-full h-80 bg-slate-50 rounded-[2rem] p-8 outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm font-medium resize-none"
                />
                <button 
                  onClick={handleSmartEnhance}
                  disabled={isEnhancing || !content.trim()}
                  className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
                >
                  {isEnhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  AI Enhance
                </button>
              </div>
            </div>

            <div className="p-8 pt-0 flex items-center justify-between">
              <div className="flex gap-2">
                <button className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all"><Paperclip className="w-5 h-5" /></button>
                <button className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all"><Archive className="w-5 h-5" /></button>
              </div>
              <button 
                onClick={handleSend}
                disabled={isSending || !to.trim()}
                className="flex items-center gap-3 px-10 py-4 bg-slate-900 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
                Transmit Signal
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
