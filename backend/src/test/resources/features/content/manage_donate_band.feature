@content
Feature: An administrator shows a photo in the closing Přispět band and removes it at any time

  The band that ends the O nás, Pomáháme and Aktuality tabs asks the visitor to give and shows a
  photo beside its words (v3 slice 2.23a). Like the About photo it may show a child, so it never
  goes into the public repository: an administrator uploads it, it lives in the database, and
  removing it deletes it from the site. It is a content photo, so it takes a focal point.

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Without a photo the band has none, so the site keeps its own look
    When "Jana" asks for the donate band
    Then the response status is 200
    And the donate band has no photo
    When someone without a token asks for the home content
    Then the response status is 200
    And the home donate band has no photo

  Scenario: The photo an administrator sets shows on the home content with its description and its original size
    Given "Jana" uploads a 1600 by 900 pixel PNG image named "pruh.png"
    When "Jana" sets the donate band photo:
      | photo | {uploaded}          |
      | alt   | Děti u stolu kreslí |
    Then the response status is 200
    And the donate band says:
      | photo.id         | {uploaded}                    |
      | photo.url        | /api/content/media/{uploaded} |
      | photo.width      | 1600                          |
      | photo.height     | 900                           |
      | photo.alt        | Děti u stolu kreslí           |
      | photo.focalPoint |                               |
    And the admin action "CHANGE_DONATE_BAND_PHOTO" by "Jana" on the image uploaded as "pruh.png" is recorded with details containing "nastavena"
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action                   | summary                          |
      | CHANGE_DONATE_BAND_PHOTO | Nastavena fotka v pruhu Přispět. |
    When someone without a token asks for the home content
    Then the response status is 200
    And the home donate band says:
      | photo.id     | {uploaded}                    |
      | photo.url    | /api/content/media/{uploaded} |
      | photo.width  | 1600                          |
      | photo.height | 900                           |
      | photo.alt    | Děti u stolu kreslí           |
    When "Jana" asks for the donate band
    Then the donate band says:
      | photo.id | {uploaded} |

  Scenario: The band photo takes a focal point, which shows wherever the band is answered
    Given "Jana" uploads a 1600 by 900 pixel PNG image named "pruh.png"
    And "Jana" sets the donate band photo:
      | photo | {uploaded} |
    When "Jana" places the focal point of the image uploaded as "pruh.png" at 30 % from the left and 60 % from the top
    Then the response status is 200
    When "Jana" asks for the donate band
    Then the donate band says:
      | photo.focalPoint.x | 30 |
      | photo.focalPoint.y | 60 |
    When someone without a token asks for the home content
    Then the home donate band says:
      | photo.focalPoint.x | 30 |
      | photo.focalPoint.y | 60 |

  Scenario: Replacing the photo deletes the old one, and changing only its description keeps it
    Given "Jana" uploads a 1600 by 900 pixel PNG image named "prvni.png"
    And "Jana" sets the donate band photo:
      | photo | {uploaded} |
      | alt   | První      |
    And "Jana" uploads a 1200 by 800 pixel PNG image named "druha.png"
    When "Jana" sets the donate band photo:
      | photo | {uploaded} |
      | alt   | Druhá      |
    Then the response status is 200
    And the donate band says:
      | photo.width | 1200  |
      | photo.alt   | Druhá |
    And the admin action "CHANGE_DONATE_BAND_PHOTO" by "Jana" on the image uploaded as "druha.png" is recorded with details containing "nastavena"
    When someone without a token asks for the image uploaded as "prvni.png"
    Then the response status is 404
    When "Jana" sets the donate band photo:
      | photo | {uploaded}  |
      | alt   | Jiný popis  |
    Then the response status is 200
    And the donate band says:
      | photo.alt | Jiný popis |
    And the admin action "CHANGE_DONATE_BAND_PHOTO" by "Jana" on the image uploaded as "druha.png" is recorded with details containing "upravena"
    When someone without a token asks for the image uploaded as "druha.png"
    Then the response status is 200

  Scenario: Removing the photo takes it off the home content and deletes it, and removing it again changes nothing
    Given "Jana" uploads a 1600 by 900 pixel PNG image named "pruh.png"
    And "Jana" sets the donate band photo:
      | photo | {uploaded} |
    When "Jana" removes the donate band photo
    Then the response status is 200
    And the donate band has no photo
    When someone without a token asks for the home content
    Then the home donate band has no photo
    When someone without a token asks for the image uploaded as "pruh.png"
    Then the response status is 404
    When "Jana" removes the donate band photo
    Then the response status is 200
    And the donate band has no photo
    And the admin action "REMOVE_DONATE_BAND_PHOTO" by "Jana" on the image uploaded as "pruh.png" is recorded with details containing "odebrána"

  Scenario: The photo the band shows survives the About section letting it go and the cleanup of unused photos
    Given "Jana" uploads a 1600 by 900 pixel PNG image named "pruh.png"
    And "Jana" sets the About photo:
      | photo | {uploaded} |
    And "Jana" sets the donate band photo:
      | photo | {uploaded} |
    When "Jana" removes the About photo
    And someone without a token asks for the image uploaded as "pruh.png"
    Then the response status is 200
    When 8 days pass
    And the cleanup of unused photos runs
    And someone without a token asks for the image uploaded as "pruh.png"
    Then the response status is 200
    When "Jana" removes the donate band photo
    And someone without a token asks for the image uploaded as "pruh.png"
    Then the response status is 404

  Scenario: A too long description and an unknown photo are refused
    Given "Jana" uploads a 1600 by 900 pixel PNG image named "pruh.png"
    When "Jana" sets the donate band photo:
      | photo | {uploaded}                                                                                                                                                                                                 |
      | alt   | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
    Then the response status is 400
    And the problem lists an error for field "photoAlt"
    When "Jana" sets the donate band photo:
      | photo | 0199f3e0-0000-7000-8000-000000000000 |
    Then the response status is 404
    And the problem type ends with "content/media-not-found"
    When "Jana" asks for the donate band
    Then the donate band has no photo

  Scenario: A donor without the administrator role and a visitor without a token cannot manage the donate band
    Given a person "Petr" is registered
    When "Petr" asks for the donate band
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" removes the donate band photo
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token removes the donate band photo
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: A connected application with the writing permission sets and removes the photo, and the audit trail names it
    Given "Jana" uploads a 1600 by 900 pixel PNG image named "pruh.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sets the donate band photo:
      | photo | {uploaded}          |
      | alt   | Děti u stolu kreslí |
    Then the response status is 200
    When the exchanged API token removes the donate band photo
    Then the response status is 200
    When "Jana" asks for the admin actions
    Then the admin actions came through these applications:
      | action                   | client    |
      | REMOVE_DONATE_BAND_PHOTO | claude.ai |
      | CHANGE_DONATE_BAND_PHOTO | claude.ai |

  Scenario: A connected application with the reading permission only reads the donate band but cannot change it
    Given "Jana" uploads a 1600 by 900 pixel PNG image named "pruh.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the connector token for an API token
    And the exchanged API token asks for the donate band
    Then the response status is 200
    When the exchanged API token sets the donate band photo:
      | photo | {uploaded} |
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
