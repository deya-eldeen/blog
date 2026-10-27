---
layout: page
title: "Audio and Video in iOS"
subtitle: "Playback, capture, and media processing with deliberate resource ownership"
permalink: /ios-audio-video/
hide: true
excluded: true
---

Build media features around playback state, capture lifetimes, and the resources they own. This outline spans AVFoundation, AVKit, audio sessions, export, and testing. Each entry is a future article topic.

{% include roadmap/legend.liquid %}

## 1. Media Foundations

- Assets, Tracks, Formats, and Time Ranges
- Representing Media Time with `CMTime`
- Loading Asset Properties Asynchronously
- Camera and Microphone Permissions
- Choosing AVKit Controls vs. a Custom Player UI
{: .roadmap-topics}

## 2. Audio Sessions and Playback

- Audio Session Categories, Modes, and Options
- Handling Interruptions and Route Changes
- Playing Audio Files and Managing Playback State
- Building Audio Graphs with `AVAudioEngine`
- Recording Audio and Managing Output Files
- Background Audio and Now Playing Controls
{: .roadmap-topics}

## 3. Video Playback

- `AVPlayer`, Player Items, and Playback Readiness
- Buffering, Stalling, and Recoverable Playback Failures
- Seeking, Scrubbing, and Synchronizing Progress
- Observers, Time Callbacks, and Player Teardown
- Subtitles, Audio Tracks, and Accessible Playback
- Picture in Picture and Playback Lifecycle
{: .roadmap-topics}

## 4. Capture and Processing

- Configuring an `AVCaptureSession`
- Camera Preview, Orientation, and Capture Coordinates
- Capturing Photos and Recording Video
- Reading and Writing Media Samples
- Compositions, Trimming, and Audio-Video Synchronization
- Export Progress, Cancellation, and Partial-File Cleanup
{: .roadmap-topics}

## 5. Reliability and Performance

- Handling Permission Changes and Unavailable Hardware
- Testing Playback and Capture with Controlled Fixtures
- Synchronizing UI State with Media Events
- Measuring Memory, Energy, and Frame Delivery
- Releasing Capture Devices and Media Resources Reliably
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/ios-sensors/" next_title="Sensors" %}
