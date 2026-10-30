@donations
Feature: Anyone holding a receipt's proof asks whether the foundation keeps the receipt

  Background:
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issues her yearly receipt for 2026

  Scenario: An issued receipt the foundation keeps is active, and asking leaves nothing behind
    Given the database is noted as it stands
    When a visitor asks the status of receipt "2027-000001"
    Then the response status is 200
    And the receipt status is "active"
    And the status answer is kept by no cache
    And the database is as it was noted

  Scenario: A receipt the foundation issued anew in its place is replaced, and its replacement is active
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 2004 | 2026-12-30 | 300.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the hourly import runs
    And "Jana" issues her yearly receipt for 2026
    When a visitor asks the status of receipt "2027-000001"
    Then the response status is 200
    And the receipt status is "replaced"
    And the status answer is kept by no cache
    When a visitor asks the status of receipt "2027-000002"
    Then the response status is 200
    And the receipt status is "active"

  Scenario: A receipt the foundation withdrew is withdrawn
    Given receipt "2027-000001" was withdrawn
    When a visitor asks the status of receipt "2027-000001"
    Then the response status is 200
    And the receipt status is "withdrawn"
    And the status answer is kept by no cache

  Scenario: A digest of no issued receipt is unknown, also the digest of a receipt's signed message without its signature
    Given the database is noted as it stands
    When a visitor asks the status of the digest "00000000000000000000000000000000000000000000000000000000000000ff"
    Then the response status is 200
    And the receipt status is "unknown"
    And the status answer is kept by no cache
    When a visitor asks the status of receipt "2027-000001" by its signed message alone
    Then the response status is 200
    And the receipt status is "unknown"
    And the database is as it was noted

  Scenario Outline: A digest that is not 64 lowercase hex digits is refused as invalid
    When a visitor asks the status of the digest "<digest>"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "digest"

    Examples:
      | digest                                                            |
      |                                                                   |
      | 00000000000000000000000000000000000000000000000000000000000000f   |
      | 00000000000000000000000000000000000000000000000000000000000000ff0 |
      | 00000000000000000000000000000000000000000000000000000000000000FF  |
      | 00000000000000000000000000000000000000000000000000000000000000fg  |
      | 0000000000000000000000000000000 000000000000000000000000000000ff  |

  Scenario: A question without a digest, or with a digest far too long, is refused as invalid
    When a visitor asks the status without a digest
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "digest"
    When a visitor asks the status of a digest of 100000 hex digits
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "digest"

  Scenario: The sixty-first question within 15 minutes from one /64 network is refused until the window ends, another network is answered
    Given the following requests come from the client address "2001:db8:41:7::10"
    And a visitor asked the status of receipt "2027-000001" 60 times
    When the following requests come from the client address "2001:db8:41:7::99"
    And a visitor asks the status of receipt "2027-000001"
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    When the following requests come from the client address "2001:db8:41:8::10"
    And a visitor asks the status of receipt "2027-000001"
    Then the response status is 200
    And the receipt status is "active"
    When 14 minutes pass
    And the following requests come from the client address "2001:db8:41:7::10"
    And a visitor asks the status of receipt "2027-000001"
    Then the response status is 429
    When 1 minutes pass
    And a visitor asks the status of receipt "2027-000001"
    Then the response status is 200
