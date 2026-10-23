@donations
Feature: An administrator pairs bank payments by hand

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" is an administrator

  Scenario: The unpaired payments are listed newest first with what the bank sent
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message        |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | 1111111111     | Dar pro fond   |
      | 1002 | 2026-10-15 | 300.00 | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |                |
      | 1003 | 2026-10-12 | 250.00 | 2900244444 | 0800     | Svoboda Karel |                | Pozdrav z Brna |
    And the application starts the import
    When "Jana" asks for the unpaired payments
    Then the response status is 200
    And the unpaired payments are 1003, 1001
    And unpaired payment 1001 says:
      | bookedOn            | 2026-10-10      |
      | amountMinor         | 50000           |
      | currency            | CZK             |
      | variableSymbol      | 1111111111      |
      | counterpartyAccount | 2900233333/2010 |
      | counterpartyName    | Nováková Jana   |
      | messageForRecipient | Dar pro fond    |

  Scenario: The payments are filtered by text and period and paged with the total of all that match
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message        |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | 1111111111     | Dar pro fond   |
      | 1002 | 2026-10-15 | 300.00 | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |                |
      | 1003 | 2026-10-12 | 250.00 | 2900244444 | 0800     | Svoboda Karel |                | Pozdrav z Brna |
      | 1004 | 2026-09-02 | 100.00 | 2900255555 | 0300     | Dvořák Jan    |                |                |
    And the application starts the import
    When "Jana" asks for the unpaired payments with "query=novakova"
    Then the response status is 200
    And the unpaired payments are 1001
    When "Jana" asks for the unpaired payments with "query=2900233333/2010"
    Then the unpaired payments are 1001
    When "Jana" asks for the unpaired payments with "from=2026-10-01&to=2026-10-31&limit=1"
    Then the unpaired payments are 1003
    And the payment list counts 2 in total
    When "Jana" asks for the unpaired payments with "from=2026-10-01&to=2026-10-31&limit=1&offset=1"
    Then the unpaired payments are 1001
    When "Jana" asks for the paired payments of "Petr"
    Then the response status is 200
    And the listed payments are 1002
    And the payment list counts 1 in total
    When "Jana" asks for the paired payments of "Jana"
    Then the listed payments are none

  Scenario: A payment list with a page out of bounds is refused
    When "Jana" asks for the unpaired payments with "limit=0"
    Then the response status is 400
    When "Jana" asks for the unpaired payments with "limit=501"
    Then the response status is 400
    When "Jana" asks for the unpaired payments with "offset=-1"
    Then the response status is 400
    When "Jana" asks for the unpaired payments with "from=not-a-date"
    Then the response status is 400

  Scenario: Pairing a payment with a donor records a MANUAL donation, audits the action and the donor sees the gift
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | 1111111111     |
    And the application starts the import
    When "Jana" pairs payment 1001 with "Petr"
    Then the response status is 200
    And the pairing changed no yearly receipt
    And bank payment 1001 is paired with "Petr"
    And "Petr" has a donation of "500.00" CZK received on 2026-10-10 paired by hand
    And the admin action "PAIR_PAYMENT" by "Jana" on payment 1001 is recorded
    When "Jana" asks for the unpaired payments
    Then the unpaired payments are none
    When "Jana" asks for the paired payments of 2026
    Then the response status is 200
    And paired payment 1001 says:
      | donation.donorName     | Petr Svoboda |
      | donation.pairedBy      | MANUAL       |
      | donation.receiptIssued | false        |
    And the paired list offers the years 2026

  Scenario: A payment that is already paired cannot be paired again
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |
    And the application starts the import
    When "Jana" pairs payment 1001 with "Jana"
    Then the response status is 409
    And the problem type ends with "donations/bank-payment-already-paired"
    And bank payment 1001 is paired with "Petr"

  Scenario: An unknown payment or an unknown donor is not found
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | 1111111111     |
    And the application starts the import
    When "Jana" pairs an unknown payment with "Petr"
    Then the response status is 404
    And the problem type ends with "donations/bank-payment-not-found"
    When "Jana" pairs payment 1001 with an unknown donor
    Then the response status is 404
    And the problem type ends with "donations/donor-not-found"
    And bank payment 1001 is unpaired

  Scenario: A pairing request without a donor is refused
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | 1111111111     |
    And the application starts the import
    When "Jana" pairs payment 1001 without naming a donor
    Then the response status is 400
    And the problem lists an error for field "donorId"

  Scenario: Unpairing removes the donation, keeps the payment out of automatic pairing and audits the action
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |
    And the application starts the import
    And bank payment 1001 is paired with "Petr"
    When "Jana" unpairs payment 1001
    Then the response status is 200
    And the unpairing changed no yearly receipt
    And bank payment 1001 is unpaired
    And "Petr" has 0 donations
    And the admin action "UNPAIR_PAYMENT" by "Jana" on payment 1001 is recorded
    When the hourly import runs
    Then bank payment 1001 is unpaired
    When "Jana" asks for the unpaired payments
    Then the unpaired payments are 1001
    And unpaired payment 1001 is marked as unpaired by an administrator
    When "Jana" pairs payment 1001 with "Petr"
    Then the response status is 200
    And bank payment 1001 is paired with "Petr"

  Scenario: A payment that is not paired cannot be unpaired
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | 1111111111     |
    And the application starts the import
    When "Jana" unpairs payment 1001
    Then the response status is 409
    And the problem type ends with "donations/bank-payment-not-paired"

  Scenario: A donation with an issued single receipt cannot be unpaired
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |
    And the application starts the import
    And "Petr" downloads the receipt of his donation received on 2026-10-10
    When "Jana" unpairs payment 1001
    Then the response status is 409
    And the problem type ends with "donations/donation-has-receipt"
    And bank payment 1001 is paired with "Petr"
    When "Jana" asks for the paired payments of 2026
    Then paired payment 1001 says:
      | donation.receiptIssued | true |

  Scenario: Pairing and unpairing in a year with an issued yearly receipt name that year so the administrator can tell the donor
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |
      | 1002 | 2026-10-12 | 200.00 | 2900233333 | 2010     | Svoboda Petr  | 1111111111     |
    And the application starts the import
    And today is 2027-01-15
    And "Petr" downloads his yearly receipt for 2026
    When "Jana" pairs payment 1002 with "Petr"
    Then the response status is 200
    And the pairing changed the yearly receipt for 2026
    When "Jana" unpairs payment 1002
    Then the response status is 200
    And the unpairing changed the yearly receipt for 2026

  Scenario: Donors are found by part of the name or the start of the variable symbol
    Given a company "Acme" is registered with identification number "25596641"
    When "Jana" searches donors for "nová"
    Then the response status is 200
    And the found donors are "Jana"
    When "Jana" searches donors for "o"
    Then the found donors are "Acme", "Jana" and "Petr"
    When "Jana" searches donors for "acme"
    Then the found donors are "Acme"
    When "Jana" searches donors for "{Petr}"
    Then the found donors are "Petr"
    When "Jana" searches donors for ""
    Then the found donors are none

  Scenario: A donor without the administrator role is refused and without a token nothing is served
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Svoboda Petr  | 1111111111     |
    And the application starts the import
    When "Petr" asks for the unpaired payments
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" pairs payment 1001 with "Petr"
    Then the response status is 403
    And bank payment 1001 is unpaired
    When someone without a token asks for the unpaired payments
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
