@operations @connected-apps
Feature: A donor turns push notifications on for this device, chooses which ones it gets and gets a confirmation

  Background:
    Given today is 2026-11-12
    And a person "Jana" is registered

  Scenario: A device turns notifications on under the server's key, and the confirmation reaches it encrypted with its kind and the notification to show, without a count
    When "Jana" asks for the push notifications on the device "telefon"
    Then the response status is 200
    And the push settings carry the server's public key
    And the push settings say the session names a device
    And the push notifications say this device gets none
    When "Jana" turns push notifications on for the device "telefon" at "https://web.push.apple.com/QGuQyavXutnMH-0NxCKP"
    Then the response status is 200
    And the device says service "apple" with gifts on and yearly receipts on
    When "Jana" asks for the push notifications on the device "telefon"
    Then the push settings carry the same public key as before
    And the push notifications say this device gets them from service "apple" with gifts on and yearly receipts on, never delivered
    And the push notifications list the devices "telefon" of "Jana"
    When "Jana" sends a test push notification on the device "telefon"
    Then the response status is 200
    And the test push alert reached 1, failed for 0 and removed 0 devices
    And the device "telefon" of "Jana" received the push alert:
      """
      {"v":1,"kind":"donor-test","notification":{"title":"Upozornění fungují","body":"Dáme vám vědět, až dorazí váš dar.","tag":"nfnn-donor-test","renotify":true,"lang":"cs","icon":"/icon-192.png","data":{"kind":"donor-test","onActionClick":{"default":{"operation":"focusLastFocusedOrOpen","url":"/darce/udaje"}}}}}
      """
    When "Jana" asks for the push notifications on the device "telefon"
    Then the push notifications say this device gets them from service "apple" with gifts on and yearly receipts on, delivered

  Scenario: The device chooses its notifications, turning them on again keeps one subscription, and each device sees only its own switches
    Given "Jana" turned push notifications on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    And "Jana" turned push notifications on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/jana"
    When "Jana" changes the push notifications of the device "telefon" to gifts off and yearly receipts on
    Then the response status is 200
    And the device says service "google" with gifts off and yearly receipts on
    When "Jana" turns push notifications on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon-znovu" with gifts off and yearly receipts off
    Then the response status is 200
    And the device says service "google" with gifts off and yearly receipts off
    And 2 push notification subscriptions of "Jana" are stored
    When "Jana" asks for the push notifications on the device "notebook"
    Then the push notifications say this device gets them from service "mozilla" with gifts on and yearly receipts on, never delivered
    And the push notifications list the devices "telefon, notebook" of "Jana"
    When "Jana" sends a test push notification on the device "notebook"
    Then the test push alert reached 1, failed for 0 and removed 0 devices
    And the device "telefon" of "Jana" received no push alert

  Scenario: A device turns its notifications off, twice without harm, and then has nothing to change or test
    Given "Jana" turned push notifications on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When "Jana" turns push notifications off for the device "telefon"
    Then the response status is 204
    And no push notification subscription of "Jana" is stored
    When "Jana" turns push notifications off for the device "telefon"
    Then the response status is 204
    When "Jana" changes the push notifications of the device "telefon" to gifts on and yearly receipts on
    Then the response status is 404
    And the problem type ends with "operations/push-subscription-not-found"
    When "Jana" sends a test push notification on the device "telefon"
    Then the response status is 404
    And no push alert was sent

  Scenario: An address of no known push service, a session without a device, a public computer, a signed-out device and the eleventh device are refused
    When "Jana" turns push notifications on for the device "telefon" at "https://169.254.169.254/latest/meta-data"
    Then the response status is 400
    And the problem type ends with "operations/push-endpoint-refused"
    When "Jana" turns push notifications on in a browser session that names no device
    Then the response status is 403
    And the problem type ends with "operations/push-device-required"
    When "Jana" asks for the push notifications in a browser session that names no device
    Then the response status is 200
    And the push settings say the session names no device
    When "Jana" turns push notifications on for the public computer "knihovna" at "https://fcm.googleapis.com/fcm/send/jana-knihovna"
    Then the response status is 409
    And the problem type ends with "operations/push-device-keeps-nothing"
    When "Jana" turns push notifications on for the signed-out device "starý telefon" at "https://fcm.googleapis.com/fcm/send/jana-stary"
    Then the response status is 401
    And the problem type ends with "auth/session-ended"
    And no push notification subscription of "Jana" is stored
    Given "Jana" turned push notifications on for 10 devices
    When "Jana" turns push notifications on for the device "jedenácté" at "https://fcm.googleapis.com/fcm/send/jana-11"
    Then the response status is 409
    And the problem type ends with "operations/push-subscription-limit"
    And 10 push notification subscriptions of "Jana" are stored

  Scenario: A subscription the push service calls gone is removed, and another failure is counted on the device
    Given "Jana" turned push notifications on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    And "Jana" turned push notifications on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/jana"
    And the push service answers 500 for "https://updates.push.services.mozilla.com/wpush/v2/jana"
    When "Jana" sends a test push notification on the device "notebook"
    Then the test push alert reached 0, failed for 1 and removed 0 devices
    When "Jana" asks for the push notifications on the device "notebook"
    Then the push notifications say this device failed 1 time in a row
    Given the push service answers 410 for "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When "Jana" sends a test push notification on the device "telefon"
    Then the test push alert reached 0, failed for 0 and removed 1 devices
    And the push notifications list the devices "notebook" of "Jana"

  Scenario: A browser another donor used is taken over, and the administrators' alerts of the same browser stay apart
    Given a person "Petr" is registered
    And "Petr" is an administrator
    And "Petr" turned push notifications on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/spolecny"
    And "Petr" turned push alerts on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/spolecny"
    When "Jana" turns push notifications on for the device "rodinný notebook" at "https://updates.push.services.mozilla.com/wpush/v2/spolecny"
    Then the response status is 200
    And no push notification subscription of "Petr" is stored
    And 1 push notification subscription of "Jana" is stored
    And 1 push subscription of "Petr" is stored
    When "Petr" sends a test push alert
    Then the test push alert reached 1, failed for 0 and removed 0 devices

  Scenario: The test notification is limited to five an hour for each client address, counted before anything is sent
    Given "Jana" turned push notifications on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When the following requests come from the client address "203.0.113.27"
    And "Jana" sent 5 test push notifications on the device "telefon"
    And "Jana" sends a test push notification on the device "telefon"
    Then the response status is 429
    And the problem type ends with "rate-limited"
    And 5 push alerts were sent
    When the following requests come from the client address "203.0.113.28"
    And "Jana" sends a test push notification on the device "telefon"
    Then the response status is 200
    When 1 hour passes
    And the following requests come from the client address "203.0.113.27"
    And "Jana" sends a test push notification on the device "telefon"
    Then the response status is 200

  Scenario: A device that signs out, or is signed out from another device, loses its notifications, and an erased donor loses all of them
    Given "Jana" turned push notifications on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    And "Jana" turned push notifications on for the device "notebook" at "https://fcm.googleapis.com/fcm/send/jana-notebook"
    And "Jana" turned push notifications on for the device "tablet" at "https://fcm.googleapis.com/fcm/send/jana-tablet"
    When "Jana" signs out the device "telefon" from the device "notebook"
    Then the response status is 204
    And the push notifications list the devices "notebook, tablet" of "Jana"
    Given a person "Petr" is registered
    And "Petr" is an administrator
    When "Petr" erases the donor "Jana"
    Then no push notification subscription of "Jana" is stored

  Scenario: A visitor without a token and a connected application are refused
    When someone without a token asks for the push notifications
    Then the response status is 401
    Given "Jana" is an administrator
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token reads the push notifications
    Then the response status is 403
    When the exchanged API token turns push notifications on
    Then the response status is 403
    When the exchanged API token sends a test push notification
    Then the response status is 403
