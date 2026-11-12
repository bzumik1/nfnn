@content
Feature: The administration refuses a change to the founders note or the line under the board made from a version that changed meanwhile

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And a person "Eva" is registered
    And "Jana" is an administrator
    And "Eva" is an administrator
    And "Jana" writes the founders note:
      """
      Děkujeme.
      """

  Scenario Outline: Of two changes of the people texts, the second waits at the lock and is refused only when the first changed the same text [<first>, then <second>]
    When these writes start one after another from the versions read before them, while the people texts lock is held:
      | who  | write    |
      | Jana | <first>  |
      | Eva  | <second> |
    Then write 1 answers 200
    And write 2 is refused as "content/changed-meanwhile" with the version now stored and the current record

    Examples:
      | first                                      | second                                     |
      | writes the founders note Děkujeme všem.    | writes the founders note Děkujeme vám.     |
      | writes the line under the board Díky.      | writes the line under the board Díky moc.  |

  Scenario: A change of the line under the board does not refuse a change of the founders note waiting behind it
    When these writes start one after another from the versions read before them, while the people texts lock is held:
      | who  | write                                   |
      | Jana | writes the line under the board Díky.   |
      | Eva  | writes the founders note Děkujeme vám.  |
    Then write 1 answers 200
    And write 2 answers 200

  Scenario: An administrator who saves the founders note another administrator changed since they opened it is told so, and can then save theirs in its place
    Given "Jana" reads the founders note
    And "Eva" writes the founders note "Děkujeme všem." from the version stored now
    When "Jana" writes the founders note "Děkujeme vám." from the version read before
    Then the response status is 409
    And the problem type ends with "content/changed-meanwhile"
    And the refusal names the version of the founders note now stored and its text "Děkujeme všem."
    When "Jana" writes the founders note "Děkujeme vám." from the version in the refusal
    Then the response status is 200
    And the answer names the version of the founders note now stored

  Scenario: An administrator who saves the line under the board another administrator wrote since they opened the page is told so
    Given "Jana" reads the line under the board
    And "Eva" writes the line under the board "Díky." from the version stored now
    When "Jana" writes the line under the board "Díky moc." from the version read before
    Then the response status is 409
    And the problem type ends with "content/changed-meanwhile"
    And the refusal names the version of the line under the board now stored and its text "Díky."

  Scenario: A change of a people text from a browser that names no version is refused before anything changes
    When "Jana" writes the founders note "Děkujeme vám." naming no version
    Then the response status is 428
    And the problem type ends with "shared/version-required"
    When "Jana" writes the line under the board "Díky." naming no version
    Then the response status is 428
    When "Jana" asks for the people of the foundation
    Then the founders note is:
      """
      Děkujeme.
      """
    And the line under the board is empty
