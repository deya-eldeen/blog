---
layout: page
title: "Sensors and Location in iOS"
subtitle: "Turn device signals into useful features while respecting accuracy and energy"
permalink: /ios-sensors/
hide: true
excluded: true
---

Work with motion, location, and environmental measurements as fallible streams of data. This outline emphasizes permissions, coordinate systems, signal quality, and lifecycle cleanup. The titles are ready for future articles; no article content is published here yet.

{% include roadmap/legend.liquid %}

## 1. Availability and Permissions

- Checking Sensor Availability Before Starting Work
- Requesting Motion and Location Permissions in Context
- Handling Permission Changes and Reduced Accuracy
- Device Testing vs. Simulator Capabilities
{: .roadmap-topics}

## 2. Motion and Orientation

- Accelerometer and Gyroscope Measurements
- Device Motion, Gravity, and User Acceleration
- Attitude, Reference Frames, and Coordinate Conversion
- Pedometer Data and Activity Recognition
- Altitude, Pressure, and Relative Measurements
- Sampling Rates, Noise, Filtering, and Drift
{: .roadmap-topics}

## 3. Location and Heading

- Location Updates and Accuracy Requirements
- Distance Filters and Energy-Aware Tracking
- Heading, Compass Calibration, and Magnetic Interference
- Region Monitoring and Geofencing
- Visits and Significant Location Changes
- Geocoding, Reverse Geocoding, and Request Limits
- Background Location and App Lifecycle Boundaries
{: .roadmap-topics}

## 4. Interpreting Sensor Streams

- Timestamps, Stale Samples, and Out-of-Order Events
- Combining Motion and Location Without Shared-State Races
- Distinguishing Missing Data from a Valid Zero Reading
- Designing Features Around Uncertainty and Accuracy
{: .roadmap-topics}

## 5. Testing and Resource Use

- Injecting Recorded Sensor Data for Deterministic Tests
- Testing Unavailable Hardware and Denied Permissions
- Stopping Updates When a Feature Ends
- Profiling Sensor Work and Battery Usage
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/ios-accessibility/" next_title="Accessibility" %}
