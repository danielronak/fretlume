import { en, type MessageKey } from './en';

export type { MessageKey };

type Params = Record<string, string | number>;

/** Look up a message and fill `{name}` placeholders. English only for now; the shape allows more locales. */
export function t(key: MessageKey, params?: Params): string {
  const template: string = en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
