@donations
Feature: An administrator chooses who signs the donation receipts, and the receipts print that person's signature

  The receipts are signed by one of the people of the foundation, chosen at /sprava/lide-fondu
  with the role printed under the name on receipts, which is its own field (Jakub 2026-10-31).
  A person has one signature, the one the About section shows under the founders' note, and the
  receipts they sign print it too (Jakub 2026-11-12). A receipt freezes the name, the role, the
  signature prepared for print and a square print portrait of the person; a receipt already
  issued keeps them when the signature changes later.

  Background:
    Given today is 2026-12-20
    And a person "Jana" is registered
    And "Jana" is an administrator
    And "Josef Vzorový" signs the receipts as "předseda správní rady"

  Scenario: The signature of the person who signs is printed on receipts issued afterwards, and receipts issued before keep theirs
    Given the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" issues the receipt of her donation received on 2026-10-01
    And the issued receipt is the single receipt of the donation of "Jana" received on 2026-10-01
    And the frozen receipt shows no signature image
    And the frozen receipt shows no portrait
    When "Jana" sets a 3000 by 1000 pixel scan as the signature of the person who signs the receipts
    And "Jana" asks for the receipt signatory
    Then the receipt signatory is "Josef Vzorový" as "předseda správní rady", with a portrait missing and a signature set
    When "Jana" issues the receipt of her donation received on 2026-10-01
    Then 1 receipt is stored
    And the issued receipt is the single receipt of the donation of "Jana" received on 2026-10-01
    And the frozen receipt shows no signature image
    Given today is 2027-01-15
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt is the yearly receipt for 2026
    And the frozen receipt shows the current signature image
    And the frozen receipt's signature image is a PNG of 1200 by 400 pixels whose white is transparent
    And the frozen receipt holds:
      | field          | value                 |
      | signatory.name | Josef Vzorový         |
      | signatory.role | předseda správní rady |

  Scenario: An administrator chooses a person of the foundation to sign the receipts with the role printed under the name, and the choice is audited
    Given "Jana" uploads a 640 by 480 pixel PNG image named "adam.png"
    And "Jana" adds a person:
      | name     | Adam Vzor  |
      | role     | Zakladatel |
      | portrait | adam.png   |
    And "Jana" uploads a 600 by 200 pixel PNG image named "podpis-adam.png"
    And "Jana" sets the signature of "Adam Vzor" to the image uploaded as "podpis-adam.png"
    When "Jana" chooses "Adam Vzor" to sign the receipts as "místopředseda správní rady"
    Then the response status is 200
    And the receipt signatory is "Adam Vzor" as "místopředseda správní rady", with a portrait set and a signature set
    And the admin action "CHOOSE_RECEIPT_SIGNATORY" by "Jana" is recorded with details containing "Potvrzení o daru podepisuje osoba"
    When "Jana" asks for the receipt signatory
    Then the response status is 200
    And the receipt signatory is "Adam Vzor" as "místopředseda správní rady", with a portrait set and a signature set

  Scenario: A person the foundation does not have, a missing role or a malformed person id is refused and the choice stays
    When "Jana" chooses a person who does not exist to sign the receipts
    Then the response status is 404
    And the problem type ends with "donations/person-not-found"
    When "Jana" chooses "Josef Vzorový" to sign the receipts as " "
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" chooses the person "Eva" to sign the receipts as "předseda"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" chooses "Josef Vzorový" to sign the receipts as a role with a line break
    Then the response status is 400
    And the problem lists an error for field "receiptRole"
    When "Jana" asks for the receipt signatory
    Then the receipt signatory is "Josef Vzorový" as "předseda správní rady", with a portrait missing and a signature missing

  Scenario: A person whose stored name holds a line break signs no receipt until the name is corrected
    Given the stored name of "Josef Vzorový" holds a line break
    When "Jana" chooses the person whose stored name holds a line break to sign the receipts as "předseda správní rady"
    Then the response status is 409
    And the problem type ends with "donations/signatory-needs-renaming"
    And the problem's detail starts with "Jméno nebo role této osoby obsahuje zalomení řádku"
    When the stored name of that person is corrected to "Josef Vzorový"
    And "Jana" chooses "Josef Vzorový" to sign the receipts as "předseda správní rady"
    Then the response status is 200

  Scenario: A name or a receipt role no receipt can print is refused when the signatory is chosen or renamed, so a chosen signatory can always be issued
    When "Jana" chooses "Josef Vzorový" to sign the receipts as "předseda 😀"
    Then the response status is 400
    And the problem lists an error for field "receiptRole"
    Given "Jana" adds a person:
      | name | Eva Vzor 😀 |
    When "Jana" chooses "Eva Vzor 😀" to sign the receipts as "předseda správní rady"
    Then the response status is 409
    And the problem type ends with "donations/signatory-unprintable"
    And the problem's detail starts with "Jméno této osoby obsahuje znak, který na potvrzení o daru nevytiskneme"
    Given "Jana" adds a person:
      | name | Adam Vzor |
    And "Jana" chooses "Adam Vzor" to sign the receipts as "místopředseda správní rady"
    When "Jana" updates the person "Adam Vzor":
      | name | Adam Vzor 王 |
    Then the response status is 409
    And the problem type ends with "content/signatory-name-unprintable"
    When "Jana" updates the person "Eva Vzor 😀":
      | name | Eva Vzor 王 |
    Then the response status is 200
    When "Jana" asks for the receipt signatory
    Then the receipt signatory is "Adam Vzor" as "místopředseda správní rady", with a portrait missing and a signature missing

  Scenario: Without a chosen signatory no receipt is issued, and the administration and the donor are told why
    Given no person of the foundation signs the receipts
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for the receipt signatory
    Then the response status is 200
    And no receipt signatory is chosen
    When "Jana" issues the receipt of her donation received on 2026-10-01
    Then the response status is 409
    And the problem type ends with "donations/receipt-signatory-missing"
    And the problem's detail starts with "Fond zatím nevybral, kdo potvrzení o daru podepisuje"
    And 0 receipts are stored

  Scenario: A donor without the administrator role and a visitor without a token cannot read or choose the signatory
    Given a person "Petr" is registered
    When "Petr" asks for the receipt signatory
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" chooses "Josef Vzorový" to sign the receipts as "předseda"
    Then the response status is 403
    When someone without a token asks for the receipt signatory
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token chooses "Josef Vzorový" to sign the receipts as "předseda"
    Then the response status is 401
