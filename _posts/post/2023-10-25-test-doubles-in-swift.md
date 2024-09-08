---
layout: post
title: "Test Doubles In Swift"
date: "2023-10-25"
last_modified_at: "2024-09-08"
permalink: /test-doubles-in-swift/
excerpt_separator: <!--more-->
author: deyaeldeen
thumbnail: "images/covers/test_doubles.jpg"
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
redirect_from:
  - /test-doubles-in-swift-part-1
---
The term **test doubles** draws inspiration from **stunt doubles** in the movie industry, where a stunt double steps in to perform dangerous or complex tasks, allowing the actor to focus on their role. Similarly, in software testing, test doubles step in to replace real components, making testing simpler, faster, and more reliable.

<!--more-->

{%
 include centered-image.html 
 image_path="../images/covers/test_doubles_full.jpg"
 alt_text="" 
 caption=""
%}

Testing is an essential part of software development, ensuring the correctness and reliability of our code. However, when we test systems with many dependencies—like databases, web services, or external APIs—writing reliable tests can become challenging. This is where test doubles come in handy.

It's important to understand the basics of unit testing, see this blog post [Gentle Introduction to Unit Testing]({{ site.url }}/gentle-introduction-to-unit-testing/), especially since certain architectural patterns, like MVC can introduce complexities that make them less testable. Familiarity with the FIRST principles—Fast, Independent, Repeatable, Self-validating, and Timely—is crucial for writing effective tests. Additionally, it's vital to recognize that flaky tests, which produce inconsistent results, can undermine the reliability of your testing suite and lead to wasted time and effort.

In this post, we’ll explore the different types of test doubles, their purpose, and practical examples. By the end, you’ll be able to confidently use them to create more effective, reliable tests.

## What is a Test Double?
A **test double** is a substitute that stands in for a real dependency during testing. These dependencies, which can include external services, databases, or complex components, often introduce complexity that makes testing challenging. Test doubles enable us to isolate the code under test and concentrate on specific behaviors, resulting in more predictable and efficient tests. By using test doubles, we can create controlled environments that facilitate thorough testing without the overhead of managing real dependencies. This revision broadens the definition of a test double while maintaining clarity and focus on its purpose in testing.

Test doubles mimic the behavior of real dependencies, but they provide simplified or controlled implementations. By replacing real dependencies with test doubles, we create an environment where we control every interaction, avoiding side effects from external systems.

### Types of Test Doubles

There are five common types of test doubles, each serving a distinct purpose:

1. **Dummy**
2. **Fake**
3. **Stub**
4. **Spy**
5. **Mock**

Let's dive into each of these with practical Swift examples. We'll use a sample `UserManager` class that has dependencies carefully picked for demonstrating all types of test doubles, it may be needed to create multiple test doubles of different types for each dependency in some cases, this depends on the test cases needs, but in this example, only one test double is created for each dependency, for demo purpose.

`UserManager` also uses default values that can be changed, this is dependency injection by init.

```swift
// UserManager.swift
class UserManager {
    let loggerService: LoggerService
    let cacheService: CacheService
    let database: DatabaseHelper
    let securityHelper: SecurityHelper
    let notificationService: NotificationService

    init(
        logger: LoggerService = LoggerServiceImpl(),
        cache: CacheService = CacheServiceImpl(),
        database: DatabaseHelper = DatabaseHelperImpl(),
        securityHelper: SecurityHelper = SecurityHelperImpl(),
        notificationService: NotificationService = NotificationServiceImpl()
    ) {
        self.loggerService = logger
        self.cacheService = cache
        self.database = database
        self.securityHelper = securityHelper
        self.notificationService = notificationService
    }
    
    func authenticate(username: String, password: String) -> Bool {
        loggerService.log("Authenticating user \(username) \(password)")
        
        // Check cache first
        if let cachedPasswordHash = cacheService.get(username) {
            loggerService.log("Cache hit for user \(username)")
            let success = cachedPasswordHash == password.hashed()
            securityHelper.recordAuthenticationAttempt(username: username, success: success)
            notificationService.sendAuthenticationEmail(username: username, success: success)
            return success
        }
        
        // Fetch from database if not in cache
        loggerService.log("Cache miss for user \(username)")
        if let passwordHash = database.getUserPasswordHash(username: username) {
            cacheService.set(username, value: passwordHash)
            let success = passwordHash == password.hashed()
            securityHelper.recordAuthenticationAttempt(username: username, success: success)
            notificationService.sendAuthenticationEmail(username: username, success: success)
            return success
        }
        
        loggerService.log("Authentication failed for user \(username)")
        securityHelper.recordAuthenticationAttempt(username: username, success: false)
        notificationService.sendFailedAuthenticationAttemptEmail(username: username, success: false)
        return false
    }
    
    func register(username: String, password: String) -> Bool {
        // Check if the username is valid
        guard !username.isEmpty, !password.isEmpty else {
            loggerService.log("Registration failed: Username or password is empty.")
            return false
        }
        
        // Check if the username already exists in the database
        if database.getUserPasswordHash(username: username) != nil {
            loggerService.log("Registration failed: Username \(username) already exists.")
            return false // Username already taken
        }
        
        // Hash the password for storage
        let passwordHash = password.hashed()
        
        // Add the user to the database
        database.addUser(username: username, passwordHash: passwordHash)
        
        // Optionally, cache the newly created user
        cacheService.set(username, value: passwordHash)
        
        // Log the successful registration
        loggerService.log("User \(username) registered successfully.")
        
        // Send a notification email (optional)
        notificationService.sendRegistrationEmail(username: username, success: true)
        
        return true
    }

}
```

Below you can see the protocols used to create our dependencies, for example the `LoggerService` protocol can be used to either created a `LoggerServiceImpl` or `DummyLogger`, and the same goes for other dependencies, each protocol can be used to create either an implementation or a test double, this way we ensure the code is properly testable, we can simply plug in whatever needed in the `UserManager`.

```swift
// LoggerService.swift
protocol LoggerService {
    func log(_ message: String)
}
```
```swift
// CacheService.swift
protocol CacheService {
    func get(_ key: String) -> String?
    func set(_ key: String, value: String)
}
```
```swift
// DatabaseHelper.swift
protocol DatabaseHelper {
    func getUserPasswordHash(username: String) -> String?
    func addUser(username: String, passwordHash: String)
}
```
```swift
// SecurityHelper.swift
protocol SecurityHelper {
    func recordAuthenticationAttempt(username: String, success: Bool)
}
```
```swift
// NotificationService.swift
protocol NotificationService {
    func sendAuthenticationEmail(username: String, success: Bool)
    func sendRegistrationEmail(username: String, success: Bool)
    func sendFailedAuthenticationAttemptEmail(username: String, success: Bool)
}
```

Below is a simple hasher, this is simplified for demo purpose.

```swift
// String+Hasher.swift
extension String {
    func hashed() -> String {
        return "hashed_\(self)" // Simplified hash for demo purpose.
    }
}
```

Below you can find the implementations we will be using in production code, this is useful to compare when reading about the test double examples.

```swift
// LoggerServiceImpl.swift
class LoggerServiceImpl: LoggerService {
    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.yourapp", category: "default")
    func log(_ message: String) {
        logger.log("Log: \(message)")
    }
}
```
```swift
// CacheServiceImpl.swift
class CacheServiceImpl: CacheService {
    private var cache: [String: String] = [:]
    
    func get(_ key: String) -> String? {
        return cache[key] // Retrieve value from cache
    }
    
    func set(_ key: String, value: String) {
        cache[key] = value // Store value in cache
    }
}
```
```swift
// DatabaseHelperImpl.swift
class DatabaseHelperImpl: DatabaseHelper {
    private var users: [String: String] = [:] // Simulated user password storage
    
    func getUserPasswordHash(username: String) -> String? {
        return users[username] // Retrieve password hash for the given username
    }
    
    // Helper method to add users to the database for testing purposes
    func addUser(username: String, passwordHash: String) {
        users[username] = passwordHash // Add user to the simulated database
    }
}
```
```swift
// SecurityHelperImpl.swift
class SecurityHelperImpl: SecurityHelper {
    private let logFileURL: URL
    
    init() {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        logFileURL = documentsURL.appendingPathComponent("authentication_log.txt")
    }
    
    func recordAuthenticationAttempt(username: String, success: Bool) {
        let logEntry = "\(Date()): Authentication attempt for \(username): \(success ? "Success" : "Failure")\n"
        
        do {
            try logEntry.write(to: logFileURL, atomically: true, encoding: .utf8)
        } catch {
            print("Error writing to log file: \(error)")
        }
    }

    func readAuthenticationAttempts() -> [(username: String, success: Bool)] {
        var attempts: [(username: String, success: Bool)] = []
        
        do {
            let logContents = try String(contentsOf: logFileURL, encoding: .utf8)
            let lines = logContents.split(separator: "\n")
            
            for line in lines {
                // Parse each line to extract the username and success status
                let components = line.split(separator: ":")
                if components.count >= 3 {
                    let username = components[2].split(separator: " ")[3] // Extract the username
                    let successString = components[3].trimmingCharacters(in: .whitespaces) // Extract "Success" or "Failure"
                    let success = successString == "Success"
                    attempts.append((username: String(username), success: success))
                }
            }
        } catch {
            print("Error reading log file: \(error)")
        }
        
        return attempts
    }
}
```
```swift
// NotificationServiceImpl.swift
class NotificationServiceImpl: NotificationService {
    func sendAuthenticationEmail(username: String, success: Bool) {
        // Here you could implement logic to send an email notification
        print("Sent authentication email to \(username): \(success ? "Success" : "Failure")")
    }

    func sendFailedAuthenticationAttemptEmail(username: String, success: Bool) {
        // Here you could implement logic to send an email notification for a failed attempt
        print("Sent failed authentication attempt email to \(username)")
    }
    
    func sendRegistrationEmail(username: String, success: Bool) {
        // Here you could implement logic to send an email notification for registration
        print("Sent registration email to \(username)")
    }
}
```

After getting familiar with `UserManager`, Let's explore the different types of test doubles, along with examples and further details.

## 1. Dummies

A **dummy** test double is the simplest form of a test double. It's used when a parameter is required by the method signature but isn't actually used by the method itself. It’s essentially a placeholder to satisfy the API.

### Example:

```swift
// DummyLogger.swift
class DummyLogger: LoggerService {
    func log(_ message: String) {
        // No-op: This dummy logger does nothing
    }
}
```

In this example, `DummyLogger` is a **dummy** that satisfies the `LoggerService` protocol, but doesn't actually perform any actions. It’s only used to fulfill the constructor requirements, notice that it has no `Logger`, in the unit tests cases, you can see the usage of that dummy, only to satisfy the needs we have.

If we had a complicated logging system that is supposed to be tested, we simply create another test double for the `LoggerService`, but again, we are trying to demonstrate the different types of test doubles, and the logger in this case seems to be the most simple dependency.

## 2. Fakes

A **fake** object provides a working implementation, but it is simpler and often less efficient than the real one. Fakes are often used to simulate databases or services during testing.

### Example:

```swift
class FakeDatabase: DatabaseHelper {
    var users: [String: String] = [:] // Simulated user password storage
    
    func getUserPasswordHash(username: String) -> String? {
        return users[username]
    }
    
    // Helper method to add users to the fake database
    func addUser(username: String, passwordHash: String) {
        users[username] = passwordHash
    }
}
```

Here, the `FakeDatabase` simulates a database with an in-memory data structure, making it useful for testing without involving a real database. The original implementation is similar due to the demo-purpose, we can have the original implementation to really talk to a simple sqlite database or a coredata database.

The fake test double only does a dictionary manipulation, using an original database example will make this blog post very lengthy, in the next example we can see a usage of user defaults.

## 3. Stubs

A **stub** is a test double that provides predefined answers to method calls. Stubs don’t perform any logic; they just return canned responses. Stubs are helpful when you want to control the return values of a dependency in a test scenario.

### Example:

```swift
// StubCache.swift
class StubCache: CacheService {
    var storedData: [String: String] = [:]
    
    func get(_ key: String) -> String? {
        return storedData[key] // Simulates cache hit or miss
    }
    
    func set(_ key: String, value: String) {
        storedData[key] = value // Simulates setting a value in the cache
    }
}
```

If we compare with the original implementation, stubs use a dictionary to store data, instead of using `UserDefaults`.

```swift
// CacheServiceImpl.swift
class CacheServiceImpl: CacheService {
    private let userDefaults = UserDefaults.standard
    
    func get(_ key: String) -> String? {
        return userDefaults.string(forKey: key) // Retrieve value from UserDefaults
    }
    
    func set(_ key: String, value: String) {
        userDefaults.set(value, forKey: key) // Store value in UserDefaults
    }
}
```

> Note: Stubs provide canned responses to method calls, while fakes provide a simplified implementation of the real thing.

> Note: the usage of UserDefaults should not be used with critical data storage like passwords, even if hashed, this is only for demo purpose.

## 4. Spies

A **spy** is a test double that records information about the interactions with its methods, such as how many times a method was called or with what arguments. This makes it useful for verifying side effects in your tests.

### Example:

```swift
// SpySecurityHelper.swift
class SpySecurityHelper: SecurityHelper {
    var recordedAttempts: [(username: String, success: Bool)] = []
    
    func recordAuthenticationAttempt(username: String, success: Bool) {
        recordedAttempts.append((username, success))
    }
    
    // Helper method to check whether a specific attempt was recorded
    func verifyAttempt(username: String, success: Bool) -> Bool {
        return recordedAttempts.contains { $0.username == username && $0.success == success }
    }
    
    // Helper method to check the total number of attempts
    func verifyTotalAttempts(expectedCount: Int) -> Bool {
        return recordedAttempts.count == expectedCount
    }
}
```

We can see that the `SpySecurityHelper` is more simple than the original implementation, the spy test double records all attempts of login, and checks the side effects of the dependency.

## 5. Mocks

A **mock** is the most sophisticated type of test double. It allows you to set expectations about interactions with the object and verify that those expectations are met. Mocks are often used in combination with testing frameworks.

### Example:

```swift
// MockNotificationService.swift
class MockNotificationService: NotificationService {
    var sentEmails: [(username: String, success: Bool)] = []
    
    func sendRegistrationEmail(username: String, success: Bool) {
        sentEmails.append((username, success))
    }

    func sendAuthenticationEmail(username: String, success: Bool) {
        sentEmails.append((username, success))
    }

    func sendFailedAuthenticationAttemptEmail(username: String, success: Bool) {
        sentEmails.append((username, success))
    }

    // Helper to verify that an email was sent
    func verifyEmailSent(to username: String, success: Bool) -> Bool {
        return sentEmails.contains { $0.username == username && $0.success == success }
    }
    
    // Helper to verify the total number of emails sent
    func verifyTotalEmailsSent(expectedCount: Int) -> Bool {
        return sentEmails.count == expectedCount
    }
}
```

## Sample Code

It's best to use a real project to test our the code, you can download the source code [Here](assets/test_doubles.zip).

{%
 include centered-image.html 
 image_path="/images/auth_screen.png"
 alt_text="" 
 caption="Simple SwiftUI Screen"
%}



## Conclusion

Test doubles are a powerful concept that can significantly improve the reliability and maintainability of your tests. Whether you're using dummies, fakes, stubs, spies, or mocks, each type of test double serves a unique purpose in ensuring your code is thoroughly tested in isolation.

By understanding when and how to use each type, you’ll be able to write more focused and effective unit tests in Swift, ensuring your code is both high quality and easier to maintain.

**Happy testing!** 🎉
