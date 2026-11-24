import { CsvParseResult, ParsedRecipient } from '../types';

/**
 * Standard RFC 5322 compliant email regex pattern for robust validation
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Parses raw text or CSV content, detecting email addresses, validating format, and deduplicating.
 */
export function parseEmailList(rawContent: string): CsvParseResult {
  const lines = rawContent.split(/\r\n|\n|\r/);
  const seenEmails = new Set<string>();
  const recipients: ParsedRecipient[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  let rowCounter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect CSV delimiters: comma, semicolon, tab
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ''));

    // Check if line looks like a header (e.g., "email,name" or "Recipient")
    if (
      rowCounter === 0 &&
      (parts[0].toLowerCase() === 'email' ||
        parts[0].toLowerCase() === 'recipient' ||
        parts[0].toLowerCase() === 'e-mail')
    ) {
      rowCounter++;
      continue;
    }

    // Try finding the column containing the '@' symbol
    let emailFound = '';
    let nameFound = '';

    for (const part of parts) {
      if (part.includes('@')) {
        emailFound = part.trim().toLowerCase();
      } else if (!nameFound && part.length > 0 && isNaN(Number(part))) {
        nameFound = part.trim();
      }
    }

    // Fallback: If no delimiter match, check if line is a bare email or extracted regex match
    if (!emailFound) {
      const regexMatch = line.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (regexMatch) {
        emailFound = regexMatch[0].trim().toLowerCase();
      }
    }

    rowCounter++;

    if (!emailFound) {
      invalidCount++;
      recipients.push({
        id: `row-${rowCounter}`,
        email: line.substring(0, 40) || 'Unknown format',
        valid: false,
        error: 'No valid email address found in row',
      });
      continue;
    }

    // Validate format
    if (!EMAIL_REGEX.test(emailFound)) {
      invalidCount++;
      recipients.push({
        id: `row-${rowCounter}`,
        email: emailFound,
        name: nameFound || undefined,
        valid: false,
        error: 'Invalid email address syntax',
      });
      continue;
    }

    // Check duplicate
    if (seenEmails.has(emailFound)) {
      duplicateCount++;
      recipients.push({
        id: `row-${rowCounter}`,
        email: emailFound,
        name: nameFound || undefined,
        valid: false,
        error: 'Duplicate address (already imported)',
      });
      continue;
    }

    // Valid lead
    seenEmails.add(emailFound);
    recipients.push({
      id: `row-${rowCounter}`,
      email: emailFound,
      name: nameFound || undefined,
      valid: true,
    });
  }

  const validRecipients = recipients.filter((r) => r.valid);

  return {
    recipients,
    validRecipients,
    invalidCount,
    duplicateCount,
    totalParsed: recipients.length,
  };
}
