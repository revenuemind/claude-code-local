# Template library

The studio ships **50 starter templates** (10 per category). Each one is pure data, validated by `src/lib/templates/schema.ts` and interpreted by the Template Engine (`src/lib/templates/engine.ts`). Every template:

- has a live preview (the card and detail player run the real renderer on the template's sample content),
- has its name and description in English, Hebrew, Russian, Arabic and Amharic,
- builds valid plans and timelines in every supported aspect and production mode (enforced by `tests/templates.test.ts`),
- supports editable text, scenes, duration, aspect ratio, colors and typography (style presets + brands), logo, voice, music, AI engine choice per scene, media replacement, captions, transitions and effects (in the editor), saving as a custom template, duplication and JSON export.

## How a template works

```
TemplateDefinition (data)
  fields[]      what the user fills in (text, textarea, list…)
  scenes[]      blueprints: layout + text with placeholders + media slot + weight (+ repeat per list item, + `then` sub-scenes)
  style         one of 14 style presets (palette, fonts, motion, background, captions, transitions)
  music         mood + BPM for the procedural bed or AI music prompt
        │  draftPlan()  — offline planner or LLM planner (same output shape)
        ▼
ProductionPlan  scenes with headline/body/narration/visual prompts/durations/media modes (user-editable, approvable)
        │  buildComposition()  — layouts position and animate clips; brand + language fonts applied
        ▼
Composition     editable multi-track timeline → preview / export
```

Placeholders: `{{field}}`, `{{item.title}}`, `{{item.body}}` (list items, written as `Title — body`), `{{n}}` (1…N), `{{rank}}` (N…1), `{{count}}`, `{{t:phrase}}` (localized connective phrase from `phrases.ts`), and `{{a|fallback}}`.

Layouts (`src/lib/templates/layouts.ts`): title, statement, list-item, number-stat, split-compare, media-full, media-card, quote, lower-third, product-hero, cta, chapter, talking-head, checklist, timeline-step, news, testimonial, price-offer. Every layout adapts to vertical, landscape and square canvases, mirrors for RTL, and reserves a caption band when captions are on.

## Adding templates

- **In the app**: Templates → New template (or Duplicate on any template) opens the Template Editor, which has a form mode, a JSON mode, a live preview and validation. Templates are saved per organization as drafts or published. Platform admins can publish platform-wide templates through the API.
- **Import/export**: the JSON format is `{ "format": "ai-creator-studio/template", "formatVersion": 1, "template": { … } }`.
- **Built-in**: append a `T({...})` entry in `src/lib/templates/library.ts`. The test suite then validates it, renders it in every aspect, and checks that all 5 languages are present.

A marketplace for sharing and selling templates is planned. The schema already includes `visibility` (`private | org | platform | marketplace`).

## Catalog

### Social media & viral

| # | ID | Name | Layouts | Duration | Formats | Modes (recommended) | Needs |
|---|---|---|---|---|---|---|---|
| 1 | `viral-hook` | Viral Hook | statement, cta | 10–45s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended |
| 2 | `top-5-countdown` | Top 5 Countdown | title, list-item, cta | 20–60s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended; aiImages: recommended |
| 3 | `did-you-know` | Did You Know? | title, number-stat, media-card, cta | 10–30s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (code) | — |
| 4 | `three-things` | Three Things You Didn't Know | statement, list-item, cta | 15–40s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended |
| 5 | `myth-vs-reality` | Myth vs Reality | statement, split-compare, cta | 15–50s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (code) | — |
| 6 | `before-after` | Before and After | statement, split-compare, checklist, cta | 15–45s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | userMedia: recommended |
| 7 | `problem-solution` | Problem and Solution | media-full, statement, checklist, cta | 15–45s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended; aiImages: recommended |
| 8 | `storytime` | Storytime | statement, media-full, quote, cta | 20–90s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 9 | `unpopular-opinion` | Unpopular Opinion | statement, list-item, cta | 15–45s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (code) | — |
| 10 | `quick-tutorial` | Quick Tutorial | title, timeline-step, statement, cta | 15–60s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended; userMedia: recommended |

### Marketing & advertising

| # | ID | Name | Layouts | Duration | Formats | Modes (recommended) | Needs |
|---|---|---|---|---|---|---|---|
| 1 | `product-commercial` | Product Commercial | product-hero, media-card, cta | 15–60s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended; aiImages: recommended; userMedia: recommended |
| 2 | `cinematic-product` | Cinematic Product Showcase | media-full, product-hero, cta | 15–60s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (ai) | aiVideo: recommended |
| 3 | `ugc-ad` | UGC-Style Advertisement | talking-head, media-card, cta | 15–45s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: required; userMedia: recommended |
| 4 | `customer-testimonial` | Customer Testimonial | statement, testimonial, number-stat, cta | 15–45s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (code) | — |
| 5 | `product-benefits` | Product Benefits | product-hero, checklist, cta | 12–40s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | aiImages: recommended |
| 6 | `problem-solution-sales` | Problem-Solution-Sales | statement, media-full, product-hero, checklist, price-offer, cta | 20–60s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 7 | `luxury-commercial` | Luxury Brand Commercial | chapter, media-full, quote, cta | 15–60s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (ai) | aiVideo: recommended |
| 8 | `flash-sale` | Flash Sale Advertisement | statement, price-offer, product-hero, cta | 8–25s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (code) | — |
| 9 | `service-promotion` | Service Promotion | title, media-card, checklist, cta | 15–45s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended; aiImages: recommended |
| 10 | `direct-response` | Direct Response Advertisement | statement, split-compare, checklist, price-offer, cta | 15–45s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: required |

### YouTube long-form

| # | ID | Name | Layouts | Duration | Formats | Modes (recommended) | Needs |
|---|---|---|---|---|---|---|---|
| 1 | `documentary` | Documentary | title, chapter, media-full, quote, cta | 90–1200s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 2 | `mini-documentary` | Mini Documentary | media-full, quote, cta | 60–300s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 3 | `explainer` | Explainer Video | title, statement, media-card, quote, cta | 45–600s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 4 | `educational-episode` | Educational Episode | chapter, timeline-step, checklist, statement, cta | 60–900s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required |
| 5 | `investigative-story` | Investigative Story | news, media-full, statement, quote, cta | 90–1200s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 6 | `historical-story` | Historical Story | chapter, timeline-step, media-full, quote, cta | 60–1200s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 7 | `business-case-study` | Business Case Study | title, media-card, timeline-step, number-stat, quote, cta | 60–900s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required |
| 8 | `top-10-countdown` | Top 10 Countdown | title, list-item, cta | 90–900s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 9 | `deep-dive` | Deep-Dive Analysis | title, statement, chapter, media-card, split-compare, quote, cta | 120–1800s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 10 | `narrative-storytelling` | Narrative Storytelling | title, chapter, media-full, quote, cta | 60–1200s | 16:9 9:16 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |

### Faceless & automated channels

| # | ID | Name | Layouts | Duration | Formats | Modes (recommended) | Needs |
|---|---|---|---|---|---|---|---|
| 1 | `motivational` | Motivational Video | statement, cta | 15–90s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended |
| 2 | `interesting-facts` | Interesting Facts | title, media-card, cta | 20–90s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended; aiImages: recommended |
| 3 | `finance-explainer` | Finance Explainer | statement, number-stat, list-item, cta | 20–120s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (code) | voiceover: recommended |
| 4 | `technology-news` | Technology News | title, news, cta | 20–180s | 9:16 16:9 1:1 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 5 | `ai-news` | AI News | statement, news, cta | 20–180s | 9:16 16:9 1:1 | code/ai/hybrid (hybrid) | voiceover: required |
| 6 | `luxury-lifestyle` | Luxury Lifestyle | media-full, quote | 15–60s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (ai) | aiVideo: recommended |
| 7 | `travel-stories` | Travel Stories | title, media-full, quote, cta | 20–180s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended; aiImages: recommended |
| 8 | `true-story` | True Story Narration | statement, media-full, cta | 30–180s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 9 | `inspirational-quotes` | Inspirational Quotes | quote, cta | 15–90s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (code) | — |
| 10 | `animated-educational` | Animated Educational Content | title, list-item, number-stat, checklist, cta | 20–180s | 9:16 1:1 4:5 16:9 | code/hybrid (code) | — |

### AI influencers & characters

| # | ID | Name | Layouts | Duration | Formats | Modes (recommended) | Needs |
|---|---|---|---|---|---|---|---|
| 1 | `ai-influencer-talking` | AI Influencer Talking to Camera | talking-head, cta | 15–90s | 9:16 1:1 4:5 16:9 | ai/hybrid (ai) | voiceover: required; avatar: required |
| 2 | `ai-lifestyle-vlog` | AI Lifestyle Vlog | talking-head, media-full | 20–120s | 9:16 1:1 4:5 16:9 | ai/hybrid (ai) | voiceover: required; aiVideo: recommended |
| 3 | `ai-product-review` | AI Product Review | talking-head, product-hero, checklist, split-compare, number-stat, cta | 20–120s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 4 | `ai-fashion-showcase` | AI Fashion Showcase | statement, lower-third, cta | 15–60s | 9:16 1:1 4:5 16:9 | ai/hybrid (ai) | aiVideo: recommended |
| 5 | `ai-podcast` | AI Podcast | chapter, lower-third, talking-head, quote, cta | 60–1800s | 16:9 9:16 1:1 | ai/hybrid (ai) | voiceover: required; avatar: required |
| 6 | `ai-interview` | AI Interview | lower-third, statement, talking-head, cta | 30–600s | 9:16 1:1 4:5 16:9 | ai/hybrid (ai) | voiceover: required; avatar: required |
| 7 | `ai-character-story` | AI Character Story | title, talking-head, media-full, quote, cta | 20–180s | 9:16 1:1 4:5 16:9 | ai/hybrid (hybrid) | voiceover: required; aiImages: recommended |
| 8 | `virtual-brand-ambassador` | Virtual Brand Ambassador | talking-head, product-hero, checklist, cta | 15–90s | 9:16 1:1 4:5 16:9 | ai/hybrid (ai) | voiceover: required; avatar: required |
| 9 | `character-storytelling` | Character-Based Storytelling | chapter, media-card, statement, cta | 20–300s | 9:16 1:1 4:5 16:9 | code/ai/hybrid (hybrid) | voiceover: recommended; aiImages: recommended |
| 10 | `influencer-commercial` | Multi-Scene AI Influencer Commercial | talking-head, media-full, product-hero, price-offer | 20–60s | 9:16 1:1 4:5 16:9 | ai/hybrid (hybrid) | voiceover: required; avatar: required; aiVideo: recommended |

