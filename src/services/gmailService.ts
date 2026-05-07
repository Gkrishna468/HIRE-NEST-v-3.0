import { supabase } from "@/lib/supabase";
import { callAISecureProxy } from "@/lib/ai";
import { JobType, enqueueJob } from "./queueService";

/**
 * GMAIL SERVICE: Enterprise Resume Extraction
 * Connects to Google Graph API, fetches attachments, and uses Gemini to parse candidates.
 */

/**
 * GMAIL SERVICE: Enterprise Email & Resume Ingestion
 * Connects to Google Graph API, fetches messages, and stores in CRM.
 */

async function getAuthoritativeToken(userId: string) {
  const { data: gmailAccount } = await supabase
    .from('gmail_accounts')
    .select('access_token, refresh_token, updated_at')
    .eq('user_id', userId)
    .single();

  if (!gmailAccount) return null;

  // Check if token is likely expired (Google tokens last 1 hour)
  const updatedAt = new Date(gmailAccount.updated_at).getTime();
  const now = Date.now();
  const expiryThreshold = 50 * 60 * 1000; // 50 minutes

  if (now - updatedAt > expiryThreshold && gmailAccount.refresh_token) {
    try {
      console.log("[Gmail Service] Access token likely expired, initiating refresh...");
      const res = await fetch(`${window.location.origin}/api/google/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log("[Gmail Service] Token refresh successful.");
        return data.access_token;
      } else {
        console.warn("[Gmail Service] Token refresh endpoint returned error:", await res.text());
      }
    } catch (err) {
      console.error("[Gmail Service] Neural link refresh failed:", err);
    }
  }
  
  return gmailAccount.access_token; 
}

export async function syncGmailInbox(force: boolean = false) {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  if (!userId) throw new Error("AUTH_REQUIRED: Identity not detected.");

  try {
    console.log("========== GMAIL SYNC START ==========");
    console.log("USER:", userId);

    const { data: accountInfo } = await supabase
      .from('gmail_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();

    console.log("ACCOUNT:", accountInfo);
    console.log("ACCESS TOKEN EXISTS:", !!accountInfo?.access_token);
    console.log("REFRESH TOKEN EXISTS:", !!accountInfo?.refresh_token);

    console.log("INITIALIZING GMAIL CLIENT");
    const token = await getAuthoritativeToken(userId);

    if (!token) {
      throw new Error("GMAIL_NOT_CONNECTED: Please re-authorize via Settings.");
    }

    // 1. Fetch recent messages
    console.log("FETCHING MESSAGE LIST");
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${force ? 100 : 50}`;
    console.log(`[Gmail Sync] Initiating fetch. Identity: ${userId}. Force Mode: ${force}`);
    
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!listRes.ok) {
      const errorData = await listRes.json();
      console.error("[Gmail Sync] API Request Failed:", errorData);
      throw new Error(`Gmail API Error: ${errorData.error?.message || listRes.statusText}`);
    }

    const listData = await listRes.json();
    console.log("MESSAGES RECEIVED:", listData.messages?.length || 0);
    console.log(`[Gmail Sync] API Response received. Found ${listData.messages?.length || 0} messages.`);

    if (!listData.messages || listData.messages.length === 0) {
      console.log("[Gmail Sync] No signals detected in the stream.");
      console.log("SETTING STATUS READY");
      await supabase.from("gmail_accounts").update({ sync_status: "READY" }).eq("user_id", userId);
      return { count: 0, message: "Inbox is optimized and quiet." };
    }

    console.log(`[Gmail Sync] Analyzing ${listData.messages.length} potential signals...`);

    let syncCount = 0;
    let errorCount = 0;

    console.log("INSERTING EMAILS");
    for (const msg of listData.messages) {
    try {
      // 1. Check cache first to avoid re-work (unless forced)
      if (!force) {
        const { data: exist } = await supabase.from('processing_cache').select('id').eq('source_id', msg.id).maybeSingle();
        if (exist) {
          continue;
        }
      }

      const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
      const detailRes = await fetch(detailUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const email = await detailRes.json();

      if (!email || !email.payload) continue;

      const headers = email.payload.headers || [];
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
      const to = headers.find((h: any) => h.name === 'To')?.value || '';
      const messageHeaderId = headers.find((h: any) => h.name === 'Message-ID' || h.name === 'Message-Id')?.value || '';
      const senderEmail = from.match(/<(.+?)>/)?.[1] || from;

      // RECURSIVE BODY EXTRACTION (High Fidelity)
      const extractBody = (payload: any): { html: string; text: string } => {
        let html = "";
        let text = "";
        
        const decodeText = (data: string) => {
          try {
            const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
            return decodeURIComponent(escape(atob(b64)));
          } catch (e) {
            try { return atob(data.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ""; }
          }
        };

        const processParts = (parts: any[]) => {
          parts.forEach(part => {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              text += decodeText(part.body.data);
            } else if (part.mimeType === 'text/html' && part.body?.data) {
              html += decodeText(part.body.data);
            } else if (part.parts) {
              processParts(part.parts);
            }
          });
        };

        if (payload.parts) {
          processParts(payload.parts);
        } else if (payload.body?.data) {
          if (payload.mimeType === 'text/plain') text = decodeText(payload.body.data);
          else if (payload.mimeType === 'text/html') html = decodeText(payload.body.data);
        }
        
        return { html, text };
      };

      const { html, text } = extractBody(email.payload);
      const finalBodyText = text || email.snippet || "No textual content detected.";
      
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', userId).maybeSingle();

      const emailPayload: any = {
        subject: subject,
        snippet: email.snippet || '',
        body: finalBodyText,
        body_html: html || '',
        body_text: text || '',
        received_at: email.internalDate ? new Date(parseInt(email.internalDate)).toISOString() : new Date().toISOString(),
        thread_id: email.threadId,
        message_id: msg.id,
        from_email: senderEmail,
        to_email: to,
        direction: 'inbound',
        status: 'received',
        user_id: userId,
        company_id: profile?.company_id,
        message_header_id: messageHeaderId,
        labels: email.labelIds || []
      };

      // 2. Persist with strict unique message_id
      const { error: upsertError } = await supabase.from('emails').upsert(emailPayload, { onConflict: 'message_id' });

      if (upsertError) {
        console.error(`[Gmail Sync] Persistence failure for ${msg.id}:`, upsertError);
        errorCount++;
        continue;
      }

      // 3. Update Cache
      await supabase.from('processing_cache').upsert({
        source_id: msg.id,
        type: 'email'
      }, { onConflict: 'source_id' });

      syncCount++;
      
      // Async AI Enrichment
      triggerAIEnrichment(msg.id, email, subject, from);

    } catch (msgErr) {
      console.error(`[Gmail Sync] Signal recovery failed for ${msg.id}:`, msgErr);
      errorCount++;
    }
  }

    console.log("EMAIL INSERT COMPLETE");
    console.log(`[Gmail Sync] Finished. Synced: ${syncCount}. Errors: ${errorCount}.`);
    
    console.log("SETTING STATUS READY");
    await supabase.from("gmail_accounts").update({ sync_status: "READY" }).eq("user_id", userId);

    return { 
      count: syncCount, 
      errors: errorCount,
      message: syncCount > 0 ? `Mirrored ${syncCount} signals from neural network.` : "No new messages signals detected."
    };
  } catch (err: any) {
    console.error("SYNC FAILURE:", err);
    await supabase
      .from("gmail_accounts")
      .update({
        sync_status: "ERROR",
        last_error: err?.message || String(err),
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);
    
    throw err;
  }
}

async function triggerAIEnrichment(messageId: string, email: any, subject: string, from: string) {
  try {
    const aiResponse = await callAISecureProxy(`Analyze this email for a recruitment CRM.
        Subject: ${subject}
        Snippet: ${email.snippet}
        From: ${from}
        
        Return JSON ONLY:
        {
          "intent": "candidate_application | job_query | outreach | spam",
          "score": number (0-100 matching lead quality),
          "extracted": {
            "name": "full name",
            "skills": ["skill1", "skill2"],
            "experience": "years summary"
          },
          "reply": "draft response"
        }`);
     
     const cleanJson = aiResponse.replace(/```json|```/g, '').trim();
     const aiMeta = JSON.parse(cleanJson);
     
     let category = 'general';
     if (aiMeta.intent === 'candidate_application') category = 'recruitment';
     else if (aiMeta.intent === 'job_query') category = 'client';
     else if (aiMeta.intent === 'outreach') category = 'outreach';
     
     await supabase.from('emails').update({ 
       ai_metadata: aiMeta,
       category: category,
       ai_priority: aiMeta.score || 0
     }).eq('message_id', messageId);
     
  } catch (e) {
    console.error(`[AI Enrichment] Failed for ${messageId}:`, e);
  }
}

/**
 * SEND EMAIL REPLY via Gmail API
 */
export async function sendEmailReply(threadId: string, to: string, subject: string, body: string, inReplyToHeaderId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  if (!userId) throw new Error("AUTH_REQUIRED: Identity not detected.");

  const token = await getAuthoritativeToken(userId);

  if (!token) throw new Error("GMAIL_NOT_CONNECTED");

  // Gmail API expects a base64url encoded string of the raw MIME email
  const utf8Encode = new TextEncoder();
  const emailRaw = [
    `To: ${to}`,
    `Subject: ${subject.startsWith('Re: ') ? subject : 'Re: ' + subject}`,
    inReplyToHeaderId ? `In-Reply-To: ${inReplyToHeaderId}` : '',
    inReplyToHeaderId ? `References: ${inReplyToHeaderId}` : '',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body
  ].filter(line => line !== '').join('\r\n');

  const encodedEmail = btoa(unescape(encodeURIComponent(emailRaw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: encodedEmail,
      threadId: threadId
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  // Persist locally
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', userId).maybeSingle();
  
  await supabase.from('emails').insert({
    thread_id: threadId,
    message_id: data.id,
    from_email: user?.email || 'me',
    to_email: to,
    subject: subject,
    body: body,
    direction: 'outbound',
    status: 'sent',
    user_id: userId,
    company_id: profile?.company_id,
    received_at: new Date().toISOString()
  });

  return data;
}

/**
 * SEND NEW EMAIL via Gmail API
 */
export async function sendNewEmail(to: string, subject: string, body: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  if (!userId) throw new Error("AUTH_REQUIRED: Identity not detected.");

  const token = await getAuthoritativeToken(userId);

  if (!token) throw new Error("GMAIL_NOT_CONNECTED");

  const emailRaw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body
  ].join('\r\n');

  const encodedEmail = btoa(unescape(encodeURIComponent(emailRaw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: encodedEmail
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  // Persist locally
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', userId).maybeSingle();
  
  await supabase.from('emails').insert({
    thread_id: data.threadId,
    message_id: data.id,
    from_email: user?.email || 'me',
    to_email: to,
    subject: subject,
    body: body,
    direction: 'outbound',
    status: 'sent',
    user_id: userId,
    company_id: profile?.company_id,
    received_at: new Date().toISOString()
  });

  return data;
}

export async function syncGmailResumes() {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  if (!userId) throw new Error("AUTH_REQUIRED: Identity not detected.");

  const token = await getAuthoritativeToken(userId);

  if (!token) {
    throw new Error("GMAIL_NOT_CONNECTED: Please re-authorize via Settings.");
  }

  // 1. Fetch messages with resume-like attachments
  const listUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=has:attachment filename:(pdf OR docx) newer_than:7d";
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listData = await listRes.json();

  if (!listData.messages) return { count: 0, message: "No resumes in recent flow." };

  let extractedCount = 0;

  for (const msg of listData.messages.slice(0, 5)) {
    const { data: exist } = await supabase.from('processing_cache').select('id').eq('source_id', msg.id + '_resume').maybeSingle();
    if (exist) continue;

    const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`;
    const detailRes = await fetch(detailUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const email = await detailRes.json();

    const headers = email.payload.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
    const senderEmail = from.match(/<(.+?)>/)?.[1] || from;

    const parts = email.payload.parts || [];
    for (const part of parts) {
      if (part.filename && (part.filename.endsWith('.pdf') || part.filename.endsWith('.docx'))) {
        
        // REAL AI EXTRACTION
        const text = await callAISecureProxy(`Analyze this email snippet and extract candidate profile details. 
            Snippet: "${email.snippet}"
            
            Return JSON only: { 
              "name": "full name", 
              "email": "personal email found in text",
              "skills": ["skill1", "skill2"], 
              "experience": number_of_years, 
              "summary": "one sentence pitch" 
            }`);
        
        const dataText = text.replace(/```json|```/g, '') || '{}';
        const candidateData = JSON.parse(dataText);

        const { error } = await supabase.from('candidates').insert({
          name: candidateData.name || from.split('<')[0].trim() || "Sourced Candidate",
          email: candidateData.email || senderEmail || "contact@nest_sync.ai", 
          skills: candidateData.skills || ["Sourced via AI"],
          experience: candidateData.experience || 0,
          stage: 'sourced',
          source: 'gmail_neural_extraction',
          summary: candidateData.summary || `Extracted from email: ${subject}`
        });

        if (!error) {
          await supabase.from('processing_cache').insert({ source_id: msg.id + '_resume', type: 'resume' });
          extractedCount++;
        }
      }
    }
  }

  return { count: extractedCount, message: `Intelligence Agent extracted ${extractedCount} new profiles.` };
}

export async function setupGmailWatch() {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  if (!userId) throw new Error("AUTH_REQUIRED: Identity not detected.");

  const token = await getAuthoritativeToken(userId);

  if (!token) {
    throw new Error("GMAIL_NOT_CONNECTED: Please re-authorize via Settings.");
  }

  // NOTE: You must replace 'YOUR_PROJECT_ID' with your actual Google Cloud Project ID
  // and 'gmail-notifications' with your Pub/Sub topic name.
  // The topic must have permission for gmail-api-push@system.gserviceaccount.com to publish.
  
  const watchUrl = "https://gmail.googleapis.com/gmail/v1/users/me/watch";
  const watchRes = await fetch(watchUrl, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      topicName: "projects/gcp-project-388314/topics/hirenest-gmail-topic", 
      labelIds: ["INBOX"]
    })
  });

  const data = await watchRes.json();
  
  if (data.error) {
    throw new Error(`Gmail Watch Error: ${data.error.message}`);
  }

  // Update profile with historyId
  if (user) {
    await supabase
      .from('profiles')
      .update({ 
        metadata: { 
          gmail_watch: true, 
          history_id: data.historyId,
          watch_expires: data.expiration
        } 
      })
      .eq('user_id', user.id);
  }

  return data;
}
