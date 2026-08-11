import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import {
  fetchAdminEntries,
  MOODS,
  STATUS_LABELS,
  FOLLOW_UP_OPTIONS,
  type MoodEntry,
  type EntryStatus,
} from "@/lib/operations/daily-mood";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { DailyMoodEntryDetails } from "./DailyMoodEntryDetails";

const PAGE_SIZE = 20;

export function DailyMoodAdminTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [moodKey, setMoodKey] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [followUp, setFollowUp] = useState<string>("");
  const [date, setDate] = useState<string>("");

  const [rows, setRows] = useState<MoodEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MoodEntry | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const { rows, total } = await fetchAdminEntries({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        moodKey: moodKey || undefined,
        status: status || undefined,
        followUp: followUp || undefined,
        date: date || undefined,
      });
      setRows(rows);
      setTotal(total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [page, debouncedSearch, moodKey, status, followUp, date]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <Input
            placeholder="جستجو در متن آزاد…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <Select
            value={moodKey || "_all"}
            onValueChange={(v) => {
              setPage(1);
              setMoodKey(v === "_all" ? "" : v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="حال" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">همه حال‌ها</SelectItem>
              {MOODS.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.emoji} {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status || "_all"}
            onValueChange={(v) => {
              setPage(1);
              setStatus(v === "_all" ? "" : v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="وضعیت" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">همه وضعیت‌ها</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={followUp || "_all"}
            onValueChange={(v) => {
              setPage(1);
              setFollowUp(v === "_all" ? "" : v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="پیگیری" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">همه</SelectItem>
              {FOLLOW_UP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PersianDatePicker
            value={date || null}
            onChange={(v) => {
              setPage(1);
              setDate(v ?? "");
            }}
            placeholder="انتخاب تاریخ"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">موردی یافت نشد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="p-3 text-right">تاریخ</th>
                    <th className="p-3 text-right">حال</th>
                    <th className="p-3 text-right">دلایل</th>
                    <th className="p-3 text-right">پیگیری</th>
                    <th className="p-3 text-right">وضعیت</th>
                    <th className="p-3 text-right">آخرین تغییر</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const m = MOODS.find((x) => x.key === r.mood_key);
                    return (
                      <tr key={r.id} className="border-t hover:bg-accent/30">
                        <td className="p-3 whitespace-nowrap">{r.mood_date}</td>
                        <td className="p-3">
                          <span className="ml-1">{m?.emoji}</span>
                          {r.mood_label}
                        </td>
                        <td className="p-3 text-muted-foreground max-w-64 truncate">
                          {(r.reasons ?? []).join("، ") || "—"}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              r.wants_follow_up === "important"
                                ? "destructive"
                                : r.wants_follow_up === "no"
                                  ? "secondary"
                                  : "default"
                            }
                          >
                            {FOLLOW_UP_OPTIONS.find((o) => o.value === r.wants_follow_up)?.label ??
                              r.wants_follow_up}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{STATUS_LABELS[r.status]}</Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.updated_at).toLocaleString("fa-IR")}
                        </td>
                        <td className="p-3 text-left">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                            جزئیات
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total} مورد — صفحه {page} از {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            قبلی
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      </div>

      {selected && (
        <DailyMoodEntryDetails
          entry={selected}
          onClose={() => setSelected(null)}
          onChanged={(next) => {
            setSelected(next);
            void reload();
          }}
        />
      )}
    </div>
  );
}

export type _UnusedStatus = EntryStatus;
