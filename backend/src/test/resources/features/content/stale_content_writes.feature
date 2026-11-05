@content
Feature: The administration refuses a change to a news article or a project made from a version that changed meanwhile

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And a person "Eva" is registered
    And "Jana" is an administrator
    And "Eva" is an administrator
    And "Jana" creates a news article:
      | title | Zahrada pro děti |
      | perex | Perex.           |
      | body  | Text.            |
    And "Jana" creates a project:
      | title | Dominik, 7 let |
      | year  | 2024           |
      | perex | Perex.         |
      | body  | Text.          |

  Scenario Outline: Of two changes made from one version, the second waits at the row and is refused as changed meanwhile with what holds now [<first>, then <second>]
    When these writes start one after another from the versions read before them, while the row of the <kind> <slug> is held:
      | who  | write    |
      | Jana | <first>  |
      | Eva  | <second> |
    Then write 1 answers 200
    And write 2 is refused as "content/changed-meanwhile" with the version now stored and the current record

    Examples:
      | kind         | slug             | first                                                              | second                                                     |
      | news article | zahrada-pro-deti | changes the news article zahrada-pro-deti to the title Zahrada I   | changes the news article zahrada-pro-deti to the title Zahrada II |
      | news article | zahrada-pro-deti | changes the news article zahrada-pro-deti to the title Zahrada I   | publishes the news article zahrada-pro-deti on 2026-10-23  |
      | news article | zahrada-pro-deti | publishes the news article zahrada-pro-deti on 2026-10-23          | withdraws the news article zahrada-pro-deti                |
      | news article | zahrada-pro-deti | changes the news article zahrada-pro-deti to the title Zahrada I   | deletes the news article zahrada-pro-deti                  |
      | project      | dominik-7-let    | changes the project dominik-7-let to the title Dominik I           | changes the project dominik-7-let to the title Dominik II  |
      | project      | dominik-7-let    | changes the project dominik-7-let to the title Dominik I           | publishes the project dominik-7-let on 2026-10-23          |
      | project      | dominik-7-let    | publishes the project dominik-7-let on 2026-10-23                  | withdraws the project dominik-7-let                        |
      | project      | dominik-7-let    | changes the project dominik-7-let to the title Dominik I           | deletes the project dominik-7-let                          |

  Scenario: An administrator who saves an edit of an article another administrator changed since they opened it is told so, and can then save theirs in its place
    Given "Jana" reads the news article "zahrada-pro-deti"
    And "Eva" changes the news article "zahrada-pro-deti":
      | title | Zahrada pro děti, druhý díl |
      | slug  | zahrada-pro-deti            |
      | perex | Perex.                      |
      | body  | Text.                       |
    When "Jana" changes the news article "zahrada-pro-deti" to the title "Zahrada pro děti i dospělé" from the version read before
    Then the response status is 409
    And the problem type ends with "content/changed-meanwhile"
    When "Jana" asks for the news article "zahrada-pro-deti"
    Then the news article says:
      | title | Zahrada pro děti, druhý díl |
    When "Jana" changes the news article "zahrada-pro-deti" to the title "Zahrada pro děti i dospělé" from the version read before
    Then the response status is 409
    When "Jana" changes the news article "zahrada-pro-deti" to the title "Zahrada pro děti i dospělé" from the version in the refusal
    Then the response status is 200

  Scenario: A change from a browser that names no version is refused before anything changes
    Given "Jana" publishes the news article "zahrada-pro-deti" on 2026-10-20
    When "Jana" withdraws the news article "zahrada-pro-deti" naming no version
    Then the response status is 428
    And the problem type ends with "shared/version-required"
    When someone without a token asks for the news articles
    Then the news list titles are:
      | Zahrada pro děti |
