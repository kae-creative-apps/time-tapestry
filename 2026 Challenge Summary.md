# Challenge Overview

## 

2026 AI Hackathon Challenges

Welcome\! Below you’ll find an overview of the challenges for the 2026 Gloo AI Hackathon. Click the links below or visit the tabs on the left to see more details about each challenge.

You can find the [official rules here.](https://docs.google.com/document/d/1jmH6lnQkI_B9YQeHT12pCanQI8W4yoE_yK3EO2IWaeQ/edit?usp=sharing) 

Track 1: [Agents of Flourishing]() (Track Lead: Gloo) 

Track 2: [Scripture Beyond the App]() (Track Lead: YouVersion)  
	1\. Activation Lane   
	2\. Access Lane 

Track 3: [Ministry Resourcing]() (Track Lead: Masterworks)   
1\. Sacred Spaces, Safe Homes   
2\. Every Story Has a Donor   
3\. Dear Right Donor, Right Now 

Track 4: [Everything Else]() (Track Lead: Gloo)   
*Note: Track 4 does not have independent prizes, other than Best of Gloo, but projects will be reviewed and considered for finals.*   
	1\. Internal Gloo or CP teams (for Best of Gloo)  
2\. Projects that otherwise don’t fit a track

# 1 | Agents of Flourishing

## 

## **Challenge 1 | Agents of Flourishing**

*Agents of Flourishing challenges builders to move beyond simple chatbots by creating autonomous AI agents that handle complex administrative workflows end-to-end, restoring vital time and capacity for leaders in the faith and care sectors to focus on human relationships.*

### **Challenge Advocate** | Gloo

### **The Challenge**

Artificial intelligence has crossed a fundamental boundary: the transition from simple text generation to true digital autonomy. For leaders in the faith and flourishing ecosystem, however, finding real solutions means cutting through market noise. Most tools currently marketed as AI agents are merely standard chatbots running longer prompts or following rigid, hardcoded scripts. What really matters is who makes the decisions along the way. If a program follows a set plan and the AI just fills in the words, that is a basic script. But if you give the AI a goal and it figures out the steps on its own, uses external tools, checks its output, and fixes its own mistakes until the job is complete, that is a real agent. This track focuses entirely on the latter: building autonomous digital agents capable of absorbing complex, multi-step workflows end to end.

The faith and flourishing ecosystem—including nonprofits, churches, ministries, and community care organizations—has a unique opportunity to amplify its impact through these systems. These teams almost always operate under chronic understaffing. When operational loads spike, the work that gets dropped is rarely administrative compliance. It is inevitably the relational work that touches people directly: the follow-up visit after a hospital stay, the unhurried conversation with a family in crisis, or the personal note to a volunteer who quietly stopped showing up. No leader chooses to set aside care work. It falls off simply because a person has eleven hours of administrative burden and only eight hours in their day to handle it. By taking on that backend weight, agents give leaders back the capacity to focus on the human connections that matter most.

Your goal in this track is to move beyond assistive chatbots, single-prompt wrappers, and surface-level tools. You are challenged to build an autonomous agent that takes real initiative, executes multi-step tasks across real systems, operates within rigorous ethical guardrails, and gives a real human practitioner a real hour of their week back, permanently.

### **Requirements for Success** 

* Serve a specific, named user with a specific, real burden. "Pastors" is not a user. "A solo pastor preparing for hospital visits on Monday morning" is.  
* Take an objective and complete it end to end. Multi-step reasoning, tool or API calls, and self-correction are what separate an agent from a prompt with good manners.  
* Produce a finished artifact or completed action, not a suggestion. A drafted-and-filed report, a scheduled follow-up, a triaged queue, a reconciled record.  
* Know its own limits. It escalates to a human when confidence is low, when the decision is pastoral or ethical, or when the cost of being wrong lands on a person.  
* Run live in the demo on input the judges can see, including at least one case where it hits an edge and handles it. A recorded happy path is not a demo.  
* Be plausibly runnable by the target user without a developer on retainer.

### **Agent Build Doc**

With your submission, include an Agent Build Document with the following sections. Length is not the goal, rather, keep it as concise as possible. A tight five pages that another builder could work from beats thirty pages of narrative.

* **The user and the burden.**   
  * Who this is for, what the work costs them today in hours or dollars or dropped balls, and how you validated that rather than assumed it.  
* **Architecture**.   
  * How the agent is composed: single agent, orchestrator with subagents, or a pipeline. A diagram or clear description of the control flow and where decisions get made.  
* **Prompts, verbatim.**   
  * Full system prompt and any subagent or tool prompts, as text, not screenshots. Include at least one earlier version and what was wrong with it.  
* **Platform and stack.**   
  * Models used and why, framework or SDK, orchestration and memory, retrieval and data layer, hosting, cost per run at realistic volume.  
* **Tools and permissions.**   
  * The tool, API, or data source the agent can reach, what it is allowed to do with each, and what it is explicitly blocked from doing.  
* **Evaluation.**   
  * How you knew it worked. Test cases, pass criteria, failure modes you found, and what you changed in response. Even a hand-built set of twenty cases counts, and stating that it is twenty hand-built cases counts more than implying you had a benchmark.    
  * Include a session log that can be audited, to demonstrate that it behaved the way you expected it to.    
* **Guardrails and human handoff.**   
  * What the agent will not do, how it detects those situations, and where control returns to a person.  
* **Reproduction.**   
  * What another team needs to run this: repo, credentials required, setup steps, known gaps.

### **Guardrails (Do NOT)**

* Do not submit a chatbot, a wrapper, or a single-prompt call and describe it as an agent. If a human still performs every step and the AI only drafts text, this is the wrong track.  
* Do not automate and abdicate spiritual authority. An agent may prepare, surface, draft, and route. It does not counsel, diagnose, absolve, discipline, or make pastoral judgments.  
* Do not let the agent act irreversibly without human confirmation: sending communications to congregants or donors, moving money, publishing, changing records of record, or contacting anyone in crisis.  
* Do not build on scraped congregational, donor, counseling, or minor data. Use synthetic or properly consented data, and say which in the doc.  
* Do not fabricate Scripture, theology, or facts. Cite translation and reference, and mark interpretive framing as interpretation.  
* Do not hide the mechanism. A build doc with the prompts redacted, the model unnamed, or the failures omitted is an incomplete submission.  
* Do not build something that only works because a developer is standing next to it.

### **Resources & References**

* **Models:** Gloo AI Studio offers numerous values-aligned models. Register for Early Developer Access and generate API credentials before the event.  
* **Agent frameworks and SDKs**: whatever you are fastest in. Name it and justify it in the doc.  
* **Reference reading**: published guidance on agent design patterns, tool use, orchestration, evaluation, and human-in-the-loop escalation. Judges will recognize a team that has read the current literature and a team that has not.  
* **Mock data**: synthetic congregational and membership records, ministry calendars, volunteer rosters, donor files, prayer request queues, grant reporting templates, case notes.  
* **Build doc template**: a starter outline covering the required sections will be provided, and you are welcome to exceed it.  
* **Mentors:** You will have access to mentors and practitioners from churches, ministries, and nonprofits during the event. We highly recommend leaning on them\!

### **Bonus Points**

* The build doc is published openly with a permissive license, so other builders can start from your work instead of your conclusions.  
* The agent exposes its capability as an open endpoint, MCP server, or shared schema that other teams' projects could call.  
* A published eval set or rubric that other teams could run their own agents against.  
* An accounting of cost and latency metrics at realistic volume, including what breaks the economics of your setup.  
* A generalizable pattern or reusable component, named and documented, that clearly transfers beyond your specific use case.  
* Evidence a real practitioner used it during the event and said something specific about it.  
* A candid account of what you tried that did not work and why you abandoned it.

# 2 | Scripture Beyond the App

## **![][image1]**

## **Challenge 2 | Scripture Beyond the App**

*Scripture Beyond the App challenges builders to build and validate a Scripture-centered experience for a community, moment, or place that is not well reached today.*

### **Challenge Advocate** | YouVersion and Biblica

## **The Challenge**

People often experience their most meaningful or difficult moments somewhere other than a Bible app. Others live in places where access to Scripture itself may be restricted, unreliable, difficult, or unavailable through traditional channels.

We want builders to explore both sides of that opportunity:

* **Activation Lane:** Meet people with Scripture in meaningful human moments and digital environments where they already are.  
* **Access Lane:** Create safe, resilient ways for people to access and engage Scripture where traditional digital or physical distribution is constrained.

Both lanes share the same goal: **use technology to close the distance between people and God’s Word.**

YouVersion Platform should serve as the core Scripture layer, while teams are encouraged to incorporate Gloo Studio and other technologies where they meaningfully strengthen the solution.

## **Key Objectives**

* **Start with people, not technology.** Identify a specific community and a real need or barrier.  
* Make Scripture **essential to the experience**, not content added after the fact.  
* Meet people in environments and circumstances where the Family of Apps is not the natural or available destination.  
* Give the person a meaningful way to **respond and continue** their journey.  
* Use the 30-day build period to **validate assumptions with real people or credible representatives** of the community being served.

## **Requirements for Success**

Choose **one challenge lane** and demonstrate the following:

### **1\. Need**

Clearly identify who you are serving, the barrier or human need you are addressing, and why it matters.

### **2\. Encounter**

Create a working experience where Scripture is delivered naturally and meaningfully within that context.

**The test:** *If you removed Scripture, would the fundamental experience still work?*

### **3\. Response**

Enable the person to do something meaningful: reflect, pray, explore, share, listen, connect, or take another appropriate action.

### **4\. Continuation**

Show what happens next. This might be deeper Scripture engagement, an ongoing spiritual practice, a trusted ministry or community, continued access, or another appropriate next step.

### **5\. Validation**

Demonstrate that you pressure-tested your idea during the 30 days. Show:

* Who you learned from  
* What you discovered  
* What assumption proved incomplete or wrong  
* What changed in your solution because of that learning

Validation may come from users, ministries, practitioners, diaspora communities, cultural or language experts, or other credible representatives appropriate to the context.

## **Challenge Lane 1: Activation**

### **Scripture in the Moments That Matter**

Bring Scripture into an existing digital environment where people already experience meaningful human needs.

Examples might include:

* Health, hospitalization, or caregiving  
* Grief and loss  
* Conflict or displacement  
* Loneliness or isolation  
* Parenting or youth  
* Recovery or reentry  
* Messaging, community, social, news, or other high-use digital environments

## **Challenge Lane 2: Access**

### **Scripture Where Access Is Constrained**

Explore creative, responsible ways of making Scripture accessible in environments where normal distribution channels are restricted, unreliable, or absent.

This may include challenges created by:

* Restricted access to Bible applications or content  
* Limited or intermittent connectivity  
* Language or format barriers  
* Distribution constraints  
* Environments where accessing religious content may create meaningful personal risk

The goal is not novelty for novelty’s sake. **Design around the actual circumstances and safety of the people you are trying to serve.**

## **Guardrails: Do Not**

* Do not simply paste Scripture onto an unrelated experience.  
* Do not fabricate theological claims, misattribute Scripture, or present interpretation as Scripture.  
* Do not optimize primarily for attention, retention, data capture, or lock-in.  
* Do not put vulnerable people at unnecessary risk or require sensitive personal information to make the experience work.  
* Do not assume you understand a community without seeking credible input from people connected to it.  
* Respect Scripture licensing, platform requirements, privacy, and applicable distribution constraints.

## **How You’ll Know It Worked**

A judge should be able to answer five questions after your presentation:

1. Who are you serving?  
2. What real problem or barrier did you discover?  
3. Why is Scripture essential to your solution?  
4. What did you learn from real-world validation?  
5. If this continued beyond the Hackathon, how could it meaningfully reach more people?

A polished prototype alone is not enough.

## **Resources & References**

* YouVersion Platform APIs, SDKs, Bible content, and related developer resources  
* Gloo Studio and other complementary technologies  
* July **Scripture in New Frontiers** materials as inspiration for bringing Scripture into existing digital environments  
* Biblica context and expertise for teams pursuing the **Access** lane  
* Relevant ministries, community leaders, practitioners, and subject-matter experts for validation

## **Bonus Points**

* Evidence that community feedback materially changed the product  
* A credible path to pilot or distribution after the Hackathon  
* Thoughtful use of language, accessibility, or contextualization  
* An experience that could scale through an existing digital surface or trusted partner  
* A reusable approach other builders could apply to additional communities

## **One Final Challenge to Builders**

Don’t just build something with Scripture. Find people we are not serving well today, understand why, and show us a better way to reach them.

# 3 | Ministry Resourcing

# **![][image2]**

# **Challenge 3 | Ministry Resourcing**

*The Ministry Resourcing track offers microchallenges for builders to serve the specific needs of specific ministries. Every challenge in this track shares the same guardrails: protect donor and beneficiary privacy, never fabricate facts or Scripture, and keep a human in the loop for anything published, legal, or financial.*

### **Challenge Advocate** | Masterworks

## **Before You Build (applies to every challenge)**

> * **Recommended model layer:** Gloo AI Studio's values-aligned, ethically sourced models. Register for Early Developer Access and generate API credentials before the event.  
> * **Judging lens:** Each challenge includes a "How You'll Know It Worked" line. Build toward that demo, a working slice that hits the success test beats a broad tool that doesn't.  
> * **Shared guardrails:** Protect donor and beneficiary privacy. Never expose or transmit PII insecurely. Don't fabricate facts, quotes, or scripture. Keep a human in the loop for anything published, legal, or financial.

[Before You Build (applies to every challenge)](#heading=)

[1\. Sacred Spaces, Safe Homes](#heading=)

[2\. Every Story Has a Donor](#heading=)

[3\. Dear Right Donor, Right Now](#heading=)

## **1\. Sacred Spaces, Safe Homes**

*Turn the empty church parking lot into a feasibility study for affordable housing.*  
**Challenge Advocate:** \[TBD\]

### **The Organization**

A faith-based real estate advisory and community-development network that works with asset-rich, cash-poor churches wanting to put underused property to Kingdom use. Few orgs market themselves as a standalone nonprofit here; it's usually the community liaison or business-development arm of an affordable-housing developer. The user is a pastor or church board with land and conviction, but no real estate expertise.

### **The Challenge**

There is a massive affordable-housing crisis, and faith communities are uniquely positioned to answer the scriptural call to care for the poor, the widow, the orphan, and the stranger. Many churches own expansive properties, including parking lots that sit empty six days a week. But converting an underused lot into housing is a logistical and regulatory nightmare: zoning, NIMBY opposition, feasibility studies, financing. Pastors and boards aren't real estate experts, get overwhelmed, and abandon these projects before they start. The land and the opportunity stay idle.

### **Key Objectives**

> * Lower the intimidation barrier that kills projects at the starting line.  
> * Give a church a fast, credible read on what's actually possible on their property.  
> * Equip them with the narrative to rally neighbors, boards, and city councils.

### **Requirements for Success**

Build an AI-driven **"Feasibility & Visioning Copilot."** To succeed, it must:

> * Take a church address (and optional parcel details), scan public zoning codes and parcel data, and generate a preliminary, plain-language feasibility read: e.g., "Your parking lot could legally support a \~12-unit micro-community, subject to setback and parking-minimum constraints."  
> * Generate faith-aligned community presentation materials (one-pager, slides, talking points) that articulate *why* using these resources this way is a profound expression of loving one's neighbor, tuned to win over skeptical neighbors and local councils.  
> * Surface the likely obstacles (variance needed, parking minimums, community objections) with suggested, mission-driven counterpoints.

### **Guardrails (Do NOT)**

> * Do not automate or imply final legal or financial decisions. Act strictly as an introductory accelerator.  
> * Do not bypass human expert review: architects, land-use attorneys, city planners.  
> * Do not fabricate zoning provisions. Cite the source code section or flag uncertainty.

### **How You'll Know It Worked**

A non-expert church leader goes from an address to a feasibility snapshot plus a presentation they'd actually show their board and city council in minutes.

### **Resources & References**

> * **Mapping/parcel data:** OpenStreetMap, Google Maps/Places API, Regrid parcel data, municipal open-data zoning portals.  
> * **Inspiration:** generative urban-planning and architectural layout tools (Finch 3D, Delve by Sidewalk Labs).  
> * **Mock data:** sample municipal zoning documents, church property map coordinates, standard community-objection templates.  
> * **Model layer:** Gloo AI Studio for the persuasion/narrative generation.

### **Bonus Points**

> * An illustrative financing sketch (capital-stack options such as LIHTC or faith-based housing funds), clearly flagged as preliminary.  
> * A visual massing render of what the site could become.  
> * A one-click "council-ready" slide export.

## **2\. Every Story Has a Donor**

*Raw moment in. Donor-ready campaign out. No comms team required.*  
**Challenge Advocate:** \[TBD\]

### **The Organization**

Small-to-mid-size faith-based and cause-driven nonprofits: rescue missions, food banks, transitional housing, job-training programs (think Metropolitan Ministries). Rich in daily impact, thin on marketing capacity. Program and field staff witness life-change constantly; no one has the time or skill to turn it into fundraising.

### **The Challenge**

Nonprofits don't suffer from a lack of impact; they suffer from a creative bottleneck. A single caseworker might witness three life-changing breakthroughs in a week, but those stories stay locked in case notes, voicemails, camera rolls, and a Google Doc someone started in 2019\. Collecting them is manual, storing them is chaos, and turning raw material into donor-facing content requires writing and design skills most teams don't have. So appeals go out generic, and donors feel disconnected from the mission they're funding.

### **Key Objectives**

> * Make capturing stories effortless for non-marketers.  
> * Transform raw input into emotionally resonant, on-brand, multi-format donor assets.  
> * Keep stories organized and reusable so they don't get submitted and forgotten.

### **Requirements for Success**

> * A dead-simple intake for program staff (not just comms): typed notes, voice / voice-to-text, photo with caption.  
> * AI curates, tags, and surfaces relevant stories for a specific campaign or audience.  
> * Flexible, multi-format outputs from one input: a storyteller fundraising email, a social post, a donation-page snippet or landing-page timeline, a pull quote for a direct mail letter, a thank-you draft; all matched to the organization's voice and brand.  
> * Functions as a lightweight Digital Asset Management (DAM) system so stories stay findable.  
> * First draft from no more than 60 seconds of human input; usable with zero training or design skill.

### **Guardrails (Do NOT)**

> * Do not lose the human soul or over-fabricate. Hard guardrails against hallucination and slick, corporate-sounding copy; faith donors value authenticity over polish.  
> * Build in privacy and anonymization to protect the identity of vulnerable individuals; treat consent as first-class.  
> * Do not produce generic content that could belong to any nonprofit; specificity to mission and voice is non-negotiable.  
> * Do not require design skills or a tech-savvy operator. The front-end intake must be dead simple.

### **How You'll Know It Worked**

A fundraiser with no writing background turns a 30-second voice memo into an email they'd actually send and can find that same story again three months later.

### **Resources & References**

> * **Inspiration:** ambient voice-to-CRM capture tools (Fireflies.ai and similar) for low-friction data collection.  
> * **Mock data:** raw caseworker notes, voice transcripts, and the desired final output formats.  
> * **Benchmarks:** examples of high-performing nonprofit storyteller emails; sample client voice/brand guidelines.  
> * **Frameworks:** the "hero's journey" donor story arc; the "one person" fundraising principle.  
> * **Model layer:** Gloo AI Studio.

### **Bonus Points**

> * Learns and enforces a specific org's brand voice from a few samples.  
> * Recommends the single best story for a given appeal or segment.  
> * Auto-assembles a shareable, campaign-ready asset bundle.

## **3\. Dear Right Donor, Right Now**

*ML-driven dynamic mail journeys: the right package, to the right donor, at the right moment.*  
**Challenge Advocate:** \[TBD\]

### **The Organization**

Direct mail fundraising agencies and the nonprofits they serve sending thousands to millions of mail pieces per year, where one-size-fits-all donor journeys leave significant revenue and relationship-building on the table.

### **The Challenge**

Most nonprofits treat every new donor the same: same welcome series, same cadence, same package. But a first-time \$25 donor who responded to an acquisition mailer has very different needs — and potential — than a lapsed donor who just reactivated with a \$500 gift. Machine learning can read behavioral signals fast enough to differentiate these journeys in near-real-time, but most organizations lack the framework to act on it. The opportunity: use AI to decide not just *when* to mail, but *what* to mail (a postcard, a letter, a full 9x12 kit) and to trigger smarter thank-you receipts and insert streams to match.

### **Key Objectives**

> * A decision engine that personalizes format, timing, and acknowledgment based on donor behavior.  
> * Output that a production team can actually run.

### **Requirements for Success**

> * Ingest donor behavior signals (gift amount, recency, acquisition channel, giving history) and recommend the appropriate mail format and timing for next contact.  
> * Include at least one triggered journey scenario: new-donor welcome, lapsed reactivation, or major-gift acknowledgment.  
> * The receipt/thank-you component must go beyond a generic letter: personalized insert selection, impact statements matched to giving level, or segmented receipt copy.  
> * Produce a journey map or decision tree that a mail production team could use to brief a print vendor.

### **Guardrails (Do NOT)**

> * Do not require a real-time data infrastructure that a small nonprofit couldn't realistically maintain.  
> * Do not ignore the physical production constraints of direct mail — lead times, print minimums, postal requirements.

### **How You'll Know It Worked**

Feed it a donor file, and it returns differentiated journeys plus a vendor-ready brief that a fundraising strategist trusts.

### **Resources & References**

> * **Data:** a synthetic donor file (gift amount, recency, channel of acquisition, giving history).  
> * **Reference:** direct mail format and cost basics (postcard vs. letter vs. 9x12, postal classes, lead times); RFM segmentation primers.  
> * **Model layer:** Gloo AI Studio.

### **Bonus Points**

> * Projected lift/ROI per journey versus a one-size-fits-all baseline.  
> * An insert-stream optimizer.  
> * Handles seasonal and year-end timing pressure.

# 4 | Everything Else

# **4 | Everything Else**

## **Challenge 4 | Choose Your Own Adventure**

*This track exists for two kinds of projects: internal builds from Gloo or CP teams competing for Best of Gloo, and anything else that doesn't map cleanly to another track but still deserves a serious look. There are no fixed challenge statements here, just an open lane for good work that doesn't have another home.*

### **Challenge Advocate** | Gloo

### **The Challenge**

Not every strong idea fits neatly inside Agents, Bible, or Ministry Resourcing, and that's fine. This track exists for two kinds of projects: internal builds from Gloo or CP teams competing for Best of Gloo, and anything else that doesn't map cleanly to another track but still deserves a serious look. There are no fixed challenge statements here, just an open lane for good work that doesn't have another home.

### **Requirements for Success**

* Internal Gloo or CP team submissions, eligible for Best of Gloo.  
* Any other project that doesn't fit Tracks 1 through 3\.  
* Still a real, working build, not a placeholder for "didn't finish in time."

### **Guardrails (Do NOT)**

* Do not use this track as a fallback for an incomplete or unfocused submission. It's a home for good ideas without a track, not a lower bar.

### **How You'll Know It Worked**

The project stands on its own merits: it's finished, it's doable, it supports human flourishing, and a judge can tell what problem it solves even without a track brief to frame it.

### **Note**

This track carries no independent prize pool, aside from Best of Gloo. 

All submissions are still reviewed and eligible for finals consideration.

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPUAAABCCAYAAACPfpCoAAAPO0lEQVR4Xu2dBawkxRaGF3d33cUhuLssS4ITILgFd3d32WSDBbfgTiBocLcQ3Anu7q5Nvn6vh5q/TvX03Dtzd2/f8yUnsDOnelrqLzl1qu+gzHGcWjFIP3Acp3/jonacmuGidpya4aJ2nJrhonacmuGidpya4aJ2nJrhonacmuGidpya4aJ2nJrhonacmuGidpya4aJ2nJrhonacmuGidpya4aJ2+h0vvPBCduSRR2a77bZbdsopp+jXA56Oi/rvv//WjzrGX3/9pR+N8vzzzz/6UUfp9vFHNd5///1swgknzAYNGtSwDTfcMPvtt9/UdcDScVG/8sor2aSTTppNNtlkDePfK664orom2X777aNjYLfeequ6jvIsssgi0XVgH3/8sbq2xLonQ4YMUbdas9pqqzUJurCzzjpLXQcsHRc1TD/99NFNx6oy0UQTRWVHH310desXXHDBBdG1YDfddJO6lvLNN99Ex8CWWWYZda01CyywQHQPsJ133lldByzVldYGW221VXTTsffee09dI77//vuoHNZfe6QPPvggG3/88aPr2W+//dS1lFTjcNVVV6lrrVl//fWjezAQ70MZXRH177//nk077bTRjZ9nnnmyP//8U92b2HHHHaNy4403XvbDDz+oa7+A651//vmja5pxxhkrxx/wW2KJJaJjzDbbbOpaexixzDnnnNkYY4yR34Oxxx4723fffftlvKVbdEXUcMQRR0SVcNxxx83effdddW1i5plnjsoNGzZM3foVZ555ZnRN2JNPPqmuJr/++ms2zTTTROW32GILdR0wvPrqq9l9992Xff755/rVgKdrouamayXEDj/8cHVtcMMNN0T+2G233aau/QpGGdYQfPfdd1dXk+eeey6PKWj5q6++Wl0dp3uihvXWWy+qiCxHMIRSWJJgOKn+Cy+8sLpGfPHFF9nDDz+cXX/99dlll12W3Xjjjdljjz1m/s7Igui/XtuCCy5Yadi4zTbbRGWZknz55Zfq2gTHZjXi9ttvz6688sq8Ebj77ruzt99+W12TMJUK7Y8//lCXvAG/+eabG/ee30wttTEdeeONN7JbbrmlcU73339/9uGHH6prEqYjHL+wKvcw5LvvvstHSZwrsQrOg/vy1ltvqWsp4TmkzoN7xrr6tddem51//vnZFVdckT3++OPZTz/9pK4do6ui/uSTT6LKiB133HHqmt17771mb3TXXXepa4PzzjsvF0Yxv1Ibc8wxs8UWWyy/kVWYY445soknnrjJGDq3QstgVPCQc845Jzo/piNff/11k5/y2WefZaONNlpUdp999lHXBpShIbBWEQqbddZZs8MOO6xljGPqqafOz7MwVjYIZsJTTz2V31899lJLLRXFC/BdY4018mU59S9suummy0499dSmcsp1112XTTDBBE021VRTZZ9++qm6RlDHaFyt+1nYLLPMks/RWz0X2GOPPZrOg9FY0ZjRSTFtTD0D6ib3KdX49YauipoHa80FCXToxXAD1I8bZSUVMMccOnRo5F9mjBqsY4Ugai139tlnq1uElsG0ISHyb1Wm0047rclPeeCBB6IyGCMTC6Ywk08+eeSfMkRZFoScYoopmvyppDTW9DaTTDJJdDyMYGcIgh5nnHEiv5SxFp0SlTVFoxGlIStj1113NTuNlNHotWooOKaWI2b0yy+/ZMstt1z0nWUrrbRSo5HsFF0VNRx99NHRhWBfffVVw+fFF1+MvsdWXXXV4Ej/g+HfCiusEPlWsU022aS0Z+qmqIHKp36tItjHHntsVAazKjFDWPWrYqzxaiNboKJGnAxT9RihnXHGGY3yVFh6UvVpZayeWLQraobEjAy1TBWjQyqbFliiprFbfPHFo8/LbMSIEXroXtF1USNeTevDTj755IbP5ptvHn0/1lhj5XOvEFrOsuEblQdhlvVU8803X97TW3Rb1Msuu2zkh6WgAZphhhkif5bIlAcffDAfHqsvIlx66aWzHXbYIdt2222zRRddNL+36qe9a4GKmqnOyiuvHJUPjUYaGAFMOeWU0fcYw+BDDjkkO/DAA7OFFlrIHMUceuihcjbtiRpBb7rpppF/WG6uuebKlxf1u8LI2nv55Zf10DmWqGmk9VoYaqemiIUx7+4U6RrVQU488cToIhhaE0RgiG6Jnl5V2WWXXSI/jGFgOIdFDLR+/Ib6YieccEJw1P/otqhJkFA/7Mcff1TXHII56otxH0IICFqVhvnwM8880+QLxCl0KEoFt4JgKmo1joMPc1EMEfz88895WYbd+jtU+M0220x+JcsOPvjg6Bo4lk6Z2hE1gSn1xWjoWHIN7/sTTzyRTwvVF0P0FpaoQ0Pg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>

[image2]: <data:image/png;base64,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>