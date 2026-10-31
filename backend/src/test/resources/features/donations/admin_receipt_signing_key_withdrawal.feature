@donations
Feature: An administrator withdraws a leaked receipt signing key from the web, with a fresh second factor

  Background:
    Given today is 2026-11-13
    And the backup folder exists
    And the server has started and registered its receipt signing key
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Withdrawing the server's own key revokes it everywhere, audits it, tells every administrator and restarts the backend for a new seed
    Given a person "Petr" is registered
    And "Petr" is an administrator
    When "Jana" withdraws the receipt signing key "21fe31df" with a fresh code
    Then the response status is 200
    And the withdrawal answer says the backend restarts: true
    And the receipt signing keys are:
      | keyId    | status  | registeredAt         | published | current |
      | 21fe31df | revoked | 2026-11-13T11:00:00Z | true      | true    |
    And the admin action "WITHDRAW_RECEIPT_SIGNING_KEY" by "Jana" is recorded with details containing "Stažen klíč k ověřovacím QR 21fe31df (ověřeno druhým faktorem)"
    And an e-mail goes to the address of "Jana" with the subject "Klíč k ověřovacím QR kódům byl stažen – Nová naděje"
    And an e-mail goes to the address of "Petr" with the subject "Klíč k ověřovacím QR kódům byl stažen – Nová naděje"
    And the backend restarts once to replace the seed of the receipt signing key "21fe31df"
    When a visitor asks for the receipt keys
    Then the response status is 200
    And the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId    | algorithm | publicKey                                   | status  | registeredAt         |
      | 21fe31df | Ed25519   | 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo | revoked | 2026-11-13T11:00:00Z |
    When the server starts again
    Then the server logged the error "Receipt signing key 21fe31df of this server is withdrawn, so the server signs no receipt until it starts with a new seed"
    And the server's admin action "REGISTER_RECEIPT_SIGNING_KEY" is recorded 1 time with details containing "21fe31df"

  Scenario: Until the server starts with a new seed, no receipt is issued or downloaded, not even one issued before the withdrawal
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 3001 | 2026-11-02 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" issues the receipt of her donation received on 2026-11-02
    And the response status is 200
    And "Jana" withdrew the receipt signing key "21fe31df" with a fresh code
    When "Jana" issues the receipt of her donation received on 2026-11-02
    Then the response status is 409
    And the problem type ends with "donations/receipt-signing-paused"
    When "Jana" downloads the receipt of her donation received on 2026-11-02
    Then the response status is 409
    And the problem type ends with "donations/receipt-signing-paused"

  Scenario: Withdrawing a key of an earlier server revokes it and keeps the backend running with its own key
    Given a backup of an earlier server with its receipt signing key registered at "2026-11-01T07:00:00Z" was restored
    And the backup container finished that restore 3 minutes ago under the request "019a1b2c-0000-7000-8000-000000000009"
    And the server starts again
    When "Jana" withdraws the receipt signing key "39f713d0" with a fresh code
    Then the response status is 200
    And the withdrawal answer says the backend restarts: false
    And the receipt signing keys are:
      | keyId    | status  | registeredAt         | published | current |
      | 39f713d0 | revoked | 2026-11-01T07:00:00Z | true      | false   |
      | 21fe31df | active  | 2026-11-13T11:00:00Z | true      | true    |
    And the backend is not restarted for a new receipt signing seed
    When a visitor asks for the receipt keys
    Then the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId    | algorithm | publicKey                                   | status  | registeredAt         |
      | 39f713d0 | Ed25519   | PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw | revoked | 2026-11-01T07:00:00Z |
      | 21fe31df | Ed25519   | 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo | active  | 2026-11-13T11:00:00Z |

  Scenario: A passkey confirms the withdrawal instead of the code
    Given "Jana" added a passkey named "iPhone"
    When "Jana" withdraws the receipt signing key "21fe31df" with the passkey "iPhone"
    Then the response status is 200
    And the withdrawal answer says the backend restarts: true

  Scenario: Every withdrawal needs a fresh second factor, even in a session opened with one, and a refused one is recorded and changes nothing
    When "Jana" withdraws the receipt signing key "21fe31df" without confirming it again
    Then the response status is 400
    And the problem type ends with "donors/fresh-second-factor-required"
    And the admin action "WITHDRAW_RECEIPT_SIGNING_KEY_REFUSED" by "Jana" is recorded with details containing "Klíč k ověřovacím QR 21fe31df se nestáhl: druhý faktor nesouhlasil"
    When "Jana" withdraws the receipt signing key "21fe31df" with the code "000000"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"
    When "Jana" asks for the receipt signing keys
    Then the receipt signing keys are:
      | keyId    | status | registeredAt         | published | current |
      | 21fe31df | active | 2026-11-13T11:00:00Z | true      | true    |
    And the backend is not restarted for a new receipt signing seed
    And no email is sent

  Scenario: A key already withdrawn, an unknown key, a key that is not published and a malformed id are refused
    Given a row for the receipt signing key "39f713d0" was added in the database with the seal of "21fe31df"
    When "Jana" withdraws the receipt signing key "dac073e0" with a fresh code
    Then the response status is 404
    And the problem type ends with "donations/receipt-signing-key-not-found"
    When "Jana" withdraws the receipt signing key "39f713d0" with a fresh code
    Then the response status is 404
    And the problem type ends with "donations/receipt-signing-key-not-found"
    When "Jana" withdraws the receipt signing key "NOT-A-KEY" with a fresh code
    Then the response status is 400
    When "Jana" withdraws the receipt signing key "21fe31df" with a fresh code
    Then the response status is 200
    When "Jana" withdraws the receipt signing key "21fe31df" with a fresh code
    Then the response status is 409
    And the problem type ends with "donations/receipt-signing-key-already-withdrawn"

  Scenario: A row put back from before the withdrawal stays withdrawn and is flagged at the next start, until it is withdrawn again
    Given the row of the receipt signing key "21fe31df" was copied as it stands
    And "Jana" withdrew the receipt signing key "21fe31df" with a fresh code
    And the copied row of the receipt signing key "21fe31df" was written back in the database
    When the server starts again
    Then the server logged the error "Receipt signing key 21fe31df was withdrawn but its row is active again, so it is published as withdrawn"
    When a visitor asks for the receipt keys
    Then the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId    | algorithm | publicKey                                   | status  | registeredAt         |
      | 21fe31df | Ed25519   | 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo | revoked | 2026-11-13T11:00:00Z |
    When "Jana" asks for the receipt signing keys
    Then the receipt signing keys flag in the audit trail:
      | keyId    | kind     |
      | 21fe31df | reverted |
    When "Jana" withdraws the receipt signing key "21fe31df" with a fresh code
    Then the response status is 200
    When "Jana" asks for the receipt signing keys
    Then the receipt signing keys flag nothing in the audit trail

  Scenario: A key row deleted from the database is flagged at the next start
    Given a backup of an earlier server with its receipt signing key registered at "2026-11-01T07:00:00Z" was restored
    And the backup container finished that restore 3 minutes ago under the request "019a1b2c-0000-7000-8000-000000000010"
    And the server starts again
    And the row of the receipt signing key "39f713d0" was deleted in the database
    When the server starts again
    Then the server logged the error "Receipt signing key 39f713d0 is in the audit trail but its row is missing"
    When "Jana" asks for the receipt signing keys
    Then the receipt signing keys flag in the audit trail:
      | keyId    | kind    |
      | 39f713d0 | missing |

  Scenario: A donor without the administrator role and a visitor without a token cannot withdraw a key
    Given a person "Petr" is registered
    When "Petr" withdraws the receipt signing key "21fe31df" with the code "123456"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token withdraws the receipt signing key "21fe31df"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: Five refused second factors of an administrator pause their withdrawals for a quarter of an hour, even with a right code
    Given "Jana" tried to withdraw the receipt signing key "21fe31df" with a wrong code 5 times
    When "Jana" withdraws the receipt signing key "21fe31df" with a fresh code
    Then the response status is 409
    And the problem type ends with "donations/receipt-signing-key-withdrawal-paused"
    And the backend is not restarted for a new receipt signing seed
    When 15 minutes pass
    And "Jana" withdraws the receipt signing key "21fe31df" with a fresh code
    Then the response status is 200

  Scenario: Guessing at the second factor is stopped after ten attempts from one address
    Given a person "Petr" is registered
    And "Petr" is an administrator
    And "Jana" tried to withdraw the receipt signing key "21fe31df" with a wrong code 10 times
    When "Petr" withdraws the receipt signing key "21fe31df" with a fresh code
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    When the following requests come from another client address
    And "Petr" withdraws the receipt signing key "21fe31df" with a fresh code
    Then the response status is 200
