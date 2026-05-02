---
layout: page
title: Books
# subtitle: From the pexels folder
permalink: /books/
gallery_path: "assets/img/pexels"
# excluded: true
position: 0
tags: 
- Books
- iOS
---

<style>
article > .post-content {
  padding-left: 8px !important;
  padding-right: 8px !important;
}

.books-grid {
  display: block;
  margin-top: 1.5rem;
  width: 100%;
  max-width: none;
}

.book-card {
  width: 100%;
  max-width: none;
  border: 1px solid #4b4b52;
  border-radius: 14px;
  overflow: hidden;
  background: #2f2f33;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  color: #f3f3f3;
  margin: 0 0 0.9rem 0;
}

.book-cover {
  width: calc(100% - 1rem);
  height: auto;
  display: block;
  margin: 0.5rem auto 0;
  border-radius: 8px;
  background: #2a2a2e;
}

.book-content {
  padding: 1rem 1rem 1.25rem;
}

.book-title {
  margin: 0 0 0.35rem 0;
  line-height: 1.2;
}

.book-subtitle {
  margin: 0 0 0.9rem 0;
  color: #d2d2d8;
}

.book-meta {
  margin: 0 0 0.8rem 0;
  font-size: 0.95rem;
}

.book-meta p {
  margin: 0.2rem 0;
}

.book-description {
  margin: 0 0 1rem 0;
}

.book-cta {
  display: inline-block;
  padding: 0.55rem 0.9rem;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid #e8e8ea;
  color: #f8f8fa;
  background: transparent;
  align-self: flex-end;
}

.book-cta:hover {
  opacity: 0.9;
}

@media (min-width: 900px) {
  .books-grid,
  .books-grid > .book-card {
    width: 100% !important;
    max-width: none !important;
  }

  .book-card {
    flex-direction: column;
    align-items: flex-start;
    padding: 8px;
    justify-self: stretch !important;
  }

  .book-cover {
    width: calc(100% - 1rem);
    height: auto;
    margin: 0.5rem auto 0;
    border-radius: 10px;
    flex: none;
  }

  .book-content {
    padding: 0.75rem 0.5rem 0.5rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    flex: 1 1 auto;
    min-width: 0;
    align-items: flex-start;
  }
}
</style>

<div class="books-grid">
  <article class="book-card">
    <img
      class="book-cover"
      src="/images/books/ios_security_through_defensive_techniques.jpg"
      alt="iOS Security Through Defensive Techniques cover"
      loading="lazy"
    >
    <div class="book-content">
      <h2 class="book-title">iOS Security Through Defensive Techniques</h2>
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

      <a class="book-cta" href="https://www.amazon.com/iOS-Security-Through-Defensive-Techniques-ebook/dp/B0FWYY4YH9">Buy On Amazon</a>
    </div>
  </article>

  <article class="book-card">
    <img
      class="book-cover"
      src="/images/books/byte_magic_in_swift.webp"
      alt="Byte Magic In Swift cover"
      loading="lazy"
    >
    <div class="book-content">
      <h2 class="book-title">Byte Magic In Swift</h2>
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
