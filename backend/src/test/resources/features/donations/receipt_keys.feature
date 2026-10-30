@donations
Feature: Anyone reads the keys that verify the QR codes on donation receipts

  Background:
    Given today is 2026-11-13
    And the server has started and registered its receipt signing key

  Scenario: The server's own key is published to everyone alike and may be cached for an hour
    When a visitor asks for the receipt keys
    Then the response status is 200
    And the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId    | algorithm | publicKey                                   | status | registeredAt         |
      | 21fe31df | Ed25519   | 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo | active | 2026-11-13T11:00:00Z |
    And the answer may be kept by any cache for an hour
    Given a person "Jana" is registered
    When "Jana" asks for the receipt keys
    Then the response status is 200
    And the answer is the one a visitor gets
    And the answer may be kept by any cache for an hour

  Scenario: An unchanged list answers a repeated request with its entity tag as not modified
    Given a visitor asks for the receipt keys
    When a visitor asks for the receipt keys again with the entity tag of the last answer
    Then the response status is 304
    And the answer may be kept by any cache for an hour

  Scenario: The first registration is audited with the server as the actor, a later start adds nothing
    When the server starts again
    Then the server's admin action "REGISTER_RECEIPT_SIGNING_KEY" is recorded 1 time with details containing "Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: 21fe31df"
    And the server logged no error

  Scenario: A key row altered in the database is never published and is flagged
    Given the receipt signing key "21fe31df" was altered in the database to look revoked
    When the server starts again
    Then the server logged the error "Receipt signing key 21fe31df fails its seal, so it is not published"
    When a visitor asks for the receipt keys
    Then the response status is 200
    And the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId | algorithm | publicKey | status | registeredAt |

  Scenario: A key row whose public key was replaced in the database is never published and is flagged
    Given the public key of the receipt signing key "21fe31df" was replaced in the database by another key's
    When the server starts again
    Then the server logged the error "Receipt signing key 21fe31df fails its seal, so it is not published"
    When a visitor asks for the receipt keys
    Then the response status is 200
    And the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId | algorithm | publicKey | status | registeredAt |

  Scenario: A key row whose registration time was replaced in the database is never published and is flagged
    Given the registration time of the receipt signing key "21fe31df" was replaced in the database by "2026-11-01T07:00:00Z"
    When the server starts again
    Then the server logged the error "Receipt signing key 21fe31df fails its seal, so it is not published"
    When a visitor asks for the receipt keys
    Then the response status is 200
    And the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId | algorithm | publicKey | status | registeredAt |

  Scenario: A key row added in the database with the seal of another row is never published and is flagged
    Given a row for the receipt signing key "39f713d0" was added in the database with the seal of "21fe31df"
    When the server starts again
    Then the server logged the error "Receipt signing key 39f713d0 fails its seal, so it is not published"
    When a visitor asks for the receipt keys
    Then the response status is 200
    And the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId    | algorithm | publicKey                                   | status | registeredAt         |
      | 21fe31df | Ed25519   | 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo | active | 2026-11-13T11:00:00Z |

  Scenario: After a restore on a new server the earlier server's key stays published beside the new one
    Given a backup of an earlier server with its receipt signing key registered at "2026-11-01T07:00:00Z" was restored
    When the server starts again
    Then the server logged no error
    When a visitor asks for the receipt keys
    Then the response status is 200
    And the receipt keys are those of the foundation "Nová naděje - nadační fond" "27278794":
      | keyId    | algorithm | publicKey                                   | status | registeredAt         |
      | 39f713d0 | Ed25519   | PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw | active | 2026-11-01T07:00:00Z |
      | 21fe31df | Ed25519   | 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo | active | 2026-11-13T11:00:00Z |
    When the server starts again
    Then the server logged no error
    And the server's admin action "REGISTER_RECEIPT_SIGNING_KEY" is recorded 1 time with details containing "21fe31df"

  Scenario: The sixty-first request within 15 minutes from one address is refused
    Given a visitor asked for the receipt keys 60 times
    When a visitor asks for the receipt keys
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    When the following requests come from another client address
    And a visitor asks for the receipt keys
    Then the response status is 200
