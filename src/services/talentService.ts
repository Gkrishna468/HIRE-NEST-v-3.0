import { supabase } from "@/lib/supabase";
import { TalentProfile, Candidate, Resume } from "@/types";

/**
 * TALENT GRAPH SERVICE
 * Single Source of Truth for all Candidate/Resume data.
 */

/**
 * Resolve or Create a Talent Profile based on identity signals (Email, Phone)
 */
export async function findOrCreateTalent(data: {
  email?: string;
  phone?: string;
  name?: string;
  companyId?: string;
}): Promise<TalentProfile | null> {
  const { email, phone, name, companyId } = data;

  if (!email && !phone) return null;

  try {
    let talentId: string | null = null;

    // 1. Try Email Lookup
    if (email) {
      const { data: existing } = await supabase
        .from('talent_profiles')
        .select('id')
        .eq('primary_email', email.toLowerCase().trim())
        .maybeSingle();
      if (existing) talentId = existing.id;
    }

    // 2. Try Phone if no email match
    if (!talentId && phone) {
      const { data: existing } = await supabase
        .from('talent_profiles')
        .select('id')
        .eq('primary_phone', phone.trim())
        .maybeSingle();
      if (existing) talentId = existing.id;
    }

    // 3. Create if not found
    if (!talentId) {
      const { data: created, error } = await supabase
        .from('talent_profiles')
        .insert({
          primary_email: email?.toLowerCase().trim(),
          primary_phone: phone?.trim(),
          full_name: name,
          company_id: companyId
        })
        .select()
        .single();
      
      if (error) throw error;
      return mapToTalent(created);
    }

    // 4. Return existing
    const { data: talent } = await supabase
      .from('talent_profiles')
      .select('*')
      .eq('id', talentId)
      .single();
    
    return mapToTalent(talent);
  } catch (err) {
    console.error("Talent Resolution Error:", err);
    return null;
  }
}

/**
 * Merge new source data into an existing Talent Profile
 */
export async function mergeToTalent(talentId: string, incoming: Partial<TalentProfile> & { source?: any }) {
  try {
    const { data: existing } = await supabase
      .from('talent_profiles')
      .select('*')
      .eq('id', talentId)
      .single();
    
    if (!existing) return;

    // Merge logic
    const merged = {
      skills: Array.from(new Set([...(existing.skills || []), ...(incoming.skills || [])])),
      titles: Array.from(new Set([...(existing.titles || []), ...(incoming.titles || [])])),
      experience_years: Math.max(existing.experience_years || 0, incoming.experienceYears || 0),
      raw_text: (existing.raw_text || '') + '\n\n' + (incoming.rawText || ''),
      parsed_data: { ...(existing.parsed_data || {}), ...(incoming.parsedData || {}) },
      sources: [...(existing.sources || []), incoming.source].filter(Boolean),
      last_updated: new Date().toISOString()
    };

    // Calculate Quality
    let quality = 0;
    if (merged.skills.length > 5) quality += 0.3;
    if (merged.experience_years > 0) quality += 0.2;
    if (merged.raw_text.length > 500) quality += 0.3;
    if (Object.keys(merged.parsed_data).length > 0) quality += 0.2;

    await supabase
      .from('talent_profiles')
      .update({ ...merged, data_quality: quality })
      .eq('id', talentId);

  } catch (err) {
    console.error("Merge Error:", err);
  }
}

/**
 * Sync legacy Candidate record to Talent Graph
 */
export async function syncCandidateToTalent(candidate: Candidate) {
  const talent = await findOrCreateTalent({
    email: candidate.email,
    phone: candidate.phone,
    name: candidate.name,
    companyId: candidate.companyId
  });

  if (talent) {
    await mergeToTalent(talent.id, {
      skills: candidate.skills,
      experienceYears: typeof candidate.experience === 'number' ? candidate.experience : parseInt(candidate.experience as string) || 0,
      titles: candidate.currentTitle ? [candidate.currentTitle] : [],
      source: { type: 'crm', sourceId: candidate.id, confidence: 0.9 }
    });

    // Link back
    await supabase.from('candidates').update({ talent_id: talent.id }).eq('id', candidate.id);
    return talent;
  }
  return null;
}

/**
 * Sync Resume record to Talent Graph
 */
export async function syncResumeToTalent(resume: Resume) {
  // Try to find identity in parsed data
  const email = resume.parsedData?.email;
  const phone = resume.parsedData?.phone;
  const name = resume.parsedData?.name || resume.candidateName;

  const talent = await findOrCreateTalent({
    email,
    phone,
    name,
    companyId: resume.companyId as any
  });

  if (talent) {
    await mergeToTalent(talent.id, {
      skills: resume.extractedSkills || [],
      rawText: resume.extractedText,
      parsedData: resume.parsedData,
      source: { type: 'resume', sourceId: resume.id, confidence: 0.8 }
    });

    // Link back
    await supabase.from('resumes').update({ talent_id: talent.id }).eq('id', resume.id);
    return talent;
  }
  return null;
}

function mapToTalent(dbRow: any): TalentProfile {
  return {
    id: dbRow.id,
    companyId: dbRow.company_id,
    primaryEmail: dbRow.primary_email,
    primaryPhone: dbRow.primary_phone,
    fullName: dbRow.full_name,
    skills: dbRow.skills || [],
    experienceYears: dbRow.experience_years || 0,
    titles: dbRow.titles || [],
    location: dbRow.location,
    sources: dbRow.sources || [],
    rawText: dbRow.raw_text,
    parsedData: dbRow.parsed_data,
    dataQuality: dbRow.data_quality || 0,
    lastUpdated: dbRow.last_updated,
    createdAt: dbRow.created_at
  };
}
