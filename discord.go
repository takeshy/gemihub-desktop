package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	discordAPIBase    = "https://discord.com/api/v10"
	discordGatewayURL = "wss://gateway.discord.gg/?v=10&encoding=json"
	discordUserAgent  = "DiscordBot (GemiHub-Desktop, 1.0)"
)

var discordSnowflakePattern = regexp.MustCompile(`^\d{17,20}$`)

type DiscordSettings struct {
	Enabled           bool   `json:"enabled"`
	BotToken          string `json:"botToken"`
	AllowedChannelIDs string `json:"allowedChannelIds"`
	AllowedUserIDs    string `json:"allowedUserIds"`
	SystemPrompt      string `json:"systemPrompt"`
	MaxResponseLength int    `json:"maxResponseLength"`
	RespondToDMs      bool   `json:"respondToDMs"`
	RequireMention    bool   `json:"requireMention"`
}

type DiscordBotRequest struct {
	Settings   DiscordSettings `json:"settings"`
	Chat       ChatRequest     `json:"chat"`
	RAGName    string          `json:"ragName"`
	RAGSetting RAGSetting      `json:"ragSetting"`
	Skills     []DiscordSkill  `json:"skills"`
}

type DiscordSkillWorkflow struct {
	ID             string   `json:"id"`
	Path           string   `json:"path"`
	Description    string   `json:"description"`
	InputVariables []string `json:"inputVariables,omitempty"`
}

type DiscordSkill struct {
	Name         string                 `json:"name"`
	FolderPath   string                 `json:"folderPath"`
	SystemPrompt string                 `json:"systemPrompt"`
	Workflows    []DiscordSkillWorkflow `json:"workflows"`
}

type DiscordStatus struct {
	Running   bool   `json:"running"`
	Connected bool   `json:"connected"`
	Username  string `json:"username,omitempty"`
	Error     string `json:"error,omitempty"`
	LastEvent string `json:"lastEvent,omitempty"`
}

type discordGatewayPayload struct {
	Op int             `json:"op"`
	D  json.RawMessage `json:"d"`
	S  *int            `json:"s,omitempty"`
	T  string          `json:"t,omitempty"`
}

type discordMessage struct {
	ID        string `json:"id"`
	ChannelID string `json:"channel_id"`
	GuildID   string `json:"guild_id,omitempty"`
	Author    struct {
		ID       string `json:"id"`
		Username string `json:"username"`
		Bot      bool   `json:"bot,omitempty"`
	} `json:"author"`
	Content  string `json:"content"`
	Mentions []struct {
		ID string `json:"id"`
	} `json:"mentions"`
}

type discordConversation struct {
	Messages     []ChatMessage
	LastActive   time.Time
	RAGEnabled   bool
	CLISessionID string
	Model        string
	ActiveSkills []string
}

type discordBot struct {
	app      *App
	request  DiscordBotRequest
	done     chan struct{}
	ready    chan struct{}
	readyOne sync.Once

	mu                  sync.RWMutex
	conn                *websocket.Conn
	connected           bool
	username            string
	botUserID           string
	lastError           string
	lastEvent           string
	sequence            *int
	connectedGeneration uint64

	writeMu       sync.Mutex
	conversationM sync.Mutex
	conversations map[string]*discordConversation
	channelLocks  map[string]*sync.Mutex
}

func (a *App) VerifyDiscordToken(token string) (*DiscordStatus, error) {
	username, _, err := verifyDiscordToken(strings.TrimSpace(token))
	if err != nil {
		return &DiscordStatus{Error: err.Error()}, nil
	}
	return &DiscordStatus{Username: username}, nil
}

func (a *App) StartDiscordBot(request DiscordBotRequest) (*DiscordStatus, error) {
	request.Settings.BotToken = strings.TrimSpace(request.Settings.BotToken)
	if request.Settings.BotToken == "" {
		return nil, fmt.Errorf("Discord bot token is required")
	}
	username, userID, err := verifyDiscordToken(request.Settings.BotToken)
	if err != nil {
		return nil, err
	}
	a.StopDiscordBot()
	bot := &discordBot{app: a, request: request, done: make(chan struct{}), ready: make(chan struct{}), username: username, botUserID: userID, conversations: map[string]*discordConversation{}, channelLocks: map[string]*sync.Mutex{}}
	a.discordMu.Lock()
	a.discord = bot
	a.discordMu.Unlock()
	go bot.run()
	select {
	case <-bot.ready:
	case <-time.After(10 * time.Second):
	}
	return bot.status(), nil
}

func (a *App) StopDiscordBot() bool {
	a.discordMu.Lock()
	bot := a.discord
	a.discord = nil
	a.discordMu.Unlock()
	if bot == nil {
		return false
	}
	select {
	case <-bot.done:
	default:
		close(bot.done)
	}
	bot.mu.Lock()
	if bot.conn != nil {
		_ = bot.conn.Close()
		bot.conn = nil
	}
	bot.connected = false
	bot.mu.Unlock()
	return true
}

func (a *App) GetDiscordStatus() *DiscordStatus {
	a.discordMu.Lock()
	bot := a.discord
	a.discordMu.Unlock()
	if bot == nil {
		return &DiscordStatus{}
	}
	return bot.status()
}

func (bot *discordBot) status() *DiscordStatus {
	bot.mu.RLock()
	defer bot.mu.RUnlock()
	return &DiscordStatus{Running: true, Connected: bot.connected, Username: bot.username, Error: bot.lastError, LastEvent: bot.lastEvent}
}

func (bot *discordBot) setActivity(event string, err error) {
	bot.mu.Lock()
	bot.lastEvent = event
	if err != nil {
		bot.lastError = err.Error()
	} else {
		bot.lastError = ""
	}
	bot.mu.Unlock()
}

func verifyDiscordToken(token string) (string, string, error) {
	if token == "" {
		return "", "", fmt.Errorf("Discord bot token is required")
	}
	request, _ := http.NewRequest(http.MethodGet, discordAPIBase+"/users/@me", nil)
	request.Header.Set("Authorization", "Bot "+token)
	request.Header.Set("User-Agent", discordUserAgent)
	response, err := (&http.Client{Timeout: 20 * time.Second}).Do(request)
	if err != nil {
		return "", "", err
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", "", fmt.Errorf("Discord token verification failed (%d): %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	var user struct {
		ID       string `json:"id"`
		Username string `json:"username"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		return "", "", err
	}
	return user.Username, user.ID, nil
}

func (bot *discordBot) run() {
	attempt := 0
	for {
		select {
		case <-bot.done:
			return
		default:
		}
		bot.mu.RLock()
		generation := bot.connectedGeneration
		bot.mu.RUnlock()
		if err := bot.connect(); err != nil {
			bot.mu.Lock()
			bot.lastError = err.Error()
			bot.connected = false
			bot.mu.Unlock()
		}
		bot.mu.RLock()
		connectedSuccessfully := bot.connectedGeneration > generation
		bot.mu.RUnlock()
		if connectedSuccessfully {
			attempt = 0
		} else {
			attempt++
		}
		select {
		case <-bot.done:
			return
		case <-time.After(time.Duration(min(30, 1<<min(attempt, 5))) * time.Second):
		}
	}
}

func (bot *discordBot) connect() error {
	headers := http.Header{"User-Agent": []string{discordUserAgent}}
	connection, _, err := websocket.DefaultDialer.Dial(discordGatewayURL, headers)
	if err != nil {
		return err
	}
	bot.mu.Lock()
	bot.conn = connection
	bot.lastError = ""
	bot.mu.Unlock()
	defer func() {
		_ = connection.Close()
		bot.mu.Lock()
		if bot.conn == connection {
			bot.conn = nil
			bot.connected = false
		}
		bot.mu.Unlock()
	}()

	var heartbeatStop chan struct{}
	defer func() {
		if heartbeatStop != nil {
			close(heartbeatStop)
		}
	}()
	for {
		_, data, err := connection.ReadMessage()
		if err != nil {
			if closeError, ok := err.(*websocket.CloseError); ok && closeError.Code == 4014 {
				return fmt.Errorf("Discord rejected Message Content Intent. Enable it in Developer Portal, or turn on Require mention in servers")
			}
			return err
		}
		var payload discordGatewayPayload
		if err := json.Unmarshal(data, &payload); err != nil {
			continue
		}
		if payload.S != nil {
			bot.mu.Lock()
			bot.sequence = payload.S
			bot.mu.Unlock()
		}
		switch payload.Op {
		case 10:
			var hello struct {
				HeartbeatInterval int `json:"heartbeat_interval"`
			}
			_ = json.Unmarshal(payload.D, &hello)
			heartbeatStop = make(chan struct{})
			go bot.heartbeat(time.Duration(hello.HeartbeatInterval)*time.Millisecond, heartbeatStop)
			if err := bot.writeGateway(map[string]any{"op": 2, "d": map[string]any{"token": bot.request.Settings.BotToken, "intents": discordGatewayIntents(bot.request.Settings), "properties": map[string]string{"os": "windows", "browser": appID, "device": appID}}}); err != nil {
				return err
			}
		case 1:
			bot.mu.RLock()
			sequence := bot.sequence
			bot.mu.RUnlock()
			_ = bot.writeGateway(map[string]any{"op": 1, "d": sequence})
		case 7:
			return fmt.Errorf("Discord requested reconnect")
		case 9:
			return fmt.Errorf("Discord session invalid")
		case 0:
			if payload.T == "READY" {
				var ready struct {
					User struct {
						ID       string `json:"id"`
						Username string `json:"username"`
					} `json:"user"`
				}
				_ = json.Unmarshal(payload.D, &ready)
				bot.mu.Lock()
				bot.connected = true
				bot.botUserID = ready.User.ID
				bot.username = ready.User.Username
				bot.lastError = ""
				bot.lastEvent = "Gateway connected; waiting for a mention or direct message."
				bot.connectedGeneration++
				bot.mu.Unlock()
				bot.readyOne.Do(func() { close(bot.ready) })
			} else if payload.T == "MESSAGE_CREATE" {
				var message discordMessage
				if json.Unmarshal(payload.D, &message) == nil {
					go bot.handleMessage(message)
				}
			}
		}
	}
}

func discordGatewayIntents(settings DiscordSettings) int {
	intents := 1 | 1<<9 | 1<<12 // Guilds, guild messages, direct messages.
	if !settings.RequireMention {
		intents |= 1 << 15 // Message content is privileged; mentions and DMs do not need it.
	}
	return intents
}

func (bot *discordBot) heartbeat(interval time.Duration, stop <-chan struct{}) {
	if interval <= 0 {
		interval = 45 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-bot.done:
			return
		case <-stop:
			return
		case <-ticker.C:
			bot.mu.RLock()
			sequence := bot.sequence
			bot.mu.RUnlock()
			_ = bot.writeGateway(map[string]any{"op": 1, "d": sequence})
		}
	}
}

func (bot *discordBot) writeGateway(payload any) error {
	bot.writeMu.Lock()
	defer bot.writeMu.Unlock()
	bot.mu.RLock()
	connection := bot.conn
	bot.mu.RUnlock()
	if connection == nil {
		return fmt.Errorf("Discord Gateway is disconnected")
	}
	return connection.WriteJSON(payload)
}

func commaSet(value string) map[string]bool {
	result := map[string]bool{}
	for _, item := range strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == '\n' || r == '\r' || r == ' ' || r == '\t' }) {
		if item = strings.TrimSpace(item); item != "" {
			result[item] = true
		}
	}
	return result
}

func (bot *discordBot) handleMessage(message discordMessage) {
	if message.Author.Bot || !discordSnowflakePattern.MatchString(message.ChannelID) {
		return
	}
	isDM := message.GuildID == ""
	if isDM && !bot.request.Settings.RespondToDMs {
		return
	}
	if !isDM && bot.request.Settings.RequireMention {
		mentioned := false
		for _, mention := range message.Mentions {
			mentioned = mentioned || mention.ID == bot.botUserID
		}
		if !mentioned {
			return
		}
	}
	channels := commaSet(bot.request.Settings.AllowedChannelIDs)
	if len(channels) > 0 && !channels[message.ChannelID] {
		bot.setActivity("Ignored a message because channel "+message.ChannelID+" is not in Allowed channel IDs.", nil)
		return
	}
	users := commaSet(bot.request.Settings.AllowedUserIDs)
	if len(users) > 0 && !users[message.Author.ID] {
		bot.setActivity("Ignored a message because user "+message.Author.ID+" is not in Allowed user IDs.", nil)
		return
	}
	content := strings.TrimSpace(message.Content)
	if bot.botUserID != "" {
		content = regexp.MustCompile(`<@!?`+regexp.QuoteMeta(bot.botUserID)+`>`).ReplaceAllString(content, "")
		content = strings.TrimSpace(content)
	}
	if content == "" {
		bot.setActivity("Received a message, but its content was empty.", nil)
		return
	}
	bot.setActivity("Received a message from "+message.Author.Username+" in channel "+message.ChannelID+"; generating a response.", nil)
	channelLock := bot.getChannelLock(message.ChannelID)
	channelLock.Lock()
	defer channelLock.Unlock()
	conversation := bot.getConversation(message.ChannelID)
	if reply, handled := bot.command(conversation, content); handled {
		if err := bot.sendResponse(message.ChannelID, reply, message.ID); err != nil {
			bot.setActivity("Received a command, but Discord rejected the reply.", err)
		} else {
			bot.setActivity("Replied to a Discord command.", nil)
		}
		return
	}
	_ = bot.sendTyping(message.ChannelID)
	conversation.Messages = append(conversation.Messages, ChatMessage{Role: "user", Content: content})
	if len(conversation.Messages) > 20 {
		conversation.Messages = conversation.Messages[len(conversation.Messages)-20:]
	}
	response, err := bot.generate(conversation)
	if err != nil {
		if sendErr := bot.sendResponse(message.ChannelID, "Sorry, an error occurred: "+err.Error(), message.ID); sendErr != nil {
			bot.setActivity("AI generation and Discord error reply both failed.", fmt.Errorf("AI: %v; Discord: %v", err, sendErr))
		} else {
			bot.setActivity("AI generation failed; an error reply was sent to Discord.", err)
		}
		return
	}
	conversation.Messages = append(conversation.Messages, ChatMessage{Role: "assistant", Content: response})
	conversation.LastActive = time.Now()
	model := conversation.Model
	if model == "" {
		model = bot.request.Chat.Model
	}
	if bot.request.Chat.Provider == "cli" && model == "" {
		model = bot.request.Chat.CLIType + " CLI"
	}
	if err := bot.sendResponse(message.ChannelID, response+"\n-# "+model, message.ID); err != nil {
		bot.setActivity("Generated a response, but Discord rejected it. Check View Channel, Send Messages, and Read Message History permissions.", err)
		return
	}
	bot.mu.Lock()
	bot.lastError = ""
	bot.lastEvent = "Response sent to channel " + message.ChannelID + "."
	bot.mu.Unlock()
}

func (bot *discordBot) getChannelLock(channelID string) *sync.Mutex {
	bot.conversationM.Lock()
	defer bot.conversationM.Unlock()
	lock := bot.channelLocks[channelID]
	if lock == nil {
		lock = &sync.Mutex{}
		bot.channelLocks[channelID] = lock
	}
	return lock
}

func (bot *discordBot) getConversation(channelID string) *discordConversation {
	bot.conversationM.Lock()
	defer bot.conversationM.Unlock()
	now := time.Now()
	conversation := bot.conversations[channelID]
	if conversation == nil || now.Sub(conversation.LastActive) > 30*time.Minute {
		conversation = &discordConversation{LastActive: now, RAGEnabled: bot.request.RAGName != ""}
		bot.conversations[channelID] = conversation
	}
	return conversation
}

func (bot *discordBot) command(conversation *discordConversation, content string) (string, bool) {
	rawCommand := strings.TrimSpace(content)
	command := strings.ToLower(rawCommand)
	switch command {
	case "!help":
		return "**GemiHub Desktop Discord commands:**\n- `!reset` — Clear conversation history\n- `!rag on` — Enable configured RAG\n- `!rag off` — Disable RAG\n- `!skill` — List workspace skills\n- `!skill <name>` — Toggle a skill\n- `!skill off` — Deactivate all skills\n- `!model` — Show the configured model\n- `!help` — Show this help", true
	case "!reset":
		conversation.Messages = nil
		conversation.CLISessionID = ""
		return "Conversation history cleared.", true
	case "!rag on":
		if bot.request.RAGName == "" {
			return "No RAG setting is configured for Discord.", true
		}
		conversation.RAGEnabled = true
		return "RAG enabled: " + bot.request.RAGName, true
	case "!rag off":
		conversation.RAGEnabled = false
		return "RAG disabled.", true
	case "!model":
		return "Model: " + bot.request.Chat.Model, true
	}
	if command == "!skill" {
		if len(bot.request.Skills) == 0 {
			return "No workspace skills configured.", true
		}
		lines := []string{"**Available skills:**"}
		for _, skill := range bot.request.Skills {
			marker := ""
			if containsString(conversation.ActiveSkills, skill.FolderPath) {
				marker = " ✅"
			}
			lines = append(lines, fmt.Sprintf("- `%s`%s", skill.Name, marker))
		}
		lines = append(lines, "", "Usage: `!skill <name>` to toggle, `!skill off` to deactivate all")
		return strings.Join(lines, "\n"), true
	}
	if strings.HasPrefix(command, "!skill ") {
		argument := strings.TrimSpace(rawCommand[len("!skill "):])
		if strings.EqualFold(argument, "off") {
			conversation.ActiveSkills = nil
			return "All skills deactivated.", true
		}
		for _, skill := range bot.request.Skills {
			if !strings.EqualFold(argument, skill.Name) {
				continue
			}
			if index := indexString(conversation.ActiveSkills, skill.FolderPath); index >= 0 {
				conversation.ActiveSkills = append(conversation.ActiveSkills[:index], conversation.ActiveSkills[index+1:]...)
				return fmt.Sprintf("Skill **%s** deactivated.", skill.Name), true
			}
			conversation.ActiveSkills = append(conversation.ActiveSkills, skill.FolderPath)
			return fmt.Sprintf("Skill **%s** activated.", skill.Name), true
		}
		return fmt.Sprintf("Skill `%s` not found. Use `!skill` to see available skills.", argument), true
	}
	return "", false
}

func containsString(values []string, target string) bool { return indexString(values, target) >= 0 }

func indexString(values []string, target string) int {
	for index, value := range values {
		if value == target {
			return index
		}
	}
	return -1
}

func (bot *discordBot) generate(conversation *discordConversation) (string, error) {
	request := bot.request.Chat
	request.Messages = append([]ChatMessage(nil), conversation.Messages...)
	request.CLISessionID = conversation.CLISessionID
	request.SystemPrompt = strings.TrimSpace(bot.request.Settings.SystemPrompt)
	if request.SystemPrompt == "" {
		request.SystemPrompt = bot.request.Chat.SystemPrompt
	}
	request.SystemPrompt += "\nYou are responding through Discord. Keep messages concise. File tool proposals are automatically applied because the user explicitly enabled the Discord bot. When the user asks what they did today or what happened on a date, use read_timeline before answering. When the user asks you to memo, save, remember, or record something, use append_timeline to save it to the system Timeline."
	activeWorkflows := false
	for _, folderPath := range conversation.ActiveSkills {
		for _, skill := range bot.request.Skills {
			if skill.FolderPath != folderPath {
				continue
			}
			request.SystemPrompt += skill.SystemPrompt
			if len(skill.Workflows) > 0 {
				activeWorkflows = true
			}
		}
	}
	if activeWorkflows && !customToolRegistered(request, "run_skill_workflow") {
		request.CustomTools = append(request.CustomTools, ChatToolDefinition{
			Name:        "run_skill_workflow",
			Description: "Run a workflow provided by an active workspace skill. Use its workflow ID and declared input variables. If it fails, do not retry automatically; report the error.",
			Parameters: map[string]any{"type": "object", "properties": map[string]any{
				"workflowId": map[string]any{"type": "string"},
				"variables":  map[string]any{"type": "string", "description": "JSON object containing workflow input variables"},
			}, "required": []string{"workflowId"}},
		})
	}
	if conversation.RAGEnabled && bot.request.RAGName != "" {
		last := conversation.Messages[len(conversation.Messages)-1].Content
		results, err := bot.app.SearchRAG(RAGSearchRequest{Name: bot.request.RAGName, Query: last, Setting: bot.request.RAGSetting})
		if err == nil && len(results) > 0 {
			var context strings.Builder
			context.WriteString("\nRelevant RAG context:\n")
			for _, result := range results {
				fmt.Fprintf(&context, "\n[Source: %s]\n%s\n", result.FilePath, result.Text)
			}
			request.SystemPrompt += context.String()
		}
	}
	emptyResponses := 0
	for iteration := 0; iteration < 7; iteration++ {
		result, err := bot.app.Chat(request)
		if err != nil {
			return "", err
		}
		if result.CLISessionID != "" {
			conversation.CLISessionID = result.CLISessionID
			request.CLISessionID = result.CLISessionID
		}
		if result.Model != "" {
			conversation.Model = result.Model
		}
		if result.PendingAction == nil {
			if content := strings.TrimSpace(result.Content); content != "" {
				return content, nil
			}
			emptyResponses++
			if emptyResponses >= 2 {
				return "", fmt.Errorf("%s returned an empty response twice", request.Provider)
			}
			request.Messages = append(request.Messages, ChatMessage{Role: "user", Content: "Your previous response was empty. Reply to the original request now with a non-empty plain-text answer suitable for Discord."})
			continue
		}
		if err := bot.app.ApplyPendingFileAction(*result.PendingAction); err != nil {
			return "", err
		}
		if strings.TrimSpace(result.Content) != "" {
			request.Messages = append(request.Messages, ChatMessage{Role: "assistant", Content: result.Content})
		}
		request.Messages = append(request.Messages, ChatMessage{Role: "user", Content: fmt.Sprintf("The proposed %s operation for %s was applied successfully. Continue and provide the final response.", result.PendingAction.Kind, result.PendingAction.Path)})
	}
	return "", fmt.Errorf("Discord file action iteration limit exceeded")
}

func (bot *discordBot) discordRequest(ctx context.Context, method, endpoint string, payload any) (*http.Response, []byte, error) {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, nil, err
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, discordAPIBase+endpoint, body)
	if err != nil {
		return nil, nil, err
	}
	request.Header.Set("Authorization", "Bot "+bot.request.Settings.BotToken)
	request.Header.Set("User-Agent", discordUserAgent)
	request.Header.Set("Content-Type", "application/json")
	response, err := (&http.Client{Timeout: 30 * time.Second}).Do(request)
	if err != nil {
		return nil, nil, err
	}
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024))
	response.Body.Close()
	return response, responseBody, readErr
}

func (bot *discordBot) sendTyping(channelID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	response, body, err := bot.discordRequest(ctx, http.MethodPost, "/channels/"+channelID+"/typing", nil)
	if err != nil {
		return err
	}
	if response.StatusCode >= 300 {
		return fmt.Errorf("Discord typing error %d: %s", response.StatusCode, body)
	}
	return nil
}

func splitDiscordMessage(content string, maximum int) []string {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil
	}
	if maximum <= 0 || maximum > 2000 {
		maximum = 2000
	}
	runes := []rune(content)
	parts := []string{}
	for len(runes) > maximum {
		cut := maximum
		for index := maximum; index > maximum/2; index-- {
			if runes[index-1] == '\n' || runes[index-1] == ' ' {
				cut = index
				break
			}
		}
		if part := strings.TrimSpace(string(runes[:cut])); part != "" {
			parts = append(parts, part)
		}
		runes = []rune(strings.TrimSpace(string(runes[cut:])))
	}
	if len(runes) > 0 {
		if part := strings.TrimSpace(string(runes)); part != "" {
			parts = append(parts, part)
		}
	}
	return parts
}

func (bot *discordBot) sendResponse(channelID, content, replyTo string) error {
	parts := splitDiscordMessage(content, bot.request.Settings.MaxResponseLength)
	if len(parts) == 0 {
		return fmt.Errorf("refusing to send an empty Discord response")
	}
	for index, part := range parts {
		payload := map[string]any{"content": part}
		if index == 0 && replyTo != "" {
			payload["message_reference"] = map[string]string{"message_id": replyTo}
			payload["allowed_mentions"] = map[string]bool{"replied_user": false}
		}
		for attempt := 0; attempt < 2; attempt++ {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			response, body, err := bot.discordRequest(ctx, http.MethodPost, "/channels/"+channelID+"/messages", payload)
			cancel()
			if err != nil {
				return err
			}
			if response.StatusCode == http.StatusTooManyRequests {
				var rate struct {
					RetryAfter float64 `json:"retry_after"`
				}
				_ = json.Unmarshal(body, &rate)
				time.Sleep(time.Duration(max(1, rate.RetryAfter*1000)) * time.Millisecond)
				continue
			}
			if response.StatusCode < 200 || response.StatusCode >= 300 {
				return fmt.Errorf("Discord API error %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
			}
			break
		}
	}
	return nil
}

func sortedDiscordIDs(value string) []string {
	items := []string{}
	for item := range commaSet(value) {
		items = append(items, item)
	}
	sort.Strings(items)
	return items
}
