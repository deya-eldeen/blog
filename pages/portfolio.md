---
layout: page
show_hero: true
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
