@donations
Feature: An administrator uploads the signature printed on donation receipts

  Background:
    Given today is 2026-12-20
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Without an upload the receipts carry only the line and the signatory's name
    When "Jana" asks for the receipt signature
    Then the response status is 200
    And the receipt signature is not set

  Scenario: An uploaded scan is shown to administrators, audited and printed on receipts issued afterwards
    Given the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" issues the receipt of her donation received on 2026-10-01
    And the issued receipt is the single receipt of the donation of "Jana" received on 2026-10-01
    And the frozen receipt shows no signature image
    When "Jana" uploads a 3000 by 1000 pixel JPEG scan named "podpis.jpg" as the receipt signature
    Then the response status is 200
    And the receipt signature is set, 1200 by 400 pixels, uploaded at "2026-12-20T11:00:00Z"
    And the admin action "CHANGE_RECEIPT_SIGNATURE" by "Jana" is recorded with details containing "Nahrán obrázek podpisu na potvrzení o daru: 1200 × 400 px"
    When "Jana" asks for the receipt signature
    Then the receipt signature is set, 1200 by 400 pixels, uploaded at "2026-12-20T11:00:00Z"
    When "Jana" issues the receipt of her donation received on 2026-10-01
    Then 1 receipt is stored
    And the issued receipt is the single receipt of the donation of "Jana" received on 2026-10-01
    And the frozen receipt shows no signature image
    Given today is 2027-01-15
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt is the yearly receipt for 2026
    And the frozen receipt shows the current signature image
    And the frozen receipt holds:
      | field          | value            |
      | signatory.name | Pavel Znamenáček |

  Scenario: A removed signature leaves the next receipts with the line and the name
    Given "Jana" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    When "Jana" removes the receipt signature
    Then the response status is 204
    And the admin action "REMOVE_RECEIPT_SIGNATURE" by "Jana" is recorded with details containing "Obrázek podpisu odebrán"
    When "Jana" asks for the receipt signature
    Then the receipt signature is not set
    When "Jana" removes the receipt signature
    Then the response status is 204
    And the admin action "REMOVE_RECEIPT_SIGNATURE" by "Jana" is recorded with details containing "Obrázek podpisu odebrán"

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
    And the admin action "CHANGE_RECEIPT_SIGNATURE" by "Jana" is recorded with details containing "Nahrán vektorový podpis (SVG) na potvrzení o daru, SHA-256"
    When "Jana" asks for the receipt signature
    Then the receipt signature is a vector of 3 paths in the view box "0 0 300 100", 1200 by 400 pixels, uploaded at "2026-12-20T11:00:00Z"
    When "Jana" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    Then the receipt signature is set, 600 by 200 pixels, uploaded at "2026-12-20T11:00:00Z"

  Scenario: A receipt issued with a vector signature keeps its digest, and only its donor gets the canonical JSON it names
    Given a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" uploads the vector signature "podpis.svg" as the receipt signature
    When "Jana" issues the receipt of her donation received on 2026-10-01
    Then the response status is 200
    And the frozen receipt shows the current signature image
    When "Jana" fetches the signature image of receipt "2026-000001"
    Then the response status is 200
    And the image is the current vector signature as its canonical JSON, kept by the browser and never sniffed
    When "Petr" fetches the signature image of receipt "2026-000001"
    Then the response status is 404
    And the problem type ends with "donations/receipt-image-not-found"
    When "Jana" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    And "Jana" reads the issued receipt again
    Then the response status is 200
    And the frozen receipt shows the vector signature it was issued with, not the current scan
    When "Jana" fetches the signature image of receipt "2026-000001"
    Then the response status is 200
    And the image is the vector signature the receipt was issued with

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
      | a script                                       | Soubor obsahuje nepovolený prvek.                                        |
      | an external entity                             | Soubor obsahuje deklaraci DOCTYPE nebo entity, ty SVG podpisu mít nesmí. |
      | a link                                         | Soubor obsahuje nepovolený atribut.                                      |
      | a style                                        | Soubor obsahuje nepovolený atribut.                                      |
      | a filter                                       | Soubor obsahuje nepovolený prvek.                                        |
      | an element of another namespace                | Soubor obsahuje prvek z jiného jmenného prostoru (xmlns) než SVG.        |
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
