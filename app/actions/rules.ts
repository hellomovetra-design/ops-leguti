"use server";

import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { AddressCategory } from "@/lib/types";

// Fetch all learning rules
export async function getLearningRules() {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      demoMode: true,
      data: [
        { id: "rule-1", pattern: "PT Nusantara Digital", normalized_pattern: "pt nusantara digital", category: "OFFICE" as AddressCategory, confidence: 100, is_active: true },
        { id: "rule-2", pattern: "Cluster Harmoni Residence", normalized_pattern: "cluster harmoni residence", category: "RESIDENCE" as AddressCategory, confidence: 100, is_active: true }
      ]
    };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { data, error } = await supabase
      .from("address_learning_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error("Failed to fetch learning rules:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Add a learning rule
export async function addLearningRule(pattern: string, category: AddressCategory) {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true };
  }

  const supabase = getSupabaseServerClient()!;
  const normalized = pattern.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  
  if (normalized.length === 0) {
    return { success: false, error: "Pola tidak boleh kosong." };
  }

  try {
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("full_name", "Admin Pusat")
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("address_learning_rules")
      .upsert({
        pattern: pattern.trim(),
        normalized_pattern: normalized,
        category,
        confidence: 100,
        source_address: pattern.trim(),
        created_by: user?.id || null,
        is_active: true
      }, { onConflict: "normalized_pattern" })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Failed to add learning rule:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Delete a learning rule
export async function deleteLearningRule(id: string) {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { error } = await supabase
      .from("address_learning_rules")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete learning rule:", error);
    return { success: false, error: error.message || String(error) };
  }
}
