---
name: L'Espace Raffiné
colors:
  surface: '#faf9fa'
  surface-dim: '#dadadb'
  surface-bright: '#faf9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f4'
  surface-container: '#efedef'
  surface-container-high: '#e9e8e9'
  surface-container-highest: '#e3e2e3'
  on-surface: '#1a1c1d'
  on-surface-variant: '#42474c'
  inverse-surface: '#2f3032'
  inverse-on-surface: '#f1f0f2'
  outline: '#73787c'
  outline-variant: '#c2c7cc'
  surface-tint: '#476273'
  primary: '#476273'
  on-primary: '#ffffff'
  primary-container: '#b2cee2'
  on-primary-container: '#3d5869'
  inverse-primary: '#aecade'
  secondary: '#45636e'
  on-secondary: '#ffffff'
  secondary-container: '#c7e8f5'
  on-secondary-container: '#4b6974'
  tertiary: '#5d6301'
  on-tertiary: '#ffffff'
  tertiary-container: '#cad16b'
  on-tertiary-container: '#545900'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cae6fb'
  primary-fixed-dim: '#aecade'
  on-primary-fixed: '#001e2d'
  on-primary-fixed-variant: '#2f4a5a'
  secondary-fixed: '#c7e8f5'
  secondary-fixed-dim: '#acccd8'
  on-secondary-fixed: '#001f28'
  on-secondary-fixed-variant: '#2d4b55'
  tertiary-fixed: '#e2e980'
  tertiary-fixed-dim: '#c6cd67'
  on-tertiary-fixed: '#1b1d00'
  on-tertiary-fixed-variant: '#464a00'
  background: '#faf9fa'
  on-background: '#1a1c1d'
  surface-variant: '#e3e2e3'
typography:
  h1:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.4'
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 1.5rem
  margin-page: 2rem
  unit-xs: 0.25rem
  unit-sm: 0.5rem
  unit-md: 1rem
  unit-lg: 2rem
  unit-xl: 4rem
---

## Brand & Style

The brand identity is rooted in a sophisticated, modern, and professional ethos. It balances the airy lightness of a premium editorial with the structured reliability of high-end corporate SaaS. The visual style leans into **Minimalism** with a **Corporate Modern** twist, utilizing generous white space and high-quality typographic hierarchies to convey a sense of calm authority. 

Interactions should feel effortless and intentional. The use of full roundness adds a layer of approachability and modern fluidity to an otherwise structured and professional layout, ensuring the interface feels contemporary rather than rigid.

## Colors

The color palette is designed to evoke a sense of professional serenity. 

*   **Primary (#b2cee2):** A soft, airy light blue used for expansive surfaces, subtle accents, and light-themed interactions.
*   **Secondary (#13333d):** A deep navy-teal that provides the "anchor" for the system. Use this for high-contrast text, navigation bars, and primary call-to-action backgrounds to ensure professional weight.
*   **Tertiary (#d1d871):** A lime-yellow used sparingly as a "highlighter" for status indicators, active states, or specific functional callouts that require attention without breaking the sophisticated aesthetic.
*   **Neutrals:** Clean whites and soft grays maintain the existing clarity, ensuring the colorful accents remain the focal points.

## Typography

This design system exclusively utilizes **Inter** to maintain a utilitarian and functional character. The hierarchy is established through significant weight shifts rather than font variations.

Headlines (H1, H2) should use tighter letter spacing and heavier weights to anchor pages. Body text is optimized for readability with a generous 1.6 line height. Labels and metadata should leverage medium to semi-bold weights to remain distinct even at smaller scales.

## Layout & Spacing

The system employs a **Fluid Grid** model with a maximum container width to maintain readability on ultra-wide displays. 

A 12-column grid is the standard for complex views, while simpler editorial pages should use a centered 8-column layout. Spacing follows a strict 4px/8px baseline rhythm to ensure mathematical harmony. Use "unit-xl" for section vertical padding to emphasize the "L'Espace" (space) aspect of the brand, allowing the content room to breathe.

## Elevation & Depth

Depth is conveyed through **Tonal Layers** and **Ambient Shadows**. 

Instead of heavy shadows, use background color shifts (e.g., a slightly darker neutral for the page background and pure white for cards). When shadows are necessary for floating elements (modals, dropdowns), they must be extra-diffused and low-opacity, using a slight Secondary (#13333d) tint to ground them in the brand's color space. Surfaces should feel integrated rather than floating.

## Shapes

The shape language is defined by **Full Roundness (Pill-shaped)**. 

Every interactive element—from buttons to input fields—must utilize the maximum border-radius to create a soft, continuous silhouette. This applies to containers as well; cards and modals should feature large, sweeping corners (rounded-xl) to maintain the "Raffiné" (refined) and modern feel of the design system.

## Components

*   **Buttons:** Primary buttons use the Secondary color (#13333d) with white text for maximum professional impact. They are always pill-shaped. Secondary buttons use the Primary color (#b2cee2) with Secondary text.
*   **Input Fields:** Ghost-style or light-gray fills with full rounded corners. Focus states should use a 2px stroke of the Secondary color.
*   **Chips/Tags:** Utilize the Tertiary color (#d1d871) for active or high-priority chips, and the Primary color (#b2cee2) for standard categorical tags. Always pill-shaped.
*   **Cards:** High-radius corners (minimum 2rem/32px). Use subtle 1px borders in a neutral tone instead of shadows where possible.
*   **Progress Indicators:** Use the Tertiary color to show completion or success, providing a bright contrast against the deeper Navy/Teal elements.