@donors
Feature: An administrator unlocks the administration's copy on a device with the password and a code the server checks, and each copy stored on a device is recorded

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: The password and a fresh code from the authenticator app unlock the administration, and the same code does not unlock it twice
    When "Jana" unlocks the administration on this device with her password and a fresh code
    Then the response status is 204
    And no admin action "STORE_ADMINISTRATION_COPY" is recorded
    When "Jana" unlocks the administration on this device with her password and the same code again
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"

  Scenario: A wrong password or a wrong code does not unlock the administration
    When "Jana" unlocks the administration on this device with the password "Spatne-heslo-123" and a fresh code
    Then the response status is 400
    And the problem type ends with "donors/wrong-password"
    When "Jana" unlocks the administration on this device with her password and the code "000000"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"
    When "Jana" unlocks the administration on this device with her password and a fresh code
    Then the response status is 204

  Scenario: Unlocking needs both the password and a code of six digits
    When "Jana" unlocks the administration on this device without a password and with the code "12345"
    Then the response status is 400
    And the problem lists errors for fields "password" and "secondFactorCode"

  Scenario: An administrator who signs in with a passkey and has no authenticator app has no code to unlock with
    Given a person "Petr" is registered
    And "Petr" is given the administrator role without signing in again
    And "Petr" added a passkey named "iPhone"
    And "Petr" signs in with the passkey "iPhone"
    When "Petr" unlocks the administration on this device with his password and the code "123456"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"

  Scenario: Unlocking is limited per client address before any password is checked
    When "Jana" unlocks the administration on this device with the password "Spatne-heslo-123" and the code "000000" 10 times
    And "Jana" unlocks the administration on this device with her password and a fresh code
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    When the following requests come from another client address
    And "Jana" unlocks the administration on this device with her password and a fresh code
    Then the response status is 204

  Scenario: A copy of the administration stored on a device is recorded with the kind of device, every time a device stores one
    When "Jana" records that this device, an iPhone with Safari, stores a copy of the administration
    Then the response status is 204
    And the admin action "STORE_ADMINISTRATION_COPY" by "Jana" is recorded with details containing "Kopie správy uložena do zařízení IPHONE SAFARI"
    When "Jana" records that this device, an iPhone with Safari, stores a copy of the administration
    And "Jana" asks for the 2 newest admin actions
    Then the admin actions are:
      | action                    | summary                                           |
      | STORE_ADMINISTRATION_COPY | Kopie správy uložena do zařízení iPhone · Safari. |
      | STORE_ADMINISTRATION_COPY | Kopie správy uložena do zařízení iPhone · Safari. |
    When "Jana" asks for the admin actions in "en"
    Then the admin actions are:
      | action                    | summary                                                |
      | STORE_ADMINISTRATION_COPY | A copy of the administration stored on iPhone · Safari. |
      | STORE_ADMINISTRATION_COPY | A copy of the administration stored on iPhone · Safari. |

  Scenario: Only a signed-in administrator unlocks or records a copy
    Given a person "Petr" is registered
    When "Petr" unlocks the administration on this device with his password and the code "123456"
    Then the response status is 403
    When "Petr" records that this device, an iPhone with Safari, stores a copy of the administration
    Then the response status is 403
    When someone without a token unlocks the administration with the code "123456"
    Then the response status is 401
    When someone without a token records a copy of the administration
    Then the response status is 401
