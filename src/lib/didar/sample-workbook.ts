/**
 * Browser download of the Didar contact header template.
 * Headers come from DIDAR_CONTACT_HEADERS so the sample cannot drift from the parser.
 */
import { DIDAR_CONTACT_HEADERS } from "./parse-contacts";

/** Canonical column order shown to the owner. «ادرس» is an accepted alias, not a second column. */
export const DIDAR_SAMPLE_HEADERS = [
  DIDAR_CONTACT_HEADERS.didar_id,
  DIDAR_CONTACT_HEADERS.mobile,
  DIDAR_CONTACT_HEADERS.last_name,
  DIDAR_CONTACT_HEADERS.title,
  DIDAR_CONTACT_HEADERS.first_name,
  DIDAR_CONTACT_HEADERS.company,
  DIDAR_CONTACT_HEADERS.landline,
  DIDAR_CONTACT_HEADERS.national_id,
  DIDAR_CONTACT_HEADERS.address,
] as const;

export const DIDAR_SAMPLE_REQUIRED_HEADER = DIDAR_CONTACT_HEADERS.mobile;

export function didarSampleMatrix(): unknown[][] {
  return [
    [...DIDAR_SAMPLE_HEADERS],
    [
      "D-SAMPLE-1",
      "09121234567",
      "نمونه‌ای",
      "آقای نمونه‌ای",
      "علی",
      "",
      "02112345678",
      "",
      "تهران",
    ],
    ["D-SAMPLE-2", "09129876543", "", "", "", "شرکت نمونه", "", "", ""],
  ];
}

export async function downloadDidarSampleWorkbook(): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(didarSampleMatrix());
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contact");
  XLSX.writeFile(wb, "didar-contacts-sample.xlsx");
}
