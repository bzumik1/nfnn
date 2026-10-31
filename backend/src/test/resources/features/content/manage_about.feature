@content
Feature: An administrator shows a photo in the About section of the home page and removes it at any time

  The photo of the About section shows a child, so it never goes into the public repository:
  an administrator uploads it, it lives in the database like the photos of the news, and
  removing it deletes it from the site (Jakub 2026-10-30).

  Background:
    Given today is 2026-10-30
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Without a photo the About section has none, so the home page keeps its placeholder
    When "Jana" asks for the About section
    Then the response status is 200
    And the About section has no photo
    When someone without a token asks for the home content
    Then the response status is 200
    And the home About section has no photo

  Scenario: The photo an administrator sets shows on the home page with its description, its caption and its original size
    Given "Jana" uploads a 600 by 800 pixel PNG image named "zakladatele.png"
    When "Jana" sets the About photo:
      | photo   | {uploaded}                           |
      | alt     | Malý chlapec v náručí dvou dospělých |
      | caption | Kde to všechno začalo                |
    Then the response status is 200
    And the About section says:
      | photo.id      | {uploaded}                           |
      | photo.url     | /api/content/media/{uploaded}        |
      | photo.width   | 600                                  |
      | photo.height  | 800                                  |
      | photo.alt     | Malý chlapec v náručí dvou dospělých |
      | photo.caption | Kde to všechno začalo                |
    And the admin action "CHANGE_ABOUT_PHOTO" by "Jana" on the image uploaded as "zakladatele.png" is recorded with details containing "nastavena"
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action             | summary                        |
      | CHANGE_ABOUT_PHOTO | Nastavena fotka v sekci O nás. |
    When someone without a token asks for the home content
    Then the response status is 200
    And the home About section says:
      | photo.id      | {uploaded}                           |
      | photo.width   | 600                                  |
      | photo.height  | 800                                  |
      | photo.alt     | Malý chlapec v náručí dvou dospělých |
      | photo.caption | Kde to všechno začalo                |
    When "Jana" asks for the About section
    Then the About section says:
      | photo.id | {uploaded} |

  Scenario: The description and the caption are optional
    Given "Jana" uploads a 800 by 600 pixel PNG image named "zahrada.png"
    When "Jana" sets the About photo:
      | photo   | {uploaded} |
      | alt     |            |
      | caption |            |
    Then the response status is 200
    And the About section says:
      | photo.width   | 800 |
      | photo.alt     |     |
      | photo.caption |     |

  Scenario: Replacing the photo deletes the old one, and changing only its texts keeps it
    Given "Jana" uploads a 600 by 800 pixel PNG image named "prvni.png"
    And "Jana" sets the About photo:
      | photo   | {uploaded} |
      | caption | První      |
    And "Jana" uploads a 800 by 600 pixel PNG image named "druha.png"
    When "Jana" sets the About photo:
      | photo   | {uploaded} |
      | caption | Druhá      |
    Then the response status is 200
    And the About section says:
      | photo.width   | 800   |
      | photo.caption | Druhá |
    And the admin action "CHANGE_ABOUT_PHOTO" by "Jana" on the image uploaded as "druha.png" is recorded with details containing "nastavena"
    When someone without a token asks for the image uploaded as "prvni.png"
    Then the response status is 404
    When "Jana" sets the About photo:
      | photo   | {uploaded}         |
      | alt     | Dvě děti na zahradě |
      | caption | Jiný popisek       |
    Then the response status is 200
    And the About section says:
      | photo.alt     | Dvě děti na zahradě |
      | photo.caption | Jiný popisek        |
    And the admin action "CHANGE_ABOUT_PHOTO" by "Jana" on the image uploaded as "druha.png" is recorded with details containing "upravena"
    When someone without a token asks for the image uploaded as "druha.png"
    Then the response status is 200

  Scenario: Removing the photo takes it off the home page and deletes it, and removing it again changes nothing
    Given "Jana" uploads a 600 by 800 pixel PNG image named "zakladatele.png"
    And "Jana" sets the About photo:
      | photo   | {uploaded}            |
      | caption | Kde to všechno začalo |
    When "Jana" removes the About photo
    Then the response status is 200
    And the About section has no photo
    When someone without a token asks for the home content
    Then the home About section has no photo
    When someone without a token asks for the image uploaded as "zakladatele.png"
    Then the response status is 404
    When "Jana" removes the About photo
    Then the response status is 200
    And the About section has no photo
    And the admin action "REMOVE_ABOUT_PHOTO" by "Jana" on the image uploaded as "zakladatele.png" is recorded with details containing "odebrána"

  Scenario: The photo the About section shows survives a news article that lets it go and the cleanup of unused photos
    Given "Jana" uploads a 600 by 800 pixel PNG image named "zakladatele.png"
    And "Jana" creates a news article:
      | title      | Patnáct let |
      | perex      | Krátce.     |
      | body       | Text.       |
      | coverImage | {uploaded}  |
    And "Jana" sets the About photo:
      | photo | {uploaded} |
    When "Jana" deletes the news article "patnact-let"
    Then the response status is 204
    When someone without a token asks for the image uploaded as "zakladatele.png"
    Then the response status is 200
    When 8 days pass
    And the cleanup of unused photos runs
    And someone without a token asks for the image uploaded as "zakladatele.png"
    Then the response status is 200
    When "Jana" removes the About photo
    And someone without a token asks for the image uploaded as "zakladatele.png"
    Then the response status is 404

  Scenario: Too long texts and an unknown photo are refused
    Given "Jana" uploads a 600 by 800 pixel PNG image named "zakladatele.png"
    When "Jana" sets the About photo:
      | photo | {uploaded}                                                                                                                                                                                                 |
      | alt   | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
    Then the response status is 400
    And the problem lists an error for field "photoAlt"
    When "Jana" sets the About photo:
      | photo   | {uploaded}                                                                                                                                                                                                 |
      | caption | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
    Then the response status is 400
    And the problem lists an error for field "caption"
    When "Jana" sets the About photo:
      | photo | 0199f3e0-0000-7000-8000-000000000000 |
    Then the response status is 404
    And the problem type ends with "content/media-not-found"
    When "Jana" asks for the About section
    Then the About section has no photo

  Scenario: A donor without the administrator role and a visitor without a token cannot manage the About section
    Given a person "Petr" is registered
    When "Petr" asks for the About section
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" removes the About photo
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token removes the About photo
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: A connected application with the writing permission sets and removes the photo, and the audit trail names it
    Given "Jana" uploads a 600 by 800 pixel PNG image named "zakladatele.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sets the About photo:
      | photo   | {uploaded}            |
      | caption | Kde to všechno začalo |
    Then the response status is 200
    When the exchanged API token removes the About photo
    Then the response status is 200
    When "Jana" asks for the admin actions
    Then the admin actions came through these applications:
      | action             | client    |
      | REMOVE_ABOUT_PHOTO | claude.ai |
      | CHANGE_ABOUT_PHOTO | claude.ai |

  Scenario: A connected application with the reading permission only reads the About section but cannot change it
    Given "Jana" uploads a 600 by 800 pixel PNG image named "zakladatele.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the connector token for an API token
    And the exchanged API token asks for the About section
    Then the response status is 200
    When the exchanged API token sets the About photo:
      | photo | {uploaded} |
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
