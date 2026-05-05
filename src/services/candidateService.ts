/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from "@/lib/supabase";
import { parseResumeText } from "./intelligenceService";
import { syncResumeToTalent } from "./talentService";
import { safeLog } from "@/utils/logger";

export async function uploadCandidateResume(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `uploads/${fileName}`;

  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(filePath, file, {
      upsert: true
    });

  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('resumes')
    .getPublicUrl(filePath);

  return publicUrl;
}

export async function convertResumeToCandidate(resume: any) {
  const extractedSkills = resume.extracted_skills || [];

  const { data, error } = await supabase.from('candidates').insert({
    name: resume.name || resume.file_name?.split('.')[0]?.replace(/[-_]/g, ' ') || "Unknown",
    email: resume.email,
    phone: resume.phone,
    skills: extractedSkills,
    experience: resume.experience || 0,
    vendor_id: resume.vendor_id,
    org_id: resume.org_id,
    company_id: resume.company_id,
    source: "resume",
    resume_url: resume.url,
    stage: 'sourced',
    status: 'active',
  }).select().single();

  if (error) throw error;

  // Mark resume as processed
  await supabase.from('resumes').update({ 
    processed: true,
    status: 'converted' 
  }).eq('id', resume.id);

  return data;
}

export async function processCandidateResume(candidateId: string, url: string, rawText: string) {
  try {
    // 1. AI Parsing
    const parsed = await parseResumeText(rawText);
    
    if (!parsed) {
      throw new Error("AI Parsing returned null");
    }

    // 2. Update Candidate with parsed data
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        skills: parsed.skills,
        current_title: parsed.current_title,
        experience: parsed.experience?.toString(),
        parsed_data: parsed,
        raw_text: rawText,
        status: 'active'
      })
      .eq('id', candidateId);

    if (updateError) throw updateError;

    // 3. Sync to Talent Graph
    await syncResumeToTalent({
      id: candidateId,
      url,
      candidateName: parsed.name,
      extractedText: rawText,
      parsedData: parsed,
      extractedSkills: parsed.skills
    } as any);

    // 4. Log Success
    await safeLog({
      type: 'processing',
      agent_name: 'Talent Agent',
      message: `Successfully parsed and synced candidate ${parsed.name}.`,
      level: 'success',
      status: 'success'
    });

    return parsed;
  } catch (err: any) {
    console.error("Candidate processing failing:", err);
    await safeLog({
      type: 'processing',
      agent_name: 'Talent Agent',
      message: `Failed to process candidate resume: ${err.message}`,
      level: 'error',
      status: 'failed'
    });
    throw err;
  }
}
