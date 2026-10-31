@content
Feature: An administrator writes news articles with photos and publishes them on the site

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: A new article is a draft with an address made from its title and the site does not show it yet
    When "Jana" creates a news article:
      | title | Nový projekt: Zahrada pro děti                     |
      | perex | Krátký souhrn aktuality.                           |
      | body  | První odstavec.\n\nDruhý odstavec s podrobnostmi.  |
    Then the response status is 201
    And the news article says:
      | slug        | novy-projekt-zahrada-pro-deti |
      | title       | Nový projekt: Zahrada pro děti |
      | perex       | Krátký souhrn aktuality.      |
      | publishedOn |                               |
      | coverImage  |                               |
    And the admin action "CREATE_NEWS" by "Jana" on the news article "novy-projekt-zahrada-pro-deti" is recorded with details containing "napsána"
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action      | summary                                             |
      | CREATE_NEWS | Napsána aktualita „Nový projekt: Zahrada pro děti“. |
    When someone without a token asks for the news articles
    Then the response status is 200
    And the news list has 0 items
    When someone without a token asks for the news article "novy-projekt-zahrada-pro-deti"
    Then the response status is 404
    And the problem type ends with "content/news-not-found"

  Scenario: A title with no letter or digit and no address of its own is refused with the reason
    When "Jana" creates a news article:
      | title | ???                       |
      | perex | Krátký souhrn aktuality.  |
      | body  | První odstavec.           |
    Then the response status is 400
    And the problem type ends with "content/slug-not-derivable"
    And the problem does not repeat "slug can be made"

  Scenario: An uploaded photo is stored as WebP variants and served to everyone, cached for a year
    When "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    Then the response status is 201
    And the uploaded image says:
      | width  | 1600 |
      | height | 1000 |
    And the uploaded image has a public address
    When someone without a token asks for the uploaded image at width 500
    Then the response status is 200
    And the response is a WebP image 960 pixels wide and 600 high
    And the image response is cacheable for a year
    When someone without a token asks for the uploaded image at width 5000
    Then the response is a WebP image 1440 pixels wide and 900 high
    When someone without a token asks for the uploaded image without a width
    Then the response is a WebP image 1440 pixels wide and 900 high
    When someone without a token asks for the image "0199f3e0-0000-7000-8000-000000000000"
    Then the response status is 404
    And the problem type ends with "content/media-not-found"

  Scenario: A file that is not an image and a file over 10 MB are refused
    When "Jana" uploads a text file as an image
    Then the response status is 400
    And the problem type ends with "content/unsupported-image"
    When "Jana" uploads an 11 MB file as an image
    Then the response status is 413
    And the problem type ends with "upload-too-large"

  Scenario: Publishing with a date puts the article on the site, newest first, and withdrawing takes it down
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And "Jana" creates a news article:
      | title         | Zahrada pro děti    |
      | tag           | Projekt             |
      | perex         | Stavíme zahradu.    |
      | body          | Text o zahradě.     |
      | coverImage    | {uploaded}          |
      | coverImageAlt | Děti sázejí stromek |
    And "Jana" creates a news article:
      | title | Benefiční koncert       |
      | perex | Zveme vás na koncert.   |
      | body  | Text o koncertu.        |
    When "Jana" publishes the news article "zahrada-pro-deti" on 2026-10-20
    Then the response status is 200
    And the news article says:
      | publishedOn    | 2026-10-20 |
      | tag            | Projekt    |
      | coverImage.id  | {uploaded} |
      | coverImage.url | /api/content/media/{uploaded} |
      | coverImage.alt | Děti sázejí stromek           |
    And the admin action "PUBLISH_NEWS" by "Jana" on the news article "zahrada-pro-deti" is recorded with details containing "zveřejněna od 2026-10-20"
    When "Jana" publishes the news article "beneficni-koncert" on 2026-10-23
    And someone without a token asks for the news articles
    Then the response status is 200
    And the news list titles are:
      | Benefiční koncert |
      | Zahrada pro děti  |
    And the news list says:
      | page    | 0     |
      | size    | 10    |
      | total   | 2     |
      | hasMore | false |
    When someone without a token asks for the news article "zahrada-pro-deti"
    Then the response status is 200
    And the news article says:
      | title          | Zahrada pro děti              |
      | body           | Text o zahradě.               |
      | coverImage.url | /api/content/media/{uploaded} |
    When "Jana" withdraws the news article "beneficni-koncert"
    Then the response status is 200
    And the news article says:
      | publishedOn |  |
    And the admin action "UNPUBLISH_NEWS" by "Jana" on the news article "beneficni-koncert" is recorded with details containing "stažena z webu"
    When someone without a token asks for the news articles
    Then the news list titles are:
      | Zahrada pro děti |
    When someone without a token asks for the news article "beneficni-koncert"
    Then the response status is 404

  Scenario: An article published with a future date appears on the site on that day, and the administration says when it is live
    Given "Jana" creates a news article:
      | title | Vánoční sbírka       |
      | perex | Sbírka začne brzy.   |
      | body  | Text o sbírce.       |
    And the news article says:
      | live | false |
    When "Jana" publishes the news article "vanocni-sbirka" on 2026-11-01
    Then the news article says:
      | publishedOn | 2026-11-01 |
      | live        | false      |
    When someone without a token asks for the news articles
    Then the news list has 0 items
    When today is 2026-11-01
    And "Jana" asks for the news article "vanocni-sbirka"
    Then the news article says:
      | live | true |
    When someone without a token asks for the news articles
    Then the news list titles are:
      | Vánoční sbírka |
    And the news list says:
      | items.0.live | true |

  Scenario: The public list is paged
    Given "Jana" has published 12 news articles titled "Aktualita" from 2026-09-01 on
    When someone without a token asks for page 0 of 10 news articles
    Then the news list has 10 items
    And the news list says:
      | total   | 12   |
      | hasMore | true |
    And news list item 0 has the title "Aktualita 12"
    When someone without a token asks for page 1 of 10 news articles
    Then the news list has 2 items
    And the news list says:
      | hasMore | false |
    And news list item 1 has the title "Aktualita 1"
    When someone without a token asks for page 0 of 51 news articles
    Then the response status is 400

  Scenario: The administrator's list shows drafts first and then the newest published
    Given "Jana" creates a news article:
      | title | Starší zpráva |
      | perex | Perex.        |
      | body  | Text.         |
    And "Jana" publishes the news article "starsi-zprava" on 2026-09-01
    And "Jana" creates a news article:
      | title | Novější zpráva |
      | perex | Perex.         |
      | body  | Text.          |
    And "Jana" publishes the news article "novejsi-zprava" on 2026-10-01
    And "Jana" creates a news article:
      | title | Koncept |
      | perex | Perex.  |
      | body  | Text.   |
    When "Jana" asks for the news articles
    Then the response status is 200
    And the news list titles are:
      | Koncept        |
      | Novější zpráva |
      | Starší zpráva  |
    When "Jana" asks for the news article "koncept"
    Then the response status is 200
    And the news article says:
      | title | Koncept |

  Scenario: Editing an article replaces its photo and the old photo disappears
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "prvni.png"
    And "Jana" creates a news article:
      | title      | S fotkou   |
      | perex      | Perex.     |
      | body       | Text.      |
      | coverImage | {uploaded} |
    And "Jana" uploads a 800 by 600 pixel PNG image named "druha.png"
    When "Jana" changes the news article "s-fotkou":
      | title      | S novou fotkou |
      | slug       | s-novou-fotkou |
      | tag        | Zprávy         |
      | perex      | Nový perex.    |
      | body       | Nový text.     |
      | coverImage | {uploaded}     |
    Then the response status is 200
    And the news article says:
      | slug           | s-novou-fotkou                |
      | title          | S novou fotkou                |
      | tag            | Zprávy                        |
      | coverImage.url | /api/content/media/{uploaded} |
    And the admin action "UPDATE_NEWS" by "Jana" on the news article "s-novou-fotkou" is recorded with details containing "upravena"
    When someone without a token asks for the image uploaded as "prvni.png"
    Then the response status is 404
    When someone without a token asks for the image uploaded as "druha.png"
    Then the response status is 200

  Scenario: Deleting an article removes it and its photo
    Given "Jana" uploads a 1600 by 1000 pixel PNG image named "zahrada.png"
    And "Jana" creates a news article:
      | title      | Ke smazání |
      | perex      | Perex.     |
      | body       | Text.      |
      | coverImage | {uploaded} |
    And "Jana" publishes the news article "ke-smazani" on 2026-10-23
    When "Jana" deletes the news article "ke-smazani"
    Then the response status is 204
    And the admin action "DELETE_NEWS" by "Jana" on the news article "ke-smazani" is recorded with details containing "smazána"
    When "Jana" asks for the news article "ke-smazani"
    Then the response status is 404
    And the problem type ends with "content/news-not-found"
    When someone without a token asks for the uploaded image without a width
    Then the response status is 404

  Scenario: An address already used by another article is refused
    Given "Jana" creates a news article:
      | title | Zahrada pro děti |
      | perex | Perex.           |
      | body  | Text.            |
    When "Jana" creates a news article:
      | title | Zahrada pro děti znovu |
      | slug  | zahrada-pro-deti       |
      | perex | Perex.                 |
      | body  | Text.                  |
    Then the response status is 409
    And the problem type ends with "content/slug-taken"

  Scenario: Missing texts, a malformed address and an unknown photo are refused
    When "Jana" creates a news article:
      | title |  |
      | perex |  |
      | body  | Text. |
    Then the response status is 400
    And the problem lists errors for fields "title" and "perex"
    When "Jana" creates a news article:
      | title | Titulek      |
      | slug  | Velká Adresa |
      | perex | Perex.       |
      | body  | Text.        |
    Then the response status is 400
    And the problem lists an error for field "slug"
    When "Jana" creates a news article:
      | title         | Titulek |
      | perex         | Perex.  |
      | body          | Text.   |
      | coverImageAlt | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
    Then the response status is 400
    And the problem lists an error for field "coverImageAlt"
    When "Jana" creates a news article:
      | title      | Titulek                              |
      | perex      | Perex.                               |
      | body       | Text.                                |
      | coverImage | 0199f3e0-0000-7000-8000-000000000000 |
    Then the response status is 404
    And the problem type ends with "content/media-not-found"
    When "Jana" creates a news article:
      | title  | Titulek                              |
      | perex  | Perex.                               |
      | body   | Text.                                |
      | signer | 0199f3e0-0000-7000-8000-000000000000 |
    Then the response status is 404
    And the problem type ends with "content/person-not-found"
    When "Jana" publishes the news article "neexistuje" on 2026-10-23
    Then the response status is 404
    And the problem type ends with "content/news-not-found"

  Scenario: A donor without the administrator role and a visitor without a token cannot manage news
    Given a person "Petr" is registered
    When "Petr" asks for the news articles
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" uploads a 800 by 600 pixel PNG image named "petr.png"
    Then the response status is 403
    When someone without a token creates a news article
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: After its address changes, the old address still leads to the article until another article takes it
    Given "Jana" creates a news article:
      | title | Benefiční koncert     |
      | perex | Zveme vás na koncert. |
      | body  | Text o koncertu.      |
    And "Jana" publishes the news article "beneficni-koncert" on 2026-10-20
    When "Jana" changes the news article "beneficni-koncert":
      | title | Koncert v kostele     |
      | slug  | koncert-v-kostele     |
      | perex | Zveme vás na koncert. |
      | body  | Text o koncertu.      |
    Then the response status is 200
    When someone without a token asks for the news article "beneficni-koncert"
    Then the response status is 200
    And the news article says:
      | slug  | koncert-v-kostele |
      | title | Koncert v kostele |
    When someone without a token asks for the project "beneficni-koncert"
    Then the response status is 404
    When "Jana" creates a news article:
      | title | Benefiční koncert       |
      | perex | Další koncert na jaře.  |
      | body  | Text o jarním koncertu. |
    Then the response status is 201
    When "Jana" publishes the news article "beneficni-koncert" on 2026-10-21
    And someone without a token asks for the news article "beneficni-koncert"
    Then the response status is 200
    And the news article says:
      | slug  | beneficni-koncert      |
      | perex | Další koncert na jaře. |
    When someone without a token asks for the news article "koncert-v-kostele"
    Then the news article says:
      | title | Koncert v kostele |

  Scenario: The old address of a deleted article or of a draft leads nowhere
    Given "Jana" creates a news article:
      | title | Benefiční koncert     |
      | perex | Zveme vás na koncert. |
      | body  | Text o koncertu.      |
    And "Jana" changes the news article "beneficni-koncert":
      | title | Koncert v kostele     |
      | slug  | koncert-v-kostele     |
      | perex | Zveme vás na koncert. |
      | body  | Text o koncertu.      |
    When someone without a token asks for the news article "beneficni-koncert"
    Then the response status is 404
    When "Jana" deletes the news article "koncert-v-kostele"
    Then the response status is 204
    When someone without a token asks for the news article "beneficni-koncert"
    Then the response status is 404
    And the problem type ends with "content/news-not-found"

  Scenario: An article signed by a person of the foundation shows their name, role and portrait, and stays unsigned once the person is removed
    Given "Jana" uploads a 640 by 640 pixel PNG image named "pavel.png"
    And "Jana" adds a person:
      | name     | Pavel Vzorový         |
      | role     | Předseda správní rady |
      | portrait | pavel.png             |
    When "Jana" creates a news article:
      | title  | Poděkování dárcům |
      | perex  | Krátký souhrn.    |
      | body   | Text.             |
      | signer | Pavel Vzorový     |
    Then the response status is 201
    And the news article says:
      | signer.name        | Pavel Vzorový         |
      | signer.role        | Předseda správní rady |
      | signer.portrait.id | {uploaded}            |
    When "Jana" publishes the news article "podekovani-darcum" on 2026-10-23
    And someone without a token asks for the news article "podekovani-darcum"
    Then the response status is 200
    And the news article says:
      | signer.name         | Pavel Vzorový                 |
      | signer.role         | Předseda správní rady         |
      | signer.portrait.url | /api/content/media/{uploaded} |
    When someone without a token asks for the news articles
    Then the news list says:
      | items.0.signer.name | Pavel Vzorový |
    When "Jana" changes the news article "podekovani-darcum":
      | title | Poděkování dárcům |
      | perex | Krátký souhrn.    |
      | body  | Text.             |
    Then the response status is 200
    And the news article says:
      | signer |  |
    When "Jana" changes the news article "podekovani-darcum":
      | title  | Poděkování dárcům |
      | perex  | Krátký souhrn.    |
      | body   | Text.             |
      | signer | Pavel Vzorový     |
    Then the response status is 200
    When "Jana" removes the person "Pavel Vzorový"
    Then the response status is 204
    When someone without a token asks for the news article "podekovani-darcum"
    Then the response status is 200
    And the news article says:
      | title  | Poděkování dárcům |
      | signer |                   |
