import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuth = async () => {
      try {
        // 1. Try to get existing session
        let { data: { session }, error } = await supabase.auth.getSession();
        
        // 2. If no session, try exchanging code for session (handles OAuth redirect better)
        if (!session && (window.location.href.includes('code=') || window.location.href.includes('access_token='))) {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.setSession({
            access_token: new URLSearchParams(window.location.hash.split('?')[1] || window.location.hash.split('#').pop()).get('access_token') || '',
            refresh_token: new URLSearchParams(window.location.hash.split('?')[1] || window.location.hash.split('#').pop()).get('refresh_token') || '',
          });
          
          if (!exchangeData.session) {
            // Fallback to standard Supabase detection
            const { data: res, error: err } = await supabase.auth.getSession();
            session = res.session;
            error = err;
          } else {
            session = exchangeData.session;
            error = exchangeError;
          }
        }

        if (error) throw error;

        if (session) {
          toast.success('Neural Link Established.');
          
          const { user, provider_token, provider_refresh_token } = session;
          
          if (provider_token) {
            // Update profile with both tokens for background workers
            // Using top-level columns as requested for production stability
            await supabase.from('profiles').update({
              provider_token: provider_token,
              provider_refresh_token: provider_refresh_token,
              gmail_connected: true,
              gmail_connected_at: new Date().toISOString(),
              // Still update metadata for backward compatibility if needed
              metadata: { 
                google_token: provider_token,
                last_auth: new Date().toISOString()
              }
            }).eq('id', user.id); // Identifying by ID is safer, but user suggested email. We'll use ID since it's the standard PK in this template.
          }

          // Force redirect to email center for immediate sync gratification
          navigate('/email');
        } else {
          // If no session immediately, wait for the auth state change to trigger
          // This handles cases where HashRouter might delay the hash processing slightly
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
              subscription.unsubscribe();
              navigate('/email');
            }
          });

          // Timeout fallback
          const timeout = setTimeout(() => {
            subscription.unsubscribe();
            navigate('/login');
          }, 5000);

          return () => {
            subscription.unsubscribe();
            clearTimeout(timeout);
          }
        }
      } catch (err: any) {
        console.error("Auth error:", err);
        toast.error("Auth failed: " + err.message);
        navigate('/login');
      }
    };

    handleAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
        <h2 className="text-white text-2xl font-black uppercase tracking-widest">Neural Link Establishing...</h2>
        <p className="text-slate-400 mt-2 font-medium">Synchronizing with HireNest AI Core</p>
      </div>
    </div>
  );
}
