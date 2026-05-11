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
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

interface Plugin {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'active' | 'inactive' | 'configuring';
  category: 'core' | 'ai' | 'outreach';
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
  { id: 'gmail', name: 'Gmail Ingestion', description: 'Internal OS intelligence for parsing emails.', icon: Mail, status: 'active', category: 'core' },
  { id: 'parser', name: 'Resume Parser', description: 'AI module for extracting entities from resumes.', icon: FileText, status: 'active', category: 'ai' },
  { id: 'match', name: 'Match Score', description: 'Intelligence engine scoring candidates against jobs.', icon: Zap, status: 'active', category: 'ai' },
  { id: 'outreach', name: 'Outreach Agent', description: 'Automated workflow engine for candidate outreach.', icon: Megaphone, status: 'inactive', category: 'outreach' },
  { id: 'vendor', name: 'Vendor Intelligence', description: 'Rates and ranks vendor performance automatically.', icon: Building2, status: 'inactive', category: 'ai' },
  { id: 'calendar', name: 'Calendar Engine', description: 'Internal scheduling and availability matching.', icon: Calendar, status: 'inactive', category: 'core' },
];

const CONNECTORS: Connector[] = [
  { id: 'crm', name: 'CRM Connector', description: 'Bridge to crm.hirenestworkforce.com or other CRMs.', icon: Database, status: 'disconnected' },
  { id: 'slack', name: 'Slack Connector', description: 'Emit OS events to Slack channels.', icon: MessageSquare, status: 'disconnected' },
  { id: 'bullhorn', name: 'Bullhorn ATS', description: 'Sync candidate pipeline with Bullhorn.', icon: Briefcase, status: 'disconnected' },
  { id: 'salesforce', name: 'Salesforce', description: 'Push client intelligence to Salesforce.', icon: Activity, status: 'disconnected' },
  { id: 'ceipal', name: 'Ceipal ATS', description: 'Bi-directional sync with Ceipal.', icon: Briefcase, status: 'disconnected' },
  { id: 'webhook', name: 'Generic Webhook', description: 'Custom event-driven webhook bridge.', icon: Webhook, status: 'disconnected' },
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
      description: 'Plugin is now active and routing to OS core engine.'
    });
    setConfiguringPlugin(null);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">HireNest OS Architecture</h1>
        <p className="text-slate-500 mt-1">Manage internal AI intelligence plugins and external system connectors.</p>
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
            Plugins (Internal Capabilities)
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
            Connectors (External Bridges)
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
                  Core Intelligence Layer
                </h2>
                <p className="text-slate-500 text-sm mt-1">These modules run INSIDE your OS to provide AI orchestration and intelligence.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PLUGINS.map(plugin => (
                  <div key={plugin.id} className="p-5 border border-slate-200 rounded-xl hover:border-indigo-200 hover:shadow-md transition-all group bg-white">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        plugin.status === 'active' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'
                      }`}>
                        <plugin.icon className="w-5 h-5" />
                      </div>
                      {plugin.status === 'active' ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-600 bg-green-50 px-2 py-1 rounded-md">
                          <CheckCircle2 className="w-3 h-3" /> Active
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
                        <Settings className="w-4 h-4" /> Configure Plugin
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {configuringPlugin && (
                <div className="mt-8 p-6 bg-slate-50 border border-slate-200 text-left rounded-xl animate-in slide-in-from-bottom-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <configuringPlugin.icon className="w-5 h-5 text-indigo-500" />
                      Configure {configuringPlugin.name}
                    </h3>
                  </div>
                  
                  {configuringPlugin.id === 'gmail' && (
                    <>
                      <p className="text-xs text-slate-500 mb-6 max-w-2xl">
                        This AI plugin exposes a webhook connector for your CRM (<b>crm.hirenestworkforce.com</b>) to push ingested emails securely into the OS core intelligence layer. The OS will automatically trigger Resume Parsing and Match AI plugins.
                      </p>
                      
                      <div className="space-y-5 max-w-2xl bg-white p-5 rounded-xl border border-slate-200">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                            OS Receiving Endpoint (Email Connector URI)
                          </label>
                          <div className="flex">
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
                              className="px-4 py-2 bg-slate-100 border-y border-r border-slate-200 rounded-r-lg text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">Configure your CRM to POST to this endpoint when an email is ingested.</p>
                        </div>
                        
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                            Plugin Secret Key
                          </label>
                          <input 
                            type="password" 
                            readOnly
                            value="hn_plug_os_92f3a8b71d9e4c5a"
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 outline-none font-mono tracking-widest"
                          />
                        </div>

                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-700">
                          <strong>Active Pipeline:</strong> Ingest Email ➔ AI Parsing Plugin ➔ Match Score Plugin ➔ Event Dispatcher
                        </div>
                      </div>
                    </>
                  )}

                  {configuringPlugin.id !== 'gmail' && (
                    <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 mt-4">
                      Configuration for {configuringPlugin.name} will be available in the next OS update.
                    </div>
                  )}
                  
                  <div className="mt-6 flex gap-3">
                    <button 
                      onClick={handleSavePlugin}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors"
                    >
                      Save Configuration
                    </button>
                    <button 
                      onClick={() => setConfiguringPlugin(null)}
                      className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                    >
                      Close
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
                  Event-Driven Integration Layer
                </h2>
                <p className="text-slate-500 text-sm mt-1">Connectors bridge your internal OS workflows to external operational execution layers (CRM, ATS, etc).</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {CONNECTORS.map(connector => (
                  <div key={connector.id} className="flex gap-4 p-5 border border-slate-200 rounded-xl hover:border-indigo-200 hover:shadow-md transition-all group bg-white">
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
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Plus className="w-3 h-3" /> Connect System
                          </button>
                        ) : (
                          <button className="bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                            <Plus className="w-3 h-3" /> Connect
                          </button>
                        )}
                     </div>
                  </div>
                ))}
              </div>

              {configuringWebhook && (
                <div className="p-6 bg-slate-50 border border-slate-200 text-left rounded-xl animate-in slide-in-from-bottom-4">
                  <h3 className="font-bold text-slate-900 mb-2">Configure Webhook Connector</h3>
                  <p className="text-xs text-slate-500 mb-4 max-w-xl">
                    Bind a secure webhook endpoint to OS Core events. When the Match Engine or Gmail Plugin extracts intelligence, events will be routed here.
                  </p>
                  
                  <div className="space-y-4 max-w-xl">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Endpoint URL</label>
                      <input 
                        type="url" 
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Subscribed Events</label>
                      <div className="flex flex-wrap gap-2">
                        {['candidate_submission.created', 'client_requirement.extracted', 'vendor.scored'].map(event => (
                          <span key={event} className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-mono text-slate-600">
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="pt-2 flex gap-3">
                      <button 
                        onClick={handleSaveWebhook}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors"
                      >
                        Save Connector Binding
                      </button>
                      <button 
                        onClick={() => setConfiguringWebhook(false)}
                        className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                      >
                        Cancel
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
