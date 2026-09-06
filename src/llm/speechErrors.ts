import { t, type TranslationStrings } from "../i18n/translations";

type SpeechErrorKey = Extract<
  keyof TranslationStrings,
  `speech.error.${string}`
>;
type Translate = (key: keyof TranslationStrings) => string;

export class SpeechError extends Error {
  constructor(readonly key: SpeechErrorKey, readonly prefix = "") {
    // Preserve the existing internal message; render in the current UI language.
    super(prefix + t("ja", key));
    this.name = "SpeechError";
  }

  localizedMessage(translate: Translate): string {
    return this.prefix + translate(this.key);
  }
}

export function speechErrorMessage(
  error: unknown,
  translate: Translate,
): string {
  return error instanceof SpeechError
    ? error.localizedMessage(translate)
    : error instanceof Error
    ? error.message
    : String(error);
}
