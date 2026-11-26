import { isAxiosError } from 'axios';

const validationMessages: Record<string, string> = {
  required: 'Fill in this field.',
  blank: 'Fill in this field.',
  null: 'Choose a value.',
  invalid: 'Check the format of this field.',
  invalid_choice: 'Choose one of the available options.',
  does_not_exist: 'Choose an available item.',
  incorrect_type: 'Check the format of this field.',
  unique: 'This value is already in use.',
  max_length: 'Enter a shorter value.',
  min_length: 'Enter a longer value.',
  max_value: 'Enter a smaller number.',
  min_value: 'Enter a larger number.',
  invalid_email: 'Enter a valid email address.',
};

const workflowMessages: Record<string, string> = {
  source_unavailable: 'Choose an enabled log source from your organization.',
  alert_claimed: 'Another analyst already claimed this alert. Refresh the queue to see who has it.',
  alert_claim_unavailable: 'This alert can no longer be claimed. Refresh the queue to check its status.',
  alert_dismiss_unavailable: 'This alert can no longer be dismissed. Refresh the queue to check its status.',
  alert_triage_unavailable: 'This alert is no longer awaiting review. Refresh the queue to check its status.',
  alert_escalation_unavailable: 'This alert cannot be escalated from its current status. Check the alert for a linked incident.',
};

export function requestFields<K extends string>(error: unknown, fields: readonly K[]): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  if (!isAxiosError(error) || error.response?.status !== 400) return result;
  const data = error.response.data;
  for (const field of fields) {
    if (!data?.errors || !Object.prototype.hasOwnProperty.call(data?.errors, field)) continue;
    const code = data?.field_codes?.[field];
    const first = Array.isArray(code) ? code[0] : code;
    result[field] = typeof first === 'string' && Object.prototype.hasOwnProperty.call(validationMessages, first)
      ? validationMessages[first]
      : 'Check this field and try again.';
  }
  return result;
}

export function requestError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === 'Support workspaces are read-only.') return error.message;
  if (error instanceof SyntaxError) return 'Enter valid JSON for the match conditions.';
  if (!isAxiosError(error)) return fallback;
  if (!error.response) {
    return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
      ? 'The request took too long. Please try again.'
      : 'Could not connect to OmniEdge. Check your connection and try again.';
  }
  const { status, data } = error.response;
  const code = data?.code;
  if ((status === 400 || status === 409) && typeof code === 'string' &&
      Object.prototype.hasOwnProperty.call(workflowMessages, code)) return workflowMessages[code];
  switch (status) {
    case 400: return fallback.replace(/\.?$/, '.') + ' Check your entries and try again.';
    case 401: return 'Please sign in again to continue.';
    case 403: return 'You do not have permission to do this. Contact your administrator if you need access.';
    case 404: return 'This item is unavailable. Return to the list and refresh it.';
    case 409: return 'This item has changed. Refresh the page and try again.';
    case 413: return 'This upload is too large. Choose a smaller file and try again.';
    case 429: return 'Too many requests. Wait a moment and try again.';
    default: return status >= 500 ? 'OmniEdge could not complete your request. Try again in a moment.' : fallback;
  }
}
