package main

import (
	"bytes"
	"os"
	"regexp"
	"strings"
	"sync"
	"unicode"
)

// MCP commands are executable + arguments, never shell programs. Preserve
// backslashes in Windows paths and allow doubled quotes inside quoted values.
type mcpCommandToken struct {
	value string
	quoted bool
}

func tokenizeMCPCommand(line string) []mcpCommandToken {
	var tokens []mcpCommandToken
	var value strings.Builder
	var quote rune
	quoted, started := false, false
	chars := []rune(line)
	for i := 0; i < len(chars); i++ {
		ch := chars[i]
		if quote != 0 {
			if ch == quote && i+1 < len(chars) && chars[i+1] == quote {
				value.WriteRune(ch)
				i++
			} else if ch == quote {
				quote = 0
			} else {
				value.WriteRune(ch)
			}
			continue
		}
		if ch == '"' || ch == '\'' {
			quote, quoted, started = ch, true, true
		} else if unicode.IsSpace(ch) {
			if started {
				tokens = append(tokens, mcpCommandToken{value.String(), quoted})
				value.Reset()
				quoted, started = false, false
			}
		} else {
			value.WriteRune(ch)
			started = true
		}
	}
	if started {
		tokens = append(tokens, mcpCommandToken{value.String(), quoted})
	}
	return tokens
}

var mcpBinaryExtension = regexp.MustCompile(`(?i)\.(exe|cmd|bat|com)$`)
var mcpPathPrefix = regexp.MustCompile(`^([a-zA-Z]:[\\/]|[\\/]|\.{1,2}[\\/]|~[\\/])`)

func normalizeMCPCommand(command string, args []string) (string, []string) {
	tokens := tokenizeMCPCommand(strings.TrimSpace(command))
	if len(tokens) == 0 {
		return "", args
	}
	count := 1
	executable := tokens[0].value
	if !tokens[0].quoted && mcpPathPrefix.MatchString(executable) && !mcpBinaryExtension.MatchString(executable) {
		joined := executable
		for i := 1; i < len(tokens); i++ {
			if tokens[i].quoted || strings.HasPrefix(tokens[i].value, "-") {
				break
			}
			joined += " " + tokens[i].value
			info, err := os.Stat(joined)
			if mcpBinaryExtension.MatchString(joined) || (err == nil && !info.IsDir()) {
				executable, count = joined, i+1
				break
			}
		}
	}
	result := make([]string, 0, len(tokens)-count+len(args))
	for _, token := range tokens[count:] {
		result = append(result, token.value)
	}
	return executable, append(result, args...)
}

// stderr is copied by os/exec concurrently with request errors and timeouts.
type mcpStderrBuffer struct {
	mu sync.Mutex
	buffer bytes.Buffer
}

func (b *mcpStderrBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buffer.Write(p)
}

func (b *mcpStderrBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buffer.String()
}
