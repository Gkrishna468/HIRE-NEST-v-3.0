import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const {
          data: { session },
          error
        } = await supabase.auth.getSession();

        if (error || !session) {
          console.error("NO SESSION FOUND IN CALLBACK");
          // If no session immediately, wait briefly or redirect
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (event === 'SIGNED_IN' && newSession) {
              subscription.unsubscribe();
              window.location.reload(); // Refresh to catch session properly
            }
          });
          
          setTimeout(() => {
            subscription.unsubscribe();
            if (!session) navigate('/login');
          }, 5000);
          return;
        }

        const accessToken =
          session.provider_token ||
          session.user?.user_metadata?.provider_token ||
          null;

        const refreshToken =
          session.provider_refresh_token ||
          session.user?.user_metadata?.provider_refresh_token ||
          null;

        const gmailEmail =
          session.user?.user_metadata?.email ||
          session.user?.email;

        console.log("SESSION:", session);
        console.log("ACCESS_TOKEN:", accessToken ? "PRESENT" : "MISSING");
        console.log("REFRESH_TOKEN:", refreshToken ? "PRESENT" : "MISSING");
        console.log("GMAIL_EMAIL:", gmailEmail);

        const syncStatus = refreshToken ? "READY" : "ERROR";

        const { error: upsertError } = await supabase
          .from("integrations")
          .upsert({
            user_id: session.user.id,
            provider: 'google',
            access_token: accessToken,
            refresh_token: refreshToken,
            metadata: { 
              gmail_email: gmailEmail,
              connected: true,
              sync_status: syncStatus
            },
            updated_at: new Date().toISOString()
          }, {
            onConflict: "user_id,provider"
          });

        if (upsertError) {
          console.error("UPSERT ERROR FULL DETAILS:", JSON.stringify(upsertError, null, 2));
          toast.error(`Failed to persist Gmail credentials: ${upsertError.message}`);
        } else {
          console.log("INTEGRATION PERSISTED SUCCESSFULLY - STATUS:", syncStatus);
          if (syncStatus === "ERROR") {
            toast.error("Critical: Google failed to provide a Refresh Token. Re-link with consent.");
          } else {
            toast.success('Neural Link Established.');
          }
        }

        // Redirect to email center for immediate sync
        navigate('/emails');
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
