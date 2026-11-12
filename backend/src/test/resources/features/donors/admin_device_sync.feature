@donors
Feature: An administrator's device keeps a copy of the accounts and the administrators' trail by downloading only the chunks that changed

  Scenario: A device gets every account by registration month and the trail by month without its details, and no stored secret
    Given today is 2026-10-01
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name          | variableSymbol |
      | 1001 | 2026-09-30 | 500.00 | 2000145399 | 0800     | Nováková Jana | {Jana}         |
    And the application starts the import
    And today is 2026-10-17
    And a person "Petr" is registered
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And "Jana" enables the second factor
    And "Jana" keeps a passkey stored as "jana-phone-credential-0001"
    And "Jana" asks to recover the second factor by payment
    And a password reset is asked for "petr@example.cz"
    And "Andrea" approved the connection for "https://claude.ai/.well-known/oauth-client"
    And "Petr" enables the second factor
    And "Andrea" made "Petr" an administrator
    And 1 minute passes
    And "Andrea" removes "Petr" from the administrators
    When an administration device of "Andrea" syncs the donors
    Then the administration device downloaded the chunks "accounts:2026-10, audit:2026-10"
    And the administration device's copy names "Andrea" as its subject and holds the administration
    And every chunk on the administration device hashes to its rowsSha256
    And the administration device's chunks of accounts hold 3 accounts
    And the administration device's chunks of accounts hold every account as the administration reads it
    And the administration device's account of "Jana" says it has the second factor and 1 passkey
    And the administration device holds the chunk "audit:2026-10" with 2 rows
    And the administration device's chunks of the audit hold every action the administration lists, without details
    When an administration device of "Andrea" syncs the donations
    Then no chunk on the administration device holds a stored secret or an audit detail

  Scenario: A changed profile changes only the chunk of the donor's registration month, a new action only its month of the trail
    Given today is 2026-09-20
    And a person "Jana" is registered
    And today is 2026-10-17
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And an administration device of "Andrea" syncs the donors
    And the administration device downloaded the chunks "accounts:2026-09, accounts:2026-10"
    When an administration device of "Andrea" syncs the donors
    Then the administration device downloaded no chunk
    When "Jana" changes her address to street "Nová 7", postal code "405 02" and city "Děčín"
    And an administration device of "Andrea" syncs the donors
    Then the administration device downloaded the chunks "accounts:2026-09"
    And the administration device removed no chunk
    When "Jana" enables the second factor
    And "Andrea" makes "Jana" an administrator
    And an administration device of "Andrea" syncs the donors
    Then the administration device downloaded the chunks "accounts:2026-09, audit:2026-10"
    And the administration device's chunks of accounts hold every account as the administration reads it
    And the administration device's chunks of the audit hold every action the administration lists, without details

  Scenario: An erased donor's account stays on the device only as a placeholder
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    And "Jana" enables the second factor
    And "Andrea" makes "Jana" an administrator
    And "Andrea" removes "Jana" from the administrators
    And an administration device of "Andrea" syncs the donors
    And the administration device's audit names "Jana" in 2 summaries
    When "Andrea" erased the donor "Jana"
    And an administration device of "Andrea" syncs the donors
    Then the administration device downloaded the chunks "accounts:2026-10, audit:2026-10"
    And the administration device's chunks of accounts hold 2 accounts
    And the administration device's chunks of accounts hold every account as the administration reads it
    And the administration device's chunks of the audit hold every action the administration lists, without details
    And the administration device's audit names "Jana" in 3 summaries only as erased, never by name

  Scenario: An administrator whose role was removed learns it at the next sync while the token is still valid, and the device keeps nothing
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Jana" is an administrator
    And "Andrea" is an administrator
    And "Andrea" holds a browser token from before the signed-in devices
    And an administration device of "Andrea" syncs the donors
    When "Jana" removes "Andrea" from the administrators
    And an administration device of "Andrea" syncs the donors
    Then the administration device was told that "Andrea" no longer holds the administration

  Scenario: An administrator whose role was removed is signed out on every device, so the device's next sync is refused at once
    Given today is 2026-10-17
    And a person "Jana" is registered
    And a person "Andrea" is registered
    And "Jana" is an administrator
    And "Andrea" is an administrator
    And an administration device of "Andrea" syncs the donors
    When "Jana" removes "Andrea" from the administrators
    And "Andrea" asks for the administration's donors sync manifest
    Then the response status is 401
    And the problem type ends with "auth/session-ended"

  Scenario: The chunks come in the asked order, a repeated chunk once, up to 64 in one request, and no cache keeps an answer
    Given today is 2026-10-17
    And a person "Andrea" is registered
    And "Andrea" is an administrator
    When "Andrea" asks for the administration's donors sync chunks "accounts:2026-10,audit:2026-10,accounts:2026-10"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the administration's chunks answer holds "accounts:2026-10" and lists "audit:2026-10" as missing
    When "Andrea" asks for 64 of the administration's donors sync chunks
    Then the response status is 200
    When "Andrea" asks for the administration's donors sync manifest
    Then the response status is 200
    And the answer is JSON that must not be cached

  Scenario: Asking for chunks that are not chunk ids of the accounts or the trail, too many or none is refused
    Given a person "Andrea" is registered
    And "Andrea" is an administrator
    When "Andrea" asks for the administration's donors sync chunks "accounts:2026"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donors sync chunks "payments:2026-10"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for 65 of the administration's donors sync chunks
    Then the response status is 400
    And the problem type ends with "validation"
    When "Andrea" asks for the administration's donors sync chunks ""
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: The manifest and the chunks together answer 60 requests of one administrator in 15 minutes, from any address
    Given a person "Jana" is registered
    And a person "Andrea" is registered
    And "Jana" is an administrator
    And "Andrea" is an administrator
    When "Andrea" asks for the administration's donors sync manifest 30 times
    And "Andrea" asks for the administration's donors sync chunks "audit:2026-10" 30 times
    Then the response status is 200
    When the following requests come from another client address
    And "Andrea" asks for the administration's donors sync manifest
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    When "Andrea" asks for the administration's donors sync chunks "audit:2026-10"
    Then the response status is 429
    When "Jana" asks for the administration's donors sync manifest
    Then the response status is 200
    When 15 minutes pass
    And "Andrea" asks for the administration's donors sync manifest
    Then the response status is 200

  Scenario: The manifest and the chunks need an administrator
    Given a person "Jana" is registered
    When someone without a token asks for the administration's donors sync manifest
    Then the response status is 401
    When someone without a token asks for the administration's donors sync chunks "audit:2026-10"
    Then the response status is 401
    When "Jana" asks for the administration's donors sync manifest
    Then the response status is 403
    When "Jana" asks for the administration's donors sync chunks "audit:2026-10"
    Then the response status is 403
