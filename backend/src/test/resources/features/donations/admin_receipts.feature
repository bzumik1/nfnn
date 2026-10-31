@donations @connected-apps
Feature: An administrator or a connected application issues a donor's receipt and reads the issued receipts

  The administration issues a receipt through the same issuer as the donor: one active
  receipt per donation and per donor and year, the same data returns the same receipt,
  and the donor's cap of new numbers in 24 hours holds whoever asks. Every new number
  issued from the administration is audited, naming the connected application when
  one asked for it. The PDF is drawn only in a browser, so these answers are data.

  Background:
    Given today is 2026-12-20
    And a person of the foundation signs the receipts
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Petr" is an administrator
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15

  Scenario: An administrator issues a donor's yearly receipt, the same call again returns the same receipt, and the new number is audited
    When "Petr" issues in the administration the yearly receipt of "Jana" for 2026
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the issued receipt has number "2027-000001"
    And the issued receipt is active
    And the issued receipt is the yearly receipt for 2026
    And the issued receipt belongs to "Jana"
    And the frozen receipt holds:
      | field                | value         |
      | issuedOn             | 2027-01-15    |
      | donor.name           | Jana Nováková |
      | donor.variableSymbol | {Jana}        |
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-10-01 | 100000      |
      | 2026-11-15 | 250000      |
    And the frozen receipt is signed with the server's key
    When 120 minutes pass
    And "Petr" issues in the administration the yearly receipt of "Jana" for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000001"
    And 1 receipt is stored
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000001"
    When "Petr" asks for the admin actions
    Then the admin actions are:
      | action        | donor | summary                                                                  |
      | ISSUE_RECEIPT | Jana  | Dárci Jana Nováková vystaveno roční potvrzení 2027-000001 za rok 2026. |
    And the admin actions came through these applications:
      | action        | client |
      | ISSUE_RECEIPT |        |

  Scenario: An administrator issues the receipt of one donation, which the donor then finds among their receipts
    When "Petr" issues in the administration the receipt of the donation of "Jana" received on 2026-11-15
    Then the response status is 200
    And the issued receipt has number "2027-000001"
    And the issued receipt is the single receipt of the donation of "Jana" received on 2026-11-15
    And the issued receipt belongs to "Jana"
    When "Jana" lists her receipts
    Then the receipt list shows:
      | number      | status | kind   |
      | 2027-000001 | ACTIVE | SINGLE |
    When "Petr" asks for the admin actions
    Then the admin actions are:
      | action        | donor | summary                                                                 |
      | ISSUE_RECEIPT | Jana  | Dárci Jana Nováková vystaveno potvrzení 2027-000001 o jednom daru. |

  Scenario: A changed address brings a replacement, audited with the receipt it replaces
    Given "Jana" issues her yearly receipt for 2026
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Petr" issues in the administration the yearly receipt of "Jana" for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000002"
    And the frozen receipt holds:
      | field                | value       |
      | donor.address.street | Nová 7      |
      | replaces.number      | 2027-000001 |
    And 2 receipts are stored
    And 1 receipt is active
    When "Petr" asks for the admin actions
    Then the admin actions are:
      | action        | donor | summary                                                                                       |
      | ISSUE_RECEIPT | Jana  | Dárci Jana Nováková vystaveno roční potvrzení 2027-000002 za rok 2026, nahrazuje 2027-000001. |

  Scenario: The administration answers the issuer's refusals and refuses an unknown or erased donor
    When "Petr" issues in the administration the yearly receipt of "Jana" for 2027
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"
    When "Petr" issues in the administration the yearly receipt of "Jana" for 2025
    Then the response status is 400
    And the problem type ends with "donations/receipt-before-first-year"
    When "Petr" issues in the administration the receipt of the donation of "Petr" numbered "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 404
    And the problem type ends with "donations/donation-not-found"
    When "Petr" issues in the administration a receipt of "Jana" naming the year "2026" and the donation "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Petr" issues in the administration a receipt of "Jana" naming the year "" and the donation ""
    Then the response status is 400
    And the problem type ends with "validation"
    When "Petr" issues in the administration the yearly receipt of an unknown donor for 2026
    Then the response status is 404
    And the problem type ends with "donations/donor-not-found"
    Given "Petr" erased the donor "Jana"
    When "Petr" issues in the administration the yearly receipt of "Jana" for 2026
    Then the response status is 409
    And the problem type ends with "donations/donor-erased"
    And the problem has the title "Dárce je vymazaný"
    And 0 receipts are stored

  Scenario: A donation of another donor is not found for the donor named in the address, and takes no number
    When "Petr" issues in the administration for "Petr" the receipt of the donation of "Jana" received on 2026-10-01
    Then the response status is 404
    And the problem type ends with "donations/donation-not-found"
    And 0 receipts are stored
    And no receipt issue is audited

  Scenario: An erased donor's receipt comes to a browser as issued, and to a connected application without the donor's name, address and verification code
    Given "Jana" issues her yearly receipt for 2026
    And "Petr" erased the donor "Jana"
    When "Petr" reads in the administration the receipt "2027-000001"
    Then the response status is 200
    And the issued receipt says its donor is erased
    And the frozen receipt holds:
      | field                | value         |
      | donor.name           | Jana Nováková |
      | donor.address.street | Dlouhá 12     |
      | donor.variableSymbol | {Jana}        |
    And the frozen receipt is signed with the server's key
    Given "Petr" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read"
    When the connector exchanges the connector token for an API token
    And the exchanged API token reads the receipt "2027-000001"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the issued receipt has number "2027-000001"
    And the issued receipt says its donor is erased
    And the frozen receipt holds:
      | field                    | value          |
      | donor.name               | Vymazaný dárce |
      | donor.companyIdentifier  | null           |
      | donor.address.street     | Vymazáno       |
      | donor.address.city       | Vymazáno       |
      | donor.address.postalCode | 00000          |
      | donor.variableSymbol     | {Jana}         |
      | verification.qrText      | null           |
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-10-01 | 100000      |
      | 2026-11-15 | 250000      |

  Scenario: The administration shares the donor's cap of 20 replacements in 24 hours, which a first issue does not count against
    Given "Jana" changed her address and issued her yearly receipt for 2026 21 times
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Petr" issues in the administration the yearly receipt of "Jana" for 2026
    Then the response status is 409
    And the problem type ends with "donations/receipt-issue-limit"
    And 21 receipts are stored
    When "Petr" issues in the administration the receipt of the donation of "Jana" received on 2026-10-01
    Then the response status is 200
    And the issued receipt has number "2027-000022"
    And 22 receipts are stored

  Scenario: The administration lists the issued receipts newest first, a page at a time, by donor and by the year of issue, and reads one with its image
    Given the person who signs the receipts has a 600 by 200 pixel scan as their receipt signature
    And "Jana" issues the receipt of her donation received on 2026-10-01
    And "Jana" issues her yearly receipt for 2026
    And today is 2028-01-10
    And "Jana" issues the receipt of her donation received on 2026-11-15
    When "Petr" lists the issued receipts in the administration
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the administration's receipt list counts 3 of 3 receipts:
      | number      | status | kind   | donor |
      | 2028-000003 | ACTIVE | SINGLE | Jana  |
      | 2027-000002 | ACTIVE | YEARLY | Jana  |
      | 2027-000001 | ACTIVE | SINGLE | Jana  |
    When "Petr" lists the issued receipts of "Petr" in the administration
    Then the administration's receipt list counts 0 of 0 receipts:
      | number | status | kind | donor |
    When "Petr" lists the issued receipts of "Jana" in the administration issued in 2027, 1 on page 1
    Then the administration's receipt list counts 1 of 2 receipts:
      | number      | status | kind   | donor |
      | 2027-000001 | ACTIVE | SINGLE | Jana  |
    When "Petr" lists the issued receipts in the administration issued in 2028
    Then the administration's receipt list counts 1 of 1 receipts:
      | number      | status | kind   | donor |
      | 2028-000003 | ACTIVE | SINGLE | Jana  |
    When "Petr" lists the issued receipts in the administration issued in 2029
    Then the administration's receipt list counts 0 of 0 receipts:
      | number | status | kind | donor |
    When "Petr" reads in the administration the receipt "2027-000002"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the issued receipt has number "2027-000002"
    And the issued receipt belongs to "Jana"
    And the frozen receipt shows the current signature image
    When "Petr" fetches in the administration the signature image of receipt "2027-000002"
    Then the response status is 200
    And the image is the current signature, kept by the browser
    When "Petr" reads in the administration the receipt with id "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 404
    And the problem type ends with "donations/receipt-not-found"
    When "Petr" fetches in the administration the receipt image "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    Then the response status is 404
    And the problem type ends with "donations/receipt-image-not-found"
    When "Petr" lists the issued receipts in the administration, 101 on page 0
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: A connected application with the writing permission issues a receipt, which the audit trail names it for
    Given "Petr" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token issues the yearly receipt of "Jana" for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000001"
    When the exchanged API token issues the yearly receipt of "Jana" for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000001"
    When "Petr" issues in the administration the receipt of the donation of "Jana" received on 2026-10-01
    Then the response status is 200
    When "Petr" asks for the admin actions
    Then the admin actions came through these applications:
      | action        | client    |
      | ISSUE_RECEIPT |           |
      | ISSUE_RECEIPT | claude.ai |

  Scenario: A connected application that may only read lists and reads the issued receipts but cannot issue one
    Given "Jana" issues her yearly receipt for 2026
    And "Petr" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read"
    When the connector exchanges the connector token for an API token
    And the exchanged API token issues the yearly receipt of "Jana" for 2025
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When the exchanged API token issues the receipt of the donation of "Jana" received on 2026-10-01
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    And 1 receipt is stored
    When the exchanged API token lists the issued receipts of "Jana"
    Then the response status is 200
    And the administration's receipt list counts 1 of 1 receipts:
      | number      | status | kind   | donor |
      | 2027-000001 | ACTIVE | YEARLY | Jana  |
    When the exchanged API token reads the receipt "2027-000001"
    Then the response status is 200
    And the issued receipt has number "2027-000001"

  Scenario: A donor without the administrator role reaches none of the administration's receipts
    Given "Jana" issues her yearly receipt for 2026
    When "Jana" issues in the administration the yearly receipt of "Jana" for 2026
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Jana" lists the issued receipts in the administration
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Jana" reads in the administration the receipt "2027-000001"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Jana" fetches in the administration the receipt image "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    And 1 receipt is stored

  Scenario: Without a token none of the administration's receipts answers
    When someone without a token issues in the administration the yearly receipt of "Jana" for 2026
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token lists the issued receipts in the administration
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token reads in the administration the receipt with id "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token fetches in the administration the receipt image "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
