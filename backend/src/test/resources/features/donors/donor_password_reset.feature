Feature: Donor resets a forgotten password by e-mail

  Scenario: A donor asks for a reset link and gets it by e-mail without the registered name
    Given a person registered with email "jana@example.cz", password "correct horse battery" and name "KLIKNĚTE http://evil.example"
    When a password reset is asked for "jana@example.cz"
    Then the response status is 202
    And 1 password reset link is stored
    And the stored link expires one hour after it was issued
    And 1 reset e-mail is sent to "jana@example.cz"
    And the reset e-mail comes from "info@nfnn.cz" named "Nová naděje – nadační fond"
    And the reset e-mail has the subject "Obnova hesla k dárcovskému účtu – Nová naděje"
    And both parts of the reset e-mail contain "http://localhost:4200/obnova-hesla#token="
    And both parts of the reset e-mail contain "jana@example.cz"
    And neither part of the reset e-mail contains "KLIKNĚTE"
    And neither part of the reset e-mail contains "evil.example"

  Scenario: An unknown address is answered the same way and gets nothing
    When a password reset is asked for "nobody@example.cz"
    Then the response status is 202
    And 0 password reset links are stored
    And no reset e-mail is sent

  Scenario Outline: A malformed address is refused with a field error
    When a password reset is asked for "<address>"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "email"

    Examples:
      | address        |
      | not-an-email   |
      | jana@localhost |
      | jana@          |

  Scenario: The address is matched trimmed and lowercased
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    When a password reset is asked for "  JANA@Example.cz "
    Then the response status is 202
    And 1 password reset link is stored
    And 1 reset e-mail is sent to "jana@example.cz"

  Scenario: The donor sets a new password with the link and signs in with it
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor asked for a password reset for "jana@example.cz"
    When the donor sets the new password "a brand new passphrase" with the link from the e-mail
    Then the response status is 204
    And the refresh cookie is cleared
    And the link from the e-mail is marked as used
    When the donor signs in with email "jana@example.cz" and password "a brand new passphrase"
    Then the response status is 200
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 401
    When the donor sets the new password "yet another passphrase" with the link from the e-mail
    Then the response status is 400
    And the problem type ends with "donors/invalid-password-reset-token"
    And the problem has the title "Odkaz pro obnovu hesla je neplatný nebo vypršel"

  Scenario: An expired link no longer sets a password
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor asked for a password reset for "jana@example.cz"
    When 61 minutes pass
    And the donor sets the new password "a brand new passphrase" with the link from the e-mail
    Then the response status is 400
    And the problem type ends with "donors/invalid-password-reset-token"
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200

  Scenario: Two links both work until one of them is used
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor asked for a password reset for "jana@example.cz"
    And the donor asked for a password reset for "jana@example.cz"
    When the donor sets the new password "a brand new passphrase" with the link from e-mail 1
    Then the response status is 204
    And 1 password reset link is stored
    When the donor sets the new password "yet another passphrase" with the link from e-mail 2
    Then the response status is 400
    And the problem type ends with "donors/invalid-password-reset-token"

  Scenario: A short or common password does not use up the link
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor asked for a password reset for "jana@example.cz"
    When the donor sets the new password "short" with the link from the e-mail
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "password"
    When the donor sets the new password "password12345" with the link from the e-mail
    Then the response status is 400
    And the problem type ends with "donors/password-too-common"
    When the donor sets the new password "a brand new passphrase" with the link from the e-mail
    Then the response status is 204

  Scenario: A reset ends every session but not the access token already issued
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor asked for a password reset for "jana@example.cz"
    When the donor sets the new password "a brand new passphrase" with the link from the e-mail
    Then the response status is 204
    When the donor refreshes the session
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"
    When the donor asks for the profile
    Then the response status is 200
    When 16 minutes pass
    And the donor asks for the profile
    Then the response status is 401

  Scenario: A donor holds at most three live links and keeps the earlier ones
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    When a password reset is asked for "jana@example.cz" 4 times
    Then every one of these requests is answered 202
    And 3 password reset links are stored
    And 3 reset e-mails are sent to "jana@example.cz"
    When the donor sets the new password "a brand new passphrase" with the link from e-mail 1
    Then the response status is 204

  Scenario: Expired links make room for a new one
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And a password reset is asked for "jana@example.cz" 3 times
    And 3 reset e-mails are sent to "jana@example.cz"
    When 61 minutes pass
    And a password reset is asked for "jana@example.cz"
    Then the response status is 202
    And 1 password reset link is stored
    And 4 reset e-mails are sent to "jana@example.cz"

  Scenario: The sixth request within an hour from one address is refused
    Given a password reset is asked for "nobody1@example.cz", "nobody2@example.cz", "nobody3@example.cz", "nobody4@example.cz" and "nobody5@example.cz"
    When a password reset is asked for "nobody6@example.cz"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    And the problem has the title "Příliš mnoho požadavků"

  Scenario: A donor who prefers English gets the e-mail in English
    Given a person registered with email "john@example.com", password "correct horse battery" and preferred locale "en"
    When a password reset is asked for "john@example.com"
    Then the response status is 202
    And 1 reset e-mail is sent to "john@example.com"
    And the reset e-mail has the subject "Password reset for your Nová naděje donor account"
    And both parts of the reset e-mail contain "The link is valid for 60 minutes and can be used once."

  Scenario: A forged host does not reach the link
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    When a password reset is asked for "jana@example.cz" with the Host and X-Forwarded-Host "evil.example"
    Then the response status is 202
    And 1 reset e-mail is sent to "jana@example.cz"
    And both parts of the reset e-mail contain "http://localhost:4200/obnova-hesla#token="
    And neither part of the reset e-mail contains "evil.example"

  Scenario: A reset token is neither a refresh token nor an access token
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And the donor asked for a password reset for "jana@example.cz"
    When the link's token is presented as the refresh cookie
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"
    When the link's token is presented as a bearer token for the profile
    Then the response status is 401

  Scenario Outline: A malformed token or a blank field is a validation error
    When a password reset is confirmed with token "<token>" and password "<password>"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "<field>"

    Examples:
      | token                                        | password               | field    |
      | abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_QQ | a brand new passphrase | token    |
      | abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-.Q  | a brand new passphrase | token    |
      |                                              | a brand new passphrase | token    |
      | abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_Q  |                        | password |

  Scenario: An unknown well-formed token is refused as invalid
    When a password reset is confirmed with an unknown well-formed token and password "a brand new passphrase"
    Then the response status is 400
    And the problem type ends with "donors/invalid-password-reset-token"
