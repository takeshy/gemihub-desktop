import type { SpeechSettings } from "./settings";
const OPENAI =
  `af ar hy az be bs bg ca zh hr cs da nl en et fi fr gl de el he hi hu is id it ja kn kk ko lv lt mk ms mr mi ne no fa pl pt ro ru sr sk sl es sw sv tl ta th tr uk ur vi cy`
    .split(/\s+/);
const WHISPER =
  `en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su yue`
    .split(/\s+/);
const GOOGLE =
  `af-ZA am-ET ar-EG hy-AM as-IN az-AZ be-BY bn-BD bn-IN bs-BA bg-BG rup-BG my-MM yue-Hant-HK ca-ES ceb km-KH hr-HR cs-CZ da-DK nl-NL en-GB en-IN en-US et-EE fa-IR fil-PH fi-FI fr-FR gl-ES ka-GE de-DE el-GR gu-IN ha-NG he-IL hi-IN hu-HU is-IS id-ID it-IT ja-JP jv-ID kea-CV kn-IN kk-KZ ko-KR ky-KG lv-LV ln-CD lt-LT mk-MK ms-MY ml-IN mt-MT cmn-Hans-CN mr-IN mn-MN ne-NP nb-NO or-IN pl-PL pt-BR pt-PT pa-IN pa-Guru-IN ro-RO ru-RU sr-RS sd-Arab-IN sk-SK sl-SI es-419 es-US sw-KE sv-SE tg-TJ te-IN th-TH tr-TR uk-UA uz-UZ vi-VN`
    .split(/\s+/);
const MAI =
  `af ar as az bg bn bs ca cs da de el en es et fa fi fil fr gl gu he hi hu hy id is it ja kk kn ko lt lv mk ml mr ms nb ne nl or pa pl pt ro ru sk sl sv sw ta te th tr uk ur vi yue zh`
    .split(/\s+/);
const MAI_15_EXCLUDED = new Set(
  `af az bs fa fil gl he hy is kk lv mk ms ne sw ur yue`.split(" "),
);
export function speechLanguageCodes(
  provider: SpeechSettings["provider"],
  endpoint: SpeechSettings["endpointType"],
  model = "",
): string[] {
  if (provider === "browser") {
    return [...new Set([...GOOGLE, "es-ES", "zh-CN", "zh-TW", "ta-IN"])];
  }
  if (endpoint === "gemini-transcribe" || endpoint === "vertex-transcribe") {
    return GOOGLE;
  }
  if (endpoint === "azure-mai-transcribe") {
    return MAI.filter((code) =>
      model.trim().toLowerCase() !== "mai-transcribe-1.5" ||
      !MAI_15_EXCLUDED.has(code)
    );
  }
  return endpoint === "openai" ? OPENAI : WHISPER;
}
export function speechLanguageLabel(code: string, locale: string): string {
  try {
    const displayCode = code === "jw" ? "jv" : code;
    const labelCode = displayCode === "ja-JP" ? "ja" : displayCode;
    const localized = new Intl.DisplayNames([locale], { type: "language" }).of(
      labelCode,
    );
    return `${localized} (${code})`;
  } catch {
    return code;
  }
}
