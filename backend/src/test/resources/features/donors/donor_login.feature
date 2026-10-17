Feature: Donor signs in and keeps a session

  Background:
    Given a person registered with email "jana@example.cz" and password "correct horse battery"

  Scenario: Signing in with the right password opens a session
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows type "PERSON", name "Jana Nováková" and email "jana@example.cz"

  Scenario: A wrong password is refused without saying which part is wrong
    When the donor signs in with email "jana@example.cz" and password "wrong horse battery"
    Then the response status is 401
    And the problem type ends with "auth/invalid-credentials"

  Scenario: An unknown email is refused the same way
    When the donor signs in with email "nobody@example.cz" and password "correct horse battery"
    Then the response status is 401
    And the problem type ends with "auth/invalid-credentials"

  Scenario: An expired access token no longer opens the profile
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When 20 minutes pass
    And the donor asks for the profile
    Then the response status is 401
    And the problem type ends with "auth/expired-token"

  Scenario: Refreshing the session rotates the refresh token
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor refreshes the session
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the refresh cookie differs from the previous one
    When the donor refreshes the session with the previous refresh cookie
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

  Scenario: Signing out ends the session
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor signs out
    Then the response status is 204
    And the refresh cookie is cleared
    When the donor refreshes the session with the previous refresh cookie
    Then the response status is 401

  Scenario: The donor changes the name and address on the profile
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor updates the profile
      | name       | Jana Svobodová |
      | street     | Krátká 3       |
      | city       | Most           |
      | postalCode | 434 01         |
    Then the response status is 200
    And the donor profile shows type "PERSON", name "Jana Svobodová" and email "jana@example.cz"
    And the donor profile shows street "Krátká 3"
