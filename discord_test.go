package main

import "testing"

func TestDiscordGatewayIntentsAvoidsPrivilegedMessageContentForMentions(t *testing.T) {
	const messageContent = 1 << 15
	if intents := discordGatewayIntents(DiscordSettings{RequireMention: true}); intents&messageContent != 0 {
		t.Fatalf("mention-only mode must not request Message Content Intent: %d", intents)
	}
	if intents := discordGatewayIntents(DiscordSettings{RequireMention: false}); intents&messageContent == 0 {
		t.Fatalf("non-mention mode must request Message Content Intent: %d", intents)
	}
}

func TestSplitDiscordMessageRejectsEmptyContent(t *testing.T) {
	if parts := splitDiscordMessage(" \n\t ", 1900); len(parts) != 0 {
		t.Fatalf("expected no message parts for empty content, got %#v", parts)
	}
	parts := splitDiscordMessage("  hello  ", 1900)
	if len(parts) != 1 || parts[0] != "hello" {
		t.Fatalf("expected trimmed non-empty content, got %#v", parts)
	}
}

func TestDiscordSkillCommandsToggleWorkspaceSkills(t *testing.T) {
	bot := &discordBot{request: DiscordBotRequest{Skills: []DiscordSkill{{Name: "Review", FolderPath: "skills/review"}}}}
	conversation := &discordConversation{}
	if reply, handled := bot.command(conversation, "!skill"); !handled || reply == "" {
		t.Fatalf("expected skill list, got handled=%v reply=%q", handled, reply)
	}
	if reply, handled := bot.command(conversation, "!skill review"); !handled || reply != "Skill **Review** activated." {
		t.Fatalf("expected activation, got handled=%v reply=%q", handled, reply)
	}
	if !containsString(conversation.ActiveSkills, "skills/review") {
		t.Fatal("expected review skill to be active")
	}
	if reply, _ := bot.command(conversation, "!skill Review"); reply != "Skill **Review** deactivated." {
		t.Fatalf("expected toggle deactivation, got %q", reply)
	}
	conversation.ActiveSkills = []string{"skills/review"}
	if reply, _ := bot.command(conversation, "!skill off"); reply != "All skills deactivated." || len(conversation.ActiveSkills) != 0 {
		t.Fatalf("expected all skills off, got %q %#v", reply, conversation.ActiveSkills)
	}
}
