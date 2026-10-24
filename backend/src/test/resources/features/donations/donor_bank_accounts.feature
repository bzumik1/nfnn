@donations
Feature: A donor sees, adds and disconnects the bank accounts the foundation pairs payments from

  Scenario: A donor without a payment carrying the symbol has no bank account
    Given a person "Jana" is registered
    When "Jana" asks for her bank accounts
    Then the response status is 200
    And the bank account list is empty

  Scenario: The account a payment with the symbol came from is listed with the donations paired through it
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
      | 1002 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1003 | 2026-10-12 | 300.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the application starts the import
    And "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE |               |                | 2             | 50000            | 2026-10-12     | false  |
    And bank account "2900233333/2010" was verified on 2026-10-17
    When "Jana" asks for her donations
    Then the donation received on 2026-10-12 is listed as paired by sender account "2900233333/2010"
    And the donation received on 2026-10-05 is listed as paired by sender account "2900233333/2010"
    And the donation received on 2026-10-10 is listed as paired by variable symbol without a sender account

  Scenario: One koruna with the symbol from another account adds that account and pairs its earlier payments without a symbol
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-01 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-03 | 400.00 | 1234567    | 0800     | Nováková Jana |                |
    And the application starts the import
    And bank payment 1002 is unpaired
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-16 | 1.00   | 1234567    | 0800     | Nováková Jana | {Jana}         |
    When 1 days pass
    And the hourly import runs
    Then bank payment 1003 is paired with "Jana"
    And bank payment 1002 is paired with "Jana"
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 1234567/0800    | ACTIVE |               |                | 1             | 40000            | 2026-10-03     | false  |
      | 2900233333/2010 | ACTIVE |               |                | 0             | 0                |                | false  |

  Scenario: A disconnected account pairs no later payment without a symbol and the donations paired before stay
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-12 | 300.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    When "Jana" disconnects bank account "2900233333/2010"
    Then the response status is 204
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-17 | 100.00 | 2900233333 | 2010     | Nováková Jana |                |
      | 1004 | 2026-10-18 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
    When 1 days pass
    And the hourly import runs
    Then bank payment 1002 is paired with "Jana"
    And bank payment 1003 is paired with "Jana"
    And bank payment 1004 is unpaired
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber   | status       | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | DISCONNECTED |               | 2026-10-17     | 2             | 40000            | 2026-10-17     | false  |

  Scenario: A disconnected account is not added again by a payment with the symbol until the donor reconnects it, and then only from that day
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" disconnects bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-18 | 300.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1003 | 2026-10-18 | 100.00 | 2900233333 | 2010     | Nováková Jana |                |
    And 2 days pass
    And the hourly import runs
    And bank payment 1002 is paired with "Jana"
    And bank payment 1003 is unpaired
    When "Jana" reconnects bank account "2900233333/2010"
    Then the response status is 204
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber   | status           | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | AWAITING_PAYMENT | 2026-10-19    |                | 0             | 0                |                | false  |
      | 2900233333/2010 | DISCONNECTED     |               | 2026-10-17     | 0             | 0                |                | false  |
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1004 | 2026-10-19 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1005 | 2026-10-19 | 250.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the hourly import runs
    Then bank payment 1005 is paired with "Jana"
    And bank payment 1003 is unpaired
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber   | status       | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE       | 2026-10-19    |                | 1             | 25000            | 2026-10-19     | false  |
      | 2900233333/2010 | DISCONNECTED |               | 2026-10-17     | 0             | 0                |                | false  |

  Scenario: An account another donor disconnected is taken over without its history
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-06 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
    And the application starts the import
    And "Jana" disconnects bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1003 | 2026-10-18 | 150.00 | 2900233333 | 2010     | Svoboda Petr  |                |
      | 1004 | 2026-10-19 | 1.00   | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |
    When 2 days pass
    And the hourly import runs
    Then bank payment 1004 is paired with "Petr"
    And bank payment 1003 is paired with "Petr"
    And bank payment 1002 is paired with "Jana"
    When "Petr" asks for his bank accounts
    Then the bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE | 2026-10-18    |                | 1             | 15000            | 2026-10-18     | false  |

  Scenario: An account taken over while its previous holder awaits a reconnect starts the day after the previous holder's last day
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" disconnects bank account "2900233333/2010"
    And 2 days pass
    And "Jana" reconnects bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-16 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
      | 1003 | 2026-10-19 | 1.00   | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |
    When the hourly import runs
    Then bank payment 1003 is paired with "Petr"
    And bank payment 1002 is paired with "Jana"
    When "Petr" asks for his bank accounts
    Then the bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE | 2026-10-18    |                | 0             | 0                |                | false  |
    Given the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1004 | 2026-10-20 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1005 | 2026-10-20 | 100.00 | 2900233333 | 2010     | Nováková Jana |                |
    When 1 days pass
    And the hourly import runs
    Then bank payment 1004 is paired with "Jana"
    And bank payment 1005 is unpaired
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber   | status       | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE       | 2026-10-19    |                | 0             | 0                |                | true   |
      | 2900233333/2010 | DISCONNECTED |               | 2026-10-17     | 1             | 20000            | 2026-10-16     | false  |

  Scenario: An account taken over right after its previous holder proved a reconnect still starts the day after the previous holder's last day
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" disconnects bank account "2900233333/2010"
    And 2 days pass
    And "Jana" reconnects bank account "2900233333/2010"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-16 | 200.00 | 2900233333 | 2010     | Nováková Jana |                |
      | 1003 | 2026-10-19 | 1.00   | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1004 | 2026-10-20 | 1.00   | 2900233333 | 2010     | Svoboda Petr  | {Petr}         |
    When 1 days pass
    And the hourly import runs
    Then bank payment 1003 is paired with "Jana"
    And bank payment 1004 is paired with "Petr"
    And bank payment 1002 is paired with "Jana"
    When "Petr" asks for his bank accounts
    Then the bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE | 2026-10-18    |                | 0             | 0                |                | true   |

  Scenario: An account two donors verified is marked as shared for both
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-05 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1002 | 2026-10-06 | 300.00 | 2900233333 | 2010     | Nováková Jana | {Petr}         |
      | 1003 | 2026-10-07 | 100.00 | 2900233333 | 2010     | Nováková Jana |                |
    When the application starts the import
    Then bank payment 1003 is unpaired
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE |               |                | 0             | 0                |                | true   |
    When "Petr" asks for his bank accounts
    Then the bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2900233333/2010 | ACTIVE |               |                | 0             | 0                |                | true   |

  Scenario: An excluded account is never learned and pairs nothing without a symbol
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2400000002 | 2010     | Sběrný účet   | {Jana}         |
      | 1002 | 2026-10-12 | 300.00 | 2400000002 | 2010     | Sběrný účet   |                |
    When the application starts the import
    Then bank payment 1001 is paired with "Jana"
    And bank payment 1002 is unpaired
    And "Jana" has learned no sender account

  Scenario: An account learned before it was excluded stays listed as verified but excluded from pairing, and can still be disconnected
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2400000002 | 2010     | Sběrný účet   | {Jana}         |
    And the application starts the import
    And "Jana" learned the sender account of bank payment 1001 before it was excluded
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1002 | 2026-10-18 | 300.00 | 2400000002 | 2010     | Sběrný účet   |                |
    When 1 days pass
    And the hourly import runs
    Then bank payment 1002 is unpaired
    When "Jana" asks for her bank accounts
    Then the bank accounts are:
      | accountNumber   | status | connectedFrom | disconnectedOn | donationCount | totalAmountMinor | lastDonationOn | shared |
      | 2400000002/2010 | ACTIVE |               |                | 0             | 0                |                | false  |
    And bank account "2400000002/2010" is excluded from pairing
    When "Jana" disconnects bank account "2400000002/2010"
    Then the response status is 204

  Scenario: A donor cannot disconnect another donor's account, an account twice, or reconnect a connected one
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Petr" tries to disconnect bank account "2900233333/2010" of "Jana"
    Then the response status is 404
    And the problem type ends with "donations/bank-account-not-found"
    When "Jana" reconnects the connected bank account "2900233333/2010"
    Then the response status is 409
    And the problem type ends with "donations/bank-account-already-connected"
    And the problem has the title "Párování z účtu už jste zapnuli"
    When "Jana" disconnects bank account "2900233333/2010"
    And "Jana" disconnects the disconnected bank account "2900233333/2010"
    Then the response status is 409
    And the problem type ends with "donations/bank-account-already-disconnected"
    And the problem has the title "Párování z účtu je už vypnuté"

  Scenario: The bank accounts need a signed-in donor
    When someone without a token asks for the bank accounts
    Then the response status is 401
