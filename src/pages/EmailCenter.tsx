import React, { useState, useEffect } from 'react';
import { Mail, Search, Inbox, AlertCircle, RefreshCw, Send, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { syncGmailInbox, setupGmailWatch } from '@/services/gmailService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export default function EmailCenter() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [watching, setWatching] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);

  useEffect(() => {
    fetchEmails();
  }, []);

  async function fetchEmails() {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setEmails(data || []);
      if (data && data.length > 0 && !selectedEmail) {
        setSelectedEmail(data[0]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load emails');
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    setNeedsAuth(false);
    toast.info('Initiating forced pull from Gmail API...');
    try {
      const res = await syncGmailInbox(true);
      toast.success(res.message);
      await fetchEmails();
    } catch (err: any) {
      if (err.message && err.message.includes('GMAIL_NOT_CONNECTED')) {
        setNeedsAuth(true);
        toast.error('Workspace Mail not linked. Please connect your account first.');
      } else {
        toast.error(err.message || 'Sync failed');
      }
    } finally {
      setSyncing(false);
    }
  }
  
  async function handleEnableAutoSync() {
    setWatching(true);
    setNeedsAuth(false);
    toast.info('Enabling Auto-Sync via Cloud Pub/Sub...');
    try {
      await setupGmailWatch();
      toast.success('Auto-Sync enabled! Emails will stream in real-time.');
    } catch (err: any) {
      if (err.message && err.message.includes('GMAIL_NOT_CONNECTED')) {
        setNeedsAuth(true);
        toast.error('Workspace Mail not linked. Please connect your account first.');
      } else {
        toast.error(err.message || 'Auto-Sync failed');
      }
    } finally {
      setWatching(false);
    }
  }

  async function connectGmail() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
          redirectTo: window.location.origin + '/#/auth/callback',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate Google OAuth');
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-64"><RefreshCw className="animate-spin text-indigo-500 w-8 h-8" /></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {needsAuth && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-3 items-center">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">Enterprise Workspace Mail disconnected.</h4>
              <p className="text-xs text-amber-700">You need to authorize the integration to sync and parse emails.</p>
            </div>
          </div>
          <button 
            onClick={connectGmail}
            className="shrink-0 bg-slate-900 text-white hover:bg-slate-800 font-bold px-5 py-2 rounded-lg text-sm transition shadow-sm"
          >
            Connect Workspace Email
          </button>
        </div>
      )}

      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
             <Mail className="w-8 h-8 text-indigo-600" />
             Neural Inbox
             <span className="text-xs bg-slate-900 text-white px-2 py-1 rounded font-black tracking-widest uppercase">Beta</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Enterprise Email Ingestion and Autonomous Analysis.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleEnableAutoSync} disabled={watching}
            className="flex items-center gap-2 bg-slate-100 text-slate-600 px-5 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition disabled:opacity-50 border border-slate-200"
          >
            <AlertCircle className={cn("w-4 h-4", watching && "animate-spin")} />
            {watching ? 'Enabling...' : 'Enable Auto-Sync'}
          </button>
          <button 
            onClick={handleManualSync} disabled={syncing}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex">
        {/* Email List Sidebar */}
        <div className="w-1/3 border-r border-slate-200 flex flex-col bg-slate-50">
          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search emails..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {emails.length === 0 ? (
               <div className="p-8 text-center text-slate-500">
                  <Inbox className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="font-bold">Inbox is empty</p>
                  <p className="text-xs mt-1">Connect Gmail in Integrations or click Sync Now.</p>
               </div>
            ) : (
              emails.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEmail(e)}
                  className={cn(
                    "w-full text-left p-4 border-b border-slate-100 hover:bg-white transition-colors relative",
                    selectedEmail?.id === e.id ? "bg-white border-l-4 border-l-indigo-600" : "border-l-4 border-l-transparent"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-slate-900 text-sm truncate pr-2">{e.from_email || 'Unknown Sender'}</span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {new Date(e.received_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium text-slate-700 truncate mb-1">{e.subject}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2">{e.snippet}</p>
                  
                  {e.ai_metadata && (
                    <div className="mt-2 flex gap-2">
                       <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600">{e.category || 'Analyzed'}</span>
                       {e.ai_priority > 70 && <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-orange-50 text-orange-600">High Intent</span>}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Email Content Area */}
        <div className="flex-1 flex flex-col bg-white">
          {selectedEmail ? (
            <>
              <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                 <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">{selectedEmail.subject}</h2>
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold uppercase">
                          {selectedEmail.from_email?.[0] || '?'}
                       </div>
                       <div>
                          <p className="font-bold text-slate-900 text-sm">{selectedEmail.from_email}</p>
                          <p className="text-xs text-slate-500">to {selectedEmail.to_email}</p>
                       </div>
                    </div>
                 </div>
                 <span className="text-sm text-slate-500 font-medium">{new Date(selectedEmail.received_at).toLocaleString()}</span>
              </div>
              
              {selectedEmail.ai_metadata && (
                <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100 flex items-start gap-4">
                  <div className="p-2 bg-white rounded-xl shadow-sm text-indigo-600"><AlertCircle className="w-5 h-5" /></div>
                  <div className="flex-1">
                    <h4 className="text-xs font-black uppercase tracking-widest text-indigo-900 mb-1">AI Context Analysis</h4>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <span className="text-xs text-indigo-600/70 uppercase font-bold block mb-1">Detected Intent</span>
                        <span className="font-medium text-indigo-900">{selectedEmail.ai_metadata?.intent || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-indigo-600/70 uppercase font-bold block mb-1">Priority Score</span>
                        <span className="font-medium text-indigo-900">{selectedEmail.ai_priority || 0}/100</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 p-6 overflow-y-auto prose prose-sm max-w-none prose-indigo">
                 {selectedEmail.body_html ? (
                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }} />
                 ) : (
                    <div className="whitespace-pre-wrap">{selectedEmail.body}</div>
                 )}
              </div>
            </>
          ) : (
             <div className="flex-1 flex items-center justify-center text-slate-400">
               <p>Select an email to view details</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
