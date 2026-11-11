@donations
Feature: An administrator sets where the server downloads each bank's logo, downloads it again and removes it

  Background:
    Given a person "Jana" is registered
    And "Jana" is an administrator
    And the bank code list fetched at "2026-11-02T04:40:00Z" holds:
      | code | name                   |
      | 0800 | Česká spořitelna, a.s. |
    And the logo address "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" serves the picture "spořitelna z App Store"
    And the logo address "https://www.csas.cz/content/dam/icon.png" serves the picture "spořitelna z webu"

  Scenario: A logo set for a bank is downloaded at once, listed with the ČNB name and audited
    When "Jana" sets the logo of bank "0800" to "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" as a new one
    Then the response status is 200
    And the answer is the bank logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And the logo of bank "0800" shows the picture "spořitelna z App Store"
    When "Jana" asks for the bank logos in the administration
    Then the response status is 200
    And the administration lists these bank logos:
      | code | bankName               | sourceUrl                                                    | image | fetchedAt            | checkedAt            | lastFailure |
      | 0800 | Česká spořitelna, a.s. | https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg | yes   | 2026-11-04T09:00:00Z | 2026-11-04T09:00:00Z |             |
    And the bank logo admin actions were recorded:
      | action               | details                                                      |
      | SET_BANK_LOGO_SOURCE | Logo banky 0800 nastaveno z is1-ssl.mzstatic.com, obrázek  |

  Scenario: A bank the ČNB list does not know gets a logo too
    Given the logo address "https://is2-ssl.mzstatic.com/image/thumb/nova/512x512bb.jpg" serves the picture "nová banka"
    When "Jana" sets the logo of bank "9999" to "https://is2-ssl.mzstatic.com/image/thumb/nova/512x512bb.jpg" as a new one
    Then the response status is 200
    When "Jana" asks for the bank logos in the administration
    Then the administration lists these bank logos:
      | code | bankName | sourceUrl                                                    | image | fetchedAt            | checkedAt            | lastFailure |
      | 9999 |          | https://is2-ssl.mzstatic.com/image/thumb/nova/512x512bb.jpg | yes   | 2026-11-04T09:00:00Z | 2026-11-04T09:00:00Z |             |

  Scenario Outline: An address off the allow-list is refused before anything is downloaded
    When "Jana" sets the logo of bank "<code>" to "<address>" as a new one
    Then the response status is 400
    And the problem type ends with "donations/bank-logo-source-invalid"
    And no logo address was asked

    Examples:
      | code | address                                             |
      | 0800 | https://www.kb.cz/icon.png                          |
      | 0800 | http://is1-ssl.mzstatic.com/image/512x512bb.jpg     |
      | 0800 | https://is1-ssl.mzstatic.com/image/512x512bb.jpg?x=1 |
      | 0800 | https://example.com/icon.png                        |
      | 0800 | https://169.254.169.254/latest/meta-data            |

  Scenario: A code that is not four digits is refused
    When "Jana" sets the logo of bank "08000" to "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" as a new one
    Then the response status is 400
    And no logo address was asked

  Scenario: A source that gives no usable picture saves nothing and the logo stays as it was
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And the logo address "https://www.csas.cz/content/dam/icon.png" fails with "redirected"
    When "Jana" sets the logo of bank "0800" to "https://www.csas.cz/content/dam/icon.png" over the version she read
    Then the response status is 502
    And the problem type ends with "donations/bank-logo-unavailable"
    And the problem detail contains "Adresa přesměrovává jinam."
    And the logo of bank "0800" shows the picture "spořitelna z App Store"
    And 1 bank logo image is stored
    And the bank logo admin actions were recorded:
      | action               |
      | SET_BANK_LOGO_SOURCE |

  Scenario: A new source over the version read replaces the picture and the old image is gone
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And the image of the logo of bank "0800" is remembered
    When "Jana" sets the logo of bank "0800" to "https://www.csas.cz/content/dam/icon.png" over the version she read
    Then the response status is 200
    And the logo of bank "0800" shows the picture "spořitelna z webu"
    And 1 bank logo image is stored
    When someone without a token asks for the remembered logo image
    Then the response status is 404
    And the problem type ends with "donations/bank-logo-image-not-found"

  Scenario: A write from a stale view, a second creation or a write without a version from the browser changes nothing
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    When "Jana" sets the logo of bank "0800" to "https://www.csas.cz/content/dam/icon.png" over the version "0123456789abcdef"
    Then the response status is 409
    And the problem type ends with "donations/changed-meanwhile"
    And the problem carries the current version and the logo from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    When "Jana" sets the logo of bank "0800" to "https://www.csas.cz/content/dam/icon.png" as a new one
    Then the response status is 409
    And the problem type ends with "donations/changed-meanwhile"
    When "Jana" sets the logo of bank "0800" to "https://www.csas.cz/content/dam/icon.png" without a version
    Then the response status is 428
    And the problem type ends with "shared/version-required"
    When "Jana" removes the logo of bank "0800" over the version "0123456789abcdef"
    Then the response status is 409
    And the logo address "https://www.csas.cz/content/dam/icon.png" was asked 0 times
    And the logo of bank "0800" shows the picture "spořitelna z App Store"

  Scenario: Downloading the logo again keeps an unchanged picture and only moves the check
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And 2 hours pass
    When "Jana" refreshes the logo of bank "0800"
    Then the response status is 200
    And the logo of bank "0800" was fetched at "2026-11-04T09:00:00Z" and checked at "2026-11-04T11:00:00Z"
    And the bank logo admin actions were recorded:
      | action               | details                                                            |
      | SET_BANK_LOGO_SOURCE | Logo banky 0800 nastaveno z is1-ssl.mzstatic.com                  |
      | REFRESH_BANK_LOGO    | Logo banky 0800 znovu staženo z is1-ssl.mzstatic.com, obrázek     |

  Scenario: A bank without a logo cannot be downloaded again or removed
    When "Jana" refreshes the logo of bank "0100"
    Then the response status is 404
    And the problem type ends with "donations/bank-logo-not-found"
    When "Jana" removes the logo of bank "0100" over the version "0123456789abcdef"
    Then the response status is 404
    And no logo address was asked

  Scenario: A removed logo leaves the list and its image is gone
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And the image of the logo of bank "0800" is remembered
    When "Jana" removes the logo of bank "0800" over the version she read
    Then the response status is 204
    When "Jana" asks for the bank logos in the administration
    Then the administration lists these bank logos:
      | code | bankName | sourceUrl | image | fetchedAt | checkedAt | lastFailure |
    And 0 bank logo images are stored
    When someone without a token asks for the remembered logo image
    Then the response status is 404
    And the bank logo admin actions were recorded:
      | action               | details                  |
      | SET_BANK_LOGO_SOURCE |                          |
      | REMOVE_BANK_LOGO     | Logo banky 0800 odebráno |

  Scenario: A logo whose stored address the allow-list no longer admits is left off the site, flagged, never downloaded again and still removable
    Given the logo of bank "0800" was stored from "https://www.example.com/old-icon.png" with the picture "stará spořitelna"
    When someone without a token asks for the published bank logos
    Then the response status is 200
    And the published bank logos are the ones of banks ""
    When "Jana" asks for the bank logos in the administration
    Then the response status is 200
    And the administration lists these bank logos:
      | code | sourceUrl                            | image | sourceAllowed |
      | 0800 | https://www.example.com/old-icon.png | yes   | false         |
    When "Jana" refreshes the logo of bank "0800"
    Then the response status is 400
    And the problem type ends with "donations/bank-logo-source-invalid"
    When the daily check of the bank logos runs
    Then no logo address was asked
    When "Jana" removes the logo of bank "0800" over the version she read
    Then the response status is 204
    And 0 bank logo images are stored
    And the bank logo admin actions were recorded:
      | action           | details                  |
      | REMOVE_BANK_LOGO | Logo banky 0800 odebráno |

  Scenario: Only an administrator reaches the bank logos of the administration
    Given a person "Petr" is registered
    When someone without a token asks for the bank logos in the administration
    Then the response status is 401
    When "Petr" asks for the bank logos in the administration
    Then the response status is 403
    When "Petr" sets the logo of bank "0800" to "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" as a new one
    Then the response status is 403
    And no logo address was asked

  Scenario: An administrator downloads at most 20 logos an hour
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And "Jana" refreshes the logo of bank "0800" 19 times
    When "Jana" refreshes the logo of bank "0800"
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    And the logo address "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" was asked 20 times
    When 1 hour passes
    And "Jana" refreshes the logo of bank "0800"
    Then the response status is 200

  Scenario: A connected application with the writing permission sets and downloads a logo, audited with its name, but cannot remove it
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sets the logo of bank "0800" to "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    Then the response status is 200
    When the exchanged API token sets the logo of bank "0800" to "https://www.csas.cz/content/dam/icon.png"
    Then the response status is 200
    When the exchanged API token refreshes the logo of bank "0800"
    Then the response status is 200
    When the exchanged API token asks for the bank logos in the administration
    Then the administration lists these bank logos:
      | code | bankName               | sourceUrl                                | image | lastFailure |
      | 0800 | Česká spořitelna, a.s. | https://www.csas.cz/content/dam/icon.png | yes   |             |
    And the bank logo admin actions were recorded:
      | action               | client    |
      | SET_BANK_LOGO_SOURCE | claude.ai |
      | SET_BANK_LOGO_SOURCE | claude.ai |
      | REFRESH_BANK_LOGO    | claude.ai |

  Scenario: A connected application with the reading permission only reads the logos
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read"
    When the connector exchanges the connector token for an API token
    And the exchanged API token asks for the bank logos in the administration
    Then the response status is 200
    When the exchanged API token sets the logo of bank "0800" to "https://www.csas.cz/content/dam/icon.png"
    Then the response status is 403
    When the exchanged API token refreshes the logo of bank "0800"
    Then the response status is 403
    And the logo address "https://www.csas.cz/content/dam/icon.png" was asked 0 times

  Scenario: The daily check downloads a logo again only after 7 days and keeps the picture when the source fails
    Given "Jana" has set the logo of bank "0800" from "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg"
    And the logo address "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" serves the picture "nová spořitelna"
    When 6 days pass
    And the daily check of the bank logos runs
    Then the logo address "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" was asked 1 time
    When 2 days pass
    And the logo address "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" fails with "timeout"
    And the daily check of the bank logos runs
    Then the logo of bank "0800" shows the picture "spořitelna z App Store"
    When "Jana" asks for the bank logos in the administration
    Then the administration lists these bank logos:
      | code | bankName               | sourceUrl                                                    | image | fetchedAt            | checkedAt            | lastFailure |
      | 0800 | Česká spořitelna, a.s. | https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg | yes   | 2026-11-04T09:00:00Z | 2026-11-04T09:00:00Z | timeout     |
    When the logo address "https://is1-ssl.mzstatic.com/image/thumb/csas/512x512bb.jpg" serves the picture "nová spořitelna"
    And 24 hours pass
    And the daily check of the bank logos runs
    Then the logo of bank "0800" shows the picture "nová spořitelna"
    And the logo of bank "0800" was fetched at "2026-11-13T09:00:00Z" and checked at "2026-11-13T09:00:00Z"
    And the bank logo admin actions were recorded:
      | action               |
      | SET_BANK_LOGO_SOURCE |
