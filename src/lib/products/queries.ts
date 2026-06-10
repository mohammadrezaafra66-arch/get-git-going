import { supabase } from "@/integrations/supabase/client";

export async function fetchBrandsLite() {
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, is_active")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCategoriesLite() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, is_active, naming_template, primary_spec_label")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchLabelsLite() {
  const { data, error } = await supabase
    .from("product_labels")
    .select("id, title, color, is_active")
    .order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAttributesLite() {
  const { data, error } = await supabase
    .from("product_attributes")
    .select("id, type, name, is_active")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
