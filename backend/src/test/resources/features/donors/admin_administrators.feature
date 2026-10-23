Feature: An administrator manages who administers the site

  Background:
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" is an administrator

  Scenario: An administrator sees who administers the site and whether they use two-factor authentication
    When "Jana" lists the administrators
    Then the response status is 200
    And the administrators are Jana
    And administrator "Jana" has two-factor authentication on

  Scenario: An administrator makes a registered donor an administrator by e-mail
    When "Jana" makes "Petr" an administrator
    Then the response status is 201
    And the administrator response names "Petr" without two-factor authentication
    And the admin action "GRANT_ADMINISTRATION" by "Jana" on "Petr" is recorded
    When "Jana" lists the administrators
    Then the administrators are Jana, Petr
    And administrator "Petr" has two-factor authentication off

  Scenario: The new administrator gets in only with two-factor authentication at the next sign-in
    Given "Jana" made "Petr" an administrator
    When "Petr" asks for the import state
    Then the response status is 403
    When "Petr" signs in again
    And "Petr" asks for the import state
    Then the response status is 403
    When "Petr" enables the second factor
    And "Petr" signs in again
    And "Petr" asks for the import state
    Then the response status is 200

  Scenario: An e-mail nobody registered with cannot become an administrator
    When "Jana" makes the e-mail "nikdo@example.cz" an administrator
    Then the response status is 404
    And the problem type ends with "donors/email-not-registered"
    And the admin action "GRANT_ADMINISTRATION" by "Jana" is not recorded

  Scenario: A donor who already is an administrator is not added twice
    When "Jana" makes "Jana" an administrator
    Then the response status is 409
    And the problem type ends with "donors/already-administrator"

  Scenario: A blank e-mail is refused before any lookup
    When "Jana" makes the e-mail " " an administrator
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: An administrator takes the role from another administrator, whose sessions end
    Given "Petr" is an administrator
    When "Jana" removes "Petr" from the administrators
    Then the response status is 204
    And the admin action "REVOKE_ADMINISTRATION" by "Jana" on "Petr" is recorded
    When "Jana" lists the administrators
    Then the administrators are Jana
    When 1 minutes pass
    And "Petr" signs in again
    And "Petr" asks for the import state
    Then the response status is 403

  Scenario: An administrator cannot take the role from themselves
    When "Jana" removes "Jana" from the administrators
    Then the response status is 400
    And the problem type ends with "donors/own-administration"
    When "Jana" lists the administrators
    Then the administrators are Jana

  Scenario: A donor who is not an administrator has no role to take
    When "Jana" removes "Petr" from the administrators
    Then the response status is 409
    And the problem type ends with "donors/not-administrator"

  Scenario: An unknown donor cannot be removed
    When "Jana" removes an unknown donor from the administrators
    Then the response status is 404
    And the problem type ends with "donors/donor-not-found"

  Scenario: An administrator turns off the two-factor authentication of a donor who lost the phone
    Given "Petr" is an administrator
    When "Jana" turns off the two-factor authentication of "Petr"
    Then the response status is 204
    And the admin action "RESET_SECOND_FACTOR" by "Jana" on "Petr" is recorded
    And e-mail 1 goes to the address of "Petr" with the subject "Dvoufaktorové ověření vašeho účtu bylo vypnuto – Nová naděje"
    When "Petr" signs in again
    And "Petr" asks for the import state
    Then the response status is 403
    And the donor profile says the second factor is needed for administration
    When "Jana" lists the administrators
    Then administrator "Petr" has two-factor authentication off

  Scenario: Two-factor authentication that is not on cannot be turned off
    When "Jana" turns off the two-factor authentication of "Petr"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-not-enabled"

  Scenario: A donor without the administrator role may not manage administrators
    When "Petr" lists the administrators
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" makes "Petr" an administrator
    Then the response status is 403
    When "Petr" turns off the two-factor authentication of "Jana"
    Then the response status is 403

  Scenario: Without a token the administrators are not served
    When someone without a token lists the administrators
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: The configured e-mail becomes the first administrator when the application starts, once
    Given nobody administers the site
    And the configuration names "Petr" and "nikdo@example.cz" as administrators
    When the application starts
    And the application starts
    Then "Petr" is an administrator in the database
    And no admin action is recorded for "Petr"

  Scenario: Once the site has an administrator, a restart grants the configured e-mail nothing
    Given the configuration names "Petr" and "nikdo@example.cz" as administrators
    When the application starts
    Then "Petr" is not an administrator in the database
    When "Jana" makes "Petr" an administrator
    And "Jana" removes "Petr" from the administrators
    And the application starts
    Then "Petr" is not an administrator in the database
