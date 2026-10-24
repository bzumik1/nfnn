@content
Feature: Photos that no news article or project shows are deleted a week after their upload

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: The cleanup deletes a photo left unused for over a week and keeps the photos in use and a recent one
    Given "Jana" uploads a 800 by 500 pixel PNG image named "nepouzita.png"
    And "Jana" uploads a 800 by 500 pixel PNG image named "zahrada.png"
    And "Jana" creates a news article:
      | title      | Zahrada pro děti |
      | perex      | Stavíme zahradu. |
      | body       | Text o zahradě.  |
      | coverImage | {uploaded}       |
    And 8 days pass
    And "Jana" uploads a 800 by 500 pixel PNG image named "cerstva.png"
    When the cleanup of unused photos runs
    And someone without a token asks for the image uploaded as "nepouzita.png"
    Then the response status is 404
    When someone without a token asks for the image uploaded as "zahrada.png"
    Then the response status is 200
    When someone without a token asks for the image uploaded as "cerstva.png"
    Then the response status is 200

  Scenario: A photo a project still shows stays when a news article with the same photo lets it go
    Given "Jana" uploads a 800 by 500 pixel PNG image named "dominik.png"
    And "Jana" creates a news article:
      | title      | Dominik má vozík |
      | perex      | Krátce.          |
      | body       | Text.            |
      | coverImage | {uploaded}       |
    And "Jana" creates a project:
      | title      | Dominik, 7 let |
      | year       | 2024           |
      | perex      | Krátce.        |
      | body       | Text.          |
      | coverImage | {uploaded}     |
    When "Jana" changes the news article "dominik-ma-vozik":
      | title | Dominik má vozík |
      | perex | Krátce.          |
      | body  | Text bez fotky.  |
    Then the response status is 200
    When "Jana" deletes the news article "dominik-ma-vozik"
    Then the response status is 204
    When someone without a token asks for the image uploaded as "dominik.png"
    Then the response status is 200
    When 8 days pass
    And the cleanup of unused photos runs
    And someone without a token asks for the image uploaded as "dominik.png"
    Then the response status is 200
