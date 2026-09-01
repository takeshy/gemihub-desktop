import type { SlashCommand } from "./settings";

export function resolveSlashCommand(
  text: string,
  commands: SlashCommand[],
  activeContent = "",
): string {
  const match = text.match(/^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return text;
  const command = commands.find((item) =>
    item.name.toLowerCase() === match[1].toLowerCase()
  );
  if (!command) return text;
  const argument = match[2]?.trim() ?? "";
  const hasVariable = command.promptTemplate.includes("{input}");
  const resolved = command.promptTemplate.replaceAll("{content}", activeContent)
    .replaceAll("{input}", argument);
  return !hasVariable && argument ? `${resolved}\n\n${argument}` : resolved;
}
