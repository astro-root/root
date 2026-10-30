import { EMAIL_RE, clean } from './validate';

export const LIMITS = { name: 80, email: 254, subject: 120, messageMin: 10, message: 4000 };

export interface ContactInput { name: string; email: string; subject: string; message: string; consent: boolean }

export function validateContact(raw: Record<string, unknown>): { ok: true; value: ContactInput } | { ok: false; errors: Record<string, string> } {
  const name = clean(raw.name, LIMITS.name + 1);
  const email = clean(raw.email, LIMITS.email + 1).toLowerCase();
  const subject = clean(raw.subject, LIMITS.subject + 1).replace(/\n+/g, ' ');
  const message = clean(raw.message, LIMITS.message + 1);
  const consent = raw.consent === true || raw.consent === 'on' || raw.consent === 'true' || raw.consent === '1';
  const errors: Record<string, string> = {};

  if (!name) errors.name = 'お名前を入力してください。';
  else if (name.length > LIMITS.name) errors.name = `お名前は${LIMITS.name}文字以内で入力してください。`;

  if (!email) errors.email = 'メールアドレスを入力してください。';
  else if (email.length > LIMITS.email || !EMAIL_RE.test(email)) errors.email = 'メールアドレスの形式が正しくありません。';

  if (!subject) errors.subject = '件名を入力してください。';
  else if (subject.length > LIMITS.subject) errors.subject = `件名は${LIMITS.subject}文字以内で入力してください。`;

  if (!message) errors.message = 'お問い合わせ内容を入力してください。';
  else if (message.length < LIMITS.messageMin) errors.message = `お問い合わせ内容は${LIMITS.messageMin}文字以上で入力してください。`;
  else if (message.length > LIMITS.message) errors.message = `お問い合わせ内容は${LIMITS.message}文字以内で入力してください。`;

  if (!consent) errors.consent = 'プライバシーポリシーへの同意が必要です。';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, email, subject, message, consent } };
}
