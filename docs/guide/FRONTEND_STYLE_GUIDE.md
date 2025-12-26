# Ghost Viewer - Frontend Style Guide

This document outlines the architectural patterns, UI standards, and design system used in the Ghost Viewer frontend. Adhering to these guidelines ensures a consistent user experience and a maintainable codebase.

---

## 🎨 Design System

### Color Palette
We use a high-contrast functional color palette built on Tailwind CSS defaults.

| Category | Tailwind Classes | Purpose |
| :--- | :--- | :--- |
| **Primary** | `indigo-600`, `indigo-900` | Branding, header, primary CTA, metadata labels. |
| **Branding Gradient** | `from-indigo-600 to-purple-600` | Main application logo/title. |
| **Secondary (SST)** | `purple-600`, `purple-100` | Specifically for SST-related tags and accents. |
| **Action/Alert** | `red-600`, `red-50` | Orphan hunting, destructive actions, error states. |
| **Success** | `green-600`, `green-50` | Successful scans, completions. |
| **Neutral** | `gray-50` to `gray-900` | Layout backgrounds, cards, text, and borders. |

### Typography
- **Font Family**: Standard system sans-serif stack (`font-sans`).
- **Hierarchy**:
  - `text-xl font-bold`: Main page/header titles.
  - `text-lg font-bold`: Section headings.
  - `text-sm font-medium`: Primary body text and interactive labels.
  - `text-xs font-mono`: IDs, ARNs, and technical metadata.
  - `text-[10px] font-black uppercase tracking-wider`: Micro-labels and tag descriptors.

---

## 🧱 Component Architecture

### Folder Structure
All components reside in `ui/components/`:
- **`types.ts`**: Shared TypeScript interfaces for the entire frontend.
- **`constants.ts`**: Global configuration constants (regions, refresh intervals, etc.).
- **`helpers.ts`**: Reusable pure functions for data parsing, link generation, and formatting.
- **`[ComponentName].tsx`**: Individual functional components.

### Component Guidelines
1.  **Functional & Stateless**: Prefer functional components. Keep logic inside the component minimal by delegating to `helpers.ts`.
2.  **Prop Drilling**: If a state is needed by many components (e.g., `selectedResource`), lift it to the root `App.tsx` to maintain persistence across tab switches.
3.  **Memoization**: Use `useMemo` for heavy data transformations (filtering, tree building) and `useCallback` for functions passed to child components to prevent unnecessary re-renders.

---

## 🕹 UI Patterns

### Interactive States
- **Selection**: Selected rows or items must use `bg-indigo-50 ring-1 ring-inset ring-indigo-200` (or `red` variants in the Hunter) to provide clear feedback.
- **Transitions**: Use `transition-all duration-200` for hover states and button interactions.
- **Loading**: Use `animate-spin` with the `RefreshCw` icon for all asynchronous actions.

### Sticky Headers
Dashboard views use a multi-layered sticky header:
- **Header**: Fixed at `top-0` with `z-40`.
- **Sub-header (Filters/Info)**: Sticky at `top-16` (64px) with `z-20` and a `backdrop-blur-sm` effect to overlay content cleanly.

### Fly-out Details Panel
- **Behavior**: Always overlays from the right side.
- **Animation**: `transform transition-transform duration-300 ease-in-out`.
- **State**: Controlled via `selectedResource`. Clearing this state triggers the close animation.

---

## 🏹 Ghost Hunter Patterns

### Visual Progress
Auto-refreshing states must include a linear progress bar at the bottom of the refresh button.
- **Implementation**: CSS `transition` based on the selected interval.
- **Reset**: Reset to `0%` immediately upon fetch completion.

### Data Portability
The Ghost Hunter includes an **Export** feature.
- **Format**: JSON.
- **Filename Pattern**: `ghost-viewer-orphans-[app]-[stage].json`.

---

## ♿ Accessibility & Usability
- **Truncation**: Technical strings (ARNs) should use `truncate` within `min-w-0` flex containers to ensure the layout remains stable on different screen sizes.
- **Visual Cues**: Use icons (Lucide React) alongside text for primary navigation and status indicators.
- **Backdrops**: Active overlays (Details Panel) must include a semi-transparent backdrop (`bg-black/10`) that closes the overlay when clicked.
