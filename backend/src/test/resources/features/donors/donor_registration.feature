Feature: Donor registers an account

  Scenario: A person registers and receives a variable symbol
    When a person registers
      | name       | Jana Nováková         |
      | street     | Dlouhá 12             |
      | city       | Ústí nad Labem        |
      | postalCode | 400 01                |
      | email      | jana@example.cz       |
      | password   | correct horse battery |
    Then the response status is 201
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
    Then the response status is 201
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

  Scenario: The same email cannot be registered twice, whatever its case
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    When a person registers
      | name       | Jana Nováková         |
      | street     | Dlouhá 12             |
      | city       | Ústí nad Labem        |
      | postalCode | 400 01                |
      | email      | Jana@Example.cz       |
      | password   | correct horse battery |
    Then the response status is 409
    And the problem type ends with "donors/email-already-registered"

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
