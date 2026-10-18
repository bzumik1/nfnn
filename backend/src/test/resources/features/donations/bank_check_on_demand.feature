Feature: A donor opening the overview has the bank checked for new payments

  Scenario: A check fetches a payment that arrived after the last import
    Given today is 2026-10-18
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-18 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    When "Jana" asks for the bank to be checked
    Then the response status is 202
    And the bank data is as of now
    And Fio was asked 1 times
    When "Jana" asks for her donation summary
    Then the summary totals 50000 minor CZK in 1 donation

  Scenario: A check within 30 seconds of the last import does not ask the bank again
    Given today is 2026-10-18
    And a person "Jana" is registered
    And the application starts the import
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-18 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    When "Jana" asks for the bank to be checked
    Then the response status is 202
    And the bank is not being checked
    And Fio was asked 1 times
    When "Jana" asks for her donation summary
    Then the summary totals 0 minor CZK in 0 donations
    When 29 seconds pass
    And "Jana" asks for the bank to be checked
    Then Fio was asked 1 times
    When 1 seconds pass
    And "Jana" asks for the bank to be checked
    Then Fio was asked 2 times
    And the bank data is as of now
    When "Jana" asks for her donation summary
    Then the summary totals 50000 minor CZK in 1 donation

  Scenario: Checks by different donors share the 30 seconds
    Given today is 2026-10-18
    And a person "Jana" is registered
    And a person "Petr" is registered
    When "Jana" asks for the bank to be checked
    And "Petr" asks for the bank to be checked
    Then the response status is 202
    And Fio was asked 1 times

  Scenario: A failed check also waits 30 seconds before the bank is asked again
    Given today is 2026-10-18
    And a person "Jana" is registered
    And Fio refuses the next request because Fio is unreachable
    When "Jana" asks for the bank to be checked
    Then the response status is 202
    And the bank data is not available yet
    And the import state records that Fio was unreachable
    When "Jana" asks for the bank to be checked
    Then Fio was asked 1 times
    When 30 seconds pass
    And "Jana" asks for the bank to be checked
    Then Fio was asked 2 times
    And the bank data is as of now

  Scenario: A donor reads when the bank data was last updated
    Given today is 2026-10-18
    And a person "Jana" is registered
    And the application starts the import
    When 5 minutes pass
    And "Jana" asks whether the bank is being checked
    Then the response status is 200
    And the bank data is 5 minutes old
    And the bank is not being checked
    And Fio was asked 1 times

  Scenario: Only a signed-in donor can have the bank checked
    When someone without a token asks for the bank to be checked
    Then the response status is 401
    When someone without a token asks whether the bank is being checked
    Then the response status is 401
