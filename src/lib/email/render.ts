export type EmailVariables = Record<string, string>;

/** Replaces {{variable}} placeholders. Unknown variables are left as-is. */
export function renderTemplate(text: string, variables: EmailVariables): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}
