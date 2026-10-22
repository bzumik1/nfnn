Feature: Donor protects the account with a second factor from an authenticator app

  Background:
    Given a person registered with email "jana@example.cz" and password "correct horse battery"

  Scenario: Setting up the authenticator and confirming its first code turns the second factor on and ends the other sessions
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor starts the second factor set-up with password "correct horse battery"
    Then the response status is 200
    And the set-up answers with a secret, an otpauth link for "jana@example.cz" issued by "Nová naděje" and a QR code of that link
    And the donor profile shows roles "DONOR" and the second factor off
    When the donor confirms the second factor with the current code
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows roles "DONOR" and the second factor on
    When the donor refreshes the session with the previous refresh cookie
    Then the response status is 401
    When the donor refreshes the session
    Then the response status is 200

  Scenario: With the second factor on, the password alone opens no session and the code from the app completes the sign-in
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor turned the second factor on with password "correct horse battery"
    And 30 seconds pass
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 401
    And the problem type ends with "auth/second-factor-required"
    And the problem has the title "Zadejte kód z aplikace"
    And the donor is asked for the code with a challenge that expires in 5 minutes
    And no refresh cookie is set
    When the donor completes the sign-in with the current code
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows roles "DONOR" and the second factor on

  Scenario: A wrong code is refused, a right code works once per challenge and a code is never accepted twice
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor turned the second factor on with password "correct horse battery"
    And 30 seconds pass
    And the donor signed in with email "jana@example.cz" and password "correct horse battery" up to the code
    When the donor completes the sign-in with code "000000"
    Then the response status is 401
    And the problem type ends with "auth/invalid-second-factor-code"
    And the problem has the title "Nesprávný kód"
    When the donor completes the sign-in with the current code
    Then the response status is 200
    When the donor completes the sign-in with the current code
    Then the response status is 401
    And the problem type ends with "auth/invalid-second-factor-challenge"
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery" up to the code
    When the donor completes the sign-in with the current code
    Then the response status is 401
    And the problem type ends with "auth/invalid-second-factor-code"
    When 30 seconds pass
    And the donor completes the sign-in with the current code
    Then the response status is 200

  Scenario: Five wrong codes spend the challenge and a challenge expires after five minutes
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor turned the second factor on with password "correct horse battery"
    And 30 seconds pass
    And the donor signed in with email "jana@example.cz" and password "correct horse battery" up to the code
    And the donor completed the sign-in with code "000000" 5 times
    When the donor completes the sign-in with the current code
    Then the response status is 401
    And the problem type ends with "auth/invalid-second-factor-challenge"
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery" up to the code
    When 5 minutes pass
    And the donor completes the sign-in with the current code
    Then the response status is 401
    And the problem type ends with "auth/invalid-second-factor-challenge"

  Scenario: The eleventh code within 15 minutes from one address is refused before it is checked
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor turned the second factor on with password "correct horse battery"
    And 30 seconds pass
    And the donor signed in with email "jana@example.cz" and password "correct horse battery" up to the code
    And the donor completed the sign-in with code "000000" 10 times
    When the donor completes the sign-in with the current code
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    When the following requests come from another client address
    And the donor signed in with email "jana@example.cz" and password "correct horse battery" up to the code
    And the donor completes the sign-in with the current code
    Then the response status is 200

  Scenario: An administrator holds the administrator role only in a session opened with the code, and keeps it across refreshes
    Given the donor with email "jana@example.cz" is given the administrator role
    And the donor signed in with email "jana@example.cz" and password "correct horse battery"
    Then the donor profile shows roles "DONOR" and the second factor off
    And the donor profile says the second factor is needed for administration
    When the donor turned the second factor on with password "correct horse battery"
    Then the donor profile shows roles "DONOR, ADMIN" and the second factor on
    And the donor profile says the second factor is not needed for administration
    When 30 seconds pass
    And the donor signed in with email "jana@example.cz" and password "correct horse battery" up to the code
    And the donor completes the sign-in with the current code
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows roles "DONOR, ADMIN" and the second factor on
    When the donor refreshes the session
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows roles "DONOR, ADMIN" and the second factor on

  Scenario: Turning the second factor off needs the password and a fresh code, ends the other sessions and the password alone signs in again
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor turned the second factor on with password "correct horse battery"
    And the donor signed in with email "jana@example.cz" and password "correct horse battery" up to the code
    And 30 seconds pass
    And the donor completes the sign-in with the current code
    And the response carries an access token and a refresh cookie
    When the donor turns the second factor off with password "wrong horse battery" and the current code
    Then the response status is 400
    And the problem type ends with "donors/wrong-password"
    When the donor turns the second factor off with password "correct horse battery" and code "000000"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"
    And the problem has the title "Nesprávný kód"
    When the donor turns the second factor off with password "correct horse battery" and the current code
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"
    When 30 seconds pass
    And the donor turns the second factor off with password "correct horse battery" and the current code
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows roles "DONOR" and the second factor off
    When the donor refreshes the session with the previous refresh cookie
    Then the response status is 401
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200

  Scenario: The set-up and its confirmation refuse what does not fit
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    When the donor confirms the second factor with code "000000"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-not-pending"
    When the donor turns the second factor off with password "correct horse battery" and code "000000"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-not-enabled"
    When the donor starts the second factor set-up with password "wrong horse battery"
    Then the response status is 400
    And the problem type ends with "donors/wrong-password"
    When the donor starts the second factor set-up with password "correct horse battery"
    Then the response status is 200
    When the donor confirms the second factor with code "000000"
    Then the response status is 400
    And the problem type ends with "donors/second-factor-code-rejected"
    When the donor confirms the second factor with code "12345"
    Then the response status is 400
    And the problem lists an error for field "code"
    When the donor confirms the second factor with the current code
    Then the response status is 200
    When the donor starts the second factor set-up with password "correct horse battery"
    Then the response status is 409
    And the problem type ends with "donors/second-factor-already-enabled"

  Scenario: Without a session the second factor cannot be set up, confirmed or turned off
    Given nobody is signed in
    When the donor starts the second factor set-up with password "correct horse battery"
    Then the response status is 401
    When the donor confirms the second factor with code "000000"
    Then the response status is 401
    When the donor turns the second factor off with password "correct horse battery" and code "000000"
    Then the response status is 401

  Scenario: The eleventh second-factor change within 15 minutes from one address is refused, even with the right password
    Given the donor signed in with email "jana@example.cz" and password "correct horse battery"
    And the donor started the second factor set-up with password "wrong horse battery" 10 times
    When the donor starts the second factor set-up with password "correct horse battery"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    When the following requests come from another client address
    And the donor starts the second factor set-up with password "correct horse battery"
    Then the response status is 200
