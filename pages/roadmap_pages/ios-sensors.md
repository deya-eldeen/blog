---
layout: page
title: "Sensors and Location in iOS"
subtitle: "Turn device signals into useful features while respecting accuracy and energy"
permalink: /ios-sensors/
hide: true
excluded: true
---

Work with motion, location, and environmental measurements as fallible streams of data. The series covers permissions, coordinate systems, signal quality, and lifecycle cleanup, and each article ends with an exercise.

Every claim is measured. The examples use Swift 6 language mode and were compiled and run with the Swift 6.4 toolchain from Xcode 27.1. Core Location and Core Motion code ran in an app-hosted test bundle on an iPhone 17 simulator running iOS 27.0, with routes scripted by `simctl` and the real permission alerts and Settings switches tapped by a UI test. The simulator has no motion sensors, so the motion articles pair Apple's documented behavior with simulations from stated sensor models, each checked against the formula it should reproduce, and the [simulator article](/ios-sensors-simulator-vs-device/) lists what still needs a device. The testing articles are Swift packages run with `swift test`.

{% include roadmap/legend.liquid %}

## 1. Availability and Permissions

- [Checking Sensor Availability Before Starting Work](/ios-sensor-availability/)
- [Requesting Motion and Location Permissions in Context](/ios-sensor-permissions/)
- [Handling Permission Changes and Reduced Accuracy](/ios-location-permission-changes/)
- [Device Testing vs. Simulator Capabilities](/ios-sensors-simulator-vs-device/)
{: .roadmap-topics}

## 2. Motion and Orientation

- [Accelerometer and Gyroscope Measurements](/ios-accelerometer-gyroscope/)
- [Device Motion, Gravity, and User Acceleration](/ios-device-motion/)
- [Attitude, Reference Frames, and Coordinate Conversion](/ios-attitude-reference-frames/)
- [Pedometer Data and Activity Recognition](/ios-pedometer-activity/)
- [Altitude, Pressure, and Relative Measurements](/ios-altimeter-pressure/)
- [Sampling Rates, Noise, Filtering, and Drift](/ios-sensor-sampling-filtering/)
{: .roadmap-topics}

## 3. Location and Heading

- [Location Updates and Accuracy Requirements](/ios-location-updates-accuracy/)
- [Distance Filters and Energy-Aware Tracking](/ios-location-distance-filter-energy/)
- [Heading, Compass Calibration, and Magnetic Interference](/ios-heading-compass/)
- [Region Monitoring and Geofencing](/ios-region-monitoring-geofencing/)
- [Visits and Significant Location Changes](/ios-visits-significant-location-changes/)
- [Geocoding, Reverse Geocoding, and Request Limits](/ios-geocoding/)
- [Background Location and App Lifecycle Boundaries](/ios-background-location/)
{: .roadmap-topics}

## 4. Interpreting Sensor Streams

- [Timestamps, Stale Samples, and Out-of-Order Events](/ios-sensor-timestamps/)
- [Combining Motion and Location Without Shared-State Races](/ios-combining-motion-location/)
- [Distinguishing Missing Data from a Valid Zero Reading](/ios-sensor-missing-data/)
- [Designing Features Around Uncertainty and Accuracy](/ios-sensor-uncertainty/)
{: .roadmap-topics}

## 5. Testing and Resource Use

- [Injecting Recorded Sensor Data for Deterministic Tests](/ios-sensor-recorded-data-tests/)
- [Testing Unavailable Hardware and Denied Permissions](/ios-sensor-testing-unavailable-denied/)
- [Stopping Updates When a Feature Ends](/ios-sensor-stopping-updates/)
- [Profiling Sensor Work and Battery Usage](/ios-sensor-profiling-battery/)
{: .roadmap-topics}

{% include roadmap/guide_footer.liquid next_url="/ios-accessibility/" next_title="Accessibility" %}
