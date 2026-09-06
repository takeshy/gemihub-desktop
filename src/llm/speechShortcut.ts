type ShortcutEvent = Pick<
  KeyboardEvent,
  "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing"
>;

export function speechShortcutFromEvent(event: ShortcutEvent): string {
  if (event.isComposing || !(event.ctrlKey || event.altKey || event.metaKey)) {
    return "";
  }
  const key = /^Key[A-Z]$/.test(event.code)
    ? event.code.slice(3)
    : /^Digit[0-9]$/.test(event.code)
    ? event.code.slice(5)
    : /^(F([1-9]|1[0-2])|Space)$/.test(event.code)
    ? event.code
    : "";
  if (!key) return "";
  return [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Meta",
    key,
  ].filter(Boolean).join("+");
}

export function validSpeechShortcut(value: unknown): string {
  if (typeof value !== "string") return "";
  return /^(?=.*(?:Ctrl|Alt|Meta)\+)(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:Meta\+)?(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space)$/
      .test(value)
    ? value
    : "";
}

export function speechShortcutLabel(value: string): string {
  return value.replace("Meta", "⌘");
}
