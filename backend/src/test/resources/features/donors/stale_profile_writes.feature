@donors
Feature: A donor's profile change made from a version that changed meanwhile is refused

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered

  Scenario: Of two profile changes made from one version, the second waits at the donor's row and is refused as changed meanwhile with what holds now
    When these profile changes of "Jana" start one after another from the version read before them, while the donor's row is held:
      | name       |
      | Jana Malá  |
      | Jana Velká |
    Then write 1 answers 200
    And write 2 is refused as "donors/changed-meanwhile" with the version now stored and the current record

  Scenario: A name saved in a tab opened before another tab changed the profile is refused with the stored profile, and can then be saved in its place
    Given "Jana" opens the profile in a tab
    And "Jana" saves the name "Jana Malá" in another tab
    When "Jana" saves the name "Jana Velká" from the version read in the tab
    Then the response status is 409
    And the problem type ends with "donors/changed-meanwhile"
    And the refusal names the profile version of "Jana" now stored and the stored name "Jana Malá"
    When "Jana" saves the name "Jana Velká" from the version in the refusal
    Then the response status is 200
    And the profile answers the name "Jana Velká" and the version of "Jana" now stored

  Scenario: A profile change that names no version is refused before anything changes
    When "Jana" saves the name "Jana Malá" naming no version
    Then the response status is 428
    And the problem type ends with "shared/version-required"
    And the stored name of "Jana" is "Jana Nováková"

  Scenario: A profile change without a token is refused even with the right version
    When someone without a token saves the name "Jana Malá" naming the version of "Jana"
    Then the response status is 401
    And the stored name of "Jana" is "Jana Nováková"
