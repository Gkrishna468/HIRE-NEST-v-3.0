import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  FileText, 
  Handshake, 
  Activity, 
  ArrowRight,
  ShieldCheck,
  Globe,
  Plus,
  Briefcase,
  TrendingUp,
  Percent,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { getMarketplaceStats } from '@/services/marketplaceService';
import { motion } from 'motion/react';

export default function Marketplace() {
  const { clients, vendors, jobs } = useData();
  const { user } = useAuth();
  const [stats, setStats] = useState({ activeNegotiations: 24, placementsCount: 3, efficiency: 40 });
  const [activeTab, setActiveTab] = useState<'bids' | 'slas'>('bids');

  // Derived role
  const isVendor = user?.role === 'vendor' || user?.role === 'vendor_manager';
  const isClient = user?.role === 'client' || user?.role === 'client_manager';

  useEffect(() => {
    async function fetchStats() {
      try {
        const liveStats = await getMarketplaceStats();
        setStats(liveStats);
      } catch (err) {
        console.error("Failed to fetch live marketplace stats");
      }
    }
    fetchStats();
  }, [jobs]);

  const mockBids = [
    { id: '1', job: 'Senior Frontend Engineer', vendor: 'Nexus Talent Corp', fee: 12, guarantee: 90, sla: 5, status: 'pending' },
    { id: '2', job: 'Head of Product', vendor: 'Elite Search', fee: 15, guarantee: 120, sla: 7, status: 'accepted' },
    { id: '3', job: 'DevOps Lead', vendor: 'CloudScale Staffing', fee: 10, guarantee: 60, sla: 3, status: 'rejected' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Marketplace <span className="text-indigo-600">Dynamics</span></h1>
          <p className="text-slate-500 font-medium mt-1">Vendor bidding, SLAs, and placement commissions.</p>
        </div>
        {!isClient && (
          <button className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl">
            <Plus className="w-4 h-4" />
            {isVendor ? 'Submit New Bid' : 'Broadcast to Vendors'}
          </button>
        )}
      </div>

      <div className="flex gap-4 border-b border-slate-200 pb-px">
        <button 
          onClick={() => setActiveTab('bids')}
          className={cn(
            "pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-colors",
            activeTab === 'bids' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          Active Bids / Tenders
        </button>
        <button 
          onClick={() => setActiveTab('slas')}
          className={cn(
            "pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-colors",
            activeTab === 'slas' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          SLA & Commission Tracking
        </button>
      </div>

      {activeTab === 'bids' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Overall Market Stats */}
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Marketplace Volume</h3>
              <div className="space-y-6">
                {[
                  { label: 'Active Broadcasts', value: jobs.filter(j => j.status === 'open').length, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Pending Bids', value: mockBids.filter(b => b.status === 'pending').length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Winning Vendors', value: vendors.length, icon: Globe, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                ].map(stat => (
                  <div key={stat.label} className="flex items-center gap-4">
                    <div className={cn("p-3 rounded-2xl", stat.bg)}>
                      <stat.icon className={cn("w-6 h-6", stat.color)} />
                    </div>
                    <div>
                      <div className="text-2xl font-black text-slate-900">{stat.value}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
               <ShieldCheck className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
               <h3 className="text-lg font-black mb-1 tracking-tight">Automated Enforcement</h3>
               <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-6">Contract & SLA Validation</p>
               <div className="space-y-3">
                 <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Avg Fee Match</span>
                   <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[9px] font-black">12.5%</span>
                 </div>
                 <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Avg Time-to-Fill</span>
                   <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full text-[9px] font-black">18 DAYS</span>
                 </div>
               </div>
            </div>
          </div>

          {/* Right: Bids Feed */}
          <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Active Vendor Proposals</h3>
            </div>

            <div className="space-y-4">
              {mockBids.map((bid, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={bid.id} 
                  className="p-6 rounded-3xl border border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:bg-white hover:shadow-lg hover:border-indigo-100 transition-all duration-500 relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-100 text-indigo-600 shadow-sm group-hover:scale-110 transition-transform">
                      <Briefcase className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 tracking-tight">{bid.job}</h4>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{bid.vendor}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-6 ml-14 md:ml-0 border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 mt-2 md:mt-0">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Proposed Fee</span>
                      <div className="flex items-center gap-1 font-black text-slate-900">
                        <Percent className="w-3 h-3 text-emerald-500" />
                        {bid.fee}%
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Guarantee</span>
                      <div className="flex items-center gap-1 font-black text-slate-900">
                        <ShieldCheck className="w-3 h-3 text-indigo-500" />
                        {bid.guarantee}d
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">SLA Time</span>
                      <div className="flex items-center gap-1 font-black text-slate-900">
                        <Clock className="w-3 h-3 text-amber-500" />
                        {bid.sla}d
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       {bid.status === 'pending' && <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-100">Pending</span>}
                       {bid.status === 'accepted' && <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100">Accepted</span>}
                       {bid.status === 'rejected' && <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-rose-100">Rejected</span>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-x-auto">
              <h3 className="text-lg font-black text-slate-900 tracking-tight mb-8">Commission & Realized Revenue</h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="pb-4 pr-6">Job / Resource</th>
                    <th className="pb-4 px-6">Vendor</th>
                    <th className="pb-4 px-6">Placement Date</th>
                    <th className="pb-4 px-6 text-right">Base Salary</th>
                    <th className="pb-4 px-6 text-right">Fee Rate</th>
                    <th className="pb-4 px-6 text-right">Commission Due</th>
                    <th className="pb-4 pl-6 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium">
                  <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="py-5 pr-6 font-bold">
                      <div className="text-slate-900">Frontend React Dev</div>
                      <div className="text-[10px] text-slate-400 uppercase">John Doe</div>
                    </td>
                    <td className="py-5 px-6">Nexus Talent Corp</td>
                    <td className="py-5 px-6">Oct 12, 2024</td>
                    <td className="py-5 px-6 text-right font-mono text-slate-500">₹24,00,000</td>
                    <td className="py-5 px-6 text-right font-black text-emerald-600">8.33%</td>
                    <td className="py-5 px-6 text-right font-mono font-bold text-slate-900">₹2,00,000</td>
                    <td className="py-5 pl-6">
                      <div className="flex justify-center">
                        <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-lg">
                          <CheckCircle2 className="w-3 h-3" /> Paid
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="py-5 pr-6 font-bold">
                      <div className="text-slate-900">VP Engineering</div>
                      <div className="text-[10px] text-slate-400 uppercase">Sarah Smith</div>
                    </td>
                    <td className="py-5 px-6">Elite Search</td>
                    <td className="py-5 px-6">Nov 01, 2024</td>
                    <td className="py-5 px-6 text-right font-mono text-slate-500">₹85,00,000</td>
                    <td className="py-5 px-6 text-right font-black text-emerald-600">12%</td>
                    <td className="py-5 px-6 text-right font-mono font-bold text-slate-900">₹10,20,000</td>
                    <td className="py-5 pl-6">
                      <div className="flex justify-center">
                        <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-lg">
                          <AlertCircle className="w-3 h-3" /> Invoiced
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
        </div>
      )}
    </div>
  );
}
