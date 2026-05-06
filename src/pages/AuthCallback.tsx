import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuth = async () => {
      try {
        // With HashRouter + Supabase, the session might already be established by the time this mounts
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {
          toast.success('Neural Link Established.');
          
          const googleToken = data.session.provider_token;
          const { user } = data.session;
          
          if (googleToken) {
            await supabase.from('profiles').upsert({
              id: user.id,
              metadata: { 
                google_token: googleToken,
                last_auth: new Date().toISOString()
              },
              email: user.email,
              updated_at: new Date().toISOString()
            });
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
