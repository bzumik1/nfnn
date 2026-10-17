Feature: Donations keeps its own record of each donor

  Scenario: A registered person is known to donations with the variable symbol, name, address and locale
    Given a person "Jana" is registered
    Then donations knows "Jana" with type "PERSON", name "Jana Nováková", address "Dlouhá 12, 400 01 Ústí nad Labem" and locale "cs"
    And donations knows "Jana" with the registered variable symbol

  Scenario: A registered company is known to donations with its identification number
    Given a company "Stavby" is registered with identification number "45274649"
    Then donations knows "Stavby" with type "COMPANY", name "Stavby Novák s.r.o.", address "Průmyslová 5, 415 01 Teplice" and locale "cs"
    And donations knows "Stavby" with company identifier "45274649"
    And donations knows "Stavby" with the registered variable symbol

  Scenario: A profile change updates the record's name, address and locale and leaves the symbol and the learned accounts alone
    Given today is 2026-10-17
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-10-15 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" has learned sender account "2900233333/2010"
    When "Jana" updates the profile to name "Jana Malá" and street "Krátká 3"
    And "Jana" switches the preferred locale to "en"
    Then donations knows "Jana" with type "PERSON", name "Jana Malá", address "Krátká 3, 400 01 Ústí nad Labem" and locale "en"
    And donations knows "Jana" with the registered variable symbol
    And "Jana" has learned sender account "2900233333/2010"

  Scenario: The record exists as soon as the registration response arrives
    When a person "Jana" is registered
    Then the response status is 201
    And donations knows "Jana" with the registered variable symbol

  Scenario: A registration announced twice keeps one record
    Given donations is told that a person "Jana" registered with variable symbol "4821937560"
    When donations is told that a person "Jana" registered with variable symbol "4821937560"
    Then donations keeps 1 donor record
    And donations knows "Jana" with type "PERSON", name "Jana Nováková", address "Dlouhá 12, 400 01 Ústí nad Labem" and locale "cs"
    And donations knows "Jana" with the registered variable symbol
