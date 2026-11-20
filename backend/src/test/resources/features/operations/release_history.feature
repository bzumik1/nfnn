@operations
Feature: The administration keeps a year of the releases the server ran

  Background:
    Given today is 2026-11-20
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: The first start of the server begins its history
    Given the backend starts as revision "2b79cb3" of release "2026.11.109" at "2026-11-19T18:02:11Z"
    When "Jana" asks for the release history
    Then the response status is 200
    And the release history is:
      | release     | revision | startedAt            | lastStartedAt        | endedAt |
      | 2026.11.109 | 2b79cb3  | 2026-11-19T18:02:11Z | 2026-11-19T18:02:11Z |         |

  Scenario: A restart of the same release only moves its last start, and an image without a release number has none
    Given the backend starts as revision "2b79cb3" of release "2026.11.109" at "2026-11-19T18:02:11Z"
    And the backend starts as revision "2b79cb3" of release "2026.11.109" at "2026-11-20T07:40:03Z"
    And the backend starts as revision "dev" without a release at "2026-11-20T08:00:00Z"
    When "Jana" asks for the release history
    Then the release history is:
      | release     | revision | startedAt            | lastStartedAt        | endedAt              |
      |             | dev      | 2026-11-20T08:00:00Z | 2026-11-20T08:00:00Z |                      |
      | 2026.11.109 | 2b79cb3  | 2026-11-19T18:02:11Z | 2026-11-20T07:40:03Z | 2026-11-20T08:00:00Z |

  Scenario: A deploy ends the running release, and a rollback to it begins a run of its own
    Given the backend starts as revision "d953749" of release "2026.11.98" at "2026-11-12T16:30:00Z"
    And the backend starts as revision "2b79cb3" of release "2026.11.109" at "2026-11-19T18:02:11Z"
    And the backend starts as revision "d953749" of release "2026.11.98" at "2026-11-19T18:30:00Z"
    When "Jana" asks for the release history
    Then the release history is:
      | release     | revision | startedAt            | lastStartedAt        | endedAt              |
      | 2026.11.98  | d953749  | 2026-11-19T18:30:00Z | 2026-11-19T18:30:00Z |                      |
      | 2026.11.109 | 2b79cb3  | 2026-11-19T18:02:11Z | 2026-11-19T18:02:11Z | 2026-11-19T18:30:00Z |
      | 2026.11.98  | d953749  | 2026-11-12T16:30:00Z | 2026-11-12T16:30:00Z | 2026-11-19T18:02:11Z |

  Scenario: The clean-up deletes what ended more than a year ago and keeps the run of that moment and the newest
    Given the backend starts as revision "a1b2c3d" of release "2025.10.4" at "2025-10-01T08:00:00Z"
    And the backend starts as revision "d953749" of release "2025.11.2" at "2025-11-20T02:39:00Z"
    And the backend starts as revision "2b79cb3" of release "2025.11.3" at "2025-11-20T02:41:00Z"
    And the backend starts as revision "e4f5a6b" of release "2026.11.1" at "2026-11-01T08:00:00Z"
    When the release history clean-up runs at "2026-11-20T02:40:00Z"
    And "Jana" asks for the release history
    Then the release history is:
      | release   | revision | startedAt            | lastStartedAt        | endedAt              |
      | 2026.11.1 | e4f5a6b  | 2026-11-01T08:00:00Z | 2026-11-01T08:00:00Z |                      |
      | 2025.11.3 | 2b79cb3  | 2025-11-20T02:41:00Z | 2025-11-20T02:41:00Z | 2026-11-01T08:00:00Z |
      | 2025.11.2 | d953749  | 2025-11-20T02:39:00Z | 2025-11-20T02:39:00Z | 2025-11-20T02:41:00Z |
    When the release history clean-up runs at "2028-01-01T00:00:00Z"
    And "Jana" asks for the release history
    Then the release history is:
      | release   | revision | startedAt            | lastStartedAt        | endedAt |
      | 2026.11.1 | e4f5a6b  | 2026-11-01T08:00:00Z | 2026-11-01T08:00:00Z |         |

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    When "Petr" asks for the release history
    Then the response status is 403
    When someone without a token asks for the release history
    Then the response status is 401
