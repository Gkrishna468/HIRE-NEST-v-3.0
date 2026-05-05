import { supabase } from "@/lib/supabase";

let lastLogTime = 0;
const LOG_THROTTLE_MS = 2000;

export async function safeLog(data: {
  type: string;
  agent_name?: string;
  message: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  status?: string;
  metadata?: any;
}) {
  const now = Date.now();
  
  // Throttle identical logs or rapid spam
  if (now - lastLogTime < LOG_THROTTLE_MS) {
    console.warn("Log throttled to prevent spam:", data.message);
    return;
  }
  
  lastLogTime = now;

  try {
    const { error } = await supabase.from('agent_logs').insert({
      type: data.type,
      agent_name: data.agent_name || 'System',
      level: data.level || 'info',
      status: data.status || 'info',
      message: data.message,
      metadata: data.metadata || {}
    });
    
    if (error) {
      console.warn("Log insert failed:", error);
    }
  } catch (err) {
    console.error("Critical logging failure:", err);
  }
}
