@donors
Feature: An administrator erases a donor's personal data

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" is an administrator

  Scenario: An administrator erases a donor who asked for it, the donor is told and the account cannot be used any more
    Given "Petr" enables the second factor
    And "Petr" and "Jana" each hold a second-factor challenge, a used and an open recovery by payment and a connection code
    When "Jana" erases the donor "Petr"
    Then the response status is 204
    And "Petr" holds no second-factor challenge, recovery by payment or connection code any more, while "Jana" keeps hers
    And the admin action "ERASE_DONOR" by "Jana" on "Petr" is recorded
    And e-mail 1 goes to the address of "Petr" with the subject "Vaše osobní údaje jsme vymazali – Nová naděje"
    And both parts of the last e-mail contain "Vydaná potvrzení o daru jsou účetní doklady"
    And both parts of the last e-mail contain "uchováváme na našem serveru beze změny, tedy i s vaším jménem a adresou (u firmy i s IČO), jak na nich stojí"
    And both parts of the last e-mail contain "po dobu, kterou stanoví účetní a daňové předpisy"
    And both parts of the last e-mail contain "včetně čísla účtu a jména plátce"
    And both parts of the last e-mail contain "Na serveru zůstává i záznam o tom, co správci webu udělali, včetně tohoto výmazu."
    And both parts of the last e-mail contain "Databázi webu každý den zálohujeme na náš server a zálohy na serveru mažeme přibližně po měsíci; vymazané údaje proto ze záloh zmizí nejpozději po této době."
    And neither part of the last e-mail contains "nejsou už ale spojené s vaším jménem"
    And both parts of the last e-mail contain "Kopii vašich údajů, kterou si dárcovský portál uložil do zařízení, kde jste byli přihlášení, zařízení smaže, jakmile se příště spojí s naším serverem"
    And both parts of the last e-mail contain "potvrzení, která jste si sami stáhli, zůstávají u vás"
    And both parts of the last e-mail contain "Z kopií správy v zařízeních správců vaše údaje zmizí při jejich příští synchronizaci."
    When "Jana" opens the donor "Petr"
    Then the response status is 200
    And the donor card says the donor was erased on 2026-10-17
    And the donor card carries no personal data of "Petr"
    And the donor card says:
      | name                | Vymazaný dárce |
      | type                | PERSON         |
      | companyIdentifier   |                |
      | street              | Vymazáno       |
      | city                | Vymazáno       |
      | postalCode          | 00000          |
      | variableSymbol      | {Petr}         |
      | administrator       | false          |
      | secondFactorEnabled | false          |
      | emailVerified       | false          |
    When "Jana" searches the donors for "svob"
    Then the found donor accounts are none
    When "Jana" searches the donors for "{Petr}"
    Then the found donor accounts are "Petr"
    When "Petr" tries to sign in with the former credentials
    Then the response status is 401
    And the problem type ends with "auth/invalid-credentials"
    When a password reset is asked for "petr@example.cz"
    Then the response status is 202
    And 1 e-mail is sent to "petr@example.cz" with the subject "Vaše osobní údaje jsme vymazali – Nová naděje"

  Scenario: A tab the donor left open cannot put the personal data back after the erasure
    Given "Petr" keeps an access token that names no session
    And "Jana" erased the donor "Petr"
    When "Petr" saves the profile with the name "Petr Svoboda"
    Then the response status is 401
    And the problem type ends with "auth/session-ended"
    When "Petr" saves the profile with the name "Petr Svoboda" with the token that names no session
    Then the response status is 409
    And the problem type ends with "donors/already-erased"
    When "Jana" opens the donor "Petr"
    Then the response status is 200
    And the donor card carries no personal data of "Petr"

  Scenario: The former e-mail address can register again after the erasure
    Given "Jana" erased the donor "Petr"
    When a person registers with email "petr@example.cz" and password "correct horse battery"
    Then the response status is 202
    And e-mail 2 goes to the address of "Petr" with the subject "Potvrďte svůj e-mail – Nová naděje"

  Scenario: An administrator cannot be erased while they hold the role
    Given "Petr" is an administrator
    When "Jana" erases the donor "Petr"
    Then the response status is 409
    And the problem type ends with "donors/administrator-not-erasable"
    And the admin action "ERASE_DONOR" by "Jana" is not recorded
    When "Jana" erases the donor "Jana"
    Then the response status is 409
    And the problem type ends with "donors/administrator-not-erasable"

  Scenario: An erased donor cannot be erased again
    Given "Jana" erased the donor "Petr"
    When "Jana" erases the donor "Petr"
    Then the response status is 409
    And the problem type ends with "donors/already-erased"

  Scenario: An unknown donor cannot be erased
    When "Jana" erases an unknown donor
    Then the response status is 404
    And the problem type ends with "donors/donor-not-found"

  Scenario: A donor without the administrator role may not erase anyone, and without a token nothing happens
    When "Petr" erases the donor "Jana"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token erases a donor
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
