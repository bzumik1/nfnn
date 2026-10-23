Feature: An administrator finds a donor and sees the donor's account

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And a company "Stavby" is registered with identification number "45274649"
    And "Jana" is an administrator

  Scenario: Donors are found by a part of the name or the e-mail and by the start of the variable symbol
    When "Jana" searches the donors for "svob"
    Then the response status is 200
    And the found donor accounts are "Petr"
    When "Jana" searches the donors for "PETR@EXAMPLE"
    Then the found donor accounts are "Petr"
    When "Jana" searches the donors for "{Petr}"
    Then the found donor accounts are "Petr"
    When "Jana" searches the donors for "nov"
    Then the found donor accounts are "Jana" and "Stavby"
    When "Jana" searches the donors for "%"
    Then the found donor accounts are none
    When "Jana" searches the donors for "  "
    Then the found donor accounts are none

  Scenario: A found donor shows the account facts an administrator needs
    When "Jana" searches the donors for "jana"
    Then the found donor "Jana" is a PERSON, an administrator, with two-factor authentication on and a verified e-mail
    When "Jana" searches the donors for "stavby"
    Then the found donor "Stavby" is a COMPANY, not an administrator, with two-factor authentication off and a verified e-mail

  Scenario: The donor card shows the profile and the state of the account
    When "Jana" opens the donor "Petr"
    Then the response status is 200
    And the donor card says:
      | name                | Petr Svoboda                       |
      | email               | petr@example.cz                    |
      | type                | PERSON                             |
      | companyIdentifier   |                                    |
      | street              | Dlouhá 12                          |
      | city                | Ústí nad Labem                     |
      | postalCode          | 400 01                             |
      | variableSymbol      | {Petr}                             |
      | preferredLocale     | cs                                 |
      | administrator       | false                              |
      | secondFactorEnabled | false                              |
      | emailVerified       | true                               |
    And the donor card says the donor registered on 2026-10-17
    When "Jana" opens the donor "Stavby"
    Then the donor card says:
      | name              | Stavby Novák s.r.o. |
      | type              | COMPANY             |
      | companyIdentifier | 45274649            |
      | street            | Průmyslová 5        |

  Scenario: An administrator turns off the two-factor authentication of a donor who is not an administrator and lost the phone
    Given "Petr" enables the second factor
    When "Jana" opens the donor "Petr"
    Then the donor card says:
      | secondFactorEnabled | true |
    When "Jana" turns off the two-factor authentication of "Petr"
    Then the response status is 204
    And the admin action "RESET_SECOND_FACTOR" by "Jana" on "Petr" is recorded
    And e-mail 1 goes to the address of "Petr" with the subject "Dvoufaktorové ověření vašeho účtu bylo vypnuto – Nová naděje"
    When "Jana" opens the donor "Petr"
    Then the donor card says:
      | secondFactorEnabled | false |

  Scenario: An unknown donor has no card
    When "Jana" opens an unknown donor
    Then the response status is 404
    And the problem type ends with "donors/donor-not-found"

  Scenario: A donor without the administrator role is refused and without a token nothing is served
    When "Petr" searches the donors for "jana"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" opens the donor "Petr"
    Then the response status is 403
    When someone without a token searches the donors
    Then the response status is 401
    When someone without a token opens a donor
    Then the response status is 401
