# RetroOasis Frontend Improvements

## Executive Summary

RetroOasis is a well-architected static ROM library browser with solid foundations:
- ✅ TypeScript + Vite build setup with strict mode
- ✅ XMB-style navigation with gamepad support
- ✅ PWA capabilities with install prompts
- ✅ Local storage for preferences and favorites
- ✅ IndexedDB for ROM storage
- ✅ Accessibility features (ARIA labels, keyboard nav, focus management)
- ✅ Sound effects and visual polish (wave animation, CRT overlay)

The following improvements are organized by priority and effort.

---

## 🔥 High-Priority Quick Wins (< 1 day each)

### 1. Debounced Search with Platform/Tag Filtering
**Location:** `src/views/library.ts` (lines 193-200)
**Issue:** Current search only filters by title, 160ms debounce could be tuned
**Improvement:**
- Add platform filter dropdown in library view
- Add tag filtering (genre, players, etc.) when metadata available
- Show active filter chips with clear all option
- Consider reducing debounce to 100ms for snappier feel

```typescript
// Add to ro-search in library.ts
<select id="ro-platform-filter" class="ro-input">
  <option value="">All Systems</option>
  ${catalog.platforms.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
</select>
```

### 2. Skeleton Loading States Instead of Spinners
**Location:** `src/main.ts` (loading section), all view renders
**Issue:** Generic "Loading your shelf…" bar doesn't indicate what's loading
**Improvement:**
- Replace spinner with skeleton cards matching final layout
- Progressive loading: show category structure first, then items
- Use `requestIdleCallback` for non-critical rendering

```typescript
// Skeleton example for game grid
<div class="ro-grid">
  ${Array(8).fill(0).map(() => `
    <div class="ro-tile ro-tile--skeleton">
      <div class="ro-tile__cover-skeleton"></div>
      <div class="ro-tile__title-skeleton"></div>
    </div>
  `).join('')}
</div>
```

### 3. Better Mobile Navigation (Hamburger Menu)
**Location:** `src/main.ts` (topbar), `src/styles/base.css`
**Issue:** Nav links overflow on small screens, no mobile menu pattern
**Improvement:**
- Collapsible hamburger menu for < 768px
- Slide-out drawer with smooth animation
- Close on route change or outside click

```css
@media (max-width: 768px) {
  .ro-nav { display: none; }
  .ro-nav--open { display: flex; flex-direction: column; }
  .ro-hamburger { display: block; }
}
```

### 4. Batch ROM Upload with Progress Tracking
**Location:** `src/views/upload.ts`
**Issue:** Only single file upload supported
**Improvement:**
- Allow multiple file selection (`multiple` attribute on input)
- Show upload queue with individual progress bars
- Bulk add to library after all complete
- Pause/resume capability

```typescript
drop?.addEventListener('drop', (event) => {
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length > 1) {
    void launchBatch(files) // New function
  } else if (files[0]) {
    void launch(files[0])
  }
})
```

### 5. Enhanced ARIA Labels for Screen Readers
**Location:** Throughout, especially `src/views/xmb.ts`, `src/views/library.ts`
**Issue:** Some dynamic content lacks live region announcements
**Improvement:**
- Add `aria-live="polite"` to search result counts
- Announce filter changes
- Describe cover art images with alt text from game metadata
- Add `aria-describedby` for complex widgets

```typescript
// In library.ts paint()
<p class="ro-sr-only" aria-live="polite" id="ro-result-count">
  Showing ${games.length} of ${catalog.games.length} games
</p>
```

### 6. Stricter TypeScript Coverage
**Location:** `tsconfig.json`, all `.ts` files
**Issue:** Some implicit `any` types still possible
**Improvement:**
- Enable `noImplicitAny: true`
- Add `strictNullChecks: true` (already covered by `strict`)
- Add explicit return types to all functions
- Type guard helper functions for catalog lookups

```json
{
  "compilerOptions": {
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

---

## 📦 Performance Optimizations

### 7. Code Splitting by View
**Location:** `src/main.ts`, `vite.config.ts`
**Issue:** All views bundled together (~33 TS files)
**Improvement:**
- Dynamic imports for each view route
- Lazy load settings, detail views
- Preload likely next views on hover

```typescript
// In main.ts render()
case 'settings':
  const { renderSettings } = await import('./views/settings')
  await renderSettings(main)
  break
```

### 8. Virtual Scrolling for Large Libraries
**Location:** `src/views/library.ts` (game grid)
**Issue:** Rendering hundreds of tiles at once causes lag
**Improvement:**
- Implement windowed rendering for grids > 50 items
- Use Intersection Observer for lazy cover loading
- Maintain scroll position during re-renders

```typescript
// Virtual grid approach
const VISIBLE_COUNT = 24
const startIndex = scrollTop * columns / ITEM_HEIGHT
const visibleGames = games.slice(startIndex, startIndex + VISIBLE_COUNT)
```

### 9. Web Workers for Catalog Parsing
**Location:** `src/lib/catalog.ts`, `src/lib/localLibrary.ts`
**Issue:** Large folder scans block main thread
**Improvement:**
- Move ROM scanning to worker thread
- Stream results progressively to UI
- Show scan progress percentage

```typescript
// worker.ts
self.onmessage = async (e) => {
  const roms = await scanDirectory(e.data.handle)
  self.postMessage({ roms, progress: 100 })
}
```

### 10. Image Optimization & Lazy Loading
**Location:** `src/lib/covers.ts`, `src/lib/dom.ts`
**Issue:** Cover images loaded eagerly, no responsive sizes
**Improvement:**
- Add `loading="lazy"` to all cover images
- Generate multiple resolution variants (thumbnail, medium, full)
- Use `picture` element with `srcset` for DPI awareness
- Cache covers in IndexedDB with LRU eviction

```typescript
// In coverMarkup()
<img 
  src="${cover}" 
  loading="lazy"
  srcset="${cover}?w=200 1x, ${cover}?w=400 2x"
  alt="${escapeAttr(game.title)} box art"
/>
```

---

## ♿ Accessibility Enhancements

### 11. Full Keyboard Navigation Map
**Location:** `src/lib/focus.ts`, `src/lib/input.ts`
**Issue:** Some views lack keyboard shortcuts documentation
**Improvement:**
- Add help modal with keyboard shortcut reference
- Implement skip links to major sections
- Add focus trap for modals/dialogs
- Ensure all interactive elements reachable via Tab

```typescript
// Add to base.css
.ro-shortcuts-modal { /* ... */ }
// Trigger with ? or F1 key
```

### 12. Color Contrast Compliance
**Location:** `src/styles/tokens.css`, `src/styles/base.css`
**Issue:** Some muted text may not meet WCAG AA
**Improvement:**
- Audit all color pairs with contrast checker
- Increase contrast for `.ro-muted` text
- Ensure focus indicators have 3:1 ratio minimum
- Test with grayscale filter

```css
.ro-muted {
  color: var(--ro-text-muted); /* Ensure 4.5:1 ratio */
}
```

### 13. Reduced Motion Respects System Setting
**Location:** `src/styles/motion.css`, `src/lib/wave.ts`
**Issue:** Wave animation may not fully respect `prefers-reduced-motion`
**Improvement:**
- Disable wave canvas animation when reduced motion preferred
- Replace transitions with instant changes
- Add setting to manually disable animations

```css
@media (prefers-reduced-motion: reduce) {
  .ro-wave__canvas { display: none; }
  * { transition-duration: 0.01ms !important; }
}
```

### 14. Focus Visible Indicators
**Location:** `src/styles/base.css`
**Issue:** Custom focus styles may not be visible enough
**Improvement:**
- Add thick, high-contrast focus rings
- Use `:focus-visible` for keyboard-only focus
- Ensure focus visible in TV mode (larger rings)

```css
[data-ro-focusable]:focus-visible {
  outline: 3px solid var(--ro-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px var(--ro-accent-glow);
}
```

---

## 🎨 UX Polish

### 15. Breadcrumb Navigation
**Location:** `src/views/detail.ts`, `src/views/library.ts`
**Issue:** Breadcrumbs exist but could be more prominent
**Improvement:**
- Add visual separators with better hierarchy
- Make current page non-clickable with `aria-current`
- Add "back" button for mobile that respects history

```typescript
// Improve existing breadcrumbs
<nav class="ro-breadcrumbs" aria-label="Breadcrumb">
  <a href="/">Home</a>
  <span aria-hidden="true">›</span>
  <a href="/library">Library</a>
  <span aria-hidden="true">›</span>
  <span aria-current="page">${game.title}</span>
</nav>
```

### 16. Empty State Illustrations
**Location:** `src/views/library.ts` (emptyState functions)
**Issue:** Text-only empty states feel sparse
**Improvement:**
- Add simple SVG illustrations for each empty state
- Include contextual CTAs based on user journey
- Add humor/personality matching retro theme

```typescript
function emptyState(sel: LibrarySelection): string {
  return `
    <div class="ro-empty">
      <svg class="ro-empty__illustration"><!-- SVG --></svg>
      <p class="ro-empty__title">No favorites yet</p>
      <!-- ... -->
    </div>
  `
}
```

### 17. Toast Notifications
**Location:** `src/main.ts`, throughout views
**Issue:** Status messages inline can be missed
**Improvement:**
- Add toast notification system for actions
- Auto-dismiss success messages after 3s
- Persistent error toasts with dismiss action
- Queue multiple toasts without overlap

```typescript
// New file: src/lib/toast.ts
export function showToast(message: string, type: 'success' | 'error' | 'info'): void {
  // Create toast element, animate in, schedule removal
}
```

### 18. Confirmation Dialogs for Destructive Actions
**Location:** `src/views/detail.ts` (remove upload), `src/views/settings.ts` (clear data)
**Issue:** Native `confirm()` dialog breaks UX flow
**Improvement:**
- Custom modal dialog matching design system
- Explain consequences clearly
- Support keyboard (Enter=confirm, Escape=cancel)
- Add undo option where feasible

```typescript
// New file: src/lib/dialog.ts
export async function confirmAction(
  title: string, 
  message: string,
  confirmText = 'Confirm'
): Promise<boolean> {
  // Return promise that resolves on user choice
}
```

### 19. Recent Games Carousel on Home
**Location:** `src/views/xmb.ts`
**Issue:** Only shows one "Continue" item
**Improvement:**
- Horizontal carousel of last 4-6 played games
- Quick resume from home screen
- Show play time/date for context

```typescript
const recentGames = getRecents().slice(0, 6).map(id => findGame(catalog, id))
// Render as horizontal scrollable row
```

---

## 🚀 Feature Additions

### 20. Multi-ROM Support (Disc Swapping)
**Location:** `src/lib/play.ts`, `src/views/detail.ts`
**Issue:** Multi-disc games require manual core configuration
**Improvement:**
- Detect multi-disc games from sidecar metadata
- Add disc swap UI in player overlay
- Save disc state per game in IndexedDB

```typescript
interface GameSidecar {
  discs: Array<{ label: string; file: string }>
}
```

### 21. Save State Management UI
**Location:** New view needed
**Issue:** No UI to manage emulator save states
**Improvement:**
- List all save states per game
- Screenshot preview of save state
- Export/import save states
- Cloud sync placeholder (future)

```typescript
// New file: src/views/saves.ts
export async function renderSaves(root: HTMLElement, gameId: string): Promise<void> {
  // Load saves from IDB, show grid with screenshots
}
```

### 22. Metadata Editor Improvements
**Location:** `src/views/detail.ts` (lines 149-181)
**Issue:** Basic form, no validation or preview
**Improvement:**
- Live preview of metadata changes
- Drag-and-drop cover image upload
- Validate year, required fields
- Batch edit for selected games

```typescript
// Add image preview
<label class="ro-muted">
  Cover URL 
  <input class="ro-input" name="cover" />
  <img class="ro-cover-preview" src="${previewUrl}" />
</label>
```

### 23. Tag-Based Collections
**Location:** `src/lib/store.ts`, `src/lib/catalog.ts`
**Issue:** Only Favorites and Recent collections
**Improvement:**
- User-created custom collections
- Auto-collections by genre, players, year range
- Drag games into collections
- Share collection JSON

```typescript
interface Collection {
  id: string
  name: string
  description?: string
  gameIds: string[]
  createdAt: number
}
```

### 24. ROM Sidecar Generator
**Location:** `data/src/roms-sidecar.js`
**Issue:** Manual sidecar creation
**Improvement:**
- Web UI to generate sidecars for local ROMs
- Auto-fetch metadata from online APIs (IGDB, MobyGames)
- Bulk edit metadata for multiple ROMs
- Export manifest.json for hosted libraries

---

## 🧪 Code Quality & Testing

### 25. Unit Tests for Core Logic
**Location:** Need test setup
**Issue:** No automated tests currently
**Improvement:**
- Add Vitest for unit testing
- Test catalog parsing, filtering logic
- Test store functions (favorites, recents)
- Aim for 70%+ coverage on lib/ files

```bash
npm install -D vitest @vitest/ui
# Add to package.json scripts
"test": "vitest",
"test:ui": "vitest --ui"
```

### 26. E2E Testing with Playwright
**Location:** Need test setup
**Issue:** Manual testing only
**Improvement:**
- Critical path tests (upload ROM, play game, favorite)
- Cross-browser testing (Chrome, Firefox, Safari)
- Visual regression testing for key views
- CI integration on PR

```bash
npm install -D @playwright/test
npx playwright install
```

### 27. ESLint Rules for Consistency
**Location:** `eslint.config.js`
**Issue:** Basic config only
**Improvement:**
- Add `eslint-plugin-import` for import order
- Add `eslint-plugin-promise` for async handling
- Enforce consistent naming conventions
- Add pre-commit hook with lint-staged

```javascript
// eslint.config.js additions
import importPlugin from 'eslint-plugin-import'
import promisePlugin from 'eslint-plugin-promise'
```

### 28. Component Documentation with Storybook
**Location:** New setup needed
**Issue:** No living style guide
**Improvement:**
- Document reusable UI components
- Show all states (hover, focus, disabled)
- Test component accessibility automatically
- Generate design tokens docs

```bash
npm install -D storybook @storybook/html-vite
npx storybook init
```

---

## 📱 Mobile-Specific

### 29. Touch Gestures for Navigation
**Location:** `src/lib/input.ts`, `src/views/xmb.ts`
**Issue:** Keyboard/gamepad focused, touch limited to tap
**Improvement:**
- Swipe left/right for XMB categories
- Pull-to-refresh library view
- Pinch to zoom cover art in detail view
- Long-press for context menu (favorite, edit)

```typescript
// Add touch gesture handlers
element.addEventListener('touchstart', handleTouchStart)
element.addEventListener('touchmove', handleTouchMove)
element.addEventListener('touchend', handleTouchEnd)
```

### 30. Haptic Feedback
**Location:** `src/lib/sfx.ts`
**Issue:** Audio feedback only
**Improvement:**
- Use Navigator.vibrate() for tactile feedback
- Different patterns for actions (navigate, confirm, error)
- Respect reduced motion preference
- Toggle in settings

```typescript
export function haptic(pattern: number | number[]): void {
  if (getSoundsEnabled() && navigator.vibrate) {
    navigator.vibrate(pattern)
  }
}
```

### 31. Mobile-Optimized Player Controls
**Location:** EmulatorJS integration
**Issue:** Desktop-oriented controls
**Improvement:**
- Larger touch targets for on-screen controls
- Customizable control layout
- Hide controls after inactivity
- Landscape mode prompt for handheld systems

---

## 🌐 Internationalization (i18n)

### 32. Translation Framework Setup
**Location:** Throughout, all user-facing strings
**Issue:** Hardcoded English strings
**Improvement:**
- Extract strings to localization files
- Use i18next or similar framework
- Support RTL languages (Arabic, Hebrew)
- Community translation workflow

```typescript
// New file: src/lib/i18n.ts
import i18n from 'i18next'
i18n.init({
  resources: { en: { translation: { /* ... */ } } },
  lng: 'en',
  fallbackLng: 'en'
})
export function t(key: string): string {
  return i18n.t(key)
}
```

### 33. Locale-Aware Formatting
**Location:** `src/views/xmb.ts` (clock), `src/views/settings.ts` (bytes)
**Issue:** US-centric date/number formats
**Improvement:**
- Use Intl.DateTimeFormat for dates
- Use Intl.NumberFormat for counts
- Respect locale from browser settings
- Allow manual locale override

```typescript
const dateFormatter = new Intl.DateTimeFormat(locale, {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
})
```

---

## 🔧 Developer Experience

### 34. Bundle Size Analysis
**Location:** Build output
**Issue:** No visibility into bundle composition
**Improvement:**
- Add `rollup-plugin-visualizer`
- Set budget warnings (>100KB initial load)
- Identify large dependencies
- Track size over time in CI

```bash
npm install -D rollup-plugin-visualizer
# Add to vite.config.ts plugins
```

### 35. Environment Configuration
**Location:** `vite.config.ts`
**Issue:** Hardcoded paths and settings
**Improvement:**
- Support `.env` files for local dev
- Different configs for dev/staging/prod
- Feature flags for experimental features
- Runtime config injection

```typescript
// .env.example
VITE_EJS_CDN_URL=https://cdn.emulatorjs.org
VITE_ENABLE_ANALYTICS=false
```

### 36. Improved Error Boundaries
**Location:** `src/main.ts`, view renders
**Issue:** Errors can crash entire app
**Improvement:**
- Catch render errors per-view
- Show friendly error with recovery options
- Log errors to console with context
- Graceful degradation for non-critical features

```typescript
try {
  await renderXmb(main)
} catch (error) {
  console.error('XMB render failed:', error)
  main.innerHTML = `<section class="ro-error">...</section>`
}
```

---

## 📊 Analytics & Monitoring

### 37. Privacy-Respecting Usage Metrics
**Location:** New implementation
**Issue:** No insight into feature usage
**Improvement:**
- Self-hosted analytics (Plausible, Umami)
- Track anonymized events (ROM uploads, plays)
- Opt-in only with clear disclosure
- No personal data or ROM info tracked

```typescript
// New file: src/lib/analytics.ts
export function trackEvent(name: string, data?: Record<string, unknown>): void {
  if (getAnalyticsConsent()) {
    // Send to analytics endpoint
  }
}
```

### 38. Performance Monitoring
**Location:** Throughout
**Issue:** No real-world performance data
**Improvement:**
- Measure Time to Interactive (TTI)
- Track catalog load times
- Monitor frame drops in XMB
- Report via Performance API

```typescript
window.addEventListener('load', () => {
  const metrics = performance.getEntriesByType('navigation')[0]
  console.log('TTI:', metrics.domInteractive)
})
```

---

## 🎮 EmulatorJS Integration

### 39. Core Selection Per-Game
**Location:** `src/views/detail.ts` (metadata editor)
**Issue:** Core set at upload/auto-detect
**Improvement:**
- Allow changing core post-upload
- Show recommended cores per platform
- Warn about compatibility issues
- Remember per-game core preference

### 40. BIOS File Management
**Location:** Settings view enhancement
**Issue:** No UI for BIOS files
**Improvement:**
- Upload BIOS files through UI
- Show which cores need BIOS
- Validate BIOS checksums
- Store in IndexedDB with core mapping

### 41. Controller Configuration UI
**Location:** Settings view enhancement
**Issue:** Default controller mappings only
**Improvement:**
- Visual controller mapper
- Per-system button remapping
- Save profiles per controller
- Import/export config JSON

---

## 💾 PWA & Offline

### 42. Storage Quota Management
**Location:** `src/lib/idb.ts`, `src/lib/uploadedLibrary.ts`
**Issue:** No warning when storage nears limit
**Improvement:**
- Show storage usage in settings
- Warn at 80% quota
- Suggest clearing old ROMs
- Estimate space per ROM

```typescript
const estimate = await navigator.storage.estimate()
const percent = (estimate.usage / estimate.quota) * 100
if (percent > 80) showStorageWarning()
```

### 43. Background Sync for Updates
**Location:** `src/lib/pwa.ts`
**Issue:** Manual refresh needed for updates
**Improvement:**
- Use Background Sync API for ROM uploads
- Check for app updates on launch
- Prompt to refresh when new version ready
- Show changelog for updates

### 44. Offline-First Strategy
**Location:** Service worker configuration
**Issue:** Basic caching only
**Improvement:**
- Cache shell and critical assets
- Queue ROM uploads when offline
- Show offline indicator
- Graceful degradation for missing features

---

## 🎯 Prioritized Roadmap

### Phase 1: Foundation (Week 1-2)
1. Debounced search with filters (#1)
2. Skeleton loading states (#2)
3. Mobile hamburger menu (#3)
4. Enhanced ARIA labels (#5)
5. Stricter TypeScript (#6)

### Phase 2: Performance (Week 3-4)
6. Code splitting (#7)
7. Virtual scrolling (#8)
8. Image optimization (#10)
9. Bundle analysis (#34)

### Phase 3: Features (Week 5-6)
10. Batch upload (#4)
11. Custom collections (#23)
12. Metadata editor improvements (#22)
13. Toast notifications (#17)

### Phase 4: Polish (Week 7-8)
14. Empty state illustrations (#16)
15. Confirmation dialogs (#18)
16. Touch gestures (#29)
17. Haptic feedback (#30)

### Phase 5: Quality (Week 9-10)
18. Unit tests (#25)
19. E2E tests (#26)
20. ESLint improvements (#27)
21. Error boundaries (#36)

---

## 📈 Success Metrics

Track these KPIs to measure improvement impact:

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Initial load time | TBD | < 2s | Lighthouse |
| Time to Interactive | TBD | < 3s | Performance API |
| Lighthouse Accessibility | TBD | 95+ | Lighthouse CI |
| Bundle size (gzipped) | TBD | < 150KB | Rollup visualizer |
| Test coverage | 0% | 70% | Vitest |
| Mobile usability issues | TBD | 0 | Lighthouse |
| Core Web Vitals | TBD | All green | Chrome UX Report |

---

## 🛠️ Implementation Notes

### General Guidelines
- **Incremental adoption**: Don't refactor everything at once
- **Backwards compatible**: Preserve existing saved data
- **Progressive enhancement**: Features degrade gracefully
- **Test on devices**: Real hardware testing for gamepads, mobile

### Git Workflow
- Feature branches from `main`
- PR reviews required
- Squash commits before merge
- Semantic versioning for releases

### Dependencies to Consider
```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@playwright/test": "^1.50.0",
    "eslint-plugin-import": "^2.31.0",
    "storybook": "^8.0.0",
    "rollup-plugin-visualizer": "^6.0.0"
  },
  "dependencies": {
    "i18next": "^24.0.0",
    "idb": "^8.0.0"
  }
}
```

---

## 📝 Conclusion

RetroOasis has excellent foundations with thoughtful architecture. These improvements focus on:
1. **User experience**: Faster, more accessible, mobile-friendly
2. **Developer experience**: Tests, tooling, documentation
3. **Features**: Power user capabilities without complexity
4. **Quality**: Performance, accessibility, maintainability

Start with Phase 1 quick wins for immediate impact, then tackle performance and features based on user feedback.
