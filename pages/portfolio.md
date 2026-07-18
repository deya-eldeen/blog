---
layout: page
title: Portfolio
permalink: /portfolio/
subtitle: "Apps, libraries, and projects I maintain"
position: 2
tags:
  - Portfolio
  - Apps
  - Libraries
  - iOS
  - Swift
hide_tags: true
---

<style>
.portfolio-page {
  --portfolio-border: rgba(120, 120, 132, 0.35);
  --portfolio-muted: #76767f;
  --portfolio-panel: rgba(127, 127, 138, 0.08);
  max-width: 100%;
  overflow-x: hidden;
}

.portfolio-page * {
  max-width: 100%;
}

#Portfolio + .subtitle {
  display: block;
  width: 100%;
  max-width: 320px;
  margin-left: auto;
  margin-right: auto;
  white-space: normal;
  overflow-wrap: anywhere;
}

.portfolio-section {
  margin: 0 0 2rem;
  max-width: 100%;
}

.portfolio-section-title {
  margin: 0 0 0.85rem;
}

.portfolio-intro {
  margin: 0 0 1.25rem;
  max-width: 780px;
}

.portfolio-card {
  border: 1px solid var(--portfolio-border);
  border-radius: 8px;
  padding: 1rem;
  background: var(--portfolio-panel);
  box-sizing: border-box;
  float: none;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  margin-left: 0;
  margin-right: 0;
}

.portfolio-app-card {
  max-width: 780px;
}

.portfolio-app-header {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
}

.portfolio-app-icon {
  width: 88px;
  min-width: 88px;
  max-width: 88px;
  height: 88px;
  min-height: 88px;
  max-height: 88px;
  aspect-ratio: 1 / 1;
  border-radius: 20px;
  display: block;
  flex: 0 0 88px;
  object-fit: cover;
  padding: 0 !important;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
}

.portfolio-app-copy {
  min-width: 0;
}

.portfolio-app-title {
  margin: 0 0 0.25rem;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.portfolio-app-summary {
  margin: 0;
  overflow-wrap: anywhere;
}

.portfolio-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.85rem 0 0;
}

.portfolio-tags span {
  border: 1px solid var(--portfolio-border);
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.92rem;
  line-height: 1.2;
}

.portfolio-description {
  margin: 1rem 0;
}

.portfolio-description ul {
  margin-bottom: 1rem;
}

.portfolio-link-button {
  display: inline-block;
  border: 1px solid currentColor;
  border-radius: 8px;
  padding: 0.55rem 0.85rem;
  font-weight: 700;
  text-decoration: none;
}

.portfolio-note {
  margin: 0.75rem 0 0;
  color: var(--portfolio-muted);
  font-size: 0.95rem;
}

.portfolio-library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.portfolio-library-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.portfolio-library-image {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  display: block;
  margin: 0 0 0.85rem;
  border: 1px solid var(--portfolio-border);
  border-radius: 8px;
  background: rgba(127, 127, 138, 0.1);
  padding: 0 !important;
}

.portfolio-library-card h3 {
  margin: 0 0 0.45rem;
  line-height: 1.18;
}

.portfolio-library-card p {
  margin: 0 0 0.85rem;
}

.portfolio-library-card .portfolio-tags {
  margin: auto 0 0.9rem;
}

@media (max-width: 640px) {
  .portfolio-app-header {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    text-align: center;
    gap: 0.8rem;
  }

  .portfolio-card,
  .portfolio-app-card {
    width: 320px !important;
    max-width: calc(100vw - 3rem) !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  #Portfolio + .subtitle {
    width: 320px !important;
    max-width: calc(100vw - 3rem) !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    text-align: center;
  }

  .portfolio-app-copy,
  .portfolio-app-summary,
  .portfolio-description {
    width: 100%;
    max-width: 18rem;
    margin-left: auto;
    margin-right: auto;
  }

  .portfolio-app-icon {
    width: 96px;
    min-width: 96px;
    max-width: 96px;
    height: 96px;
    min-height: 96px;
    max-height: 96px;
    flex-basis: 96px;
    border-radius: 22px;
  }

  .portfolio-tags {
    justify-content: center;
  }

  .portfolio-tags span {
    font-size: 0.86rem;
  }
}

@media (max-width: 360px) {
  #Portfolio + .subtitle,
  .portfolio-card,
  .portfolio-app-card {
    width: calc(100vw - 2rem) !important;
    max-width: calc(100vw - 2rem) !important;
  }

  .portfolio-app-icon {
    width: 84px;
    min-width: 84px;
    max-width: 84px;
    height: 84px;
    min-height: 84px;
    max-height: 84px;
    flex-basis: 84px;
    border-radius: 19px;
  }
}
</style>

<div class="portfolio-page">
  <section class="portfolio-section">
    <h2 class="portfolio-section-title">Apps</h2>
    <p class="portfolio-intro">Published iOS apps and developer tools I maintain.</p>

    <article class="portfolio-card portfolio-app-card">
      <div class="portfolio-app-header">
        <img
          class="portfolio-app-icon"
          src="/images/apps/reactive-playground-icon.jpg"
          alt="Reactive Playground app icon"
          loading="lazy"
        >
        <div class="portfolio-app-copy">
          <h3 class="portfolio-app-title">Reactive Playground</h3>
          <p class="portfolio-app-summary">A visual learning app for Rx-style reactive programming.</p>
        </div>
      </div>

      <div class="portfolio-tags">
        <span>Developer Tools</span>
        <span>iPhone and iPad</span>
        <span>iOS 17.0+</span>
        <span>Version 2.0</span>
      </div>

      <div class="portfolio-description">
        <p>
          Reactive Playground helps developers and students understand reactive operators by editing marble timelines directly.
          You can move events, change values, clone or remove items, convert events into errors or completed events, and watch the
          output update live.
        </p>

        <p>The app covers operator categories including:</p>

        <ul>
          <li>Transforming</li>
          <li>Filtering</li>
          <li>Combining</li>
          <li>Error Handling</li>
          <li>Utility</li>
        </ul>

        <p>
          Each playground includes a source timeline, an output timeline, a concise explanation, and a code-style example.
        </p>
      </div>

      <a class="portfolio-link-button" href="https://apps.apple.com/jo/app/reactive-playground/id6784823079?l=ar">View on the App Store</a>
      <p class="portfolio-note">The App Store listing shows that the app does not collect user data.</p>
    </article>
  </section>

  <section class="portfolio-section">
    <h2 class="portfolio-section-title">Libraries</h2>
    <p class="portfolio-intro">
      A curated list of the most important original frameworks, packages, and reusable libraries from my GitHub profile.
    </p>

    <div class="portfolio-library-grid">
      <article class="portfolio-card portfolio-library-card">
        <img
          class="portfolio-library-image"
          src="/images/libraries/jailbreak-detector-monkey.png"
          alt="JailbreakDetector affected-device screenshot"
          loading="lazy"
        >
        <h3>JailbreakDetector</h3>
        <p>
          A lightweight Swift package for checking common iOS jailbreak indicators through URL-scheme checks,
          suspicious file scans, and write tests. Kept as a legacy security reference.
        </p>
        <div class="portfolio-tags">
          <span>Swift</span>
          <span>iOS</span>
          <span>Security</span>
          <span>SPM</span>
        </div>
        <a class="portfolio-link-button" href="https://github.com/deya-eldeen/JailbreakDetector">Open repository</a>
      </article>

      <article class="portfolio-card portfolio-library-card">
        <img
          class="portfolio-library-image"
          src="/images/libraries/scrambled-keypad-logo.png"
          alt="ScrambledKeypad logo"
          loading="lazy"
        >
        <h3>ScrambledKeypad</h3>
        <p>
          A dependency-free SwiftUI keypad that randomizes digit positions to reduce smudge-based pattern attacks,
          with optional delete, enter, haptics, and animation support.
        </p>
        <div class="portfolio-tags">
          <span>SwiftUI</span>
          <span>iOS</span>
          <span>Security UX</span>
          <span>SPM</span>
        </div>
        <a class="portfolio-link-button" href="https://github.com/deya-eldeen/ScrambledKeypad">Open repository</a>
      </article>

      <article class="portfolio-card portfolio-library-card">
        <img
          class="portfolio-library-image"
          src="/images/libraries/legacy-swift-crypto-logo.png"
          alt="LegacySwiftCrypto logo"
          loading="lazy"
        >
        <h3>LegacySwiftCrypto</h3>
        <p>
          Swift implementations of legacy cryptographic primitives for education and interoperability, including
          older hashes, ciphers, MACs, and password-hash/KDF utilities.
        </p>
        <div class="portfolio-tags">
          <span>Swift</span>
          <span>Cryptography</span>
          <span>Education</span>
          <span>SPM</span>
        </div>
        <a class="portfolio-link-button" href="https://github.com/deya-eldeen/LegacySwiftCrypto">Open repository</a>
      </article>

      <article class="portfolio-card portfolio-library-card">
        <img
          class="portfolio-library-image"
          src="/images/libraries/flat-switch-demo.gif"
          alt="FlatSwitch demo animation"
          loading="lazy"
        >
        <h3>FlatSwitch</h3>
        <p>
          A SwiftUI reimagining of the classic FlatSwitch component, with configurable labels, colors, icons,
          sizing, state styling, animation, and accessibility behavior.
        </p>
        <div class="portfolio-tags">
          <span>SwiftUI</span>
          <span>UI Component</span>
          <span>Apple Platforms</span>
          <span>SPM</span>
        </div>
        <a class="portfolio-link-button" href="https://github.com/deya-eldeen/FlatSwitch">Open repository</a>
      </article>

      <article class="portfolio-card portfolio-library-card">
        <img
          class="portfolio-library-image"
          src="/images/libraries/app-curtain-demo.gif"
          alt="AppCurtain demo animation"
          loading="lazy"
        >
        <h3>AppCurtain</h3>
        <p>
          A small iOS privacy helper that displays a blur, solid-color, or custom curtain when an app leaves the
          foreground, then removes it when the app becomes active again.
        </p>
        <div class="portfolio-tags">
          <span>Swift</span>
          <span>iOS</span>
          <span>Privacy</span>
          <span>SPM</span>
        </div>
        <a class="portfolio-link-button" href="https://github.com/deya-eldeen/AppCurtain">Open repository</a>
      </article>

      <article class="portfolio-card portfolio-library-card">
        <h3>Arabic Stopwords</h3>
        <p>
          A structured JSON collection of Arabic stopwords grouped for text cleaning, token filtering,
          categorization, search indexing, and machine-learning preprocessing workflows.
        </p>
        <div class="portfolio-tags">
          <span>Arabic NLP</span>
          <span>JSON</span>
          <span>Data Library</span>
          <span>Search</span>
        </div>
        <a class="portfolio-link-button" href="https://github.com/deya-eldeen/arabic_stopwords">Open repository</a>
      </article>
    </div>

    <p class="portfolio-note">
      This section focuses on original repositories rather than forks, demos, and one-off experiments.
    </p>
  </section>

  <section class="portfolio-section">
    <h2 class="portfolio-section-title">Other Projects</h2>
  </section>
</div>

{% include portfolio.html %}
