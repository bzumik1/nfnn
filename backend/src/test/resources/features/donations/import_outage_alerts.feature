Feature: The foundation is told when the bank import stops working and when it works again

  Background:
    Given today is 2026-10-17
    And the application starts the import
    And 1 days pass

  Scenario: Three failed imports in a row send one outage e-mail, a fourth failure sends nothing more
    Given Fio refuses the next request because Fio is unreachable
    And the hourly import runs
    And Fio refuses the next request because Fio is unreachable
    And the hourly import runs
    Then no alert e-mail is sent
    Given Fio refuses the next request because Fio is unreachable
    When the hourly import runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Stahování plateb z banky selhává – Nová naděje"
    And both parts of the alert e-mail say:
      | web Nová naděje už 3× za sebou nedokázal stáhnout platby z Fio, naposledy 18. 10. 2026 12:00. |
      | Fio nebylo dostupné: spojení selhalo nebo vypršelo.                                         |
      | Poslední úspěšné stažení plateb z banky: 17. 10. 2026 12:00                                  |
    And the import state reports the outage "TRANSPORT" after 3 failures
    Given Fio refuses the next request because Fio is unreachable
    When the hourly import runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Stahování plateb z banky selhává – Nová naděje"

  Scenario: A rejected token sends the outage e-mail at once with the renewal steps
    Given Fio refuses the next request because the token is not valid
    When the hourly import runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Stahování plateb z banky selhává – Nová naděje"
    And both parts of the alert e-mail say:
      | Fio 18. 10. 2026 12:00 odmítlo token, kterým web Nová naděje stahuje platby z účtu fondu. |
      | Token chybí, ještě neplatí nebo vypršel (platí 180 dní).                                 |
      | a vložte ho ve správě webu v části Nastavení jako Token Fio API.                         |
    And the import state reports the outage "UNAUTHORIZED" after 1 failures

  Scenario: The recovery after an outage sends one e-mail and the next success sends nothing
    Given Fio refuses the next request because the token is not valid
    And the hourly import runs
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-18 | 500.00 | 2900233333 | 2010     | Nováková Jana |                |
    When 1 days pass
    And the hourly import runs
    Then 2 e-mails are sent to "info@nfnn.cz"
    And alert e-mail 2 has the subject "Stahování plateb z banky zase funguje – Nová naděje"
    And both parts of the alert e-mail say:
      | web Nová naděje 19. 10. 2026 12:00 znovu stáhl platby z Fio. Předtím selhal 1 pokus za sebou. |
      | Poslední úspěšné stažení před poruchou: 17. 10. 2026 12:00                                    |
    And 1 bank payments are stored
    And the import state reports no outage
    When 1 days pass
    And the hourly import runs
    Then 2 e-mails are sent to "info@nfnn.cz"

  Scenario: A rate limit and a locked history neither count towards the outage nor end the streak
    Given Fio refuses the next request because Fio is unreachable
    And the hourly import runs
    And Fio refuses the next request because Fio is unreachable
    And the hourly import runs
    And Fio refuses the next request because the token was used less than 30 seconds ago
    And the hourly import runs
    Then no alert e-mail is sent
    Given Fio refuses the next request because Fio is unreachable
    When the hourly import runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Stahování plateb z banky selhává – Nová naděje"

  Scenario: Two failures followed by a success send nothing
    Given Fio refuses the next request because Fio is unreachable
    And the hourly import runs
    And Fio refuses the next request because Fio is unreachable
    And the hourly import runs
    When the hourly import runs
    Then no alert e-mail is sent
    And the import state reports no outage

  Scenario: An outage e-mail the mail server refuses goes out after the next import and only once
    Given the mail server refuses the next e-mail
    And Fio refuses the next request because the token is not valid
    When the hourly import runs
    Then no alert e-mail is sent
    And the import state reports the outage "UNAUTHORIZED" after 1 failures
    Given Fio refuses the next request because the token is not valid
    When the hourly import runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Stahování plateb z banky selhává – Nová naděje"
    And both parts of the alert e-mail say:
      | Fio 18. 10. 2026 12:00 odmítlo token, kterým web Nová naděje stahuje platby z účtu fondu. |
    Given Fio refuses the next request because the token is not valid
    When the hourly import runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Stahování plateb z banky selhává – Nová naděje"

  Scenario: An outage e-mail still waiting when the import works again is replaced by the recovery e-mail
    Given the mail server refuses the next e-mail
    And Fio refuses the next request because the token is not valid
    When the hourly import runs
    Then no alert e-mail is sent
    When 1 days pass
    And the hourly import runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Stahování plateb z banky zase funguje – Nová naděje"
