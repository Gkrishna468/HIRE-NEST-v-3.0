import React from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { 
  Briefcase, 
  Users, 
  Building2, 
  TrendingUp, 
  CheckCircle2, 
  ArrowUpRight, 
  Clock,
  CircleDollarSign,
  Zap,
  ShieldCheck,
  BarChart3,
  Cpu,
  Package,
  Globe,
  Coins,
  Activity as ActivityIcon,
  Search,
  Settings
} from 'lucide-react';

export default function Dashboard() {
  const { jobs, candidates, clients, vendors, logs, deals } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [billableRevenue, setBillableRevenue] = React.useState(0);

  React.useEffect(() => {
    async function fetchBilling() {
      if (typeof supabase !== 'undefined') {
        const { data } = await supabase.from('billing_events').select('value_generated');
        if (data) {
          const total = data.reduce((acc, curr) => acc + (Number(curr.value_generated) || 0), 0);
          setBillableRevenue(total);
        }
      }
    }
    fetchBilling();
  }, []);

  const totalRevenue = deals.reduce((sum, d) => sum + (Number(d.revenue_amount) || 0), 0) + billableRevenue;
  const closedDeals = deals.filter(d => d.status === 'placed').length;

  const stats = [
    { label: 'Talent Assets', value: candidates.length, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { label: 'Strategic Jobs', value: jobs.length, icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Global Vendors', value: vendors.length, icon: Package, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Active Pipeline', value: deals.length, icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'ERP Health', value: '99.9%', icon: Zap, color: 'text-orange-600', bg: 'bg-orange-100' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
             HireNest Enterprise ERP
             <span className="text-xs bg-slate-900 text-white px-2 py-1 rounded font-black tracking-widest uppercase">v3.0 Intelligence</span>
          </h1>
          <p className="text-slate-500 font-medium mt-2 max-w-2xl border-l-4 border-indigo-500 pl-4">
            Unified Resource Management Hub. CEO & CTO Console: Governing Human Capital, B2B Supply Chain, and Neural Financials.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Query ERP Data..." 
              className="bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 shadow-sm"
            />
          </div>
          <div className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{user?.role} NODE</span>
          </div>
        </div>
      </div>

      {/* Main ERP Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all group cursor-default">
            <div className="flex items-center justify-between mb-4">
              <div className={stat.bg + " p-3 rounded-xl transition-transform group-hover:rotate-12"}>
                <stat.icon className={stat.color + " w-6 h-6"} />
              </div>
              <ArrowUpRight className="text-slate-200 group-hover:text-slate-900 transition-colors" />
            </div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
            <h2 className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</h2>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Central Intelligence Feed */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-xl text-slate-900 flex items-center gap-2">
                  <ActivityIcon className="w-5 h-5 text-indigo-600" />
                  ERP Intelligence Feed
                </h3>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-black">Autonomous Plugin Logging</p>
              </div>
              <span className="text-[10px] font-black px-3 py-1.5 bg-green-100 text-green-700 rounded-lg flex items-center gap-2 border border-green-200">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                NEURAL SYNC ACTIVE
              </span>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[500px] p-4 space-y-3">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <div key={log.id} className="p-5 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-all flex items-start gap-4 group">
                    <div className="mt-1">
                      {log.level === 'error' ? (
                        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shadow-sm">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                          <Cpu className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 font-bold group-hover:text-indigo-600 transition-colors">{log.message}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">{log.type}</span>
                        <div className="flex items-center gap-1.5 text-slate-400">
                           <Clock className="w-3 h-3" />
                           <span className="text-[10px] font-medium italic">
                             {new Date(log.createdAt).toLocaleString()}
                           </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-20 text-slate-400 text-center">
                  <Package className="w-16 h-16 mb-4 opacity-10" />
                  <p className="font-bold text-slate-500">Awaiting Enterprise Signals...</p>
                  <p className="text-xs mt-1">Configure Plugins to start streaming unified intelligence.</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden group shadow-2xl">
                  <Globe className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 group-hover:opacity-20 transition-all duration-700 group-hover:-rotate-12" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-2">Supply Chain Node</h4>
                  <h3 className="text-2xl font-bold mb-4">Global Vendor Mesh</h3>
                  <div className="space-y-4 mb-6">
                      <div className="flex justify-between items-end border-b border-white/10 pb-2">
                          <span className="text-xs text-slate-400">Onboarded Vendors</span>
                          <span className="text-xl font-black text-white">{vendors.length}</span>
                      </div>
                      <div className="flex justify-between items-end border-b border-white/10 pb-2">
                          <span className="text-xs text-slate-400">Active Supply Lines</span>
                          <span className="text-xl font-black text-white">{jobs.length}</span>
                      </div>
                  </div>
                  <button 
                    onClick={() => navigate('/vendors')}
                    className="w-full py-3 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all"
                  >
                    Orchestrate Vendors
                  </button>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm group hover:border-indigo-500 transition-colors">
                  <div className="flex justify-between items-start mb-6">
                      <div className="p-3 bg-indigo-50 rounded-2xl">
                          <Coins className="w-6 h-6 text-indigo-600" />
                      </div>
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">Real-time Ledger</span>
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Financial Treasury</h4>
                  <h3 className="text-3xl font-black text-slate-900">${totalRevenue.toLocaleString()}</h3>
                  <p className="text-xs text-slate-500 mt-2 font-medium">Neural valuation of current B2B pipelines and billable events.</p>
                  
                  <div className="mt-8 pt-6 border-t border-slate-50 space-y-4">
                      <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                              <TrendingUp className="w-4 h-4" />
                          </div>
                          <div>
                              <p className="text-[10px] font-black uppercase text-slate-400">Growth Index</p>
                              <p className="text-sm font-bold text-slate-900">+12.4% Momentum</p>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-indigo-600 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-700">
              <ShieldCheck className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <h3 className="text-2xl font-black mb-2 tracking-tight">ERP Security Hub</h3>
              <p className="text-indigo-200 text-xs font-bold uppercase tracking-[0.2em] mb-6">Founding Module Core</p>
              
              <div className="space-y-5 mb-8">
                {[
                  { label: 'Ingestion Integrity', value: 98, color: 'bg-indigo-400' },
                  { label: 'Supply Resilience', value: 76, color: 'bg-blue-400' },
                  { label: 'Financial Guard', value: 92, color: 'bg-emerald-400' },
                ].map(item => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-indigo-200">
                      <span>{item.label}</span>
                      <span>{item.value}%</span>
                    </div>
                    <div className="h-2 w-full bg-indigo-900/40 rounded-full overflow-hidden border border-indigo-400/20">
                      <div className={item.color + " h-full rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(255,255,255,0.2)]"} style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => navigate('/intelligence')}
                className="w-full bg-white text-indigo-600 py-4 rounded-2xl font-black hover:bg-slate-50 transition-all uppercase text-[10px] tracking-[0.25em] shadow-lg"
              >
                Launch Intelligence OS
              </button>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[3rem] shadow-xl">
            <h3 className="font-bold text-white mb-6 flex items-center gap-2">
               <Briefcase className="w-5 h-5 text-indigo-500" />
               Enterprise Shortcuts
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: 'Audit Plugins', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', path: '/integrations', icon: Puzzle },
                { label: 'Strategic Ops', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', path: '/jobs', icon: Briefcase },
                { label: 'Talent Ledger', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', path: '/candidates', icon: Users },
                { label: 'ERP Settings', color: 'bg-slate-800 text-slate-400 border-slate-700', path: '/settings', icon: Settings },
              ].map(link => (
                <button 
                  key={link.label} 
                  onClick={() => navigate(link.path)}
                  className={link.color + " p-4 text-xs font-black rounded-2xl text-left hover:brightness-125 transition-all flex items-center justify-between border uppercase tracking-widest"}
                >
                   <div className="flex items-center gap-3">
                       <link.icon className="w-4 h-4" />
                       {link.label}
                   </div>
                   <ArrowUpRight className="w-4 h-4 opacity-20" />
                </button>
              ))}
            </div>
          </div>
          
          <div className="bg-indigo-50 border border-indigo-100 p-8 rounded-[3rem] text-center">
             <div className="w-16 h-16 bg-white rounded-2xl shadow-sm mx-auto mb-4 flex items-center justify-center">
                <BrainCircuit className="w-8 h-8 text-indigo-600" />
             </div>
             <h4 className="font-black text-indigo-900 uppercase tracking-tighter text-lg">Foundation Pillar</h4>
             <p className="text-xs text-indigo-600 font-medium mt-2 leading-relaxed">
                "Scaling human potential with neural infrastructure."
             </p>
             <div className="mt-6 pt-6 border-t border-indigo-200">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Corporate Mandate v2026</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Global UI Components needed
const Puzzle = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
);

const BrainCircuit = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2v3" /><path d="M12 19v3" /><path d="M20 12h2" /><path d="M2 12h2" /><path d="M19.07 4.93l-1.41 1.41" /><path d="M6.34 17.66l-1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" /><path d="M6.34 6.34L4.93 4.93" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);

