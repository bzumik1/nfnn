@donations @connected-apps
Feature: An administrator or a connected application issues the yearly receipts of many donors at once

  The page "Hromadná potvrzení" lists the donors whose gifts fall in a completed year and
  issues their yearly receipts fifty at a time through the issuer every single receipt
  goes through: under each donor's lock, the same data returning the same receipt, so a
  repeated or interrupted run issues nothing twice. Erased donors are skipped. Each new
  number is audited as a single issue is, and the run adds one row with its counts,
  naming the connected application when one asked. The browser draws one PDF to print
  from the answers, which are the receipts as the administration reads them one by one.

  Background:
    Given today is 2026-12-20
    And a person of the foundation signs the receipts
    And a person "Jana" is registered
    And a person "Karel" is registered
    And a person "Eva" is registered
    And a person "Petr" is registered
    And "Petr" is an administrator
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 3001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 3002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 3003 | 2026-11-20 | 300.00  | 2900244444 | 2010     | Karel         | {Karel}        |
      | 3004 | 2026-12-01 | 700.00  | 2900255555 | 2010     | Eva           | {Eva}          |
    And the application starts the import
    And today is 2027-01-15

  Scenario: The administration lists the donors with gifts in a year and issues their yearly receipts, and a second run changes nothing
    Given "Karel" issues his yearly receipt for 2026
    And "Petr" erased the donor "Eva"
    When "Petr" lists in the administration the donors to receive yearly receipts for 2026
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the donors to receive yearly receipts are, 1 erased donor left out:
      | donor | giftCount | totalAmountMinor | receipt     |
      | Jana  | 2         | 350000           |             |
      | Karel | 1         | 30000            | 2027-000001 |
    When "Petr" lists in the administration the donors to receive yearly receipts of the last completed year
    Then the response status is 200
    And the donors to receive yearly receipts are those of 2026, among completed years from 2026 through 2026
    When "Petr" issues in the administration the yearly receipts for 2026 of "Jana, Karel, Eva, Petr"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the yearly receipts were issued as:
      | donor | outcome   | number      | problem                                  |
      | Jana  | ISSUED    | 2027-000002 |                                          |
      | Karel | UNCHANGED | 2027-000001 |                                          |
      | Eva   | SKIPPED   |             | donations/donor-erased                   |
      | Petr  | SKIPPED   |             | donations/yearly-receipt-not-available   |
    And the yearly receipts were counted as 1 issued, 0 replaced, 1 unchanged and 2 skipped
    And every receipt of the yearly receipts answer is the receipt the administration reads by its id
    When "Petr" issues in the administration the yearly receipts for 2026 of "Karel, Jana"
    Then the response status is 200
    And the yearly receipts were issued as:
      | donor | outcome   | number      | problem |
      | Karel | UNCHANGED | 2027-000001 |         |
      | Jana  | UNCHANGED | 2027-000002 |         |
    And 2 receipts are stored
    When "Petr" asks for the admin actions
    Then the admin actions are, in any order of those performed at the same moment:
      | action         | donor | summary                                                                                         |
      | ISSUE_RECEIPTS |       | Hromadně vystavena roční potvrzení za rok 2026: nová 1, nahrazená 0, beze změny 1, přeskočená 2. |
      | ISSUE_RECEIPT  | Jana  | Dárci Jana Nováková vystaveno roční potvrzení 2027-000002 za rok 2026.                         |
      | ERASE_DONOR    | Eva   | Osobní údaje dárce vymazány: účet je anonymní, všechna přihlášení skončila, bankovní účty a odpovědi o starších symbolech jsou smazané; dary a potvrzení zůstávají. |

  Scenario: A donor whose data changed since the receipt gets a replacement from a browser session, which names the receipt it replaces
    Given "Jana" issues her yearly receipt for 2026
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Petr" issues in the administration the yearly receipts for 2026 of "Jana, Karel"
    Then the response status is 200
    And the yearly receipts were issued as:
      | donor | outcome  | number      | problem | replaced    |
      | Jana  | REPLACED | 2027-000002 |         | 2027-000001 |
      | Karel | ISSUED   | 2027-000003 |         |             |
    And the yearly receipts were counted as 1 issued, 1 replaced, 0 unchanged and 0 skipped
    And 3 receipts are stored
    And 2 receipts are active
    When "Petr" lists in the administration the donors to receive yearly receipts for 2026
    Then the donors to receive yearly receipts are, 0 erased donors left out:
      | donor | giftCount | totalAmountMinor | receipt     |
      | Jana  | 2         | 350000           | 2027-000002 |
      | Karel | 1         | 30000            | 2027-000003 |
      | Eva   | 1         | 70000            |             |

  Scenario: A connected application with the writing permission issues the yearly receipts, skips a replacement and is named in the audit trail
    Given "Jana" issues her yearly receipt for 2026
    And "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Petr" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token lists the donors to receive yearly receipts for 2026
    Then the response status is 200
    And the donors to receive yearly receipts are, 0 erased donors left out:
      | donor | giftCount | totalAmountMinor | receipt     |
      | Jana  | 2         | 350000           | 2027-000001 |
      | Karel | 1         | 30000            |             |
      | Eva   | 1         | 70000            |             |
    When the exchanged API token issues the yearly receipts for 2026 of "Jana, Karel, Eva"
    Then the response status is 200
    And the yearly receipts were issued as:
      | donor | outcome | number      | problem                                        |
      | Jana  | SKIPPED |             | donations/receipt-replacement-in-browser-only |
      | Karel | ISSUED  | 2027-000002 |                                                |
      | Eva   | ISSUED  | 2027-000003 |                                                |
    And 3 receipts are stored
    And 3 receipts are active
    When "Petr" asks for the admin actions
    Then the admin actions came through these applications:
      | action         | client    |
      | ISSUE_RECEIPTS | claude.ai |
      | ISSUE_RECEIPT  | claude.ai |
      | ISSUE_RECEIPT  | claude.ai |

  Scenario: A connected application skips a donor whose yearly receipt would replace a single receipt of a gift, and a browser session issues it, replacing the single receipt
    Given "Jana" issues the receipt of her donation received on 2026-10-01
    And "Petr" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token issues the yearly receipts for 2026 of "Jana, Karel"
    Then the response status is 200
    And the yearly receipts were issued as:
      | donor | outcome | number      | problem                                        |
      | Jana  | SKIPPED |             | donations/receipt-replacement-in-browser-only |
      | Karel | ISSUED  | 2027-000002 |                                                |
    When "Petr" issues in the administration the yearly receipts for 2026 of "Jana"
    Then the response status is 200
    And the yearly receipts were issued as:
      | donor | outcome | number      | problem |
      | Jana  | ISSUED  | 2027-000003 |         |
    And 3 receipts are stored
    And 2 receipts are active
    And receipt "2027-000001" is superseded

  Scenario: A run that issues no new number leaves no row in the audit trail
    When "Petr" issues in the administration the yearly receipts for 2026 of "Petr"
    Then the response status is 200
    And the yearly receipts were issued as:
      | donor | outcome | number | problem                                |
      | Petr  | SKIPPED |        | donations/yearly-receipt-not-available |
    And no receipt issue is audited
    And no bulk receipt issue is audited

  Scenario: While the server's own signing key is not published, the whole run is refused before any number is taken
    Given the server has started and registered its receipt signing key
    And the row of the receipt signing key "21fe31df" was deleted in the database
    When "Petr" issues in the administration the yearly receipts for 2026 of "Jana, Karel"
    Then the response status is 409
    And the problem type ends with "donations/receipt-signing-key-unpublished"
    And 0 receipts are stored
    And no receipt issue is audited
    And no bulk receipt issue is audited

  Scenario: The yearly receipts are refused for a year that is not completed or before the first receipt year, and for a list that is empty, too long or repeats a donor
    When "Petr" lists in the administration the donors to receive yearly receipts for 2027
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"
    When "Petr" lists in the administration the donors to receive yearly receipts for 2025
    Then the response status is 400
    And the problem type ends with "donations/receipt-before-first-year"
    When "Petr" issues in the administration the yearly receipts for 2027 of "Jana"
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"
    When "Petr" issues in the administration the yearly receipts for 2025 of "Jana"
    Then the response status is 400
    And the problem type ends with "donations/receipt-before-first-year"
    When "Petr" issues in the administration the yearly receipts for 2026 of no donor
    Then the response status is 400
    And the problem type ends with "validation"
    When "Petr" issues in the administration the yearly receipts for 2026 of 51 unknown donors
    Then the response status is 400
    And the problem type ends with "validation"
    When "Petr" issues in the administration the yearly receipts for 2026 of "Jana, Jana"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Petr" issues in the administration the yearly receipts for 2026 of 50 unknown donors
    Then the response status is 200
    And the yearly receipts were counted as 0 issued, 0 replaced, 0 unchanged and 50 skipped
    And 0 receipts are stored

  Scenario: A connected application that may only read lists the donors but cannot issue their receipts
    Given "Petr" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read"
    When the connector exchanges the connector token for an API token
    And the exchanged API token lists the donors to receive yearly receipts for 2026
    Then the response status is 200
    When the exchanged API token issues the yearly receipts for 2026 of "Jana"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    And 0 receipts are stored

  Scenario: A donor without the administrator role, and a request without a token, reach neither the list nor the issue
    When "Jana" lists in the administration the donors to receive yearly receipts for 2026
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Jana" issues in the administration the yearly receipts for 2026 of "Jana"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token lists in the administration the donors to receive yearly receipts for 2026
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token issues in the administration the yearly receipts for 2026 of "Jana"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    And 0 receipts are stored
