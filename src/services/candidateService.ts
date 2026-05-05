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
  const filePath = `resumes/${fileName}`;

  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(filePath, file);

  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('resumes')
    .getPublicUrl(filePath);

  return publicUrl;
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
