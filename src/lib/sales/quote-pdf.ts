// TODO PHASE 3.6
// Generate PDF using server-side renderer
// Must work with Persian fonts
// Must support offline/self-host environment

/**
 * Placeholder for future quote PDF generation.
 * In a future phase, this will render the quote as a PDF document
 * using a server-side renderer with Persian font support.
 */
export async function generateQuotePdfPlaceholder(_quoteId: string): Promise<Blob> {
  throw new Error("PDF generation is not implemented yet");
}

/**
 * Shape of data the future PDF renderer will expect.
 * Documented here so the data layer can be aligned in advance.
 */
export interface QuotePdfPayload {
  quote_number: string;
  customer_name: string;
  customer_phone: string;
  created_at: string;
  final_amount: number;
  items: Array<{
    title: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}