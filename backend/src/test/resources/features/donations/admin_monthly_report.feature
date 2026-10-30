@donations
Feature: An administrator sets up the monthly report, sends it again and reads the yearly overview

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Without saved settings the report goes to the configured recipient on the 1st at 7:00 with every section
    When "Jana" asks for the monthly report settings
    Then the response status is 200
    And the monthly report settings say:
      | settings.recipients.0            | info@nfnn.cz |
      | settings.sendDay                 | 1            |
      | settings.sendHour                | 7            |
      | settings.sections.donors         | true         |
      | settings.sections.donations      | true         |
      | settings.sections.unpairedPayments | true       |
      | settings.sections.bankImport     | true         |
      | nextReport.month                 | 2026-09      |
      | nextReport.dueOn                 | 2026-10-01   |
      | lastEndedMonth                   | 2026-09      |
    And the monthly report settings list no sent report

  Scenario: Changed settings decide who gets the report, on which day and hour and with which sections
    When "Jana" changes the monthly report settings:
      | recipients | pavel@example.cz, jakub@example.cz |
      | sendDay    | 5                                  |
      | sendHour   | 9                                  |
      | sections   | donations, bankImport              |
    Then the response status is 200
    And the admin action "CHANGE_REPORT_SETTINGS" by "Jana" is recorded with details containing "pavel@example.cz, jakub@example.cz; odesílá se 5. den v měsíci v 9:00; části dary, stahování z banky"
    When "Jana" asks for the monthly report settings
    Then the monthly report settings say:
      | settings.recipients.1       | jakub@example.cz |
      | settings.sendDay            | 5                |
      | settings.sendHour           | 9                |
      | settings.sections.donors    | false            |
      | settings.sections.bankImport | true            |
      | nextReport.dueOn            | 2026-10-05       |
    When the monthly report check runs on 2026-11-04 at "23:00"
    Then no monthly report e-mail is sent
    When the monthly report check runs on 2026-11-05 at "08:00"
    Then no monthly report e-mail is sent
    When the monthly report check runs on 2026-11-05 at "09:00"
    Then 1 monthly report e-mail is sent to "pavel@example.cz, jakub@example.cz"
    And monthly report e-mail 1 has the subject "Měsíční přehled Nová naděje – říjen 2026"
    And both parts of the monthly report e-mail say:
      | Přijaté dary za říjen 2026: počet 0, celkem 0,00 Kč |
      | Poslední úspěšné stažení plateb z banky: zatím žádné |
    And the monthly report e-mail does not say "Registrovaní dárci"
    And the monthly report e-mail does not say "Nespárované příchozí platby"

  Scenario: Import outage alerts go to the report recipients too
    Given "Jana" changes the monthly report settings:
      | recipients | pavel@example.cz |
      | sendDay    | 1                |
      | sections   | donors           |
    And Fio refuses the next request because the token is not valid
    When the hourly import runs
    Then 1 e-mail is sent to "pavel@example.cz" with the subject "Stahování plateb z banky selhává – Nová naděje"

  Scenario: An administrator sends a month's report again and the sending is audited
    Given today is 2026-11-02
    And the monthly report check runs on 2026-11-02
    And 1 monthly report e-mail is sent to "info@nfnn.cz"
    When "Jana" sends the monthly report for "2026-10" again
    Then the response status is 200
    And the sent report says:
      | month        | 2026-10      |
      | recipients.0 | info@nfnn.cz |
    And 2 monthly report e-mails are sent to "info@nfnn.cz"
    And monthly report e-mail 2 has the subject "Měsíční přehled Nová naděje – říjen 2026"
    And the admin action "SEND_MONTHLY_REPORT" by "Jana" is recorded with details containing "Měsíční přehled za 2026-10 ručně odeslán na info@nfnn.cz"
    When "Jana" asks for the monthly report settings
    Then the monthly report settings say:
      | sentReports.0.month | 2026-10    |
      | nextReport.month    | 2026-11    |
      | nextReport.dueOn    | 2026-12-01 |
      | lastEndedMonth      | 2026-10    |

  Scenario: A month the morning check never sent is recorded when an administrator sends it
    When "Jana" sends the monthly report for "2026-08" again
    Then the response status is 200
    And 1 monthly report e-mail is sent to "info@nfnn.cz"
    And the report for "2026-08" is recorded as sent

  Scenario: A month that has not ended cannot be sent
    When "Jana" sends the monthly report for "2026-10" again
    Then the response status is 400
    And the problem type ends with "donations/report-month-not-ended"
    And no monthly report e-mail is sent

  Scenario: A refused e-mail is reported to the administrator and nothing is recorded
    Given the mail server refuses the next e-mail
    When "Jana" sends the monthly report for "2026-09" again
    Then the response status is 502
    And the problem type ends with "donations/report-not-delivered"
    And the report for "2026-09" is not recorded
    And no admin action "SEND_MONTHLY_REPORT" is recorded

  Scenario: Settings with a malformed address, a day outside every month, an hour outside the day or no section are refused
    When "Jana" changes the monthly report settings:
      | recipients | pavel            |
      | sendDay    | 1                |
      | sections   | donations        |
    Then the response status is 400
    And the problem type ends with "donations/report-recipient-invalid"
    And the problem does not repeat "pavel"
    When "Jana" changes the monthly report settings:
      | recipients | pavel@example.cz |
      | sendDay    | 29               |
      | sections   | donations        |
    Then the response status is 400
    And the problem lists an error for field "sendDay"
    When "Jana" changes the monthly report settings:
      | recipients | pavel@example.cz |
      | sendDay    | 1                |
      | sendHour   | 24               |
      | sections   | donations        |
    Then the response status is 400
    And the problem lists an error for field "sendHour"
    When "Jana" changes the monthly report settings:
      | recipients | pavel@example.cz |
      | sendDay    | 1                |
      | sendHour   |                  |
      | sections   | donations        |
    Then the response status is 400
    And the problem lists an error for field "sendHour"
    When "Jana" changes the monthly report settings:
      | recipients | pavel@example.cz |
      | sendDay    | 1                |
      | sections   |                  |
    Then the response status is 400
    And the problem type ends with "donations/report-section-required"
    And no admin action "CHANGE_REPORT_SETTINGS" is recorded

  Scenario: The same recipient twice is refused, whatever its case
    When "Jana" changes the monthly report settings:
      | recipients | pavel@example.cz, Pavel@Example.cz |
      | sendDay    | 1                                  |
      | sections   | donations                          |
    Then the response status is 400
    And the problem type ends with "donations/report-recipient-repeated"
    And the problem does not repeat "example.cz"
    And no admin action "CHANGE_REPORT_SETTINGS" is recorded

  Scenario: A month outside the calendar is refused as a field without repeating it
    When "Jana" sends the monthly report for "2026-13" again
    Then the response status is 400
    And the problem lists an error for field "month"
    And the problem does not repeat "2026-13"

  Scenario: The yearly overview counts everything received, new donors, paired and unpaired payments by month
    Given today is 2026-08-20
    And a person "Petr" is registered
    And today is 2026-09-10
    And a person "Eva" is registered
    And the bank account has these movements:
      | id   | date       | amount  | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-08-14 | 200.00  | 2900244444 | 2010     | Svoboda Petr  | {Petr}         |
      | 1002 | 2026-09-01 | 1234.50 | 2900233333 | 2010     | Nováková Eva  | {Eva}          |
      | 1003 | 2026-09-30 | 300.00  | 2900244444 | 2010     | Svoboda Petr  | {Petr}         |
      | 1004 | 2026-09-15 | 150.00  | 2900255555 | 0800     | Dvořák Karel  | 1111111111     |
      | 1006 | 2026-10-01 | 999.00  | 2900233333 | 2010     | Nováková Eva  | {Eva}          |
    And today is 2026-10-23
    And the application starts the import
    When "Jana" asks for the donations overview
    Then the response status is 200
    And the donations overview says:
      | year                             | 2026    |
      | availableYears.0                 | 2026    |
      | donorsRegistered                 | 3       |
      | newDonors                        | 3       |
      | received.count                   | 5       |
      | received.totalMinor              | 288350  |
      | paired.count                     | 4       |
      | paired.totalMinor                | 273350  |
      | unpaired.count                   | 1       |
      | unpaired.totalMinor              | 15000   |
      | months.0.month                   | 2026-10 |
      | months.0.received.count          | 1       |
      | months.0.received.totalMinor     | 99900   |
      | months.0.paired.count            | 1       |
      | months.0.newDonors               | 1       |
      | months.1.month                   | 2026-09 |
      | months.1.received.count          | 3       |
      | months.1.received.totalMinor     | 168450  |
      | months.1.paired.count            | 2       |
      | months.1.paired.totalMinor       | 153450  |
      | months.1.newDonors               | 1       |
      | months.1.unpaired.count          | 1       |
      | months.1.unpaired.totalMinor     | 15000   |
      | months.2.month                   | 2026-08 |
      | months.2.received.count          | 1       |
      | months.2.newDonors               | 1       |
      | months.9.month                   | 2026-01 |
    And the donations overview lists 10 months
    When "Jana" asks for the donations overview of 2025
    Then the response status is 200
    And the donations overview says:
      | year             | 2025 |
      | donorsRegistered | 0    |
      | received.count   | 0    |
    And the donations overview lists 12 months

  Scenario: The yearly overview counts every donor who gave in a month once, and unpaired payments count no donor
    Given today is 2026-09-01
    And a person "Petr" is registered
    And a person "Eva" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-09-02 | 200.00 | 2900244444 | 2010     | Svoboda Petr | {Petr}         |
      | 1002 | 2026-09-20 | 300.00 | 2900244444 | 2010     | Svoboda Petr | {Petr}         |
      | 1003 | 2026-09-25 | 150.00 | 2900255555 | 0800     | Dvořák Karel | 1111111111     |
      | 1004 | 2026-10-01 | 999.00 | 2900233333 | 2010     | Nováková Eva | {Eva}          |
      | 1005 | 2026-10-02 | 100.00 | 2900244444 | 2010     | Svoboda Petr | {Petr}         |
    And today is 2026-10-23
    And the application starts the import
    When "Jana" asks for the donations overview
    Then the response status is 200
    And the donations overview says:
      | givingDonors            | 2       |
      | paired.count            | 4       |
      | months.0.month          | 2026-10 |
      | months.0.givingDonors   | 2       |
      | months.1.month          | 2026-09 |
      | months.1.givingDonors   | 1       |
      | months.1.paired.count   | 2       |
      | months.1.received.count | 3       |
      | months.2.givingDonors   | 0       |

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    When "Petr" asks for the monthly report settings
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" asks for the donations overview
    Then the response status is 403
    When someone without a token asks for the monthly report settings
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
