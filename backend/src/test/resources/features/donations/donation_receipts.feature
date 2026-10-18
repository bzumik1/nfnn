Feature: A donor downloads PDF receipts of their donations

  Scenario: The yearly receipt of a completed year lists the year's donations with their total
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2003 | 2026-12-10 | 1250.50 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the response is a PDF that must not be cached
    And the file name is "potvrzeni-o-darech-2026.pdf"
    And the PDF says "Potvrzení o přijatých darech za rok 2026"
    And the PDF says "Název: Nová naděje - nadační fond"
    And the PDF says "IČO: 27278794"
    And the PDF says "Jméno a příjmení: Jana Nováková"
    And the PDF says "Bydliště: Dlouhá 12, 400 01 Ústí nad Labem"
    And the PDF says "Variabilní symbol: {Jana}"
    And the PDF says "1. 10. 2026 1 000 Kč"
    And the PDF says "15. 11. 2026 2 500 Kč"
    And the PDF says "10. 12. 2026 1 250,50 Kč"
    And the PDF says "Počet darů: 3"
    And the PDF says "Celkem darováno v roce 2026: 4 750,50 Kč"
    And the PDF says "Číslo potvrzení: 2027-000001"
    And the PDF says "Datum vystavení: 15. 1. 2027"
    And the PDF says "Pavel Znamenáček"
    And the PDF says "předseda správní rady"
    And the PDF does not say "Confirmation"
    And 1 receipt is stored

  Scenario: The yearly receipt is not available before the year ends, nor for a year that is not a four-digit number
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"
    When "Jana" downloads her yearly receipt for 2027
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"
    When "Jana" downloads her yearly receipt for year "abc"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "year"
    When "Jana" downloads her yearly receipt for year "999"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "year"
    When "Jana" downloads her yearly receipt for year ""
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "year"
    And 0 receipts are stored

  Scenario: The receipt of one donation carries its own number, which the donation list then shows
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    When "Jana" downloads the receipt of her donation received on 2026-11-15
    Then the response status is 200
    And the response is a PDF that must not be cached
    And the file name is "potvrzeni-o-daru-2027-000001.pdf"
    And the PDF says "Potvrzení o přijetí daru"
    And the PDF says "Číslo potvrzení: 2027-000001"
    And the PDF says "Forma daru: peněžitý dar, bankovní převod"
    And the PDF says "Datum připsání na účet: 15. 11. 2026"
    And the PDF says "Částka: 2 500 Kč"
    And the PDF says "Účet příjemce: 5544332217/2010"
    And the PDF does not say "1 000 Kč"
    When "Jana" asks for her donations
    Then the response status is 200
    And the donation received on 2026-11-15 is listed with receipt number "2027-000001"
    And the donation received on 2026-10-01 is listed without a receipt number and with status "RECEIVED"
    When "Jana" downloads the receipt of her donation received on 2026-10-01
    Then the response status is 200
    And the file name is "potvrzeni-o-daru-2027-000002.pdf"
    And the PDF says "Číslo potvrzení: 2027-000002"
    And the PDF says "Částka: 1 000 Kč"
    And 2 receipts are stored

  Scenario: Only the donor's own existing donation has a receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-10-02 | 800.00  | 2900244444 | 2010     | Svoboda Petr  | {Petr}         |
    And the application starts the import
    When "Petr" downloads the receipt of the donation of "Jana" received on 2026-10-01
    Then the response status is 404
    And the problem type ends with "donations/donation-not-found"
    When "Jana" downloads the receipt of donation "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 404
    And the problem type ends with "donations/donation-not-found"
    When "Jana" downloads the receipt of donation "abc"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "id"
    And 0 receipts are stored

  Scenario: Without a token neither receipt answers
    When someone without a token downloads the yearly receipt for 2026
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token downloads the receipt of donation "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
