Feature: The foundation receives a monthly statistics e-mail

  Scenario: The report for the previous month counts the donors, the donations and the unpaired payments
    Given today is 2026-08-20
    And a person "Petr" is registered
    And today is 2026-09-10
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-08-14 | 200.00  | 2900244444 | 2010     | Svoboda Petr  | {Petr}         |
      | 1002 | 2026-09-01 | 1234.50 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
      | 1003 | 2026-09-30 | 300.00  | 2900244444 | 2010     | Svoboda Petr  | {Petr}         |
      | 1004 | 2026-09-15 | 150.00  | 2900255555 | 0800     | Dvořák Karel  | 1111111111     |
      | 1005 | 2026-08-20 | 75.00   | 2900255555 | 0800     | Dvořák Karel  | 1111111111     |
      | 1006 | 2026-10-01 | 999.00  | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And today is 2026-10-01
    And the application starts the import
    And a person "Eva" is registered
    When the monthly report check runs on 2026-10-02
    Then 1 monthly report e-mail is sent to "info@nfnn.cz"
    And the monthly report e-mail comes from "info@nfnn.cz" named "Nová naděje – nadační fond"
    And monthly report e-mail 1 has the subject "Měsíční přehled Nová naděje – září 2026"
    And both parts of the monthly report e-mail say:
      | Registrovaní dárci k 30. 9. 2026: 2                                  |
      | Noví dárci za září 2026: 1                                           |
      | Přijaté dary za září 2026: počet 2, celkem 1 534,50 Kč               |
      | Přijaté dary od 1. 1. 2026: počet 3, celkem 1 734,50 Kč              |
      | Nespárované příchozí platby za září 2026: počet 1, celkem 150,00 Kč  |
      | Poslední úspěšné stažení plateb z banky: 1. 10. 2026 12:00           |
    And the report for "2026-09" is recorded as sent

  Scenario: A failed bank import and an empty month are reported plainly
    Given today is 2026-10-01
    And Fio refuses the next request because the token is not valid
    And the hourly import runs
    When the monthly report check runs on 2026-10-02
    Then 1 monthly report e-mail is sent to "info@nfnn.cz"
    And both parts of the monthly report e-mail say:
      | Registrovaní dárci k 30. 9. 2026: 0                                                                                                      |
      | Přijaté dary za září 2026: počet 0, celkem 0,00 Kč                                                                                       |
      | Poslední úspěšné stažení plateb z banky: zatím žádné                                                                                     |
      | Poslední pokus o stažení 1. 10. 2026 12:00 selhal: Fio token chybí, ještě neplatí nebo vypršel (platí 180 dní); je potřeba vytvořit nový. |

  Scenario: The report is sent once a month, also when the first of the month was missed
    Given today is 2026-10-01
    When the monthly report check runs on 2026-10-05
    And the monthly report check runs on 2026-10-06
    And the monthly report check runs on 2026-10-31
    Then 1 monthly report e-mail is sent to "info@nfnn.cz"
    And monthly report e-mail 1 has the subject "Měsíční přehled Nová naděje – září 2026"
    When the monthly report check runs on 2026-11-01
    And the monthly report check runs on 2026-11-02
    Then 2 monthly report e-mails are sent to "info@nfnn.cz"
    And monthly report e-mail 2 has the subject "Měsíční přehled Nová naděje – říjen 2026"
    And the report for "2026-10" is recorded as sent

  Scenario: A report the mail server refused is sent at the next check
    Given today is 2026-09-30
    And the mail server refuses the next e-mail
    When the monthly report check runs on 2026-10-01
    Then the monthly report was not delivered
    And no monthly report e-mail is sent
    And the report for "2026-09" is not recorded
    When the monthly report check runs on 2026-10-02
    Then 1 monthly report e-mail is sent to "info@nfnn.cz"
    And the report for "2026-09" is recorded as sent

  Scenario: A report is sent only for a month that has ended
    Given today is 2026-10-01
    When the report for "2026-10" is asked for
    Then the report is refused because the month has not ended
    And no monthly report e-mail is sent
