@content
Feature: An administrator marks on a photo the spot that must stay visible, and the site crops every shape around it

  The site crops one photo into several shapes (a card, the top of an article, later a wide band and a square).
  Without a focal point it crops each shape as it always did; with one, every shape keeps that spot in view
  (Jakub 2026-10-31). The point belongs to the photo itself, so every news article, project and the About
  section that show the photo crop it alike, and a replaced photo starts without one.

  Background:
    Given today is 2026-11-05
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: A photo without a focal point says so wherever the site shows it
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And "Jana" creates a news article:
      | title      | Zahrada pro děti |
      | perex      | Krátce.          |
      | body       | Text.            |
      | coverImage | {uploaded}       |
    And "Jana" publishes the news article "zahrada-pro-deti" on 2026-11-05
    When someone without a token asks for the news article "zahrada-pro-deti"
    Then the response status is 200
    And the news article says:
      | coverImage.id         | {uploaded} |
      | coverImage.focalPoint |            |

  Scenario: The focal point an administrator places shows on the news article, the project and the About photo that use the photo
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And "Jana" creates a news article:
      | title      | Zahrada pro děti |
      | perex      | Krátce.          |
      | body       | Text.            |
      | coverImage | {uploaded}       |
    And "Jana" publishes the news article "zahrada-pro-deti" on 2026-11-05
    And "Jana" creates a project:
      | title      | Zahrada    |
      | perex      | Krátce.    |
      | body       | Text.      |
      | year       | 2026       |
      | coverImage | {uploaded} |
    And "Jana" publishes the project "zahrada" on 2026-11-05
    And "Jana" sets the About photo:
      | photo | {uploaded} |
    When "Jana" places the focal point of the image uploaded as "zahrada.png" at 42 % from the left and 18 % from the top
    Then the response status is 200
    And the photo says:
      | id           | {uploaded}                    |
      | url          | /api/content/media/{uploaded} |
      | width        | 1600                          |
      | height       | 1000                          |
      | focalPoint.x | 42                            |
      | focalPoint.y | 18                            |
    And the admin action "CHANGE_PHOTO_FOCAL_POINT" by "Jana" on the image uploaded as "zahrada.png" is recorded with details containing "nastaven na 42 % zleva a 18 % shora"
    When "Jana" asks for the news article "zahrada-pro-deti"
    Then the news article says:
      | coverImage.focalPoint.x | 42 |
      | coverImage.focalPoint.y | 18 |
    When someone without a token asks for the news article "zahrada-pro-deti"
    Then the news article says:
      | coverImage.focalPoint.x | 42 |
      | coverImage.focalPoint.y | 18 |
    When someone without a token asks for the news articles
    Then the news list says:
      | items.0.coverImage.focalPoint.x | 42 |
      | items.0.coverImage.focalPoint.y | 18 |
    When someone without a token asks for the project "zahrada"
    Then the project says:
      | coverImage.focalPoint.x | 42 |
      | coverImage.focalPoint.y | 18 |
    When someone without a token asks for the projects
    Then the project list says:
      | items.0.coverImage.focalPoint.x | 42 |
    When "Jana" asks for the About section
    Then the About section says:
      | photo.focalPoint.x | 42 |
      | photo.focalPoint.y | 18 |
    When someone without a token asks for the home content
    Then the news list says:
      | news.0.coverImage.focalPoint.x     | 42 |
      | projects.0.coverImage.focalPoint.y | 18 |
      | about.photo.focalPoint.x           | 42 |

  Scenario: Moving the point keeps the photo, removing it crops around the centre again, and removing it again changes nothing
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And "Jana" creates a news article:
      | title      | Zahrada pro děti |
      | perex      | Krátce.          |
      | body       | Text.            |
      | coverImage | {uploaded}       |
    And 1 minute passes
    And "Jana" places the focal point of the image uploaded as "zahrada.png" at 42 % from the left and 18 % from the top
    And 1 minute passes
    When "Jana" places the focal point of the image uploaded as "zahrada.png" at 0 % from the left and 100 % from the top
    Then the response status is 200
    And the photo says:
      | focalPoint.x | 0   |
      | focalPoint.y | 100 |
    And 1 minute passes
    When "Jana" removes the focal point of the image uploaded as "zahrada.png"
    Then the response status is 200
    And the photo says:
      | id         | {uploaded} |
      | focalPoint |            |
    And the admin action "CHANGE_PHOTO_FOCAL_POINT" by "Jana" on the image uploaded as "zahrada.png" is recorded with details containing "zrušen"
    When "Jana" asks for the news article "zahrada-pro-deti"
    Then the news article says:
      | coverImage.id         | {uploaded} |
      | coverImage.focalPoint |            |
    When "Jana" removes the focal point of the image uploaded as "zahrada.png"
    Then the response status is 200
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action                   | summary                                              |
      | CHANGE_PHOTO_FOCAL_POINT | Zrušen bod výřezu fotky.                             |
      | CHANGE_PHOTO_FOCAL_POINT | Nastaven bod výřezu fotky: 0 % zleva, 100 % shora.   |
      | CHANGE_PHOTO_FOCAL_POINT | Nastaven bod výřezu fotky: 42 % zleva, 18 % shora.   |
      | CREATE_NEWS              | Napsána aktualita „Zahrada pro děti“.                |

  Scenario: A replaced photo starts without a focal point
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "prvni.png"
    And "Jana" creates a news article:
      | title      | Zahrada pro děti |
      | perex      | Krátce.          |
      | body       | Text.            |
      | coverImage | {uploaded}       |
    And "Jana" places the focal point of the image uploaded as "prvni.png" at 30 % from the left and 20 % from the top
    And "Jana" uploads a 1600 by 1000 pixel PNG image named "druha.png"
    When "Jana" changes the news article "zahrada-pro-deti":
      | title      | Zahrada pro děti |
      | perex      | Krátce.          |
      | body       | Text.            |
      | coverImage | {uploaded}       |
    Then the response status is 200
    And the news article says:
      | coverImage.id         | {uploaded} |
      | coverImage.focalPoint |            |

  Scenario Outline: A point outside the photo or half a point is refused and the photo keeps its point
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And "Jana" creates a news article:
      | title      | Zahrada pro děti |
      | perex      | Krátce.          |
      | body       | Text.            |
      | coverImage | {uploaded}       |
    And "Jana" places the focal point of the image uploaded as "zahrada.png" at 42 % from the left and 18 % from the top
    When "Jana" sends the focal point of the image uploaded as "zahrada.png" as <body>
    Then the response status is 400
    And the problem lists an error for field "<field>"
    When "Jana" asks for the news article "zahrada-pro-deti"
    Then the news article says:
      | coverImage.focalPoint.x | 42 |
      | coverImage.focalPoint.y | 18 |

    Examples:
      | body                                | field        |
      | {"focalPoint": {"x": 101, "y": 50}} | focalPoint.x |
      | {"focalPoint": {"x": 50, "y": -1}}  | focalPoint.y |
      | {"focalPoint": {"x": 50}}           | focalPoint.y |

  Scenario: A portrait or a web signature of a person of the foundation takes no focal point
    Given "Jana" uploads a 640 by 640 pixel PNG image named "eva.png"
    And "Jana" adds a person:
      | name     | Eva Vzorová |
      | onBoard  | false       |
      | featured | false       |
      | portrait | eva.png     |
    When "Jana" places the focal point of the image uploaded as "eva.png" at 42 % from the left and 18 % from the top
    Then the response status is 400
    And the problem type ends with "content/focal-point-on-person-image"
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action     | summary                        |
      | ADD_PERSON | Přidána osoba mezi lidi fondu. |

  Scenario: An unknown photo has no focal point to place
    When "Jana" places the focal point of the image "0199f3e0-0000-7000-8000-000000000000" at 50 % from the left and 50 % from the top
    Then the response status is 404
    And the problem type ends with "content/media-not-found"

  Scenario: A donor without the administrator role and a visitor without a token cannot place a focal point
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And a person "Petr" is registered
    When "Petr" places the focal point of the image uploaded as "zahrada.png" at 42 % from the left and 18 % from the top
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token places the focal point of the image uploaded as "zahrada.png" at 42 % from the left and 18 % from the top
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: A connected application with the writing permission places and removes a focal point, and the audit trail names it
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token places the focal point of the image uploaded as "zahrada.png" at 42 % from the left and 18 % from the top
    Then the response status is 200
    When the exchanged API token removes the focal point of the image uploaded as "zahrada.png"
    Then the response status is 200
    When "Jana" asks for the admin actions
    Then the admin actions came through these applications:
      | action                   | client    |
      | CHANGE_PHOTO_FOCAL_POINT | claude.ai |
      | CHANGE_PHOTO_FOCAL_POINT | claude.ai |

  Scenario: A connected application with the reading permission only cannot place a focal point
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the connector token for an API token
    And the exchanged API token places the focal point of the image uploaded as "zahrada.png" at 42 % from the left and 18 % from the top
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
