@donations
Feature: An administrator sees which key signs the verification QR codes on receipts

  Background:
    Given today is 2026-11-13
    And the server has started and registered its receipt signing key
    And a person "Jana" is registered

  Scenario: The administrator sees the current key, when it was registered and that it is published
    Given "Jana" is an administrator
    When "Jana" asks for the receipt signing keys
    Then the response status is 200
    And the current receipt signing key is "21fe31df", published: true
    And the receipt signing keys are:
      | keyId    | status | registeredAt         | published | current |
      | 21fe31df | active | 2026-11-13T11:00:00Z | true      | true    |

  Scenario: An altered key row shows the current key as not published
    Given "Jana" is an administrator
    And the receipt signing key "21fe31df" was altered in the database to look revoked
    When "Jana" asks for the receipt signing keys
    Then the response status is 200
    And the current receipt signing key is "21fe31df", published: false
    And the receipt signing keys are:
      | keyId    | status  | registeredAt         | published | current |
      | 21fe31df | revoked | 2026-11-13T11:00:00Z | false     | true    |

  Scenario: A key row added in the database shows as not published beside the current key
    Given "Jana" is an administrator
    And a row for the receipt signing key "39f713d0" was added in the database with the seal of "21fe31df"
    When "Jana" asks for the receipt signing keys
    Then the response status is 200
    And the current receipt signing key is "21fe31df", published: true
    And the receipt signing keys are:
      | keyId    | status | registeredAt         | published | current |
      | 39f713d0 | active | 2026-11-01T07:00:00Z | false     | false   |
      | 21fe31df | active | 2026-11-13T11:00:00Z | true      | true    |

  Scenario: Outside development the current key shows as not published when it is a public test key of RFC 8032
    Given "Jana" is an administrator
    And the server runs outside development
    When "Jana" asks for the receipt signing keys
    Then the response status is 200
    And the current receipt signing key is "21fe31df", published: false
    And the receipt signing keys are:
      | keyId    | status | registeredAt         | published | current |
      | 21fe31df | active | 2026-11-13T11:00:00Z | false     | true    |

  Scenario: A donor without the administrator role is refused
    When "Jana" asks for the receipt signing keys
    Then the response status is 403
    And the problem type ends with "auth/forbidden"

  Scenario: Without a token the receipt signing keys are not served
    When someone without a token asks for the receipt signing keys
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
