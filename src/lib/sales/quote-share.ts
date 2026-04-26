// Future integrations:
// Telegram
// WhatsApp
// Direct link sharing

export type QuoteShareChannel = "whatsapp" | "telegram" | "link";

/**
 * Placeholder for future quote sharing through messengers.
 * In a future phase, this will dispatch the quote (or its PDF link)
 * to the selected channel.
 */
export async function shareQuotePlaceholder(
  _quoteId: string,
  _channel: QuoteShareChannel = "whatsapp",
): Promise<void> {
  throw new Error("Quote sharing not implemented yet");
}