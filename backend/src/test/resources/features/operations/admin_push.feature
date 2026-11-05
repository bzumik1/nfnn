@operations
Feature: An administrator turns push alerts on for a device, chooses which alerts it gets and sends a test alert

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: A device turns push alerts on under the server's key, and the test alert reaches it encrypted with its kind, the count and the notification to show
    When "Jana" asks for the push settings
    Then the response status is 200
    And the push settings carry the server's public key
    And the push settings list no device
    And the push settings say the session names no device
    When "Jana" turns push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    Then the response status is 201
    And the push subscription says service "google" with bank import on, backups on and mail on
    And the admin action "SUBSCRIBE_PUSH" by "Jana" on a push subscription is recorded with details "Upozornění přes push zapnuta na zařízení (Google), import z banky zapnuto, zálohy zapnuto, odesílání e-mailů zapnuto"
    When "Jana" asks for the push settings
    Then the push settings carry the same public key as before
    And the push settings list the devices:
      | service | bankImport | backups | mail | failuresInARow | delivered |
      | google  | on         | on      | on   | 0              | never     |
    When "Jana" sends a test push alert
    Then the response status is 200
    And the test push alert reached 1, failed for 0 and removed 0 devices
    And the device "telefon" of "Jana" received the push alert:
      """
      {"v":1,"kind":"test","count":0,"notification":{"title":"Zkušební upozornění","body":"Upozornění ze Správy Nové naděje na tomto zařízení fungují.","tag":"nfnn-test","renotify":true,"lang":"cs","icon":"/icon-192.png","data":{"kind":"test","count":0,"onActionClick":{"default":{"operation":"focusLastFocusedOrOpen","url":"/sprava/upozorneni"}}}}}
      """
    When "Jana" asks for the push settings
    Then the push settings list the devices:
      | service | delivered |
      | google  | yes       |

  Scenario: Subscribing the same device again replaces its subscription, and each service the browsers use is taken
    Given "Jana" turned push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When "Jana" turns push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon-znovu"
    Then the response status is 201
    When 1 second passes
    And "Jana" turns push alerts on for the device "iphone" at "https://web.push.apple.com/QGuQyavXutnMH-0NxCKP"
    And 1 second passes
    And "Jana" turns push alerts on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk"
    And 1 second passes
    And "Jana" turns push alerts on for the device "windows" at "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB"
    And "Jana" asks for the push settings
    Then the push settings list the devices:
      | service   |
      | google    |
      | apple     |
      | mozilla   |
      | microsoft |
    When "Jana" sends a test push alert
    Then the test push alert reached 4, failed for 0 and removed 0 devices

  Scenario Outline: Only an address of a known push service and a browser key on the curve are taken
    When "Jana" turns push alerts on for the device "telefon" at "<endpoint>"
    Then the response status is 400
    And the problem type ends with "operations/push-endpoint-refused"
    And no push subscription of "Jana" is stored

    Examples:
      | endpoint                                      |
      | http://fcm.googleapis.com/fcm/send/jana       |
      | https://127.0.0.1/fcm/send/jana               |
      | https://169.254.169.254/latest/meta-data      |
      | https://push.example.com/fcm/send/jana        |
      | https://fcm.googleapis.com.example.com/send/x |
      | https://fcm.googleapis.com:8443/fcm/send/jana |
      | https://jana@fcm.googleapis.com/fcm/send/jana |
      | https://FCM.googleapis.com/fcm/send/jana      |
      | https://push.apple.com/jana                   |

  Scenario: A browser key that is no point on the curve, a session without a device and the eleventh device are refused
    When "Jana" turns push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana" with a browser key that is no point on the curve
    Then the response status is 400
    And the problem type ends with "operations/push-keys-refused"
    When "Jana" turns push alerts on in a browser session that names no device
    Then the response status is 403
    And the problem type ends with "operations/push-device-required"
    Given "Jana" turned push alerts on for 10 devices
    When "Jana" turns push alerts on for the device "jedenácté" at "https://fcm.googleapis.com/fcm/send/jana-11"
    Then the response status is 409
    And the problem type ends with "operations/push-subscription-limit"
    And 10 push subscriptions of "Jana" are stored

  Scenario: A subscription the push service calls gone is removed, and another failure is counted on the device
    Given "Jana" turned push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    And "Jana" turned push alerts on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/jana"
    And the push service answers 410 for "https://fcm.googleapis.com/fcm/send/jana-telefon"
    And the push service answers 500 for "https://updates.push.services.mozilla.com/wpush/v2/jana"
    When "Jana" sends a test push alert
    Then the test push alert reached 0, failed for 1 and removed 1 devices
    When "Jana" asks for the push settings
    Then the push settings list the devices:
      | service | failuresInARow | delivered |
      | mozilla | 1              | never     |

  Scenario: The alerts of a device change on the web and through a connected application, and each change is audited with its application
    Given "Jana" turned push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When "Jana" changes the push alerts of the device "telefon" to bank import on, backups off and mail on
    Then the response status is 200
    And the push subscription says service "google" with bank import on, backups off and mail on
    And the admin action "CHANGE_PUSH_ALERTS" by "Jana" on a push subscription is recorded with details "Upozornění přes push na zařízení (Google): import z banky zapnuto, zálohy vypnuto, odesílání e-mailů zapnuto"
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token reads the push settings
    Then the response status is 200
    And the push settings carry the server's public key
    And the push settings list the devices:
      | service | bankImport | backups | mail |
      | google  | on         | off     | on   |
    When the exchanged API token changes the push alerts of the first device to bank import off, backups off and mail on
    Then the response status is 200
    And the push subscription says service "google" with bank import off, backups off and mail on
    And the push subscription is not the device of the asking session
    And the admin action "CHANGE_PUSH_ALERTS" by "Jana" on a push subscription came through "claude.ai" with details "Upozornění přes push na zařízení (Google): import z banky vypnuto, zálohy vypnuto, odesílání e-mailů zapnuto"

  Scenario: An administrator turns a device off, and nobody reaches the devices of another administrator
    Given a person "Petr" is registered
    And "Petr" is an administrator
    And "Jana" turned push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When "Petr" turns push alerts off for "Jana" on the device "telefon"
    Then the response status is 404
    And the problem type ends with "operations/push-subscription-not-found"
    When "Petr" changes the push alerts of "Jana" on the device "telefon" to bank import off, backups off and mail off
    Then the response status is 404
    When "Petr" sends a test push alert
    Then the test push alert reached 0, failed for 0 and removed 0 devices
    And no push alert was sent
    When "Jana" turns push alerts off for the device "telefon"
    Then the response status is 204
    And the admin action "REMOVE_PUSH_SUBSCRIPTION" by "Jana" on a push subscription is recorded with details "Upozornění přes push vypnuta na zařízení (Google)"
    And no push subscription of "Jana" is stored
    When "Jana" turns push alerts off for the device "telefon"
    Then the response status is 404

  Scenario: A browser another administrator used takes the device over, and the removal of the other administrator's device is audited
    Given a person "Petr" is registered
    And "Petr" is an administrator
    And "Petr" turned push alerts on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/spolecny"
    When "Jana" turns push alerts on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/spolecny"
    Then the response status is 201
    And no push subscription of "Petr" is stored
    And 1 push subscription of "Jana" is stored
    And the admin action "REMOVE_PUSH_SUBSCRIPTION" by "Jana" on a push subscription is recorded with details "Upozornění přes push jiného správce vypnuta na zařízení (Mozilla), protože si je ve stejném prohlížeči zapnul tento správce"

  Scenario: The test alert is limited to five an hour for each client address, counted before anything is sent
    Given "Jana" turned push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When the following requests come from the client address "203.0.113.27"
    And "Jana" sent 5 test push alerts
    And "Jana" sends a test push alert
    Then the response status is 429
    And the problem type ends with "rate-limited"
    And 5 push alerts were sent
    When the following requests come from the client address "203.0.113.28"
    And "Jana" sends a test push alert
    Then the response status is 200
    When 59 minutes pass
    And the following requests come from the client address "203.0.113.27"
    And "Jana" sends a test push alert
    Then the response status is 429
    When 1 minute passes
    And "Jana" sends a test push alert
    Then the response status is 200

  Scenario: Taking the administrator role away removes the devices of the former administrator and nobody else's
    Given a person "Petr" is registered
    And "Petr" is an administrator
    And "Petr" turned push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/petr-telefon"
    And "Jana" turned push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When "Jana" removes "Petr" from the administrators
    Then the response status is 204
    And no push subscription of "Petr" is stored
    And 1 push subscription of "Jana" is stored

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    When "Petr" asks for the push settings
    Then the response status is 403
    When "Petr" sends a test push alert
    Then the response status is 403
    When someone without a token asks for the push settings
    Then the response status is 401
