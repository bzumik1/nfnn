@donations
Feature: A donor issues receipts of their donations as frozen, signed data

  Scenario: The yearly receipt of a completed year freezes the year's donations with their total, the texts and a signed proof
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2003 | 2026-12-10 | 1250.50 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the issued receipt has number "2027-000001"
    And the issued receipt is active
    And the issued receipt is the yearly receipt for 2026
    And the frozen receipt holds:
      | field                        | value                      |
      | schemaVersion                | 1                          |
      | issuedOn                     | 2027-01-15                 |
      | locale                       | cs                         |
      | replaces                     | null                       |
      | foundation.name              | Nová naděje - nadační fond |
      | foundation.companyIdentifier | 27278794                   |
      | foundation.bankAccountNumber | 5544332217/2010            |
      | donor.type                   | PERSON                     |
      | donor.name                   | Jana Nováková              |
      | donor.companyIdentifier      | null                       |
      | donor.address.street         | Dlouhá 12                  |
      | donor.address.postalCode     | 400 01                     |
      | donor.address.city           | Ústí nad Labem             |
      | donor.variableSymbol         | {Jana}                     |
      | signatory.name               | Pavel Znamenáček           |
      | signatory.role               | předseda správní rady      |
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-10-01 | 100000      |
      | 2026-11-15 | 250000      |
      | 2026-12-10 | 125050      |
    And the frozen receipt carries the Czech texts only
    And the frozen receipt shows no signature image
    And the frozen receipt is signed with the server's key
    And the frozen receipt's proof reads back as the receipt served, under the status digest stored for it
    And 1 receipt is stored
    And receipt "2027-000001" is kept as its frozen data

  Scenario: Issuing the yearly receipt again returns the same receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issues her yearly receipt for 2026
    When 30 days pass
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt is the one issued before
    And the issued receipt has number "2027-000001"
    And the frozen receipt holds:
      | field    | value      |
      | issuedOn | 2027-01-15 |
    And 1 receipt is stored

  Scenario: Issuing the receipt of one donation again returns the same receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issues the receipt of her donation received on 2026-10-01
    When 30 days pass
    And "Jana" issues the receipt of her donation received on 2026-10-01
    Then the response status is 200
    And the issued receipt is the one issued before
    And the issued receipt has number "2027-000001"
    And the frozen receipt holds:
      | field    | value      |
      | issuedOn | 2027-01-15 |
    And 1 receipt is stored

  Scenario: The yearly receipt is not issued before the year ends, nor for a year that is not a four-digit number, nor without saying what to issue
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"
    When "Jana" issues her yearly receipt for 2027
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"
    When "Jana" asks to issue a receipt naming the year "999" and the donation ""
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "year"
    When "Jana" asks to issue a receipt naming the year "10000" and the donation ""
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "year"
    When "Jana" asks to issue a receipt naming the year "" and the donation ""
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "subject"
    When "Jana" asks to issue a receipt naming the year "2025" and the donation "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "subject"
    And 0 receipts are stored

  Scenario: A completed year without donations has no yearly receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2028-01-15
    When "Jana" issues her yearly receipt for 2027
    Then the response status is 404
    And the problem type ends with "donations/yearly-receipt-not-available"
    And 0 receipts are stored

  Scenario: Donations received before the first receipt year have no receipt
    Given today is 2025-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 2001 | 2025-12-10 | 700.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2026-12-20
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2002 | 2026-10-05 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the hourly import runs
    When "Jana" issues the receipt of her donation received on 2025-12-10
    Then the response status is 400
    And the problem type ends with "donations/receipt-before-first-year"
    And the problem has the title "Za dary z této doby potvrzení na webu nevystavujeme"
    Given today is 2027-01-15
    When "Jana" issues her yearly receipt for 2025
    Then the response status is 400
    And the problem type ends with "donations/receipt-before-first-year"
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-10-05 | 100000      |
    And 1 receipt is stored

  Scenario: The yearly receipt freezes only that year's donations, oldest first
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
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-10-05 | 100000      |
      | 2026-12-15 | 250000      |

  Scenario: A payment of the year imported after the yearly receipt was issued brings a replacement with a new number and a new proof
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2003 | 2026-12-10 | 1250.50 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issues her yearly receipt for 2026
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 2004 | 2026-12-30 | 300.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the hourly import runs
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000002"
    And the issued receipt is active
    And the frozen receipt holds:
      | field             | value       |
      | replaces.number   | 2027-000001 |
      | replaces.issuedOn | 2027-01-15  |
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-10-01 | 100000      |
      | 2026-11-15 | 250000      |
      | 2026-12-10 | 125050      |
      | 2026-12-30 | 30000       |
    And its proof differs from the receipt it replaces
    And the frozen receipt's proof reads back as the receipt served, under the status digest stored for it
    And 2 receipts are stored
    And 1 receipt is active
    And receipt "2027-000001" is superseded
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt is the one issued before
    And 2 receipts are stored
    When "Jana" lists her receipts
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the receipt list shows:
      | number      | status   | kind   |
      | 2027-000002 | ACTIVE   | YEARLY |
      | 2027-000001 | REPLACED | YEARLY |
    When "Jana" reads receipt "2027-000001"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the issued receipt is replaced
    And the frozen receipt holds:
      | field    | value |
      | replaces | null  |

  Scenario: A changed address brings replacements of the yearly and the single receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-11-15 | 2500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issues her yearly receipt for 2026
    And "Jana" issues the receipt of her donation received on 2026-10-01
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000003"
    And the frozen receipt holds:
      | field                    | value       |
      | replaces.number          | 2027-000001 |
      | donor.address.street     | Nová 7      |
      | donor.address.postalCode | 405 02      |
      | donor.address.city       | Děčín       |
    When "Jana" issues the receipt of her donation received on 2026-10-01
    Then the response status is 200
    And the issued receipt has number "2027-000004"
    And the frozen receipt holds:
      | field                | value       |
      | replaces.number      | 2027-000002 |
      | donor.address.street | Nová 7      |
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
    When "Jana" issues the receipt of her donation received on 2026-11-15
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the issued receipt has number "2027-000001"
    And the issued receipt is the single receipt of the donation of "Jana" received on 2026-11-15
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor | source        |
      | 2026-11-15 | 250000      | BANK_TRANSFER |
    When "Jana" asks for her donations
    Then the response status is 200
    And the donation received on 2026-11-15 is listed with receipt number "2027-000001"
    And the donation received on 2026-10-01 is listed without a receipt number and with status "RECEIVED"
    When "Jana" issues the receipt of her donation received on 2026-10-01
    Then the response status is 200
    And the issued receipt has number "2027-000002"
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
    And "Jana" issues the receipt of her donation received on 2026-11-15
    And the donation of "Jana" received on 2026-11-15 was refunded
    And the donation of "Petr" received on 2026-11-20 was refunded
    When "Jana" issues the receipt of her donation received on 2026-11-15
    Then the response status is 404
    And the problem type ends with "donations/receipt-not-available"
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-10-01 | 100000      |
      | 2026-12-10 | 125050      |
    When "Petr" issues his yearly receipt for 2026
    Then the response status is 404
    And the problem type ends with "donations/yearly-receipt-not-available"

  Scenario: A payment that verified an account has no receipt of its own and counts in the yearly receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol | message                               |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         | DAR NADACNI FOND NOVA NADEJE          |
      | 2002 | 2026-11-15 | 1.00    | 2700112222 | 2010     | Nováková Jana | {Jana}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import
    When "Jana" issues the receipt of her donation received on 2026-11-15
    Then the response status is 400
    And the problem type ends with "donations/verification-without-receipt"
    And 0 receipts are stored
    Given today is 2027-01-15
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the frozen receipt lists the gifts:
      | receivedOn | amountMinor |
      | 2026-10-01 | 100000      |
      | 2026-11-15 | 100         |

  Scenario: Only the donor's own existing donation has a receipt
    Given today is 2026-12-20
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 2002 | 2026-10-02 | 800.00  | 2900244444 | 2010     | Svoboda Petr  | {Petr}         |
    And the application starts the import
    When "Petr" issues the receipt of the donation of "Jana" received on 2026-10-01
    Then the response status is 404
    And the problem type ends with "donations/donation-not-found"
    When "Jana" issues the receipt of donation "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 404
    And the problem type ends with "donations/donation-not-found"
    When "Jana" issues the receipt of donation "abc"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "donationId"
    And 0 receipts are stored

  Scenario: Another donor's receipt and the signature image it shows answer as not found
    Given today is 2026-12-20
    And a person "Jana" is registered
    And "Jana" is an administrator
    And a person "Petr" is registered
    And "Jana" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" issues the receipt of her donation received on 2026-10-01
    When "Petr" reads receipt "2026-000001"
    Then the response status is 404
    And the problem type ends with "donations/receipt-not-found"
    When "Petr" fetches the signature image of receipt "2026-000001"
    Then the response status is 404
    And the problem type ends with "donations/receipt-image-not-found"
    When "Petr" lists his receipts
    Then the response status is 200
    And the receipt list is empty
    When "Jana" reads the receipt with id "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 404
    And the problem type ends with "donations/receipt-not-found"
    When "Jana" reads the receipt with id "abc"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" fetches the receipt image "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    Then the response status is 404
    And the problem type ends with "donations/receipt-image-not-found"
    When "Jana" fetches the receipt image "not-a-digest"
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: The donor fetches the signature image their receipt shows, and later receipts show the image current when they are issued
    Given today is 2026-12-20
    And a person "Jana" is registered
    And "Jana" is an administrator
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" issues the receipt of her donation received on 2026-10-01
    And the frozen receipt shows no signature image
    When "Jana" uploads a 600 by 200 pixel JPEG scan named "podpis.jpg" as the receipt signature
    And today is 2027-01-15
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the frozen receipt shows the current signature image
    When "Jana" fetches the signature image of receipt "2027-000002"
    Then the response status is 200
    And the image is the current signature, kept by the browser
    When "Jana" reads the issued receipt again
    Then the response status is 200
    And the issued receipt has number "2027-000002"
    And the frozen receipt shows the current signature image

  Scenario: A company's receipt freezes its seat and identification number
    Given today is 2026-12-20
    And a company "Stavby" is registered with identification number "45274649"
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name         | variableSymbol |
      | 2001 | 2026-10-01 | 5000.00 | 2900255555 | 2010     | Stavby Novák | {Stavby}       |
    And the application starts the import
    And today is 2027-01-15
    When "Stavby" issues its yearly receipt for 2026
    Then the response status is 200
    And the frozen receipt holds:
      | field                    | value                 |
      | donor.type               | COMPANY               |
      | donor.name               | Stavby Novák s.r.o.   |
      | donor.companyIdentifier  | 45274649              |
      | donor.address.street     | Průmyslová 5          |
      | donor.address.postalCode | 415 01                |
      | donor.address.city       | Teplice               |
      | donor.variableSymbol     | {Stavby}              |

  Scenario: A donor who prefers English gets bilingual receipts
    Given today is 2026-12-20
    And a person "Jana" is registered
    And "Jana" switches the preferred locale to "en"
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the frozen receipt holds:
      | field  | value |
      | locale | en    |
    And the frozen receipt carries the Czech and the English texts
    When "Jana" issues the receipt of her donation received on 2026-10-01
    Then the response status is 200
    And the issued receipt has number "2027-000002"
    And the frozen receipt carries the Czech and the English texts

  Scenario: A receipt keeps its language when the donor switches to English afterwards
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issues her yearly receipt for 2026
    When "Jana" switches the preferred locale to "en"
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt is the one issued before
    And the frozen receipt carries the Czech texts only
    And 1 receipt is stored

  Scenario: Half an hour before midnight UTC on New Year's Eve the Prague year has already ended
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And the time is "2026-12-31T23:30:00Z"
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000001"
    And the frozen receipt holds:
      | field    | value      |
      | issuedOn | 2027-01-01 |
    When "Jana" issues her yearly receipt for 2027
    Then the response status is 400
    And the problem type ends with "donations/year-not-yet-completed"

  Scenario: A yearly receipt with more gifts than its verification QR code holds is refused, stores nothing and leaves a gap in the numbering
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-09-30 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the bank account has 600 movements of "200.00" from "Jana" between 2026-10-01 and 2026-12-19
    And the application starts the import
    And today is 2027-01-15
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 400
    And the problem type ends with "donations/receipt-too-long"
    And the problem has the title "Potvrzení má příliš mnoho darů pro ověřovací QR kód"
    And 0 receipts are stored
    When "Jana" issues the receipt of her donation received on 2026-09-30
    Then the response status is 200
    And the issued receipt has number "2027-000002"
    And 1 receipt is stored

  Scenario: A replacement refused for its too long proof leaves the active yearly receipt active
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issues her yearly receipt for 2026
    And the bank account has 600 movements of "200.00" from "Jana" between 2026-12-21 and 2026-12-31
    And the hourly import runs
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 400
    And the problem type ends with "donations/receipt-too-long"
    And 1 receipt is stored
    And 1 receipt is active
    When "Jana" reads receipt "2027-000001"
    Then the response status is 200
    And the issued receipt is active

  Scenario: From serial 900 000 on a new receipt number warns that the numbering is running out
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And the receipt numbering has used the serials up to 899999
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-900000"
    And 1 receipt is stored

  Scenario: A donor gets at most 20 replacements in 24 hours, and an unchanged receipt is returned all the same
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" changed her address and issued her yearly receipt for 2026 21 times
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000021"
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 409
    And the problem type ends with "donations/receipt-issue-limit"
    And the problem has the title "Nové potvrzení teď nejde vydat"
    And 21 receipts are stored
    And 1 receipt is active
    When 1439 minutes pass
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 409
    When 1 minutes pass
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000022"
    And the frozen receipt holds:
      | field                | value       |
      | donor.address.street | Nová 7      |
      | replaces.number      | 2027-000021 |
    And 22 receipts are stored
    And 1 receipt is active

  Scenario: A donor with many gifts gets the first receipt of each of them on one day
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has 21 movements of "200.00" from "Jana" between 2026-10-01 and 2026-10-21
    And the application starts the import
    And today is 2027-01-15
    When "Jana" issues the receipt of each of her donations
    Then 21 receipts are stored
    And 21 receipts are active
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000022"
    And 22 receipts are stored

  Scenario: Issuing receipts is limited per client address, counting the old downloads too
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And "Jana" issued her yearly receipt for 2026 25 times
    And "Jana" downloaded her yearly receipt for 2026 5 times
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    When "Jana" downloads her yearly receipt for 2026
    Then the response status is 429
    When "Jana" downloads the receipt of her donation received on 2026-10-01
    Then the response status is 429
    And 1 receipt is stored
    When the following requests come from another client address
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 200

  Scenario: Without a token no receipt endpoint answers
    When someone without a token issues the yearly receipt for 2026
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token lists the receipts
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token reads the receipt with id "0192f0f1-0000-7000-8000-000000000000"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token fetches the receipt image "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: A receipt whose printed data has a character no receipt can print is refused before a number is taken, and is issued once the data is corrected
    Given today is 2026-12-20
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 1000.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2027-01-15
    And the donation records keep the street of "Jana" as "Dlouhá 12 王", saved before receipts checked their characters
    When "Jana" issues her yearly receipt for 2026
    Then the response status is 409
    And the problem type ends with "donations/receipt-unprintable"
    And the problem has the title "Potvrzení s těmito údaji nejde vytisknout"
    When "Jana" issues the receipt of her donation received on 2026-10-01
    Then the response status is 409
    And the problem type ends with "donations/receipt-unprintable"
    And 0 receipts are stored
    When "Jana" changes her address to street "Dlouhá 12", postal code "400 01" and city "Ústí nad Labem"
    And "Jana" issues her yearly receipt for 2026
    Then the response status is 200
    And the issued receipt has number "2027-000001"
    And 1 receipt is stored
