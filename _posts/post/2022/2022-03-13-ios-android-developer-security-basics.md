---
layout: post
title: "iOS/Android Developer Security Basics"
date: "2022-03-13"
last_modified_at: "2024-09-08"
permalink: /ios-android-developer-security-basics/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/security_basics.webp"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Security"
  - "Math"
tags: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
  - "Security"
  - "Math"
---

Mobile app security is a critical concern for both iOS and Android developers. This article aims to cover the essential security basics that every mobile developer should know. Presented as a conversation between two developers, Sam 🥸 and Jomjom 💀, we’ll explore various security concepts, risks, and best practices.

<!--more-->

{% 
include centered-image.html
image_path="../images/covers/security_basics_full.webp"
alt_text="Mobile Security Basics"
caption="JomJom!" 
%}

## The Importance of Security in Mobile Development

🥸: What are the risks of not having good security precautions? Why do we spend so much on security?  
💀: There are over 500 reported incidents of data breaches each year, with each incident costing an average of 3.5M to 5.0M USD. Remote work has increased these costs by 15%, as attackers find more opportunities when targets are spread across different locations.

🥸: When people talk about security, the server is often seen as the main line of defense. Why should mobile developers be concerned if the server is secure?  
💀: Even if the server is secure, mobile apps still need to implement security best practices. Mobile apps have direct access to sensitive data like location, contacts, and files. A compromised app could leak this information, posing significant risks. Unlike browsers, mobile apps run locally on devices without the same protections, making vulnerabilities in app code a target for attackers.

## Cross-Platform Security Concerns

🥸: But you’re an iOS developer, and I develop for Android. Are your tips applicable to Android too?  
💀: Yes, many security precautions apply to both platforms, but it's important to note that iOS and Android are based on different operating systems. iOS is based on Darwin (BSD), which is Unix-like, while Android is Linux-based. However, both platforms share common security concerns.

🥸: Why can’t we just rely on HTTPS for security?  
💀: HTTPS protects data in transit between the client and server, but only if the TLS certificate is valid and uncompromised. It’s just one layer of security; other aspects, like secure storage and code integrity, also need attention.

## Mobile Security Weak Points

🥸: What are the weak points in mobile security?  
💀: Network, disk, and USB ports are common attack vectors. Understanding these entry points is key to securing your app.

## Key Security Terminology
💀: Here are some essential terms you should know:

| Term                     | Basic Explanation                                                                                                                                              |
|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Authentication           | Establishing a user’s identity.                                                                                                                                 |
| Authorization            | Granting a user access to a resource. See [this article](https://www.sailpoint.com/identity-library/difference-between-authentication-and-authorization/) for more. |
| Cryptography             | The study of encryption and decryption techniques.                                                                                                              |
| Encryption               | Securing digital data using mathematical techniques and a key.                                                                                                  |
| Decryption               | Converting encrypted data back to its original form.                                                                                                            |
| Hashing                  | Mapping data of arbitrary size to fixed-size values, often used for fingerprinting.                                                                              |
| Forensics                | The branch of digital science related to evidence found in computers and storage media.                                                                          |
| Sniffing                 | Monitoring and capturing data packets in a network.                                                                                                             |
| HTTPS                    | Hypertext Transfer Protocol Secure, a secure web protocol.                                                                                                      |
| SSL                      | Secure Sockets Layer, a cryptographic protocol.                                                                                                                 |
| TLS                      | Transport Layer Security, the successor to SSL.                                                                                                                 |
| IP Spoofing              | Creating IP packets with a modified source address to hide the sender's identity.                                                                               |
| Reverse Engineering      | Deconstructing software or devices to extract design information.                                                                                               |
| MITM                     | Man-in-the-Middle, an attack where data between two parties is intercepted and potentially altered.                                                             |
| XSS                      | Cross-Site Scripting, an injection attack on web applications.                                                                                                  |
| SQL Injection            | An attack that exploits vulnerabilities in SQL queries. [Read more here.](https://www.w3schools.com/sql/sql_injection.asp)                                      |
| OWASP                    | Open Web Application Security Project, a nonprofit foundation focused on improving software security.                                                           |
| MASVS                    | Mobile Application Security Verification Standard, part of the OWASP Mobile Security Testing Guide.                                                             |
| Mach-O binary            | The binary format used by iOS and macOS applications.                                                                                                           |

## Jailbreaking and Security Risks

🥸: Why are jailbroken devices a threat to app security?  
💀: Jailbreaking allows users to bypass built-in security features, exposing the app to potential attacks. It’s best practice to prevent jailbroken devices from running your app. Check out my [x04_checker](https://github.com/deya-eldeen/x04_checker) repo for an iOS library that helps detect jailbroken devices.

## Debugging and Logging Concerns

🥸: They say debugging and print statements can be a security risk. Is that true?  
💀: Yes, print statements are only active in development builds, but they can still send data to the USB interface. Also, `NSLog` statements remain in distribution builds, and users can access logs via the macOS Console app. Be careful not to log sensitive data or leave traces of code symbols.

## Certificate Pinning and Static Strings

🥸: What about certificate pinning?  
💀: Certificate pinning prevents attackers from using an invalid certificate to intercept data. Implementing dynamic certificate updates within the app is crucial to prevent tampering.

🥸: And what about sensitive static strings?  
💀: Never store sensitive strings in plist or other asset files. They are easily accessible and can expose your app to risks.

{% 
include centered-image.html
image_path="/images/facebookstring-1024x695.webp"
alt_text="Strings Tool"
caption="This is usage of the `strings` tool, on macos, scanning some APK." 
%}

## The Risks of Third-Party Libraries

🥸: Why are third-party libraries risky for sensitive apps?  
💀: While libraries are generally fine, they should be audited regularly. For sensitive apps, like banking, it’s better to minimize their use to avoid potential vulnerabilities.

## URL-Scheme Attacks and Universal Links

🥸: What about URL-scheme attacks?  
💀: When you define a URL scheme, your app can be launched by any link matching that scheme. However, other apps can register the same scheme, posing a risk. Universal links are a safer alternative.

## Final Thoughts on Mobile Security

💀: Achieving 100% security is impossible, but you can make attacking or cracking your app much more difficult. Remember, security is about increasing the cost and complexity of an attack relative to the value of the data.

Some additional tips:

- Avoid Objective-C if possible; it’s easy to reverse engineer.
- Don’t log sensitive data.
- Disable keyboard caching for third-party keyboards.
- Store user credentials securely in the keystore or keychain.
- Implement App Transport Security and certificate pinning.
- Ensure data on disk and across the network is secure.
- Protect your application logic from reverse engineering.
- Avoid sharing sensitive data with third parties.
- Hide jailbreak detection deep within your app, not in the app delegate.

Security isn’t just about making data impossible to access; it’s about balancing the cost and effort of data retrieval against its importance.

