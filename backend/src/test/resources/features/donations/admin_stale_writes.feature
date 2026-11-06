@donations
Feature: The administration refuses a change made from a version of the record that changed meanwhile

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And a person "Eva" is registered
    And "Jana" is an administrator
    And "Eva" is an administrator
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol | message                               |
      | 1001 | 2026-10-10 | 500.00 | 2900233333 | 2010     | Nováková Jana | 1111111111     | Dar pro fond                          |
      | 1002 | 2026-10-12 | 300.00 | 2900244444 | 0800     | Svoboda Petr  | {Petr}         |                                       |
      | 1003 | 2026-08-05 | 500.00 | 1234567    | 0800     | Svoboda Petr  | 6123456789     |                                       |
      | 1004 | 2026-10-14 | 1.00   | 1234567    | 0800     | Svoboda Petr  | {Petr}         | OVERENI UCTU NADACNI FOND NOVA NADEJE |
    And the application starts the import

  Scenario Outline: Of two changes made from one version, the second waits at the lock and is refused as changed meanwhile with what holds now [<first>, then <second>]
    Given <state>
    When these writes start one after another from the versions read before them, while the <lock> is held:
      | who  | write    |
      | Jana | <first>  |
      | Eva  | <second> |
    Then write 1 answers <status>
    And write 2 is refused as "donations/changed-meanwhile" with the version now stored and the current record

    Examples:
      | state                                                                  | lock                 | first                                           | second                                          | status |
      | today is 2026-10-17                                                    | pairing lock         | pairs payment 1001 with Petr                    | pairs payment 1001 with Jana                    | 200    |
      | "Jana" pairs payment 1001 with "Petr"                                  | pairing lock         | unpairs payment 1001                            | unpairs payment 1001                            | 200    |
      | today is 2026-10-17                                                    | pairing lock         | turns off bank account 2900244444/0800 of Petr  | turns off bank account 2900244444/0800 of Petr  | 204    |
      | today is 2026-10-17                                                    | pairing lock         | turns off bank account 2900244444/0800 of Petr  | removes bank account 2900244444/0800 of Petr    | 204    |
      | "Petr" confirms symbol "6123456789" at bank account "1234567/0800"     | pairing lock         | reverses the symbol answer of Petr to 6123456789 | reverses the symbol answer of Petr to 6123456789 | 204   |
      | "Petr" confirms symbol "6123456789" at bank account "1234567/0800"     | pairing lock         | reverses the symbol answer of Petr to 6123456789 | deletes the symbol answer of Petr to 6123456789 | 204    |
      | today is 2026-10-17                                                    | report settings lock | sends the monthly report on day 5               | sends the monthly report on day 9               | 200    |

  Scenario: Of two administrators turning the pairing from an account on again at once, the second is told it is already on, since turning it on adds a new link and leaves the old one as it was
    Given "Jana" turns off the pairing from bank account "2900244444/0800" of "Petr"
    When these writes start one after another from the versions read before them, while the pairing lock is held:
      | who  | write                                         |
      | Jana | turns on bank account 2900244444/0800 of Petr |
      | Eva  | turns on bank account 2900244444/0800 of Petr |
    Then write 1 answers 204
    And write 2 is refused as "donations/bank-account-already-connected"

  Scenario: An administrator who pairs a payment another administrator paired since they read it is told it changed meanwhile, and the payment stays with the first donor
    Given "Jana" reads payment 1001
    And "Eva" pairs payment 1001 with "Petr"
    When "Jana" pairs payment 1001 with "Jana" from the version read before
    Then the response status is 409
    And the problem type ends with "donations/changed-meanwhile"
    And bank payment 1001 is paired with "Petr"
    When "Jana" pairs payment 1001 with "Jana"
    Then the response status is 409
    And the problem type ends with "donations/bank-payment-already-paired"

  Scenario: An administrator who unpairs a payment another administrator unpaired and paired again since they read it is told it changed meanwhile
    Given "Jana" pairs payment 1001 with "Petr"
    And "Jana" reads payment 1001
    And "Eva" unpairs payment 1001
    And "Eva" pairs payment 1001 with "Petr"
    When "Jana" unpairs payment 1001 from the version read before
    Then the response status is 409
    And the problem type ends with "donations/changed-meanwhile"
    And bank payment 1001 is paired with "Petr"

  Scenario: A change from a browser that names no version is refused before anything changes, after the request itself was checked
    When "Jana" pairs payment 1001 with "Petr" naming no version
    Then the response status is 428
    And the problem type ends with "shared/version-required"
    And bank payment 1001 is unpaired
    When "Jana" pairs payment 1001 without naming a donor or a version
    Then the response status is 400
    When "Jana" pairs payment 1001 with "Petr" naming the version "*"
    Then the response status is 409
    And the problem type ends with "donations/changed-meanwhile"
    And bank payment 1001 is unpaired
