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
          
          if (session.user) {
            console.log("SESSION:", session);

            const providerToken =
              session.provider_token ||
              (session.user as any)?.user_metadata?.provider_token ||
              null;

            const refreshToken =
              session.provider_refresh_token ||
              null;

            console.log("PROVIDER TOKEN:", providerToken);
            console.log("REFRESH TOKEN:", refreshToken);

            const { error: profileError } = await supabase
              .from("profiles")
              .upsert(
                {
                  email: session.user.email,
                  gmail_connected: true,
                  provider_token: providerToken,
                  provider_refresh_token: refreshToken,
                  updated_at: new Date().toISOString(),
                  metadata: { 
                    google_token: providerToken,
                    last_auth: new Date().toISOString()
                  }
                },
                {
                  onConflict: "email"
                }
              );

            if (profileError) {
              console.error("PROFILE SAVE ERROR", profileError);
            } else {
              console.log("PROFILE UPDATED");
            }
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
