@connected-apps
Feature: An administrator connects an application such as Claude to the administration

  The site is the OAuth 2.1 authorization server for the MCP connector: the administrator
  signs in on the site, approves the connection, and the application exchanges the code
  for tokens that are valid only at the connector. The connector swaps such a token for a
  short-lived API token, so a connector token never opens the API directly.

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Jana" is an administrator

  Scenario: The authorization server describes itself for the connector's clients
    When anyone reads the authorization server metadata
    Then the response status is 200
    And the metadata names the issuer "http://localhost:4200" with the authorization page "/pripojeni" and the token endpoint "/api/donors/oauth/token"
    And the metadata supports Client ID Metadata Documents, public clients, PKCE "S256" and the scopes "admin:read admin:write"

  Scenario: An administrator sees who asks for access before approving
    When "Jana" asks about the client "https://claude.ai/.well-known/oauth-client" redirecting to "https://claude.ai/api/mcp/auth_callback"
    Then the response status is 200
    And the client is described as host "claude.ai" named "Claude" and not on this computer

  Scenario: An administrator approves the connection and the application gets tokens for the connector only
    When "Jana" approves the connection for "https://claude.ai/.well-known/oauth-client" with scope "admin:read" and state "xyz"
    Then the response status is 200
    And the approval redirects to "https://claude.ai/api/mcp/auth_callback" with a code, the state "xyz" and the issuer "http://localhost:4200"
    When the application exchanges the code with the right verifier
    Then the response status is 200
    And the token response carries a bearer token for 15 minutes, a refresh token and the scope "admin:read"
    And the connector token does not open the administration
    When the connector exchanges the connector token for an API token
    Then the response status is 200
    And the exchanged API token opens the administration
    And the API token cannot be exchanged again
    When "Jana" lists the connected applications
    Then the response status is 200
    And the connected applications are "claude.ai" with scope "admin:read"

  Scenario: A connection with the reading permission only cannot change anything in the administration
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the connector token for an API token
    And the exchanged API token tries to erase an unknown donor
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Jana" approves the connection for "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write" and state "xyz"
    And the approval redirects to "https://claude.ai/api/mcp/auth_callback" with a code, the state "xyz" and the issuer "http://localhost:4200"
    And the application exchanges the code with the right verifier
    Then the token response carries a bearer token for 15 minutes, a refresh token and the scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token tries to erase an unknown donor
    Then the response status is 404
    When "Jana" lists the connected applications
    Then the connected applications are "claude.ai" with scopes "admin:read" and "admin:read admin:write"

  Scenario: An exchanged API token administers only: it cannot approve a connection, touch the administrator's account or export the database
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token tries to approve the connection for "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When the exchanged API token reads the account of the administrator
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When the exchanged API token tries to download the backup "nfnn-2026-10-23_0300.dump"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When the exchanged API token lists the backups
    Then the response status is 200
    When "Jana" lists the connected applications
    Then the connected applications are "claude.ai" with scope "admin:read admin:write"

  Scenario: A donor without the administrator role cannot connect an application
    When "Petr" approves the connection for "https://claude.ai/.well-known/oauth-client" with scope "admin:read" and state "xyz"
    Then the response status is 403
    And the problem type ends with "donors/administrator-required"

  Scenario: Declining sends the application away with an error and no code
    When "Jana" declines the connection for "https://claude.ai/.well-known/oauth-client" with state "xyz"
    Then the response status is 200
    And the decision redirects to "https://claude.ai/api/mcp/auth_callback" with the error "access_denied" and the state "xyz"

  Scenario: An application whose document cannot be read or does not list the redirect address is refused
    When "Jana" asks about the client "https://evil.example/.well-known/oauth-client" redirecting to "https://claude.ai/api/mcp/auth_callback"
    Then the response status is 400
    And the problem type ends with "donors/invalid-client"
    When "Jana" asks about the client "https://claude.ai/.well-known/oauth-client" redirecting to "https://evil.example/callback"
    Then the response status is 400
    And the problem type ends with "donors/invalid-client"
    When "Jana" asks about the client "not a url" redirecting to "https://claude.ai/api/mcp/auth_callback"
    Then the response status is 400
    And the problem type ends with "donors/invalid-client"

  Scenario: A request for another resource, an unknown scope or a missing code challenge is refused
    When "Jana" approves the connection for "https://claude.ai/.well-known/oauth-client" with scope "admin:read" for the resource "https://elsewhere.example/mcp"
    Then the response status is 400
    And the problem type ends with "donors/invalid-authorization-request"
    When "Jana" approves the connection for "https://claude.ai/.well-known/oauth-client" with scope "admin:delete" and state "xyz"
    Then the response status is 400
    And the problem type ends with "donors/invalid-authorization-request"
    When "Jana" approves the connection for "https://claude.ai/.well-known/oauth-client" without a code challenge
    Then the response status is 400
    And the problem type ends with "donors/invalid-authorization-request"

  Scenario: Claude Code on the administrator's computer redirects to any port of the loopback address
    When "Jana" asks about the client "https://claude.ai/oauth/claude-code-client-metadata" redirecting to "http://localhost:3118/callback"
    Then the response status is 200
    And the client is described as host "claude.ai" named "Claude Code" and on this computer
    When "Jana" approves the connection for "https://claude.ai/oauth/claude-code-client-metadata" redirecting to "http://127.0.0.1:50321/callback"
    Then the response status is 200
    And the approval redirects to "http://127.0.0.1:50321/callback" with a code, the state "xyz" and the issuer "http://localhost:4200"

  Scenario: The code works once, only with its verifier, its client and its redirect address, and only for five minutes
    Given "Jana" approved the connection for "https://claude.ai/.well-known/oauth-client"
    When the application exchanges the code with a wrong verifier
    Then the response status is 400
    And the token error is "invalid_grant"
    When the application exchanges the code with the right verifier
    Then the response status is 400
    And the token error is "invalid_grant"
    Given "Jana" approved the connection for "https://claude.ai/.well-known/oauth-client"
    When the application exchanges the code as the client "https://claude.ai/oauth/claude-code-client-metadata"
    Then the response status is 400
    And the token error is "invalid_grant"
    Given "Jana" approved the connection for "https://claude.ai/.well-known/oauth-client"
    When 6 minutes pass
    And the application exchanges the code with the right verifier
    Then the response status is 400
    And the token error is "invalid_grant"
    When the application exchanges the code "not-a-code" with the right verifier
    Then the response status is 400
    And the token error is "invalid_grant"
    When the application asks for the grant type "client_credentials"
    Then the response status is 400
    And the token error is "unsupported_grant_type"

  Scenario: The application refreshes its tokens and a replayed refresh token ends every session of the administrator
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When 10 minutes pass
    And the application refreshes its tokens
    Then the response status is 200
    And the token response carries a bearer token for 15 minutes, a refresh token and the scope "admin:read"
    And the refresh token differs from the previous one
    When the application refreshes its tokens with the previous refresh token
    Then the response status is 400
    And the token error is "invalid_grant"
    When the application refreshes its tokens
    Then the response status is 400
    And the token error is "invalid_grant"
    When the browser session of "Jana" is refreshed
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

  Scenario: A refresh token is tied to its client and the connector's refresh token is no browser session
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the application refreshes its tokens as the client "https://claude.ai/oauth/claude-code-client-metadata"
    Then the response status is 400
    And the token error is "invalid_grant"
    When the application's refresh token is presented as the browser's refresh cookie
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"

  Scenario: The administrator disconnects the application, which can no longer refresh
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When "Petr" disconnects the application of "Jana"
    Then the response status is 404
    And the problem type ends with "donors/connected-app-not-found"
    When "Jana" disconnects the application of "Jana"
    Then the response status is 204
    When "Jana" lists the connected applications
    Then the response status is 200
    And no application is connected
    When the application refreshes its tokens
    Then the response status is 400
    And the token error is "invalid_grant"

  Scenario: Only a connector token is exchanged, and only for the API
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    When the connector exchanges the browser token of "Jana" for an API token
    Then the response status is 400
    And the token error is "invalid_grant"
    When the connector exchanges the connector token for the resource "https://elsewhere.example/api"
    Then the response status is 400
    And the token error is "invalid_target"
    When 16 minutes pass
    And the connector exchanges the connector token for an API token
    Then the response status is 400
    And the token error is "invalid_grant"

  Scenario: An administrator who loses the role loses the connection too
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client"
    And "Petr" is an administrator
    When "Petr" removes "Jana" from the administrators
    Then the response status is 204
    When the application refreshes its tokens
    Then the response status is 400
    And the token error is "invalid_grant"

  Scenario: The thirty-first token request within 15 minutes from one address is refused
    Given 30 token requests were made from this address
    When the application asks for the grant type "client_credentials"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    When the following requests come from another client address
    And the application asks for the grant type "client_credentials"
    Then the response status is 400
