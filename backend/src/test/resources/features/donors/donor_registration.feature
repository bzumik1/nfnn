@donors
Feature: Donor registers an account

  Scenario: A person registers, confirms the e-mail and receives a variable symbol
    When a person registers
      | name       | Jana Nováková         |
      | street     | Dlouhá 12             |
      | city       | Ústí nad Labem        |
      | postalCode | 400 01                |
      | email      | jana@example.cz       |
      | password   | correct horse battery |
    Then the response status is 202
    When the donor confirms the e-mail with the link from the e-mail
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the registered donor has a 10-digit variable symbol
    And the donor profile shows type "PERSON", name "Jana Nováková" and email "jana@example.cz"

  Scenario: A company registers with its identification number
    When a company registers
      | name              | Stavby Novák s.r.o.   |
      | companyIdentifier | 45274649              |
      | street            | Průmyslová 5          |
      | city              | Teplice               |
      | postalCode        | 415 01                |
      | email             | ucetni@stavby.cz      |
      | password          | correct horse battery |
    Then the response status is 202
    When the donor confirms the e-mail with the link from the e-mail
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows type "COMPANY", name "Stavby Novák s.r.o." and company identifier "45274649"

  Scenario: A company cannot register without an identification number
    When a company registers
      | name       | Stavby Novák s.r.o.   |
      | street     | Průmyslová 5          |
      | city       | Teplice               |
      | postalCode | 415 01                |
      | email      | ucetni@stavby.cz      |
      | password   | correct horse battery |
    Then the response status is 400
    And the problem type ends with "donors/company-identifier-required"

  Scenario: An identification number with a wrong check digit is refused
    When a company registers
      | name              | Stavby Novák s.r.o.   |
      | companyIdentifier | 45274648              |
      | street            | Průmyslová 5          |
      | city              | Teplice               |
      | postalCode        | 415 01                |
      | email             | ucetni@stavby.cz      |
      | password          | correct horse battery |
    Then the response status is 400
    And the problem lists an error for field "companyIdentifier"

  Scenario: The same email is not registered twice, whatever its case, and the answer does not say so
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    When a person registers
      | name       | Jana Nováková         |
      | street     | Dlouhá 12             |
      | city       | Ústí nad Labem        |
      | postalCode | 400 01                |
      | email      | Jana@Example.cz       |
      | password   | correct horse battery |
    Then the response status is 202
    And 0 verification links are stored
    And donations keeps 1 donor record

  Scenario: A short password is refused
    When a person registers
      | name       | Jana Nováková   |
      | street     | Dlouhá 12       |
      | city       | Ústí nad Labem  |
      | postalCode | 400 01          |
      | email      | jana@example.cz |
      | password   | short           |
    Then the response status is 400
    And the problem lists an error for field "password"

  Scenario: A password everyone uses is refused
    When a person registers
      | name       | Jana Nováková   |
      | street     | Dlouhá 12       |
      | city       | Ústí nad Labem  |
      | postalCode | 400 01          |
      | email      | jana@example.cz |
      | password   | password1234    |
    Then the response status is 400
    And the problem type ends with "donors/password-too-common"

  Scenario: The sixth registration within an hour from one address is refused, a repeated one counts too, and no account is created
    Given people registered with these emails:
      | anna@example.cz  |
      | berta@example.cz |
      | cyril@example.cz |
      | dana@example.cz  |
    When a person registers with email "anna@example.cz" and password "correct horse battery"
    Then the response status is 202
    When a person registers with email "eva@example.cz" and password "correct horse battery"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    And the problem has the title "Příliš mnoho požadavků"
    And 0 verification links are stored
    When the following requests come from another client address
    And a person registers with email "eva@example.cz" and password "correct horse battery"
    Then the response status is 202
    And 1 verification link is stored

  Scenario: Registration opens again an hour after the address's first one
    Given people registered with these emails:
      | anna@example.cz  |
      | berta@example.cz |
      | cyril@example.cz |
      | dana@example.cz  |
      | emil@example.cz  |
    When 59 minutes pass
    And a person registers with email "eva@example.cz" and password "correct horse battery"
    Then the response status is 429
    When 60 seconds pass
    And a person registers with email "eva@example.cz" and password "correct horse battery"
    Then the response status is 202
