/**
 * Browser download of the Asan person header template.
 * Headers come from ASAN_PERSON_HEADERS so the sample cannot drift from the parser.
 */
import { ASAN_PERSON_HEADERS } from "./parse-persons";

export const ASAN_SAMPLE_HEADERS = [
  ASAN_PERSON_HEADERS.asan_code,
  ASAN_PERSON_HEADERS.display_name,
  ASAN_PERSON_HEADERS.mobile,
  ASAN_PERSON_HEADERS.landline,
  ASAN_PERSON_HEADERS.national_id,
  ASAN_PERSON_HEADERS.address,
  ASAN_PERSON_HEADERS.city,
  ASAN_PERSON_HEADERS.province,
] as const;

export const ASAN_SAMPLE_REQUIRED_HEADERS = [
  ASAN_PERSON_HEADERS.asan_code,
  ASAN_PERSON_HEADERS.mobile,
] as const;

export function asanSampleMatrix(): unknown[][] {
  return [
    [...ASAN_SAMPLE_HEADERS],
    [
      "1001",
      "نمونه آسان",
      "09121234567",
      "02112345678",
      "",
      "خیابان نمونه",
      "تهران",
      "تهران",
    ],
    ["1002", "شرکت نمونه", "09129876543", "", "", "", "", ""],
  ];
}

export async function downloadAsanSampleWorkbook(): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(asanSampleMatrix());
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "اشخاص");
  XLSX.writeFile(wb, "asan-persons-sample.xlsx");
}
