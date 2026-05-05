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

export async function syncGmailInbox() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.provider_token;

  if (!token) {
    throw new Error("GMAIL_NOT_CONNECTED: Please re-authorize via Settings.");
  }

  // 1. Fetch recent messages
  const listUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10";
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listData = await listRes.json();

  if (!listData.messages || listData.messages.length === 0) {
    return { count: 0, message: "Inbox is quiet." };
  }

  let syncCount = 0;

  for (const msg of listData.messages) {
    // Check cache
    const { data: exist } = await supabase.from('processing_cache').select('id').eq('source_id', msg.id).maybeSingle();
    if (exist) continue;

    const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`;
    const detailRes = await fetch(detailUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const email = await detailRes.json();

    const headers = email.payload.headers;
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
    const to = headers.find((h: any) => h.name === 'To')?.value || '';
    const messageHeaderId = headers.find((h: any) => h.name === 'Message-ID' || h.name === 'Message-Id')?.value || '';
    const senderEmail = from.match(/<(.+?)>/)?.[1] || from;

    // Helper to extract body
    const getBody = (payload: any): { html: string; text: string } => {
      let html = "";
      let text = "";
      
      const decode = (data: string) => {
        try {
          return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
        } catch (e) {
          return "";
        }
      };

      const parsePart = (part: any) => {
        if (part.mimeType === 'text/plain' && part.body.data) {
          text += decode(part.body.data);
        } else if (part.mimeType === 'text/html' && part.body.data) {
          html += decode(part.body.data);
        } else if (part.parts) {
          part.parts.forEach(parsePart);
        }
      };

      if (payload.parts) {
        payload.parts.forEach(parsePart);
      } else if (payload.body && payload.body.data) {
        if (payload.mimeType === 'text/plain') text = decode(payload.body.data);
        if (payload.mimeType === 'text/html') html = decode(payload.body.data);
      }
      
      return { html, text };
    };

    const { html, text } = getBody(email.payload);
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', session?.user?.id).maybeSingle();

    // Persist email
    // BUILD UPSERT PAYLOAD
    const emailPayload: any = {
      subject: subject,
      snippet: email.snippet,
      body: text || email.snippet,
      body_html: html,
      body_text: text,
      received_at: email.internalDate ? new Date(parseInt(email.internalDate)).toISOString() : new Date().toISOString(),
      thread_id: email.threadId,
      message_id: msg.id,
      from_email: senderEmail,
      to_email: to,
      direction: 'inbound',
      status: 'received',
      user_id: session?.user?.id,
      company_id: profile?.company_id,
      message_header_id: messageHeaderId,
      labels: email.labelIds || []
    };

    const { error } = await supabase.from('emails').upsert(emailPayload, { onConflict: 'message_id' });

    if (error) {
      console.error("[Gmail Sync] Upsert failed. Ensure 'message_id' column exists with Unique constraint.", error);
      // Fallback: simple insert without conflict handling if table structure is unknown
      await supabase.from('emails').insert(emailPayload);
    }

    // 3. ENQUEUE FOR NESTOR AGENT CLASSIFICATION
    // Trigger real AI analysis now to populate the UI metadata
    try {
      const aiResponse = await callAISecureProxy(`Analyze this email for a recruitment CRM.
          Subject: ${subject}
          Snippet: ${email.snippet}
          From: ${from}
          
          Return JSON:
          {
            "intent": "candidate_application | job_query | outreach | spam",
            "score": number (0-100 matching lead quality),
            "extracted": {
              "name": "full name",
              "skills": ["skill1", "skill2"],
              "experience": "years/summary"
            },
            "reply": "draft response"
          }`);
       
       const aiMeta = JSON.parse(aiResponse.replace(/```json|```/g, ''));
       
       // Map intent to category
       let category = 'general';
       if (aiMeta.intent === 'candidate_application') category = 'recruitment';
       else if (aiMeta.intent === 'job_query') category = 'client';
       else if (aiMeta.intent === 'outreach') category = 'outreach';
       
       const aiPriority = aiMeta.score || 0;

       // UNIFIED BRAIN: Auto-match against active jobs if this is an application
       if (aiMeta.intent === 'candidate_application') {
         const { data: openJobs } = await supabase.from('jobs').select('*').eq('status', 'open').limit(5);
         if (openJobs && openJobs.length > 0) {
           const { scoreCandidateForJob } = await import('./intelligenceService');
           let bestMatch = null;
           for (const job of openJobs) {
             const match = await scoreCandidateForJob(job, aiMeta.extracted);
             if (!bestMatch || match.score > bestMatch.score) {
               bestMatch = { job, match };
             }
           }
           
           if (bestMatch && bestMatch.match.score >= 50) {
             aiMeta.best_job_match = {
               job_title: bestMatch.job.title,
               score: bestMatch.match.score,
               reasoning: bestMatch.match.reasoning
             };
             // Upgrade the reply with match context
             aiMeta.reply = `Hi ${aiMeta.extracted.name || 'there'},\n\nI've analyzed your profile against our open roles. You look like a ${bestMatch.match.score}% match for our ${bestMatch.job.title} position! ${bestMatch.match.reasoning}\n\nOur team is reviewing your details now.`;
           }
         }
       }

       await supabase.from('emails').update({ 
         ai_metadata: aiMeta,
         category: category,
         ai_priority: aiPriority
       }).eq('message_id', msg.id);
    } catch (e) {
      console.error("AI Enrichment and Unified Matching failed", e);
    }

    await enqueueJob(JobType.GMAIL_EVENT, email);
    
    // Mark as processed
    await supabase.from('processing_cache').insert({ source_id: msg.id, type: 'email' });
    syncCount++;
  }

  return { count: syncCount, message: `Synced ${syncCount} new messages.` };
}

/**
 * SEND EMAIL REPLY via Gmail API
 */
export async function sendEmailReply(threadId: string, to: string, subject: string, body: string, inReplyToHeaderId?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.provider_token;

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
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', session?.user?.id).maybeSingle();
  
  await supabase.from('emails').insert({
    thread_id: threadId,
    message_id: data.id,
    from_email: session?.user?.email || 'me',
    to_email: to,
    subject: subject,
    body: body,
    direction: 'outbound',
    status: 'sent',
    user_id: session?.user?.id,
    company_id: profile?.company_id,
    received_at: new Date().toISOString()
  });

  return data;
}

/**
 * SEND NEW EMAIL via Gmail API
 */
export async function sendNewEmail(to: string, subject: string, body: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.provider_token;

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
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', session?.user?.id).maybeSingle();
  
  await supabase.from('emails').insert({
    thread_id: data.threadId,
    message_id: data.id,
    from_email: session?.user?.email || 'me',
    to_email: to,
    subject: subject,
    body: body,
    direction: 'outbound',
    status: 'sent',
    user_id: session?.user?.id,
    company_id: profile?.company_id,
    received_at: new Date().toISOString()
  });

  return data;
}

export async function syncGmailResumes() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.provider_token;

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
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.provider_token;

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
  const { data: user } = await supabase.auth.getUser();
  if (user.user) {
    await supabase
      .from('profiles')
      .update({ 
        metadata: { 
          gmail_watch: true, 
          history_id: data.historyId,
          watch_expires: data.expiration
        } 
      })
      .eq('id', user.user.id);
  }

  return data;
}
