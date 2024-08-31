---
layout: post
title: "iOS/Android Developer Security Basics"
date: "2022-03-13"
permalink: /ios-android-developer-security-basics
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/security_basics.jpg"
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

I couldn't find a single place that covers the mobile developer security (must know) basics, this will be again like a chat between two developers **(Lulu 👩🏼‍💻)** and **(Sam 🦖)**  
<!--more-->
{%
 include centered-image.html 
 image_path="images/covers/security_basics_full.jpg"
 alt_text="" 
 caption=""
%}

**👩🏼‍💻**: What are the risks of not having good security precautions? I can see we spend big money on security.  
**🦖**: There are over 500 reported incidents of data-breach each year, It's estimated that each incident costs 3.5M~5.0M USD on average.  
If you look at statistics, you can see that remote jobs increased these costs by 15%, since attackers would have more opportunities of attacking a target that is spread on different locations.  



**👩🏼‍💻**: When people talk about security, the server is being presented as the main defense line, why would a mobile developer be concerned with security if the server/website is secure?  
**🦖**: Even if a website is securely developed and maintained, mobile apps still need to implement security best practices, while the server plays an important role, the client-side code in a mobile app can potentially expose users to risks if not developed securely, if the client is poorly written, you should expect a lot of attacks on the server.  
  
Mobile apps have direct access to users' sensitive data like location, contacts, files etc. on their devices, if an app is compromised, it could leak private user information, unlike browsers, mobile apps run locally on devices without the same protections of a browser sandbox, so vulnerabilities in app code could allow malicious actors to directly attack the device.  
  
Many mobile attacks happen by exploiting vulnerabilities in how apps download and execute code. Developers need to ensure app updates and payloads come from verified, untampered sources.  
  
As users spend more time in apps than browsers, mobile presents a larger attack surface. Security needs to be a priority throughout the development and deployment process on both frontend and backend.  
  
**👩🏼‍💻**: But you are an iOS developer, and I develop for Android, would your tips and hints be applicable to Android too? oh, I almost forgot that both are based on Linux.  
**🦖**: wait, they are not both based on Linux, iOS is a **Unix-like Operating System** which is **based on Darwin(BSD)** operating system, while Android is **Linux-based Operating System** and is an open source mobile operating system, there are a lot of precautions that are applicable on both OSs.  
  
**👩🏼‍💻**: I was asking myself in the past, why not rely on HTTPS and that's it?  
**🦖**: HTTPS protects your data in transit between your client application to the server, but only if you can validate the TLS certificate has not been compromised.  
  
**👩🏼‍💻**: What are the mobile weak points? what can be hacked?  
**🦖**: Network , Disk, USB Port, etc...  
  
**👩🏼‍💻**: That looks like a lot of terminology, can you explain the basics?  
**🦖**: You will be good to go if you know these as a start.

* * *

<figure>

<table><tbody><tr><td><strong>Term</strong></td><td><strong>Basic Explanation.</strong></td></tr><tr><td>Authentication</td><td>establish a user’s identity</td></tr><tr><td>Authorization</td><td>grant a user an access to a resource, look up <a href="https://www.sailpoint.com/identity-library/difference-between-authentication-and-authorization/">the difference between Authorization and Authentication</a></td></tr><tr><td>Cryptography</td><td>the study of concepts like Encryption, decryption.</td></tr><tr><td>Encryption</td><td>means of securing digital data using one or more mathematical techniques, along with a password or "key" used to decrypt the information</td></tr><tr><td>Decryption</td><td>the conversion of encrypted data to its original form.</td></tr><tr><td>Hashing</td><td>a hash function is any function that can be used to map data of arbitrary size to fixed-size values, used mainly for fingerprinting.</td></tr><tr><td>Forensics</td><td>a branch of digital forensic science pertaining to evidence found in computers and digital storage media.</td></tr><tr><td>Sniffing</td><td>process of monitoring and capturing all data packets passing through given network</td></tr><tr><td>HTTPS</td><td>Hypertext Transfer Protocol Secure, a web protocol</td></tr><tr><td>SSL</td><td>Secure Sockets Layer</td></tr><tr><td>TLS</td><td>Transport Layer Security (TLS)</td></tr><tr><td>IP Spoofing</td><td>IP spoofing is the creation of Internet Protocol (IP) packets which have a modified source address in order to either hide the identity of the sender</td></tr><tr><td>Reverse Engineering</td><td>is a process in which software, machines, aircraft, architectural structures and other products are deconstructed to extract design information from them.</td></tr><tr><td>MITM</td><td>Man in the middle, it’s a type of a cyber attack where they secretly relay and possibly alter the data&nbsp;between two parties.</td></tr><tr><td>XSS</td><td>Cross Site Scripting (XSS)</td></tr><tr><td>SQL Injection:</td><td><a href="https://www.w3schools.com/sql/sql_injection.asp" title="Read About it here.">Read About it here.</a></td></tr><tr><td>OWASP</td><td>Open Web Application Security Project (<a href="https://owasp.org" title="OWASP">OWASP</a>)</td></tr><tr><td>MASVS</td><td>Mobile Application Security Verification Standard, it’s a sister project of OWASP Mobile Security testing guide.</td></tr><tr><td>Binary</td><td>a non-text encoded file</td></tr><tr><td>Mach-O binary</td><td>Under NeXTSTEP, OPENSTEP, macOS, and iOS, multiple Mach-O files can be combined in a multi-architecture binary</td></tr></tbody></table>

<figcaption>

Basic Terminology

</figcaption>



</figure>

  
**👩🏼‍💻**: Why would people with a jailbroken device be a threat on the app itself, a jailbreak only make the user hackable, right?  
**🦖**: No, The best practice, is to prevent people with Jailbroken devices from running your app, see my [x04\_checker](https://github.com/deya-eldeen/x04_checker "x04_checker") repo, iOS Developers can use it to prevent jailbroken devices from running their applications.  
  
Jailbreaking is the process of exploiting the flaws of a locked-down electronic device to install software other than what the manufacturer has made available for that device. It allows the owner to gain full access to the root of the operating system and access all the features, you must know that 100% jailbreak detection is not possible, we need to make (bypassing jailbreak detection) time-consuming, because an attacker can steal the developer info, and thus steal the app info.  
  
Say a banking app has insufficient security on a jailbroken phone that is compromised, it could result in costly consequences for the banking app operator. For instance, if a user's money is stolen due to their mobile banking app being hacked as a result of the jailbroken phone, the bank may need to reimburse the user even though it was not necessarily the bank's fault.  
  
This is because banks often guarantee protection of users' money from theft, so a breach of security on the mobile app that enables theft could trigger the bank's reimbursement responsibilities regardless of the root cause being the jailbroken phone.  
  
Similarly, social media or other apps with user accounts could face defamation lawsuits if inadequate security on a compromised mobile app allows hackers to use a user's account without their consent due to the jailbroken phone.  
  
In such scenarios, the app operator may have to bear costs due to reputational or legal risks, despite the primary vulnerability being the jailbroken phone.  
  
**👩🏼‍💻**: They say debugging and print statements can be a security vulnerability, is this true?  
**🦖**: Print normally only works on development builds, print will still send the data to the usb interface.  
  
As you mentioned print, It's a heavy command though, even if your debugging device is not connected in debug mode with Xcode, leaving print statement of heavy objects might make your app slower during development, but anyway, this is not our topic.  
  
Keep in mind, NSLog will be left even in Distribution builds, any normal user can see the logs using the macOS console app, I used them when debugging opening the app using a notification when it's terminated, this is not easy to do in Xcode directly, anyway, just use NSLog carefully, and treat the error log files with care, don't log sensitive data, or leave trace of code symbols.  
  
With regards to logging on mobile apps, a common security concern is the potential leakage of personally identifiable information (PII) about users. Sensitive data like users' names, financial account details, physical locations and other personal information could inadvertently be written to log files if not properly scrubbed or encrypted.  
  
This exposes the risk of PII being accessed and misused by unauthorized parties who gain access to the device's logs. Such access could occur either after the fact if the device is stolen, or even in real-time if a hacker manages to achieve remote access. Proper handling of logging is important to prevent such PII leaks that can negatively impact users' privacy and security.  
  
**👩🏼‍💻**: What about certificate pinning?  
**🦖**: Certificate pinning simply prevents people from having the victim installing an incorrect certificate and making altered requests.  
  
When implementing TLS pinning, bundling the certificate within the mobile app may not be the most suitable approach on its own. While including a default certificate is reasonable, the app should also incorporate the ability to dynamically update the pinned certificate if the server's certificate expires or needs revocation. Any bundled certificate would also need to be encrypted in a way that prevents attackers from simply replacing the file on the device.  
  
This is to ensure the certificate can be refreshed securely over time, while an attacker cannot tamper with the pinned certificate to circumvent TLS validation. A more robust TLS pinning implementation would account for eventual certificate changes on the server through a secure update mechanism within the app.  
  
**👩🏼‍💻**: What about sensitive static strings?  
**🦖**: Never have your sensitive strings inside plist or any asset file, this is the most basic tip you should never miss.  
**👩🏼‍💻**: Wait Sam, I downloaded a facebook apk online, and ran a simple command to scan the binary for strings that look similar to google api keys, that begin with AIz, and I can see this, any explanation why this is not hidden in the binary?  
  
 `strings targetFile | grep "targetString"`

<figure>

![](images/facebookstring-1024x695.jpeg)

<figcaption>

using the strings command on macos

</figcaption>

</figure>

**🦖**: There are multiple ways google makes sure that a request is authentic, from comparing hashes, to domain binding to bundle ids etc... again, you need to have your sensitive data hidden, this is not an excuse.  
  
**👩🏼‍💻**: Why is it said to be risky to use 3rd party libraries when developing sensitive apps like banks?  
👨🏻‍💻: In normal cases, libraries are fine, just make sure that they are being audited, NPM libraries had a lot of these, for sensitive apps, it's better to avoid them altogether.  
  
**👩🏼‍💻**: If I follow all of these tips, I will be completely secure?  
**🦖**: The sad news is, No, there are a lot of other attacks, like URL-scheme attacks, when you define a url scheme, your app responds to that scheme, so for instance, you create a scheme myapp://. all links starting with your scheme will directly launch your app. A universal link doesn't include your scheme in the url but they will still launch your application, apple allows other apps to the register the same url.  
**👩🏼‍💻**: the alternative is universal links?  
**🦖**: correct!  
  
**👩🏼‍💻**: That was a huge amount of info for a starter, any final thoughts?  
**🦖**: 100% Security for any Application is not possible but we can try to make the attacking/cracking of iOS App as much harder as possible.  
  
Security is not always about "make accessing the data impossible". sometimes it is about cost and likelihood of retrieval versus importance of the data.

More tips on top of my head:

- Avoid Objective-C if possible, it’s very easy to reverse engineer.

- Don't write sensitive data into logs.

- Disable Keyboard caching (3rd party keyboard)

- Password/Pin should not be exposed during user interaction - Don't include sensitive data in backup.

- User Credentials should be stored in (keystore, keychain…).

- App Transport Security - Certificate Pinning.

- Integrity Check.

- Prevent Running on rooted devices.

- Detect JailBreak, (Jail Monkey library).

- Use WebView carefully.

- Securing Data on disk.

- Securing Data across a network connection.

- Secure application logic.

- prevent Reverse Engineering (even if there is no sensitive data, if your app is novel, you don't want people to see the code)

- Don't share sensitive data with 3rd party

- Avoid keywords like (“jail”,”security”,”cydia”,”apt”) in variable & function names

- Hide the JB check deep in the app, not in appdelegate…

- Some Jailbreaks are permanent, and are done by exploiting security flaws in hardware.
