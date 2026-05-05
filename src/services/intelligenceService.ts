
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { recordDeal } from "./financialService";
import { calculateAdjustedBudget } from "./marketplaceService";
import { callAISecureProxy } from "@/lib/ai";
import { extractJSON } from "@/utils/ai";
import { safeLog } from "@/utils/logger";

/**
 * JOB POSTING: Initial trigger for marketplace
 */
export async function processNewJob(job: any) {
  // 1. Calculate Adjusted Budget (HireNest Margin)
  const adjustedBudget = await calculateAdjustedBudget(job.company_id, job.budget);
  
  // 2. Update Job in DB
  await supabase
    .from('jobs')
    .update({ adjusted_budget: adjustedBudget })
    .eq('id', job.id);

  // 3. Log System Action
  await safeLog({
    type: 'revenue',
    level: 'info',
    status: 'success',
    agent_name: 'CFO Agent',
    message: `[CFO AGENT] Budget adjusted for ${job.title}. Client Gross: ₹${job.budget} -> Vendor Net: ₹${adjustedBudget}`,
    metadata: { jobId: job.id, gross: job.budget, net: adjustedBudget }
  });
}

export interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  currentTitle: string;
  skills: string[];
  experience: string;
  education: string;
  summary: string;
}

export interface MatchResult {
  score: number;
  reasoning: string;
  gaps: string[];
  recommendation: 'shortlist' | 'reserve' | 'reject';
  matchedSkills?: string[];
  missingSkills?: string[];
  decision?: 'HIRE' | 'CONSIDER' | 'REJECT';
  risk?: number;
  confidence?: number;
  reasons?: string[];
}

/**
 * Parses raw resume text into structured JSON using Gemini 3 Flash
 */
export async function parseResumeWithAI(text: string): Promise<ParsedResume> {
  const prompt = `
    Analyze the following resume text and extract structured information for a neural recruitment engine.
    Focus strictly on skills, experience, and professional identity.
    Return ONLY a JSON object with this structure:
    {
      "name": "full name",
      "email": "email address",
      "phone": "phone number",
      "currentTitle": "current or most recent job title",
      "skills": ["skill1", "skill2"],
      "experience": "brief summary of total years and key roles",
      "education": "highest degree and institution",
      "summary": "professional summary focusing on technical depth"
    }
    
    TEXT:
    ${text.substring(0, 5000)}
  `;

  try {
    const raw = await callAISecureProxy(prompt);
    const parsed = extractJSON<ParsedResume>(raw);
    if (!parsed) throw new Error("Failed to parse resume after AI processing.");
    return parsed;
  } catch (error) {
    console.error("AI Parsing Error:", error);
    return {
      name: "Unknown",
      email: "",
      phone: "",
      currentTitle: "",
      skills: [],
      experience: "",
      education: "",
      summary: ""
    };
  }
}

/**
 * Extracts structured technical skills from a raw Job Description text.
 */
export async function extractJobSkills(jdText: string): Promise<string[]> {
  const prompt = `
    Extract ONLY a clean list of technical skills and tools from this Job Description.
    Focus on niche technologies and core frameworks.
    Ignore soft skills.
    Return as a simple JSON array: ["skill1", "skill2"]
    JD: ${jdText}
  `;
  try {
    const raw = await callAISecureProxy(prompt);
    const parsed = extractJSON<string[]>(raw);
    return parsed || [];
  } catch (e) {
    // Fallback: simple split if AI fails or returns weird format
    return jdText.split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(s => s.length > 2 && s.length < 50);
  }
}

function normalize(text: string) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function fuzzyMatch(skill: string, candidateSkills: string[]) {
  const normSkill = normalize(skill);
  return candidateSkills.some(cs => {
    const normCs = normalize(cs);
    return normCs.includes(normSkill) || normSkill.includes(normCs);
  });
}

/**
 * Neural Matcher: Semantic comparison between Job and Candidate.
 * Strategic Weights: 60% Skills, 20% Experience, 20% Semantic Alignment.
 * Includes Caching Layer to minimize AI costs.
 */
export async function scoreCandidateForJob(job: any, candidate: any): Promise<MatchResult> {
  const jobSkills = (job.skills || []).map(normalize);
  const candSkills = (candidate.skills || []).map(normalize);
  const experienceYears = candidate.experience_years || parseInt(candidate.experience) || 0;
  const candidateId = candidate.id;
  const candidateName = candidate.full_name || candidate.name || 'Candidate';
  
  // 1. Check Cache Layer First
  if (job.id && candidateId) {
    const { data: cached } = await supabase
      .from('match_results')
      .select('*')
      .eq('job_id', job.id)
      .eq('candidate_id', candidate.id)
      .maybeSingle();

    if (cached) {
      return {
        score: cached.score,
        reasoning: cached.explanation || "Retrieved from neural cache.",
        gaps: cached.missing_skills || [],
        recommendation: cached.score >= 70 ? 'shortlist' : 'reserve',
        matchedSkills: cached.matched_skills || [],
        missingSkills: cached.missing_skills || [],
        decision: (cached.metadata as any)?.decision,
        risk: (cached.metadata as any)?.risk,
        confidence: (cached.metadata as any)?.confidence,
        reasons: (cached.metadata as any)?.reasons
      };
    }
  }

  // 2. High-fidelity heuristic pre-score
  const matched = jobSkills.filter(s => fuzzyMatch(s, candSkills));
  const skillScore = jobSkills.length > 0 ? (matched.length / jobSkills.length) * 100 : 0;
  const expMatch = experienceYears >= (job.min_experience || 0) ? 100 : 60;

  // AI Validation helper
  const isValidSchema = (res: any) => 
    res && typeof res.score === 'number' && Array.isArray(res.matchedSkills) && Array.isArray(res.missingSkills);

  const prompt = `
    Act as a Senior Strategic Recruitment Director & Technical QA Chief. 
    Perform a deep neural match.
    
    JOB: ${job.title} | Critical Skills: ${jobSkills.join(", ")}
    CANDIDATE: ${candSkills.join(", ")} | Exp: ${candidate.experience}
    
    Return ONLY JSON in this exact format:
    {
      "score": number,
      "reasoning": "string",
      "gaps": ["string"],
      "matchedSkills": ["string"],
      "missingSkills": ["string"],
      "recommendation": "shortlist" | "reserve"
    }

    Rules:
    - Score is 0-100.
    - matchedSkills MUST be the skills from JD that the candidate has.
    - missingSkills MUST be the skills from JD that the candidate lacks.
    - reasoning MUST explain tech overlap or missing nodes.
  `;

  let matchResult: MatchResult;
  const startTime = Date.now();

  try {
    const raw = await callAISecureProxy(prompt, { model: 'gemini-1.5-pro', useProxy: true });
    const result = extractJSON(raw);
    
    if (!isValidSchema(result)) throw new Error("Invalid or missing AI schema");
    
    // Balanced Score calculation: 40% AI confidence, 50% strict skill match, 10% experience alignment
    const aiScore = Number(result!.score) || 0;
    const finalScore = Math.round((aiScore * 0.4) + (skillScore * 0.5) + (expMatch * 0.1));
    
    matchResult = {
      ...result,
      score: finalScore,
      matchedSkills: (result as any).matchedSkills?.length > 0 ? (result as any).matchedSkills : matched,
      missingSkills: (result as any).missingSkills?.length > 0 ? (result as any).missingSkills : job.skills?.filter((s: string) => !matched.includes(normalize(s))) || []
    } as any;

    // 2.5 Decision Engine Layer
    const decision = decisionEngine({
      score: finalScore,
      matchedSkills: matchResult.matchedSkills || [],
      missingSkills: matchResult.missingSkills || [],
      experienceYears: experienceYears,
      minExperience: job.min_experience || 0,
      dataQuality: (candidate.skills?.length > 0 ? 0.6 : 0.2) + (candidate.raw_text ? 0.3 : 0)
    });

    matchResult = { ...matchResult, ...decision } as any;

    // 3. Update Cache
    if (job.id && candidateId) {
      await supabase.from('match_results').upsert({
        job_id: job.id,
        candidate_id: candidateId,
        score: finalScore,
        matched_skills: matchResult.matchedSkills,
        missing_skills: matchResult.missingSkills,
        explanation: (result as any).reasoning,
        metadata: { 
          latency_ms: Date.now() - startTime,
          model: 'gemini-1.5-pro',
          decision: decision.decision,
          risk: decision.risk,
          confidence: decision.confidence,
          reasons: decision.reasons
        }
      }, { onConflict: 'job_id, candidate_id' });
    }

  } catch (error) {
    console.error("AI Matching Error, triggering heuristic fallback:", error);
    const fallbackScore = Math.round(skillScore * 0.8 + expMatch * 0.2);
    const decision = decisionEngine({
      score: fallbackScore,
      matchedSkills: matched,
      missingSkills: jobSkills.filter(s => !matched.includes(s)),
      experienceYears: experienceYears,
      minExperience: job.min_experience || 0,
      dataQuality: 0.5
    });
    
    matchResult = { 
      score: fallbackScore, 
      reasoning: `Matched ${matched.length} key technical nodes. (Heuristic Fallback)`, 
      gaps: jobSkills.filter(s => !matched.includes(s)),
      recommendation: skillScore >= 50 ? 'shortlist' : 'reserve',
      matchedSkills: matched,
      missingSkills: jobSkills.filter(s => !matched.includes(s)),
      ...decision
    } as any;
  }

  // 4. Log AI Execution for Monitoring
  await safeLog({
    type: 'ai_match_execution',
    agent_name: 'Neural Matcher',
    message: `Evaluated ${candidateName} for ${job.title}. Score: ${matchResult.score}% | Decision: ${matchResult.decision || 'N/A'}`,
    level: 'info',
    status: 'success',
    metadata: {
      latency_ms: Date.now() - startTime,
      jobId: job.id,
      candidateId: candidateId,
      source: job.id && candidateId ? 'ai_primary' : 'heuristic_only'
    }
  });

  return matchResult;
}

/**
 * Resume Parser: Converts raw text into structured candidate nodes.
 */
export async function parseResumeText(text: string): Promise<any> {
  const prompt = `
    Extract structured candidate data from this resume text.
    Return ONLY JSON:
    {
      "name": "string",
      "email": "string",
      "skills": ["skill1", "skill2"],
      "experience": number,
      "current_title": "string",
      "summary": "string"
    }
    RESUME: ${text.substring(0, 4000)}
  `;
  try {
    const raw = await callAISecureProxy(prompt, { model: 'gemini-1.5-pro', useProxy: true });
    if (!raw) return null;
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("Resume Parsing Error:", e);
    return null;
  }
}
export async function runDecisionAgent() {
  // 1. Log Start
  await safeLog({
    type: 'decision',
    agent_name: 'Decision Agent',
    message: 'Autonomous Decision Agent cycle started.',
    level: 'info',
    status: 'pending'
  });

  // 2. Find Pending Candidates from Talent Graph
  const { data: talents } = await supabase
    .from('talent_profiles')
    .select('*')
    .order('data_quality', { ascending: false });

  if (!talents || talents.length === 0) return "No talent profiles found.";

  // 3. Find Open Jobs
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'open');

  if (!jobs || jobs.length === 0) return "No open jobs found.";

  let decisions = 0;
  let reviews = 0;

  for (const talent of talents) {
    let bestMatch: any = null;
    
    for (const job of jobs) {
       const evaluation = await scoreCandidateForJob(job, talent);
       
       // 3-TIER DECISIONING & GUARDRAILS
       // Tier 1: Auto-Shortlist (Very high confidence)
       if (evaluation.decision === 'HIRE' && evaluation.score >= 80) {
         if (!bestMatch || evaluation.score > bestMatch.score) {
           bestMatch = { job, evaluation, tier: 'auto' };
         }
       } 
       // Tier 2: Human Review Priority
       else if (evaluation.score >= 65) {
         reviews++;
         // Link talent to job in shortlist if not exists
         await supabase.from('shortlist').upsert({
           job_id: job.id,
           talent_id: talent.id,
           score: evaluation.score,
           decision: evaluation.decision,
           risk: evaluation.risk,
           confidence: evaluation.confidence,
           reasons: evaluation.reasons,
           stage: 'screening'
         }, { onConflict: 'job_id, talent_id' });
       }
    }

    if (bestMatch && bestMatch.tier === 'auto') {
      // AUTO-MOVE: This is the decision!
      await supabase.from('shortlist').upsert({
        job_id: bestMatch.job.id,
        talent_id: talent.id,
        score: bestMatch.evaluation.score,
        decision: bestMatch.evaluation.decision,
        risk: bestMatch.evaluation.risk,
        confidence: bestMatch.evaluation.confidence,
        reasons: bestMatch.evaluation.reasons,
        stage: 'interview'
      }, { onConflict: 'job_id, talent_id' });
      
      // CFO LAYER: Record potential revenue
      const estimatedValue = 150000; 
      await recordDeal(bestMatch.job, talent, estimatedValue);
      
      decisions++;
    }
  }

  // 4. Log Completion
  await safeLog({
    type: 'decision',
    agent_name: 'Decision Agent',
    message: `Cycle complete. Processed ${talents.length} profiles. Auto-Shortlisted: ${decisions} | Flagged for Review: ${reviews}.`,
    level: 'info',
    status: 'success'
  });

  return `Cycle complete. Made ${decisions} decisions.`;
}

/**
 * Profiling Engine: Analyzes intent and urgency from raw text.
 */
export async function profileClient(text: string): Promise<any> {
  const prompt = `
    Analyze this message/interaction and extract recruitment intent.
    Return JSON:
    {
      "intent": "hiring | candidate | vendor | other",
      "roles": ["role1"],
      "urgency": "high | medium | low",
      "budget": "high | mid | low",
      "summary": "1-sentence summary",
      "entities": {
        "name": "Extracted name if any",
        "company": "Extracted company name if any"
      }
    }
    TEXT: ${text}
  `;
  try {
    const raw = await callAISecureProxy(prompt, { model: 'gemini-1.5-pro', useProxy: true });
    if (!raw) return { intent: "other", roles: [], urgency: "low", summary: "Analysis failed." };
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return { intent: "other", roles: [], urgency: "low", summary: "Analysis failed." };
  }
}

/**
 * Pitch Engine: Generates concise, conversion-focused responses.
 */
export async function generatePitch(context: any): Promise<string> {
  const prompt = `
    Act as a High-Performance AI Recruiter for HireNest.
    Generate a concise, professional WhatsApp-style pitch/response.
    CONTEXT: ${JSON.stringify(context)}
    
    GUIDELINES:
    - Max 3 short paragraphs
    - Include a clear call to action
    - Mention potential matches if provided
  `;
  try {
    return await callAISecureProxy(prompt, { model: 'gemini-1.5-pro', useProxy: true });
  } catch (e) {
    return "Hi, thank you for reaching out. We are reviewing your requirements and will get back to you shortly.";
  }
}

/**
 * Follow-up Engine: Schedules next actions based on profile.
 */
export function decideFollowUp(profile: any): any {
  if (profile.urgency === "high") {
    return {
      schedule: "tomorrow",
      action: "Direct Call / Priority Follow-up",
      priority: "high"
    };
  }
  return {
    schedule: "3 days",
    action: "Email follow-up",
    priority: "medium"
  };
}

export async function generateInterviewQuestions(job: any, candidate: any, match: MatchResult): Promise<any> {
  const prompt = `
    Act as a Senior Technical Interviewer.
    JOB: ${job.title}
    MATCH SCORE: ${match.score}%
    MISSING SKILLS: ${match.missingSkills?.join(", ")}
    
    Generate 3 high-impact technical questions to validate the candidate's core expertise and 2 probing questions to explore the missing skills/gaps.
    Return JSON:
    {
      "technical": ["string"],
      "gaps": ["string"]
    }
  `;
  try {
    const raw = await callAISecureProxy(prompt, { model: 'gemini-1.5-pro', useProxy: true });
    if (!raw) throw new Error("Empty AI response");
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return { technical: ["Explain your architecture approach."], gaps: ["How would you quickly learn niche tools in our JD?"] };
  }
}

/**
 * AI Sales Agent: Strategic Prediction & Hiring Probability.
 */
/**
 * Deterministic Decision Engine: Rules-based logic for hiring recommendations.
 */
export function decisionEngine(input: any) {
  const {
    score,
    matchedSkills,
    missingSkills,
    experienceYears,
    minExperience,
    dataQuality = 1.0,
  } = input;

  // --- 1) Coverage ---
  const totalReq = (matchedSkills?.length || 0) + (missingSkills?.length || 0) || 1;
  const coverage = (matchedSkills?.length || 0) / totalReq;

  // --- 2) Experience delta ---
  const expDelta = experienceYears - minExperience;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  // --- 3) Confidence ---
  const confidence = clamp01(
    0.5 * (score / 100) +
    0.3 * coverage +
    0.2 * clamp01(dataQuality)
  );

  // --- 4) Risk ---
  let risk = 0;
  if (missingSkills?.length > 2) risk += 25;
  if (expDelta < 0) risk += 20;
  if (dataQuality < 0.6) risk += 20;
  if (score < 60) risk += 20;
  risk = Math.min(100, risk);

  // --- 5) Decision Logic ---
  let decision: 'HIRE' | 'CONSIDER' | 'REJECT';
  
  if (score >= 75 && (coverage >= 0.6 || expDelta >= 2) && risk < 35) {
    decision = 'HIRE';
  } else if (score >= 50 && (coverage >= 0.4 || expDelta >= 0) && risk < 65) {
    decision = 'CONSIDER';
  } else {
    decision = 'REJECT';
  }

  // --- Experience Override ---
  if (experienceYears >= minExperience + 3 && score >= 50 && decision === 'REJECT') {
    decision = 'CONSIDER';
  }

  // --- 6) Reasons (Explainability) ---
  const reasons = [
    `${matchedSkills?.length || 0}/${totalReq} required skills matched`,
    expDelta >= 0
      ? `Experience meets or exceeds requirement (+${expDelta} yrs)`
      : `Experience below requirement (${Math.abs(expDelta)} yrs short)`,
    missingSkills?.length
      ? `Critical gaps: ${missingSkills.slice(0, 3).join(", ")}`
      : "Full technical alignment identified",
    `Confidence factor: ${Math.round(confidence * 100)}%`
  ];

  return {
    decision,
    risk,
    confidence: Math.round(confidence * 100),
    reasons
  };
}

export async function getHiringPrediction(job: any, candidate: any, match: MatchResult): Promise<any> {
  const prompt = `
    Act as a Strategic Hiring Director & Offer Scientist.
    Predict the probability of this candidate being hired and the likelihood of them accepting an offer.
    JOB: ${job.title}
    SKILL MATCH: ${match.score}%
    GAPS: ${match.missingSkills?.join(", ")}
    EXP: ${candidate.experience} yrs
    
    Return JSON:
    {
      "hiring_probability": number,
      "offer_success": number,
      "summary": "3-sentence strategic justification.",
      "risk_level": "Low" | "Medium" | "High"
    }
  `;
  try {
    const raw = await callAISecureProxy(prompt, { model: 'gemini-1.5-pro', useProxy: true });
    if (!raw) throw new Error("Empty AI response");
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    const prob = Math.min(100, Math.max(0, match.score + (candidate.experience > 5 ? 10 : 0)));
    return { 
      hiring_probability: prob, 
      offer_success: 75, 
      summary: "Prediction based on technical alignment nodes.", 
      risk_level: prob > 70 ? "Low" : "Medium" 
    };
  }
}
