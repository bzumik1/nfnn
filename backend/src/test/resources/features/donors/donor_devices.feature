@donors @connected-apps
Feature: A donor sees the devices signed in to the account and signs them out

  Each sign-in opens a device: the browser or the installed app it happened in, named by
  its platform and browser, with the time of the sign-in and of its last use. The list in
  the account shows the devices still signed in, this one first. Signing a device out ends
  its refresh token and stops its access token at once, not only when it expires.
  Signing out every other device keeps the connected applications (Jakub 2026-11-05, Q12):
  they end on their own card or by a password change.

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered
    And a person "Petr" is registered

  Scenario: The list shows each signed-in device, this one first and the others by their last use
    Given "Jana" signs in on the "Mac"
    And 5 minutes pass
    And "Jana" signs in on the "iPhone"
    And 5 minutes pass
    And "Jana" signs in on the "Windows"
    And 5 minutes pass
    When the "iPhone" refreshes its session
    And "Jana" lists the devices on the "Mac"
    Then the devices are:
      | platform | browser | current |
      | MAC      | FIREFOX | true    |
      | IPHONE   | SAFARI  | false   |
      | WINDOWS  | EDGE    | false   |
      | OTHER    | OTHER   | false   |
    And each device names when it signed in and when it was last used

  Scenario: A device signed out from another one loses its access at once and cannot refresh
    Given "Jana" signs in on the "Mac"
    And "Jana" signs in on the "iPhone"
    When "Jana" reads the profile on the "iPhone"
    Then the response status is 200
    When "Jana" signs out the "iPhone" on the "Mac"
    Then the response status is 204
    When "Jana" reads the profile on the "iPhone"
    Then the response status is 401
    And the problem type ends with "auth/session-ended"
    When the "iPhone" refreshes its session
    Then the response status is 401
    When "Jana" lists the devices on the "Mac"
    Then the devices are:
      | platform | browser | current |
      | MAC      | FIREFOX | true    |
      | OTHER    | OTHER   | false   |

  Scenario: Signing out of a device takes it off the list
    Given "Jana" signs in on the "Mac"
    And "Jana" signs in on the "iPhone"
    When "Jana" signs out of the "iPhone"
    Then the response status is 204
    When "Jana" lists the devices on the "Mac"
    Then the devices are:
      | platform | browser | current |
      | MAC      | FIREFOX | true    |
      | OTHER    | OTHER   | false   |

  Scenario: Signing out every other device keeps this one and the connected applications
    Given "Jana" is an administrator
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read"
    And "Jana" signs in on the "Mac"
    And "Jana" signs in on the "iPhone"
    When "Jana" signs out every other device on the "Mac"
    Then the response status is 204
    When "Jana" reads the profile on the "iPhone"
    Then the response status is 401
    And the problem type ends with "auth/session-ended"
    When "Jana" lists the devices on the "Mac"
    Then the devices are:
      | platform | browser | current |
      | MAC      | FIREFOX | true    |
    When the connector exchanges the connector token for an API token
    Then the response status is 200
    And the exchanged API token opens the administration

  Scenario: A password change signs out every other device, and the one that changed it stays signed in
    Given "Jana" signs in on the "Mac"
    And "Jana" signs in on the "iPhone"
    When "Jana" changes the password to "a much longer horse battery" on the "Mac"
    Then the response status is 200
    When "Jana" reads the profile on the "iPhone"
    Then the response status is 401
    And the problem type ends with "auth/session-ended"
    When the "iPhone" refreshes its session
    Then the response status is 401
    When "Jana" lists the devices on the "Mac"
    Then the devices are:
      | platform | browser | current |
      | MAC      | FIREFOX | true    |

  Scenario: Another donor's device is not found and stays signed in
    Given "Jana" signs in on the "iPhone"
    When "Petr" tries to sign out the "iPhone" of "Jana"
    Then the response status is 404
    And the problem type ends with "donors/device-not-found"
    When "Jana" reads the profile on the "iPhone"
    Then the response status is 200

  Scenario: Without a token the devices are neither listed nor signed out
    When someone without a token lists the devices
    Then the response status is 401
    When someone without a token signs out every other device
    Then the response status is 401

  Scenario: A connected application cannot read or sign out the devices
    Given "Jana" is an administrator
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sends GET "/api/donors/me/devices"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When the exchanged API token sends DELETE "/api/donors/me/devices"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
