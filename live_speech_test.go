package main

import (
	"encoding/json"
	"testing"
)

func TestLiveSpeechSetup(t *testing.T) {
	openAI, _ := json.Marshal(liveSpeechSetup(LiveSpeechSettings{EndpointType: "openai", Language: "ja"}))
	var value map[string]any
	if json.Unmarshal(openAI, &value) != nil || value["type"] != "session.update" {
		t.Fatalf("OpenAI setup = %s", openAI)
	}
	input := value["session"].(map[string]any)["audio"].(map[string]any)["input"].(map[string]any)
	if input["turn_detection"] != nil {
		t.Fatalf("turn detection must be disabled: %s", openAI)
	}
	vertex, _ := json.Marshal(liveSpeechSetup(LiveSpeechSettings{EndpointType: "vertex-transcribe", VertexProjectID: "project-1", Language: "ja-JP"}))
	if !stringsContains(string(vertex), "projects/project-1/locations/global") {
		t.Fatalf("Vertex setup = %s", vertex)
	}
}

func TestNormalizeLiveSpeechMessage(t *testing.T) {
	events := normalizeLiveSpeechMessage("s", "openai", []byte(`{"type":"conversation.item.input_audio_transcription.delta","item_id":"i","delta":"hello"}`))
	if len(events) != 1 || events[0].Kind != "delta" || events[0].Text != "hello" {
		t.Fatalf("events = %#v", events)
	}
	events = normalizeLiveSpeechMessage("s", "gemini-transcribe", []byte(`{"serverContent":{"interimInputTranscription":{"text":"途中"},"inputTranscription":{"text":"確定"}}}`))
	if len(events) != 2 || events[0].Kind != "interim" || events[1].Kind != "final" {
		t.Fatalf("events = %#v", events)
	}
}

func stringsContains(value, part string) bool {
	for i := 0; i+len(part) <= len(value); i++ {
		if value[i:i+len(part)] == part {
			return true
		}
	}
	return false
}
