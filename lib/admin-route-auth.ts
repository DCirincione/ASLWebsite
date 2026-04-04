import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { canAccessAdminDashboard, canAccessPartnerPortal, type ProfileRole } from "@/lib/event-approval";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

export const getBearerToken = (req: NextRequest) => {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
};

export const getSupabaseWithToken = (token?: string) => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
  });
};

export const getSupabaseServer = () => {
  if (!supabaseUrl) return null;
  const key = supabaseServiceRoleKey || supabaseAnonKey;
  if (!key) return null;
  return createClient(supabaseUrl, key);
};

export const getSupabaseServiceRole = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey);
};

export const getAuthenticatedProfile = async (req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return null;

  const supabase = getSupabaseWithToken(token);
  if (!supabase) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.id) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,name")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) return null;

  return {
    id: userData.user.id,
    role: (profile.role ?? null) as ProfileRole | null,
    name: profile.name ?? null,
    token,
  };
};

export const isAdminOrOwner = async (req: NextRequest) => {
  const profile = await getAuthenticatedProfile(req);
  return canAccessAdminDashboard(profile?.role);
};

export const isPartnerUser = async (req: NextRequest) => {
  const profile = await getAuthenticatedProfile(req);
  return canAccessPartnerPortal(profile?.role);
};
