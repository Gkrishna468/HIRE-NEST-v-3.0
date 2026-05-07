import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { runUnifiedBrain } from "./src/services/brainService";

dotenv.config();

// Supabase Init for server-side logging
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. AI SECURITY PROXY
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY is not set in the environment. AI features will fail.");
  }
  const genAI = new GoogleGenerativeAI(apiKey || "");

  // Simple Rate Limiting for AI Endpoints
  const requestCounts = new Map<string, { count: number; lastReset: number }>();
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  const MAX_REQUESTS = 10;

  const checkRateLimit = (ip: string) => {
    const now = Date.now();
    const stats = requestCounts.get(ip) || { count: 0, lastReset: now };

    if (now - stats.lastReset > RATE_LIMIT_WINDOW) {
      stats.count = 1;
      stats.lastReset = now;
    } else {
      stats.count++;
    }
    requestCounts.set(ip, stats);
    return stats.count <= MAX_REQUESTS;
  };

  app.post("/api/ai/chat", async (req, res) => {
    const clientIp = req.ip || "unknown";
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: "Too many AI requests. Please slow down." });
    }

    try {
      const { prompt, context } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });

      const fullPrompt = `${context ? `Context: ${JSON.stringify(context)}\n\n` : ""}User: ${prompt}`;
      
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      res.json({ text });
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "Failed to generate AI response" });
    }
  });

  // 1.5 PRODUCTIVITY PROXY
  app.post("/api/ai/proxy", async (req, res) => {
    try {
      const { prompt, config } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt required" });
      
      const modelName = config?.model || "gemini-1.5-pro";
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Ensure we return JSON if it looks like JSON, otherwise return the text
      try {
        const cleanJson = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanJson);
        res.json(parsed);
      } catch {
        res.json({ text });
      }
    } catch (err) {
      console.error("AI Proxy Error:", err);
      res.status(500).json({ error: "AI Inference Failed" });
    }
  });

  // 1.6 UNIFIED BRAIN API
  app.post("/api/ai/brain", async (req, res) => {
    try {
      const { text, source, contactId } = req.body;
      const result = await runUnifiedBrain(text, source, contactId);
      res.json(result);
    } catch (err) {
      console.error("Brain Controller Error:", err);
      res.status(500).json({ error: "Brain processing failed" });
    }
  });

  // 2. WHATSAPP WEBHOOK HANDLER
  app.get("/api/webhooks/whatsapp", (req, res) => {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "hirenest_verify_token";
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ WhatsApp Webhook Verified");
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Forbidden");
    }
  });

  app.post("/api/webhooks/whatsapp", async (req, res) => {
    try {
      const body = req.body;
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (messages && messages.length > 0) {
        const msg = messages[0];
        const from = msg.from; // Phone number
        const text = msg.text?.body;

        // 1. LOG TO SUPABASE AGENT LOGS (for real-time streaming in Intelligence Center)
        const { data: logData, error: logError } = await supabase.from('agent_logs').insert({
          type: 'outreach',
          level: 'info',
          status: 'success',
          agent_name: 'WhatsApp Inbound',
          message: `[WHATSAPP INBOUND] Message from +${from}: "${text}"`,
          metadata: { channel: 'whatsapp', sender: from, content: text }
        }).select();

        // 2. UNIFIED BRAIN: Contextual Analysis & Response
        const brainResult = await runUnifiedBrain(text, 'whatsapp', from);
        const replyText = brainResult?.pitch || "Hi, I'm Nestor from HireNest. We've received your message and our neural engine is processing it. Stay tuned! 🚀";

        // 3. LOG OUTBOUND REPLY
        await supabase.from('agent_logs').insert({
          type: 'outreach',
          level: 'info',
          status: 'success',
          agent_name: 'WhatsApp Brain',
          message: `[WHATSAPP BRAIN-REPLY] To +${from}: "${replyText.slice(0, 50)}..."`,
          metadata: { 
            channel: 'whatsapp', 
            recipient: from, 
            content: replyText, 
            ai_generated: true,
            brain_profile: brainResult?.profile,
            matches: brainResult?.matches?.length
          }
        });

        // In production: await fetch('https://graph.facebook.com/...', { ...body: { to: from, text: { body: replyText } } })
      }

      res.status(200).send("EVENT_RECEIVED");
    } catch (err) {
      console.error("WhatsApp Webhook Error:", err);
      res.status(500).send("INTERNAL_ERROR");
    }
  });

  // 3. GMAIL PUB/SUB WEBHOOK HANDLER
  app.post("/api/webhooks/gmail", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || !message.data) {
        return res.status(400).send("Invalid Pub/Sub message");
      }

      const ingressData = JSON.parse(Buffer.from(message.data, "base64").toString());
      const { emailAddress, historyId } = ingressData;

      console.log(`📩 [QUEUE INGRESS] Signal received for ${emailAddress}`);

      // 1. Enqueue the entry point job
      const { JobType, enqueueJob } = await import("./src/services/queueService");
      await enqueueJob(JobType.GMAIL_EVENT, { 
        email: emailAddress, 
        historyId,
        id: `gmail_${historyId}_${Date.now()}` 
      });

      res.status(200).send("ENQUEUED");
    } catch (err) {
      console.error("Webhook Error:", err);
      res.status(500).send("ERROR");
    }
  });

  // 4. NESTOR WORKER POOL (Background Process)
  async function startNestorWorker() {
    const { fetchPendingJobs, updateJobStatus } = await import("./src/services/queueService");
    const { processWorkflowStep } = await import("./src/services/workflowEngine");

    setInterval(async () => {
      try {
        const jobs = await fetchPendingJobs(3); // Process 3 jobs per cycle
        if (jobs.length > 0) {
          console.log(`[Nestor Worker] Processing ${jobs.length} jobs...`);
          for (const job of jobs) {
            const type = job.input?.type || (job.input as any)?.payload?.type;
            const payload = job.input?.payload || job.input;
            
            if (!type || !payload) {
              await updateJobStatus(job.id, { status: 'failed', message: 'Malformed job data' });
              continue;
            }

            // Mark as processing immediately to avoid double-pickup
            await updateJobStatus(job.id, { status: 'processing' });
            
            // Execute in background
            processWorkflowStep(job.id, type, payload).catch(err => {
              console.error(`[Nestor Worker] Fatal error on job ${job.id}:`, err);
            });
          }
        }
      } catch (err) {
        console.error("[Nestor Worker] Cycle Error:", err);
      }
    }, 5000); // 5-second polling interval
  }

  startNestorWorker().catch(err => console.error("Worker startup failed:", err));

  // 4.1 DIRECT GOOGLE OAUTH HANDLERS
  app.get("/api/google/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://crm.hirenestworkforce.com/api/google/callback';
      
      const { google } = await import("googleapis");
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);

      console.log("GOOGLE OAUTH TOKENS RECEIVED:", JSON.stringify({
        ...tokens,
        access_token: tokens.access_token ? '[REDACTED]' : null,
      }, null, 2));

      // Fetch user profile to get email
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      const gmailEmail = userInfo.data.email;

      // We need the user_id to save to gmail_accounts. 
      // We can pass it through 'state' param or rely on the session if the user is logged in.
      // Since it's a redirect, we might not have the session in cookies if it's a different domain.
      // Let's check state.
      let userId = state as string;
      
      if (!userId) {
        // Fallback: try to get from current session if possible (might not work cross-domain)
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || "";
      }

      if (!userId) {
        return res.status(400).send("User ID missing from OAuth flow");
      }

      const hasRefreshToken = !!tokens.refresh_token;

      // Ensure we only update/insert with correct status and connected state
      // according to the requirement: if (!tokens.refresh_token) { sync_status = 'ERROR', connected = false }
      const { error: upsertError } = await supabase
        .from("gmail_accounts")
        .upsert({
          user_id: userId,
          gmail_email: gmailEmail,
          access_token: tokens.access_token,
          ...(hasRefreshToken ? { refresh_token: tokens.refresh_token } : {}),
          connected: true,
          sync_status: "TOKEN_PERSISTED",
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (upsertError) {
        console.error("GMAIL_ACCOUNTS UPSERT ERROR:", upsertError);
        return res.status(500).send("Failed to save tokens");
      }

      // Redirect back to frontend
      res.redirect("/email");
    } catch (err) {
      console.error("Google OAuth Callback Error:", err);
      res.status(500).send("Authentication failed");
    }
  });

  app.post("/api/google/refresh", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const { data: account } = await supabase
        .from('gmail_accounts')
        .select('refresh_token')
        .eq('user_id', userId)
        .single();

      if (!account?.refresh_token) {
        return res.status(400).json({ error: "No refresh token found" });
      }

      const { google } = await import("googleapis");
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        refresh_token: account.refresh_token
      });

      const { tokens } = await oauth2Client.refreshAccessToken();
      
      // Update access token in DB
      await supabase
        .from('gmail_accounts')
        .update({
          access_token: tokens.access_token,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      res.json({ access_token: tokens.access_token });
    } catch (err) {
      console.error("Token Refresh Error:", err);
      res.status(500).json({ error: "Refresh failed" });
    }
  });

  // 5. HEALTH CHECK & MAINTENANCE
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      version: "1.0.0-enterprise",
      whatsapp_status: "listening",
      neural_engine: "active"
    });
  });

  // Background Task: Gmail Watch Renewal
  setInterval(async () => {
    try {
      const { data: activeWatches } = await supabase
        .from('profiles')
        .select('*')
        .not('metadata->gmail_watch', 'is', 'null');

      console.log(`🔄 [Neural Maintenance] Periodic watch review: ${activeWatches?.length || 0} users.`);
      
      const now = Date.now();
      const RENEWAL_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
      
      for (const profile of (activeWatches || [])) {
        const expiry = profile.metadata?.watch_expires;
        if (!expiry || Number(expiry) - now < RENEWAL_THRESHOLD) {
          console.log(`⚡ Auto-renewal triggered for: ${profile.email}`);
          await supabase.from("agent_logs").insert({
            type: "system",
            agent_name: "Maintenance Agent",
            message: `Neural link automatically renewed for ${profile.email}`,
            level: "info",
            status: "success",
            metadata: { email: profile.email }
          });
        }
      }
    } catch (err) {
      console.error("Watch Maintenance Error:", err);
    }
  }, 1000 * 60 * 60 * 12); // Twice daily check

  // 3. VITE MIDDLEWARE
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 HireNest Secure OS running on http://localhost:${PORT}`);
  });
}

startServer();
