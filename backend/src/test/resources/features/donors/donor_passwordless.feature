Feature: An account without a password, opened only with passkeys

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered without a password
    And a person "Petr" is registered

  Scenario: A donor registers without a password, adds the first passkey in the session the e-mail link opened and signs in with it
    Then the donor profile of "Jana" says the account has no password
    When "Jana" asks to add a passkey without confirming it
    Then the response status is 200
    When "Jana" adds a passkey named "iPhone"
    Then the response status is 201
    When "Jana" signs in with the passkey "iPhone"
    Then the response status is 200
    And the donor profile shows roles "DONOR" and the second factor off
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 401
    And the problem type ends with "auth/invalid-credentials"

  Scenario: A further passkey, the code from the app and a new e-mail are confirmed with a passkey instead of the password
    Given "Jana" added a passkey named "iPhone"
    And "Petr" added a passkey named "Klíč"
    When "Jana" asks to add a passkey without confirming it
    Then the response status is 400
    And the problem type ends with "donors/confirmation-required"
    When "Jana" asks to add a passkey with password "correct horse battery"
    Then the response status is 400
    And the problem type ends with "donors/wrong-password"
    When "Jana" asks to add a passkey confirmed with the passkey "Klíč" of "Petr"
    Then the response status is 400
    And the problem type ends with "donors/passkey-confirmation-rejected"
    When 5 seconds pass
    And "Jana" asks to add a passkey confirmed with the passkey "iPhone"
    Then the response status is 200
    When "Jana" adds a passkey named "Mac"
    Then the response status is 201
    And the passkeys of "Jana" are "iPhone, Mac"
    When "Jana" starts the second factor set-up confirmed with the passkey "Mac"
    Then the response status is 200
    When "Jana" asks to change the e-mail to "jana.nova@example.cz" confirmed with the passkey "iPhone"
    Then the response status is 202

  Scenario: A confirmation passkey answers a live challenge once
    Given "Jana" added a passkey named "iPhone"
    When "Jana" asks to add a passkey confirmed with the passkey "iPhone" answering a spent challenge
    Then the response status is 400
    And the problem type ends with "donors/passkey-confirmation-rejected"

  Scenario: The last way to sign in cannot be removed
    Given "Jana" added a passkey named "iPhone"
    When "Jana" removes the passkey "iPhone" of "Jana"
    Then the response status is 409
    And the problem type ends with "donors/last-sign-in-method"
    Given "Jana" added a passkey named "Mac"
    When "Jana" removes the passkey "iPhone" of "Jana"
    Then the response status is 204
    And the passkeys of "Jana" are "Mac"
    When "Petr" removes the password
    Then the response status is 409
    And the problem type ends with "donors/last-sign-in-method"

  Scenario: A donor without a password sets one with a passkey and may later remove it again
    Given "Jana" added a passkey named "iPhone"
    When "Jana" sets the password "nové dlouhé heslo pro Janu" confirmed with the passkey "iPhone"
    Then the response status is 200
    And the donor profile of "Jana" says the account has a password
    When the donor signs in with email "jana@example.cz" and password "nové dlouhé heslo pro Janu"
    Then the response status is 200
    When "Jana" removes the password
    Then the response status is 200
    And the donor profile of "Jana" says the account has no password
    When the donor signs in with email "jana@example.cz" and password "nové dlouhé heslo pro Janu"
    Then the response status is 401
    And the problem type ends with "auth/invalid-credentials"

  Scenario: A donor with a password removes it once a passkey exists, and the password sessions end
    Given "Petr" added a passkey named "Android"
    When "Petr" removes the password
    Then the response status is 200
    And the donor profile of "Petr" says the account has no password
    When "Petr" signs in with the passkey "Android"
    Then the response status is 200

  Scenario: The reset link adds a new passkey, ends every session and tells the donor
    Given "Jana" added a passkey named "Ztracený"
    And 5 seconds pass
    And the donor asked for a password reset for "jana@example.cz"
    When "Jana" asks for a new passkey with the link from the e-mail
    Then the response status is 200
    When "Jana" adds the new passkey named "Nový telefon" with the link from the e-mail
    Then the response status is 201
    And an e-mail goes to the address of "Jana" with the subject "K vašemu účtu přibyl přístupový klíč – Nová naděje"
    And no session of "Jana" is live any more
    When "Jana" signs in with the passkey "Nový telefon"
    Then the response status is 200
    And the passkeys of "Jana" are "Ztracený, Nový telefon"
    When "Jana" adds the new passkey named "Další" with the link from the e-mail
    Then the response status is 400
    And the problem type ends with "donors/invalid-password-reset-token"

  Scenario: With the code from the app turned on, the reset link adds a passkey only with a fresh code
    Given "Jana" added a passkey named "iPhone"
    And "Jana" turned the second factor on confirmed with the passkey "iPhone"
    And the donor asked for a password reset for "jana@example.cz"
    When "Jana" asks for a new passkey with the link from the e-mail
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-required"
    When "Jana" asks for a new passkey with the link from the e-mail and code "000000"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"
    When "Jana" asks for a new passkey with the link from the e-mail and the current code
    Then the response status is 200
    When "Jana" adds the new passkey named "Nový telefon" with the link from the e-mail
    Then the response status is 201

  Scenario: An administrator does not recover a passkey through the e-mail link
    Given "Jana" added a passkey named "iPhone"
    And "Jana" is given the administrator role without signing in again
    And the donor asked for a password reset for "jana@example.cz"
    When "Jana" asks for a new passkey with the link from the e-mail
    Then the response status is 403
    And the problem type ends with "donors/administrator-recovery-refused"

  Scenario: The reset link still sets a password for an account without one
    Given "Jana" added a passkey named "iPhone"
    And the donor asked for a password reset for "jana@example.cz"
    When the donor sets the new password "nové dlouhé heslo pro Janu" with the link from the e-mail
    Then the response status is 204
    When the donor signs in with email "jana@example.cz" and password "nové dlouhé heslo pro Janu"
    Then the response status is 200
