import { supabase } from "@/lib/supabase";
import { parseResumeText } from "./intelligenceService";
import { syncResumeToTalent } from "./talentService";
import { safeLog } from "@/utils/logger";

export async function processResumes() {
  // 1. Get unprocessed resumes
  const { data: resumes, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('processed', false);

  if (error || !resumes || resumes.length === 0) return { count: 0 };

  let processedCount = 0;

  for (const resume of resumes) {
    if (!resume.extracted_text) {
       await supabase.from('resumes').update({ parse_status: 'failed', processed: true }).eq('id', resume.id);
       continue;
    }

    // 2. Parse with AI
    const parsed = await parseResumeText(resume.extracted_text);
    
    // 3. Update resume record ALWAYS (fallback or success)
    const { error: updateError } = await supabase
      .from('resumes')
      .update({
        parsed_data: parsed || {},
        extracted_skills: parsed?.skills || [],
        processed: true,
        parse_status: parsed ? 'success' : 'failed',
        raw_text: resume.extracted_text,
        updated_at: new Date().toISOString()
      })
      .eq('id', resume.id);

    if (!updateError) {
      processedCount++;
      
      // 4. Sync to Talent Graph (Single Source of Truth)
      const freshResume = { 
        ...resume, 
        parsedData: parsed || {}, 
        extractedSkills: parsed?.skills || [],
        extractedText: resume.extracted_text 
      };
      await syncResumeToTalent(freshResume as any);

      // 5. (Optional) Legacy CRM Sync
      if (parsed) {
        await supabase.from('candidates').insert({
          name: parsed.name,
          email: parsed.email,
          skills: parsed.skills,
          current_title: parsed.current_title,
          experience: parsed.experience?.toString(),
          source: 'resume_upload'
        });
      }
    }
  }

  // Log action
  await safeLog({
    type: 'processing',
    agent_name: 'Resumes Agent',
    message: `Bulk processed ${processedCount} resumes into Talent Graph.`,
    level: 'info',
    status: 'success'
  });

  return { count: processedCount };
}
