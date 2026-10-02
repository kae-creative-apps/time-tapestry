# True Legacy — Legacy Season
## Product Requirements Document (Proposed v3)
### For Partner Review | September 30, 2026

---

## 1. The Product Vision

One guided AI voice interview with a grandparent becomes a **Legacy Season**: story chapters delivered to their grandchild over time, each one inviting a reply and ending with the grandchild choosing their own next step.

The full product vision is a 5-box physical season mailed over 5 months. Each box contains a story chapter, a keepsake, a conversation prompt, and a prepaid reply card. The grandchild mails something back. This two-way exchange is the core of the product.

The hackathon build delivers the software that powers this vision: the AI interview, the story engine, the narrator approval, the digital keepsake page, the grandchild's response and action choice, and a church cohort view. Physical delivery is handled through a **postcard series via Lob API** — real, mailed, tangible, with QR codes linking to the digital experience. The full box season is the premium tier described in the PRD but not built for the hackathon.

**Tagline:** Shaping future generations, one legacy at a time.

---

## 2. The Problem (Grounded in Evidence)

In a busy, isolated society, the connection between generations that shapes a younger person's value of generosity is breaking down.

| Signal | Evidence | What it means |
|---|---|---|
| Older adults want to pass on values | 43% of US adults 50+ named life lessons and values among their most important legacies [1] | Grandparents already want to leave something beyond money |
| Younger adults want to receive them | 83% of non-retired adults said memories, values and life lessons are the most important things to inherit [2] | Both generations value the exchange |
| Church leaders are concerned | 94% of Protestant senior pastors are at least somewhat concerned about younger Christians not financially supporting the church; 51% very concerned [3] | A clear problem for Gloo's church audience |
| Family conversation matters | Children whose parents talk with them about giving are 20% more likely to give [4] | The product is built around conversation, not storage |
| Grandparent values don't pass on automatically | Grandparents' and adult grandchildren's giving priorities match less closely than parents' and children's [5] | The gap Legacy Season is designed to close |
| Organizations are losing donors | Donor numbers fell an estimated 3.6% in 2025 while dollars rose 5.0% [6] | Sponsors need ways to deepen relationships |
| The virtuous cycle is real | 54% of givers have personally received extraordinary generosity (vs. 36% of non-givers) [7] | Receiving generosity predicts giving it |

**What the evidence does NOT prove:** Product demand, increased giving, lasting behavior change, or that AI interviewing is better than a worksheet. The evidence supports building and testing a focused pilot.

**Sources:**
- [1] Edward Jones / Age Wave, 2021
- [2] Edward Jones / Age Wave, 2020
- [3] Barna, 2023
- [4] IU Women Give 2013
- [5] Vanguard Charitable / IU, 2016
- [6] FEP Q4 2025
- [7] Barna, 2022

---

## 3. The Psychology: Why This Works

The product design is grounded in established psychological research on how values transmit across generations:

**Narrative transportation (Green & Brock):** Stories that emotionally transport the listener are more persuasive than direct arguments. The grandchild needs to *feel* the grandparent's story, not just read it. This is why we use voice, not text, and why the story preserves the grandparent's exact words.

**Social learning theory (Bandura):** Observing a role model's generosity increases prosocial behavior, but hearing the *story of why* they did it is what transmits the value. The interview must surface the reasoning, not just the behavior. This is why Q3 asks "how did you decide" not just "what did you give."

**Self-determination theory (Deci & Ryan):** If the grandchild feels pressured to give, they'll resist (reactance). The action choice must be genuinely autonomous. This is why the "Causes They Believe In" section is framed as information, not a recommendation. The grandchild chooses freely.

**Generativity (Erikson, McAdams):** Older adults have a developmental drive to give to the next generation. The interview activates this by framing the grandparent as a teacher and naming the specific grandchild. Questions that ask "what do you want [grandchild] to know" produce deeper values content than abstract "future generations" framing.

**The virtuous cycle (Barna):** Givers are significantly more likely to have *received* generosity. The interview starts with the grandparent's experience of receiving generosity, completing the cycle.

**What does NOT work:** Lecturing, abstract values statements without story anchors, questions about money specifically, and one-way transmission (talking *at* someone rather than eliciting their story).

---

## 4. The Experience: 6-Step Loop

### Step 1: Invite

**Either generation can initiate:**

**Path A — "Request a Story" (Grandchild initiates):**
- Grandchild creates a session, enters grandparent name + email, records a 15-second voice intro
- Grandparent receives an email with a link and the voice intro

**Path B — "Share My Story" (Grandparent/parent initiates):**
- Grandparent or parent creates a session, enters their own info + grandchild's name + email
- No voice intro needed. Grandparent goes straight to the interview (or comes back later)

**Org-sponsored:** A church or nonprofit sponsors a cohort. They generate codes or upload a list of family names + emails. The system sends invitations. The org is the sponsor; the family just participates.

### Step 2: Remember (The AI Voice Interview)

The grandparent opens the link on any device with a browser. If Path A, they hear their grandchild's voice intro first. A warm AI voice greets them by name and begins the interview.

**The 6 research-backed questions:**

**Core interview (8-10 minutes, 4 questions):**

**1. "What's a story from your life that you think about often — something that shaped who you became?"**
*Mechanism:* Activates identity narrative (McAdams). Low-stakes warm-up that doesn't demand values articulation yet.

**2. "Can you tell me about a time someone was generous with you — maybe something they did for you or gave you that you didn't expect? What did that mean to you?"**
*Mechanism:* Surfaces the Barna virtuous cycle. The "what did it mean" follow-up forces values articulation, not just behavior recall.

**3. "Over your life, what causes or people have you given your time or money to? How did you decide those were the ones you wanted to support?"**
*Mechanism:* Mirrors Women Give 2013/2018 — explicit articulation of *why* behind giving. The "how did you decide" sub-question is the key; it forces values reasoning.

**4. "What do you most want [grandchild name] to know about how to live, or how to treat other people?"**
*Mechanism:* Most direct generativity activation. Naming the specific grandchild increases specificity and emotional stakes. Forces values distillation.

**Optional continuation (4-6 more minutes, 2 questions):**

**5. "Who showed you what generosity looked like when you were young? What did they actually do?"**
*Mechanism:* Elicits the elder's own teachers (Barna: 49% cite mother, 35% father). Surfaces the transmission chain itself.

**6. "How would you like to be remembered by the people in our family — and is there anything you want to make sure gets passed down?"**
*Mechanism:* StoryCorps staple; activates Erikson stage 8 integrity. Explicitly frames the conversation as legacy transmission.

**After the 4th question, the AI offers a natural pause:** "You've shared some wonderful stories. Would you like to keep going, or would you like to take a break and come back later?" If the grandparent continues, questions 5-6 follow. If they pause, the session persists for 7 days and they can return via the same link.

**Optional video message:** After the interview (core or full), the AI asks: "Would you like to record a short video message for your family?" If yes, browser camera recording. If no, skip.

**AI interviewer behavior:**
- Speaks slowly (0.85x speed), clearly, with generous pauses
- Asks one question at a time. Never compound questions.
- Allows 30-90 seconds of silence before following up (elders need time to access deep memories)
- One follow-up per question, always asking for *meaning* ("What did that mean to you?") not *facts* ("When did that happen?")
- Max 2 follow-ups per question, then moves on
- Never summarizes or evaluates answers mid-conversation (triggers social desirability bias)
- Names the grandchild explicitly in questions 4 and 6
- Avoids the word "charity" — uses "giving," "helping," "supporting"
- If the grandparent goes off-topic, gently redirects
- Visual text companion on screen shows what the AI just said, with a "Replay" button (for hearing-impaired users)

**Tech stack:**
- OpenAI Whisper (`whisper-1`, audio transcription via REST API)
- Gloo AI Studio (LLM, values-guarded, `tradition` parameter)
- ElevenLabs Flash v2.5 (TTS, streaming, ~75ms, warm voice at 0.85x speed)
- Target latency: 1.0-1.5 seconds end-to-end

**Accessibility design:**
- Landing page: one sentence, one button, 20px+ font, WCAG AAA contrast
- Pre-prompt before mic permission: shows a screenshot of the browser dialog with "Tap Allow"
- Recovery flow if mic is denied: browser-specific instructions + "Call your grandchild" button
- Pause/resume: session token persists for 7 days, "Welcome back" on return
- Progress indicator: "Question 3 of 6" so the user knows the end is near
- Persistent large "Pause" button visible throughout
- If silent for >10 seconds, AI gently prompts: "Take your time. I'm here whenever you're ready."

### Step 3: Review (Story Generation + Narrator Approval)

The AI takes the transcript and generates:

**4 story chapters** mapped to the interview questions:
- Chapter 1: "A Life That Shaped You" (from Q1)
- Chapter 2: "When Someone Was Generous With You" (from Q2)
- Chapter 3: "What You Gave and Why" (from Q3)
- Chapter 4: "What You Want [Grandchild] to Know" (from Q4)
- *(If continuation completed, chapters 5-6 map to Q5-Q6)*

**A welcome note** generated from the greeting.

**A "Causes They Believe In" section** — organizations/causes from Q3, framed as: "These are the causes [name] has personally supported and wants you to know about." Transparent and optional. Not a giving prompt.

**An audio narration** of each chapter (ElevenLabs TTS, higher quality voice).

Direct quotes preserved in the grandparent's exact words. Anything the AI expanded or inferred is flagged for review.

The grandparent reviews all chapters on screen. Large text, high contrast, simple interface. They can edit any text. When they're happy, they click "Approve and Send."

**The grandparent's experience is complete at this point.** They've shared their story. Everything that follows is for the grandchild.

### Step 4: Respond (Grandchild Receives + Replies)

The grandchild receives an email with a link to a **private digital keepsake page**. The page shows:
- The grandparent's welcome note (text + optional video)
- Story chapters with audio narration players
- Key quotes in the grandparent's own words
- "Causes [Grandparent] Believes In" section (informational, not a prompt)
- A conversation prompt: "Ask [grandparent name] about this the next time you talk"

**The reply mechanism:**
The grandchild can:
- Record a voice or video reply (browser mic/camera)
- Write a text response
- Ask a follow-up question

The reply goes back to the grandparent (via email notification). This closes the loop between generations.

**If the grandchild doesn't respond:** The product completes regardless. The story, postcards, and keepsake page are permanent. After 2 weeks, the system sends ONE gentle nudge: "Your [grandparent name] shared their story with you. No response needed, but they'd love to hear from you." After that, nothing. The grandchild engages on their own timeline or not at all. The story is a gift, not an assignment.

### Step 5: Act (Grandchild Chooses a Next Step)

After reading and responding (or not), the grandchild sees an optional next-step prompt:
- **Continue the conversation** — "I want to talk to [grandparent] about this"
- **Serve** — "I want to volunteer somewhere [grandparent] would care about"
- **Give** — "I want to support one of the causes [grandparent] believes in" (links to the grandparent's endorsed orgs, clearly optional, clearly the grandchild's choice)
- **Pass it on** — "I want to invite someone else to share their story"

The chosen action is recorded as an intention, not a verified completion. The evidence doc says: "Report intention separately from completion."

### Step 6: Follow Through (Check-in + Cohort Progress)

**For the family:** A gentle check-in email 2 weeks after the grandchild first views the story: "Did you talk to [grandparent name] about their story? Did you take the next step you chose?" This is a nudge, not a sales prompt.

**For the church/org (if sponsored):** An aggregate cohort view shows:
- How many families completed the interview
- How many grandchildren viewed the story
- How many responded
- How many chose an action
- How many followed through

**No family's private content is visible to the org.** The org sees counts, not stories. The evidence doc says: "Private family content should not become fundraising intelligence."

---

## 5. Physical Delivery: Postcard Series (Hackathon Build)

After the grandparent approves the story, the system schedules postcards via Lob API:

| Postcard | Timing | Content |
|---|---|---|
| Postcard 1 | Sent immediately | Welcome note + QR code to the keepsake page + video message |
| Postcard 2 | Sent +1 week | Chapter 1 + QR code + conversation prompt |
| Postcard 3 | Sent +2 weeks | Chapter 2 + QR code + "ask them about this" prompt |
| Postcard 4 | Sent +3 weeks | Chapter 3 + QR code + "try this" prompt |
| Postcard 5 | Sent +4 weeks | Chapter 4 + QR code + reply/action prompt |

Each postcard: 6x9, full color, front = story snippet + design, back = QR code + message. Lob test mode for development (PDF previews). Live mode for the demo (actually mails). Cost: ~$4.50 total.

**The full 5-box Legacy Season ($149) is the premium tier. The postcard series is the v1 delivery. The hackathon builds the postcard flow; box fulfillment is post-hackathon.**

---

## 6. Competitive Positioning

| Feature | Storyworth | Remento | True Legacy |
|---|---|---|---|
| Format | Weekly prompts → hardcover book | Voice recordings → book with QR codes | AI voice interview → postcard/box season + digital keepsake |
| Topic | General life stories | General life stories | Generosity, values, faith (architecture for broader topics) |
| Interview | Guided phone interviews (Magic Interviews) | Self-directed voice recordings | Real-time adaptive web voice interview with research-backed questions |
| Two-way exchange | No (grandchild receives passively) | Family can collaborate on stories | Grandchild replies and chooses a next step |
| Grandchild agency | None | Can view/comment | Chooses an action: continue, serve, give, pass on |
| Physical deliverable | Book (after 12 months) | Book with QR codes | Postcard series (v1) / 5-box season (premium) |
| Giving connection | None | None | Grandparent endorses causes from their own story |
| Church/org channel | No | No | Org-sponsored cohorts with aggregate progress |
| Interview questions | General life prompts | General life prompts | Research-backed, designed for values transmission |

**What we don't claim:** That AI interviewing is proven better than alternatives. That this will increase donations or church retention. We claim a different design choice: the complete loop (story → response → action → follow-through) with research-backed questions, supported by a church community.

---

## 7. Pricing and Business Model (Described, Not Built)

| Offer | Price to test | Includes |
|---|---|---|
| Digital story | Free in v1 | Interview, 4 chapters, private keepsake page, digital reply. Drives word of mouth. |
| Postcard season | ~$25 | 5 mailed postcards with QR codes over 5 weeks. |
| Family Legacy Season (premium) | $149 | 5 mailed boxes over 5 months with keepsakes, reply cards, video + audio pages. |
| Sponsor pack | $3,250 for 25 seasons ($130 each) | Co-branded "a gift from" card, donor invitations, aggregate dashboard. |
| Church cohort | Per-family pricing, scholarship option | Leader guide, Legacy Sunday kit, cohort progress. |

**Guardrails for sponsors:** The sponsor is credited, but family stories stay private and never become fundraising data. Any invitation to the sponsor's cause is optional and clearly labeled.

**30-day money-back guarantee:** If the grandparent never completes the interview, full refund.

---

## 8. Technical Architecture

**Pages:**
- `/` → Landing (choose path)
- `/request` → Grandchild "Request a Story"
- `/share` → Grandparent "Share My Story"
- `/interview/[id]` → Grandparent voice interview
- `/review/[id]` → Grandparent reviews and approves
- `/keepsake/[id]` → Grandchild's private page
- `/reply/[id]` → Grandchild records reply
- `/act/[id]` → Grandchild chooses action
- `/cohort/[id]` → Church/org aggregate view
- `/org` → Org code generation/list upload

**API Routes:**
- `/api/session/create` → Create session (either path)
- `/api/interview/turn` → STT → LLM → TTS voice loop
- `/api/story/generate` → Transcript → 4 chapters
- `/api/video/upload` → Grandparent video upload
- `/api/reply/submit` → Grandchild reply + action
- `/api/email/send` → Notifications + nudge
- `/api/postcards/send` → Lob postcard scheduling
- `/api/org/codes` → Generate sponsor codes
- `/api/cohort/stats` → Aggregate completion stats

**Stack:**
- **Framework:** Next.js 15 + TypeScript + Tailwind CSS
- **Hosting:** Vercel (one-click deploy from GitHub)
- **LLM:** Gloo AI Studio (`/ai/v2/guarded/responses`), values-guarded, `tradition` parameter
- **STT:** OpenAI Whisper (`whisper-1`, free tier, REST API)
- **TTS:** ElevenLabs Flash v2.5 (10k free chars/month, streaming, ~75ms, warm voice at 0.85x)
- **Mail:** Lob API (free dev tier, test mode, 6x9 postcards with QR codes, scheduled sends)
- **Email:** Resend (free tier, 100/day)
- **Storage:** Vercel Blob (audio/video files) + JSON (story/session data)

---

## 9. What We're Building for the Hackathon

| Feature | Priority | Owner |
|---|---|---|
| Landing page (choose path) | Core | Kaelyn |
| Grandchild "Request a Story" + voice intro | Core | Kaelyn |
| Grandparent "Share My Story" | Core | Kaelyn |
| AI voice interview (web, 4 core + 2 optional questions) | Core | Kaelyn |
| Story engine (transcript → 4 chapters + welcome note + causes) | Core | Kaelyn |
| Audio narration (TTS of each chapter) | Core | Kaelyn |
| Grandparent review & approval | Core | Kaelyn |
| Digital keepsake page (story + audio + video + causes) | Core | Kaelyn |
| Grandchild reply (voice/video/text) | High | Kaelyn |
| Grandchild action choice (continue/serve/give/pass on) | High | Kaelyn |
| Postcard series via Lob (5 postcards, scheduled, QR codes) | High | Kaelyn |
| Email notifications + gentle nudge (Resend) | High | Kaelyn |
| Org code generation / list upload | Medium | Kaelyn |
| Church cohort aggregate view | Medium | Kaelyn |
| Pause/resume (7-day session token) | Core | Kaelyn |
| Visual text companion for hearing-impaired | Core | Kaelyn |
| Mic permission pre-prompt + recovery flow | Core | Kaelyn |
| Optional video message recording | Medium | Kaelyn |
| Pre-seeded demo story | Core | Kaelyn |
| Brand, visual design, positioning | Design | Tayloe |
| Physical mock postcard/box for demo | Demo | Tayloe |
| 90-second demo video | Demo | Tayloe |
| Sponsor pitch materials | Pitch | Tayloe |

**Deferred (post-hackathon):** Payment processing, physical box fulfillment, CRM connections, donor scoring, voice cloning, phone/Twilio channel, helper mode, multi-language, public story feed.

---

## 10. Demo Plan (90 Seconds)

1. **0-10s:** Problem stat — "Religion giving is the only major philanthropic sector in decline. Donor participation fell 3.6% last year."

2. **10-25s:** "True Legacy turns a grandparent's generosity story into a Legacy Season." Show Path A — grandchild records voice intro. Show Path B — grandparent chooses "Share My Story."

3. **25-50s:** Show the AI voice interview — grandparent speaks, AI responds with warm follow-ups. Show the visual text companion and pause button. "Designed for grandparents, not techies."

4. **50-65s:** Show the keepsake page — 4 chapters, audio narration, causes. Then show the grandchild's reply and action choice. "This is where the impact lives — not in the story, but in the response."

5. **65-80s:** Show the physical postcard — "This arrives in the mail. QR code opens the story." Show the church cohort view — "A church can see how many families connected, without seeing anyone's private story."

6. **80-90s:** "One interview. Four chapters. A conversation that crosses generations. Shaping future generations, one legacy at a time."

**Backup:** Pre-seeded demo story ("Gigi's Generosity Story") with full content at a fixed URL.

---

## 11. What We Need to Prove (Post-Hackathon)

| Question | Measure | Target |
|---|---|---|
| Can grandparents complete it? | Narrators approving / narrators who start | At least 5 complete |
| Does it reach the next generation? | Grandchild views within 7 days / stories shared | At least 6 of 10 |
| Does it create a conversation? | Families reporting two-way discussion within 14 days | At least 5 of 10 |
| Does an action follow? | Families reporting completed action within 30 days | Report intention vs. completion separately |
| Is it useful to a church leader? | Setup time, admin time, support requests | Compare with current approach |
| Will a buyer commit? | Budget owner agreeing to paid pilot with date and price | One concrete commitment |

---

## 12. Challenges and Open Questions for Partner Review

### Challenges

**C1. Storyworth already does guided phone interviews.** Their Magic Interviews feature conducts guided phone interviews with follow-up questions. Our differentiation is not "we do interviews and they don't." Our differentiation is: (a) research-backed questions designed for values transmission, (b) the complete loop (response → action → follow-through), (c) the church cohort channel, and (d) the physical postcard/box season. We should lead with the loop, not the interview.

**C2. Four chapters from an 8-10 minute interview may be thin.** Each chapter maps to one answer (~2-3 minutes of speech, ~200-400 words). The story engine must expand without fabricating. Direct quotes are preserved; anything inferred is flagged. The grandparent's review is the safeguard.

**C3. The postcard is a compromise.** Tayloe's 5-box season with keepsakes and reply cards is the real product. Postcards are what we can build in 30 days. Tayloe's physical mock for the demo is critical to show the full vision.

**C4. The grandchild reply adds build complexity.** Voice/video reply requires another MediaRecorder integration. Text reply is simpler but less warm. For the hackathon, text reply is the safe default with voice/video as stretch.

**C5. We're building ~18 features for one developer in 30 days.** Priority order if time runs short (last to cut → first to cut):
1. AI voice interview (non-negotiable)
2. Story engine (non-negotiable)
3. Keepsake page (non-negotiable)
4. Grandparent review (non-negotiable)
5. Pause/resume (non-negotiable for accessibility)
6. Pre-seeded demo (non-negotiable for demo safety)
7. Postcard series via Lob
8. Grandchild reply + action
9. Email notifications
10. Org code generation
11. Church cohort view
12. Path B "Share My Story"
13. Grandchild voice intro
14. Optional video message
15. Visual text companion

### Open Questions for Tayloe

**Q1. Postcard vs. box:** Aligned that we build postcards via Lob for the hackathon and describe boxes as premium? Or do you want us to attempt the box?

**Q2. Reply format:** Should the grandchild's reply be voice/video/text, or is text sufficient for the hackathon?

**Q3. Physical mock:** Can you design and produce one mock postcard (or box) with QR code for the demo?

**Q4. "Built in Gloo Code":** Confirming this means use Gloo Code as a dev tool and Gloo AI Studio for models, with the app deployed on Vercel?

**Q5. Interview length:** We're building for 8-10 minutes core (4 questions) + optional 4-6 minutes (2 more). The AI offers a natural pause after Q4. Is this the right structure?

**Q6. Mentor option:** The evidence doc says "include an older mentor when a relative is unavailable." Should the product support non-family mentors, or is this future?

**Q7. Pricing validation:** Do you have print/postage estimates for the box format, or should we validate post-hackathon?

**Q8. The research-backed questions:** The 6 questions are now grounded in published research (Women Give 2013/2018, Barna, StoryCorps, Erikson generativity, reminiscence therapy). Do you want to review or adjust any of them?

---

*Prepared September 30, 2026 by Kaelyn Brooks for partner review. All decisions are flagged as proposals pending Tayloe's response to the challenges and open questions in Section 12.*
