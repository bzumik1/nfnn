@donations
Feature: An administrator chooses who signs the donation receipts and uploads their signature

  The receipts are signed by one of the people of the foundation, chosen at /sprava/lide-fondu
  with the role printed under the name on receipts, which is its own field (Jakub 2026-10-31).
  Each person keeps their own receipt signature, uploaded and removed only from a browser; it is
  never public, and a donor sees it only through the images of their own receipt. A receipt
  freezes the name, the role, the signature and a square print portrait of the person.

  Background:
    Given today is 2026-12-20
    And a person "Jana" is registered
    And "Jana" is an administrator
    And "Eva Vzorová" signs the receipts as "předsedkyně správní rady"

  Scenario: Without an upload the receipts carry only the line and the signatory's name
    When "Jana" asks for the receipt signature
    Then the response status is 200
    And the receipt signature is not set

  Scenario: An uploaded scan is shown to administrators, audited and printed on receipts issued afterwards
    Given the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" downloads the receipt of her donation received on 2026-10-01
    And the receipt "Jana" downloaded is the frozen receipt issued to her last
    And the frozen receipt shows no signature image
    When "Jana" uploads a 3000 by 1000 pixel JPEG scan named "podpis.jpg" as the receipt signature
    Then the response status is 200
    And the receipt signature is set, 1200 by 400 pixels, uploaded at "2026-12-20T11:00:00Z"
    And the admin action "CHANGE_RECEIPT_SIGNATURE" by "Jana" is recorded with details containing "Nahrán obrázek podpisu na potvrzení o daru u osoby"
    When "Jana" asks for the receipt signature
    Then the receipt signature is set, 1200 by 400 pixels, uploaded at "2026-12-20T11:00:00Z"
    When "Jana" downloads the receipt of her donation received on 2026-10-01
    Then 1 receipt is stored
    And the receipt "Jana" downloaded is the frozen receipt issued to her last
    And the frozen receipt shows no signature image
    Given today is 2027-01-15
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the receipt "Jana" downloaded is the frozen receipt issued to her last
    And the frozen receipt shows the current signature image
    And the frozen receipt holds:
      | field          | value            |
      | signatory.name | Eva Vzorová              |
      | signatory.role | předsedkyně správní rady |

  Scenario: A removed signature leaves the next receipts with the line and the name
    Given "Jana" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    When "Jana" removes the receipt signature
    Then the response status is 204
    And the admin action "REMOVE_RECEIPT_SIGNATURE" by "Jana" is recorded with details containing "odebrán"
    When "Jana" asks for the receipt signature
    Then the receipt signature is not set
    When "Jana" removes the receipt signature
    Then the response status is 204
    And the admin action "REMOVE_RECEIPT_SIGNATURE" by "Jana" is recorded with details containing "odebrán"

  Scenario: A file that is not a JPEG, PNG or WebP image is refused and the signature stays
    Given "Jana" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    When "Jana" uploads a text file as the receipt signature
    Then the response status is 400
    And the problem type ends with "donations/unsupported-signature-image"
    When "Jana" asks for the receipt signature
    Then the receipt signature is set, 600 by 200 pixels, uploaded at "2026-12-20T11:00:00Z"

  Scenario: An uploaded vector signature is kept as filled paths, shown to administrators as paths and audited
    When "Jana" uploads the vector signature "podpis.svg" as the receipt signature
    Then the response status is 200
    And the receipt signature is a vector of 3 paths in the view box "0 0 300 100", 1200 by 400 pixels, uploaded at "2026-12-20T11:00:00Z"
    And the admin action "CHANGE_RECEIPT_SIGNATURE" by "Jana" is recorded with details containing "Nahrán vektorový podpis (SVG) na potvrzení o daru u osoby"
    When "Jana" asks for the receipt signature
    Then the receipt signature is a vector of 3 paths in the view box "0 0 300 100", 1200 by 400 pixels, uploaded at "2026-12-20T11:00:00Z"
    When "Jana" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    Then the receipt signature is set, 600 by 200 pixels, uploaded at "2026-12-20T11:00:00Z"

  Scenario Outline: An SVG with anything but filled paths is refused naming the problem, and the signature stays
    Given "Jana" uploads the vector signature "podpis.svg" as the receipt signature
    When "Jana" uploads an SVG signature with <construct>
    Then the response status is 400
    And the problem type ends with "donations/unsupported-signature-vector"
    And the problem's error for field "file" says "<message>"
    And the problem's detail starts with "<message>"
    When "Jana" asks for the receipt signature
    Then the receipt signature is a vector of 3 paths in the view box "0 0 300 100", 1200 by 400 pixels, uploaded at "2026-12-20T11:00:00Z"

    Examples:
      | construct                                      | message                                                                  |
      | a script                                       | Soubor obsahuje nepovolený prvek „script“.                               |
      | an external entity                             | Soubor obsahuje deklaraci DOCTYPE nebo entity, ty SVG podpisu mít nesmí. |
      | a link                                         | Soubor obsahuje nepovolený atribut „href“.                               |
      | a style                                        | Soubor obsahuje nepovolený atribut „style“.                              |
      | a filter                                       | Soubor obsahuje nepovolený prvek „filter“.                               |
      | an element of another namespace                | Prvek „svg“ nepatří do SVG, patří do jiného jmenného prostoru (xmlns).   |
      | more than 200 kB                               | Soubor je větší než 200 kB.                                              |
      | path data that grows past 256 kB once absolute | Podpis má příliš mnoho tvarů, bodů nebo vnořených skupin.                |
      | malformed path data                            | Tvar má neplatný zápis cesty (atribut d).                                |

  Scenario: A donor without the administrator role and a visitor without a token cannot upload a vector signature
    Given a person "Petr" is registered
    When "Petr" uploads the vector signature "podpis.svg" as the receipt signature
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token uploads the vector signature "podpis.svg" as the receipt signature
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    When "Petr" asks for the receipt signature
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    Then the response status is 403
    When "Petr" removes the receipt signature
    Then the response status is 403
    When someone without a token asks for the receipt signature
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: An administrator chooses a person of the foundation to sign the receipts with the role printed under the name, and the choice is audited
    Given "Jana" uploads a 640 by 480 pixel PNG image named "adam.png"
    And "Jana" adds a person:
      | name     | Adam Vzor  |
      | role     | Zakladatel |
      | portrait | adam.png   |
    And "Jana" uploads a 600 by 200 pixel JPEG scan as the receipt signature of "Adam Vzor"
    When "Jana" chooses "Adam Vzor" to sign the receipts as "místopředseda správní rady"
    Then the response status is 200
    And the receipt signatory is "Adam Vzor" as "místopředseda správní rady", with a portrait set and a signature set
    And the admin action "CHOOSE_RECEIPT_SIGNATORY" by "Jana" is recorded with details containing "funkce na potvrzení: místopředseda správní rady"
    When "Jana" asks for the receipt signatory
    Then the response status is 200
    And the receipt signatory is "Adam Vzor" as "místopředseda správní rady", with a portrait set and a signature set
    And the receipt signatures list a RASTER signature of "Adam Vzor", 600 by 200 pixels
    When "Jana" asks for the receipt signature of "Eva Vzorová"
    Then the response status is 200
    And the receipt signature is not set

  Scenario: A person the foundation does not have, a missing role or a malformed person id is refused and the choice stays
    When "Jana" chooses a person who does not exist to sign the receipts
    Then the response status is 404
    And the problem type ends with "donations/person-not-found"
    When "Jana" chooses "Eva Vzorová" to sign the receipts as " "
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" chooses the person "Eva" to sign the receipts as "předsedkyně"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" uploads a 600 by 200 pixel JPEG scan as the receipt signature of a person who does not exist
    Then the response status is 404
    And the problem type ends with "donations/person-not-found"
    When "Jana" asks for the receipt signatory
    Then the receipt signatory is "Eva Vzorová" as "předsedkyně správní rady", with a portrait missing and a signature missing
    And the receipt signatures list none

  Scenario: Without a chosen signatory no receipt is issued, and the administration and the donor are told why
    Given no person of the foundation signs the receipts
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" asks for the receipt signatory
    Then the response status is 200
    And no receipt signatory is chosen
    When "Jana" downloads the receipt of her donation received on 2026-10-01
    Then the response status is 409
    And the problem type ends with "donations/receipt-signatory-missing"
    And 0 receipts are stored

  Scenario: Removing a person of the foundation deletes their receipt signature in the same step
    Given "Jana" adds a person:
      | name | Adam Vzor |
    And "Jana" uploads a 600 by 200 pixel JPEG scan as the receipt signature of "Adam Vzor"
    When "Jana" removes the person "Adam Vzor"
    Then the response status is 204
    And no receipt signature is kept for a person the foundation no longer has
    When "Jana" asks for the receipt signatory
    Then the receipt signatures list none

  Scenario: A donor without the administrator role and a visitor without a token cannot read or choose the signatory
    Given a person "Petr" is registered
    When "Petr" asks for the receipt signatory
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" chooses "Eva Vzorová" to sign the receipts as "předseda"
    Then the response status is 403
    When someone without a token asks for the receipt signatory
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token chooses "Eva Vzorová" to sign the receipts as "předseda"
    Then the response status is 401
