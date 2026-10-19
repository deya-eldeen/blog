---
layout: default
title: Books
permalink: /books/
position: 0
tags: 
- Books
- iOS
---
{% include default/hero.liquid primary_url="#books" primary_label="Explore Books" %}

<section class="books-library" id="books" aria-labelledby="books-title">
  <div class="section-heading">
    <h2 id="books-title">Books</h2>
  </div>
<div class="books-grid">
  <article class="book-card" aria-labelledby="ios-security-title">
    <img
      class="book-cover"
      src="{{ '/images/books/ios_security_through_defensive_techniques.jpg' | relative_url }}"
      alt="iOS Security Through Defensive Techniques cover"
      width="1216"
      height="1500"
      loading="lazy"
    >
    <div class="book-content">
      <h3 class="book-title" id="ios-security-title">iOS Security Through Defensive Techniques</h3>
      <p class="book-subtitle">A practical guide to building resilient, tamper-proof, and secure iOS applications</p>

      <div class="book-meta">
        <p><strong>Authors:</strong> Deya Eldeen Elkhawaldeh, Dave Poirer</p>
        <p><strong>Pages:</strong> 450+</p>
      </div>

      <p class="book-description">
        If you build iOS apps, you also manage risk: insecure data storage, reverse engineering, and runtime tampering.
        This book treats security as part of daily development and covers practical protections across data handling,
        networking, runtime hardening, and incident response.
      </p>

      <div class="book-actions">
        <a class="book-cta" href="https://www.amazon.com/iOS-Security-Through-Defensive-Techniques-ebook/dp/B0FWYY4YH9">Buy On Amazon</a>
        <a class="book-cta" href="https://www.packtpub.com/en-us/product/ios-security-through-defensive-techniques-9781806383177">Get On Packt</a>
      </div>
    </div>
  </article>

  <article class="book-card" aria-labelledby="byte-magic-title">
    <img
      class="book-cover"
      src="{{ '/images/books/byte_magic_in_swift.webp' | relative_url }}"
      alt="Byte Magic In Swift cover"
      width="680"
      height="1024"
      loading="lazy"
    >
    <div class="book-content">
      <h3 class="book-title" id="byte-magic-title">Byte Magic In Swift</h3>
      <p class="book-subtitle">Learn bitwise operators from fundamentals to practical, real-world Swift use cases</p>

      <div class="book-meta">
        <p><strong>Author:</strong> Deya Eldeen Elkhawaldeh</p>
        <p><strong>Pages:</strong> 170+</p>
        <p><strong>Examples:</strong> 95+</p>
      </div>

      <p class="book-description">
        A practical walkthrough of bitwise operators in Swift, with step-by-step examples that move from core concepts
        to advanced patterns you can apply in production code.
      </p>

      <a class="book-cta" href="https://swiftbydeya.gumroad.com/l/byte_magic_in_swift">Buy On Gumroad</a>
    </div>
  </article>
</div>
</section>
