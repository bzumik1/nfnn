@content
Feature: The home page reads the newest news and the published projects in one request

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: The home content carries the three newest news articles and the three newest published projects, newest year first
    Given "Jana" has published 4 news articles titled "Aktualita" from 2026-09-01 on
    And "Jana" creates a project:
      | title | Tomáš, 9 let |
      | year  | 2023         |
      | perex | Perex.       |
      | body  | Text.        |
    And "Jana" publishes the project "tomas-9-let" on 2026-10-01
    And "Jana" creates a project:
      | title | Dominik, 7 let |
      | year  | 2024           |
      | perex | Perex.         |
      | body  | Text.          |
    And "Jana" publishes the project "dominik-7-let" on 2026-09-01
    And "Jana" creates a project:
      | title | Anička, 5 let |
      | year  | 2022          |
      | perex | Perex.        |
      | body  | Text.         |
    And "Jana" publishes the project "anicka-5-let" on 2026-08-01
    And "Jana" creates a project:
      | title | Martin, 11 let |
      | year  | 2021           |
      | perex | Perex.         |
      | body  | Text.          |
    And "Jana" publishes the project "martin-11-let" on 2026-07-01
    And "Jana" creates a project:
      | title | Eliška, 6 let |
      | year  | 2025          |
      | perex | Perex.        |
      | body  | Text.         |
    When someone without a token asks for the home content
    Then the response status is 200
    And the home news titles are:
      | Aktualita 4 |
      | Aktualita 3 |
      | Aktualita 2 |
    And the home project titles are:
      | Dominik, 7 let |
      | Tomáš, 9 let   |
      | Anička, 5 let  |

  Scenario: A news article published with a future date is left out until that day
    Given "Jana" creates a news article:
      | title | Zítřejší zpráva |
      | perex | Perex.          |
      | body  | Text.           |
    And "Jana" publishes the news article "zitrejsi-zprava" on 2026-10-24
    When someone without a token asks for the home content
    Then the response status is 200
    And the home content has 0 news articles and 0 projects
    Given today is 2026-10-24
    When someone without a token asks for the home content
    Then the home content has 1 news articles and 0 projects
