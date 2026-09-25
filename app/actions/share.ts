"use server";

import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getActiveReports } from "./reports";

// Create a new shared link configuration
export async function createShareLink(
  name: string, 
  isPublic: boolean, 
  password?: string, 
  expiresAt?: string, 
  allowDownload = false,
  filters = {}
) {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      demoMode: true,
      data: {
        id: `share-${Math.random().toString(36).substring(2, 8)}`,
        slug: `share-${Math.random().toString(36).substring(2, 8)}`,
        name,
        is_public: isPublic,
        expires_at: expiresAt || null,
        allow_download: allowDownload,
        filters,
        views: 0,
        is_active: true
      }
    };
  }

  const supabase = getSupabaseServerClient()!;
  
  // Resolve admin user ID
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("full_name", "Admin Pusat")
    .limit(1)
    .maybeSingle();

  const userId = user?.id;
  if (!userId) {
    return { success: false, error: "Pengguna admin tidak ditemukan." };
  }

  // Generate random 12-char hex slug if not automatically set by default
  const slug = Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8);

  try {
    const { data, error } = await supabase
      .from("share_links")
      .insert({
        slug,
        name,
        created_by: userId,
        is_public: isPublic,
        password_hash: password || null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        allow_download: allowDownload,
        filters,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Failed to create share link:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Get share links list
export async function getShareLinksList() {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true, data: [] };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { data, error } = await supabase
      .from("share_links")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Failed to fetch share links list:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Delete a shared link
export async function deleteShareLink(id: string) {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { error } = await supabase
      .from("share_links")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete share link:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Change share link activation state
export async function toggleShareLinkActive(id: string, active: boolean) {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { error } = await supabase
      .from("share_links")
      .update({ is_active: active })
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Failed to toggle share link active state:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Fetch a single shared link and its associated reports
export async function getSharedDashboardData(slug: string, passwordInput?: string) {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true, data: null };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    // 1. Fetch share link details
    const { data: link, error: linkErr } = await supabase
      .from("share_links")
      .select("*")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link) {
      return { success: false, error: "Dashboard yang dibagikan tidak ditemukan." };
    }

    if (!link.is_active) {
      return { success: false, error: "Dashboard ini telah dinonaktifkan." };
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return { success: false, error: "Tautan dashboard ini telah kedaluwarsa." };
    }

    // 2. Access control check
    if (link.password_hash) {
      if (!passwordInput || passwordInput !== link.password_hash) {
        return { success: false, requiresPassword: true, error: "Password salah atau diperlukan." };
      }
    }

    // 3. Fetch reports data and filter it according to the filters saved in the share link
    const reportsRes = await getActiveReports();
    if (!reportsRes.success || !reportsRes.data) {
      throw new Error(reportsRes.error || "Gagal mengambil data laporan.");
    }

    let reports = reportsRes.data;
    const filters = link.filters || {};

    // Apply shared dashboard filters
    if (filters.status) reports = reports.filter(r => r.status === filters.status);
    if (filters.category) reports = reports.filter(r => r.addressCategory === filters.category);
    if (filters.area) reports = reports.filter(r => r.area === filters.area);

    // Increment view count asynchronously
    await supabase
      .from("share_links")
      .update({ view_count: (link.view_count || 0) + 1 })
      .eq("id", link.id);

    return {
      success: true,
      linkName: link.name,
      allowDownload: link.allow_download,
      reports,
      filters
    };
  } catch (error: any) {
    console.error("Failed to load shared dashboard data:", error);
    return { success: false, error: error.message || String(error) };
  }
}
