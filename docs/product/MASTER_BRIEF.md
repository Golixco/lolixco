# LOLIXCO — MASTER HOMEPAGE UI IMPLEMENTATION PROMPT

**Version:** 1.0  
**Project:** Lolixco by Golixco  
**Repository:** https://github.com/GolixcoAI/lolixco  
**Target:** Production-quality responsive homepage UI  
**Design references:** Approved guest homepage, logged-in homepage, and Lolixco brand images  
**Implementation phase:** Frontend foundation and interactive prototype  
**Primary viewport reference:** 1672 × 941 pixels

---

# 1. YOUR ROLE AND PRIMARY OBJECTIVE

You are the lead frontend engineer, UI architect, and interaction designer responsible for implementing the official Lolixco website.

Your task is to build a polished, responsive, production-quality **Lolixco homepage** from the supplied visual references and this specification.

Lolixco is a video-discovery platform for creative edits involving anime, movies, television, gaming, music, and editing culture.

The desired result combines:

- The familiar usability of a professional video platform.
- A dark, cinematic streaming experience.
- A distinctive black, white, charcoal, and neon-yellow brand.
- Responsive, adaptive video grids.
- Smooth, intentional micro-interactions.
- A high-quality video player with segment-loop controls.
- Clearly differentiated guest and authenticated states.

**Do not produce a generic video-streaming template.**

The final frontend should closely match the approved references while implementing the interactions and responsive behaviors described here.

Preserve the visual composition, spacing hierarchy, restraint, dark surfaces, premium appearance, and selective neon highlighting.

## Before writing code

1. Inspect the repository and its current files.
2. Inspect every attached homepage and logo reference.
3. Read existing project documentation.
4. Determine whether any application structure already exists.
5. Identify missing visual assets and state your assumptions.
6. Present a concise implementation plan.
7. Implement the agreed frontend scope.
8. Run available checks and review the visual results.

Do not unnecessarily migrate frameworks, add databases, introduce paid infrastructure, or deploy anything.

---

# 2. VISUAL REFERENCES AND SOURCE OF TRUTH

The approved references are:

**Reference A — Guest Homepage**

Target: the latest dark Lolixco homepage screenshot showing Sign In / Sign Up, the featured video, Up Next, Popular Right Now, the Immersion banner, Trending Edits, and the left navigation.

**Reference B — Logged-In Homepage**

Target: the latest homepage screenshot showing the same core layout but replacing authentication buttons with Create, notifications, and a circular profile avatar with a neon-yellow border.

**Reference C — Lolixco Wordmark**

The provided custom LOLIXCO wordmark with a geometric white L, yellow play symbol, and angular futuristic lettering.

**Reference D — Lolixco Icon**

The rounded black logo containing the white L and integrated yellow play triangle, surrounded by a subtle yellow glow.

The reference image files should be made accessible to the coding environment under:

- `docs/product/references/home-feed/guest-desktop-v1.png`
- `docs/product/references/home-feed/member-desktop-v1.png`
- `docs/product/references/brand/lolixco-wordmark-reference.png`
- `docs/product/references/brand/lolixco-icon-reference.png`

These are intended destination paths. If the assets are not present, request them rather than pretending they exist.

**Reference priority:**

1. This prompt and the latest explicit product decisions.
2. Latest guest and logged-in screenshots.
3. Approved brand/logo references.
4. Existing product documentation.
5. Your engineering judgment for unspecified implementation details.

The screenshots are visual targets. They are not proof of functional features, animation timings, authentication infrastructure, or real content data.

Do not recreate the entire interface as a background image. Implement actual responsive components.

Do not crop full-page mockups into artificial UI components.

---

# 3. NON-NEGOTIABLE PRODUCT DECISIONS

Implement these requirements even if an older reference image suggests otherwise.

1. Guests can watch **unlimited edits**.
2. Never display a guest viewing counter or three-edit limit.
3. Never interrupt video playback to force registration.
4. Remove promotional signup cards such as "Join Lolixco" and "Why Join?" from the homepage.
5. Do not place analytics, Saved, Queue, or Library summary cards beside the featured video.
6. Preserve intentional empty space on the right of the top content area. Do not invent extra cards to occupy it.
7. The Create button appears **only after login**.
8. Before login, the header displays Sign In and Sign Up.
9. After login, the header displays Create, notifications, and a profile avatar.
10. The authenticated avatar must have a thin, luminous neon-yellow circular border.
11. The search placeholder is exactly **"Search"**, not a long descriptive sentence.
12. Remove all "View All" buttons and links from homepage content sections.
13. Users should naturally scroll vertically to discover further content.
14. Add **Shorts** to the main navigation menu.
15. Keep Immersion Mode in the sidebar and its dedicated homepage banner, but remove it from the top category chips.
16. Do not add motivational slogans, unnecessary quotes, or generic inspirational promotional text.
17. The featured video starts muted when autoplay is permitted.
18. The video progress indicator must be neon yellow with a moving circular playhead.
19. Implement an A–B loop control that allows a viewer to repeatedly play a selected segment.
20. All video containers must use rounded rectangular corners.
21. Use visual assets the project is authorized to display.
22. Do not treat fictional creator names, statistics, verification badges, or video content in reference images as real platform data.

These are requirements, not optional suggestions.

---

# 4. RECOMMENDED FRONTEND FOUNDATION

Because Lolixco currently has no established application architecture, use a small, maintainable frontend stack.

Recommended starting point:

- React
- Vite
- TypeScript
- Tailwind CSS
- Motion for React for selected interactions
- Lucide React for standard UI icons
- Native HTML5 video playback

Do not introduce Redux, Zustand, a large component library, or a custom backend unless the implementation clearly justifies the dependency.

Use React state and context for initial sidebar, theme, video, and authentication-preview state.

Separate visual components from mock content data.

Organize code approximately as follows, adapting to existing project conventions if needed:

- `src/components/layout/` — Header, Sidebar, AppShell
- `src/components/home/` — FeaturedEdit, UpNext, CategoryBar, ContentSection
- `src/components/video/` — VideoCard, VideoPlayer, VideoControls, ABLoopControls
- `src/components/auth/` — AuthDialog, ProfileAvatar
- `src/components/ui/` — Button, Tooltip, IconButton, Skeleton
- `src/features/feed/` — feed data and selectors
- `src/hooks/` — reusable interaction hooks
- `src/data/` — typed demonstration metadata
- `src/styles/` — tokens and shared styles
- `docs/product/` — specifications and visual references

Use semantic naming and readable source code.

Avoid one enormous component containing the entire homepage.

---

# 5. GLOBAL LOLIXCO DESIGN SYSTEM

## 5.1 Color palette

Use the screenshot palette as the visual target.

Provisional design tokens:

| Token | Approximate value | Usage |
|---|---|---|
| Background | `#050505` | Primary application background |
| Surface | `#0B0D10` | Cards, panels, navigation |
| Elevated surface | `#15171D` | Hovered panels and menus |
| Primary text | `#F8F9FA` | Headings and important labels |
| Secondary text | `#9CA3AF` | Creator details and metadata |
| Border | `#272B33` | Thin, restrained outlines |
| Neon yellow | `#FFF000` | Primary action and selected states |
| Neon glow | Yellow with low alpha | Special emphasis |
| Inactive progress | `#373C46` | Video track backgrounds |

These values are starting points. Refine them visually against the supplied references rather than treating them as exact sampled colors.

## 5.2 Yellow usage

Neon yellow is the distinctive Lolixco accent.

Use it for:

- Active navigation.
- Primary buttons.
- Selected category chips.
- Video progress and playhead.
- Selected loop segments.
- Active controls.
- Authenticated profile-avatar ring.
- The Immersion banner border.
- Carefully selected icons and emphasis.

Do not make every component glow.

Excessive glow reduces visual hierarchy and makes the product appear less refined.

Reserve stronger glows for important interactions.

## 5.3 Typography

The interface should have the readability and consistency of a major technology product.

Use appropriately licensed, open-source fonts.

Recommended:

- **Inter or Manrope** for interface labels, metadata, menus, descriptions, and body text.
- **Rajdhani or a similarly licensed condensed geometric display font** for prominent editorial video titles.

The custom LOLIXCO wordmark is a separate brand asset.

Do not attempt to reproduce it by choosing a similar typeface and pretending it is the official logo.

Do not import proprietary fonts such as YouTube Sans, Google Sans, Netflix Sans, or other privately licensed brand typefaces without explicit permission.

Suggested hierarchy:

- Featured title: approximately 40–48px on reference desktop.
- Section headings: 18–22px, semibold.
- Navigation labels: 13–14px.
- Video card titles: 13–15px, medium/semibold.
- Creator metadata: 11–13px.
- Button labels: 13–14px, medium/semibold.

Keep typography compact, legible, and consistent.

## 5.4 Geometry

- Video thumbnails: 16:9 by default.
- Rounded video containers: approximately 8–12px.
- Primary buttons: approximately 8–12px rounded corners.
- Category chips: approximately 8–10px rounded corners.
- Panels: subtle 1px outlines.
- Layout dividers: low-contrast lines.
- Minimal shadows on standard content cards.
- Stronger glow only on specially selected features.

Never distort video artwork to force a fixed width or height.

Use `object-fit: cover` for thumbnails and appropriate contain/cover behavior for video playback.

---

# 6. LOGO AND BRAND ASSET HANDLING

**Do not generate a replacement Lolixco logo.**

The official wordmark and icon will be uploaded separately, preferably in SVG format.

Reserve the correct space for the official assets.

Desktop header logo area:

- Left aligned after the hamburger.
- Approximately 200–230px wide where the viewport permits.
- Height approximately 32–40px.
- Centered vertically.
- Preserve aspect ratio.
- No stretched or distorted images.

Create replaceable brand components such as `BrandLogo` and `BrandIcon`.

When the official assets become available, replacement should require only changing the asset source, not rebuilding the header.

Until then, use a neutral accessible text fallback reading "Lolixco" or an explicitly labeled temporary development placeholder.

Do not invent a different play symbol or custom wordmark.

### Icon design consistency

All small interface icons should share consistent:

- Stroke thickness.
- Optical size.
- Alignment.
- Corner treatment.
- Hover states.
- Color hierarchy.

Use Lucide icons as a foundation where appropriate.

Standard UI icons should feel compatible with the angular, futuristic Lolixco brand rather than being a random mix of icon packs.

Do not recreate protected third-party logos or copy the official Lolixco mark from an unapproved approximation.

---

# 7. APPLICATION SHELL AND RESPONSIVE SIDEBAR

The homepage has a fixed/sticky top header, a left navigation sidebar, and a flexible main content area.

The main content must automatically adapt to the sidebar's width.

## 7.1 Desktop sidebar

In the 1672px reference, the sidebar is compact rather than excessively wide.

Use an expanded width around 150–180px as an initial visual target.

Use a collapsed icon-only width around 68–76px.

Adjust these values against the actual reference image and responsive behavior.

The sidebar should contain, in order:

**Primary navigation:**

1. Home
2. Shorts
3. Explore
4. Following

Divider.

**Personal and creator tools:**

5. Library
6. Creator Studio
7. Immersion

Near the bottom:

8. Settings
9. Help

The sidebar background should remain nearly black, with thin separators and consistent icon alignment.

## 7.2 Hamburger toggle

The three-line icon controls whether the sidebar is expanded or collapsed.

When activated:

- The hamburger's background becomes a softly illuminated neon-yellow rounded rectangle.
- The active state should clearly communicate that the expanded navigation is being shown.
- The background should not be an excessively bright solid slab.
- Sidebar labels animate into or out of view.
- The main content changes width smoothly.
- Video grids reflow automatically.
- The header remains stable.
- The selected navigation destination retains its own active indicator.

Use a transition around 240–300ms with a smooth ease-in-out curve.

Respect reduced-motion preferences.

Expose correct `aria-expanded`, `aria-controls`, and accessible button labels.

## 7.3 Sidebar item states

Default:

- White/gray icon.
- White/gray label.
- Transparent background.

Hover:

- Slightly brighter icon and label.
- Subtle surface highlight.
- Smooth transition.

Selected:

- Neon-yellow icon and label or high-contrast selected treatment.
- Rounded rectangular yellow-tinted background.
- Thin yellow leading accent where appropriate.

Disabled/unavailable:

- Clearly communicate the state.
- Do not create misleading working-looking destinations.

The active Home state should match the reference.

## 7.4 Sidebar behavior on mobile

Do not force the full desktop sidebar onto narrow devices.

Use a mobile drawer or compact navigation appropriate to the viewport.

The mobile drawer must:

- Open using the hamburger.
- Close using the toggle, Escape, or an accessible dismissal method.
- Avoid trapping users behind content.
- Provide keyboard focus management.
- Preserve scrolling correctly.
- Use accessible tap targets.

---

# 8. TOP NAVIGATION HEADER

Target approximately 56–64px height on desktop.

The header must remain visually stable while scrolling.

Use a subtle bottom border to distinguish it from the body.

## 8.1 Left group

- Hamburger toggle.
- Reserved Lolixco wordmark slot.
- Appropriate gap between controls.

## 8.2 Center group

A wide, rounded rectangular search field.

The placeholder must be exactly:

**Search**

No long explanatory placeholder.

Use:

- Search icon on the left.
- Thin border.
- Dark surface.
- White text.
- Muted placeholder.
- Subtle yellow focus treatment.

The field should expand or contract responsively without overlapping header actions.

## 8.3 Guest header

The guest header must show:

- Search.
- Sign In.
- Sign Up.

Sign In:

- Dark background.
- Thin restrained outline.
- White label.
- Subtle hover brightness.

Sign Up:

- Neon-yellow background.
- Black text.
- Stronger primary-action hierarchy.

**Do not display Create to guests.**

No additional guest signup cards should appear beside the homepage hero.

## 8.4 Authenticated header

After login, replace Sign In and Sign Up with:

- Create button with yellow plus icon.
- Notification bell.
- Circular user profile picture.

The profile image must have:

- A thin neon-yellow circular border.
- A restrained soft glow.
- Correct image aspect ratio.
- A clean hover and focus state.

Suggested avatar size: approximately 40–46px.

Do not display username, followers, analytics, Saved, Queue, upload statistics, or user dashboards directly in the homepage header or right-side hero area.

These belong in their respective destinations.

The profile avatar may open an accessible dropdown containing Profile, Settings, and Sign Out when those actions are supported.

Do not display fictional notification counts.

---

# 9. CATEGORY AND DISCOVERY CHIPS

Immediately below the header, render the horizontal category navigation.

The approved categories are:

- Featured
- Trending
- Anime
- Movies
- Series
- Gaming
- Phonk
- Cinematic
- New

**Do not add Immersion to this row.**

Shorts belongs in the sidebar.

## Visual design

Each category has:

- A small consistent icon.
- Label.
- Dark rounded background.
- Thin border.
- Even internal padding.
- Approximately 34–40px height.

Selected Featured state:

- Neon-yellow background.
- Dark icon and text.
- Appropriate visual emphasis.

Inactive chips:

- Dark surface.
- White icon and text.
- Subtle border.
- Brighten slightly on hover.

On narrow devices, allow horizontal scrolling with no visible bulky scrollbar.

Do not wrap the chips into a large multirow block.

## Functionality

Selecting a category should filter or switch the displayed mock feed using real local state.

Use a clear active indicator.

If a category has no available sample content, display a meaningful empty state instead of silently showing unrelated videos.

The chips should be keyboard accessible.

---

# 10. HOMEPAGE CONTENT COMPOSITION

At the 1672 × 941 desktop reference viewport, reproduce the major structure:

1. Fixed header.
2. Left navigation.
3. Horizontal category chips.
4. Large featured edit.
5. Up Next list beside the featured edit.
6. Popular Right Now.
7. Immersion Mode banner.
8. Trending Edits.
9. Additional content continuing down the page.

The reference's first viewport is dense but carefully organized.

Avoid unnecessarily large margins or excessive vertical whitespace.

The main content starts immediately to the right of the sidebar.

Use approximately 12–20px gaps between standard sections and components, adjusting for visual accuracy.

## Featured row proportions

On the reference desktop viewport:

- Featured edit begins around x = 178px and y = 120px.
- Its visible width is approximately 875px.
- Its visible height is approximately 370px.
- Up Next begins slightly to its right with a gap around 18–24px.
- Up Next is approximately 320–350px wide.
- The remaining right-side area stays visually empty.

Treat these measurements as visual guides, not absolute positioning rules.

Use CSS Grid/Flexbox rather than fixed left/top pixel coordinates.

The featured row may have a controlled maximum width so that the right-side negative space remains intentional on large screens.

Do not fill the remaining area with promotional panels.

---

# 11. FEATURED EDIT PLAYER

This is the primary focal point of the homepage.

Create a premium cinematic player with a wide video thumbnail and elegant overlaid information.

## Visual composition

- Wide rounded rectangular player.
- Original or authorized cinematic artwork.
- Dark gradient overlay, especially toward the bottom and left.
- Minimal surrounding border.
- Clean typography.
- Strong but restrained yellow highlights.

### Information overlay

Display:

- "EDIT OF THE MOMENT" badge.
- Video title.
- Creator avatar.
- Creator handle.
- Actual or clearly identified sample metadata.
- Yellow Watch Now button.

Do not add inspirational quotes or marketing taglines.

If a short description is needed, use factual video metadata rather than a generic motivational slogan.

### Video playback behavior

- Attempt muted autoplay where supported and appropriate.
- Set `playsInline`.
- Respect reduced-motion and reduced-data preferences.
- Do not unexpectedly play audio.
- Allow manual mute/unmute.
- Provide a poster fallback.
- Pause or reduce unnecessary playback when offscreen.
- Handle unavailable videos gracefully.
- Display loading and buffering feedback without blocking the layout.

The UI should not show a fake running progress bar on an image-only mock if no video is playing.

---

# 12. PROFESSIONAL VIDEO PLAYER CONTROLS

The player must feel familiar to users of major video platforms but retain Lolixco's own styling.

## 12.1 Playback timeline

Use a thin horizontal seek bar.

Inactive track:

- Dark gray.

Played portion:

- Neon yellow.

Playhead:

- Small bright yellow circular dot.

The playhead must move smoothly from left to right as the video plays.

The timeline must correctly represent the video duration.

Allow seeking by clicking/tapping or dragging the playhead.

Where browser support permits, expose buffered ranges with subtle visual differentiation.

## 12.2 Control arrangement

Left side:

- Play/Pause.
- Mute/Unmute.
- Current time / total duration.

Right side:

- A–B Loop control.
- Settings / Quality.
- Captions, only when available.
- Fullscreen.
- Optional picture-in-picture if supported.

Use consistent iconography.

The controls should have dark translucent surfaces, readable contrast, useful tooltips, and accessible labels.

## 12.3 Control visibility

For pointer devices:

- Controls may fade in on hover or pointer movement.
- Controls should remain visible while paused, focused, or menus are open.
- Do not hide controls while the user is interacting with them.

For touch devices:

- Show controls on tap.
- Provide sufficient tap targets.
- Avoid tiny, difficult-to-use controls.

Do not sacrifice usability merely to imitate a cinematic screenshot.

---

# 13. A–B SEGMENT LOOPING — IMPORTANT LOLIXCO FEATURE

Implement a selectable video-section replay feature.

This feature must allow a viewer to mark two points in a video and repeatedly play only the selected segment.

Call the feature:

**A–B Loop**

## 13.1 Interaction flow

1. User opens a video.
2. User activates the A–B Loop control.
3. A small player popover or menu appears.
4. User chooses "Set Start (A)" at the current playback position.
5. A yellow marker appears on the timeline.
6. User seeks to another point.
7. User chooses "Set End (B)".
8. A second marker appears.
9. The area between A and B becomes visibly highlighted.
10. User selects "Loop Segment" or enables the loop toggle.
11. Playback repeats between A and B.
12. User can adjust either point.
13. User can clear the selection.
14. User can exit looping and return to normal playback.

## 13.2 Visual treatment

- Normal playhead remains a moving yellow circular dot.
- Start A and End B are distinct selectable timeline markers.
- Highlight the selected region in a stronger yellow tint.
- Dim the unselected portions of the timeline slightly when loop mode is active.
- Provide subtle A/B labels or accessible tooltips.
- Keep the interface compact and consistent with the video player.

The two selected dots are not the same as the current playback playhead.

## 13.3 Functional constraints

- Require valid loaded video metadata.
- Enforce A earlier than B.
- Prevent zero-length or invalid loop selections.
- Clamp positions within video duration.
- Provide a useful minimum loop duration.
- When playback reaches B, seek back to A.
- Ensure repeated seeking does not create an uncontrolled event loop.
- Reset markers appropriately when changing to a different video.
- Handle manually seeking outside the loop.
- Handle pausing and resuming during an active loop.
- Make the control usable with keyboard and touch input.

Aim for reliable browser playback, but do not promise frame-perfect looping when the browser/media pipeline cannot guarantee it.

This feature should work locally with permitted test video files. It does not require a backend.

Use suitable React state or a small reusable hook so the player logic remains understandable.

---

# 14. YOUTUBE-STYLE VIDEO QUALITY SELECTION

Provide a settings/quality interaction inspired by familiar video players.

The user should be able to inspect and, when multiple encoded sources exist, select a video resolution.

Possible labels:

- Auto
- 144p
- 240p
- 360p
- 480p
- 720p HD
- 1080p HD
- 1440p
- 2160p / 4K

**Only display options supported by the actual video source or stream.**

Do not create fake 4K buttons when the asset is only available in one resolution.

If a video has only one quality, show the real source quality when determinable or omit unnecessary choices.

If adaptive streaming is eventually supported using HLS/DASH, provide an Auto quality option that reflects real capabilities.

For the initial frontend prototype:

- Native MP4 playback is sufficient.
- Multiple provided sources may be used to demonstrate quality switching.
- Do not build a media-transcoding backend.
- Do not introduce cloud encoding services.
- Do not claim adaptive streaming exists without implementation.

When switching sources, preserve playback time and relevant player state where technically feasible.

---

# 15. UP NEXT — RECOMMENDED EDITS

Place the Up Next list immediately beside the featured player on desktop.

The reference contains approximately four vertically arranged suggestions.

Each suggestion includes:

- 16:9 thumbnail.
- Duration badge.
- Title.
- Creator handle.
- Relevant metadata when genuine or explicitly marked as sample data.

Use a compact, professional layout.

The thumbnails should have rounded corners and subtle borders.

On hover:

- Slight image brightness increase.
- Subtle border highlight.
- Title remains readable.

When clicked:

- Open or load the selected edit.
- Update the selected video information.
- Reset A–B loop markers for the new media.

Do not show a "View All" link.

Do not add signup cards to the right.

For the first Preview, Up Next can use curated sample metadata instead of a recommendation AI.

---

# 16. VIDEO CONTENT SECTIONS AND SCROLLING

The homepage should support natural vertical discovery.

Implement the visible reference sections:

**Popular Right Now**

A responsive grid of video cards.

**Immersion Mode**

A distinctive wide feature banner between content sections.

**Trending Edits**

Another responsive grid of video cards.

As the user scrolls farther, additional appropriately named content groups can load or appear when they are backed by actual sample data.

Do not invent irrelevant sections merely to fill space.

## 16.1 Video card design

Each card should include:

- Rounded 16:9 thumbnail.
- Duration badge at lower-right.
- Video title below thumbnail.
- Creator name/handle.
- Optional verified indicator only when meaningful.
- Legitimate metadata.

The reference uses compact cards with thin dark borders.

Cards should sit directly in the page layout rather than each occupying a heavy dashboard panel.

## 16.2 Hover interactions

On hover:

- Gently brighten the thumbnail.
- Optionally zoom the artwork by approximately 1.02–1.035.
- Maintain clipping inside rounded borders.
- Add a restrained yellow-tinted border or highlight where appropriate.
- Avoid oversized shadows or aggressive scaling.

Transitions should generally complete in approximately 160–240ms.

On keyboard focus, offer equivalent visual emphasis.

## 16.3 Natural scrolling

Do not add "View All" actions to every row.

Users should scroll vertically through the homepage and discover further content sections.

Use lazy image loading, appropriate content loading states, and controlled pagination or progressive content loading when necessary.

Avoid loading an unlimited number of video elements simultaneously.

---

# 17. RESPONSIVE VIDEO GRID AND SIDEBAR REFLOW

Use CSS Grid and flexible application layout mechanics.

The content should reflow naturally when the sidebar changes width.

Do not manually hardcode a fixed number of visible video columns for every desktop width.

Use auto-fit or auto-fill with `minmax()` where appropriate.

However, **the homepage and Explore page should not necessarily use the same minimum card width**.

The reference homepage displays approximately six compact cards across a wide desktop content area.

A blanket 300px minimum would often produce too few columns and fail to match the reference.

For the compact homepage rows, begin with a minimum card width around 190–220px and refine based on the screenshot.

For a larger Explore grid, a wider minimum around 260–300px may be more appropriate.

Use a width-safe responsive rule with a minimum bounded by the actual container width.

When the sidebar expands:

- Main content becomes narrower.
- The grid recalculates available columns.
- Card widths adapt gracefully.
- Gaps remain consistent.
- No horizontal page overflow occurs.

When the sidebar collapses:

- Main content expands.
- More columns may become visible when space allows.
- Cards resize or reflow smoothly.
- The layout does not flicker or jump.

Do not animate every grid item's width independently if it produces jank.

Prefer animating the sidebar/application-shell width and letting the grid reflow.

---

# 18. IMMERSION MODE BANNER

Preserve the distinct Immersion Mode banner from the reference.

The banner should have:

- Dark cinematic background.
- Thin neon-yellow outline.
- Restrained yellow glow.
- Original or authorized imagery.
- Heading "IMMERSION MODE".
- Short functional product explanation.
- Three compact feature descriptors.
- Yellow "Enter Immersion" call to action.

Feature descriptors may include:

- Adaptive Ambience.
- Non-Stop Edits.
- Build Your Queue.

Do not duplicate Immersion in the top category row.

Immersion remains accessible from the sidebar.

This is a planned advanced feature. The homepage banner may exist as a visual preview before its full player experience is developed.

Until implemented, the button must lead to an honest planned-feature or Preview state, not a fabricated working Immersion experience.

---

# 19. AUTHENTICATION STATE DIFFERENCES

Create two consistent frontend states:

**Guest mode**

- Home, Shorts, Explore, Following, Library, Creator Studio and Immersion navigation are visible where appropriate.
- Sign In and Sign Up appear in the header.
- Create is hidden.
- Guests may search, browse, and watch unlimited edits.
- No viewing counter.
- No forced registration.

**Authenticated preview mode**

- Same homepage feed layout.
- Create button appears.
- Notification bell appears.
- Profile avatar appears with neon-yellow ring.
- Sign In and Sign Up disappear.
- Personal actions can be represented through clearly identified prototype state.

Do not fabricate a real authentication session.

If authentication has not been integrated, use an explicitly labeled local development/demo-state mechanism to preview guest and member layouts.

Do not treat a query parameter or local UI toggle as secure authentication.

## Auth-gated destinations

Following, Library, and Creator Studio may be accessible visually from the guest sidebar.

When a guest activates an account-dependent function:

- Open a clear authentication dialog, or
- Display a purposeful sign-in-required state.

Never force login for ordinary video discovery or playback.

Do not create a fake account database or store passwords in browser storage.

---

# 20. SHORTS NAVIGATION

Add a Shorts destination in the sidebar.

Use an icon consistent with Lolixco's geometric visual identity.

For the homepage phase, implement the navigation affordance and a clear route/placeholder state if the Shorts experience is not yet built.

Do not silently substitute the ordinary desktop video feed and claim Shorts is complete.

When Shorts is implemented later, it should support portrait video, mobile-friendly interactions, and a separate layout specification.

---

# 21. SEARCH BEHAVIOR

The header search field must use the placeholder **Search**.

Initial searches should use available structured metadata:

- Video title.
- Tags.
- Hashtags.
- Description.
- Creator name/handle.
- Category or fandom/topic metadata.

For the initial frontend, local sample-data search is acceptable.

Expected interactions:

- Enter text to search.
- Display relevant matching results.
- Support clicking a result.
- Provide a clear empty state.
- Allow clearing the query.
- Maintain visible keyboard focus.
- Avoid showing false AI-powered search claims.

Do not add vector search, paid search services, or a recommendation backend during this UI task.

---

# 22. MICRO-INTERACTIONS AND MOTION

The interface should feel responsive and refined, not overly animated.

Recommended motion durations:

- Button hover: 120–180ms.
- Card hover: 160–220ms.
- Sidebar transition: 240–300ms.
- Menu/popover appearance: 140–220ms.
- Category selection: 160–220ms.
- Video control fade: approximately 180–260ms.
- Small notification indicators: brief and restrained.

Use smooth easing rather than abrupt linear animation for interactive surfaces.

## Specific interactions

**Buttons:** Slight brightness adjustment and subtle press response.

**Sidebar:** Smooth expansion/collapse with stable content.

**Categories:** Active highlight transitions without visual flashing.

**Video cards:** Controlled zoom/brightness and border emphasis.

**Profile avatar:** Subtle yellow glow on hover, with the base ring remaining visible.

**Search:** Gentle focus border highlight.

**Player controls:** Smooth visibility transitions.

**A–B loop markers:** Small state transitions that do not interfere with precise timeline positioning.

**Immersion banner:** Restrained highlight around the action button; avoid constant dramatic effects.

Respect `prefers-reduced-motion`.

Motion should never interfere with tapping, typing, seeking, or reading.

Avoid perpetual animation loops unless they serve an actual function.

---

# 23. RESPONSIVE LAYOUT REQUIREMENTS

Implement and test multiple viewport classes.

## Large desktop — approximately 1440–1920px

- Full header.
- Expanded sidebar by default where appropriate.
- Category row.
- Large featured edit.
- Up Next beside featured edit.
- Compact multicolumn content rows.
- Wide Immersion banner.
- Intentional negative space beside Up Next.

## Medium desktop / tablet landscape — approximately 1024–1439px

- Sidebar may collapse to icon-only.
- Featured edit and Up Next adapt to available width.
- Cards reduce the number of columns naturally.
- Search remains usable.
- Avoid tiny or compressed right-side panels.

## Tablet portrait — approximately 768–1023px

- Compact sidebar or drawer.
- Featured video becomes more prominent.
- Up Next may move beneath the featured player.
- Category chips scroll horizontally.
- Content grid typically fits fewer columns.
- Banner reorganizes without overflow.

## Mobile — approximately 320–767px

- Compact header.
- Accessible navigation drawer.
- Responsive logo/icon treatment.
- Search may expand on activation if necessary.
- Full-width featured player.
- Up Next positioned below rather than squeezed beside it.
- Video cards use one or two columns depending on actual available width.
- Category chips remain horizontally scrollable.
- Immersion banner stacks its content vertically.
- No overlapping actions.
- No horizontally clipped important information.

Avoid making desktop components simply scale down without restructuring.

Respect mobile safe areas, touch targets, and text legibility.

---

# 24. CONTENT, MEDIA AND COPYRIGHT RULES

The reference designs contain stylized anime-inspired artwork.

Treat that artwork as **visual direction**, not permission to reproduce copyrighted characters, film scenes, franchises, songs, logos, or protected media.

For the development prototype:

- Prefer original artwork.
- Use licensed or appropriately authorized media.
- Use consistent placeholder thumbnails if necessary.
- Preserve the reference's cinematic mood and color contrast.
- Avoid pretending fictional creators and statistics are real users.

Do not use recognizable copyrighted footage or commercial audio without authorization.

Do not build public uploads or media hosting infrastructure for this homepage phase.

If suitable sample videos are unavailable, explain the blocker and implement the player against clearly identified permitted test assets when provided.

---

# 25. ACCESSIBILITY AND INTERACTION QUALITY

The interface should support:

- Keyboard navigation.
- Visible focus indicators.
- Screen-reader labels.
- Sufficient contrast.
- Reduced-motion settings.
- Touch interaction.
- Predictable dialog behavior.
- Accessible video controls.
- Keyboard-operable loop markers.
- Meaningful loading and error feedback.

Where appropriate, implement familiar playback shortcuts such as Space/K for play/pause, M for mute, F for fullscreen, and arrow-key seeking, provided they do not interfere with text inputs or other interactive controls.

Do not rely exclusively on hover for critical functionality.

Do not use color alone to communicate selected states.

Use native semantic controls wherever practical.

---

# 26. PERFORMANCE AND ENGINEERING QUALITY

The homepage must be efficient on midrange phones and ordinary laptops.

Requirements:

- Lazy-load offscreen thumbnails.
- Avoid eagerly loading multiple full video streams.
- Prioritize the featured poster.
- Avoid unnecessary React rerenders during playback.
- Use efficient animation properties.
- Avoid expensive blur/glow effects applied to large scrolling areas.
- Keep image aspect ratios stable to reduce layout shifts.
- Prevent memory leaks from event listeners and animation frames.
- Properly clean up video-related effects and observers.
- Avoid large dependencies for trivial interactions.
- Maintain meaningful loading, empty and failure states.

Do not start GPU inference, video processing jobs, expensive AI calls, or cloud deployments.

---

# 27. UI REFERENCE ACCURACY AND ACCEPTANCE CRITERIA

The implementation is complete only when all of the following conditions are satisfied.

## Visual acceptance

- [ ] Guest homepage closely matches the approved reference at 1672 × 941.
- [ ] Logged-in homepage closely matches its approved reference.
- [ ] Dark/neon-yellow visual hierarchy is consistent.
- [ ] Logo space is reserved correctly.
- [ ] Header search placeholder says "Search".
- [ ] Sidebar contains Shorts.
- [ ] Immersion is absent from the top category chips.
- [ ] No guest viewing counter exists.
- [ ] No promotional signup card exists beside the hero.
- [ ] No right-side user analytics/Queue/Saved panel exists.
- [ ] No homepage "View All" links exist.
- [ ] No unrequested inspirational quotes exist.
- [ ] Video cards have rounded corners.
- [ ] Authenticated avatar has a yellow circular ring.

## Functional acceptance

- [ ] Sidebar expands/collapses and the layout reflows.
- [ ] Hamburger active state is visibly yellow and rounded.
- [ ] Search works with local metadata.
- [ ] Category selection updates content.
- [ ] Featured video plays, pauses, mutes, and seeks.
- [ ] Yellow progress line and dot track actual playback.
- [ ] A–B loop markers can be created, adjusted and cleared.
- [ ] A selected valid segment loops during playback.
- [ ] Quality options accurately represent provided sources.
- [ ] Guest playback is unlimited.
- [ ] Create appears only for the authenticated preview state.
- [ ] Signed-in and guest layouts can be tested independently.
- [ ] No visibly interactive control silently does nothing.

## Responsive acceptance

Test at least:

- 1672 × 941
- 1440 × 900
- 1280 × 800
- 1024 × 768
- 768 × 1024
- 390 × 844
- 360 × 800

Verify:

- No unwanted horizontal page scrolling.
- No important content clipping.
- No overlapping controls.
- Correct sidebar behavior.
- Correct thumbnail/grid reflow.
- Usable touch targets.
- Stable video aspect ratios.

## Engineering acceptance

- [ ] Production build succeeds.
- [ ] TypeScript checks pass.
- [ ] Lint checks pass where configured.
- [ ] Relevant interaction tests pass.
- [ ] Media failures are handled.
- [ ] No real secrets are committed.
- [ ] No unsupported backend claims are made.
- [ ] No paid service or deployment is started.
- [ ] Existing changes are not overwritten without review.

Use screenshot comparisons and relevant browser interaction testing where available. If visual testing cannot be run, state that limitation.

---

# 28. PRODUCT DOCUMENTATION

Maintain a small `docs/product/` documentation system.

At minimum:

- `README.md`
- `PRODUCT_VISION.md`
- `UI.md`
- `NAVIGATION.md`
- `HOME_FEED.md`
- `SEARCH_AND_TAGS.md`
- `VIDEO_PLAYER.md`
- `ACCESSIBILITY.md`
- `ACCEPTANCE_CRITERIA.md`
- `references/`

Each specification should include:

- Purpose.
- Scope and exclusions.
- Current implementation status.
- Relevant screenshots and their paths.
- Layout and typography.
- Interactions.
- Responsive rules.
- Loading, empty, active and error states.
- Accessibility.
- Technical constraints.
- Testable acceptance criteria.

Distinguish between approved references, inspiration images, and generated mockups.

Do not silently redefine approved designs.

---

# 29. IMPLEMENTATION SEQUENCE

Work in this order:

**Phase 1 — Foundation**

- Inspect repository.
- Initialize minimal frontend tooling if necessary.
- Establish design tokens.
- Establish typography and icon styles.
- Create the application shell.

**Phase 2 — Navigation**

- Build header.
- Reserve logo slots.
- Implement sidebar.
- Implement hamburger interactions.
- Implement guest/member header states.

**Phase 3 — Homepage structure**

- Implement categories.
- Implement featured video layout.
- Implement Up Next.
- Implement content cards and responsive grids.
- Implement Immersion banner.

**Phase 4 — Player**

- Implement local video playback.
- Implement timeline and yellow playhead.
- Implement controls.
- Implement available quality selection.
- Implement A–B looping.

**Phase 5 — Responsive and interaction refinement**

- Implement mobile and tablet layouts.
- Refine motion.
- Improve keyboard/touch accessibility.
- Handle loading and error states.

**Phase 6 — Quality assurance**

- Run build and type-check.
- Run applicable automated tests.
- Compare desktop screenshots with references.
- Review responsive layouts.
- Fix visual and interaction defects.
- Update documentation.

Do not add unrelated product features during these phases.

---

# 30. REQUIRED FINAL DELIVERY REPORT

After implementation, provide:

1. A summary of what was built.
2. The component/file structure.
3. Which visual references were available and inspected.
4. A list of working interactions.
5. A list of prototype-only or deferred functionality.
6. Build, test and type-check results.
7. Responsive verification results.
8. Any known visual differences from the references.
9. Security, privacy and copyright concerns.
10. The smallest sensible next engineering step.

Do not claim tests passed unless they were executed.

Do not claim production deployment unless deployment occurred and was verified.

Do not hide incomplete functionality behind decorative buttons.

---

# FINAL DESIGN DIRECTIVE

Lolixco must feel like an independent, carefully designed product with its own identity.

The homepage should be:

**Dark. Cinematic. Precise. Responsive. Neon-accented. Minimal in decoration, rich in useful content.**

Use the supplied screenshots to guide the visual composition.

Use this written specification to establish the exact interactions and restrictions.

The result should resemble a credible modern video platform, not a portfolio mockup, generic dashboard template, or imitation of another company's protected branding.

Prioritize visual fidelity, reliable playback, creator attribution, responsive discovery, and clean architecture.

**Build the homepage UI first. Preserve a foundation that can support Lolixco's future AI Edit Analyzer, Creator Studio and Immersion Mode without implementing those large systems prematurely.**