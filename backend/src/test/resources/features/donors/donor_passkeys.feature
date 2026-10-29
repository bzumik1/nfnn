@donors
Feature: A donor signs in with a passkey instead of the password

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered

  Scenario: Adding a passkey needs the password and gives the browser what it needs to create one
    When "Jana" asks to add a passkey with the right password
    Then the response status is 200
    And the passkey creation options name the site "localhost" called "Nová naděje" and the account of "Jana"
    And the passkey creation options ask for a discoverable passkey with user verification and no attestation
    When "Jana" asks to add a passkey with password "wrong horse battery"
    Then the response status is 400
    And the problem type ends with "donors/wrong-password"

  Scenario: A created passkey is kept under its name, the donor is told by e-mail and the passkey opens a session
    When "Jana" adds a passkey named "iPhone"
    Then the response status is 201
    And the passkeys of "Jana" are "iPhone"
    And an e-mail goes to the address of "Jana" with the subject "K vašemu účtu přibyl přístupový klíč – Nová naděje"
    When 2 minutes pass
    And "Jana" signs in with the passkey "iPhone"
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows roles "DONOR" and the second factor off
    And the passkey "iPhone" of "Jana" was last used now

  Scenario: The creation options list the passkeys the donor already has, so the device does not create a second one
    Given "Jana" added a passkey named "iPhone"
    When "Jana" asks to add a passkey with the right password
    Then the passkey creation options exclude the passkey "iPhone"

  Scenario: A passkey counts as the second factor, so an administrator holds the administrator role without the code
    Given "Jana" is given the administrator role without signing in again
    And "Jana" added a passkey named "Mac"
    When "Jana" signs in with the passkey "Mac"
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows roles "DONOR, ADMIN" and the second factor off
    And the donor profile says the second factor is not needed for administration
    When the donor refreshes the session
    Then the response status is 200
    And the donor profile shows roles "DONOR, ADMIN" and the second factor off

  Scenario: An administrator signed in with the password only is told the administration needs the second factor or a passkey
    Given "Jana" is given the administrator role without signing in again
    And "Jana" added a passkey named "Mac"
    When "Jana" signs in again
    Then the donor profile shows roles "DONOR" and the second factor off
    And the donor profile says the second factor is needed for administration

  Scenario: An administrator with a passkey, signed in with the password only, changes no passkey and sets up no code until signed in with the passkey
    Given "Jana" is given the administrator role without signing in again
    And "Jana" added a passkey named "Mac"
    When "Jana" signs in again
    And "Jana" asks to add a passkey with the right password
    Then the response status is 403
    And the problem type ends with "donors/second-factor-session-required"
    And the problem has the title "Nejdřív se přihlaste přístupovým klíčem"
    When "Jana" removes the passkey "Mac" of "Jana"
    Then the response status is 403
    And the problem type ends with "donors/second-factor-session-required"
    When "Jana" starts the second factor set-up with the right password
    Then the response status is 403
    And the problem type ends with "donors/second-factor-session-required"
    And the passkeys of "Jana" are "Mac"
    When "Jana" signs in with the passkey "Mac"
    And "Jana" asks to add a passkey with the right password
    Then the response status is 200
    When "Jana" starts the second factor set-up with the right password
    Then the response status is 200
    When "Jana" removes the passkey "Mac" of "Jana"
    Then the response status is 204
    And the passkeys of "Jana" are none

  Scenario: An administrator without any second factor still sets up the first one from a session opened with the password
    Given "Jana" is given the administrator role without signing in again
    When "Jana" signs in again
    And "Jana" asks to add a passkey with the right password
    Then the response status is 200
    When "Jana" starts the second factor set-up with the right password
    Then the response status is 200

  Scenario: A donor with the code from the app turned on signs in with a passkey without the code
    Given "Jana" enables the second factor
    And "Jana" added a passkey named "Android"
    When "Jana" signs in with the passkey "Android"
    Then the response status is 200
    And the donor profile shows roles "DONOR" and the second factor on

  Scenario: A sign-in challenge works once and only for five minutes
    Given "Jana" added a passkey named "iPhone"
    And the browser asked for a passkey sign-in
    When "Jana" answers the sign-in with the passkey "iPhone"
    Then the response status is 200
    When "Jana" answers the sign-in with the passkey "iPhone"
    Then the response status is 401
    And the problem type ends with "auth/invalid-passkey"
    Given the browser asked for a passkey sign-in
    When 5 minutes pass
    And "Jana" answers the sign-in with the passkey "iPhone"
    Then the response status is 401
    And the problem type ends with "auth/invalid-passkey"

  Scenario: An unknown passkey, a signature by another device and a passkey without user verification open no session
    Given "Jana" added a passkey named "iPhone"
    When someone signs in with a passkey the site does not know
    Then the response status is 401
    And the problem type ends with "auth/invalid-passkey"
    And the problem has the title "Přístupový klíč neznáme"
    When someone signs in with the passkey "iPhone" of "Jana" signed by another device
    Then the response status is 401
    And the problem type ends with "auth/invalid-passkey"
    When "Jana" signs in with the passkey "iPhone" without user verification
    Then the response status is 401
    And the problem type ends with "auth/invalid-passkey"
    When "Jana" signs in with the passkey "iPhone"
    Then the response status is 200

  Scenario: A passkey made for another site, for another challenge or without user verification is refused
    When "Jana" adds a passkey named "Podvod" created for the site "https://nfnn-podvod.cz"
    Then the response status is 400
    And the problem type ends with "donors/passkey-rejected"
    When "Jana" adds a passkey named "Jiná výzva" answering a challenge the site never issued
    Then the response status is 400
    And the problem type ends with "donors/passkey-rejected"
    When "Jana" adds a passkey named "Bez ověření" without user verification
    Then the response status is 400
    And the problem type ends with "donors/passkey-rejected"
    When "Petr" adds a passkey named "Cizí" answering the challenge issued to "Jana"
    Then the response status is 400
    And the problem type ends with "donors/passkey-rejected"
    And the passkeys of "Jana" are none

  Scenario: A passkey name is required and at most 64 characters long
    When "Jana" adds a passkey named ""
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" adds a passkey named "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: A donor removes a passkey, is told by e-mail, the passkey then opens no session, and nobody removes another donor's passkey
    Given "Jana" added a passkey named "iPhone"
    And "Jana" added a passkey named "Windows"
    When "Petr" removes the passkey "iPhone" of "Jana"
    Then the response status is 404
    And the problem type ends with "donors/passkey-not-found"
    When "Jana" removes the passkey "iPhone" of "Jana"
    Then the response status is 204
    And the passkeys of "Jana" are "Windows"
    And an e-mail goes to the address of "Jana" with the subject "Z vašeho účtu byl odebrán přístupový klíč – Nová naděje"
    When "Jana" signs in with the passkey "iPhone"
    Then the response status is 401
    And the problem type ends with "auth/invalid-passkey"

  Scenario: A donor renames a passkey, which still opens a session, and cannot rename another donor's passkey
    Given "Jana" added a passkey named "iPhone"
    When 5 seconds pass
    And "Jana" added a passkey named "Windows"
    When "Petr" renames the passkey "iPhone" of "Jana" to "Můj"
    Then the response status is 404
    And the problem type ends with "donors/passkey-not-found"
    When "Jana" renames the passkey "iPhone" of "Jana" to "  iPhone 16 Pro Max  "
    Then the response status is 200
    And the response names the passkey "iPhone 16 Pro Max"
    And the passkeys of "Jana" are "iPhone 16 Pro Max, Windows"
    When "Jana" signs in with the passkey "iPhone"
    Then the response status is 200

  Scenario: A new passkey name is required and at most 64 characters long
    Given "Jana" added a passkey named "iPhone"
    When "Jana" renames the passkey "iPhone" of "Jana" to " "
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" renames the passkey "iPhone" of "Jana" to "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    Then the response status is 400
    And the problem type ends with "validation"
    And the passkeys of "Jana" are "iPhone"

  Scenario: A donor keeps at most ten passkeys
    Given "Jana" added 10 passkeys
    When "Jana" adds a passkey named "Jedenáctý"
    Then the response status is 409
    And the problem type ends with "donors/passkey-limit-reached"

  Scenario: The twenty-first passkey sign-in request within 15 minutes from one address is refused before any work
    Given "Jana" added a passkey named "iPhone"
    And the browser asked for a passkey sign-in 20 times
    When the browser asks for a passkey sign-in
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    When the following requests come from another client address
    And "Jana" signs in with the passkey "iPhone"
    Then the response status is 200

  Scenario: The eleventh passkey change within 15 minutes from one address is refused before any work
    Given "Jana" asked to add a passkey with the right password 10 times
    When "Jana" asks to add a passkey with the right password
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"

  Scenario: An erased donor's passkey opens no session
    Given "Petr" is an administrator
    And "Jana" added a passkey named "iPhone"
    And "Petr" erased the donor "Jana"
    When "Jana" signs in with the passkey "iPhone"
    Then the response status is 401
    And the problem type ends with "auth/invalid-passkey"

  Scenario: Without a token the donor's passkeys are not served
    When someone without a token asks for the passkeys
    Then the response status is 401
    Given "Jana" added a passkey named "iPhone"
    When someone without a token renames the passkey "iPhone" of "Jana" to "Můj"
    Then the response status is 401
