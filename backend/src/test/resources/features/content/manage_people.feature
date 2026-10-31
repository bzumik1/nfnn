@content
Feature: An administrator keeps the people of the foundation that the About section shows

  The block "Kdo fond vede" of the home page shows the people an administrator keeps at
  /sprava/lide-fondu (Jakub 2026-10-30): cards with a portrait for the featured people, the line
  of the board, the founders' note with the web signatures of the featured people under it, and
  one line under the board (Jakub 2026-10-30: the volunteer who runs the site).
  A web signature is a separate public image for the site only, never the signature on receipts,
  and a connected application may set and remove it too (Jakub 2026-10-30). A member's personal
  and fund e-mails are administration data only and never reach the home page.

  Background:
    Given today is 2026-10-30
    And a person "Jana" is registered
    And "Jana" is an administrator

  Scenario: Without people the administration lists none and the home page keeps its own block
    When "Jana" asks for the people of the foundation
    Then the response status is 200
    And there are no people of the foundation and no founders note
    When someone without a token asks for the home content
    Then the response status is 200
    And the home content has no people of the foundation

  Scenario: The people an administrator adds show on the home page as cards, the board line and the note with the signatures
    Given "Jana" uploads a 640 by 640 pixel PNG image named "eva.png"
    When "Jana" adds a person:
      | name      | Eva Vzorová                        |
      | role      | Zakladatelka a předsedkyně rady    |
      | onBoard   | true                               |
      | boardNote | předsedkyně                        |
      | featured  | true                               |
      | portrait  | eva.png                            |
      | personalEmail | eva.vzorova@example.org        |
      | fundEmail | eva@nfnn.cz                        |
    Then the response status is 201
    And the person says:
      | name          | Eva Vzorová                     |
      | role          | Zakladatelka a předsedkyně rady |
      | position      | 0                               |
      | onBoard       | true                            |
      | boardNote     | předsedkyně                     |
      | featured      | true                            |
      | portrait.id   | {image:eva.png}                 |
      | portrait.url  | /api/content/media/{image:eva.png} |
      | portrait.width | 640                            |
      | webSignature  |                                 |
      | personalEmail | eva.vzorova@example.org         |
      | fundEmail     | eva@nfnn.cz                     |
    And the admin action "ADD_PERSON" by "Jana" on the person "Eva Vzorová" is recorded with details containing "přidána"
    Given "Jana" adds a person:
      | name     | Adam Vzor               |
      | role     | Zakladatel a člen rady  |
      | onBoard  | true                    |
      | featured | true                    |
    And "Jana" adds a person:
      | name    | Hana Vzorová |
      | onBoard | true         |
    And "Jana" adds a person:
      | name | Petra Pomocná |
      | role | Dobrovolnice  |
    And "Jana" uploads a 600 by 180 pixel PNG image named "podpis-eva.png"
    And "Jana" sets the web signature of "Eva Vzorová" to the image uploaded as "podpis-eva.png"
    And "Jana" writes the founders note:
      """
      Fond jsme založili, abychom pomáhali konkrétním dětem.

      Děkujeme všem, kdo pomáhají s námi.
      """
    When someone without a token asks for the home content
    Then the response status is 200
    And the home cards of the people are:
      | name        | role                            | portrait.id     | portrait.width | portrait.height |
      | Eva Vzorová | Zakladatelka a předsedkyně rady | {image:eva.png} | 640            | 640             |
      | Adam Vzor   | Zakladatel a člen rady          |                 |                |                 |
    And the home board line is:
      | name         | note        |
      | Eva Vzorová  | předsedkyně |
      | Adam Vzor    |             |
      | Hana Vzorová |             |
    And the home founders note is:
      """
      Fond jsme založili, abychom pomáhali konkrétním dětem.

      Děkujeme všem, kdo pomáhají s námi.
      """
    And the home founders note is signed by:
      | name        | url                                       | width | height |
      | Eva Vzorová | /api/content/media/{image:podpis-eva.png} | 600   | 180    |
    And the people on the home page carry no e-mail address
    And the admin action "CHANGE_WEB_SIGNATURE" by "Jana" on the person "Eva Vzorová" is recorded with details containing "{image:podpis-eva.png}"
    And these admin actions were recorded:
      | action               | client |
      | ADD_PERSON           |        |
      | ADD_PERSON           |        |
      | ADD_PERSON           |        |
      | ADD_PERSON           |        |
      | CHANGE_WEB_SIGNATURE |        |
      | CHANGE_FOUNDERS_NOTE |        |
    When "Jana" asks for the people of the foundation
    Then the people of the foundation are:
      | name          | role                            | position | onBoard | boardNote   | featured | portrait.id     | portrait.width | webSignature.id        | webSignature.height | personalEmail           | fundEmail   |
      | Eva Vzorová   | Zakladatelka a předsedkyně rady | 0        | true    | předsedkyně | true     | {image:eva.png} | 640            | {image:podpis-eva.png} | 180                 | eva.vzorova@example.org | eva@nfnn.cz |
      | Adam Vzor     | Zakladatel a člen rady          | 1        | true    |             | true     |                 |                |                        |                     |                         |             |
      | Hana Vzorová  |                                 | 2        | true    |             | false    |                 |                |                        |                     |                         |             |
      | Petra Pomocná | Dobrovolnice                    | 3        | false   |             | false    |                 |                |                        |                     |                         |             |
    And the founders note is:
      """
      Fond jsme založili, abychom pomáhali konkrétním dětem.

      Děkujeme všem, kdo pomáhají s námi.
      """

  Scenario: Without a note the home page shows no note and so no signatures
    Given "Jana" adds a person:
      | name     | Eva Vzorová |
      | featured | true        |
    And "Jana" uploads a 600 by 180 pixel PNG image named "podpis-eva.png"
    And "Jana" sets the web signature of "Eva Vzorová" to the image uploaded as "podpis-eva.png"
    When someone without a token asks for the home content
    Then the home content has no founders note
    And the home board line is:
      | name | note |

  Scenario: Editing a person replaces their details, and a replaced portrait is deleted
    Given "Jana" uploads a 640 by 640 pixel PNG image named "prvni.png"
    And "Jana" adds a person:
      | name     | Eva Vzorová |
      | featured | true        |
      | portrait | prvni.png   |
    And "Jana" uploads a 640 by 640 pixel PNG image named "druha.png"
    When "Jana" updates the person "Eva Vzorová":
      | name      | Eva Vzorová             |
      | role      | Zakladatelka            |
      | onBoard   | true                    |
      | boardNote | předsedkyně             |
      | portrait  | druha.png               |
    Then the response status is 200
    And the person says:
      | role        | Zakladatelka      |
      | onBoard     | true              |
      | boardNote   | předsedkyně       |
      | featured    | false             |
      | portrait.id | {image:druha.png} |
    And the admin action "UPDATE_PERSON" by "Jana" on the person "Eva Vzorová" is recorded with details containing "upravena"
    When someone without a token asks for the image uploaded as "prvni.png"
    Then the response status is 404
    When someone without a token asks for the image uploaded as "druha.png"
    Then the response status is 200
    When "Jana" updates a person who does not exist
    Then the response status is 404
    And the problem type ends with "content/person-not-found"

  Scenario: The order an administrator sets is the order of the cards, the board line and the list
    Given "Jana" uploads a 640 by 640 pixel PNG image named "eva.png"
    And "Jana" adds a person:
      | name      | Eva Vzorová |
      | onBoard   | true        |
      | boardNote | předsedkyně |
      | portrait  | eva.png     |
    And 1 seconds pass
    And "Jana" adds a person:
      | name    | Adam Vzor |
      | onBoard | true      |
    And 1 seconds pass
    And "Jana" adds a person:
      | name    | Hana Vzorová |
      | onBoard | true         |
    And 1 seconds pass
    And "Jana" writes the founders note:
      """
      Děkujeme.
      """
    And 1 seconds pass
    When "Jana" orders the people:
      | Hana Vzorová |
      | Eva Vzorová  |
      | Adam Vzor    |
    Then the response status is 200
    And the people of the foundation are:
      | name         | position |
      | Hana Vzorová | 0        |
      | Eva Vzorová  | 1        |
      | Adam Vzor    | 2        |
    When someone without a token asks for the home content
    Then the home board line is:
      | name         | note        |
      | Hana Vzorová |             |
      | Eva Vzorová  | předsedkyně |
      | Adam Vzor    |             |
    When "Jana" orders the people:
      | Hana Vzorová |
      | Eva Vzorová  |
    Then the response status is 400
    And the problem type ends with "content/people-order-mismatch"
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action               | summary                        |
      | ORDER_PEOPLE         | Změněno pořadí lidí fondu.     |
      | CHANGE_FOUNDERS_NOTE | Upraveno slovo zakladatelů.    |
      | ADD_PERSON           | Přidána osoba mezi lidi fondu. |
      | ADD_PERSON           | Přidána osoba mezi lidi fondu. |
      | ADD_PERSON           | Přidána osoba mezi lidi fondu. |

  Scenario: The founders note keeps its paragraphs, and emptying it removes it
    When "Jana" writes the founders note:
      """
        První odstavec.


      Druhý odstavec.
      """
    Then the response status is 200
    And the founders note is:
      """
      První odstavec.

      Druhý odstavec.
      """
    When "Jana" asks for the people of the foundation
    Then the founders note is:
      """
      První odstavec.

      Druhý odstavec.
      """
    When 1 seconds pass
    And "Jana" empties the founders note
    Then the response status is 200
    And the founders note is empty
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action               | summary                     |
      | CHANGE_FOUNDERS_NOTE | Odebráno slovo zakladatelů. |
      | CHANGE_FOUNDERS_NOTE | Upraveno slovo zakladatelů. |

  Scenario: The line under the board shows on the home page as one line, and emptying it removes it
    Given "Jana" adds a person:
      | name    | Eva Vzorová |
      | onBoard | true        |
    And 1 seconds pass
    When "Jana" writes the line under the board:
      """
        Web zajišťuje   bez nároku na odměnu
      Petr Vzor.
      """
    Then the response status is 200
    And the line under the board is "Web zajišťuje bez nároku na odměnu Petr Vzor."
    When "Jana" asks for the people of the foundation
    Then the line under the board is "Web zajišťuje bez nároku na odměnu Petr Vzor."
    When someone without a token asks for the home content
    Then the home line under the board is "Web zajišťuje bez nároku na odměnu Petr Vzor."
    When 1 seconds pass
    And "Jana" empties the line under the board
    Then the response status is 200
    And the line under the board is empty
    When someone without a token asks for the home content
    Then the home content has no line under the board
    When "Jana" asks for the admin actions
    Then the admin actions are:
      | action                 | summary                          |
      | CHANGE_PEOPLE_FOOTNOTE | Odebrán řádek pod správní radou. |
      | CHANGE_PEOPLE_FOOTNOTE | Upraven řádek pod správní radou. |
      | ADD_PERSON             | Přidána osoba mezi lidi fondu.   |

  Scenario: A person whose e-mail is the confirmed e-mail of an account is linked to it, which grants nothing
    Given a person registered with email "petr@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    And "Jana" adds a person:
      | name      | Eva Vzorová     |
      | fundEmail | jana@example.cz |
    And "Jana" adds a person:
      | name          | Petr Vzor       |
      | personalEmail | petr@example.cz |
    When "Jana" asks for the people of the foundation
    Then the people of the foundation are:
      | name        | linkedToAccount |
      | Eva Vzorová | true            |
      | Petr Vzor   | false           |
    When "Jana" asks for her own person of the foundation
    Then the response status is 200
    And her own person of the foundation is "Eva Vzorová"
    Given a person "Hana" is registered
    And "Hana" is an administrator
    When "Hana" asks for her own person of the foundation
    Then the response status is 200
    And she has no own person of the foundation
    When someone without a token asks for the home content
    Then the people on the home page carry no e-mail address

  Scenario: Removing a person deletes their portrait and their web signature, and removing a web signature deletes it
    Given "Jana" uploads a 640 by 640 pixel PNG image named "eva.png"
    And "Jana" adds a person:
      | name     | Eva Vzorová |
      | featured | true        |
      | portrait | eva.png     |
    And "Jana" uploads a 600 by 180 pixel PNG image named "podpis-1.png"
    And "Jana" sets the web signature of "Eva Vzorová" to the image uploaded as "podpis-1.png"
    And "Jana" uploads a 600 by 180 pixel PNG image named "podpis-2.png"
    When "Jana" sets the web signature of "Eva Vzorová" to the image uploaded as "podpis-2.png"
    Then the response status is 200
    And the person says:
      | webSignature.id     | {image:podpis-2.png} |
      | webSignature.width  | 600                  |
      | webSignature.height | 180                  |
    And the admin action "CHANGE_WEB_SIGNATURE" by "Jana" on the person "Eva Vzorová" is recorded with details containing "{image:podpis-2.png}"
    When someone without a token asks for the image uploaded as "podpis-1.png"
    Then the response status is 404
    When "Jana" removes the web signature of "Eva Vzorová"
    Then the response status is 200
    And the person says:
      | webSignature |  |
    And the admin action "REMOVE_WEB_SIGNATURE" by "Jana" on the person "Eva Vzorová" is recorded with details containing "odebrán"
    When someone without a token asks for the image uploaded as "podpis-2.png"
    Then the response status is 404
    Given "Jana" uploads a 600 by 180 pixel PNG image named "podpis-3.png"
    And "Jana" sets the web signature of "Eva Vzorová" to the image uploaded as "podpis-3.png"
    When "Jana" removes the person "Eva Vzorová"
    Then the response status is 204
    And the admin action "REMOVE_PERSON" by "Jana" on the person "Eva Vzorová" is recorded with details containing "odebrána"
    When someone without a token asks for the image uploaded as "eva.png"
    Then the response status is 404
    When someone without a token asks for the image uploaded as "podpis-3.png"
    Then the response status is 404
    When "Jana" asks for the people of the foundation
    Then there are no people of the foundation and no founders note
    When someone without a token asks for the home content
    Then the home content has no people of the foundation
    When "Jana" removes the person "Eva Vzorová"
    Then the response status is 404
    And the problem type ends with "content/person-not-found"

  Scenario: A portrait the people show survives the cleanup of unused photos
    Given "Jana" uploads a 640 by 640 pixel PNG image named "eva.png"
    And "Jana" adds a person:
      | name     | Eva Vzorová |
      | featured | true        |
      | portrait | eva.png     |
    When 8 days pass
    And the cleanup of unused photos runs
    And someone without a token asks for the image uploaded as "eva.png"
    Then the response status is 200

  Scenario: Missing or too long texts, unknown images and too many people are refused
    When "Jana" adds a person:
      | name | |
    Then the response status is 400
    And the problem lists an error for field "name"
    When "Jana" adds a person:
      | name | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
    Then the response status is 400
    And the problem lists an error for field "name"
    When "Jana" adds a person:
      | name | Eva Vzorová                                                                                                                 |
      | role | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
    Then the response status is 400
    And the problem lists an error for field "role"
    When "Jana" adds a person:
      | name      | Eva Vzorová                                                   |
      | onBoard   | true                                                          |
      | boardNote | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
    Then the response status is 400
    And the problem lists an error for field "boardNote"
    When "Jana" adds a person:
      | name          | Eva Vzorová    |
      | personalEmail | eva.vzorova    |
      | fundEmail     | eva@nfnn       |
    Then the response status is 400
    And the problem lists an error for field "personalEmail"
    And the problem lists an error for field "fundEmail"
    When "Jana" adds a person:
      | name     | Eva Vzorová                          |
      | portrait | 0199f3e0-0000-7000-8000-000000000000 |
    Then the response status is 404
    And the problem type ends with "content/media-not-found"
    When "Jana" writes a founders note of 601 characters
    Then the response status is 400
    And the problem lists an error for field "text"
    When "Jana" writes a founders note of 600 characters
    Then the response status is 200
    When "Jana" writes a line under the board of 201 characters
    Then the response status is 400
    And the problem lists an error for field "text"
    When "Jana" writes a line under the board of 200 characters
    Then the response status is 200
    Given "Jana" adds a person:
      | name | Eva Vzorová |
    When "Jana" sets the web signature of "Eva Vzorová" to an image that was never uploaded
    Then the response status is 404
    And the problem type ends with "content/media-not-found"
    Given "Jana" uploads a 600 by 180 pixel PNG image named "podpis-eva.png"
    And "Jana" sets the web signature of "Eva Vzorová" to the image uploaded as "podpis-eva.png"
    When "Jana" adds a person:
      | name     | Adam Vzor      |
      | portrait | podpis-eva.png |
    Then the response status is 400
    And the problem type ends with "content/person-image-in-use"
    When "Jana" updates the person "Eva Vzorová":
      | name     | Eva Vzorová    |
      | portrait | podpis-eva.png |
    Then the response status is 400
    And the problem type ends with "content/person-image-in-use"
    Given "Jana" uploads a 640 by 640 pixel PNG image named "hana.png"
    And "Jana" adds a person:
      | name     | Hana Vzorová |
      | portrait | hana.png     |
    When "Jana" sets the web signature of "Eva Vzorová" to the image uploaded as "hana.png"
    Then the response status is 400
    And the problem type ends with "content/person-image-in-use"
    Given "Jana" adds 28 people
    When "Jana" adds a person:
      | name | Adam Vzor |
    Then the response status is 409
    And the problem type ends with "content/too-many-people"
    When "Jana" adds a person whose name has a line break
    Then the response status is 400
    And the problem lists an error for field "name"
    When "Jana" adds a person whose role has a line break
    Then the response status is 400
    And the problem lists an error for field "role"
    When "Jana" adds a person whose boardNote has a line break
    Then the response status is 400
    And the problem lists an error for field "boardNote"

  Scenario: A donor without the administrator role and a visitor without a token cannot manage the people
    Given "Jana" adds a person:
      | name | Eva Vzorová |
    And a person "Petr" is registered
    When "Petr" asks for the people of the foundation
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" removes the person "Eva Vzorová"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" asks for her own person of the foundation
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token asks for the people of the foundation
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    When someone without a token removes the person "Eva Vzorová"
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"

  Scenario: A connected application with the writing permission keeps the people, the note and the web signatures
    Given "Jana" adds a person:
      | name     | Eva Vzorová |
      | featured | true        |
    And "Jana" uploads a 600 by 180 pixel PNG image named "podpis-eva.png"
    And "Jana" sets the web signature of "Eva Vzorová" to the image uploaded as "podpis-eva.png"
    And "Jana" uploads a 600 by 180 pixel PNG image named "podpis-adam.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token adds a person:
      | name    | Adam Vzor |
      | onBoard | true      |
    Then the response status is 201
    When the exchanged API token updates the person "Adam Vzor":
      | name      | Adam Vzor              |
      | role      | Zakladatel a člen rady |
      | onBoard   | true                   |
      | fundEmail | adam@nfnn.cz           |
    Then the response status is 200
    And the person says:
      | fundEmail     | adam@nfnn.cz |
      | personalEmail |              |
    When the exchanged API token writes the line under the board:
      """
      Web zajišťuje Petr Vzor.
      """
    Then the response status is 200
    When the exchanged API token orders the people:
      | Adam Vzor   |
      | Eva Vzorová |
    Then the response status is 200
    When the exchanged API token writes the founders note:
      """
      Děkujeme.
      """
    Then the response status is 200
    When the exchanged API token updates the person "Eva Vzorová":
      | name     | Eva Nová |
      | featured | true     |
    Then the response status is 200
    And the person says:
      | name            | Eva Nová               |
      | webSignature.id | {image:podpis-eva.png} |
    When the exchanged API token sets the web signature of "Adam Vzor" to the image uploaded as "podpis-adam.png"
    Then the response status is 200
    And the person says:
      | webSignature.id     | {image:podpis-adam.png} |
      | webSignature.width  | 600                     |
      | webSignature.height | 180                     |
    When the exchanged API token removes the web signature of "Eva Vzorová"
    Then the response status is 200
    And the person says:
      | webSignature |  |
    When someone without a token asks for the image uploaded as "podpis-eva.png"
    Then the response status is 404
    When the exchanged API token removes the person "Adam Vzor"
    Then the response status is 204
    When someone without a token asks for the image uploaded as "podpis-adam.png"
    Then the response status is 404
    When "Jana" asks for the people of the foundation
    Then the people of the foundation are:
      | name     | webSignature |
      | Eva Nová |              |
    And these admin actions were recorded:
      | action                 | client    |
      | REMOVE_PERSON          | claude.ai |
      | REMOVE_WEB_SIGNATURE   | claude.ai |
      | CHANGE_WEB_SIGNATURE   | claude.ai |
      | UPDATE_PERSON          | claude.ai |
      | CHANGE_FOUNDERS_NOTE   | claude.ai |
      | ORDER_PEOPLE           | claude.ai |
      | CHANGE_PEOPLE_FOOTNOTE | claude.ai |
      | UPDATE_PERSON          | claude.ai |
      | ADD_PERSON             | claude.ai |
      | CHANGE_WEB_SIGNATURE   |           |
      | ADD_PERSON             |           |

  Scenario: A connected application with the reading permission only reads the people but cannot change them
    Given "Jana" adds a person:
      | name | Eva Vzorová |
    And "Jana" uploads a 600 by 180 pixel PNG image named "podpis-eva.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the connector token for an API token
    And the exchanged API token asks for the people of the foundation
    Then the response status is 200
    And the people of the foundation are:
      | name        |
      | Eva Vzorová |
    When the exchanged API token removes the person "Eva Vzorová"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When the exchanged API token sets the web signature of "Eva Vzorová" to the image uploaded as "podpis-eva.png"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When the exchanged API token removes the web signature of "Eva Vzorová"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When the exchanged API token writes the line under the board:
      """
      Web zajišťuje Petr Vzor.
      """
    Then the response status is 403
    And the problem type ends with "auth/forbidden"

  Scenario: The person who signs the receipts stays, and only a browser changes their portrait
    Given "Jana" uploads a 640 by 640 pixel PNG image named "eva.png"
    And "Jana" adds a person:
      | name     | Eva Vzorová |
      | portrait | eva.png     |
    And "Jana" chooses "Eva Vzorová" to sign the receipts as "předsedkyně správní rady"
    And "Jana" uploads a 640 by 640 pixel PNG image named "druha.png"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token updates the person "Eva Vzorová":
      | name     | Eva Vzorová |
      | portrait | druha.png   |
    Then the response status is 403
    And the problem type ends with "content/receipt-portrait-in-browser-only"
    When the exchanged API token updates the person "Eva Vzorová":
      | name     | Eva Vzorová  |
      | role     | Zakladatelka |
      | portrait | eva.png      |
    Then the response status is 200
    When the exchanged API token removes the person "Eva Vzorová"
    Then the response status is 409
    And the problem type ends with "content/person-signs-receipts"
    When "Jana" removes the person "Eva Vzorová"
    Then the response status is 409
    And the problem type ends with "content/person-signs-receipts"
    When "Jana" updates the person "Eva Vzorová":
      | name     | Eva Vzorová |
      | portrait | druha.png   |
    Then the response status is 200
    And the person says:
      | portrait.id | {image:druha.png} |
