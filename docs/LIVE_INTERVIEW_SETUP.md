# Live interview setup

This implementation connects one ElevenLabs AI voice interviewer to the private storyteller experience. The four themes stay internal during conversation. Original recordings, stored transcript turns, written drafts and approval remain application responsibilities.

No provider agent is created or changed by the application. No API key is sent to the browser. Local tests use mocked provider responses and have not auditioned a live voice.

## Account setup status, October 2, 2026

The private API key was saved locally and verified against the newly connected account. That account initially had no agents and could not access the interviewer configured in the earlier connection. The approved interviewer configuration was recreated in the new account, then read back and compared with the tested prompt.

| Active resource | Identifier |
| --- | --- |
| Agent | `agent_7801m3zngzddfprr1fh46m6edp6m` |
| Agent branch | `agtbrch_6401m3znh0swfwmvkhvet2gj7fdn` |
| Theme client tool | `tool_7901m3znfm6tfqnr3ezbvandnhgj` |
| Voice | Sarah, `EXAVITQu4vr4xnSDxMaL` |
| Saved voice model | `eleven_v4_turbo` |

The saved setup was verified as private, with localhost and 127.0.0.1 allowed, Patient turn taking, a 20-second turn timeout, soft timeout fillers disabled, a 2700-second duration, the required client events, and prompt and first-message overrides enabled. The prompt matches the version that passed the earlier text simulation. Those simulation results belong to the previous account; they have not been rerun on this new agent.

The local `.env.local` contains the current agent ID and private key. It is ignored by Git and restricted to its owner's read/write access. Never put the key in chat or documentation. The separate Next.js development preview reloads environment changes.

A real request to the local app's authenticated conversation-session endpoint returned HTTP 200, configured true, WebRTC connection type and a 2700-second duration. A nonempty conversation token was also verified without displaying or storing it. No live audio conversation was started by that check.

Live voice quality, microphone and camera operation together, turn timing, theme switching, interruption recovery, and the complete app journey remain unverified against this account. Sarah still needs to be auditioned with the real interview questions. No LiveAvatar person has been configured.

### Synthetic conversation verification

The first simulation ended during the first theme because its simulated user offered final encouragement early. That scenario and result remain preserved. It also exposed excessive follow-up questions, so the interviewer prompt was tightened before the corrected scenario was run.

The corrected full-interview simulation passed all eight automated criteria in one run:

- Test: `test_6901m3zm00ajernsv0nv39zcerwv`
- Invocation: `suite_6101m3zm388cfqs9f6nqt57bme08`
- Tested agent version: `agtvrsn_4501m3zm0eh4ee8b5tmkqc3b4w5v`
- Test run: `trun_1001m3zm388gej6twfznarzndkhm`

Transcript inspection confirmed all four topics were covered, the client theme tool successfully returned the expected mock for q2, q3 and q4, and the agent asked only one follow-up per theme. It accepted a correction from Thursday to Friday, did not invent a Scripture quotation, did not claim to send or approve the gift, and stopped asking interview questions after the simulated storyteller said they were finished.

Manual review found remaining wording issues despite the automated pass: repeated praise, questions that assumed courage or enjoyment, and repeated Finish instructions when the simulated user repeated that they were finished. No explicit refusal of a Scripture quotation occurred, so that branch was not tested. All theme-tool responses were mocked. This was a text simulation, not a microphone, recording, WebRTC, turn-timing or voice-quality test.

## 1. Configure one dedicated private agent

In the ElevenLabs Agents dashboard, create or select an agent dedicated to Time Tapestry. Do not reuse an agent with messaging, payment, publishing, transfer, or external integration tools.

Use these settings:

| Setting                   | Value                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication            | Required. `platform_settings.auth.enable_auth: true`                                                                                                      |
| Allowed domains           | Only the app's deployed host and the localhost development origin being used                                                                              |
| Voice                     | One consistent voice, auditioned using the actual interview questions                                                                                     |
| Voice model               | Select **Eleven v4 Turbo** in the Agents dashboard when available in the account. Do not change the separate legacy TTS route to this model ID.           |
| Language                  | English for this pilot                                                                                                                                    |
| Turn eagerness            | **Patient**, API `conversation_config.turn.turn_eagerness: "patient"`                                                                                     |
| Take turn after silence   | Start at **20 seconds**, `conversation_config.turn.turn_timeout: 20`                                                                                      |
| Soft timeout filler       | Disabled initially, `conversation_config.turn.soft_timeout_config.timeout_seconds: -1`                                                                    |
| Max conversation duration | **2700 seconds**, `conversation_config.conversation.max_duration_seconds: 2700`                                                                           |
| Client events             | `user_transcript`, `agent_response`, `agent_response_correction`, `interruption`, `client_tool_call`, `conversation_initiation_metadata`, `audio`, `ping` |
| Security overrides        | Allow **System prompt** and **First message** only for this implementation. Voice, LLM, tools and knowledge-base overrides are not requested.             |
| Built-in tools            | **Skip Turn** only                                                                                                                                        |
| Client tools              | `set_interview_theme`, configured below                                                                                                                   |

Patient and silence timeout are different controls. Enabling interruption lets the person stop the interviewer while it speaks. Neither setting guarantees that every thinking pause will be recognized. Test the pause control and long reflective answers before the demo.

The public [v4 Turbo page](https://elevenlabs.io/agents/v4-turbo) confirms ElevenAgents availability. The saved account setup above uses `eleven_v4_turbo`. The installed server SDK 2.70.0 has older voice-model enum types, so this application deliberately does not set or cast that model through the SDK. Its agent-read parser accepts newer enum values. Token creation uses the agent's saved voice configuration. The local token endpoint check does not establish live audio quality.

The endpoint reads the agent configuration before issuing a token. It refuses public agents, missing required transcript/tool events, non-Patient mode, unavailable prompt overrides, missing Skip Turn, unsupported tools or a duration over 45 minutes. A shorter duration is permitted and returned truthfully to the UI; configure 2700 seconds for the intended experience. Presence of environment variables alone is not a successful connection test.

## 2. Configure the theme tool

Add a **Client** tool:

```json
{
  "type": "client",
  "name": "set_interview_theme",
  "description": "Before asking a question that moves to another internal interview theme, update the active theme. Do not speak the theme ID. This only organizes answers and never saves, approves, sends or shares a gift.",
  "expects_response": true,
  "pre_tool_speech": "off",
  "parameters": {
    "type": "object",
    "properties": {
      "themeId": {
        "type": "string",
        "enum": ["q1", "q2", "q3", "q4"],
        "description": "q1 people who shaped me; q2 faith and lived values; q3 generosity; q4 encouragement to carry forward."
      }
    },
    "required": ["themeId"]
  }
}
```

Select **Wait for response**. The browser validates the identifier and updates the active theme before acknowledging the call. This event is an organizational hint, not exact word-level media alignment. Human review still matters.

Add the built-in **Skip Turn** system tool. Its instruction should tell the agent to stay silent when someone says they need a moment. Do not add End Call: the storyteller's controls own stopping and flushing the archive safely.

## 3. Prompt and data

The versioned prompt lives in `src/lib/collection/conversation-agent.ts`, exported as `INTERVIEW_AGENT_PROMPT`. The session response supplies it as a prompt override. It describes an AI interviewer, asks one question at a time, invites concrete memories, respects pauses, and never invents biographical or spiritual claims.

The prompt contains one placeholder, `{{interview_context_json}}`. Add that dynamic variable to the agent with an empty JSON default, `{}`, if the dashboard requests a default. The client passes the real value from the authenticated endpoint. Never paste a family's personal story into the shared agent's default prompt.

Resume data contains selected legacy answers and accepted user turns from previous conversations. Agent statements and excluded or superseded answers are not biographical evidence. Contact emails, postal addresses, keys and invitation notes are omitted. Extreme context is bounded to about 120,000 characters, with an explicit omission count. Omitted context remains in application storage.

The fixed prompt and the JSON variable remain separate. This separation reduces accidental instruction mixing; it is not a claim that prompt injection is mathematically prevented. The agent has no application permission to approve or send a gift, even if someone asks it to do so.

## 4. Server environment

Configure these privately in the local environment or deployment settings:

```dotenv
ELEVENLABS_API_KEY=your_private_server_key
ELEVENLABS_AGENT_ID=your_private_agent_id
```

The key needs permission to read that agent, read its theme tool and obtain a conversation token. Do not prefix either variable with `NEXT_PUBLIC_`. Do not commit values, put them in a screenshot, print them in logs, or store a session token in persistent browser storage.

Restart the separate QA server after configuration. Preserve any server with an active recording. This endpoint does not configure ElevenLabs retention settings, so set provider retention and consent wording deliberately before inviting real families. Starting the live experience sends microphone audio and accepted resume text to ElevenLabs.

## 5. Endpoint contract

Owner-only request:

```http
POST /api/collection/{id}/conversation/session?key={ownerKey}
Content-Type: application/json

{"sessionId":"optional-existing-local-interview-id"}
```

An empty request body also works. `sessionId` identifies resume context within this collection. It is not a provider conversation ID and the endpoint does not create or mutate a stored interview.

Success:

```ts
{
  configured: true,
  conversationToken: string,
  connectionType: "webrtc",
  overrides: { agent: { prompt: { prompt: string }, firstMessage: string } },
  dynamicVariables: { interview_context_json: string },
  maxDurationSeconds: number, // Actual verified agent duration, at most 2700.
  resumed: boolean,
  currentThemeId: "q1" | "q2" | "q3" | "q4"
}
```

Pass those connection, override and variable fields to the ElevenLabs browser SDK. Initialize the client theme with `currentThemeId`. Typed messages can use `sendUserMessage` during the same conversation, with `sendUserActivity` while composing to discourage the agent from talking over typing. Typed content must also be saved in the application's transcript, with duplicate message callbacks handled idempotently.

Errors contain `{ configured, error }`: 404 for an invalid private link, 403 for a non-owner or cross-origin request, 409 for an approved gift, 503 for missing configuration or an incomplete agent setup, and 502 for a provider connection failure. All responses disable caching and referrer propagation. Provider error bodies are not returned or logged.

Internally the server calls the SDK's `conversationalAi.conversations.getWebrtcToken({ agentId })`, backed by `GET /v1/convai/conversation/token`. The private API key stays server-side. No paid conversation is started by the automated tests.

## 6. Demo acceptance checks

Use a synthetic collection first. A passing build and mocked tests are not proof of a working live provider connection.

1. Confirm the AI introduction, audible first question and visible text match.
2. Tell a one-minute story and pause for ten seconds mid-thought. Check interruption behavior and the explicit thinking/pause control.
3. Interrupt the interviewer to correct a detail. Check the original and correction remain available and the draft uses the accepted correction.
4. Answer by typing during the call. Ensure the same interviewer responds and the answer is saved exactly once.
5. Move through all four internal themes. Confirm every user turn gets an appropriate theme and that theme names do not become a spoken checklist.
6. End normally, simulate a connection loss, and reload after a recoverable interruption. Check original audio/video recovery separately from saved transcript recovery.
7. Review the draft against original words. Verify the agent cannot approve, publish, send a postcard or email anyone.
8. Repeat on the actual demo device, supported mobile browser and venue-like Wi-Fi. Listen for speaker echo; use headphones for the demo if needed.

## Official references checked October 2, 2026

- [WebRTC conversation token API](https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token)
- [Conversation controls](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)
- [Client tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools)
- [Skip Turn](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/skip-turn)
- [Overrides](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides)
- [Dynamic variables](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables)
- [JavaScript client SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script)
- [Eleven v4 Turbo in ElevenAgents](https://elevenlabs.io/agents/v4-turbo)
