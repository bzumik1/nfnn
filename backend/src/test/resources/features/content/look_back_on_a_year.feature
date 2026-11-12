@content
Feature: An administrator links a news article to the year it looks back on

  An article such as "Ohlédnutí za rokem 2025" names the year it looks back on, so the Pomáháme
  tab can lead from that year's projects to it (v3 slice 2.23a). At most one article looks back
  on a year. The year is set on its own, never by the full edit of an article, so a browser tab
  opened before the year existed cannot clear it by saving the texts.

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered
    And "Jana" is an administrator
    And "Jana" creates a news article:
      | title | Ohlédnutí za rokem 2025 |
      | perex | Co se nám povedlo.      |
      | body  | Text.                   |

  Scenario: A new article looks back on no year, and the year an administrator sets shows in the administration, on the site and on the home page
    Then the news article says:
      | lookBackYear |  |
    When "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025
    Then the response status is 200
    And the news article says:
      | slug         | ohlednuti-za-rokem-2025 |
      | lookBackYear | 2025                    |
    And the admin action "CHANGE_NEWS_LOOK_BACK_YEAR" by "Jana" on the news article "ohlednuti-za-rokem-2025" is recorded with details containing "se ohlíží za rokem 2025"
    When "Jana" asks for the admin actions
    Then the admin actions are, in any order of those performed at the same moment:
      | action                     | summary                                                    |
      | CHANGE_NEWS_LOOK_BACK_YEAR | Aktualita „Ohlédnutí za rokem 2025“ se ohlíží za rokem 2025. |
      | CREATE_NEWS                | Napsána aktualita „Ohlédnutí za rokem 2025“.               |
    When "Jana" asks for the news article "ohlednuti-za-rokem-2025"
    Then the news article says:
      | lookBackYear | 2025 |
    Given "Jana" publishes the news article "ohlednuti-za-rokem-2025" on 2026-11-01
    When someone without a token asks for the news article "ohlednuti-za-rokem-2025"
    Then the response status is 200
    And the news article says:
      | lookBackYear | 2025 |
    When someone without a token asks for the news articles
    Then the news list says:
      | items.0.lookBackYear | 2025 |
    When someone without a token asks for the home content
    Then the news list says:
      | news.0.lookBackYear | 2025 |

  Scenario: Editing the texts of an article keeps its year, setting the same year again changes nothing, and removing it leaves the article without one
    Given "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025
    When "Jana" changes the news article "ohlednuti-za-rokem-2025":
      | title | Ohlédnutí za rokem 2025 |
      | slug  | ohlednuti-za-rokem-2025 |
      | perex | Co se nám povedlo víc.  |
      | body  | Text.                   |
    Then the response status is 200
    And the news article says:
      | perex        | Co se nám povedlo víc. |
      | lookBackYear | 2025                   |
    When "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025
    Then the response status is 200
    And the admin action "CHANGE_NEWS_LOOK_BACK_YEAR" by "Jana" on the news article "ohlednuti-za-rokem-2025" is recorded with details containing "se ohlíží za rokem 2025"
    When "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on no year
    Then the response status is 200
    And the news article says:
      | lookBackYear |  |
    When "Jana" asks for the admin actions
    Then the admin actions are, in any order of those performed at the same moment:
      | action                     | summary                                                          |
      | CHANGE_NEWS_LOOK_BACK_YEAR | Aktualita „Ohlédnutí za rokem 2025“ se už neohlíží za žádným rokem. |
      | UPDATE_NEWS                | Upravena aktualita „Ohlédnutí za rokem 2025“.                    |
      | CHANGE_NEWS_LOOK_BACK_YEAR | Aktualita „Ohlédnutí za rokem 2025“ se ohlíží za rokem 2025.       |
      | CREATE_NEWS                | Napsána aktualita „Ohlédnutí za rokem 2025“.                     |

  Scenario: A year another article looks back on is refused, at a new article too, until that article lets it go
    Given "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025
    And "Jana" creates a news article:
      | title | Rok 2025 jinak |
      | perex | Perex.         |
      | body  | Text.          |
    When "Jana" sets the news article "rok-2025-jinak" to look back on the year 2025
    Then the response status is 409
    And the problem type ends with "content/look-back-year-taken"
    When "Jana" creates a news article:
      | title        | Ještě jednou 2025 |
      | perex        | Perex.            |
      | body         | Text.             |
      | lookBackYear | 2025              |
    Then the response status is 409
    And the problem type ends with "content/look-back-year-taken"
    When "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on no year
    And "Jana" sets the news article "rok-2025-jinak" to look back on the year 2025
    Then the response status is 200
    And the news article says:
      | lookBackYear | 2025 |

  Scenario: A new article may name the year it looks back on when it is written
    When "Jana" creates a news article:
      | title        | Ohlédnutí za rokem 2024 |
      | perex        | Perex.                  |
      | body         | Text.                   |
      | lookBackYear | 2024                    |
    Then the response status is 201
    And the news article says:
      | lookBackYear | 2024 |
    And the admin action "CHANGE_NEWS_LOOK_BACK_YEAR" by "Jana" on the news article "ohlednuti-za-rokem-2024" is recorded with details containing "se ohlíží za rokem 2024"

  Scenario Outline: A year before 2005 or after 2100 is refused [<year>]
    When "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on the year <year>
    Then the response status is 400
    And the problem lists an error for field "year"
    When "Jana" creates a news article:
      | title        | Mimo rozsah |
      | perex        | Perex.      |
      | body         | Text.       |
      | lookBackYear | <year>      |
    Then the response status is 400
    And the problem lists an error for field "lookBackYear"

    Examples:
      | year |
      | 2004 |
      | 2101 |

  Scenario: Setting the year from a version another administrator changed since is refused, and a browser that names no version is refused before anything changes
    Given a person "Eva" is registered
    And "Eva" is an administrator
    And "Jana" reads the news article "ohlednuti-za-rokem-2025"
    And "Eva" changes the news article "ohlednuti-za-rokem-2025":
      | title | Ohlédnutí za rokem 2025 |
      | slug  | ohlednuti-za-rokem-2025 |
      | perex | Jiný perex.             |
      | body  | Text.                   |
    When "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025 from the version read before
    Then the response status is 409
    And the problem type ends with "content/changed-meanwhile"
    When "Jana" sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025 naming no version
    Then the response status is 428
    And the problem type ends with "shared/version-required"
    When "Jana" asks for the news article "ohlednuti-za-rokem-2025"
    Then the news article says:
      | lookBackYear |  |

  Scenario: A donor without the administrator role and a visitor without a token cannot set the year
    Given a person "Petr" is registered
    When "Petr" sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: A connected application with the writing permission sets the year and writes an article with one, and the audit trail names it
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025
    Then the response status is 200
    And the news article says:
      | lookBackYear | 2025 |
    When the exchanged API token creates a news article:
      | title        | Ohlédnutí za rokem 2024 |
      | perex        | Perex.                  |
      | body         | Text.                   |
      | lookBackYear | 2024                    |
    Then the response status is 201
    When "Jana" asks for the admin actions
    Then the admin actions came through these applications:
      | action                     | client    |
      | CHANGE_NEWS_LOOK_BACK_YEAR | claude.ai |
      | CREATE_NEWS                | claude.ai |
      | CHANGE_NEWS_LOOK_BACK_YEAR | claude.ai |
      | CREATE_NEWS                |           |

  Scenario: A connected application with the reading permission only cannot set the year
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sets the news article "ohlednuti-za-rokem-2025" to look back on the year 2025
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
