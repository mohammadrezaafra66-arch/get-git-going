import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, X, Wand2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "@tanstack/react-router";
import { fetchBrandsLite, fetchCategoriesLite, fetchLabelsLite } from "@/lib/products/queries";
import { productSchema, type ProductFormValues } from "@/lib/products/schemas";
import {
  PRODUCT_TYPE_LABELS,
  STOCK_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
} from "@/lib/products/constants";
import { supabase } from "@/integrations/supabase/client";
import { composeProductName } from "@/lib/products/name-template";
import {
  fetchCategoryAttributes,
  validateDynamicValues,
  type CategoryAttributeDef,
  type DynamicAttrValues,
} from "@/lib/products/category-attrs";
import { findDuplicateProduct, type DuplicateProduct } from "@/lib/products/duplicate-check";
import { useDebounce } from "@/hooks/use-debounce";
import { ProductImagesSection } from "@/components/products/ProductImagesSection";

interface Props {
  initial?: Partial<ProductFormValues>;
  existingSku?: string | null;
  submitLabel?: string;
  loading?: boolean;
  /** When true, behave as edit form: do not auto-overwrite name on field changes. */
  isEdit?: boolean;
  /** Product id to exclude from duplicate-check (only meaningful in edit mode). */
  productId?: string | null;
  /** Initial dynamic attribute values keyed by category_attribute_id. */
  initialDynamicValues?: DynamicAttrValues;
  /** Initial category id at mount, used to detect a category change in edit mode. */
  initialCategoryId?: string | null;
  onSubmit: (
    values: ProductFormValues,
    dynamic: { values: DynamicAttrValues; defs: CategoryAttributeDef[]; categoryChanged: boolean },
  ) => Promise<void> | void;
  onCancel?: () => void;
  /** Fired with `true` when the form gains unsaved changes after hydration; `false` after reset. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Imperative handle to the underlying <form> so parents can `.requestSubmit()`. */
  formRef?: React.Ref<HTMLFormElement>;
}

const DEFAULTS: ProductFormValues = {
  name: "",
  brand_id: null,
  category_id: null,
  product_type: "iranian",
  base_currency: "toman",
  stock_status: "unknown",
  status: "active",
  unit: "",
  color: "",
  capacity: "",
  model: "",
  primary_spec: "",
  description: "",
  technical_notes: "",
  barcode: "",
  accounting_code: "",
  torob_url: "",
  promotion_weight: 1,
  label_ids: [],
};

const UNSAVED_CHANGES_MESSAGE = "تغییرات ذخیره‌نشده از بین می‌رود. بدون ذخیره خارج می‌شوید؟";

const normalizeDynamicValues = (values: DynamicAttrValues) =>
  Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));

const normalizeProductFormValues = (values: ProductFormValues): ProductFormValues => ({
  ...values,
  label_ids: [...values.label_ids].sort(),
});

const serializeFormState = (values: ProductFormValues, dynamicValues: DynamicAttrValues) =>
  JSON.stringify({
    values: normalizeProductFormValues(values),
    dynamicValues: normalizeDynamicValues(dynamicValues),
  });

export function ProductForm({
  initial,
  existingSku,
  submitLabel = "ذخیره",
  loading,
  isEdit,
  productId,
  initialDynamicValues,
  initialCategoryId,
  onSubmit,
  onCancel,
  onDirtyChange,
  formRef,
}: Props) {
  const initialValues = { ...DEFAULTS, ...initial };
  const initialDynamic = initialDynamicValues ?? {};
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoName, setAutoName] = useState<boolean>(!isEdit && !initial?.name);
  const lastAutoNameRef = useRef<string>("");
  const [dynValues, setDynValues] = useState<DynamicAttrValues>(initialDynamic);
  const [dynErrors, setDynErrors] = useState<Record<string, string>>({});
  const initialCatRef = useRef<string | null>(initialCategoryId ?? initial?.category_id ?? null);
  const initialSnapshotRef = useRef(serializeFormState(initialValues, initialDynamic));
  const submittingRef = useRef(false);

  // ---------- پیش‌نویس ذخیره‌نشده در sessionStorage ----------
  // نکته: از sessionStorage استفاده می‌شود تا با بسته‌شدن تب مرورگر
  // پیش‌نویس به‌صورت خودکار پاک شود و ریسک stale draft از بین برود.
  const draftKey = productId ? `afrakala_product_draft_${productId}` : null;
  const [draftRestoredBanner, setDraftRestoredBanner] = useState(false);
  const draftHydratedRef = useRef(false);
  const draftRestoredRef = useRef(false);

  // Restore draft on mount (once)
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(draftKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          values?: ProductFormValues;
          dynValues?: DynamicAttrValues;
        };
        if (parsed?.values) setValues((s) => ({ ...s, ...parsed.values }));
        if (parsed?.dynValues) setDynValues(parsed.dynValues);
        setDraftRestoredBanner(true);
        setAutoName(false);
        draftRestoredRef.current = true;
        onDirtyChange?.(true);
      }
    } catch {
      /* ignore corrupt draft */
    } finally {
      draftHydratedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save of draft (500ms) whenever values/dynValues change
  useEffect(() => {
    if (!draftKey) return;
    if (!draftHydratedRef.current) return;
    const t = setTimeout(() => {
      try {
        window.sessionStorage.setItem(draftKey, JSON.stringify({ values, dynValues }));
        draftRestoredRef.current = true;
        onDirtyChange?.(true);
      } catch {
        /* quota or unavailable */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [draftKey, values, dynValues, onDirtyChange]);

  const dismissDraftBanner = () => setDraftRestoredBanner(false);
  const resetDraft = () => {
    if (draftKey) {
      try {
        window.sessionStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
    }
    setValues({ ...DEFAULTS, ...initial });
    setDynValues(initialDynamicValues ?? {});
    setErrors({});
    setDynErrors({});
    setAutoName(!isEdit && !initial?.name);
    setDraftRestoredBanner(false);
    draftRestoredRef.current = false;
    onDirtyChange?.(false);
  };

  // ---------- بررسی زنده تکراری بودن محصول ----------
  const dupKey = useMemo(
    () => ({
      brand_id: values.brand_id ?? null,
      category_id: values.category_id ?? null,
      model: (values.model ?? "").trim(),
      color: (values.color ?? "").trim(),
      capacity: (values.capacity ?? "").trim(),
    }),
    [values.brand_id, values.category_id, values.model, values.color, values.capacity],
  );
  const debouncedDupKey = useDebounce(dupKey, 400);
  const dupQ = useQuery<DuplicateProduct | null>({
    queryKey: ["product-duplicate-check", debouncedDupKey, productId ?? null],
    enabled: !!debouncedDupKey.brand_id && !!debouncedDupKey.category_id,
    staleTime: 5_000,
    queryFn: () =>
      findDuplicateProduct({
        brandId: debouncedDupKey.brand_id,
        categoryId: debouncedDupKey.category_id,
        model: debouncedDupKey.model,
        color: debouncedDupKey.color,
        capacity: debouncedDupKey.capacity,
        excludeId: productId ?? null,
      }),
  });
  const duplicate = dupQ.data ?? null;
  const dupChecking = dupQ.isFetching;

  useEffect(() => {
    // اگر پیش‌نویس بازیابی شده، props تازه از سرور نباید روی state کاربر بنویسد؛
    // فقط شناسهٔ دستهٔ اولیه را برای تشخیص تغییر دسته به‌روزرسانی می‌کنیم.
    if (draftRestoredRef.current) {
      initialCatRef.current = initialCategoryId ?? initial?.category_id ?? initialCatRef.current;
      return;
    }
    const nextValues = { ...DEFAULTS, ...initial };
    const nextDynamic = initialDynamicValues ?? {};
    setValues(nextValues);
    setAutoName(!isEdit && !initial?.name);
    lastAutoNameRef.current = "";
    setDynValues(nextDynamic);
    setDynErrors({});
    initialCatRef.current = initialCategoryId ?? initial?.category_id ?? null;
    initialSnapshotRef.current = serializeFormState(nextValues, nextDynamic);
  }, [initial, isEdit, initialDynamicValues, initialCategoryId]);

  const currentSnapshot = useMemo(() => serializeFormState(values, dynValues), [dynValues, values]);
  const hasUnsavedChanges = isEdit === true && currentSnapshot !== initialSnapshotRef.current;

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const confirmLeaving = () => window.confirm(UNSAVED_CHANGES_MESSAGE);

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (submittingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const warnOnLinkClick = (event: MouseEvent) => {
      if (submittingRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!link) return;
      if (confirmLeaving()) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnOnLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnOnLinkClick, true);
    };
  }, [hasUnsavedChanges]);

  const brandsQ = useQuery({ queryKey: ["brands-lite"], queryFn: fetchBrandsLite });
  const catsQ = useQuery({ queryKey: ["categories-lite"], queryFn: fetchCategoriesLite });
  const labelsQ = useQuery({ queryKey: ["labels-lite"], queryFn: fetchLabelsLite });
  const attrsQ = useQuery({
    queryKey: ["product-attributes-active-v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_attributes")
        .select("id, type, name, category_id")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const attrsByType = (t: "color" | "capacity" | "model") =>
    (attrsQ.data ?? []).filter((a) => a.type === t);
  // Models scoped to selected category. Items with category_id = NULL (legacy)
  // remain visible in every category until an admin assigns one.
  const modelOptions = useMemo(() => {
    const all = (attrsQ.data ?? []).filter((a) => a.type === "model");
    const cat = values.category_id ?? null;
    const filtered = cat
      ? all.filter((a) => (a as any).category_id === cat || (a as any).category_id == null)
      : all;
    return filtered.map((a) => ({ value: a.name, label: a.name }));
  }, [attrsQ.data, values.category_id]);

  const qc = useQueryClient();
  const createModelMut = useMutation({
    mutationFn: async (name: string) => {
      if (!values.category_id) throw new Error("ابتدا دسته‌بندی را انتخاب کنید");
      const { data, error } = await supabase.rpc("find_or_create_model", {
        p_name: name,
        p_category_id: values.category_id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { id: string; name: string; category_id: string } | null;
    },
    onSuccess: (row) => {
      if (row?.name) {
        set("model", row.name);
        toast.success("مدل اضافه شد");
        qc.invalidateQueries({ queryKey: ["product-attributes-active-v2"] });
        qc.invalidateQueries({ queryKey: ["product-attributes-all"] });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در افزودن مدل"),
  });

  const currenciesQ = useQuery({
    queryKey: ["currencies-active"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currencies")
        .select("code, title, symbol, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const set = <K extends keyof ProductFormValues>(k: K, v: ProductFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  // Detect category change vs initial: clear dynamic values, surface a notice.
  const prevCategoryRef = useRef<string | null>(values.category_id ?? null);
  const [categoryChangedNotice, setCategoryChangedNotice] = useState(false);
  useEffect(() => {
    const prev = prevCategoryRef.current;
    const next = values.category_id ?? null;
    if (prev !== next) {
      // category actually changed by user interaction
      if (prev !== null) {
        setDynValues({});
        setDynErrors({});
        // Show notice only when the value differs from the original loaded category
        setCategoryChangedNotice(next !== initialCatRef.current);
      }
      prevCategoryRef.current = next;
    }
  }, [values.category_id]);

  // Load active dynamic attribute definitions for the selected category
  const dynDefsQ = useQuery({
    queryKey: ["product-form-cpa", values.category_id],
    enabled: !!values.category_id,
    queryFn: () => fetchCategoryAttributes(values.category_id as string),
  });
  const dynDefs: CategoryAttributeDef[] = dynDefsQ.data ?? [];

  const setDyn = (id: string, v: string) => {
    setDynValues((s) => ({ ...s, [id]: v }));
    setDynErrors((s) => {
      if (!s[id]) return s;
      const copy = { ...s };
      delete copy[id];
      return copy;
    });
  };

  const selectedCategory = useMemo(() => {
    return (catsQ.data ?? []).find((c) => c.id === values.category_id) ?? null;
  }, [catsQ.data, values.category_id]);

  const primarySpecLabel = ((selectedCategory as any)?.primary_spec_label?.toString().trim() ??
    "") as string;
  const namingTemplate = ((selectedCategory as any)?.naming_template?.toString() ?? "") as string;
  // اگر برچسب «مشخصه اصلی» با یکی از فیلدهای استاندارد یکی باشد،
  // فیلد متنی مشخصه اصلی حذف می‌شود و مقدار همان فیلد استاندارد جایگزین آن می‌گردد.
  const primarySpecMappedField: "capacity" | "color" | "model" | null =
    primarySpecLabel === "ظرفیت"
      ? "capacity"
      : primarySpecLabel === "رنگ"
        ? "color"
        : primarySpecLabel === "مدل"
          ? "model"
          : null;
  const primarySpecHidden = primarySpecMappedField !== null;
  const effectivePrimarySpec = primarySpecHidden
    ? ((values[primarySpecMappedField as "capacity" | "color" | "model"] ?? "") as string)
    : (values.primary_spec ?? "");
  const primarySpecRequired = primarySpecLabel.length > 0 && !primarySpecHidden;

  const selectedBrandName = useMemo(() => {
    const b = (brandsQ.data ?? []).find((x) => x.id === values.brand_id);
    return b?.name ?? "";
  }, [brandsQ.data, values.brand_id]);

  // Build dynamic-attribute maps for name generation:
  // - dynamic_attrs: attribute_key -> current value
  // - use_in_name_keys: ordered keys flagged use_in_product_name=true
  const dynamicAttrsForName = useMemo(() => {
    const out: Record<string, string> = {};
    for (const d of dynDefs) {
      const v = (dynValues[d.id] ?? "").trim();
      if (v) out[d.attribute_key] = v;
    }
    return out;
  }, [dynDefs, dynValues]);

  const useInNameKeys = useMemo(
    () => dynDefs.filter((d) => d.use_in_product_name).map((d) => d.attribute_key),
    [dynDefs],
  );

  const computeName = (): string =>
    composeProductName({
      template: namingTemplate || null,
      category: selectedCategory?.name ?? "",
      brand: selectedBrandName,
      primary_spec: effectivePrimarySpec,
      model: values.model ?? "",
      capacity: values.capacity ?? "",
      color: values.color ?? "",
      sku: existingSku ?? "",
      dynamic_attrs: dynamicAttrsForName,
      use_in_name_keys: useInNameKeys,
    });

  useEffect(() => {
    if (!autoName) return;
    const next = computeName();
    if (!next) return;
    if (next === values.name) return;
    lastAutoNameRef.current = next;
    setValues((s) => ({ ...s, name: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoName,
    values.category_id,
    values.brand_id,
    values.primary_spec,
    values.model,
    values.capacity,
    values.color,
    namingTemplate,
    selectedCategory?.name,
    selectedBrandName,
    existingSku,
    dynamicAttrsForName,
    useInNameKeys,
  ]);

  const onNameChange = (v: string) => {
    if (autoName && v !== lastAutoNameRef.current) {
      setAutoName(false);
    }
    set("name", v);
  };

  const regenerateName = () => {
    const next = computeName();
    if (!next) {
      toast.warning("ابتدا دسته‌بندی و فیلدهای مرتبط را پر کنید");
      return;
    }
    lastAutoNameRef.current = next;
    setValues((s) => ({ ...s, name: next }));
    setAutoName(true);
    toast.success("نام محصول دوباره ساخته شد");
  };

  const toggleLabel = (id: string) => {
    setValues((s) => ({
      ...s,
      label_ids: s.label_ids.includes(id)
        ? s.label_ids.filter((x) => x !== id)
        : [...s.label_ids, id],
    }));
  };

  const handleCancel = () => {
    if (hasUnsavedChanges && !window.confirm(UNSAVED_CHANGES_MESSAGE)) {
      return;
    }

    onCancel?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicate) {
      toast.error("ثبت متوقف شد: محصول مشابهی قبلاً ثبت شده است.");
      return;
    }
    const flat: Record<string, string> = {};
    if (primarySpecRequired && !(values.primary_spec ?? "").trim()) {
      flat.primary_spec = `${primarySpecLabel} الزامی است`;
    }
    // وقتی فیلد مشخصه اصلی مخفی است، مقدارش را با فیلد استاندارد متناظر همگام کن
    const valuesForSubmit = primarySpecHidden
      ? { ...values, primary_spec: effectivePrimarySpec }
      : values;
    const parsed = productSchema.safeParse(valuesForSubmit);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) flat[issue.path.join(".")] = issue.message;
    }
    // Dynamic attribute validation
    const dErrs = validateDynamicValues(dynDefs, dynValues);
    if (Object.keys(flat).length > 0 || Object.keys(dErrs).length > 0) {
      setErrors(flat);
      setDynErrors(dErrs);
      toast.error("لطفاً خطاهای فرم را اصلاح کنید");
      return;
    }
    setErrors({});
    setDynErrors({});
    const categoryChanged =
      isEdit === true && (values.category_id ?? null) !== initialCatRef.current;
    submittingRef.current = true;
    try {
      await onSubmit(parsed.success ? parsed.data : (valuesForSubmit as ProductFormValues), {
        values: dynValues,
        defs: dynDefs,
        categoryChanged,
      });
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {draftRestoredBanner && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-yellow-400/60 bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-100"
          role="status"
        >
          <span>شما تغییرات ذخیره‌نشده دارید.</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={dismissDraftBanner}>
              ادامه ویرایش
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={resetDraft}>
              شروع مجدد
            </Button>
          </div>
        </div>
      )}
      {duplicate && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>محصول تکراری شناسایی شد</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              محصولی با ترکیب «برند + دسته + مدل + رنگ + ظرفیت» مشابه قبلاً ثبت شده است. ثبت محصول
              جدید مجاز نیست.
            </p>
            <div className="rounded-md bg-background/50 p-2 text-sm">
              <div>
                <span className="font-medium">نام:</span> {duplicate.name}
              </div>
              {duplicate.sku && (
                <div dir="ltr" className="text-start">
                  <span className="font-medium">SKU:</span> {duplicate.sku}
                </div>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/products/$id" params={{ id: duplicate.id }}>
                مشاهده محصول موجود
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!duplicate && dupChecking && values.brand_id && values.category_id && (
        <p className="text-xs text-muted-foreground">در حال بررسی تکراری بودن محصول...</p>
      )}
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="نام محصول" required error={errors.name}>
            <div className="flex gap-2">
              <Input
                value={values.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="مثلاً: موتور القایی ۳ کیلووات"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={regenerateName}
                title="ساخت نام خودکار"
              >
                <Wand2 className="ms-1 h-4 w-4" />
                ساخت نام خودکار
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              نام محصول بر اساس الگوی استاندارد دسته‌بندی ساخته می‌شود و برای جستجوی سریع قیمت
              استفاده خواهد شد.
            </p>
          </Field>
          <Field label="کد محصول (SKU)">
            <Input
              value={existingSku ?? ""}
              dir="ltr"
              readOnly
              disabled
              placeholder="کد محصول بعد از ذخیره به‌صورت خودکار ساخته می‌شود"
            />
            {!existingSku && (
              <p className="text-xs text-muted-foreground">
                کد محصول بعد از ذخیره به‌صورت خودکار توسط سیستم ساخته می‌شود.
              </p>
            )}
          </Field>
          <Field label="بارکد" error={errors.barcode}>
            <Input
              value={values.barcode ?? ""}
              onChange={(e) => set("barcode", e.target.value)}
              dir="ltr"
              placeholder="بارکد محصول (اختیاری)"
              maxLength={64}
            />
          </Field>
          <Field label="کد کالا در آسان" error={errors.accounting_code}>
            <Input
              value={values.accounting_code ?? ""}
              onChange={(e) => set("accounting_code", e.target.value)}
              dir="ltr"
              placeholder="کد کالا در نرم‌افزار آسان (اختیاری)"
              maxLength={32}
            />
            <p className="text-xs text-muted-foreground">
              کلید مشترک این کالا با نرم‌افزار آسان. اختیاری است؛ کالای بدون کد هم ذخیره می‌شود و در
              خروجی فروش/خرید ستون «کد کالا» خالی می‌ماند تا آسان خودش کد بسازد.
            </p>
          </Field>
          <Field label="لینک ترب" error={errors.torob_url}>
            <Input
              value={values.torob_url ?? ""}
              onChange={(e) => set("torob_url", e.target.value)}
              dir="ltr"
              placeholder="https://torob.com/p/… (اختیاری)"
              maxLength={500}
              inputMode="url"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              آدرس صفحهٔ همین کالا در ترب. اختیاری است؛ خالی بگذارید اگر هنوز لینک ندارید.
            </p>
          </Field>

          <Field label="برند">
            <SearchableSelect
              value={values.brand_id ?? null}
              onChange={(v) => set("brand_id", v)}
              options={(brandsQ.data ?? [])
                .filter((b) => b.is_active)
                .map((b) => ({ value: b.id, label: b.name }))}
              placeholder="انتخاب برند"
              searchPlaceholder="جستجوی برند..."
              emptyText="برندی یافت نشد"
              noneLabel="— بدون برند —"
            />
          </Field>

          <Field label="دسته‌بندی">
            <SearchableSelect
              value={values.category_id ?? null}
              onChange={(v) => set("category_id", v)}
              options={(catsQ.data ?? [])
                .filter((c) => c.is_active)
                .map((c) => ({ value: c.id, label: c.name }))}
              placeholder="انتخاب دسته"
              searchPlaceholder="جستجوی دسته..."
              emptyText="دسته‌ای یافت نشد"
              noneLabel="— بدون دسته —"
            />
          </Field>

          <Field label="نوع محصول">
            <Select
              value={values.product_type}
              onValueChange={(v) => set("product_type", v as ProductFormValues["product_type"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRODUCT_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="ارز مبنا">
            <Select
              value={values.base_currency || ""}
              onValueChange={(v) => set("base_currency", v)}
              disabled={currenciesQ.isLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={currenciesQ.isLoading ? "در حال بارگذاری..." : "انتخاب ارز"}
                />
              </SelectTrigger>
              <SelectContent>
                {(currenciesQ.data ?? []).length === 0 && !currenciesQ.isLoading ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    هیچ ارز فعالی تعریف نشده است.
                  </div>
                ) : (
                  (currenciesQ.data ?? []).map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.title} ({c.code.toUpperCase()})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>

          <Field label="وضعیت موجودی">
            <Select
              value={values.stock_status}
              onValueChange={(v) => set("stock_status", v as ProductFormValues["stock_status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STOCK_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="وضعیت محصول">
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as ProductFormValues["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRODUCT_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="واحد">
            <Input
              value={values.unit ?? ""}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="مثلاً: عدد، متر، کیلوگرم"
            />
          </Field>

          <Field label="رنگ">
            <Select
              value={values.color || "__none"}
              onValueChange={(v) => set("color", v === "__none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="انتخاب رنگ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— بدون رنگ —</SelectItem>
                {attrsByType("color").map((a) => (
                  <SelectItem key={a.id} value={a.name}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="ظرفیت">
            <Select
              value={values.capacity || "__none"}
              onValueChange={(v) => set("capacity", v === "__none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="انتخاب ظرفیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— بدون ظرفیت —</SelectItem>
                {attrsByType("capacity").map((a) => (
                  <SelectItem key={a.id} value={a.name}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="مدل">
            <SearchableSelect
              value={values.model ? values.model : null}
              onChange={(v) => set("model", v ?? "")}
              options={modelOptions}
              placeholder={values.category_id ? "انتخاب مدل" : "ابتدا دسته را انتخاب کنید"}
              searchPlaceholder="جستجو یا تایپ نام جدید..."
              emptyText="مدلی یافت نشد"
              noneLabel="— بدون مدل —"
              disabled={!values.category_id || createModelMut.isPending}
              onCreate={
                values.category_id
                  ? async (q) => {
                      await createModelMut.mutateAsync(q);
                    }
                  : undefined
              }
              createLabel={(q) => `افزودن مدل جدید: «${q}»`}
            />
            {!values.category_id ? (
              <p className="text-xs text-muted-foreground">
                برای دیدن یا ساختن مدل، ابتدا دسته‌بندی را انتخاب کنید.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                فقط مدل‌های مرتبط با این دسته نمایش داده می‌شود. تکراری ساخته نخواهد شد.
              </p>
            )}
          </Field>

          {!primarySpecHidden && (
            <Field
              label={primarySpecLabel || "مشخصه اصلی"}
              required={primarySpecRequired}
              error={errors.primary_spec}
            >
              <Input
                value={values.primary_spec ?? ""}
                onChange={(e) => set("primary_spec", e.target.value)}
                maxLength={100}
                placeholder={
                  primarySpecLabel ? `مثلاً مقدار ${primarySpecLabel}` : "مشخصه اصلی محصول"
                }
              />
              <p className="text-xs text-muted-foreground">
                این مقدار در نام استاندارد محصول استفاده می‌شود.
              </p>
            </Field>
          )}

          {/* Item 166 — standalone promotion weight, independent of label weights. */}
          <Field label="وزن تبلیغ محصول" error={errors.promotion_weight}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={100}
              dir="ltr"
              className="text-left"
              value={String(values.promotion_weight ?? 1)}
              onChange={(e) => set("promotion_weight", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              ضریب مستقل این محصول در امتیاز پیشنهادهای تبلیغاتی. ۱ یعنی خنثی (رفتار پیش‌فرض)،
              بزرگ‌تر از ۱ محصول را بالاتر می‌آورد و ۰ آن را از پیشنهادها خارج می‌کند. این ضریب جدا
              از مجموع وزن برچسب‌هاست.
            </p>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">ویژگی‌های اختصاصی دسته‌بندی</h3>
          </div>
          {categoryChangedNotice && (
            <div className="rounded-md border border-amber-300/40 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              با تغییر دسته‌بندی، ویژگی‌های اختصاصی قبلی پاک می‌شوند.
            </div>
          )}
          {!values.category_id ? (
            <p className="text-xs text-muted-foreground">
              برای نمایش ویژگی‌های اختصاصی، ابتدا دسته‌بندی را انتخاب کنید.
            </p>
          ) : dynDefsQ.isLoading ? (
            <p className="text-xs text-muted-foreground">در حال بارگذاری ویژگی‌ها...</p>
          ) : dynDefs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              برای این دسته‌بندی ویژگی اختصاصی تعریف نشده است.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {dynDefs.map((d) => (
                <DynamicAttrField
                  key={d.id}
                  def={d}
                  value={dynValues[d.id] ?? ""}
                  error={dynErrors[d.id]}
                  onChange={(v) => setDyn(d.id, v)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <Field label="توضیحات">
            <Textarea
              value={values.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="یادداشت فنی">
            <Textarea
              value={values.technical_notes ?? ""}
              onChange={(e) => set("technical_notes", e.target.value)}
              rows={3}
            />
          </Field>

          <div>
            <Label className="mb-2 block">برچسب‌ها</Label>
            {labelsQ.isLoading ? (
              <div className="text-sm text-muted-foreground">در حال بارگذاری برچسب‌ها...</div>
            ) : (labelsQ.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">هنوز برچسبی تعریف نشده.</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {(labelsQ.data ?? []).map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={values.label_ids.includes(l.id)}
                      onCheckedChange={() => toggleLabel(l.id)}
                    />
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    <span>{l.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <ProductImagesSection productId={productId ?? null} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={handleCancel}>
            <X className="ms-1 h-4 w-4" />
            انصراف
          </Button>
        )}
        <Button type="submit" disabled={loading || !!duplicate || dupChecking}>
          {loading ? (
            <Loader2 className="ms-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="ms-1 h-4 w-4" />
          )}
          {duplicate ? "ثبت غیرممکن (تکراری)" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function DynamicAttrField({
  def,
  value,
  error,
  onChange,
}: {
  def: CategoryAttributeDef;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  let control: React.ReactNode;
  switch (def.input_type) {
    case "number":
      control = (
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
        />
      );
      break;
    case "select":
      control = (
        <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="انتخاب کنید..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— انتخاب نشده —</SelectItem>
            {def.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "boolean":
      control = (
        <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
          <Switch
            checked={value === "true"}
            onCheckedChange={(v) => onChange(v ? "true" : "false")}
          />
          <span className="text-sm text-muted-foreground">{value === "true" ? "بله" : "خیر"}</span>
        </div>
      );
      break;
    case "date":
      control = <PersianDatePicker value={value || null} onChange={(v) => onChange(v ?? "")} />;
      break;
    case "text":
    default:
      control = <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} />;
      break;
  }
  return (
    <Field label={def.label_fa} required={def.is_required} error={error}>
      {control}
      {def.help_text && <p className="text-xs text-muted-foreground">{def.help_text}</p>}
    </Field>
  );
}
