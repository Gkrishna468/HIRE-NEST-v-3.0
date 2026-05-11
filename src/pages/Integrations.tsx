import React, { useState } from 'react';
import { 
  Puzzle, 
  Link as LinkIcon, 
  Mail, 
  FileText, 
  Zap, 
  Megaphone, 
  Building2, 
  Calendar,
  MessageSquare,
  Database,
  Briefcase,
  Webhook,
  Activity,
  CheckCircle2,
  Plus,
  Settings,
  ChevronRight,
  Shield,
  Coins,
  Package
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Plugin {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'active' | 'inactive' | 'configuring';
  category: 'erp' | 'ai' | 'ops';
}

interface Connector {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'connected' | 'disconnected';
  url?: string;
  events?: string[];
}

const PLUGINS: Plugin[] = [
  { id: 'gmail', name: 'Gmail Ingestion', description: 'Enterprise OS intelligence for parsing communication streams.', icon: Mail, status: 'active', category: 'ops' },
  { id: 'finance', name: 'Financial Reconciliation', description: 'Auto-balance ledgers and treasury forecasts.', icon: Coins, status: 'configuring', category: 'erp' },
  { id: 'inventory', name: 'Inventory Intelligence', description: 'Neural management of B2B asset supply chains.', icon: Package, status: 'inactive', category: 'erp' },
  { id: 'parser', name: 'Entity Parser', description: 'AI module for extracting data from documents/contracts.', icon: FileText, status: 'active', category: 'ai' },
  { id: 'match', name: 'Opportunity Scoring', description: 'Intelligence engine matching resources to requirements.', icon: Zap, status: 'active', category: 'ai' },
  { id: 'calendar', name: 'Enterprise Scheduler', description: 'Cross-departmental availability and logistics matching.', icon: Calendar, status: 'inactive', category: 'ops' },
];

const CONNECTORS: Connector[] = [
  { id: 'crm', name: 'Operational CRM', description: 'Bridge to external recruitment/sales execution layers.', icon: Database, status: 'disconnected' },
  { id: 'erp_external', name: 'Legacy ERP Sync', description: 'Bi-directional bridge to SAP/Oracle/Dynamics.', icon: Briefcase, status: 'disconnected' },
  { id: 'slack', name: 'Enterprise Comms', description: 'Emit ERP events to departmental Slack/Teams channels.', icon: MessageSquare, status: 'disconnected' },
  { id: 'webhook', name: 'Event Bus Webhook', description: 'Custom event-driven integration bridge.', icon: Webhook, status: 'disconnected' },
];

export default function Integrations() {
  const [activeTab, setActiveTab] = useState<'plugins' | 'connectors'>('plugins');
  const [configuringWebhook, setConfiguringWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('https://crm.hirenestworkforce.com/api/intake');
  const [configuringPlugin, setConfiguringPlugin] = useState<Plugin | null>(null);

  const handleSaveWebhook = () => {
    toast.success('Webhook connector saved and active.', {
      description: 'Event router will now emit to ' + webhookUrl
    });
    setConfiguringWebhook(false);
  };

  const handleSavePlugin = () => {
    toast.success(`${configuringPlugin?.name} configuration saved.`, {
      description: 'Plugin is now active and routing to ERP core engine.'
    });
    setConfiguringPlugin(null);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight underline decoration-indigo-500 decoration-4 underline-offset-8">Enterprise ERP Architecture</h1>
        <p className="text-slate-500 mt-4 font-medium italic">Founder & CTO Vision: Modular intelligence governing internal OS plugins and external bridges.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Architecture Header */}
        <div className="flex border-b border-slate-200 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('plugins')}
            className={`flex-1 py-4 px-6 flex items-center justify-center gap-3 font-bold text-sm transition-all relative ${
              activeTab === 'plugins' ? 'text-indigo-700 bg-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Puzzle className={`w-5 h-5 ${activeTab === 'plugins' ? 'text-indigo-600' : 'text-slate-400'}`} />
            Internal Plugins (Capabilities)
            {activeTab === 'plugins' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
          </button>
          <div className="w-px bg-slate-200" />
          <button
            onClick={() => setActiveTab('connectors')}
            className={`flex-1 py-4 px-6 flex items-center justify-center gap-3 font-bold text-sm transition-all relative ${
              activeTab === 'connectors' ? 'text-indigo-700 bg-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <LinkIcon className={`w-5 h-5 ${activeTab === 'connectors' ? 'text-indigo-600' : 'text-slate-400'}`} />
            External Connectors (Bridges)
            {activeTab === 'connectors' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
          </button>
        </div>

        {/* Content Area */}
        <div className="p-8">
          {activeTab === 'plugins' && (
            <div className="animate-in fade-in duration-300">
              <div className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500" />
                  ERP Intelligence Layer
                </h2>
                <p className="text-slate-500 text-sm mt-1">Foundational modules running INSIDE the ERP to provide unified business orchestration.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PLUGINS.map(plugin => (
                  <div key={plugin.id} className="p-5 border border-slate-200 rounded-xl hover:border-indigo-200 hover:shadow-md transition-all group bg-white">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        plugin.status === 'active' ? 'bg-indigo-50 text-indigo-600' : 
                        plugin.status === 'configuring' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'
                      }`}>
                        <plugin.icon className="w-5 h-5" />
                      </div>
                      {plugin.status === 'active' ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-600 bg-green-50 px-2 py-1 rounded-md">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : plugin.status === 'configuring' ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                          Pending
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                          Inactive
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1">{plugin.name}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed min-h-[40px]">{plugin.description}</p>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <button 
                        onClick={() => setConfiguringPlugin(plugin)}
                        className="text-sm font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                      >
                        <Settings className="w-4 h-4" /> Manage Plugin
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {configuringPlugin && (
                <div className="mt-8 p-6 bg-slate-50 border border-slate-200 text-left rounded-xl animate-in slide-in-from-bottom-4 shadow-inner">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-slate-900 flex items-center gap-2 text-xl">
                        <configuringPlugin.icon className="w-6 h-6 text-indigo-500" />
                        ERP Plugin: {configuringPlugin.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 uppercase tracking-tighter font-black">Architecture Class: {configuringPlugin.category.toUpperCase()}</p>
                    </div>
                  </div>
                  
                  {configuringPlugin.id === 'gmail' && (
                    <div className="space-y-6">
                      <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-sm">
                        <h4 className="text-sm font-black text-slate-800 uppercase flex items-center gap-2">
                           <Webhook className="w-4 h-4 text-indigo-500" />
                           Ingestion Gateway Configuration
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          This plugin exposes a neural ingestion point for your communication infrastructure. 
                          By linking <b>crm.hirenestworkforce.com</b> (Execution Layer) to this endpoint, 
                          ingoing emails are automatically synchronized with the Human Capital and Supply Chain modules.
                        </p>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                              ERP Receiving URI (Gmail Ingestion Endpoint)
                            </label>
                            <div className="flex shadow-sm">
                              <input 
                                type="url" 
                                readOnly
                                value="https://app.hirenestworkforce.com/api/plugins/gmail/ingest"
                                className="w-full px-4 py-2 border border-slate-200 rounded-l-lg text-sm bg-slate-50 text-slate-600 outline-none font-mono"
                              />
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText("https://app.hirenestworkforce.com/api/plugins/gmail/ingest");
                                  toast.success('Endpoint URL copied to clipboard');
                                }}
                                className="px-5 py-2 bg-indigo-600 text-white border-y border-r border-indigo-600 rounded-r-lg font-bold text-sm hover:bg-indigo-700 transition-colors shrink-0"
                              >
                                Copy URI
                              </button>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                <span className="text-[10px] text-slate-500 font-bold">ERP Core listening...</span>
                            </div>
                          </div>
                          
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center space-y-3">
                              <h5 className="font-bold text-sm text-slate-800">Authenticate Organization Account</h5>
                              <p className="text-xs text-slate-500 text-center px-4">
                                To allow the Neural Inbox to automatically pull and parse incoming communications, you must grant read access to a specific Google account. Let the ERP fetch emails for intelligent analysis.
                              </p>
                              <button
                                onClick={async () => {
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
                                }}
                                className="mt-2 bg-slate-900 text-white hover:bg-slate-800 flex items-center justify-center gap-2 font-bold px-6 py-2.5 rounded-lg transition-colors shadow-md w-full max-w-sm"
                              >
                                <Mail className="w-4 h-4" /> Connect Workspace Gmail
                              </button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                                  Auth Key (X-ERP-Secret)
                                </label>
                                <input 
                                  type="password" 
                                  readOnly
                                  value="hn_plug_os_92f3a8b71d9e4c5a"
                                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 outline-none font-mono tracking-widest"
                                />
                            </div>
                            <div className="bg-slate-900 rounded-lg p-3 flex flex-col justify-center">
                                <p className="text-[10px] text-indigo-300 font-black uppercase mb-1">Downstream Automation</p>
                                <p className="text-[9px] text-slate-400 font-medium">Auto-triggers: Resume Parser ➔ Talent Scorer ➔ Finance Ledger ➔ Slack Notifier</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
                         <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                         <div className="text-xs text-amber-800 leading-relaxed">
                            <strong>CTO Protocol:</strong> Ensure your external system (CRM) uses <code>POST</code> with <code>Application/JSON</code> and the correct bearer token. 
                            Unauthorized attempts will be logged and blocked at the Enterprise Firewall.
                         </div>
                      </div>
                    </div>
                  )}

                  {configuringPlugin.id !== 'gmail' && (
                    <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 mt-4">
                      {configuringPlugin.name} configuration interface is currently being provisioned by the ERP Engineering team.
                    </div>
                  )}
                  
                  <div className="mt-6 flex gap-3 border-t border-slate-200 pt-6">
                    <button 
                      onClick={handleSavePlugin}
                      className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                    >
                      Enterprise Sync
                    </button>
                    <button 
                      onClick={() => setConfiguringPlugin(null)}
                      className="bg-white text-slate-600 border border-slate-200 px-6 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'connectors' && (
            <div className="animate-in fade-in duration-300">
              <div className="mb-8">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Webhook className="w-5 h-5 text-indigo-500" />
                  ERP Connector Ecosystem (External Bridges)
                </h2>
                <p className="text-slate-500 text-sm mt-1">Strategic bridges connecting the ERP core to external legacy systems and operational execution platforms.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {CONNECTORS.map(connector => (
                  <div key={connector.id} className="flex gap-4 p-5 border border-slate-200 rounded-xl hover:border-indigo-200 hover:shadow-md transition-all group bg-white shadow-sm">
                     <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center shrink-0 border border-slate-100">
                        <connector.icon className="w-6 h-6" />
                     </div>
                     <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-slate-900">{connector.name}</h3>
                          {connector.status === 'connected' ? (
                            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 mb-3">{connector.description}</p>
                        
                        {connector.id === 'crm' || connector.id === 'webhook' ? (
                          <button 
                            onClick={() => setConfiguringWebhook(true)}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <LinkIcon className="w-3 h-3" /> Bridge System
                          </button>
                        ) : (
                          <button className="bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5">
                            <Plus className="w-3 h-3" /> Initialize
                          </button>
                        )}
                     </div>
                  </div>
                ))}
              </div>

              {configuringWebhook && (
                <div className="p-8 bg-indigo-900 border border-indigo-700 text-left rounded-2xl animate-in slide-in-from-bottom-4 shadow-2xl">
                  <div className="flex items-start gap-4 mb-6">
                      <div className="p-3 bg-indigo-500/20 rounded-xl">
                          <Webhook className="w-8 h-8 text-indigo-300" />
                      </div>
                      <div>
                          <h3 className="font-black text-white text-2xl tracking-tight">Configure Enterprise Webhook Bridge</h3>
                          <p className="text-sm text-indigo-300 max-w-xl mt-1">
                            Bind the ERP Event Bus to external HTTP endpoints. Securely transmit processed intelligence and financial events to your operational executors.
                          </p>
                      </div>
                  </div>
                  
                  <div className="space-y-6 max-w-2xl">
                    <div>
                      <label className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] mb-2 block">Strategic Endpoint URL</label>
                      <input 
                        type="url" 
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="w-full px-5 py-3 bg-indigo-950 border border-indigo-700 rounded-xl text-indigo-100 text-sm focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none font-mono placeholder:text-indigo-800"
                        placeholder="https://your-crm-instance.com/api/webhooks"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] mb-3 block">Subscribed ERP Business Events</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                            'hrm.candidate_submission', 
                            'finance.ledger_updated', 
                            'supply.vendor_matched', 
                            'ops.intel_parsed'
                        ].map(event => (
                          <span key={event} className="px-3 py-1.5 bg-indigo-950 border border-indigo-800 rounded-lg text-[11px] font-mono text-indigo-400 font-bold">
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="pt-4 flex gap-4">
                      <button 
                        onClick={handleSaveWebhook}
                        className="bg-white text-indigo-900 px-8 py-3 rounded-xl text-sm font-black shadow-xl hover:bg-indigo-50 transition-all uppercase tracking-widest"
                      >
                        Activate Protocol
                      </button>
                      <button 
                        onClick={() => setConfiguringWebhook(false)}
                        className="text-indigo-300 bg-indigo-800/30 border border-indigo-700 px-8 py-3 rounded-xl text-sm font-bold hover:bg-indigo-800/50 transition-all"
                      >
                        Abort
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
