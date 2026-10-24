// ============================================================
// Supabase 客户端 — 仅用于 Auth（邮箱+密码）+ 云端数据镜像
// 不暴露 service_role key
//
// 设计：环境变量缺失时「安全降级」——不创建客户端、isAuthConfigured=false，
// 此时整个应用走纯本地模式（localStorage），登录页跳过、数据不联网。
// 只有填了 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 才启用云端。
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/** 是否已配置 Supabase（决定是否启用登录 + 云端同步） */
export const isAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** 配置后才创建客户端；未配置时为 null，调用方需判空 */
export const supabase: SupabaseClient | null = isAuthConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/** 当前登录用户的 id（未登录 / 未配置时返回 null） */
export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** 当前登录用户的邮箱（未登录 / 未配置时返回 null） */
export async function getCurrentUserEmail(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email ?? null;
}
