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
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'inbox' | 'recruitment' | 'sent' | 'archived'>('inbox');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('INITIAL');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (selectedThreadId) {
      const threadMsgs = emails.filter(e => e.thread_id === selectedThreadId);
      if (threadMsgs.length > 0) {
        setExpandedMessages(new Set([threadMsgs[threadMsgs.length - 1].id])); // Expand latest
      }
    }
  }, [selectedThreadId, emails.length]);

  const toggleMessageExpansion = (msgId: string) => {
    const next = new Set(expandedMessages);
    if (next.has(msgId)) {
      next.delete(msgId);
    } else {
      next.add(msgId);
    }
    setExpandedMessages(next);
  };

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setGmailConnected(false);
          setIsConnected(false);
          return;
        }

        // authoritative check: connection state machine in gmail_accounts
        const { data: gmailAccount, error } = await supabase
          .from("gmail_accounts")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error(error);
          setGmailConnected(false);
          setIsConnected(false);
          return;
        }

        const connected = !!gmailAccount?.refresh_token || !!gmailAccount?.access_token;
        setGmailConnected(connected);
        setIsConnected(connected);
        
        if (gmailAccount?.sync_status) {
          setSyncStatus(gmailAccount.sync_status);
        }

        if (connected && (!gmailAccount.sync_status || gmailAccount.sync_status === 'TOKEN_PERSISTED')) {
          handleRefresh();
        }
      } catch (err) {
        console.error(err);
        setGmailConnected(false);
        setIsConnected(false);
      } finally {
        setLoadingConnection(false);
      }
    };

    fetchEmails();
    checkConnection();
    
    // Background Signal Polling (Every 3 minutes)
    const pollInterval = setInterval(() => {
      if (syncStatus !== 'syncing' && gmailConnected) {
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
    setSyncStatus('SYNCING');
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('gmail_accounts').update({ sync_status: 'SYNCING' }).eq('user_id', user.id);
      }

      const { syncGmailInbox } = await import('@/services/gmailService');
      const result = await syncGmailInbox(force);
      setLastSynced(new Date().toLocaleTimeString());
      setSyncStatus('READY');
      
      if (user) {
        await supabase.from('gmail_accounts').update({ 
          sync_status: 'READY',
          last_synced_at: new Date().toISOString()
        }).eq('user_id', user.id);
      }
      
      const syncInfo = result.count > 0 
        ? `${result.count} signals synchronized.` 
        : force ? "Depth sync complete. No new signals found." : "No new activity detected.";
        
      toast.success(syncInfo);
      await fetchEmails();
    } catch (err: any) {
      setSyncStatus('ERROR');
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
            label="Priority Feed" 
            active={activeTab === 'inbox'} 
            onClick={() => setActiveTab('inbox')}
            count={threads.filter(t => t.isUnread).length}
          />
          <SidebarItem 
            icon={BrainCircuit} 
            label="AI Follow-Ups" 
            active={activeTab === 'recruitment'} 
            onClick={() => setActiveTab('recruitment')}
            color="text-indigo-600"
          />
          <SidebarItem 
            icon={User} 
            label="Candidates" 
            active={false} 
            onClick={() => {}} 
            dot="bg-emerald-500" 
          />
          <SidebarItem 
            icon={Briefcase} 
            label="Client Portals" 
            active={false} 
            onClick={() => {}} 
            dot="bg-blue-500" 
          />
          <SidebarItem 
            icon={Truck} 
            label="Vendor Comm" 
            active={false} 
            onClick={() => {}} 
            dot="bg-amber-500" 
          />
          
          <div className="pt-8 pb-4 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            System Folders
          </div>
          <SidebarItem icon={SendHorizontal} label="Transmitted" active={activeTab === 'sent'} onClick={() => setActiveTab('sent')} />
          <SidebarItem icon={Archive} label="Archived Intel" active={activeTab === 'archived'} onClick={() => setActiveTab('archived')} />
          <SidebarItem icon={Trash2} label="Discarded" active={false} onClick={() => {}} />
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
          {loadingConnection || isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Neural Sync Active</span>
            </div>
          ) : !gmailConnected || syncStatus === 'INITIAL' ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
              <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mb-4 text-slate-500">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-900">Connect Gmail Workspace</p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Unlock autonomous recruitment sync and neural thread indexing.
              </p>
              <Link 
                to="/settings"
                className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
              >
                Go to Settings
              </Link>
            </div>
          ) : syncStatus === 'TOKEN_PERSISTED' || (syncStatus === 'SYNCING' && emails.length === 0) ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full space-y-6">
              <div className="relative">
                <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 animate-pulse relative z-10">
                  <BrainCircuit className="w-8 h-8" />
                </div>
                <div className="absolute inset-0 bg-indigo-100/50 rounded-3xl animate-ping opacity-30" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Preparing Neural Sync</p>
                <div className="mt-4 w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden mx-auto">
                   <motion.div 
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 10, repeat: Infinity }}
                    className="h-full bg-indigo-600"
                   />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">
                  Importing conversations & parsing resumes...
                </p>
              </div>
            </div>
          ) : syncStatus === 'ERROR' ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
              <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center mb-4 text-red-500">
                <AlertCircle className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-900">Sync Interrupted</p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                The neural link encountered a synchronization failure.
              </p>
              <div className="mt-6 p-4 bg-slate-50 rounded-2xl text-left border border-slate-100 w-full mb-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Diagnostics</p>
                <p className="text-[10px] text-red-500 font-bold">Refresh token verification failed or Gmail API quota reached.</p>
              </div>
              <button 
                onClick={() => handleRefresh(true)}
                className="w-full py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all font-bold"
              >
                Retry Depth Sync
              </button>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-sm font-bold text-slate-900">Inbox is quiet</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-[200px]">
                Try clearing your search or force a refresh to pull new signals.
              </p>
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
                  <div className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest mb-3 inline-block">Conversation Intelligence Active</div>
                  <h1 className="text-2xl font-black text-slate-900 leading-tight tracking-tight">{selectedEmail?.subject}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                      <User className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className="text-xs text-slate-500 font-bold">{selectedEmail?.from_email}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      if (expandedMessages.size === selectedThreadMessages.length) {
                        setExpandedMessages(new Set());
                      } else {
                        setExpandedMessages(new Set(selectedThreadMessages.map(m => m.id)));
                      }
                    }}
                    className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400"
                    title="Toggle Expand All"
                  >
                    <Filter className="w-5 h-5" />
                  </button>
                  <button className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400"><Star className="w-5 h-5" /></button>
                  <button className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400"><Trash2 className="w-5 h-5" /></button>
                  <button className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400"><MoreVertical className="w-5 h-5" /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-4">
                  {selectedThreadMessages.map((msg, idx) => {
                    const isExpanded = expandedMessages.has(msg.id) || idx === selectedThreadMessages.length - 1;
                    return (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-[1.5rem] shadow-sm border border-slate-200/60 overflow-hidden"
                      >
                        <div 
                          onClick={() => toggleMessageExpansion(msg.id)}
                          className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${msg.direction === 'outbound' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                              {msg.from_email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{msg.from_email.split('<')[0].trim() || msg.from_email}</p>
                              <p className="text-[9px] text-slate-400 font-bold">{new Date(msg.received_at).toLocaleString()}</p>
                            </div>
                          </div>
                          {!isExpanded && (
                            <p className="flex-1 px-8 text-xs text-slate-400 truncate italic">
                              "{msg.snippet}"
                            </p>
                          )}
                          <div className={`p-1.5 rounded-lg transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-8 pt-0 border-t border-slate-50">
                            <div className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium text-slate-700 py-6">
                              {msg.body_text || msg.body || msg.snippet}
                            </div>
                            {msg.body_html && (
                              <button 
                                onClick={() => window.open(`data:text/html;charset=utf-8,${encodeURIComponent(msg.body_html || '')}`)}
                                className="mt-4 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl text-[10px] text-slate-400 font-black flex items-center gap-2 transition-all"
                              >
                                <FileText className="w-3 h-3" />
                                VIEW SIGNAL SOURCE (HTML)
                              </button>
                            )}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
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

            {/* AI INTELLIGENCE PANEL (COPILOT) */}
            <div className="w-80 bg-white border-l border-slate-100 p-6 space-y-6 overflow-y-auto custom-scrollbar flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                    <BrainCircuit className="w-4 h-4" />
                  </div>
                  <h3 className="font-black text-slate-900 tracking-tight text-xs uppercase tracking-widest">Recruiter Copilot</h3>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>

              {/* Actionable Intelligence */}
              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">AI Command Center</p>
                <div className="grid grid-cols-1 gap-2">
                  <CopilotAction icon={Sparkles} label="Re-score Lead" onClick={() => toast.info("Re-evaluating lead...")} />
                  <CopilotAction icon={User} label="Deep Profile Extract" onClick={handleMapToCandidate} />
                  <CopilotAction icon={AlertCircle} label="Detect Urgency" onClick={() => toast.info("Urgency: High")} />
                  <CopilotAction icon={CheckCircle} label="Schedule Follow-up" onClick={() => toast.info("Task created in Follow-up Hub")} />
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              {selectedEmail.ai_metadata?.intent && (
                <div className="space-y-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Neural Categorization</p>
                  <div className="bg-slate-50 p-4 rounded-2xl space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-900 mb-2">Primary Intent</p>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg shadow-sm">
                        <Zap className="w-3 h-3 text-indigo-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{selectedEmail.ai_metadata.intent.replace('_', ' ')}</span>
                      </div>
                    </div>
                    
                    {selectedEmail.ai_metadata.score !== undefined && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-900 mb-2">Recruitment Value</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-white border border-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${selectedEmail.ai_metadata.score}%` }}
                              className="h-full bg-indigo-500 rounded-full" 
                            />
                          </div>
                          <span className="text-[10px] font-black text-indigo-600">{selectedEmail.ai_metadata.score}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedEmail.ai_metadata?.extracted && (
                <div className="space-y-4">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Candidate Intel</p>
                   <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
                        <User className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-slate-900 truncate">{selectedEmail.ai_metadata.extracted.name || 'Anonymous'}</p>
                        <p className="text-[9px] text-slate-500 font-bold uppercase truncate">{selectedEmail.ai_metadata.extracted.experience || 'Experience Unknown'}</p>
                      </div>
                    </div>

                    {selectedEmail.ai_metadata.extracted.skills && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedEmail.ai_metadata.extracted.skills.slice(0, 5).map((s: string) => (
                          <span key={s} className="px-2 py-0.5 bg-slate-50 text-slate-600 rounded text-[9px] font-bold uppercase border border-slate-100">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <button 
                      onClick={handleMapToCandidate}
                      className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                    >
                      Sync to Talent Hub
                    </button>
                  </div>
                </div>
              )}

              {selectedEmail.ai_metadata?.best_job_match && (
                <div className="bg-indigo-600 p-5 rounded-[2rem] text-white space-y-4 shadow-xl shadow-indigo-600/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <ShieldCheck className="w-20 h-20" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-[9px] font-black text-indigo-200 uppercase tracking-[0.2em] mb-2">Neural Match Result</p>
                    <h4 className="text-xs font-black leading-tight mb-2 uppercase tracking-wide">{selectedEmail.ai_metadata.best_job_match.job_title}</h4>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/20 rounded-lg text-[9px] font-black">
                      <Sparkles className="w-3 h-3" />
                      {selectedEmail.ai_metadata.best_job_match.score}% MATCH
                    </div>
                    <p className="text-[10px] text-indigo-100 mt-4 leading-relaxed italic">
                      "{selectedEmail.ai_metadata.best_job_match.reasoning}"
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-4">
                <button className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all group">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Full AI Analysis</span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
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

function CopilotAction({ icon: Icon, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
        <Icon className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
      </div>
      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest group-hover:text-indigo-600">{label}</span>
      <ChevronRight className="w-3 h-3 text-slate-300 ml-auto group-hover:text-indigo-400 transition-transform group-hover:translate-x-0.5" />
    </button>
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
      <p className={`text-xs font-black leading-tight mb-2 uppercase tracking-wide ${isUnread ? 'text-slate-900' : 'text-slate-500'}`}>
        {latest.subject}
      </p>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">
          {latest.from_email.charAt(0).toUpperCase()}
        </div>
        <p className={`text-[10px] font-bold truncate ${isUnread ? 'text-slate-900' : 'text-slate-600'}`}>
          {latest.from_email.split('<')[0].trim() || latest.from_email}
        </p>
      </div>
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
  const [isGeneratingSubject, setIsGeneratingSubject] = useState(false);

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

  const handleGenerateSubject = async () => {
    if (!content.trim()) {
      toast.error("Please draft some content first.");
      return;
    }
    setIsGeneratingSubject(true);
    try {
      const { callAISecureProxy } = await import('@/lib/ai');
      const response = await callAISecureProxy(`Analyze this email content and suggest a compelling, professional, one-line subject.
        Content: ${content}
        Return ONLY the subject line text.`);
      setSubject(response.replace(/"/g, '').trim());
      toast.success("Neural Subject Captured");
    } catch (err: any) {
      toast.error("Subject generation failure");
    } finally {
      setIsGeneratingSubject(false);
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
                <div className="relative group flex items-center gap-2">
                   <div className="flex-1 relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</div>
                    <input 
                      type="text" 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full pl-20 py-3 border-b border-slate-100 outline-none focus:border-indigo-500 transition-all font-bold text-sm"
                    />
                   </div>
                   <button
                    onClick={handleGenerateSubject}
                    disabled={isGeneratingSubject || !content.trim()}
                    className="flex-shrink-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent group/btn"
                    title="Generate AI Subject"
                   >
                    {isGeneratingSubject ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />}
                   </button>
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
