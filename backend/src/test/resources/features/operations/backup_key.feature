@operations
Feature: The backups are encrypted with a key that an administrator sees only after a fresh second factor and confirms as saved

  Background:
    Given today is 2026-10-28
    And a person "Jana" is registered
    And "Jana" is an administrator
    And the backup folder exists

  Scenario: The key waits to be confirmed until the administrator retypes the three of its words asked for when it was shown
    When "Jana" asks for the backups
    Then the response status is 200
    And the backups answer says:
      | key.available | true  |
      | key.confirmed | false |
    And the answer carries no backup key
    When "Jana" confirms the backup key with the words "abeceda", "abeceda" and "abeceda" at 1, 2 and 3
    Then the response status is 409
    And the problem type ends with "operations/backup-key-confirmation-expired"
    When "Jana" reveals the backup key with a fresh code
    Then the answer carries the backup key of this server and no cache keeps it
    And the answer asks for three different words of the key
    When "Jana" confirms the backup key with the asked words in the wrong order
    Then the response status is 400
    And the problem type ends with "operations/backup-key-check-mismatch"
    When "Jana" confirms the backup key with the asked words
    Then the response status is 200
    And the admin action "CONFIRM_BACKUP_KEY" by "Jana" is recorded with details containing "Potvrzeno uložení klíče k zálohám"
    When "Jana" asks for the backups
    Then the backups answer says:
      | key.available | true |
      | key.confirmed | true |

  Scenario: Every view of the key needs a fresh code from the authenticator app, even in a session opened with one, and is audited
    When "Jana" reveals the backup key without confirming it again
    Then the response status is 400
    And the problem type ends with "donors/fresh-second-factor-required"
    When "Jana" reveals the backup key with the code "000000"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"
    And the answer carries no backup key
    When "Jana" reveals the backup key with a fresh code
    Then the answer carries the backup key of this server and no cache keeps it
    And the admin action "VIEW_BACKUP_KEY" by "Jana" is recorded with details containing "ověřeno druhým faktorem"
    When "Jana" reveals the backup key again with the same code
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"

  Scenario: A refused second factor is recorded, and five refusals in a quarter of an hour keep the key hidden even from a right code
    When "Jana" reveals the backup key with the code "000000"
    Then the response status is 400
    And the admin action "VIEW_BACKUP_KEY_REFUSED" by "Jana" is recorded with details containing "druhý faktor nesouhlasil"
    Given "Jana" tried to reveal the backup key with a wrong code 4 times
    When "Jana" reveals the backup key with a fresh code
    Then the response status is 409
    And the problem type ends with "operations/backup-key-reveal-paused"
    And the answer carries no backup key
    When 15 minutes pass
    And "Jana" reveals the backup key with a fresh code
    Then the answer carries the backup key of this server and no cache keeps it

  Scenario: Every administrator is told by e-mail whenever the key is shown
    Given a person "Petr" is registered
    And "Petr" is an administrator
    When "Jana" reveals the backup key with a fresh code
    Then the answer carries the backup key of this server and no cache keeps it
    And an e-mail goes to the address of "Jana" with the subject "Klíč k zálohám byl zobrazen – Nová naděje"
    And an e-mail goes to the address of "Petr" with the subject "Klíč k zálohám byl zobrazen – Nová naděje"

  Scenario: An administrator shows the key with a passkey instead of the code
    Given "Jana" added a passkey named "iPhone"
    When "Jana" reveals the backup key with the passkey "iPhone"
    Then the answer carries the backup key of this server and no cache keeps it

  Scenario: A donor without the administrator role and a visitor without a token never see the key
    Given a person "Petr" is registered
    When "Petr" reveals the backup key with the code "123456"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" confirms the backup key with the words "abeceda", "abeceda" and "abeceda" at 1, 2 and 3
    Then the response status is 403
    When someone without a token reveals the backup key with the code "123456"
    Then the response status is 401

  Scenario: Guessing at the key is stopped after ten attempts from one address
    Given "Jana" tried to confirm the backup key 10 times
    When "Jana" confirms the backup key with the words "abeceda", "abeceda" and "abeceda" at 1, 2 and 3
    Then the response status is 429
    And the problem type ends with "operations/rate-limited"
    When "Jana" reveals the backup key with a fresh code
    Then the response status is 429
