import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { PAGE_SIZE, type ReleaseCategory, type ReleaseStatus } from "./constants";
import type { PlatformRelease, PlatformReleaseDraftInput, PlatformReleaseItem } from "./types";
import { normalizeItems, validateDraftInput } from "./validate";

function mapItems(raw: Json): PlatformReleaseItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PlatformReleaseItem[] = [];
  for (let index = 0; index < raw.length; index++) {
    const entry = raw[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const o = entry as Record<string, unknown>;
    const title = typeof o.title_fa === "string" ? o.title_fa : "";
    const description = typeof o.description_fa === "string" ? o.description_fa : "";
    const itemNumber =
      typeof o.item_number === "number" && Number.isFinite(o.item_number)
        ? o.item_number
        : index + 1;
    items.push({
      item_number: itemNumber,
      title_fa: title,
      description_fa: description,
      module_key: typeof o.module_key === "string" ? o.module_key : null,
      route_path: typeof o.route_path === "string" ? o.route_path : null,
      change_type: typeof o.change_type === "string" ? o.change_type : null,
    });
  }
  return items.sort((a, b) => a.item_number - b.item_number);
}

function mapRow(row: {
  id: string;
  release_number: number | null;
  version: string | null;
  git_sha: string | null;
  build_time: string | null;
  title_fa: string;
  summary_fa: string;
  details_fa: string | null;
  category: string;
  status: string;
  items: Json;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}): PlatformRelease {
  return {
    ...row,
    category: row.category as ReleaseCategory,
    status: row.status as ReleaseStatus,
    items: mapItems(row.items),
  };
}

const SELECT_COLS =
  "id, release_number, version, git_sha, build_time, title_fa, summary_fa, details_fa, category, status, items, published_at, created_at, updated_at, created_by, updated_by";

export async function listPublishedReleases(page = 1, pageSize = PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from("platform_releases")
    .select(SELECT_COLS, { count: "exact" })
    .eq("status", "published")
    .order("release_number", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message || "خطا در دریافت به‌روزرسانی‌ها");
  return { rows: (data ?? []).map(mapRow), count: count ?? 0 };
}

export async function getLatestPublishedRelease(): Promise<PlatformRelease | null> {
  const { data, error } = await supabase
    .from("platform_releases")
    .select(SELECT_COLS)
    .eq("status", "published")
    .order("release_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || "خطا در دریافت آخرین به‌روزرسانی");
  return data ? mapRow(data) : null;
}

export async function getReleaseByNumber(releaseNumber: number): Promise<PlatformRelease | null> {
  const { data, error } = await supabase
    .from("platform_releases")
    .select(SELECT_COLS)
    .eq("release_number", releaseNumber)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message || "خطا در دریافت نسخه");
  return data ? mapRow(data) : null;
}

export async function listAdminReleases() {
  const { data, error } = await supabase
    .from("platform_releases")
    .select(SELECT_COLS)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message || "خطا در دریافت فهرست نسخه‌ها");
  return (data ?? []).map(mapRow);
}

export async function createDraftRelease(
  input: PlatformReleaseDraftInput,
  userId: string,
): Promise<PlatformRelease> {
  const items = normalizeItems(input.items);
  const err = validateDraftInput({ ...input, items });
  if (err) throw new Error(err);

  const { data, error } = await supabase
    .from("platform_releases")
    .insert({
      title_fa: input.title_fa.trim(),
      summary_fa: input.summary_fa.trim(),
      details_fa: input.details_fa?.trim() || null,
      category: input.category,
      version: input.version?.trim() || null,
      git_sha: input.git_sha?.trim() || null,
      build_time: input.build_time || null,
      items: items as unknown as Json,
      status: "draft",
      created_by: userId,
      updated_by: userId,
    })
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(error.message || "خطا در ایجاد پیش‌نویس");
  return mapRow(data);
}

export async function updateDraftRelease(
  id: string,
  input: PlatformReleaseDraftInput,
  userId: string,
): Promise<PlatformRelease> {
  const items = normalizeItems(input.items);
  const err = validateDraftInput({ ...input, items });
  if (err) throw new Error(err);

  const { data, error } = await supabase
    .from("platform_releases")
    .update({
      title_fa: input.title_fa.trim(),
      summary_fa: input.summary_fa.trim(),
      details_fa: input.details_fa?.trim() || null,
      category: input.category,
      version: input.version?.trim() || null,
      git_sha: input.git_sha?.trim() || null,
      build_time: input.build_time || null,
      items: items as unknown as Json,
      updated_by: userId,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) throw new Error(error.message || "خطا در به‌روزرسانی پیش‌نویس");
  if (!data) throw new Error("پیش‌نویس یافت نشد یا دیگر قابل ویرایش نیست");
  return mapRow(data);
}

export async function publishRelease(id: string): Promise<PlatformRelease> {
  const { data, error } = await supabase.rpc("publish_platform_release", { p_id: id });
  if (error) throw new Error(error.message || "خطا در انتشار نسخه");
  return mapRow(data);
}

export async function archiveRelease(id: string): Promise<PlatformRelease> {
  const { data, error } = await supabase.rpc("archive_platform_release", { p_id: id });
  if (error) throw new Error(error.message || "خطا در بایگانی نسخه");
  return mapRow(data);
}

export async function deleteDraftRelease(id: string): Promise<void> {
  const { error, count } = await supabase
    .from("platform_releases")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw new Error(error.message || "خطا در حذف پیش‌نویس");
  if (!count) throw new Error("فقط پیش‌نویس قابل حذف است");
}

/** Prefill helpers from live /api/version (never auto-publishes). */
export async function fetchDeployMeta(): Promise<{
  git_sha: string | null;
  build_time: string | null;
  version: string | null;
}> {
  try {
    const res = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return { git_sha: null, build_time: null, version: null };
    const body = (await res.json()) as {
      commitShort?: string;
      commit?: string;
      buildTime?: string;
    };
    const sha = body.commitShort || body.commit || null;
    return {
      git_sha: sha && sha !== "unknown" ? sha.replace(/[^0-9a-fA-F]/g, "").slice(0, 40) : null,
      build_time: body.buildTime && body.buildTime !== "unknown" ? body.buildTime : null,
      version: sha && sha !== "unknown" ? sha.slice(0, 8) : null,
    };
  } catch {
    return { git_sha: null, build_time: null, version: null };
  }
}
