@donors
Feature: A device asks the status of its sign-in and deletes its stored copy only when told to

  Each sign-in that may keep a copy on the device gets a device secret, which only that device
  holds. With it the device asks, without a token, how its sign-in stands: still signed in,
  signed out, signed out remotely or erased (delete everything kept for the account), the
  administrator role removed (delete the administration's copy only), or unknown (delete). A
  device signed out remotely deletes its copy at its next connection (Jakub 2026-11-05, Q5);
  a replayed refresh token, a password change elsewhere or an expired session only sign the
  device out and never delete (plan v3 D28, D31). The answer also says whether the account
  holds the administrator role, whatever the session's own roles.

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered
    And a person "Petr" is registered

  Scenario: A device signed in asks its status and learns it is signed in, and asking leaves nothing behind
    Given "Jana" signs in on the "iPhone"
    And the database is noted as it stands
    When the "iPhone" asks the status of its sign-in
    Then the response status is 200
    And the device status is "signed-in" for an account that is not an administrator
    And the status answer is kept by no cache
    And the database is as it was noted

  Scenario: Each sign-in gets its own device secret, a refresh none
    Given "Jana" signs in on the "iPhone"
    And "Jana" signs in on the "Mac"
    Then the "iPhone" and the "Mac" hold different device secrets
    When the "iPhone" refreshes its session
    Then the response status is 200
    And the answer carries no device secret

  Scenario: A sign-in on a public computer keeps nothing, so it gets no device secret
    When "Jana" signs in on the "Windows" on a public computer
    Then the response status is 200
    And the answer carries no device secret

  Scenario: A device that signed out on itself is signed out and keeps its copy
    Given "Jana" signs in on the "iPhone"
    When "Jana" signs out of the "iPhone"
    And the "iPhone" asks the status of its sign-in
    Then the device status is "signed-out" for an account that is not an administrator

  Scenario: A device signed out from another one deletes everything it keeps for the account
    Given "Jana" signs in on the "Mac"
    And "Jana" signs in on the "iPhone"
    When "Jana" signs out the "iPhone" on the "Mac"
    And the "iPhone" asks the status of its sign-in
    Then the device status is "wipe-all" for an account that is not an administrator
    When the "Mac" asks the status of its sign-in
    Then the device status is "signed-in" for an account that is not an administrator

  Scenario: Signing out every other device tells each of them to delete, and keeps this one
    Given "Jana" signs in on the "Mac"
    And "Jana" signs in on the "iPhone"
    And "Jana" signs in on the "Windows"
    When "Jana" signs out every other device on the "Mac"
    And the "iPhone" asks the status of its sign-in
    Then the device status is "wipe-all" for an account that is not an administrator
    When the "Windows" asks the status of its sign-in
    Then the device status is "wipe-all" for an account that is not an administrator
    When the "Mac" asks the status of its sign-in
    Then the device status is "signed-in" for an account that is not an administrator

  Scenario: A replayed refresh token ends every session but never tells a device to delete
    Given "Jana" signs in on the "Mac"
    And "Jana" signs in on the "iPhone"
    And the "iPhone" refreshes its session
    And 2 minutes pass
    When the "iPhone" presents its spent refresh token again
    Then the response status is 401
    When the "iPhone" asks the status of its sign-in
    Then the device status is "signed-out" for an account that is not an administrator
    When the "Mac" asks the status of its sign-in
    Then the device status is "signed-out" for an account that is not an administrator

  Scenario: A password changed on another device signs this one out but never tells it to delete
    Given "Jana" signs in on the "Mac"
    And "Jana" signs in on the "iPhone"
    When "Jana" changes the password to "a much longer horse battery" on the "Mac"
    And the "iPhone" asks the status of its sign-in
    Then the device status is "signed-out" for an account that is not an administrator
    When the "Mac" asks the status of its sign-in
    Then the device status is "signed-in" for an account that is not an administrator

  Scenario: An expired session is signed out and keeps its copy
    Given "Jana" signs in on the "iPhone"
    When 15 days pass
    And the sessions are cleaned up
    And the "iPhone" asks the status of its sign-in
    Then the device status is "signed-out" for an account that is not an administrator

  Scenario: An erased donor's devices, signed in or already signed out, are told to delete everything
    Given "Petr" is an administrator
    And "Jana" signs in on the "Mac"
    And "Jana" signs out of the "Mac"
    And "Jana" signs in on the "iPhone"
    When "Petr" erased the donor "Jana"
    And the "iPhone" asks the status of its sign-in
    Then the device status is "wipe-all" for an account that is not an administrator
    When the "Mac" asks the status of its sign-in
    Then the device status is "wipe-all" for an account that is not an administrator
    And the erased donor's devices keep only their ids, their secret's hash and the order to delete

  Scenario: Removing the administrator role tells every device of the account to delete the administration's copy only
    Given "Petr" is an administrator
    And "Jana" is an administrator
    And "Jana" signs in on the "Mac"
    And "Jana" signs out of the "Mac"
    And "Jana" signs in on the "iPhone"
    When the "iPhone" asks the status of its sign-in
    Then the device status is "signed-in" for an account that is an administrator
    When "Petr" removes "Jana" from the administrators
    And the "iPhone" asks the status of its sign-in
    Then the device status is "wipe-admin" for an account that is not an administrator
    When the "Mac" asks the status of its sign-in
    Then the device status is "wipe-admin" for an account that is not an administrator
    When "Jana" signs in on the "Windows"
    And the "Windows" asks the status of its sign-in
    Then the device status is "signed-in" for an account that is not an administrator

  Scenario: An erasure after the role removal still tells the devices to delete everything
    Given "Petr" is an administrator
    And "Jana" is an administrator
    And "Jana" signs in on the "iPhone"
    When "Petr" removes "Jana" from the administrators
    And "Petr" erased the donor "Jana"
    And the "iPhone" asks the status of its sign-in
    Then the device status is "wipe-all" for an account that is not an administrator

  Scenario: A remote sign-out after the role removal tells a later device to delete everything
    Given "Petr" is an administrator
    And "Jana" is an administrator
    And "Jana" signs in on the "Mac"
    When "Petr" removes "Jana" from the administrators
    And "Jana" signs in on the "iPhone"
    And "Jana" signs in on the "Windows"
    And "Jana" signs out the "iPhone" on the "Windows"
    And the "iPhone" asks the status of its sign-in
    Then the device status is "wipe-all" for an account that is not an administrator
    When the "Mac" asks the status of its sign-in
    Then the device status is "wipe-admin" for an account that is not an administrator

  Scenario: An administrator signed in with the password alone still holds the role, so nothing is deleted
    Given "Jana" is given the administrator role without signing in again
    And "Jana" signs in on the "iPhone"
    When "Jana" reads the administration on the "iPhone"
    Then the response status is 403
    When the "iPhone" asks the status of its sign-in
    Then the device status is "signed-in" for an account that is an administrator

  Scenario: A secret no device holds is unknown
    Given the database is noted as it stands
    When a device asks the status with a secret no device holds
    Then the response status is 200
    And the device status is "unknown" for an account that is not an administrator
    And the status answer is kept by no cache
    And the database is as it was noted

  Scenario Outline: A device secret that is not 43 characters of base64url is refused as invalid
    When a device asks the status with the secret "<secret>"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "deviceSecret"

    Examples:
      | secret                                       |
      |                                              |
      | AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA   |
      | AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA |
      | AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+  |
      | AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=  |

  Scenario: A question without a secret is refused as invalid
    When a device asks the status without a secret
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "deviceSecret"

  Scenario: The sixty-first question within 15 minutes from one /64 network is refused until the window ends, another network is answered
    Given "Jana" signs in on the "iPhone"
    And the following requests come from the client address "2001:db8:42:7::10"
    And the "iPhone" asked the status of its sign-in 60 times
    When the following requests come from the client address "2001:db8:42:7::99"
    And the "iPhone" asks the status of its sign-in
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    When the following requests come from the client address "2001:db8:42:8::10"
    And the "iPhone" asks the status of its sign-in
    Then the response status is 200
    When 14 minutes pass
    And the following requests come from the client address "2001:db8:42:7::10"
    And the "iPhone" asks the status of its sign-in
    Then the response status is 429
    When 1 minutes pass
    And the "iPhone" asks the status of its sign-in
    Then the response status is 200
