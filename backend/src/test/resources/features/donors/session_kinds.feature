@donors
Feature: A sign-in lasts as long as its kind of session

  Every sign-in names its kind of session (plan v3 2.10, decision D27): the installed app
  stays signed in for 400 days from its last use; "Zapamatovat si mě" keeps a browser signed
  in for the days of SESSION_REMEMBER_DAYS (14 by default) from its last use; a plain browser
  sign-in keeps its cookie only until the browser closes and ends after 12 hours unused; a
  public computer keeps it only until the browser closes, ends after an hour unused and at
  the latest 12 hours after the sign-in. A sign-in that names no kind is remembered, as
  before. The installed app keeps its refresh token in a cookie of its own and names it on
  refresh and sign-out, so a browser tab sharing its cookies never takes over its session.
  An administrator who signed in with the second factor keeps the administration for the
  whole session (Jakub 2026-11-05, Q1).

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered

  Scenario: The installed app stays signed in 400 days from its last use
    When "Jana" signs in in the installed app
    Then the response status is 200
    And the answer names the session "APP"
    And the refresh cookie "refresh_token_app" lasts 400 days
    When 399 days pass
    And the app refreshes its session
    Then the response status is 200
    And the refresh cookie "refresh_token_app" lasts 400 days
    When 400 days pass
    And 1 minute passes
    And the app refreshes its session
    Then the response status is 401

  Scenario: A remembered sign-in lasts 14 days from its last use, to the minute
    When "Jana" signs in and is remembered
    Then the answer names the session "REMEMBERED"
    And the refresh cookie "refresh_token" lasts 14 days
    When 13 days pass
    And 23 hours pass
    And 59 minutes pass
    And the browser refreshes its session
    Then the response status is 200
    When 14 days pass
    And 1 minute passes
    And the browser refreshes its session
    Then the response status is 401

  Scenario: A sign-in that names no kind of session is remembered
    When "Jana" signs in without naming the kind of session
    Then the answer names the session "REMEMBERED"
    And the refresh cookie "refresh_token" lasts 14 days

  Scenario: A sign-in naming a kind of session the site does not know is refused
    When "Jana" signs in naming the kind of session "FOREVER"
    Then the response status is 400
    And the browser keeps the refresh cookies ""

  Scenario: A plain browser sign-in ends with the browser and after 12 hours unused
    When "Jana" signs in for this browser session
    Then the answer names the session "BROWSER"
    And the refresh cookie "refresh_token" ends with the browser
    When 11 hours pass
    And 59 minutes pass
    And the browser refreshes its session
    Then the response status is 200
    And the refresh cookie "refresh_token" ends with the browser
    When 12 hours pass
    And 1 minute passes
    And the browser refreshes its session
    Then the response status is 401

  Scenario: A public computer ends with the browser and after an hour unused
    When "Jana" signs in on a public computer
    Then the answer names the session "PUBLIC"
    And the refresh cookie "refresh_token" ends with the browser
    When 59 minutes pass
    And the browser refreshes its session
    Then the response status is 200
    When 1 hour passes
    And 1 minute passes
    And the browser refreshes its session
    Then the response status is 401

  Scenario: A public computer in use ends 12 hours after the sign-in
    When "Jana" signs in on a public computer
    And the browser refreshes its session every 55 minutes 13 times
    And 10 minutes pass
    And the browser refreshes its session
    Then the response status is 401

  Scenario: A browser tab signing in beside the installed app keeps both sessions apart
    When "Jana" signs in in the installed app
    And "Jana" signs in for this browser session
    Then the browser keeps the refresh cookies "refresh_token, refresh_token_app"
    When the app refreshes its session
    Then the response status is 200
    And the refresh cookie "refresh_token_app" lasts 400 days
    When the browser refreshes its session
    Then the response status is 200
    And the refresh cookie "refresh_token" ends with the browser
    When the browser signs out
    Then the response status is 204
    And the browser keeps the refresh cookies "refresh_token_app"
    When the app refreshes its session
    Then the response status is 200

  Scenario: The installed app signs out its own session and leaves the browser tab signed in
    When "Jana" signs in in the installed app
    And "Jana" signs in for this browser session
    And the app signs out
    Then the response status is 204
    And the browser keeps the refresh cookies "refresh_token"
    When the app presents the refresh token it signed out with
    Then the response status is 401
    When the browser refreshes its session
    Then the response status is 200

  Scenario: A refresh token presented in the other session's cookie is refused without ending any session
    When "Jana" signs in in the installed app
    And the browser presents the app's refresh token as its own
    Then the response status is 401
    When "Jana" signs in for this browser session
    And the app presents the browser's refresh token as its own
    Then the response status is 401
    When the app refreshes its session
    Then the response status is 200
    When the browser refreshes its session
    Then the response status is 200

  Scenario: An administrator who signs in with the second factor in the app keeps the administration after a refresh
    Given "Jana" is an administrator
    When "Jana" signs in in the installed app
    Then the response status is 200
    And the refresh cookie "refresh_token_app" lasts 400 days
    When 30 days pass
    And the app refreshes its session
    Then the response status is 200
    And the session opens the administration

  Scenario: A passkey sign-in on a public computer opens a public-computer session
    Given "Jana" added a passkey named "Telefon"
    When "Jana" signs in with the passkey "Telefon" on a public computer
    Then the response status is 200
    And the answer names the session "PUBLIC"
    And the refresh cookie "refresh_token" ends with the browser

  Scenario: The sign-in by the link from the confirmation e-mail opens a session for this browser
    When a person registers
      | name       | Petra Malá            |
      | street     | Krátká 3              |
      | city       | Most                  |
      | postalCode | 434 01                |
      | email      | petra@example.cz      |
      | password   | correct horse battery |
    And the donor confirms the e-mail with the link from the e-mail for this browser session
    Then the response status is 200
    And the answer names the session "BROWSER"
    And the refresh cookie "refresh_token" ends with the browser
