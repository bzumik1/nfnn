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
    And receipt "2027-000001" is kept as its template and data, without the PDF

  Scenario: Downloading the yearly receipt again serves the same document
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" downloads her yearly receipt for 2026
    When 30 days pass
    And "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the bytes equal the previous download
    And the PDF says "Číslo potvrzení: 2027-000001"
    And the PDF says "Datum vystavení: 15. 1. 2027"
    And 1 receipt is stored

  Scenario: A receipt stored as a PDF file before receipts were kept as template and data is served from that file
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" downloads her yearly receipt for 2026
    And receipt "2027-000001" was stored as a PDF file before receipts were kept as template and data
    When 30 days pass
    And "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the download is the stored PDF file of receipt "2027-000001"
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the PDF says "Číslo potvrzení: 2027-000002"
    And the PDF says "Toto potvrzení nahrazuje potvrzení č. 2027-000001 ze dne 15. 1. 2027"
    And receipt "2027-000002" is kept as its template and data, without the PDF
    And 2 receipts are stored

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

  Scenario: A completed year without donations has no yearly receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    When "Jana" downloads her yearly receipt for 2025
    Then the response status is 404
    And the problem type ends with "donations/yearly-receipt-not-available"
    And 0 receipts are stored

  Scenario: The yearly receipt lists only that year's donations, oldest first
    Given today is 2025-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 2001 | 2025-12-10 | 700.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2026-12-20
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2002 | 2026-12-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2003 | 2026-10-05 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the hourly import runs
    And today is 2027-01-15
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 2004 | 2027-01-08 | 900.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the hourly import runs
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the PDF lists "5. 10. 2026 1 000 Kč" before "15. 12. 2026 2 500 Kč"
    And the PDF says "Počet darů: 2"
    And the PDF says "Celkem darováno v roce 2026: 3 500 Kč"
    And the PDF does not say "10. 12. 2025"
    And the PDF does not say "700 Kč"
    And the PDF does not say "8. 1. 2027"
    And the PDF does not say "900 Kč"

  Scenario: A payment of the year imported after the yearly receipt was issued brings a replacement with a new number
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2003 | 2026-12-10 | 1250.50 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" downloads her yearly receipt for 2026
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 2004 | 2026-12-30 | 300.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the hourly import runs
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the PDF says "Číslo potvrzení: 2027-000002"
    And the PDF says "Toto potvrzení nahrazuje potvrzení č. 2027-000001 ze dne 15. 1. 2027, které tímto pozbývá platnosti."
    And the PDF says "30. 12. 2026 300 Kč"
    And the PDF says "Počet darů: 4"
    And the PDF says "Celkem darováno v roce 2026: 5 050,50 Kč"
    And 2 receipts are stored
    And 1 receipt is active
    And receipt "2027-000001" is superseded
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the bytes equal the previous download
    And the PDF says "Číslo potvrzení: 2027-000002"
    And 2 receipts are stored

  Scenario: A changed address brings replacements of the yearly and the single receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" downloads her yearly receipt for 2026
    And "Jana" downloads the receipt of her donation received on 2026-10-01
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the PDF says "Číslo potvrzení: 2027-000003"
    And the PDF says "Toto potvrzení nahrazuje potvrzení č. 2027-000001 ze dne 15. 1. 2027"
    And the PDF says "Bydliště: Nová 7, 405 02 Děčín"
    And the PDF does not say "Dlouhá 12"
    When "Jana" downloads the receipt of her donation received on 2026-10-01
    Then the response status is 200
    And the file name is "potvrzeni-o-daru-2027-000004.pdf"
    And the PDF says "Číslo potvrzení: 2027-000004"
    And the PDF says "Toto potvrzení nahrazuje potvrzení č. 2027-000002 ze dne 15. 1. 2027"
    And the PDF says "Bydliště: Nová 7, 405 02 Děčín"
    And 4 receipts are stored
    And 2 receipts are active
    And receipt "2027-000001" is superseded
    And receipt "2027-000002" is superseded

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

  Scenario: A refunded donation has no receipt and drops out of the yearly receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2003 | 2026-12-10 | 1250.50 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2004 | 2026-11-20 | 800.00  | 2900244444 | 2010     | Svoboda Petr  | {Petr}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" downloads the receipt of her donation received on 2026-11-15
    And the donation of "Jana" received on 2026-11-15 was refunded
    And the donation of "Petr" received on 2026-11-20 was refunded
    When "Jana" downloads the receipt of her donation received on 2026-11-15
    Then the response status is 404
    And the problem type ends with "donations/receipt-not-available"
    When "Jana" asks for her donations
    Then the response status is 200
    And the donation received on 2026-11-15 is listed without a receipt number and with status "REFUNDED"
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the PDF says "Počet darů: 2"
    And the PDF says "Celkem darováno v roce 2026: 2 250,50 Kč"
    And the PDF does not say "15. 11. 2026"
    And the PDF does not say "2 500 Kč"
    When "Petr" downloads his yearly receipt for 2026
    Then the response status is 404
    And the problem type ends with "donations/yearly-receipt-not-available"

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

  Scenario: A company's receipt names its seat and identification number, a person's the name and residence
    Given today is 2026-12-20
    And a company "Stavby" is registered with identification number "45274649"
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 5000.00 | 2900255555 | 2010     | Stavby Novák  | {Stavby}       |
      | 2002 | 2026-10-02 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    When "Stavby" downloads its yearly receipt for 2026
    Then the response status is 200
    And the PDF says "Název: Stavby Novák s.r.o."
    And the PDF says "IČO: 45274649"
    And the PDF says "Sídlo: Průmyslová 5, 415 01 Teplice"
    And the PDF says "Variabilní symbol: {Stavby}"
    And the PDF does not say "Jméno a příjmení"
    And the PDF does not say "Bydliště"
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the PDF says "Jméno a příjmení: Jana Nováková"
    And the PDF says "Bydliště: Dlouhá 12, 400 01 Ústí nad Labem"
    And the PDF does not say "Sídlo: Dlouhá 12"

  Scenario: A donor who prefers English gets bilingual receipts with English file names
    Given today is 2026-12-20
    And a person "Jana" is registered
    And "Jana" switches the preferred locale to "en"
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the file name is "donation-summary-2026.pdf"
    And the PDF says "Potvrzení o přijatých darech za rok 2026"
    And the PDF says "Confirmation of donations received in 2026"
    When "Jana" downloads the receipt of her donation received on 2026-10-01
    Then the response status is 200
    And the file name is "donation-receipt-2027-000002.pdf"
    And the PDF says "Potvrzení o přijetí daru"
    And the PDF says "Confirmation of a donation received"

  Scenario: A receipt keeps its language when the donor switches to English afterwards
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" downloads her yearly receipt for 2026
    When "Jana" switches the preferred locale to "en"
    And "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the bytes equal the previous download
    And the file name is "potvrzeni-o-darech-2026.pdf"
    And the PDF does not say "Confirmation"
    And 1 receipt is stored

  Scenario: Half an hour before midnight UTC on New Year's Eve the Prague year has already ended
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And the time is "2026-12-31T23:30:00Z"
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 200
    And the PDF says "Číslo potvrzení: 2027-000001"
    And the PDF says "Datum vystavení: 1. 1. 2027"
    When "Jana" downloads her yearly receipt for 2027
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"

  Scenario: Without a token neither receipt answers
    When someone without a token downloads the yearly receipt for 2026
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token downloads the receipt of donation "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: The summary says up to which year the yearly receipts can be downloaded
    Given today is 2026-12-20
    And a person "Jana" is registered
    When "Jana" asks for her donation summary
    Then the response status is 200
    And the summary makes yearly receipts available through 2025
    Given today is 2027-01-15
    When "Jana" asks for her donation summary
    Then the response status is 200
    And the summary makes yearly receipts available through 2026
