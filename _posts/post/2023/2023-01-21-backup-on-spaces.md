---
layout: post
title: "Why I Prefer To Store My Files On A Digital Ocean Space & Not Google Drive Or Dropbox."
date: "2023-01-21"
last_modified_at: "2024-09-08"
permalink: /backup-on-spaces/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/do_space.webp"
categories: 
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
tags:
  - "Development"
  - "iOS"
  - "Programming"
  - "Swift"
---

This is not directly related to swift or iOS, but thought it's worth sharing, since I couldn't find any article that mention such way to backup files.

I'm one of those who experienced the evolution of data storage firsthand, starting with floppy disks to back up HTML pages—specifically 3DMax tutorials—during my visits to internet cafés back in 2003. As technology advanced, I transitioned to using CDs, followed by DVDs, which offered greater storage capacity. 

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/do_space_full.webp"
 alt_text="" 
 caption=""
 width="960" 
 height="1568"
%}

I vividly remember the first flash drive my father gifted me as a teenager; it had a mere 128 MB of storage. At that time, such a device was considered a luxury and not affordable for many where I live. Fast forward to today, and we now have SSDs that are over 1000 times larger in capacity and available at significantly lower prices.

## Cloud Storage
In the realm of cloud storage, common solutions like Google Drive and Dropbox offer plans, such as a 2TB option for $10 monthly. However, I prefer utilizing my own mountable drive integrated with a Content Delivery Network (CDN) for distributing my files efficiently. The best solution I've found for storing my work is using DigitalOcean Spaces, which is similar to AWS S3. I can conveniently mount it using a client like Cyberduck on my Mac, or on any device I own, allowing for seamless access and management of my files. This approach not only provides me with greater control over my data but also enhances my ability to share and distribute content effectively.

{%
 include centered-image.html 
 image_path="/images/posts/image-2.webp"
 alt_text="" 
 caption="Cyberduck, showing a Digital Ocean drive"
%}


Serving static websites on DigitalOcean Spaces is entirely feasible by leveraging its S3-compatible object storage capabilities. To get started, you can upload your HTML, CSS, and JavaScript files directly to a Space, which acts as a repository for your website assets.

Even serving static websites, such as React applications or Jekyll blogs, on DigitalOcean Spaces is entirely feasible by leveraging its S3-compatible object storage capabilities. To get started, you can upload your website files—whether they are HTML, CSS, JavaScript. For example, when deploying a React app, you can build your project and upload the contents of the build folder to the Space. Similarly, for a Jekyll blog, you can generate the static site and upload the resulting files to your Space. Although DigitalOcean Spaces doesn’t natively support custom domains, you can set up a reverse proxy server using NGINX on a DigitalOcean Droplet to map your domain to the Space, allowing your static site to be accessed via your custom URL. This combination of tools enables you to efficiently serve your static websites while taking advantage of the scalability and performance of DigitalOcean's infrastructure.

## Pros & Cons

When considering a storage solution, it's essential to weigh the advantages and disadvantages to determine the best fit for your needs. DigitalOcean Spaces offers a range of benefits that make it an appealing choice for developers and businesses alike. From cost-effectiveness to enhanced control over your files, the pros of using DigitalOcean Spaces can significantly enhance your workflow and file management capabilities. Below, we outline the key advantages of utilizing DigitalOcean Spaces, as well as some potential drawbacks to keep in mind, ensuring you have a comprehensive understanding of this powerful storage solution.

### Pros

- **Direct Links**: Easily access your files with straightforward URLs, allowing for seamless integration into your applications and workflows.
  
- **Cost-Effective**: With plans starting as low as $5, DigitalOcean Spaces provides an economical solution for storing and serving your data, making it accessible for individuals and small businesses alike.

- **Bandwidth Savings**: Setting up a Content Delivery Network (CDN) is simple, enabling you to save significant amounts of bandwidth and avoid exceeding transfer caps, which is especially beneficial for high-traffic applications.

- **Granular Control**: You have total control over metadata and content types of your files. For example, you can specify whether an uploaded MP4 file is streamable or downloadable, tailoring the user experience to your needs.

- **Cross-Device Compatibility**: DigitalOcean Spaces can be easily mounted on any device or server, providing flexibility and accessibility regardless of your operating system or hardware.

- **Active File Serving**: Unlike traditional storage solutions, your files are actively served, allowing you to host dynamic content, such as an Angular website, without placing additional load on your server.

- **Custom URL Masking**: You can mask the URL to reflect your own domain, enhancing professionalism and branding when presenting to clients or stakeholders during demos.

### Cons

- **Technical Knowledge Requirement**: Some users may find that utilizing DigitalOcean Spaces requires a certain level of technical knowledge, which could be a barrier for those unfamiliar with cloud storage solutions.

- **Limited Client Options**: Many desktop clients used to mount such drives are not open source or free, which may limit accessibility for some users.

- **File Sharing Limitations**: Files stored in DigitalOcean Spaces cannot be shared with specific individuals; they are either public or private, which may not suit all collaboration needs.

### Security

DigitalOcean Spaces offers robust security features designed to protect your data effectively. One of the key aspects is access control, which allows users to manage permissions for files stored in Spaces.

### Use cases are infinite!

The versatility of DigitalOcean Spaces opens up a myriad of use cases that can significantly enhance productivity and efficiency. For instance, if you're involved in web scraping, you can effortlessly download large YouTube channels as a background job on the server. This approach allows you to avoid consuming your internet bandwidth while eliminating the need to keep a device running for extended periods. Instead, the files are stored directly in your DigitalOcean Space, making them readily accessible whenever you need them, without the hassle of local storage management. 🧐

Moreover, DigitalOcean Spaces functions similarly to a Network Attached Storage (NAS) solution, providing a centralized location for all your files that can be accessed from multiple devices. This capability is particularly beneficial for teams or individuals who require seamless file sharing and collaboration. Additionally, it can serve as a media center, allowing you to host and stream your multimedia content efficiently. Whether you’re managing a portfolio of projects, sharing resources with colleagues, or simply organizing personal media, the possibilities are truly endless with DigitalOcean Spaces.

Another innovative use case for DigitalOcean Spaces is as a centralized repository for continuous integration and deployment (CI/CD) pipelines. Software engineers can utilize Spaces to store build artifacts, such as compiled binaries, Docker images, or deployment packages, generated during the CI/CD process. By configuring your CI/CD tools to upload these artifacts directly to DigitalOcean Spaces, you can ensure that all necessary files are easily accessible for deployment across various environments. This setup not only streamlines the deployment process but also provides a reliable and scalable solution for managing versioned artifacts, making it easier to roll back to previous versions if needed. Additionally, you can integrate Spaces with other services, such as monitoring and alerting tools, to keep track of deployment statuses and ensure smooth operations throughout the software development lifecycle.

I’d love to hear how others are using DigitalOcean Spaces in their projects! Whether you’re leveraging it for web hosting, data storage, or as part of your CI/CD pipeline, your experiences and tips could be incredibly valuable. Share your thoughts and use cases in the comments below—let’s learn from each other!
