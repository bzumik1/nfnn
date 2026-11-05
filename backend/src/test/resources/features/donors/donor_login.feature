@donors
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

  Scenario: Refreshing the session rotates the refresh token and a replayed one ends every session
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor refreshes the session
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the refresh cookie differs from the previous one
    When 2 minutes pass
    And the donor refreshes the session with the previous refresh cookie
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"
    When the donor refreshes the session
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

  Scenario: A refresh whose answer was lost is repeated within 60 seconds and keeps the session
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor refreshes the session but the answer is lost
    Then the response status is 200
    When 59 seconds pass
    And the donor refreshes the session
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    When the donor refreshes the session
    Then the response status is 200
    When the donor asks for the profile
    Then the response status is 200

  Scenario: The refresh cookie of a lost answer, presented after the grace replaced it, ends every session
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor refreshes the session but the answer is lost
    Then the response status is 200
    When 10 seconds pass
    And the donor refreshes the session
    Then the response status is 200
    When the donor refreshes the session with the refresh cookie of the lost answer
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"
    When the donor refreshes the session
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

  Scenario: A refresh repeated 60 seconds after its lost answer ends every session
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor refreshes the session but the answer is lost
    Then the response status is 200
    When 60 seconds pass
    And the donor refreshes the session
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"
    When the donor refreshes the session with the refresh cookie of the lost answer
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

  Scenario: A refresh repeated after the next refresh token was used ends every session
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor keeps the refresh cookie aside
    When the donor refreshes the session
    Then the response status is 200
    When the donor refreshes the session
    Then the response status is 200
    When the donor refreshes the session with the kept refresh cookie
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"
    When the donor refreshes the session
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

  Scenario: Signing out ends the session
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor signs out
    Then the response status is 204
    And the refresh cookie is cleared
    When the donor refreshes the session with the previous refresh cookie
    Then the response status is 401

  Scenario: Signing out after a refresh whose answer was lost ends the session within 60 seconds too
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor refreshes the session but the answer is lost
    Then the response status is 200
    When the donor signs out
    Then the response status is 204
    When 10 seconds pass
    And the donor refreshes the session with the refresh cookie of the lost answer
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"
    When the donor refreshes the session with the previous refresh cookie
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

  Scenario: Signing out with the refresh cookie the grace replaced ends every session
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor keeps the refresh cookie aside
    When the donor refreshes the session
    Then the response status is 200
    When 10 seconds pass
    And the donor refreshes the session with the kept refresh cookie
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    When the donor signs out with the refresh cookie the grace replaced
    Then the response status is 204
    When the donor refreshes the session
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

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

  Scenario: A name of only spaces is refused at the name field and the profile keeps its name
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the signed-in donor sends PATCH "/api/donors/me" as "application/json" with the body '{"name": "   "}'
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem's error for field "name" says "Vyplňte prosím jméno nebo název firmy."
    And the donor profile shows type "PERSON", name "Jana Nováková" and email "jana@example.cz"

  Scenario: The donor cannot change the name or the address to one no receipt can print
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor updates the profile
      | name       | Jana 中 Svobodová |
      | street     | Krátká 3          |
      | city       | Most              |
      | postalCode | 434 01            |
    Then the response status is 400
    And the problem lists an error for field "name"
    When the donor updates the profile
      | name       | Jana Svobodová |
      | street     | Krátká ☃ 3     |
      | city       | Most           |
      | postalCode | 434 01         |
    Then the response status is 400
    And the problem lists an error for field "address.street"
    And the donor profile shows type "PERSON", name "Jana Nováková" and email "jana@example.cz"

  Scenario: The eleventh sign-in within 15 minutes from one address is refused, even with the right password
    Given 10 sign-in attempts were made with email "jana@example.cz" and password "wrong horse battery"
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    And the problem has the title "Příliš mnoho požadavků"
    When the following requests come from another client address
    And the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200

  Scenario: Addresses in one IPv6 /64 share the sign-in window, and the neighbouring /64 has its own
    Given the following requests come from the client address "2001:db8:5:7::1"
    And 10 sign-in attempts were made with email "jana@example.cz" and password "wrong horse battery"
    When the following requests come from the client address "2001:db8:5:7:abcd:ef01:2345:6789"
    And the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    When the following requests come from the client address "2001:db8:5:8::1"
    And the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200

  Scenario: Successful and unknown sign-ins count too, and the address may sign in again 15 minutes after its first attempt
    Given 5 sign-in attempts were made with email "jana@example.cz" and password "correct horse battery"
    And 5 sign-in attempts were made with email "nobody@example.cz" and password "correct horse battery"
    When 14 minutes pass
    And the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 429
    When 60 seconds pass
    And the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200

  Scenario: A long password with Czech letters signs in
    Given a person registered with email "petr@example.cz" and password "Příliš žluťoučký kůň úpěl ďábelské ódy, a pak ještě jednou, prosím"
    When the donor signs in with email "petr@example.cz" and password "Příliš žluťoučký kůň úpěl ďábelské ódy, a pak ještě jednou, prosím"
    Then the response status is 200
    And the response carries an access token and a refresh cookie

  Scenario: A long password is checked beyond its first 72 bytes
    Given a person registered with email "petr@example.cz" and password "Příliš žluťoučký kůň úpěl ďábelské ódy, a pak ještě jednou, prosím"
    When the donor signs in with email "petr@example.cz" and password "Příliš žluťoučký kůň úpěl ďábelské ódy, a pak ještě jednou, děkuji"
    Then the response status is 401
    And the problem type ends with "auth/invalid-credentials"
