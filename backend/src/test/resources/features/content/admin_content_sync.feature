@content
Feature: An administrator's device keeps a copy of the site's content by downloading only the chunks that changed

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: A device gets the news, the projects, their order, the About section, the Přispět band and the people as the administration reads them
    Given "Jana" creates a news article:
      | title | Letní tábor              |
      | perex | Krátký souhrn aktuality. |
      | body  | První odstavec.          |
    And "Jana" publishes the news article "letni-tabor" on 2026-10-20
    And "Jana" creates a news article:
      | title | Podzimní sbírka   |
      | perex | Krátký souhrn.    |
      | body  | Text sbírky.      |
    And "Jana" creates a project:
      | title | Dominik, 7 let                            |
      | year  | 2024                                      |
      | tag   | Kompenzační pomůcky                       |
      | perex | Pomohli jsme mu získat speciální kočárek. |
      | body  | Dominik se narodil s dětskou mozkovou obrnou. |
    And "Jana" uploads a 800 by 600 pixel PNG image named "pruh.png"
    And "Jana" sets the donate band photo:
      | photo | {uploaded}        |
      | alt   | Děti na zahradě   |
    And "Jana" adds a person:
      | name    | Eva Vzorová     |
      | role    | Zakladatelka    |
      | onBoard | true            |
    And "Jana" writes the founders note:
      """
      Fond jsme založili, abychom pomáhali konkrétním dětem.
      """
    When an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "about, donate-band, news, people, project-order, projects"
    And the administration device's copy names "Jana" as its subject and holds the administration
    And every chunk on the administration device hashes to its rowsSha256
    And the administration device holds the chunk "news" with 2 rows
    And the administration device's chunk "news" holds the items the administration reads at "/api/admin/content/news"
    And the administration device's chunk "projects" holds the items the administration reads at "/api/admin/content/projects"
    And the administration device's chunk "project-order" holds what the administration reads at "/api/admin/content/project-order"
    And the administration device's chunk "about" holds what the administration reads at "/api/admin/content/about"
    And the administration device's chunk "donate-band" holds what the administration reads at "/api/admin/content/donate-band"
    And the administration device's chunk "people" holds what the administration reads at "/api/admin/content/people"

  Scenario: A site without news or projects has no chunk of them, and the singletons come as the administration reads them
    When an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "about, donate-band, people, project-order"
    And the administration device's chunk "about" holds what the administration reads at "/api/admin/content/about"
    And the administration device's chunk "people" holds what the administration reads at "/api/admin/content/people"
    When "Jana" asks for the administration's content sync chunks "news,projects,about"
    Then the response status is 200
    And the administration's chunks answer holds "about" and lists "news, projects" as missing

  Scenario: A change changes only the chunk it belongs to, and an unchanged manifest downloads nothing
    Given "Jana" creates a news article:
      | title | Letní tábor              |
      | perex | Krátký souhrn aktuality. |
      | body  | První odstavec.          |
    And an administration device of "Jana" syncs the content
    When an administration device of "Jana" syncs the content
    Then the administration device downloaded no chunk
    When "Jana" changes the news article "letni-tabor":
      | title | Letní tábor 2026 |
      | slug  | letni-tabor      |
      | perex | Nový perex.      |
      | body  | Nový text.       |
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "news"
    And the administration device removed no chunk
    And the administration device's chunk "news" holds the items the administration reads at "/api/admin/content/news"
    When "Jana" sets the project order to "YEAR"
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "project-order"
    When "Jana" writes the founders note:
      """
      Pomáháme konkrétním dětem.
      """
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "people"
    And the administration device's chunk "people" holds what the administration reads at "/api/admin/content/people"
    When "Jana" deletes the news article "letni-tabor"
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded no chunk
    And the administration device removed the chunks "news"

  Scenario: A project changes only the projects, an About photo only the About section, and an article's publication day changes the news when it comes
    Given "Jana" creates a news article:
      | title | Letní tábor              |
      | perex | Krátký souhrn aktuality. |
      | body  | První odstavec.          |
    And "Jana" creates a project:
      | title | Dominik, 7 let                                |
      | year  | 2024                                          |
      | tag   | Kompenzační pomůcky                           |
      | perex | Pomohli jsme mu získat speciální kočárek.     |
      | body  | Dominik se narodil s dětskou mozkovou obrnou. |
    And an administration device of "Jana" syncs the content
    When "Jana" changes the project "dominik-7-let":
      | title | Dominik, 7 let                   |
      | year  | 2024                             |
      | perex | Kočárek mu slouží každý den.     |
      | body  | Dominik jezdí ven s rodiči.      |
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "projects"
    And the administration device's chunk "projects" holds the items the administration reads at "/api/admin/content/projects"
    When "Jana" uploads a 800 by 600 pixel PNG image named "o-nas.png"
    And "Jana" sets the About photo:
      | photo | {uploaded}                           |
      | alt   | Malý chlapec v náručí dvou dospělých |
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "about"
    And the administration device's chunk "about" holds what the administration reads at "/api/admin/content/about"
    When "Jana" publishes the news article "letni-tabor" on 2026-10-25
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "news"
    When today is 2026-10-24
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded no chunk
    When today is 2026-10-25
    And an administration device of "Jana" syncs the content
    Then the administration device downloaded the chunks "news"
    And the administration device's chunk "news" holds the items the administration reads at "/api/admin/content/news"

  Scenario: The people come without any receipt signature or printed portrait, and the trail on the device names no member's e-mail
    Given "Jana" uploads a 640 by 480 pixel PNG image named "adam.png"
    And "Jana" adds a person:
      | name          | Adam Vzor               |
      | role          | Zakladatel              |
      | portrait      | adam.png                |
      | personalEmail | adam.vzor@example.org   |
      | fundEmail     | fond.adam@example.cz    |
    And "Jana" uploads a 600 by 200 pixel PNG image named "podpis-adam.png"
    And "Jana" sets the signature of "Adam Vzor" to the image uploaded as "podpis-adam.png"
    And "Jana" chooses "Adam Vzor" to sign the receipts as "místopředseda správní rady"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 2001 | 2026-10-01 | 500.00 | 2900233333 | 2010     | Nováková Jana | {Jana}         |
    And the application starts the import
    And "Jana" issues the receipt of her donation received on 2026-10-01
    And the issued receipt is the single receipt of the donation of "Jana" received on 2026-10-01
    And the frozen receipt shows a portrait of the signatory
    And the frozen receipt shows the current signature image
    When an administration device of "Jana" syncs the content
    Then the administration device's chunk "people" holds what the administration reads at "/api/admin/content/people"
    When an administration device of "Jana" syncs the donors
    Then no chunk on any administration device holds any of the 2 receipt images, a receipt signature or an image's bytes
    And the people on the administration device carry only their public portrait and signature
    And no audit chunk on the administration device holds the text "adam.vzor@example.org"
    And no audit chunk on the administration device holds the text "fond.adam@example.cz"

  Scenario: A refused request leaves the count alone, and the content's 60 requests leave the other copies' counts alone
    When "Jana" asks for the administration's content sync chunks "news:2026-10"
    Then the response status is 400
    When "Jana" asks for the administration's content sync manifest 30 times
    And "Jana" asks for the administration's content sync chunks "news" 30 times
    Then the response status is 200
    When "Jana" asks for the administration's content sync manifest
    Then the response status is 429
    When "Jana" asks for the administration's operations sync manifest
    Then the response status is 200
    When "Jana" asks for the administration's donors sync manifest
    Then the response status is 200
    When "Jana" asks for the administration's donations sync manifest
    Then the response status is 200

  Scenario: An administrator whose role was removed learns it at the next sync while the token is still valid, and the device keeps nothing
    Given a person "Andrea" is registered
    And "Andrea" is an administrator
    And "Jana" holds a browser token from before the signed-in devices
    And an administration device of "Jana" syncs the content
    When "Andrea" removes "Jana" from the administrators
    And an administration device of "Jana" syncs the content
    Then the administration device was told that "Jana" no longer holds the administration

  Scenario: The chunks come in the asked order, a repeated chunk once, up to 64 in one request, and no cache keeps an answer
    When "Jana" asks for the administration's content sync chunks "people,about,people"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the administration's chunks answer holds "people, about" and lists "" as missing
    When "Jana" asks for 64 of the administration's content sync chunks
    Then the response status is 200
    When "Jana" asks for the administration's content sync manifest
    Then the response status is 200
    And the answer is JSON that must not be cached

  Scenario: Asking for chunks that are not chunk ids of the content, too many or none is refused
    When "Jana" asks for the administration's content sync chunks "news:2026-10"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for the administration's content sync chunks "accounts:2026-10"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for the administration's content sync chunks "settings"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for 65 of the administration's content sync chunks
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for the administration's content sync chunks ""
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: The manifest and the chunks together answer 60 requests of one administrator in 15 minutes, from any address
    Given a person "Andrea" is registered
    And "Andrea" is an administrator
    When "Jana" asks for the administration's content sync manifest 30 times
    And "Jana" asks for the administration's content sync chunks "news" 30 times
    Then the response status is 200
    When the following requests come from another client address
    And "Jana" asks for the administration's content sync manifest
    Then the response status is 429
    And the problem type ends with "content/rate-limited"
    When "Jana" asks for the administration's content sync chunks "news"
    Then the response status is 429
    When "Andrea" asks for the administration's content sync manifest
    Then the response status is 200
    When 15 minutes pass
    And "Jana" asks for the administration's content sync manifest
    Then the response status is 200

  Scenario: The manifest and the chunks need an administrator
    Given a person "Petr" is registered
    When someone without a token asks for the administration's content sync manifest
    Then the response status is 401
    When someone without a token asks for the administration's content sync chunks "news"
    Then the response status is 401
    When "Petr" asks for the administration's content sync manifest
    Then the response status is 403
    When "Petr" asks for the administration's content sync chunks "news"
    Then the response status is 403
