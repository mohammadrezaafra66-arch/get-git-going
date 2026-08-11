import type { ReleaseCategory, ReleaseStatus } from "./constants";

export interface PlatformReleaseItem {
  item_number: number;
  title_fa: string;
  description_fa: string;
  module_key?: string | null;
  route_path?: string | null;
  change_type?: string | null;
}

export interface PlatformRelease {
  id: string;
  release_number: number | null;
  version: string | null;
  git_sha: string | null;
  build_time: string | null;
  title_fa: string;
  summary_fa: string;
  details_fa: string | null;
  category: ReleaseCategory;
  status: ReleaseStatus;
  items: PlatformReleaseItem[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type PlatformReleaseDraftInput = {
  title_fa: string;
  summary_fa: string;
  details_fa?: string | null;
  category: ReleaseCategory;
  version?: string | null;
  git_sha?: string | null;
  build_time?: string | null;
  items: PlatformReleaseItem[];
};
